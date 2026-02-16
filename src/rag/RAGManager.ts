/**
 * RAGManager — RAGオーケストレーター
 *
 * - Vault全体のインデックス構築・増分更新・検索を統括
 * - vault_searchツールの実行ロジックもここに集約（ChatViewは薄いディスパッチャー）
 * - Vaultイベントリスナーで自動増分更新（デバウンス500ms）
 */

import type { App, TFile } from "obsidian";
import type { DocumentChunk, SearchResult, IndexStats } from "./types";
import { chunkDocument, type ChunkStrategy } from "./ChunkManager";
import { TextSearchEngine } from "./TextSearchEngine";
import type { VaultReader } from "../vault/VaultReader";
import { t } from "../i18n";

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

	/**
	 * Vault全体のインデックスを構築
	 */
	async buildIndex(onProgress?: (current: number, total: number) => void): Promise<void> {
		if (this.isIndexing) return;
		this.isIndexing = true;

		try {
			this.searchEngine.clear();
			this.fileHashes.clear();

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

		const content = await this.vaultReader.cachedReadFile(file);
		const newHash = await this.computeHash(content);
		const oldHash = this.fileHashes.get(filePath);

		// ハッシュが同じなら更新不要
		if (oldHash === newHash) return;

		// 旧チャンクを削除して新チャンクを追加
		this.searchEngine.removeFile(filePath);
		this.fileHashes.set(filePath, newHash);

		const chunks = chunkDocument(
			filePath,
			file.basename,
			content,
			this.chunkStrategy,
			this.chunkMaxTokens,
		);

		await this.searchEngine.addChunks(chunks);
	}

	/**
	 * ファイル削除時のインデックス除去
	 */
	removeFileFromIndex(filePath: string): void {
		if (!this.indexBuilt) return;
		this.searchEngine.removeFile(filePath);
		this.fileHashes.delete(filePath);
	}

	/**
	 * 検索を実行
	 */
	search(query: string, topK?: number, minScore?: number): SearchResult[] {
		if (!this.indexBuilt) return [];
		return this.searchEngine.search(
			query,
			topK ?? this.topK,
			minScore ?? this.minScore,
		);
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
	 * vault_searchツールの実行ロジック
	 * ChatViewからの薄いディスパッチャーとして使用
	 */
	executeToolSearch(query: string, topK?: number): string {
		const k = Math.min(topK ?? this.topK, 10);
		const results = this.search(query, k);

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
	 * 統計情報
	 */
	getStats(): IndexStats {
		return {
			totalFiles: this.vaultReader.getAllMarkdownFiles().length,
			totalChunks: this.searchEngine.getDocumentCount(),
			indexedFiles: this.fileHashes.size,
			lastUpdated: Date.now(),
			storageSizeBytes: 0, // メモリ内のため正確な値は不明
		};
	}

	/**
	 * クリーンアップ（デバウンスタイマーをすべてクリア）
	 */
	destroy(): void {
		for (const timer of this.updateTimers.values()) {
			clearTimeout(timer);
		}
		this.updateTimers.clear();
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
