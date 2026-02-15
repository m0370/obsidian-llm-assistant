import { Platform } from "obsidian";
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

	async chatComplete(params: ChatRequest, apiKey: string): Promise<ChatResponse> {
		throw new Error("Use sendRequest() from streaming.ts instead of calling chatComplete directly");
	}

	async validateApiKey(_apiKey: string): Promise<boolean> {
		// Ollamaの接続テスト（APIキー不要、サーバー到達確認）
		try {
			const response = await fetch("http://localhost:11434/api/tags");
			return response.ok;
		} catch {
			return false;
		}
	}

	async fetchModels(_apiKey: string): Promise<ModelInfo[]> {
		const response = await fetch("http://localhost:11434/api/tags");
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = await response.json();
		const models = data.models as Array<Record<string, unknown>>;
		return (models || []).map(m => ({
			id: (m.name as string) || "",
			name: (m.name as string) || "",
			contextWindow: 128000,
		}));
	}
}
