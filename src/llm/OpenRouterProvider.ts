import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo, Message, ToolUseBlock, ToolResult } from "./LLMProvider";

/**
 * OpenRouter経由で複数のLLMモデルにアクセスするプロバイダー
 * OpenAI互換APIを使用
 */
export class OpenRouterProvider implements LLMProvider {
	id = "openrouter";
	name = "OpenRouter";
	requiresApiKey = true;
	supportsCORS = true;
	supportsToolUse = true;
	apiEndpoint = "https://openrouter.ai/api/v1/chat/completions";
	apiKeyUrl = "https://openrouter.ai/keys";

	models: ModelInfo[] = [
		{ id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6 (via OR)", contextWindow: 200000 },
		{ id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5 (via OR)", contextWindow: 200000 },
		{ id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5 (via OR)", contextWindow: 200000 },
		{ id: "openai/gpt-5.2", name: "GPT-5.2 (via OR)", contextWindow: 400000 },
		{ id: "openai/gpt-5", name: "GPT-5 (via OR)", contextWindow: 400000 },
		{ id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (via OR)", contextWindow: 1000000 },
		{ id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (via OR)", contextWindow: 1000000 },
		{ id: "meta-llama/llama-4-scout", name: "Llama 4 Scout (via OR)", contextWindow: 512000 },
		{ id: "deepseek/deepseek-r1", name: "DeepSeek R1 (via OR)", contextWindow: 163840 },
	];

	buildRequestBody(params: ChatRequest): Record<string, unknown> {
		const messages: Array<Record<string, unknown>> = [];

		if (params.systemPrompt) {
			messages.push({ role: "system", content: params.systemPrompt });
		}

		for (const msg of params.messages) {
			if (msg.rawContent) {
				messages.push(msg.rawContent as Record<string, unknown>);
			} else {
				messages.push({ role: msg.role, content: msg.content });
			}
		}

		const body: Record<string, unknown> = {
			model: params.model,
			messages,
		};

		if (params.temperature !== undefined) {
			body.temperature = params.temperature;
		}
		if (params.maxTokens !== undefined) {
			body.max_tokens = params.maxTokens;
		}
		// OpenAI-compatible Function Calling format
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

		if (params.stream) {
			body.stream = true;
		}

		return body;
	}

	buildHeaders(apiKey: string): Record<string, string> {
		return {
			Authorization: `Bearer ${apiKey}`,
			"HTTP-Referer": "https://obsidian.md",
			"X-Title": "Obsidian LLM Assistant",
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
					function: { name: tu.name, arguments: JSON.stringify(tu.input) },
				})),
			},
		};
	}

	buildToolResultMessages(results: ToolResult[]): Message[] {
		return results.map(r => ({
			role: "user" as const,
			content: r.content,
			rawContent: { role: "tool", tool_call_id: r.toolUseId, content: r.content },
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
			url: "https://openrouter.ai/api/v1/models",
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
			url: "https://openrouter.ai/api/v1/models",
			method: "GET",
			headers: { Authorization: `Bearer ${trimmed}` },
			throw: false,
		});
		if (response.status !== 200) throw new Error(`HTTP ${response.status}`);

		const data = response.json.data as Array<Record<string, unknown>>;
		const allModels = data.map(m => ({
			id: m.id as string,
			name: (m.name as string) || (m.id as string),
			contextWindow: (m.context_length as number) || 128000,
		}));

		// 取得したいシリーズ（優先度順）— 各シリーズから最新1つだけ選出
		const wantedPrefixes = [
			"anthropic/claude-opus",
			"anthropic/claude-sonnet",
			"anthropic/claude-haiku",
			"openai/gpt-5",
			"openai/gpt-4o",
			"openai/o4",
			"openai/o3",
			"google/gemini-2.5-pro",
			"google/gemini-2.5-flash",
			"meta-llama/llama-4",
			"deepseek/deepseek-r1",
			"qwen/qwen3",
		];

		const picked: ModelInfo[] = [];
		for (const prefix of wantedPrefixes) {
			// 各シリーズのモデルを降順ソートして最新を選択
			const candidates = allModels
				.filter(m => m.id.startsWith(prefix) && !m.id.includes(":free") && !m.id.includes(":extended"))
				.sort((a, b) => b.id.localeCompare(a.id));
			if (candidates.length > 0) picked.push(candidates[0]);
		}
		return picked;
	}
}
