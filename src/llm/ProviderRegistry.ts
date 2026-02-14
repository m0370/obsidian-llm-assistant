import { Platform } from "obsidian";
import type { LLMProvider } from "./LLMProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { GeminiProvider } from "./GeminiProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import { OllamaProvider } from "./OllamaProvider";
import { CustomEndpointProvider } from "./CustomEndpointProvider";

/**
 * LLMプロバイダーの動的管理レジストリ
 */
export class ProviderRegistry {
	private providers: Map<string, LLMProvider> = new Map();

	constructor() {
		this.registerDefaults();
	}

	private registerDefaults(): void {
		this.register(new OpenAIProvider());
		this.register(new AnthropicProvider());
		this.register(new GeminiProvider());
		this.register(new OpenRouterProvider());

		// Ollamaはデスクトップのみ登録
		if (Platform.isDesktop) {
			this.register(new OllamaProvider());
		}

		this.register(new CustomEndpointProvider());
	}

	register(provider: LLMProvider): void {
		this.providers.set(provider.id, provider);
	}

	get(id: string): LLMProvider | undefined {
		return this.providers.get(id);
	}

	getAll(): LLMProvider[] {
		return Array.from(this.providers.values());
	}

	getIds(): string[] {
		return Array.from(this.providers.keys());
	}
}
