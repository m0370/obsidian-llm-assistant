import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo, Message, ToolUseBlock, ToolResult } from "./LLMProvider";

export class OpenAIProvider implements LLMProvider {
	id = "openai";
	name = "OpenAI";
	requiresApiKey = true;
	supportsCORS = true;
	supportsToolUse = true;
	apiEndpoint = "https://api.openai.com/v1/chat/completions";
	apiKeyUrl = "https://platform.openai.com/api-keys";

	models: ModelInfo[] = [
		{ id: "gpt-5.4", name: "GPT-5.4", contextWindow: 1050000 },
		{ id: "gpt-5.4-pro", name: "GPT-5.4 Pro", contextWindow: 1050000 },
		{ id: "gpt-5.4-mini", name: "GPT-5.4 Mini", contextWindow: 400000 },
		{ id: "gpt-5.4-nano", name: "GPT-5.4 Nano", contextWindow: 400000 },
		{ id: "gpt-5.2", name: "GPT-5.2", contextWindow: 400000 },
		{ id: "gpt-5", name: "GPT-5", contextWindow: 400000 },
		{ id: "gpt-5-mini", name: "GPT-5 Mini", contextWindow: 400000 },
		{ id: "gpt-5-nano", name: "GPT-5 Nano", contextWindow: 400000 },
	];

	buildRequestBody(params: ChatRequest): Record<string, unknown> {
		const messages: Array<Record<string, unknown>> = [];

		if (params.systemPrompt) {
			messages.push({ role: "system", content: params.systemPrompt });
		}

		for (const msg of params.messages) {
			if (msg.rawContent) {
				// Tool Use: rawContent contains the full pre-formatted message
				messages.push(msg.rawContent as Record<string, unknown>);
			} else {
				messages.push({ role: msg.role, content: msg.content });
			}
		}

		const body: Record<string, unknown> = {
			model: params.model,
			messages,
		};

		// Convert common ToolDefinition to OpenAI Function Calling format
		if (params.tools && params.tools.length > 0) {
			body.tools = params.tools.map(tool => ({
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.input_schema,
				},
			}));
		}

		// o1/o3/o4系とgpt-5系は max_completion_tokens を使用、temperature非対応
		const isReasoningOrGpt5 = /^(o[1-9]|gpt-5)/i.test(params.model);
		if (params.temperature !== undefined && !isReasoningOrGpt5) {
			body.temperature = params.temperature;
		}
		if (params.maxTokens !== undefined) {
			body[isReasoningOrGpt5 ? "max_completion_tokens" : "max_tokens"] = params.maxTokens;
		}
		if (params.stream) {
			body.stream = true;
		}

		return body;
	}

	buildHeaders(apiKey: string): Record<string, string> {
		return {
			Authorization: `Bearer ${apiKey}`,
		};
	}

	buildAssistantToolUseMessage(content: string, toolUses: ToolUseBlock[]): Message {
		return {
			role: "assistant",
			content: content || "",
			rawContent: {
				role: "assistant",
				content: content || null,
				tool_calls: toolUses.map(tu => ({
					id: tu.id,
					type: "function",
					function: {
						name: tu.name,
						arguments: JSON.stringify(tu.input),
					},
				})),
			},
		};
	}

	buildToolResultMessages(results: ToolResult[]): Message[] {
		// OpenAI requires separate messages per tool result with role: "tool"
		return results.map(r => ({
			role: "user" as const,
			content: r.content,
			rawContent: {
				role: "tool",
				tool_call_id: r.toolUseId,
				content: r.content,
			},
		}));
	}

	async *chat(params: ChatRequest, apiKey: string): AsyncGenerator<string, ChatResponse, unknown> {
		const response = await this.chatComplete(params, apiKey);
		yield response.content;
		return response;
	}

	chatComplete(_params: ChatRequest, _apiKey: string): Promise<ChatResponse> {
		throw new Error("Use sendRequest() from streaming.ts instead of calling chatComplete directly");
	}

	async validateApiKey(apiKey: string): Promise<boolean> {
		const trimmed = apiKey.trim();
		const response = await requestUrl({
			url: "https://api.openai.com/v1/models",
			method: "GET",
			headers: {
				Authorization: `Bearer ${trimmed}`,
			},
			throw: false,
		});
		if (response.status === 200) return true;
		if (response.status === 401 || response.status === 403) return false;
		throw new Error(`HTTP ${response.status}`);
	}

	async fetchModels(apiKey: string): Promise<ModelInfo[]> {
		const trimmed = apiKey.trim();
		const response = await requestUrl({
			url: "https://api.openai.com/v1/models",
			method: "GET",
			headers: { Authorization: `Bearer ${trimmed}` },
			throw: false,
		});
		if (response.status !== 200) throw new Error(`HTTP ${response.status}`);

		// GPT-5系のみ表示（Gemini/Anthropicと同様に最新世代に限定）
		const wantedPrefixes = ["gpt-5"];
		// codex / chat-latest / image 等の特殊バリアントを除外
		const excludePattern = /codex|chat-latest|image|realtime|audio|search|transcribe|tts|dall-e|whisper/;

		const data = response.json.data as Array<Record<string, unknown>>;
		const allModels = data
			.filter(m => {
				const id = m.id as string;
				if (!wantedPrefixes.some(p => id.startsWith(p))) return false;
				if (excludePattern.test(id)) return false;
				// 日付スナップショット(YYYY-MM-DD)を除外
				if (/\d{4}-\d{2}-\d{2}/.test(id)) return false;
				return true;
			})
			.map(m => ({
				id: m.id as string,
				name: (m.id as string),
				contextWindow: 128000,
			}))
			.sort((a, b) => b.id.localeCompare(a.id));

		// 同一シリーズの重複を除去（-previewなどのエイリアス）
		const seen = new Set<string>();
		return allModels.filter(m => {
			const series = m.id.replace(/-preview$/, "");
			if (seen.has(series)) return false;
			seen.add(series);
			return true;
		});
	}
}
