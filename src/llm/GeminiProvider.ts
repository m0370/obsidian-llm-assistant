import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo } from "./LLMProvider";

/**
 * Google Gemini プロバイダー
 *
 * Gemini APIはOpenAIとは異なるリクエスト/レスポンス形式を使用。
 * APIキーはURLパラメータとして渡す（ヘッダーではなく）。
 */
export class GeminiProvider implements LLMProvider {
	id = "gemini";
	name = "Google Gemini";
	requiresApiKey = true;
	supportsCORS = true;
	apiEndpoint = "https://generativelanguage.googleapis.com/v1beta/";

	models: ModelInfo[] = [
		{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: 1000000 },
		{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 1000000 },
		{ id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", contextWindow: 1000000 },
		{ id: "gemini-3-flash-preview", name: "Gemini 3 Flash (Preview)", contextWindow: 1000000 },
		{ id: "gemini-3-pro-preview", name: "Gemini 3 Pro (Preview)", contextWindow: 1000000 },
	];

	/**
	 * Gemini APIのエンドポイントURLを構築
	 * APIキーはURLパラメータとして含める
	 */
	getEndpointUrl(model: string, apiKey: string, stream: boolean): string {
		const action = stream ? "streamGenerateContent" : "generateContent";
		const altParam = stream ? "&alt=sse" : "";
		return `${this.apiEndpoint}models/${model}:${action}?key=${apiKey}${altParam}`;
	}

	buildRequestBody(params: ChatRequest): Record<string, unknown> {
		const contents: Array<Record<string, unknown>> = [];

		for (const msg of params.messages) {
			if (msg.role === "system") continue;
			contents.push({
				role: msg.role === "assistant" ? "model" : "user",
				parts: [{ text: msg.content }],
			});
		}

		const body: Record<string, unknown> = { contents };

		// システムプロンプトはsystemInstructionとして設定
		if (params.systemPrompt) {
			body.systemInstruction = {
				parts: [{ text: params.systemPrompt }],
			};
		}

		// 生成設定
		const generationConfig: Record<string, unknown> = {};
		if (params.temperature !== undefined) {
			generationConfig.temperature = params.temperature;
		}
		if (params.maxTokens !== undefined) {
			generationConfig.maxOutputTokens = params.maxTokens;
		}
		if (Object.keys(generationConfig).length > 0) {
			body.generationConfig = generationConfig;
		}

		return body;
	}

	buildHeaders(_apiKey: string): Record<string, string> {
		// Gemini APIはキーをURLパラメータで渡すため、ヘッダーには含めない
		return {};
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
		const url = `${this.apiEndpoint}models?key=${trimmed}`;
		const response = await requestUrl({
			url,
			method: "GET",
			throw: false,
		});
		if (response.status === 200) return true;
		if (response.status === 400 || response.status === 401 || response.status === 403) return false;
		throw new Error(`HTTP ${response.status}`);
	}
}
