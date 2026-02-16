import { requestUrl } from "obsidian";
import type { LLMProvider, ChatRequest, ChatResponse, ModelInfo, Message, ToolUseBlock, ToolResult } from "./LLMProvider";

export class OpenAIProvider implements LLMProvider {
	id = "openai";
	name = "OpenAI";
	requiresApiKey = true;
	supportsCORS = true;
	supportsToolUse = true;
	apiEndpoint = "https://api.openai.com/v1/chat/completions";
	apiKeyUrl = "https://platform.openai.com/api-keys";

	models: ModelInfo[] = [
		{ id: "gpt-5.2", name: "GPT-5.2", contextWindow: 400000 },
		{ id: "gpt-5.1", name: "GPT-5.1", contextWindow: 400000 },
		{ id: "gpt-5", name: "GPT-5", contextWindow: 400000 },
		{ id: "gpt-5-mini", name: "GPT-5 Mini", contextWindow: 400000 },
		{ id: "gpt-4.1", name: "GPT-4.1", contextWindow: 1000000 },
		{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini", contextWindow: 1000000 },
		{ id: "o3", name: "o3", contextWindow: 200000 },
	];

	buildRequestBody(params: ChatRequest): Record<string, unknown> {
		const messages: Array<Record<string, unknown>> = [];

		if (params.systemPrompt) {
			messages.push({ role: "system", content: params.systemPrompt });
		}

		for (const msg of params.messages) {
			if (msg.rawContent) {
				// Tool Use: rawContent contains the full pre-formatted message
				messages.push(msg.rawContent as Record<string, unknown>);
			} else {
				messages.push({ role: msg.role, content: msg.content });
			}
		}

		const body: Record<string, unknown> = {
			model: params.model,
			messages,
		};

		// Convert common ToolDefinition to OpenAI Function Calling format
		if (params.tools && params.tools.length > 0) {
			body.tools = params.tools.map(tool => ({
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.input_schema,
				},
			}));
		}

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

	buildAssistantToolUseMessage(content: string, toolUses: ToolUseBlock[]): Message {
		return {
			role: "assistant",
			content: content || "",
			rawContent: {
				role: "assistant",
				content: content || null,
				tool_calls: toolUses.map(tu => ({
					id: tu.id,
					type: "function",
					function: {
						name: tu.name,
						arguments: JSON.stringify(tu.input),
					},
				})),
			},
		};
	}

	buildToolResultMessages(results: ToolResult[]): Message[] {
		// OpenAI requires separate messages per tool result with role: "tool"
		return results.map(r => ({
			role: "user" as const,
			content: r.content,
			rawContent: {
				role: "tool",
				tool_call_id: r.toolUseId,
				content: r.content,
			},
		}));
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

	async fetchModels(apiKey: string): Promise<ModelInfo[]> {
		const trimmed = apiKey.trim();
		const response = await requestUrl({
			url: "https://api.openai.com/v1/models",
			method: "GET",
			headers: { Authorization: `Bearer ${trimmed}` },
			throw: false,
		});
		if (response.status !== 200) throw new Error(`HTTP ${response.status}`);

		const data = response.json.data as Array<Record<string, unknown>>;
		// Filter for chat-capable models
		const chatModels = data.filter(m => {
			const id = m.id as string;
			return id.startsWith("gpt-") || id.startsWith("o1") ||
				id.startsWith("o3") || id.startsWith("o4") ||
				id.startsWith("chatgpt-");
		});

		return chatModels.map(m => {
			const id = m.id as string;
			return {
				id,
				name: id,
				contextWindow: 128000,
			};
		}).sort((a, b) => b.id.localeCompare(a.id));
	}
}
