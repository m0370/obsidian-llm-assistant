/**
 * RAGManager — RAGオーケストレーター
 *
 * Phase 1: TF-IDF全文検索
 * Phase 2: Embedding検索 + ハイブリッドRAG (RRF)
 *
 * - Vault全体のインデックス構築・増分更新・検索を統括
 * - vault_searchツールの実行ロジックもここに集約（ChatViewは薄いディスパッチャー）
 * - Vaultイベントリスナーで自動増分更新（デバウンス500ms）
 */

import type { App } from "obsidian";
import type { DocumentChunk, SearchResult, IndexStats } from "./types";
import { chunkDocument, type ChunkStrategy } from "./ChunkManager";
import { TextSearchEngine } from "./TextSearchEngine";
import type { VaultReader } from "../vault/VaultReader";
import { t } from "../i18n";
import type { EmbeddingProvider, EmbeddingProviderRegistry } from "./EmbeddingProvider";
import { VectorStore } from "./VectorStore";
import { HybridSearchEngine } from "./HybridSearchEngine";

export class RAGManager {
	private app: App;
	private vaultReader: VaultReader;
	private searchEngine: TextSearchEngine;
	private fileHashes: Map<string, string> = new Map();
	private indexBuilt = false;
	private isIndexing = false;

	// 設定
	private topK: number;
	private minScore: number;
	private chunkStrategy: ChunkStrategy;
	private chunkMaxTokens: number;
	private excludeFolders: string[];

	// Phase 2: Embedding
	private vectorStore: VectorStore | null = null;
	private embeddingProvider: EmbeddingProvider | null = null;
	private hybridEngine: HybridSearchEngine | null = null;
	private embeddingEnabled = false;
	private embeddingProviderId = "";
	private embeddingModel = "";
	private embeddingDimensions = 0;
	private chunkMap: Map<string, DocumentChunk> = new Map();

	// バックグラウンド自動Embedding
	private autoIndexEnabled = false;
	private autoIndexTimer: ReturnType<typeof setTimeout> | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private idleListeners: Array<() => void> = [];

	// Vaultイベント用デバウンス
	private updateTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	constructor(
		app: App,
		vaultReader: VaultReader,
		options: {
			topK?: number;
			minScore?: number;
			chunkStrategy?: ChunkStrategy;
			chunkMaxTokens?: number;
			excludeFolders?: string;
		} = {},
	) {
		this.app = app;
		this.vaultReader = vaultReader;
		this.searchEngine = new TextSearchEngine();
		this.topK = options.topK ?? 5;
		this.minScore = options.minScore ?? 0.3;
		this.chunkStrategy = options.chunkStrategy ?? "section";
		this.chunkMaxTokens = options.chunkMaxTokens ?? 512;
		this.excludeFolders = (options.excludeFolders ?? "")
			.split(",")
			.map((f) => f.trim())
			.filter(Boolean);
	}

	/**
	 * 設定を更新
	 */
	updateSettings(options: {
		topK?: number;
		minScore?: number;
		chunkStrategy?: ChunkStrategy;
		chunkMaxTokens?: number;
		excludeFolders?: string;
	}): void {
		if (options.topK !== undefined) this.topK = options.topK;
		if (options.minScore !== undefined) this.minScore = options.minScore;
		if (options.chunkStrategy !== undefined) this.chunkStrategy = options.chunkStrategy;
		if (options.chunkMaxTokens !== undefined) this.chunkMaxTokens = options.chunkMaxTokens;
		if (options.excludeFolders !== undefined) {
			this.excludeFolders = options.excludeFolders
				.split(",")
				.map((f) => f.trim())
				.filter(Boolean);
		}
	}

	// --- Phase 2: Embedding初期化 ---

	/**
	 * Embedding検索を初期化
	 */
	async initializeEmbedding(
		providerRegistry: EmbeddingProviderRegistry,
		providerId: string,
		model: string,
		compact = false,
	): Promise<void> {
		const provider = providerRegistry.get(providerId);
		if (!provider) {
			console.warn(`Embedding provider "${providerId}" not found`);
			return;
		}

		this.embeddingProvider = provider;
		this.embeddingProviderId = providerId;
		this.embeddingModel = model;
		this.embeddingDimensions = provider.getDimensions(model, compact);
		this.embeddingEnabled = true;

		// VectorStore初期化
		this.vectorStore = new VectorStore(this.app);
		await this.vectorStore.loadMetadata();

		// モデル変更チェック
		if (this.vectorStore.isModelChanged(model, this.embeddingDimensions)) {
			console.warn("Embedding model changed, index rebuild required");
		}
		this.vectorStore.setModelInfo(providerId, model, this.embeddingDimensions);

		// HybridSearchEngine初期化
		this.hybridEngine = new HybridSearchEngine(
			this.searchEngine,
			this.vectorStore,
			this.embeddingProvider,
		);
	}

	/**
	 * VectorStoreをディスクから復元
	 */
	async loadVectorStore(): Promise<void> {
		if (!this.vectorStore) return;
		await this.vectorStore.loadAllShardsProgressive();
	}

	/**
	 * Embeddingインデックスを構築
	 */
	async buildEmbeddingIndex(
		apiKey: string,
		onProgress?: (current: number, total: number) => void,
	): Promise<void> {
		if (!this.vectorStore || !this.embeddingProvider) return;
		if (this.isIndexing) return;

		this.isIndexing = true;
		try {
			// モデル変更時は全ベクトル削除して再構築
			if (this.vectorStore.isModelChanged(this.embeddingModel, this.embeddingDimensions)) {
				await this.vectorStore.clear();
				this.vectorStore.setModelInfo(
					this.embeddingProviderId,
					this.embeddingModel,
					this.embeddingDimensions,
				);
			}

			// 未処理チャンクを抽出
			const pendingChunks: Array<{ id: string; content: string }> = [];
			for (const [chunkId, chunk] of this.chunkMap) {
				if (!this.vectorStore.has(chunkId)) {
					pendingChunks.push({ id: chunkId, content: chunk.content });
				}
			}

			if (pendingChunks.length === 0) {
				onProgress?.(0, 0);
				return;
			}

			const total = pendingChunks.length;
			const BATCH_SIZE = 100;

			for (let i = 0; i < pendingChunks.length; i += BATCH_SIZE) {
				const batch = pendingChunks.slice(i, i + BATCH_SIZE);
				const texts = batch.map((c) => c.content);

				try {
					const result = await this.embeddingProvider.embed(
						texts, apiKey, this.embeddingModel, this.embeddingDimensions,
					);
					for (let j = 0; j < batch.length; j++) {
						const vec = new Float32Array(result.embeddings[j]);
						this.vectorStore.set(batch[j].id, vec);
					}
					this.vectorStore.addTokensUsed(result.totalTokens);
				} catch (e) {
					console.warn(`Embedding batch ${i}-${i + batch.length} failed, skipping:`, e);
				}

				onProgress?.(Math.min(i + batch.length, total), total);
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			await this.vectorStore.save();
		} finally {
			this.isIndexing = false;
		}
	}

	/**
	 * Embeddingインデックスをクリア
	 */
	async clearEmbeddingIndex(): Promise<void> {
		if (this.vectorStore) {
			await this.vectorStore.clear();
		}
	}

	// --- バックグラウンド自動Embedding ---

	/**
	 * バックグラウンド自動Embeddingを開始
	 */
	startAutoEmbedding(apiKey: string): void {
		this.autoIndexEnabled = true;
		this.setupIdleDetection(apiKey);
	}

	/**
	 * バックグラウンド自動Embeddingを停止
	 */
	stopAutoEmbedding(): void {
		this.autoIndexEnabled = false;
		this.cleanupIdleDetection();
	}

	private setupIdleDetection(apiKey: string): void {
		const IDLE_TIMEOUT = 30_000; // 30秒

		const resetIdle = () => {
			if (this.idleTimer) clearTimeout(this.idleTimer);
			this.idleTimer = setTimeout(() => {
				this.runAutoEmbedBatch(apiKey);
			}, IDLE_TIMEOUT);
		};

		const events = ["mousemove", "keydown", "touchstart"];
		for (const event of events) {
			const listener = () => resetIdle();
			document.addEventListener(event, listener, { passive: true });
			this.idleListeners.push(() => document.removeEventListener(event, listener));
		}

		resetIdle();
	}

	private cleanupIdleDetection(): void {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		for (const cleanup of this.idleListeners) {
			cleanup();
		}
		this.idleListeners = [];
	}

	private async runAutoEmbedBatch(apiKey: string): Promise<void> {
		if (!this.autoIndexEnabled || !this.vectorStore || !this.embeddingProvider) return;
		if (this.isIndexing) return;

		// 未処理チャンクを最大100件処理
		const pendingChunks: Array<{ id: string; content: string }> = [];
		for (const [chunkId, chunk] of this.chunkMap) {
			if (!this.vectorStore.has(chunkId)) {
				pendingChunks.push({ id: chunkId, content: chunk.content });
			}
			if (pendingChunks.length >= 100) break;
		}

		if (pendingChunks.length === 0) return;

		const BATCH_SIZE = 10;
		for (let i = 0; i < pendingChunks.length; i += BATCH_SIZE) {
			if (!this.autoIndexEnabled) return; // ユーザー操作で中断
			const batch = pendingChunks.slice(i, i + BATCH_SIZE);
			const texts = batch.map((c) => c.content);

			try {
				const result = await this.embeddingProvider.embed(
					texts, apiKey, this.embeddingModel, this.embeddingDimensions,
				);
				for (let j = 0; j < batch.length; j++) {
					const vec = new Float32Array(result.embeddings[j]);
					this.vectorStore!.set(batch[j].id, vec);
				}
				this.vectorStore!.addTokensUsed(result.totalTokens);
			} catch (e) {
				console.warn("Auto-embed batch failed:", e);
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		await this.vectorStore.save();
	}

	// --- インデックス構築 ---

	/**
	 * Vault全体のインデックスを構築
	 */
	async buildIndex(onProgress?: (current: number, total: number) => void): Promise<void> {
		if (this.isIndexing) return;
		this.isIndexing = true;

		try {
			this.searchEngine.clear();
			this.fileHashes.clear();
			this.chunkMap.clear();

			const allFiles = this.vaultReader.getAllMarkdownFiles()
				.filter((f) => !this.isExcluded(f.path));
			const total = allFiles.length;

			const allChunks: DocumentChunk[] = [];

			for (let i = 0; i < allFiles.length; i++) {
				const file = allFiles[i];
				const content = await this.vaultReader.cachedReadFile(file);
				const hash = await this.computeHash(content);
				this.fileHashes.set(file.path, hash);

				const chunks = chunkDocument(
					file.path,
					file.basename,
					content,
					this.chunkStrategy,
					this.chunkMaxTokens,
				);
				allChunks.push(...chunks);

				if (onProgress) {
					onProgress(i + 1, total);
				}

				// 50ファイルごとにUIスレッドに制御を返す
				if ((i + 1) % 50 === 0) {
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			}

			// チャンクマップ構築（ベクトル検索結果→DocumentChunk解決用）
			for (const chunk of allChunks) {
				this.chunkMap.set(chunk.id, chunk);
			}

			// 検索エンジンにチャンクを登録
			await this.searchEngine.addChunks(allChunks, () =>
				new Promise((resolve) => setTimeout(resolve, 0)),
			);

			this.indexBuilt = true;
		} finally {
			this.isIndexing = false;
		}
	}

	/**
	 * 単一ファイルのインデックスを増分更新
	 */
	async updateFileIndex(filePath: string): Promise<void> {
		if (!this.indexBuilt || this.isIndexing) return;
		if (this.isExcluded(filePath)) return;

		const file = this.vaultReader.getFileByPath(filePath);
		if (!file) return;

		const content = await this.vaultReader.readFile(file);
		const newHash = await this.computeHash(content);
		const oldHash = this.fileHashes.get(filePath);

		// ハッシュが同じなら更新不要
		if (oldHash === newHash) return;

		// 旧チャンクを削除
		this.searchEngine.removeFile(filePath);
		this.fileHashes.set(filePath, newHash);

		// chunkMapから旧チャンクを削除
		for (const chunkId of this.chunkMap.keys()) {
			if (chunkId.startsWith(`${filePath}::`)) {
				this.chunkMap.delete(chunkId);
			}
		}

		// VectorStoreから旧ベクトルを削除（新ベクトルは次回構築時に生成）
		this.vectorStore?.removeByFilePath(filePath);

		const chunks = chunkDocument(
			filePath,
			file.basename,
			content,
			this.chunkStrategy,
			this.chunkMaxTokens,
		);

		// 新チャンクをchunkMapに追加
		for (const chunk of chunks) {
			this.chunkMap.set(chunk.id, chunk);
		}

		await this.searchEngine.addChunks(chunks);
	}

	/**
	 * ファイル削除時のインデックス除去
	 */
	removeFileFromIndex(filePath: string): void {
		if (!this.indexBuilt) return;
		this.searchEngine.removeFile(filePath);
		this.fileHashes.delete(filePath);
		this.vectorStore?.removeByFilePath(filePath);

		// chunkMapから該当ファイルのエントリを削除
		for (const chunkId of this.chunkMap.keys()) {
			if (chunkId.startsWith(`${filePath}::`)) {
				this.chunkMap.delete(chunkId);
			}
		}
	}

	/**
	 * 検索を実行（Phase 2: async化）
	 */
	async search(query: string, topK?: number, minScore?: number, apiKey?: string): Promise<SearchResult[]> {
		if (!this.indexBuilt) return [];

		const k = topK ?? this.topK;
		const score = minScore ?? this.minScore;

		// Embedding有効 + VectorStore構築済み + APIキーあり → ハイブリッド検索
		if (this.embeddingEnabled && this.vectorStore && this.hybridEngine && apiKey && this.vectorStore.size > 0) {
			try {
				return await this.hybridEngine.search(
					query, apiKey, this.embeddingModel,
					k, score, this.chunkMap, this.embeddingDimensions,
				);
			} catch (e) {
				console.warn("Embedding search failed, falling back to text search:", e);
			}
		}

		// TF-IDFのみ
		return this.searchEngine.search(query, k, score);
	}

	/**
	 * 検索結果をLLMコンテキスト文字列に変換
	 */
	buildRAGContext(results: SearchResult[]): string {
		if (results.length === 0) return "";

		const parts: string[] = [t("rag.contextHeader")];

		for (const result of results) {
			const { chunk, score } = result;
			const headingInfo = chunk.heading ? ` > ${chunk.heading}` : "";
			parts.push(
				`--- [[${chunk.fileName}]]${headingInfo} (${chunk.filePath}, score: ${score.toFixed(2)}) ---\n${chunk.content}`,
			);
		}

		return parts.join("\n\n");
	}

	/**
	 * vault_searchツールの実行ロジック（Phase 2: async化）
	 */
	async executeToolSearch(query: string, topK?: number, apiKey?: string): Promise<string> {
		const k = Math.min(topK ?? this.topK, 10);
		const results = await this.search(query, k, undefined, apiKey);

		if (results.length === 0) {
			return t("rag.noResults", { query });
		}

		const parts: string[] = [
			t("rag.toolSearchHeader", { count: results.length, query }),
		];

		for (const result of results) {
			const { chunk, score } = result;
			const headingInfo = chunk.heading ? ` > ${chunk.heading}` : "";
			parts.push(
				`### [[${chunk.fileName}]]${headingInfo}\n` +
				`Path: ${chunk.filePath} | Score: ${score.toFixed(2)} | Lines: ${chunk.startLine}-${chunk.endLine}\n\n` +
				chunk.content,
			);
		}

		return parts.join("\n\n---\n\n");
	}

	/**
	 * Vaultイベントリスナーでのデバウンス付き更新
	 */
	debouncedUpdate(filePath: string): void {
		const existing = this.updateTimers.get(filePath);
		if (existing) clearTimeout(existing);

		this.updateTimers.set(
			filePath,
			setTimeout(() => {
				this.updateTimers.delete(filePath);
				this.updateFileIndex(filePath);
			}, 500),
		);
	}

	/**
	 * インデックスをクリア
	 */
	clearIndex(): void {
		this.searchEngine.clear();
		this.fileHashes.clear();
		this.chunkMap.clear();
		this.indexBuilt = false;
	}

	/**
	 * インデックス構築済みかどうか
	 */
	isBuilt(): boolean {
		return this.indexBuilt;
	}

	/**
	 * インデックス構築中かどうか
	 */
	isBuilding(): boolean {
		return this.isIndexing;
	}

	/**
	 * Embedding有効かどうか
	 */
	isEmbeddingEnabled(): boolean {
		return this.embeddingEnabled;
	}

	/**
	 * 統計情報
	 */
	getStats(): IndexStats {
		const vectorStats = this.vectorStore?.getStats();
		return {
			totalFiles: this.vaultReader.getAllMarkdownFiles().length,
			totalChunks: this.searchEngine.getDocumentCount(),
			indexedFiles: this.fileHashes.size,
			lastUpdated: Date.now(),
			storageSizeBytes: 0,
			embeddingIndexed: vectorStats?.vectorCount ?? 0,
			embeddingModel: vectorStats?.model,
			embeddingStorageBytes: vectorStats?.storageSizeBytes ?? 0,
			embeddingTotalTokensUsed: vectorStats?.totalTokensUsed ?? 0,
		};
	}

	/**
	 * クリーンアップ
	 */
	async destroy(): Promise<void> {
		for (const timer of this.updateTimers.values()) {
			clearTimeout(timer);
		}
		this.updateTimers.clear();
		this.cleanupIdleDetection();

		// VectorStoreの未保存変更を永続化
		if (this.vectorStore) {
			try {
				await this.vectorStore.save();
			} catch (e) {
				console.warn("VectorStore save on destroy failed:", e);
			}
		}
	}

	/**
	 * フォルダ除外チェック
	 */
	private isExcluded(filePath: string): boolean {
		return this.excludeFolders.some(
			(folder) => filePath.startsWith(folder + "/") || filePath === folder,
		);
	}

	/**
	 * ファイル内容のSHA-256ハッシュを計算
	 * Node.js crypto禁止 → window.crypto.subtle を使用
	 */
	private async computeHash(content: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = new Uint8Array(hashBuffer);
		return Array.from(hashArray)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}
}
