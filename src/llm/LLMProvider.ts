export interface Message {
	role: "user" | "assistant" | "system";
	content: string;
	rawContent?: unknown;  // Provider-opaque structured content for Tool Use
}

export interface ChatRequest {
	model: string;
	messages: Message[];
	systemPrompt?: string;
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	tools?: ToolDefinition[];
}

export interface ChatResponse {
	content: string;
	model: string;
	usage?: {
		inputTokens: number;
		outputTokens: number;
	};
	finishReason?: string;
	toolUses?: ToolUseBlock[];
	/** Raw response parts for providers that need exact reconstruction (e.g. Gemini thought_signature) */
	rawAssistantParts?: unknown[];
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
	/** API鍵取得用URL（設定画面のリンク用） */
	apiKeyUrl?: string;

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

	/** Tool Use をサポートするか */
	supportsToolUse?: boolean;

	/** Tool Use 付きアシスタントメッセージを会話履歴用に構築 */
	buildAssistantToolUseMessage?(content: string, toolUses: ToolUseBlock[], rawParts?: unknown[]): Message;

	/** ツール実行結果のメッセージ配列を構築 */
	buildToolResultMessages?(results: ToolResult[]): Message[];

	/** API からモデルリストを動的に取得 */
	fetchModels?(apiKey: string): Promise<ModelInfo[]>;
}

/** Tool Use 実行結果 */
export interface ToolResult {
	toolUseId: string;
	name: string;
	content: string;
	isError?: boolean;
}

/** Tool Use API 用のツール定義（共通形式） */
export interface ToolDefinition {
	name: string;
	description: string;
	input_schema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

export interface ToolUseBlock {
	id: string;
	name: string;
	input: Record<string, unknown>;
	/** Provider-specific raw data to preserve when reconstructing messages (e.g. Gemini thoughtSignature) */
	rawPart?: unknown;
}
