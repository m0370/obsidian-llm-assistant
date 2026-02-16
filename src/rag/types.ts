/**
 * RAG (Retrieval-Augmented Generation) 型定義
 */

export interface DocumentChunk {
	id: string;              // "filepath::chunkIndex"
	filePath: string;
	fileName: string;
	content: string;
	heading?: string;        // 所属セクション見出し
	startLine: number;
	endLine: number;
	tokens: number;
	metadata?: {             // YAML frontmatterから抽出
		tags?: string[];
		aliases?: string[];
		[key: string]: unknown;
	};
}

export interface SearchResult {
	chunk: DocumentChunk;
	score: number;           // 0-1
	matchType: "text" | "semantic" | "hybrid";
}

export interface IndexStats {
	totalFiles: number;
	totalChunks: number;
	indexedFiles: number;
	lastUpdated: number;
	storageSizeBytes: number;
	// Phase 2: Embedding
	embeddingIndexed: number;
	embeddingModel?: string;
	embeddingStorageBytes: number;
	embeddingTotalTokensUsed: number;
}
