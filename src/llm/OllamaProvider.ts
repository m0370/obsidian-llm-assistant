import { Platform, requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo } from "./LLMProvider";

/**
 * Ollama（ローカルLLM）プロバイダー
 * デスクトップ専用 — localhost:11434 のOpenAI互換APIを使用
 */
export class OllamaProvider implements LLMProvider {
	id = "ollama";
	name = "Ollama (ローカル)";
	requiresApiKey = false;
	supportsCORS = true; // localhost はCORS制約なし
	apiEndpoint = "http://localhost:11434/v1/chat/completions";

	models: ModelInfo[] = [
		{ id: "llama4-scout", name: "Llama 4 Scout", contextWindow: 512000 },
		{ id: "llama3.3", name: "Llama 3.3", contextWindow: 128000 },
		{ id: "gemma3", name: "Gemma 3", contextWindow: 128000 },
		{ id: "qwen3", name: "Qwen 3", contextWindow: 40960 },
		{ id: "phi4", name: "Phi 4", contextWindow: 16384 },
		{ id: "deepseek-r1:8b", name: "DeepSeek R1 8B", contextWindow: 128000 },
	];

	/**
	 * デスクトップ環境でのみ利用可能
	 */
	isAvailable(): boolean {
		return Platform.isDesktop;
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

	buildHeaders(_apiKey: string): Record<string, string> {
		// Ollamaはデフォルトで認証不要
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

	async validateApiKey(_apiKey: string): Promise<boolean> {
		// Ollamaの接続テスト（APIキー不要、サーバー到達確認）
		// requestUrl()を使用（fetch()はObsidianのCSP制約で失敗する場合がある）
		try {
			const response = await requestUrl({
				url: "http://localhost:11434/api/tags",
				method: "GET",
			});
			return response.status === 200;
		} catch {
			return false;
		}
	}

	async fetchModels(_apiKey: string): Promise<ModelInfo[]> {
		try {
			const response = await requestUrl({
				url: "http://localhost:11434/api/tags",
				method: "GET",
			});
			if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
			const data = response.json;
			const models = data.models as Array<Record<string, unknown>>;
			return (models || []).map(m => ({
				id: (m.name as string) || "",
				name: (m.name as string) || "",
				contextWindow: 128000,
			}));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("Failed to fetch")) {
				throw new Error("Ollama サーバーに接続できません (localhost:11434)。Ollamaが起動しているか確認してください。");
			}
			throw err;
		}
	}
}
