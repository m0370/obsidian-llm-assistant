/**
 * HybridSearchEngine — RRFハイブリッド検索
 *
 * TF-IDF（テキスト検索）とEmbedding（ベクトル検索）の結果を
 * Reciprocal Rank Fusion (RRF) で統合ランキング
 *
 * フォールバック:
 * - Embedding APIキー未設定 → TF-IDFのみ
 * - Embedding API呼び出し失敗 → TF-IDFのみ（console.warnのみ）
 * - VectorStoreが空 → TF-IDFのみ
 */

import type { DocumentChunk, SearchResult } from "./types";
import type { TextSearchEngine } from "./TextSearchEngine";
import type { VectorStore } from "./VectorStore";
import type { EmbeddingProvider } from "./EmbeddingProvider";

const RRF_K = 60;

export class HybridSearchEngine {
	private textEngine: TextSearchEngine;
	private vectorStore: VectorStore;
	private embeddingProvider: EmbeddingProvider;

	constructor(
		textEngine: TextSearchEngine,
		vectorStore: VectorStore,
		embeddingProvider: EmbeddingProvider,
	) {
		this.textEngine = textEngine;
		this.vectorStore = vectorStore;
		this.embeddingProvider = embeddingProvider;
	}

	/**
	 * ハイブリッド検索（RRF）
	 * 1. TF-IDF検索 → topK*2 件取得
	 * 2. クエリをEmbedding → VectorStore でベクトル検索 → topK*2 件取得
	 * 3. RRFで統合ランキング → topK 件返却
	 */
	async search(
		query: string,
		apiKey: string,
		model: string,
		topK: number,
		minScore: number,
		chunks: Map<string, DocumentChunk>,
		dimensions?: number,
	): Promise<SearchResult[]> {
		const expandedK = topK * 2;

		// 1. TF-IDF検索
		const textResults = this.textEngine.search(query, expandedK, minScore);

		// 2. ベクトル検索
		let embeddingResults: Array<{ chunkId: string; score: number }> = [];
		try {
			if (this.vectorStore.size > 0 && apiKey) {
				const queryVector = await this.embeddingProvider.embedSingle(
					query, apiKey, model, dimensions,
				);
				const queryFloat32 = new Float32Array(queryVector);
				embeddingResults = await this.vectorStore.search(queryFloat32, expandedK);
			}
		} catch (e) {
			console.warn("Hybrid search: Embedding search failed, using text-only:", e);
		}

		// Embeddingが空ならテキスト結果をそのまま返す
		if (embeddingResults.length === 0) {
			return textResults.slice(0, topK);
		}

		// 3. RRF統合
		const rrfScores: Map<string, { score: number; matchType: "text" | "semantic" | "hybrid" }> = new Map();

		// テキスト結果にRRFスコア付与
		for (let rank = 0; rank < textResults.length; rank++) {
			const chunkId = textResults[rank].chunk.id;
			const rrfScore = 1 / (RRF_K + rank + 1);
			rrfScores.set(chunkId, { score: rrfScore, matchType: "text" });
		}

		// Embedding結果にRRFスコア付与
		for (let rank = 0; rank < embeddingResults.length; rank++) {
			const chunkId = embeddingResults[rank].chunkId;
			const rrfScore = 1 / (RRF_K + rank + 1);
			const existing = rrfScores.get(chunkId);
			if (existing) {
				// 両方ヒット → hybrid
				existing.score += rrfScore;
				existing.matchType = "hybrid";
			} else {
				rrfScores.set(chunkId, { score: rrfScore, matchType: "semantic" });
			}
		}

		// スコア降順ソート
		const ranked = Array.from(rrfScores.entries())
			.sort((a, b) => b[1].score - a[1].score)
			.slice(0, topK);

		// chunkId → SearchResult解決
		const results: SearchResult[] = [];
		for (const [chunkId, { score, matchType }] of ranked) {
			const chunk = chunks.get(chunkId);
			if (chunk) {
				results.push({ chunk, score, matchType });
			}
		}

		return results;
	}
}
