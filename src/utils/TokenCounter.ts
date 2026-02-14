/**
 * 簡易トークンカウンター
 *
 * 正確なトークン数はtiktokenなどの大きなライブラリが必要だが、
 * バンドルサイズを抑えるため文字数ベースの概算を使用。
 *
 * 概算ルール:
 * - 英語: 約4文字 = 1トークン
 * - 日本語: 約1.5文字 = 1トークン（マルチバイト文字はトークン効率が低い）
 * - 混在: 加重平均
 */

const CHARS_PER_TOKEN_EN = 4;
const CHARS_PER_TOKEN_JA = 1.5;

// CJK Unified Ideographs, Hiragana, Katakana の範囲
const CJK_REGEX = /[\u3000-\u9FFF\uF900-\uFAFF]/g;

export function estimateTokens(text: string): number {
	if (!text) return 0;

	const cjkMatches = text.match(CJK_REGEX);
	const cjkCount = cjkMatches ? cjkMatches.length : 0;
	const nonCjkCount = text.length - cjkCount;

	const cjkTokens = cjkCount / CHARS_PER_TOKEN_JA;
	const nonCjkTokens = nonCjkCount / CHARS_PER_TOKEN_EN;

	return Math.ceil(cjkTokens + nonCjkTokens);
}

export function formatTokenCount(tokens: number): string {
	if (tokens < 1000) return `${tokens}`;
	if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}K`;
	return `${Math.round(tokens / 1000)}K`;
}

export function isWithinLimit(tokens: number, limit: number): boolean {
	return tokens <= limit;
}
