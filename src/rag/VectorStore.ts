/**
 * VectorStore — ベクトルストレージ（ファイルベース永続化）
 *
 * - app.vault.adapter.write() でJSON保存（IndexedDB不使用 — iOS WKWebView安定性）
 * - Base64エンコード（Float32Array → string、JSONサイズ約45%削減）
 * - シャーディング保存（1シャード最大500エントリ、dirty trackingで部分保存）
 * - オンデマンド・ロード（起動時はメタデータのみ、シャードは遅延読み込み）
 */

import type { App } from "obsidian";

// --- Base64 エンコード/デコード ---

export function encodeVector(vector: Float32Array): string {
	const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

export function decodeVector(base64: string): Float32Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new Float32Array(bytes.buffer);
}

// --- 型定義 ---

interface VectorStoreMetadata {
	model: string;
	dimensions: number;
	provider: string;
	lastUpdated: number;
	version: number;
	totalTokensUsed: number;
	shardCount: number;
	chunkToShard: Record<string, number>;
}

interface ShardData {
	entries: Record<string, string>; // chunkId → Base64ベクトル
}

const SHARD_MAX_ENTRIES = 500;
const METADATA_FILENAME = "vectors-meta.json";

// --- VectorStore ---

export class VectorStore {
	private app: App;
	private cacheDir: string;
	private vectors: Map<string, Float32Array> = new Map();
	private loadedShards: Set<number> = new Set();
	private dirtyShards: Set<number> = new Set();
	private metadata: VectorStoreMetadata;
	private metadataLoaded = false;
	private maxShards = 1;

	constructor(app: App, cacheDir = ".obsidian/plugins/llm-assistant/cache") {
		this.app = app;
		this.cacheDir = cacheDir;
		this.metadata = {
			model: "",
			dimensions: 0,
			provider: "",
			lastUpdated: 0,
			version: 1,
			totalTokensUsed: 0,
			shardCount: 0,
			chunkToShard: {},
		};
	}

	/**
	 * メタデータのみロード（起動時に呼ぶ、高速）
	 */
	async loadMetadata(): Promise<void> {
		try {
			const path = `${this.cacheDir}/${METADATA_FILENAME}`;
			if (await this.fileExists(path)) {
				const raw = await this.app.vault.adapter.read(path);
				this.metadata = JSON.parse(raw);
				this.maxShards = Math.max(this.metadata.shardCount, 1);
				this.metadataLoaded = true;
			}
		} catch (e) {
			console.warn("VectorStore: Failed to load metadata:", e);
		}
	}

	/**
	 * 全シャードをバックグラウンドでプログレッシブ・ロード
	 */
	async loadAllShardsProgressive(): Promise<void> {
		if (!this.metadataLoaded || this.metadata.shardCount === 0) return;

		for (let i = 0; i < this.metadata.shardCount; i++) {
			if (this.loadedShards.has(i)) continue;
			await this.loadShard(i);
			// UIスレッド返却
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}

	/**
	 * 単一シャードの読み込み
	 */
	private async loadShard(shardIndex: number): Promise<void> {
		try {
			const path = `${this.cacheDir}/vectors-${shardIndex}.json`;
			if (!(await this.fileExists(path))) {
				this.loadedShards.add(shardIndex);
				return;
			}
			const raw = await this.app.vault.adapter.read(path);
			const shard: ShardData = JSON.parse(raw);

			for (const [chunkId, base64] of Object.entries(shard.entries)) {
				this.vectors.set(chunkId, decodeVector(base64));
			}
			this.loadedShards.add(shardIndex);
		} catch (e) {
			console.warn(`VectorStore: Failed to load shard ${shardIndex}:`, e);
			this.loadedShards.add(shardIndex); // マーク済みにして再読み込みを防ぐ
		}
	}

	/**
	 * ベクトルの追加/更新
	 */
	set(chunkId: string, vector: Float32Array): void {
		this.vectors.set(chunkId, vector);
		const shardIndex = this.getShardIndex(chunkId);
		this.metadata.chunkToShard[chunkId] = shardIndex;
		this.dirtyShards.add(shardIndex);
	}

	/**
	 * ベクトルの取得
	 */
	get(chunkId: string): Float32Array | undefined {
		return this.vectors.get(chunkId);
	}

	/**
	 * ストレージにベクトルが存在するか
	 */
	has(chunkId: string): boolean {
		return this.vectors.has(chunkId);
	}

	/**
	 * ファイルに属する全ベクトルを削除
	 */
	removeByFilePath(filePath: string): void {
		const prefix = `${filePath}::`;
		const toRemove: string[] = [];
		for (const chunkId of this.vectors.keys()) {
			if (chunkId.startsWith(prefix)) {
				toRemove.push(chunkId);
			}
		}
		for (const chunkId of toRemove) {
			const shard = this.metadata.chunkToShard[chunkId];
			if (shard !== undefined) {
				this.dirtyShards.add(shard);
			}
			this.vectors.delete(chunkId);
			delete this.metadata.chunkToShard[chunkId];
		}
	}

	/**
	 * コサイン類似度で上位K件を検索
	 */
	async search(queryVector: Float32Array, topK: number): Promise<Array<{ chunkId: string; score: number }>> {
		// 未ロードシャードがあればロード
		if (this.loadedShards.size < this.metadata.shardCount) {
			await this.loadAllShardsProgressive();
		}

		// クエリベクトルのノルムを事前計算
		let queryNorm = 0;
		for (let i = 0; i < queryVector.length; i++) {
			queryNorm += queryVector[i] * queryVector[i];
		}
		queryNorm = Math.sqrt(queryNorm);

		if (queryNorm === 0) return [];

		const scored: Array<{ chunkId: string; score: number }> = [];
		let count = 0;

		for (const [chunkId, vec] of this.vectors) {
			const score = this.cosineSimilarity(queryVector, queryNorm, vec);
			scored.push({ chunkId, score });
			count++;
			// 100件ごとにUIスレッド返却
			if (count % 100 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, topK);
	}

	/**
	 * コサイン類似度（クエリノルム事前計算済み）
	 */
	private cosineSimilarity(queryVec: Float32Array, queryNorm: number, docVec: Float32Array): number {
		const len = Math.min(queryVec.length, docVec.length);
		let dotProduct = 0;
		let docNorm = 0;

		for (let i = 0; i < len; i++) {
			dotProduct += queryVec[i] * docVec[i];
			docNorm += docVec[i] * docVec[i];
		}

		docNorm = Math.sqrt(docNorm);
		const denominator = queryNorm * docNorm;
		if (denominator === 0) return 0;
		return dotProduct / denominator;
	}

	/**
	 * ディスクに永続化（dirtyシャードのみ書き込み）
	 */
	async save(): Promise<void> {
		await this.ensureCacheDir();

		// dirtyシャードを書き込み
		const shardData: Map<number, Record<string, string>> = new Map();
		for (const [chunkId, vec] of this.vectors) {
			const shardIndex = this.metadata.chunkToShard[chunkId] ?? this.getShardIndex(chunkId);
			this.metadata.chunkToShard[chunkId] = shardIndex;
			if (this.dirtyShards.has(shardIndex)) {
				if (!shardData.has(shardIndex)) {
					shardData.set(shardIndex, {});
				}
				shardData.get(shardIndex)![chunkId] = encodeVector(vec);
			}
		}

		// dirty シャードを書き込み（dirty でないシャードに含まれるエントリは再構築不要）
		// ただし dirty シャードの全エントリを書き直す必要がある
		for (const shardIndex of this.dirtyShards) {
			const entries: Record<string, string> = {};
			for (const [chunkId, vec] of this.vectors) {
				const s = this.metadata.chunkToShard[chunkId];
				if (s === shardIndex) {
					entries[chunkId] = encodeVector(vec);
				}
			}
			const path = `${this.cacheDir}/vectors-${shardIndex}.json`;
			await this.app.vault.adapter.write(path, JSON.stringify({ entries }));
		}

		// 使用するシャード数を計算
		const usedShards = new Set<number>();
		for (const shard of Object.values(this.metadata.chunkToShard)) {
			usedShards.add(shard);
		}
		this.metadata.shardCount = usedShards.size > 0 ? Math.max(...usedShards) + 1 : 0;
		this.metadata.lastUpdated = Date.now();

		// メタデータ保存
		const metaPath = `${this.cacheDir}/${METADATA_FILENAME}`;
		await this.app.vault.adapter.write(metaPath, JSON.stringify(this.metadata));

		this.dirtyShards.clear();
	}

	/**
	 * 全クリア（ディスクのファイルも削除）
	 */
	async clear(): Promise<void> {
		this.vectors.clear();
		this.loadedShards.clear();
		this.dirtyShards.clear();

		// ディスクファイル削除
		try {
			for (let i = 0; i < this.metadata.shardCount; i++) {
				const path = `${this.cacheDir}/vectors-${i}.json`;
				if (await this.fileExists(path)) {
					await this.app.vault.adapter.remove(path);
				}
			}
			const metaPath = `${this.cacheDir}/${METADATA_FILENAME}`;
			if (await this.fileExists(metaPath)) {
				await this.app.vault.adapter.remove(metaPath);
			}
		} catch (e) {
			console.warn("VectorStore: Failed to clear files:", e);
		}

		this.metadata = {
			model: "",
			dimensions: 0,
			provider: "",
			lastUpdated: 0,
			version: 1,
			totalTokensUsed: 0,
			shardCount: 0,
			chunkToShard: {},
		};
	}

	/**
	 * 統計情報
	 */
	getStats(): {
		vectorCount: number;
		storageSizeBytes: number;
		model: string;
		dimensions: number;
		totalTokensUsed: number;
	} {
		const vectorCount = this.vectors.size;
		// 概算ストレージサイズ: (dimensions * 4 bytes * 1.33 base64 overhead) per vector
		const bytesPerVector = this.metadata.dimensions > 0
			? Math.ceil(this.metadata.dimensions * 4 * 1.33)
			: 0;
		const storageSizeBytes = vectorCount * bytesPerVector;

		return {
			vectorCount,
			storageSizeBytes,
			model: this.metadata.model,
			dimensions: this.metadata.dimensions,
			totalTokensUsed: this.metadata.totalTokensUsed,
		};
	}

	/**
	 * モデルが変更されたかチェック
	 */
	isModelChanged(model: string, dimensions: number): boolean {
		if (!this.metadata.model) return false; // 初回
		return this.metadata.model !== model || this.metadata.dimensions !== dimensions;
	}

	/**
	 * メタデータにモデル情報を設定
	 */
	setModelInfo(provider: string, model: string, dimensions: number): void {
		this.metadata.provider = provider;
		this.metadata.model = model;
		this.metadata.dimensions = dimensions;
	}

	/**
	 * 累積トークン数を加算
	 */
	addTokensUsed(tokens: number): void {
		this.metadata.totalTokensUsed += tokens;
	}

	/**
	 * ベクトル数
	 */
	get size(): number {
		return this.vectors.size;
	}

	// --- Private helpers ---

	private getShardIndex(chunkId: string): number {
		// 安定ハッシュ
		let hash = 0;
		for (let i = 0; i < chunkId.length; i++) {
			hash = ((hash << 5) - hash + chunkId.charCodeAt(i)) | 0;
		}
		return Math.abs(hash) % Math.max(this.maxShards, Math.ceil(this.vectors.size / SHARD_MAX_ENTRIES) || 1);
	}

	private async ensureCacheDir(): Promise<void> {
		try {
			if (!(await this.app.vault.adapter.exists(this.cacheDir))) {
				await this.app.vault.adapter.mkdir(this.cacheDir);
			}
		} catch {
			// ディレクトリが既に存在する場合は無視
		}
	}

	private async fileExists(path: string): Promise<boolean> {
		try {
			return await this.app.vault.adapter.exists(path);
		} catch {
			return false;
		}
	}
}
