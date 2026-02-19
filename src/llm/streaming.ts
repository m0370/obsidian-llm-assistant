import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ToolUseBlock } from "./LLMProvider";
import type { GeminiProvider } from "./GeminiProvider";

/**
 * レート制限エラー（HTTP 429）
 * プロバイダー情報を含み、UI側でアップグレード案内を表示するために使用
 */
export class RateLimitError extends Error {
	providerId: string;
	constructor(providerId: string, detail: string) {
		super(detail);
		this.name = "RateLimitError";
		this.providerId = providerId;
	}
}

/**
 * GeminiプロバイダーかどうかをチェックするType Guard
 */
function isGeminiProvider(provider: LLMProvider): provider is GeminiProvider & LLMProvider {
	return provider.id === "gemini";
}

/**
 * プロバイダーのAPIエンドポイントURLを取得
 * Geminiの場合はモデルとAPIキーをURLに含める特殊処理
 */
function getEndpointUrl(provider: LLMProvider, params: ChatRequest, apiKey: string, stream: boolean): string {
	if (isGeminiProvider(provider)) {
		return (provider as GeminiProvider & { getEndpointUrl: (model: string, apiKey: string, stream: boolean) => string }).getEndpointUrl(params.model, apiKey, stream);
	}
	return provider.apiEndpoint;
}

/**
 * プラットフォームとプロバイダーに応じた通信方式を自動選択し、
 * LLMにリクエストを送信する統合関数。
 *
 * ストリーミング判定ロジック:
 *   デスクトップ + CORS対応 → fetch() SSE
 *   モバイル + CORS対応 → fetch()試行 → 失敗時requestUrl()
 *   CORS非対応（Anthropic等）→ 常にrequestUrl()一括受信
 */
export async function sendRequest(
	provider: LLMProvider,
	params: ChatRequest,
	apiKey: string,
	onToken?: (token: string) => void,
	signal?: AbortSignal,
): Promise<ChatResponse> {
	const trimmedKey = apiKey.trim();
	// Tool Use時はストリーミングを無効化（SSEパースではtool_callsを抽出できないため）
	const hasTools = params.tools && params.tools.length > 0;
	const wantStream = params.stream !== false && onToken !== undefined && !hasTools;

	if (wantStream && provider.supportsCORS) {
		// デスクトップ/モバイル共通: fetch() SSE試行 → requestUrl()フォールバック
		try {
			return await streamWithFetch(provider, params, trimmedKey, onToken, signal);
		} catch (e) {
			if (signal?.aborted) throw e;
			// fetch()失敗（CSP制約・接続エラー等）→ requestUrl()一括受信にフォールバック
			return completeWithRequestUrl(provider, params, trimmedKey, onToken, signal);
		}
	}

	// CORS非対応 or ストリーミング不要 → requestUrl()一括受信
	return completeWithRequestUrl(provider, params, trimmedKey, onToken, signal);
}

/**
 * fetch() SSEストリーミング
 */
async function streamWithFetch(
	provider: LLMProvider,
	params: ChatRequest,
	apiKey: string,
	onToken: (token: string) => void,
	signal?: AbortSignal,
): Promise<ChatResponse> {
	const body = provider.buildRequestBody({ ...params, stream: true });
	const headers = provider.buildHeaders(apiKey);
	const url = getEndpointUrl(provider, params, apiKey, true);

	// /skip -- fetch() is required for SSE streaming; requestUrl() does not support streaming response body
	const response = await fetch(url, {
		method: "POST",
		headers: { ...headers, "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});

	if (!response.ok) {
		const errorText = await response.text();
		if (response.status === 429) {
			throw new RateLimitError(provider.id, errorText);
		}
		throw new Error(`API Error (${response.status}): ${errorText}`);
	}

	if (!response.body) {
		throw new Error("Response body is null - streaming not supported");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let fullContent = "";
	let buffer = "";
	let jsonBuffer = ""; // 不完全JSONのリカバリバッファ

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			// 最後の不完全な行をバッファに保持
			buffer = lines.pop() || "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed === "data: [DONE]") continue;

				if (trimmed.startsWith("data: ")) {
					// 新しい data: 行 → jsonBuffer と結合してパース試行
					const jsonStr = jsonBuffer ? jsonBuffer + trimmed.slice(6) : trimmed.slice(6);
					try {
						const json = JSON.parse(jsonStr);
						jsonBuffer = ""; // パース成功 → バッファクリア
						const token = extractTokenFromSSE(json, provider.id);
						if (token) {
							fullContent += token;
							onToken(token);
						}
					} catch {
						// パース失敗: 不完全なJSON → バッファに蓄積して次行で再試行
						jsonBuffer = jsonStr;
					}
				} else if (jsonBuffer) {
					// data: プレフィックスなし行 → 前のJSONの続きとして結合
					const jsonStr = jsonBuffer + trimmed;
					try {
						const json = JSON.parse(jsonStr);
						jsonBuffer = "";
						const token = extractTokenFromSSE(json, provider.id);
						if (token) {
							fullContent += token;
							onToken(token);
						}
					} catch {
						jsonBuffer = jsonStr;
					}
				}
			}
		}

		// ストリーム終了後: 残ったバッファの最終パース試行
		if (jsonBuffer) {
			try {
				const json = JSON.parse(jsonBuffer);
				const token = extractTokenFromSSE(json, provider.id);
				if (token) {
					fullContent += token;
					onToken(token);
				}
			} catch {
				// 最終的にパース不能なデータは破棄
			}
		}
	} finally {
		reader.releaseLock();
	}

	return {
		content: fullContent,
		model: params.model,
	};
}

/**
 * requestUrl()による一括受信 + 段階描画
 */
async function completeWithRequestUrl(
	provider: LLMProvider,
	params: ChatRequest,
	apiKey: string,
	onToken?: (token: string) => void,
	signal?: AbortSignal,
): Promise<ChatResponse> {
	const body = provider.buildRequestBody({ ...params, stream: false });
	const headers = provider.buildHeaders(apiKey);
	const url = getEndpointUrl(provider, params, apiKey, false);

	const response = await requestUrl({
		url,
		method: "POST",
		headers: { ...headers, "Content-Type": "application/json" },
		body: JSON.stringify(body),
		throw: false,
	});

	if (response.status !== 200) {
		// エラーレスポンスから詳細メッセージを抽出
		let detail = "";
		try {
			const errJson = response.json;
			if (errJson?.error?.message) {
				detail = errJson.error.message as string;
			} else if (errJson?.error?.status) {
				detail = `${errJson.error.status}: ${errJson.error.message || ""}`;
			} else {
				detail = response.text || `HTTP ${response.status}`;
			}
		} catch {
			detail = response.text || `HTTP ${response.status}`;
		}

		if (response.status === 429) {
			throw new RateLimitError(provider.id, detail);
		}

		// 400エラー + ツール付きリクエスト → ツールなしでリトライ
		if (response.status === 400 && params.tools && params.tools.length > 0) {
			return completeWithRequestUrl(
				provider,
				{ ...params, tools: undefined },
				apiKey,
				onToken,
				signal,
			);
		}

		throw new Error(`${provider.name} API Error (${response.status}): ${detail}`);
	}

	let result: ChatResponse;
	if (provider.id === "anthropic") {
		result = parseAnthropicResponse(response.json);
	} else if (provider.id === "gemini") {
		result = parseGeminiResponse(response.json);
	} else {
		// OpenAI, OpenRouter, Ollama, Custom — all use OpenAI format
		result = parseOpenAIResponse(response.json);
	}

	// 段階描画: 受信テキストをチャンク分割して段階的に描画
	if (onToken && result.content) {
		await simulateStreaming(result.content, onToken, 50, 30, signal);
	}

	return result;
}

/**
 * 段階描画: 一括受信テキストをチャンク分割し、タイピングアニメーション風に描画
 */
async function simulateStreaming(
	text: string,
	onToken: (token: string) => void,
	chunkSize = 50,
	delayMs = 30,
	signal?: AbortSignal,
): Promise<void> {
	for (let i = 0; i < text.length; i += chunkSize) {
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		const chunk = text.substring(i, i + chunkSize);
		onToken(chunk);
		if (i + chunkSize < text.length) {
			await sleep(delayMs);
		}
	}
}

/**
 * SSEレスポンスからトークンを抽出（プロバイダー別）
 */
function extractTokenFromSSE(json: Record<string, unknown>, providerId: string): string {
	if (providerId === "openai" || providerId === "openrouter" || providerId === "ollama" || providerId === "custom") {
		// OpenAI形式: choices[0].delta.content
		const choices = json.choices as Array<Record<string, unknown>> | undefined;
		if (choices && choices.length > 0) {
			const delta = choices[0].delta as Record<string, unknown> | undefined;
			return (delta?.content as string) || "";
		}
	} else if (providerId === "anthropic") {
		// Anthropic形式: delta.text (content_block_delta イベント)
		const type = json.type as string;
		if (type === "content_block_delta") {
			const delta = json.delta as Record<string, unknown> | undefined;
			return (delta?.text as string) || "";
		}
	} else if (providerId === "gemini") {
		// Gemini形式: candidates[0].content.parts[0].text
		const candidates = json.candidates as Array<Record<string, unknown>> | undefined;
		if (candidates && candidates.length > 0) {
			const content = candidates[0].content as Record<string, unknown> | undefined;
			const parts = content?.parts as Array<Record<string, unknown>> | undefined;
			if (parts && parts.length > 0) {
				return (parts[0].text as string) || "";
			}
		}
	}
	return "";
}

// --- レスポンスパーサー ---

function parseOpenAIResponse(json: Record<string, unknown>): ChatResponse {
	const choices = json.choices as Array<Record<string, unknown>>;
	const message = choices?.[0]?.message as Record<string, unknown>;
	const usage = json.usage as Record<string, unknown> | undefined;

	// Extract tool_calls (Function Calling)
	const toolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
	const toolUses: ToolUseBlock[] = [];
	if (toolCalls) {
		for (const tc of toolCalls) {
			const fn = tc.function as Record<string, unknown>;
			if (fn) {
				try {
					toolUses.push({
						id: (tc.id as string) || "",
						name: (fn.name as string) || "",
						input: JSON.parse((fn.arguments as string) || "{}"),
					});
				} catch {
					// JSON parse failure — skip this tool call
				}
			}
		}
	}

	return {
		content: (message?.content as string) || "",
		model: (json.model as string) || "",
		usage: usage
			? {
				inputTokens: (usage.prompt_tokens as number) || 0,
				outputTokens: (usage.completion_tokens as number) || 0,
			}
			: undefined,
		finishReason: (choices?.[0]?.finish_reason as string) || undefined,
		toolUses: toolUses.length > 0 ? toolUses : undefined,
	};
}

function parseAnthropicResponse(json: Record<string, unknown>): ChatResponse {
	const content = json.content as Array<Record<string, unknown>>;
	const usage = json.usage as Record<string, unknown> | undefined;

	const textParts: string[] = [];
	const toolUses: ToolUseBlock[] = [];

	if (content) {
		for (const block of content) {
			if (block.type === "text") {
				textParts.push(block.text as string);
			} else if (block.type === "tool_use") {
				toolUses.push({
					id: block.id as string,
					name: block.name as string,
					input: block.input as Record<string, unknown>,
				});
			}
		}
	}

	return {
		content: textParts.join(""),
		model: (json.model as string) || "",
		usage: usage
			? {
				inputTokens: (usage.input_tokens as number) || 0,
				outputTokens: (usage.output_tokens as number) || 0,
			}
			: undefined,
		finishReason: (json.stop_reason as string) || undefined,
		toolUses: toolUses.length > 0 ? toolUses : undefined,
	};
}

function parseGeminiResponse(json: Record<string, unknown>): ChatResponse {
	const candidates = json.candidates as Array<Record<string, unknown>>;
	const content = candidates?.[0]?.content as Record<string, unknown>;
	const parts = content?.parts as Array<Record<string, unknown>>;
	const usageMeta = json.usageMetadata as Record<string, unknown> | undefined;

	// Extract text and functionCall parts
	let textContent = "";
	const toolUses: ToolUseBlock[] = [];
	if (parts) {
		for (const part of parts) {
			if (part.text && !part.thought) {
				textContent += part.text as string;
			}
			if (part.functionCall) {
				const fc = part.functionCall as Record<string, unknown>;
				toolUses.push({
					id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
					name: (fc.name as string) || "",
					input: (fc.args as Record<string, unknown>) || {},
					rawPart: part, // Preserve full part including thoughtSignature (Gemini 3)
				});
			}
		}
	}

	return {
		content: textContent,
		model: (json.modelVersion as string) || "",
		usage: usageMeta
			? {
				inputTokens: (usageMeta.promptTokenCount as number) || 0,
				outputTokens: (usageMeta.candidatesTokenCount as number) || 0,
			}
			: undefined,
		finishReason: (candidates?.[0]?.finishReason as string) || undefined,
		toolUses: toolUses.length > 0 ? toolUses : undefined,
		// Preserve raw parts for Gemini 3 thought_signature reconstruction
		rawAssistantParts: parts ? [...parts] : undefined,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
