export interface Message {
	role: "user" | "assistant" | "system";
	content: string;
}

export interface ChatRequest {
	model: string;
	messages: Message[];
	systemPrompt?: string;
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
}

export interface ChatResponse {
	content: string;
	model: string;
	usage?: {
		inputTokens: number;
		outputTokens: number;
	};
	finishReason?: string;
}

export interface ModelInfo {
	id: string;
	name: string;
	contextWindow: number;
	pricing?: { input: number; output: number }; // per 1M tokens
}

export interface LLMProvider {
	/** プロバイダー識別子 */
	id: string;
	/** 表示名 */
	name: string;
	/** 利用可能モデル一覧 */
	models: ModelInfo[];
	/** API鍵が必要か */
	requiresApiKey: boolean;
	/** fetch()でのCORS通信が可能か */
	supportsCORS: boolean;
	/** APIエンドポイント */
	apiEndpoint: string;

	/**
	 * ストリーミング対応チャット
	 * トークンを逐次yieldするAsyncGenerator
	 */
	chat(params: ChatRequest, apiKey: string): AsyncGenerator<string, ChatResponse, unknown>;

	/**
	 * 一括受信チャット（ストリーミング非対応時のフォールバック）
	 * requestUrl()経由で使用
	 */
	chatComplete(params: ChatRequest, apiKey: string): Promise<ChatResponse>;

	/**
	 * API鍵の有効性を検証
	 */
	validateApiKey(apiKey: string): Promise<boolean>;

	/**
	 * リクエストボディを構築（プロバイダー固有のフォーマット）
	 */
	buildRequestBody(params: ChatRequest): Record<string, unknown>;

	/**
	 * リクエストヘッダーを構築
	 */
	buildHeaders(apiKey: string): Record<string, string>;
}
