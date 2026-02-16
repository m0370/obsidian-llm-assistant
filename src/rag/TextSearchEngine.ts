/**
 * TextSearchEngine — TF-IDFベースの全文検索エンジン
 *
 * - メモリ内動作、外部ライブラリ不要
 * - 日本語: bigram分割
 * - 英語: スペース区切り + 小文字化 + ストップワード除去
 * - コサイン類似度でランキング
 * - CJK短文クエリ: substringフォールバック
 */

import type { DocumentChunk, SearchResult } from "./types";

// CJK Unified Ideographs, Hiragana, Katakana の範囲
// TokenCounter.ts と同じ正規表現範囲を再利用
const CJK_REGEX = /[\u3000-\u9FFF\uF900-\uFAFF]/;

const ENGLISH_STOP_WORDS = new Set([
	"a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
	"of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
	"being", "have", "has", "had", "do", "does", "did", "will", "would",
	"could", "should", "may", "might", "shall", "can", "need", "must",
	"it", "its", "this", "that", "these", "those", "i", "you", "he", "she",
	"we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
	"our", "their", "not", "no", "so", "if", "as", "just", "about",
]);

interface DocumentEntry {
	chunk: DocumentChunk;
	tokens: string[];
	tfVector: Map<string, number>;
}

export class TextSearchEngine {
	private documents: DocumentEntry[] = [];
	private idf: Map<string, number> = new Map();
	private totalDocuments = 0;

	/**
	 * インデックスをクリア
	 */
	clear(): void {
		this.documents = [];
		this.idf.clear();
		this.totalDocuments = 0;
	}

	/**
	 * チャンクを追加してインデックスを構築
	 * @param chunks 追加するチャンク配列
	 * @param onYield UIスレッド返却用コールバック（バッチ処理）
	 */
	async addChunks(chunks: DocumentChunk[], onYield?: () => Promise<void>): Promise<void> {
		const BATCH_SIZE = 50;

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			const tokens = this.tokenize(chunk.content);
			const tf = this.computeTF(tokens);

			this.documents.push({
				chunk,
				tokens,
				tfVector: tf,
			});

			// バッチごとにUIスレッドに制御を返す
			if (onYield && (i + 1) % BATCH_SIZE === 0) {
				await onYield();
			}
		}

		this.totalDocuments = this.documents.length;
		this.rebuildIDF();
	}

	/**
	 * 特定ファイルのチャンクを削除
	 */
	removeFile(filePath: string): void {
		this.documents = this.documents.filter((d) => d.chunk.filePath !== filePath);
		this.totalDocuments = this.documents.length;
		if (this.totalDocuments > 0) {
			this.rebuildIDF();
		} else {
			this.idf.clear();
		}
	}

	/**
	 * 検索を実行
	 */
	search(query: string, topK: number, minScore: number): SearchResult[] {
		if (this.documents.length === 0) return [];

		const queryTokens = this.tokenize(query);

		// 短文クエリ: bigramが生成できない場合はsubstringフォールバック
		if (queryTokens.length === 0 && query.trim().length > 0) {
			return this.substringSearch(query.trim(), topK);
		}

		if (queryTokens.length === 0) return [];

		const queryTF = this.computeTF(queryTokens);
		const queryTFIDF = this.computeTFIDF(queryTF);

		// 各文書とのコサイン類似度を計算
		const scored: Array<{ entry: DocumentEntry; score: number }> = [];

		for (const doc of this.documents) {
			const docTFIDF = this.computeTFIDF(doc.tfVector);
			const score = this.cosineSimilarity(queryTFIDF, docTFIDF);
			if (score >= minScore) {
				scored.push({ entry: doc, score });
			}
		}

		// スコア降順でソート
		scored.sort((a, b) => b.score - a.score);

		return scored.slice(0, topK).map((s) => ({
			chunk: s.entry.chunk,
			score: s.score,
			matchType: "text" as const,
		}));
	}

	/**
	 * Substring部分一致検索（短文クエリ用フォールバック）
	 * 1文字のCJKクエリなどbigramが生成できないケースで使用
	 */
	private substringSearch(query: string, topK: number): SearchResult[] {
		const lowerQuery = query.toLowerCase();
		const scored: Array<{ entry: DocumentEntry; score: number }> = [];

		for (const doc of this.documents) {
			const lowerContent = doc.chunk.content.toLowerCase();
			let count = 0;
			let idx = 0;
			while ((idx = lowerContent.indexOf(lowerQuery, idx)) !== -1) {
				count++;
				idx += lowerQuery.length;
			}

			if (count > 0) {
				// スコアは出現回数 / コンテンツ長で正規化（0-1の範囲）
				const score = Math.min(1, count / (lowerContent.length / 100));
				scored.push({ entry: doc, score });
			}
		}

		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, topK).map((s) => ({
			chunk: s.entry.chunk,
			score: s.score,
			matchType: "text" as const,
		}));
	}

	/**
	 * テキストをトークンに分割
	 * 日本語: bigram、英語: スペース区切り
	 * クエリとインデックスで同一ロジックを使用
	 */
	tokenize(text: string): string[] {
		const tokens: string[] = [];
		let currentWord = "";
		let cjkBuffer = "";

		const flushWord = () => {
			if (currentWord) {
				const lower = currentWord.toLowerCase();
				if (!ENGLISH_STOP_WORDS.has(lower) && lower.length > 1) {
					tokens.push(lower);
				}
				currentWord = "";
			}
		};

		const flushCJKBigrams = () => {
			if (cjkBuffer.length >= 2) {
				for (let i = 0; i < cjkBuffer.length - 1; i++) {
					tokens.push(cjkBuffer.substring(i, i + 2));
				}
			}
			// 1文字のCJKはbigramにならないので単独トークンにしない
			// → substringSearchで対応
			cjkBuffer = "";
		};

		for (const char of text) {
			if (CJK_REGEX.test(char)) {
				flushWord();
				cjkBuffer += char;
			} else if (/[\s\p{P}]/u.test(char)) {
				flushCJKBigrams();
				flushWord();
			} else {
				flushCJKBigrams();
				currentWord += char;
			}
		}

		flushCJKBigrams();
		flushWord();

		return tokens;
	}

	/**
	 * TF（Term Frequency）を計算
	 */
	private computeTF(tokens: string[]): Map<string, number> {
		const tf = new Map<string, number>();
		for (const token of tokens) {
			tf.set(token, (tf.get(token) || 0) + 1);
		}
		// 正規化: 最大頻度で割る
		const maxFreq = Math.max(...tf.values(), 1);
		for (const [term, freq] of tf) {
			tf.set(term, freq / maxFreq);
		}
		return tf;
	}

	/**
	 * IDF（Inverse Document Frequency）を再構築
	 */
	private rebuildIDF(): void {
		const docFreq = new Map<string, number>();

		for (const doc of this.documents) {
			const uniqueTokens = new Set(doc.tokens);
			for (const token of uniqueTokens) {
				docFreq.set(token, (docFreq.get(token) || 0) + 1);
			}
		}

		this.idf.clear();
		for (const [term, df] of docFreq) {
			this.idf.set(term, Math.log((this.totalDocuments + 1) / (df + 1)) + 1);
		}
	}

	/**
	 * TF-IDFベクトルを計算
	 */
	private computeTFIDF(tf: Map<string, number>): Map<string, number> {
		const tfidf = new Map<string, number>();
		for (const [term, tfVal] of tf) {
			const idfVal = this.idf.get(term) || Math.log(this.totalDocuments + 1);
			tfidf.set(term, tfVal * idfVal);
		}
		return tfidf;
	}

	/**
	 * コサイン類似度を計算
	 */
	private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (const [term, valA] of a) {
			normA += valA * valA;
			const valB = b.get(term);
			if (valB !== undefined) {
				dotProduct += valA * valB;
			}
		}

		for (const [, valB] of b) {
			normB += valB * valB;
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		if (denominator === 0) return 0;

		return dotProduct / denominator;
	}

	/**
	 * インデックスの統計情報
	 */
	getDocumentCount(): number {
		return this.documents.length;
	}
}
