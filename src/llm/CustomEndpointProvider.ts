import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo } from "./LLMProvider";

/**
 * カスタムエンドポイントプロバイダー
 * OpenAI互換APIの任意URLに接続可能
 * ユーザーが自分のvLLM, text-generation-webui, LocalAI等に接続できる
 */
export class CustomEndpointProvider implements LLMProvider {
	id = "custom";
	name = "カスタムエンドポイント";
	requiresApiKey = false; // ユーザー設定による
	supportsCORS = true;
	apiEndpoint = ""; // ユーザーが設定

	models: ModelInfo[] = [];

	private _customEndpoint = "";
	private _customModelId = "";

	/**
	 * カスタム設定を適用
	 */
	configure(endpoint: string, modelId: string): void {
		this._customEndpoint = endpoint;
		this._customModelId = modelId;
		this.apiEndpoint = endpoint;

		// モデル一覧を更新
		if (modelId) {
			this.models = [
				{ id: modelId, name: modelId, contextWindow: 128000 },
			];
		}
	}

	getCustomEndpoint(): string {
		return this._customEndpoint;
	}

	getCustomModelId(): string {
		return this._customModelId;
	}

	buildRequestBody(params: ChatRequest): Record<string, unknown> {
		const messages: Array<Record<string, string>> = [];

		if (params.systemPrompt) {
			messages.push({ role: "system", content: params.systemPrompt });
		}

		for (const msg of params.messages) {
			messages.push({ role: msg.role, content: msg.content });
		}

		const body: Record<string, unknown> = {
			model: params.model || this._customModelId,
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
		if (apiKey) {
			return {
				Authorization: `Bearer ${apiKey}`,
			};
		}
		return {};
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
		if (!this._customEndpoint) return false;

		try {
			// モデル一覧エンドポイントで接続テスト
			const baseUrl = this._customEndpoint.replace(/\/chat\/completions\/?$/, "");
			const modelsUrl = `${baseUrl}/models`;
			const headers: Record<string, string> = {};
			if (apiKey) {
				headers.Authorization = `Bearer ${apiKey}`;
			}

			const response = await requestUrl({
				url: modelsUrl,
				method: "GET",
				headers,
				throw: false,
			});
			return response.status === 200;
		} catch {
			return false;
		}
	}
}
