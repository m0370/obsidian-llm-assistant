import { t } from "./i18n";

export const PLUGIN_ID = "llm-assistant";
export const VIEW_TYPE_CHAT = "llm-assistant-chat-view";
export const DISPLAY_NAME = "LLM Assistant";

export const DEFAULT_SETTINGS: LLMAssistantSettings = {
	activeProvider: "gemini",
	activeModel: "gemini-2.5-flash",
	streamingEnabled: true,
	securityLevel: "secretstorage",
	systemPrompt: "",
	temperature: 0.7,
	maxTokens: 4096,
	customEndpoint: "",
	customModelId: "",
	language: "auto",
	fontSize: "medium",
	// プロバイダー有効/無効
	enableOpenRouter: false,
	enableOllama: false,
	// RAG設定
	ragEnabled: false,
	ragTopK: 5,
	ragMinScore: 0.3,
	ragChunkStrategy: "section",
	ragChunkMaxTokens: 512,
	ragExcludeFolders: "",
	ragEmbeddingEnabled: false,
	ragEmbeddingProvider: "openai",
	ragEmbeddingModel: "text-embedding-3-small",
	ragAutoIndex: false,
	ragEmbeddingUseSharedKey: true,
	ragEmbeddingCompactMode: false,
};

export interface LLMAssistantSettings {
	activeProvider: string;
	activeModel: string;
	streamingEnabled: boolean;
	securityLevel: "secretstorage" | "webcrypto";
	systemPrompt: string;
	temperature: number;
	maxTokens: number;
	customEndpoint: string;
	customModelId: string;
	language: "auto" | "en" | "ja";
	fontSize: "small" | "medium" | "large";
	// プロバイダー有効/無効
	enableOpenRouter: boolean;
	enableOllama: boolean;
	// RAG設定
	ragEnabled: boolean;
	ragTopK: number;
	ragMinScore: number;
	ragChunkStrategy: "section" | "paragraph" | "fixed";
	ragChunkMaxTokens: number;
	ragExcludeFolders: string;
	// Phase 2: Embedding検索
	ragEmbeddingEnabled: boolean;
	ragEmbeddingProvider: string;
	ragEmbeddingModel: string;
	ragAutoIndex: boolean;
	ragEmbeddingUseSharedKey: boolean;
	ragEmbeddingCompactMode: boolean;
}

export interface ProviderConfig {
	id: string;
	name: string;
	models: ModelConfig[];
	requiresApiKey: boolean;
	supportsCORS: boolean;
	apiEndpoint: string;
	apiKeyUrl?: string;
}

export interface ModelConfig {
	id: string;
	name: string;
	contextWindow: number;
}

export interface QuickAction {
	id: string;
	name: string;
	prompt: string;
}

export function getQuickActions(): QuickAction[] {
	return [
		{
			id: "summarize",
			name: t("quickAction.summarize"),
			prompt: t("quickAction.summarize.prompt"),
		},
		{
			id: "translate-en",
			name: t("quickAction.translateEn"),
			prompt: t("quickAction.translateEn.prompt"),
		},
		{
			id: "translate-ja",
			name: t("quickAction.translateJa"),
			prompt: t("quickAction.translateJa.prompt"),
		},
		{
			id: "proofread",
			name: t("quickAction.proofread"),
			prompt: t("quickAction.proofread.prompt"),
		},
		{
			id: "explain",
			name: t("quickAction.explain"),
			prompt: t("quickAction.explain.prompt"),
		},
		{
			id: "expand",
			name: t("quickAction.expand"),
			prompt: t("quickAction.expand.prompt"),
		},
	];
}

export interface SystemPromptPreset {
	id: string;
	name: string;
	prompt: string;
}

export function getSystemPromptPresets(): SystemPromptPreset[] {
	return [
		{
			id: "default",
			name: t("preset.default"),
			prompt: t("preset.default.prompt"),
		},
		{
			id: "polite-ja",
			name: t("preset.politeJa"),
			prompt: t("preset.politeJa.prompt"),
		},
		{
			id: "technical",
			name: t("preset.technical"),
			prompt: t("preset.technical.prompt"),
		},
		{
			id: "creative",
			name: t("preset.creative"),
			prompt: t("preset.creative.prompt"),
		},
		{
			id: "translator",
			name: t("preset.translator"),
			prompt: t("preset.translator.prompt"),
		},
		{
			id: "code-reviewer",
			name: t("preset.codeReviewer"),
			prompt: t("preset.codeReviewer.prompt"),
		},
	];
}

export const PROVIDERS: ProviderConfig[] = [
	{
		id: "openai",
		name: "OpenAI",
		models: [
			{ id: "gpt-5.2", name: "GPT-5.2", contextWindow: 400000 },
			{ id: "gpt-5.1", name: "GPT-5.1", contextWindow: 400000 },
			{ id: "gpt-5", name: "GPT-5", contextWindow: 400000 },
			{ id: "gpt-5-mini", name: "GPT-5 Mini", contextWindow: 400000 },
			{ id: "gpt-4.1", name: "GPT-4.1", contextWindow: 1000000 },
			{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini", contextWindow: 1000000 },
			{ id: "o3", name: "o3", contextWindow: 200000 },
		],
		requiresApiKey: true,
		supportsCORS: true,
		apiEndpoint: "https://api.openai.com/v1/chat/completions",
		apiKeyUrl: "https://platform.openai.com/api-keys",
	},
	{
		id: "anthropic",
		name: "Anthropic",
		models: [
			{ id: "claude-opus-4-6", name: "Claude Opus 4.6", contextWindow: 200000 },
			{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 200000 },
			{ id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200000 },
		],
		requiresApiKey: true,
		supportsCORS: false,
		apiEndpoint: "https://api.anthropic.com/v1/messages",
		apiKeyUrl: "https://console.anthropic.com/settings/keys",
	},
	{
		id: "gemini",
		name: "Google Gemini",
		models: [
			{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: 1000000 },
			{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 1000000 },
			{ id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", contextWindow: 1000000 },
			{ id: "gemini-3-flash-preview", name: "Gemini 3 Flash (Preview)", contextWindow: 1000000 },
			{ id: "gemini-3-pro-preview", name: "Gemini 3 Pro (Preview)", contextWindow: 1000000 },
		],
		requiresApiKey: true,
		supportsCORS: true,
		apiEndpoint: "https://generativelanguage.googleapis.com/v1beta/",
		apiKeyUrl: "https://aistudio.google.com/apikey",
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		models: [
			{ id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6 (via OR)", contextWindow: 200000 },
			{ id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6 (via OR)", contextWindow: 200000 },
			{ id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5 (via OR)", contextWindow: 200000 },
			{ id: "openai/gpt-5.2", name: "GPT-5.2 (via OR)", contextWindow: 400000 },
			{ id: "openai/gpt-5", name: "GPT-5 (via OR)", contextWindow: 400000 },
			{ id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (via OR)", contextWindow: 1000000 },
			{ id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (via OR)", contextWindow: 1000000 },
			{ id: "meta-llama/llama-4-scout", name: "Llama 4 Scout (via OR)", contextWindow: 512000 },
			{ id: "deepseek/deepseek-r1", name: "DeepSeek R1 (via OR)", contextWindow: 163840 },
		],
		requiresApiKey: true,
		supportsCORS: true,
		apiEndpoint: "https://openrouter.ai/api/v1/chat/completions",
		apiKeyUrl: "https://openrouter.ai/keys",
	},
	{
		id: "ollama",
		name: "Ollama (ローカル)",
		models: [
			{ id: "llama3.3", name: "Llama 3.3", contextWindow: 128000 },
			{ id: "gemma3", name: "Gemma 3", contextWindow: 128000 },
			{ id: "qwen3", name: "Qwen 3", contextWindow: 40960 },
		],
		requiresApiKey: false,
		supportsCORS: true,
		apiEndpoint: "http://localhost:11434/v1/chat/completions",
	},
	{
		id: "custom",
		name: "カスタムエンドポイント",
		models: [],
		requiresApiKey: false,
		supportsCORS: true,
		apiEndpoint: "",
	},
];
