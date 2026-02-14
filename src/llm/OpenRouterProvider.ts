import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo } from "./LLMProvider";

/**
 * OpenRouter経由で複数のLLMモデルにアクセスするプロバイダー
 * OpenAI互換APIを使用
 */
export class OpenRouterProvider implements LLMProvider {
	id = "openrouter";
	name = "OpenRouter";
	requiresApiKey = true;
	supportsCORS = true;
	apiEndpoint = "https://openrouter.ai/api/v1/chat/completions";

	models: ModelInfo[] = [
		{ id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5 (via OR)", contextWindow: 200000 },
		{ id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5 (via OR)", contextWindow: 200000 },
		{ id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (via OR)", contextWindow: 1000000 },
		{ id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash (via OR)", contextWindow: 1000000 },
		{ id: "openai/gpt-5", name: "GPT-5 (via OR)", contextWindow: 128000 },
		{ id: "meta-llama/llama-4-scout", name: "Llama 4 Scout (via OR)", contextWindow: 512000 },
		{ id: "deepseek/deepseek-r1", name: "DeepSeek R1 (via OR)", contextWindow: 163840 },
	];

	buildRequestBody(params: ChatRequest): Record<string, unknown> {
		const messages: Array<Record<string, string>> = [];

		if (params.systemPrompt) {
			messages.push({ role: "system", content: params.systemPrompt });
		}

		for (const msg of params.messages) {
			messages.push({ role: msg.role, content: msg.content });
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

	async *chat(params: ChatRequest, apiKey: string): AsyncGenerator<string, ChatResponse, unknown> {
		const response = await this.chatComplete(params, apiKey);
		yield response.content;
		return response;
	}

	async chatComplete(params: ChatRequest, apiKey: string): Promise<ChatResponse> {
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
}
