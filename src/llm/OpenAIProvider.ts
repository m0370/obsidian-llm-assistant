import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo } from "./LLMProvider";

export class OpenAIProvider implements LLMProvider {
	id = "openai";
	name = "OpenAI";
	requiresApiKey = true;
	supportsCORS = true;
	apiEndpoint = "https://api.openai.com/v1/chat/completions";

	models: ModelInfo[] = [
		{ id: "gpt-5.2", name: "GPT-5.2", contextWindow: 128000 },
		{ id: "gpt-5.1", name: "GPT-5.1", contextWindow: 128000 },
		{ id: "gpt-5", name: "GPT-5", contextWindow: 128000 },
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
		};
	}

	async *chat(params: ChatRequest, apiKey: string): AsyncGenerator<string, ChatResponse, unknown> {
		// ストリーミングはstreaming.tsのstreamWithFetchが処理するため、
		// このメソッドは直接呼ばれない（sendRequest経由で使用）
		const response = await this.chatComplete(params, apiKey);
		yield response.content;
		return response;
	}

	async chatComplete(params: ChatRequest, apiKey: string): Promise<ChatResponse> {
		// requestUrl経由で呼ばれる場合のために残す
		// 実際にはstreaming.tsのcompleteWithRequestUrlが処理
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
}
