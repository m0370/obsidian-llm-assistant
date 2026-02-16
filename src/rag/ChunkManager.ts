/**
 * ChunkManager — Markdownファイルをチャンクに分割
 *
 * 分割戦略:
 * - section: H1-H6見出しで分割（デフォルト）
 * - paragraph: 空行で分割
 * - fixed: 固定トークン数で分割
 *
 * iOS Safari非対応の後読み(?<=...)は使用禁止
 */

import type { DocumentChunk } from "./types";
import { estimateTokens } from "../utils/TokenCounter";

export type ChunkStrategy = "section" | "paragraph" | "fixed";

/**
 * YAML frontmatterを抽出（後読み不使用）
 * 先頭の---...---パターンを検出
 */
export function extractFrontmatter(content: string): {
	metadata: Record<string, unknown>;
	bodyContent: string;
	bodyStartLine: number;
} {
	const trimmed = content.trimStart();
	if (!trimmed.startsWith("---")) {
		return { metadata: {}, bodyContent: content, bodyStartLine: 0 };
	}

	// 2つ目の---を探す（先頭の---の後から）
	const endIndex = trimmed.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { metadata: {}, bodyContent: content, bodyStartLine: 0 };
	}

	const yamlBlock = trimmed.substring(4, endIndex).trim();
	const afterFrontmatter = trimmed.substring(endIndex + 4);
	const bodyContent = afterFrontmatter.startsWith("\n")
		? afterFrontmatter.substring(1)
		: afterFrontmatter;

	// 簡易YAMLパーサー（tags, aliasesのみ特別対応）
	const metadata: Record<string, unknown> = {};
	const lines = yamlBlock.split("\n");
	let currentKey = "";
	let currentList: string[] | null = null;

	for (const line of lines) {
		const trimLine = line.trim();
		if (!trimLine || trimLine.startsWith("#")) continue;

		// リスト項目 (- value)
		if (trimLine.startsWith("- ") && currentKey && currentList) {
			currentList.push(trimLine.substring(2).trim());
			continue;
		}

		// キー: 値
		const colonIdx = trimLine.indexOf(":");
		if (colonIdx > 0) {
			// 前のリストを保存
			if (currentKey && currentList) {
				metadata[currentKey] = currentList;
			}

			currentKey = trimLine.substring(0, colonIdx).trim();
			const value = trimLine.substring(colonIdx + 1).trim();

			if (value === "" || value === "[]") {
				// 次の行がリスト項目かもしれない
				currentList = [];
			} else if (value.startsWith("[") && value.endsWith("]")) {
				// インラインリスト [a, b, c]
				metadata[currentKey] = value
					.substring(1, value.length - 1)
					.split(",")
					.map((s) => s.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean);
				currentKey = "";
				currentList = null;
			} else {
				metadata[currentKey] = value.replace(/^["']|["']$/g, "");
				currentKey = "";
				currentList = null;
			}
		}
	}

	// 最後のリストを保存
	if (currentKey && currentList) {
		metadata[currentKey] = currentList;
	}

	// bodyStartLineを計算
	const frontmatterLines = content.substring(0, content.indexOf(bodyContent) || 0).split("\n").length;

	return { metadata, bodyContent, bodyStartLine: Math.max(0, frontmatterLines - 1) };
}

/**
 * Markdownファイルをチャンクに分割
 */
export function chunkDocument(
	filePath: string,
	fileName: string,
	content: string,
	strategy: ChunkStrategy,
	maxTokens: number,
): DocumentChunk[] {
	const { metadata, bodyContent, bodyStartLine } = extractFrontmatter(content);
	const chunks: DocumentChunk[] = [];

	if (!bodyContent.trim()) return chunks;

	let rawChunks: Array<{ content: string; heading?: string; startLine: number; endLine: number }>;

	switch (strategy) {
		case "section":
			rawChunks = splitBySection(bodyContent, bodyStartLine);
			break;
		case "paragraph":
			rawChunks = splitByParagraph(bodyContent, bodyStartLine);
			break;
		case "fixed":
			rawChunks = splitByFixed(bodyContent, bodyStartLine, maxTokens);
			break;
		default:
			rawChunks = splitBySection(bodyContent, bodyStartLine);
	}

	// maxTokensを超えるチャンクをさらに分割
	const finalChunks: typeof rawChunks = [];
	for (const chunk of rawChunks) {
		const tokens = estimateTokens(chunk.content);
		if (tokens <= maxTokens) {
			finalChunks.push(chunk);
		} else {
			// maxTokensを超える場合、段落単位で再分割
			const subChunks = splitLargeChunk(chunk, maxTokens);
			finalChunks.push(...subChunks);
		}
	}

	for (let i = 0; i < finalChunks.length; i++) {
		const c = finalChunks[i];
		chunks.push({
			id: `${filePath}::${i}`,
			filePath,
			fileName,
			content: c.content,
			heading: c.heading,
			startLine: c.startLine,
			endLine: c.endLine,
			tokens: estimateTokens(c.content),
			metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
		});
	}

	return chunks;
}

/**
 * 見出し(H1-H6)で分割
 * iOS Safari互換: /^#{1,6}\s/m を使用（後読み不使用）
 */
function splitBySection(
	content: string,
	baseLineOffset: number,
): Array<{ content: string; heading?: string; startLine: number; endLine: number }> {
	const lines = content.split("\n");
	const sections: Array<{ content: string; heading?: string; startLine: number; endLine: number }> = [];
	let currentLines: string[] = [];
	let currentHeading: string | undefined;
	let sectionStartLine = 0;
	let inCodeBlock = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// コードブロック内の見出しは無視
		if (line.trimStart().startsWith("```")) {
			inCodeBlock = !inCodeBlock;
		}

		const isHeading = !inCodeBlock && /^#{1,6}\s/.test(line);

		if (isHeading && currentLines.length > 0) {
			// 前のセクションを保存
			const text = currentLines.join("\n").trim();
			if (text) {
				sections.push({
					content: text,
					heading: currentHeading,
					startLine: baseLineOffset + sectionStartLine,
					endLine: baseLineOffset + i - 1,
				});
			}
			currentLines = [line];
			currentHeading = line.replace(/^#+\s*/, "").trim();
			sectionStartLine = i;
		} else {
			if (isHeading) {
				currentHeading = line.replace(/^#+\s*/, "").trim();
				sectionStartLine = i;
			}
			currentLines.push(line);
		}
	}

	// 最後のセクション
	const text = currentLines.join("\n").trim();
	if (text) {
		sections.push({
			content: text,
			heading: currentHeading,
			startLine: baseLineOffset + sectionStartLine,
			endLine: baseLineOffset + lines.length - 1,
		});
	}

	return sections;
}

/**
 * 空行で段落分割
 */
function splitByParagraph(
	content: string,
	baseLineOffset: number,
): Array<{ content: string; heading?: string; startLine: number; endLine: number }> {
	const lines = content.split("\n");
	const paragraphs: Array<{ content: string; heading?: string; startLine: number; endLine: number }> = [];
	let currentLines: string[] = [];
	let paraStartLine = 0;
	let inCodeBlock = false;
	let currentHeading: string | undefined;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (line.trimStart().startsWith("```")) {
			inCodeBlock = !inCodeBlock;
		}

		if (!inCodeBlock && /^#{1,6}\s/.test(line)) {
			currentHeading = line.replace(/^#+\s*/, "").trim();
		}

		if (line.trim() === "" && !inCodeBlock) {
			if (currentLines.length > 0) {
				const text = currentLines.join("\n").trim();
				if (text) {
					paragraphs.push({
						content: text,
						heading: currentHeading,
						startLine: baseLineOffset + paraStartLine,
						endLine: baseLineOffset + i - 1,
					});
				}
				currentLines = [];
			}
			paraStartLine = i + 1;
		} else {
			currentLines.push(line);
		}
	}

	if (currentLines.length > 0) {
		const text = currentLines.join("\n").trim();
		if (text) {
			paragraphs.push({
				content: text,
				heading: currentHeading,
				startLine: baseLineOffset + paraStartLine,
				endLine: baseLineOffset + lines.length - 1,
			});
		}
	}

	return paragraphs;
}

/**
 * 固定トークン数で分割
 */
function splitByFixed(
	content: string,
	baseLineOffset: number,
	maxTokens: number,
): Array<{ content: string; heading?: string; startLine: number; endLine: number }> {
	const lines = content.split("\n");
	const chunks: Array<{ content: string; heading?: string; startLine: number; endLine: number }> = [];
	let currentLines: string[] = [];
	let currentTokens = 0;
	let chunkStartLine = 0;
	let currentHeading: string | undefined;
	let inCodeBlock = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (line.trimStart().startsWith("```")) {
			inCodeBlock = !inCodeBlock;
		}

		if (!inCodeBlock && /^#{1,6}\s/.test(line)) {
			currentHeading = line.replace(/^#+\s*/, "").trim();
		}

		const lineTokens = estimateTokens(line);

		if (currentTokens + lineTokens > maxTokens && currentLines.length > 0 && !inCodeBlock) {
			const text = currentLines.join("\n").trim();
			if (text) {
				chunks.push({
					content: text,
					heading: currentHeading,
					startLine: baseLineOffset + chunkStartLine,
					endLine: baseLineOffset + i - 1,
				});
			}
			currentLines = [line];
			currentTokens = lineTokens;
			chunkStartLine = i;
		} else {
			currentLines.push(line);
			currentTokens += lineTokens;
		}
	}

	if (currentLines.length > 0) {
		const text = currentLines.join("\n").trim();
		if (text) {
			chunks.push({
				content: text,
				heading: currentHeading,
				startLine: baseLineOffset + chunkStartLine,
				endLine: baseLineOffset + lines.length - 1,
			});
		}
	}

	return chunks;
}

/**
 * maxTokensを超えるチャンクを段落ベースでさらに分割
 */
function splitLargeChunk(
	chunk: { content: string; heading?: string; startLine: number; endLine: number },
	maxTokens: number,
): Array<{ content: string; heading?: string; startLine: number; endLine: number }> {
	const lines = chunk.content.split("\n");
	const result: Array<{ content: string; heading?: string; startLine: number; endLine: number }> = [];
	let currentLines: string[] = [];
	let currentTokens = 0;
	let subStartLine = chunk.startLine;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineTokens = estimateTokens(line);

		if (currentTokens + lineTokens > maxTokens && currentLines.length > 0) {
			const text = currentLines.join("\n").trim();
			if (text) {
				result.push({
					content: text,
					heading: chunk.heading,
					startLine: subStartLine,
					endLine: chunk.startLine + i - 1,
				});
			}
			currentLines = [line];
			currentTokens = lineTokens;
			subStartLine = chunk.startLine + i;
		} else {
			currentLines.push(line);
			currentTokens += lineTokens;
		}
	}

	if (currentLines.length > 0) {
		const text = currentLines.join("\n").trim();
		if (text) {
			result.push({
				content: text,
				heading: chunk.heading,
				startLine: subStartLine,
				endLine: chunk.endLine,
			});
		}
	}

	return result;
}
