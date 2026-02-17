/**
 * EmbeddingProvider — Embedding API抽象化
 *
 * OpenAI / Gemini / Ollama の3プロバイダーに対応
 * 全API通信は requestUrl() (Obsidian API) を使用
 * Node.js API (`require('http')` 等) は使用禁止
 */

import { requestUrl } from "obsidian";

// --- インターフェース定義 ---

export interface EmbeddingModelInfo {
	id: string;
	name: string;
	dimensions: number;
	reducedDimensions?: number; // 省メモリモード用
	costPer1MTokens?: number;  // USD（無料なら0）
}

export interface EmbeddingProvider {
	id: string;
	name: string;
	models: EmbeddingModelInfo[];
	requiresApiKey: boolean;

	/** バッチEmbedding生成（ドキュメント用） */
	embed(texts: string[], apiKey: string, model: string, dimensions?: number): Promise<EmbedResult>;
	/** 単一テキストEmbedding生成（クエリ用） */
	embedSingle(text: string, apiKey: string, model: string, dimensions?: number): Promise<number[]>;
	getDimensions(model: string, compact?: boolean): number;
}

export interface EmbedResult {
	embeddings: number[][];
	totalTokens: number;
}

// --- ユーティリティ ---

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- OpenAI ---

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
	id = "openai";
	name = "OpenAI";
	requiresApiKey = true;
	models: EmbeddingModelInfo[] = [
		{ id: "text-embedding-3-small", name: "text-embedding-3-small", dimensions: 1536, reducedDimensions: 512, costPer1MTokens: 0.02 },
		{ id: "text-embedding-3-large", name: "text-embedding-3-large", dimensions: 3072, reducedDimensions: 512, costPer1MTokens: 0.13 },
	];

	getDimensions(model: string, compact?: boolean): number {
		const info = this.models.find((m) => m.id === model);
		if (!info) return 1536;
		return compact && info.reducedDimensions ? info.reducedDimensions : info.dimensions;
	}

	async embed(texts: string[], apiKey: string, model: string, dimensions?: number): Promise<EmbedResult> {
		const BATCH_SIZE = 100;
		const allEmbeddings: number[][] = [];
		let totalTokens = 0;

		for (let i = 0; i < texts.length; i += BATCH_SIZE) {
			const batch = texts.slice(i, i + BATCH_SIZE);
			const result = await this.callWithRetry(batch, apiKey, model, dimensions);
			allEmbeddings.push(...result.embeddings);
			totalTokens += result.totalTokens;
			// UIスレッド返却
			if (i + BATCH_SIZE < texts.length) {
				await sleep(0);
			}
		}

		return { embeddings: allEmbeddings, totalTokens };
	}

	async embedSingle(text: string, apiKey: string, model: string, dimensions?: number): Promise<number[]> {
		const result = await this.callWithRetry([text], apiKey, model, dimensions);
		return result.embeddings[0];
	}

	private async callWithRetry(texts: string[], apiKey: string, model: string, dimensions?: number, retries = 3): Promise<EmbedResult> {
		for (let attempt = 0; attempt < retries; attempt++) {
			try {
				const body: Record<string, unknown> = {
					model,
					input: texts,
					encoding_format: "float",
				};
				if (dimensions) {
					body.dimensions = dimensions;
				}

				const response = await requestUrl({
					url: "https://api.openai.com/v1/embeddings",
					method: "POST",
					headers: {
						"Authorization": `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(body),
					throw: false,
				});

				if (response.status === 429) {
					const delay = Math.pow(2, attempt) * 1000;
					console.warn(`OpenAI Embedding rate limited, retrying in ${delay}ms...`);
					await sleep(delay);
					continue;
				}

				if (response.status >= 500) {
					if (attempt < retries - 1) {
						await sleep(1000);
						continue;
					}
					throw new Error(`OpenAI Embedding API error: ${response.status}`);
				}

				if (response.status !== 200) {
					const errorMsg = response.json?.error?.message ?? `HTTP ${response.status}`;
					throw new Error(`OpenAI Embedding API error: ${errorMsg}`);
				}

				const data = response.json;
				const embeddings = (data.data as Array<{ embedding: number[]; index: number }>)
					.sort((a, b) => a.index - b.index)
					.map((d) => d.embedding);
				const usedTokens = data.usage?.total_tokens ?? 0;

				return { embeddings, totalTokens: usedTokens };
			} catch (e) {
				if (attempt === retries - 1) throw e;
				if ((e as Error).message?.includes("rate limit") || (e as Error).message?.includes("429")) {
					await sleep(Math.pow(2, attempt) * 1000);
					continue;
				}
				throw e;
			}
		}
		throw new Error("OpenAI Embedding: max retries exceeded");
	}
}

// --- Gemini ---

export class GeminiEmbeddingProvider implements EmbeddingProvider {
	id = "gemini";
	name = "Google Gemini";
	requiresApiKey = true;
	models: EmbeddingModelInfo[] = [
		{ id: "gemini-embedding-001", name: "Gemini Embedding 001", dimensions: 3072, reducedDimensions: 768, costPer1MTokens: 0 },
	];

	getDimensions(model: string, compact?: boolean): number {
		const info = this.models.find((m) => m.id === model);
		if (!info) return 3072;
		return compact && info.reducedDimensions ? info.reducedDimensions : info.dimensions;
	}

	async embed(texts: string[], apiKey: string, model: string, dimensions?: number): Promise<EmbedResult> {
		const BATCH_SIZE = 100;
		const allEmbeddings: number[][] = [];

		for (let i = 0; i < texts.length; i += BATCH_SIZE) {
			const batch = texts.slice(i, i + BATCH_SIZE);
			const result = await this.batchEmbedWithRetry(batch, apiKey, model, dimensions);
			allEmbeddings.push(...result);
			if (i + BATCH_SIZE < texts.length) {
				await sleep(0);
			}
		}

		// Gemini doesn't report token usage in embedding response
		return { embeddings: allEmbeddings, totalTokens: 0 };
	}

	async embedSingle(text: string, apiKey: string, model: string, dimensions?: number): Promise<number[]> {
		const result = await this.singleEmbedWithRetry(text, apiKey, model, dimensions);
		return result;
	}

	private async singleEmbedWithRetry(text: string, apiKey: string, model: string, dimensions?: number, retries = 3): Promise<number[]> {
		for (let attempt = 0; attempt < retries; attempt++) {
			try {
				const body: Record<string, unknown> = {
					content: { parts: [{ text }] },
					taskType: "RETRIEVAL_QUERY",
				};
				if (dimensions) {
					body.outputDimensionality = dimensions;
				}

				const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
				const response = await requestUrl({
					url,
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
					throw: false,
				});

				if (response.status === 429) {
					const delay = Math.pow(2, attempt) * 1000;
					console.warn(`Gemini Embedding rate limited, retrying in ${delay}ms...`);
					await sleep(delay);
					continue;
				}

				if (response.status >= 500) {
					if (attempt < retries - 1) {
						await sleep(1000);
						continue;
					}
					throw new Error(`Gemini Embedding API error: ${response.status}`);
				}

				if (response.status !== 200) {
					const errorMsg = response.json?.error?.message ?? `HTTP ${response.status}`;
					throw new Error(`Gemini Embedding API error: ${errorMsg}`);
				}

				return response.json.embedding.values as number[];
			} catch (e) {
				if (attempt === retries - 1) throw e;
				if ((e as Error).message?.includes("429")) {
					await sleep(Math.pow(2, attempt) * 1000);
					continue;
				}
				throw e;
			}
		}
		throw new Error("Gemini Embedding: max retries exceeded");
	}

	private async batchEmbedWithRetry(texts: string[], apiKey: string, model: string, dimensions?: number, retries = 3): Promise<number[][]> {
		for (let attempt = 0; attempt < retries; attempt++) {
			try {
				const requests = texts.map((text) => {
					const req: Record<string, unknown> = {
						model: `models/${model}`,
						content: { parts: [{ text }] },
						taskType: "RETRIEVAL_DOCUMENT",
					};
					if (dimensions) {
						req.outputDimensionality = dimensions;
					}
					return req;
				});

				const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
				const response = await requestUrl({
					url,
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ requests }),
					throw: false,
				});

				if (response.status === 429) {
					const delay = Math.pow(2, attempt) * 1000;
					console.warn(`Gemini Embedding rate limited, retrying in ${delay}ms...`);
					await sleep(delay);
					continue;
				}

				if (response.status >= 500) {
					if (attempt < retries - 1) {
						await sleep(1000);
						continue;
					}
					throw new Error(`Gemini Embedding API error: ${response.status}`);
				}

				if (response.status !== 200) {
					const errorMsg = response.json?.error?.message ?? `HTTP ${response.status}`;
					throw new Error(`Gemini Embedding API error: ${errorMsg}`);
				}

				return (response.json.embeddings as Array<{ values: number[] }>).map((e) => e.values);
			} catch (e) {
				if (attempt === retries - 1) throw e;
				if ((e as Error).message?.includes("429")) {
					await sleep(Math.pow(2, attempt) * 1000);
					continue;
				}
				throw e;
			}
		}
		throw new Error("Gemini Embedding batch: max retries exceeded");
	}
}

// --- Ollama ---

export class OllamaEmbeddingProvider implements EmbeddingProvider {
	id = "ollama";
	name = "Ollama (Local)";
	requiresApiKey = false;
	models: EmbeddingModelInfo[] = [
		{ id: "nomic-embed-text", name: "nomic-embed-text", dimensions: 768, costPer1MTokens: 0 },
		{ id: "mxbai-embed-large", name: "mxbai-embed-large", dimensions: 1024, costPer1MTokens: 0 },
	];

	getDimensions(model: string): number {
		const info = this.models.find((m) => m.id === model);
		return info?.dimensions ?? 768;
	}

	async embed(texts: string[], apiKey: string, model: string): Promise<EmbedResult> {
		const BATCH_SIZE = 50;
		const allEmbeddings: number[][] = [];

		for (let i = 0; i < texts.length; i += BATCH_SIZE) {
			const batch = texts.slice(i, i + BATCH_SIZE);
			const result = await this.callWithRetry(batch, model);
			allEmbeddings.push(...result);
			if (i + BATCH_SIZE < texts.length) {
				await sleep(0);
			}
		}

		return { embeddings: allEmbeddings, totalTokens: 0 };
	}

	async embedSingle(text: string, apiKey: string, model: string): Promise<number[]> {
		const result = await this.callWithRetry([text], model);
		return result[0];
	}

	private async callWithRetry(texts: string[], model: string, retries = 3): Promise<number[][]> {
		for (let attempt = 0; attempt < retries; attempt++) {
			try {
				// Try requestUrl first (Obsidian API)
				const response = await requestUrl({
					url: "http://localhost:11434/api/embed",
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ model, input: texts }),
					throw: false,
				});

				if (response.status !== 200) {
					const errorMsg = response.text || `HTTP ${response.status}`;
					throw new Error(`Ollama Embedding error: ${errorMsg}`);
				}

				return response.json.embeddings as number[][];
			} catch (e) {
				if (attempt === retries - 1) throw e;
				await sleep(1000);
			}
		}
		throw new Error("Ollama Embedding: max retries exceeded");
	}
}

// --- レジストリ ---

export class EmbeddingProviderRegistry {
	private providers: Map<string, EmbeddingProvider> = new Map();

	constructor() {
		const openai = new OpenAIEmbeddingProvider();
		const gemini = new GeminiEmbeddingProvider();
		const ollama = new OllamaEmbeddingProvider();
		this.providers.set(openai.id, openai);
		this.providers.set(gemini.id, gemini);
		this.providers.set(ollama.id, ollama);
	}

	get(id: string): EmbeddingProvider | undefined {
		return this.providers.get(id);
	}

	getAll(): EmbeddingProvider[] {
		return Array.from(this.providers.values());
	}
}
