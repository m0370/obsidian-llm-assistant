import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo, Message, ToolUseBlock, ToolResult } from "./LLMProvider";

/**
 * Anthropic (Claude) プロバイダー
 *
 * 重要: Anthropic APIはCORSヘッダーを返さないため、
 * 全プラットフォームでrequestUrl()を使用する。
 * supportsCORS = false により、streaming.tsが自動的にrequestUrl()を選択。
 */
export class AnthropicProvider implements LLMProvider {
	id = "anthropic";
	name = "Anthropic";
	requiresApiKey = true;
	supportsCORS = false; // CORSヘッダー非対応 → 常にrequestUrl()
	supportsToolUse = true;
	apiEndpoint = "https://api.anthropic.com/v1/messages";
	apiKeyUrl = "https://console.anthropic.com/settings/keys";

	models: ModelInfo[] = [
		{ id: "claude-opus-4-6", name: "Claude Opus 4.6", contextWindow: 200000 },
		{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 200000 },
		{ id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200000 },
	];

	buildRequestBody(params: ChatRequest): Record<string, unknown> {
		const messages: Array<Record<string, unknown>> = [];

		for (const msg of params.messages) {
			if (msg.role !== "system") {
				// rawContent があれば content 配列として使用（Tool Use対応）
				if (msg.rawContent) {
					messages.push({ role: msg.role, content: msg.rawContent });
				} else {
					messages.push({ role: msg.role, content: msg.content });
				}
			}
		}

		const body: Record<string, unknown> = {
			model: params.model,
			messages,
			max_tokens: params.maxTokens || 4096,
		};

		// Anthropicはsystemプロンプトをトップレベルに配置
		if (params.systemPrompt) {
			body.system = params.systemPrompt;
		}

		// Tool Use definitions
		if (params.tools && params.tools.length > 0) {
			body.tools = params.tools;
		}

		if (params.temperature !== undefined) {
			body.temperature = params.temperature;
		}
		if (params.stream) {
			body.stream = true;
		}

		return body;
	}

	buildHeaders(apiKey: string): Record<string, string> {
		return {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"anthropic-dangerous-direct-browser-access": "true",
		};
	}

	buildAssistantToolUseMessage(content: string, toolUses: ToolUseBlock[]): Message {
		const rawContent: unknown[] = [];
		if (content) rawContent.push({ type: "text", text: content });
		for (const tu of toolUses) {
			rawContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
		}
		return { role: "assistant", content: content || "", rawContent };
	}

	buildToolResultMessages(results: ToolResult[]): Message[] {
		const rawContent = results.map(r => ({
			type: "tool_result",
			tool_use_id: r.toolUseId,
			content: r.content,
			...(r.isError ? { is_error: true } : {}),
		}));
		return [{ role: "user", content: "", rawContent }];
	}

	async *chat(params: ChatRequest, apiKey: string): AsyncGenerator<string, ChatResponse, unknown> {
		const response = await this.chatComplete(params, apiKey);
		yield response.content;
		return response;
	}

	chatComplete(_params: ChatRequest, _apiKey: string): Promise<ChatResponse> {
		throw new Error("Use sendRequest() from streaming.ts instead of calling chatComplete directly");
	}

	async fetchModels(apiKey: string): Promise<ModelInfo[]> {
		const trimmed = apiKey.trim();
		const response = await requestUrl({
			url: "https://api.anthropic.com/v1/models?limit=100",
			method: "GET",
			headers: this.buildHeaders(trimmed),
			throw: false,
		});
		if (response.status !== 200) throw new Error(`HTTP ${response.status}`);

		const data = response.json.data as Array<Record<string, unknown>>;
		const allModels = data
			.filter(m => (m.id as string).startsWith("claude-"))
			.map(m => ({
				id: m.id as string,
				name: (m.display_name as string) || (m.id as string),
				contextWindow: 200000,
			}));

		// 各ティア(opus/sonnet/haiku)から最新1つだけ選出
		const tiers = ["opus", "sonnet", "haiku"];
		const picked: ModelInfo[] = [];
		for (const tier of tiers) {
			const candidates = allModels.filter(m => m.id.includes(`-${tier}-`));
			if (!candidates.length) continue;
			// 非日付版（alias）を優先、なければ日付降順で最新を選択
			const nonDated = candidates.filter(m => !/\d{8}$/.test(m.id));
			if (nonDated.length > 0) {
				nonDated.sort((a, b) => b.id.localeCompare(a.id));
				picked.push(nonDated[0]);
			} else {
				candidates.sort((a, b) => b.id.localeCompare(a.id));
				picked.push(candidates[0]);
			}
		}
		return picked;
	}

	async validateApiKey(apiKey: string): Promise<boolean> {
		const trimmed = apiKey.trim();
		const response = await requestUrl({
			url: "https://api.anthropic.com/v1/messages",
			method: "POST",
			headers: {
				...this.buildHeaders(trimmed),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: this.models[this.models.length - 1].id,
				max_tokens: 1,
				messages: [{ role: "user", content: "Hi" }],
			}),
			throw: false,
		});
		if (response.status === 200) return true;
		if (response.status === 401 || response.status === 403) return false;
		// 400(モデル不一致等), 429(レート制限)等 → キー自体は有効と判定
		return true;
	}
}
