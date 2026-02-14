import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LLMAssistantPlugin from "../main";
import { PROVIDERS, VIEW_TYPE_CHAT, getSystemPromptPresets } from "../constants";
import type { SecurityLevel } from "../security/SecretManager";
import type { CustomEndpointProvider } from "../llm/CustomEndpointProvider";
import { t, setLocale, resolveLocale } from "../i18n";

export class LLMAssistantSettingTab extends PluginSettingTab {
	plugin: LLMAssistantPlugin;

	constructor(app: App, plugin: LLMAssistantPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: t("settings.heading") });

		// 言語選択（最上部）
		new Setting(containerEl)
			.setName(t("settings.language"))
			.setDesc(t("settings.languageDesc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("auto", t("settings.languageAuto"));
				dropdown.addOption("en", "English");
				dropdown.addOption("ja", "日本語");
				dropdown.setValue(this.plugin.settings.language);
				dropdown.onChange(async (value) => {
					this.plugin.settings.language = value as "auto" | "en" | "ja";
					setLocale(resolveLocale(this.plugin.settings.language));
					await this.plugin.saveSettings();
					this.display();
				});
			});

		// プロバイダー選択
		new Setting(containerEl)
			.setName(t("settings.provider"))
			.setDesc(t("settings.providerDesc"))
			.addDropdown((dropdown) => {
				PROVIDERS.forEach((p) => {
					dropdown.addOption(p.id, p.name);
				});
				dropdown.setValue(this.plugin.settings.activeProvider);
				dropdown.onChange(async (value) => {
					this.plugin.settings.activeProvider = value;
					const provider = PROVIDERS.find((p) => p.id === value);
					if (provider && provider.models.length > 0) {
						this.plugin.settings.activeModel = provider.models[0].id;
					}
					await this.plugin.saveSettings();
					this.display();
				});
			});

		// モデル選択
		const activeProvider = PROVIDERS.find(
			(p) => p.id === this.plugin.settings.activeProvider
		);
		if (activeProvider) {
			new Setting(containerEl)
				.setName(t("settings.model"))
				.setDesc(t("settings.modelDesc"))
				.addDropdown((dropdown) => {
					activeProvider.models.forEach((m) => {
						dropdown.addOption(m.id, m.name);
					});
					dropdown.setValue(this.plugin.settings.activeModel);
					dropdown.onChange(async (value) => {
						this.plugin.settings.activeModel = value;
						await this.plugin.saveSettings();
					});
				});
		}

		// セキュリティレベル選択
		containerEl.createEl("h3", { text: t("settings.security") });

		const secDesc = this.plugin.secretManager.isSecretStorageAvailable()
			? t("settings.securityAvailable")
			: t("settings.securityUnavailable");

		new Setting(containerEl)
			.setName(t("settings.apiKeyStorage"))
			.setDesc(secDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption("secretstorage", t("settings.secretStorage"));
				dropdown.addOption("webcrypto", t("settings.webCrypto"));
				dropdown.addOption("plaintext", t("settings.plaintext"));
				dropdown.setValue(this.plugin.settings.securityLevel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.securityLevel = value as SecurityLevel;
					this.plugin.secretManager.setSecurityLevel(value as SecurityLevel);
					await this.plugin.saveSettings();
					this.display();
				});
			});

		// 平文保存の警告
		if (this.plugin.settings.securityLevel === "plaintext") {
			const warning = containerEl.createDiv({ cls: "llm-security-warning" });
			warning.textContent = t("settings.plaintextWarning");
			warning.style.cssText = "color: var(--text-error); background: rgba(255,0,0,0.1); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 13px;";
		}

		// WebCrypto用マスターパスワード
		if (this.plugin.settings.securityLevel === "webcrypto") {
			new Setting(containerEl)
				.setName(t("settings.masterPassword"))
				.setDesc(t("settings.masterPasswordDesc"))
				.addText((text) => {
					text.inputEl.type = "password";
					text.setPlaceholder(t("settings.masterPasswordPlaceholder"));
					text.onChange((value) => {
						if (value) {
							this.plugin.secretManager.setMasterPassword(value);
						}
					});
				});
		}

		// API鍵設定セクション（SecretManager経由）
		containerEl.createEl("h3", { text: t("settings.apiKeys") });

		PROVIDERS.filter((p) => p.requiresApiKey).forEach((provider) => {
			const desc = provider.apiKeyUrl
				? `${t("settings.apiKeyInput", { name: provider.name })}  |  ${t("settings.apiKeyUrl", { url: provider.apiKeyUrl })}`
				: t("settings.apiKeyInput", { name: provider.name });
			const setting = new Setting(containerEl)
				.setName(`${provider.name} API Key`)
				.setDesc(desc);

			setting.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.style.width = "100%";
				text.setPlaceholder(`${provider.name} API Key`);

				// 現在のAPI鍵を読み込み
				this.plugin.secretManager.getApiKey(provider.id).then((key) => {
					if (key) text.setValue(key);
				});

				text.onChange(async (value) => {
					if (value) {
						try {
							await this.plugin.secretManager.saveApiKey(provider.id, value);
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							new Notice(t("notice.apiKeySaveFailed", { message: msg }));
						}
					}
				});
			});

			// テストボタン
			setting.addButton((btn) => {
				btn.setButtonText(t("settings.apiKeyTest"));
				btn.onClick(async () => {
					const apiKey = await this.plugin.secretManager.getApiKey(provider.id);
					if (!apiKey) {
						new Notice(t("settings.apiKeyNotSet"));
						return;
					}
					const llmProvider = this.plugin.providerRegistry.get(provider.id);
					if (!llmProvider) return;

					btn.setButtonText(t("settings.apiKeyTesting"));
					btn.setDisabled(true);
					try {
						const valid = await llmProvider.validateApiKey(apiKey);
						new Notice(valid ? t("notice.apiKeyValid") : t("notice.apiKeyInvalid"));
					} catch (err) {
						const detail = err instanceof Error ? err.message : String(err);
						new Notice(`${t("notice.apiKeyTestFailed")} (${detail})`, 8000);
					} finally {
						btn.setButtonText(t("settings.apiKeyTest"));
						btn.setDisabled(false);
					}
				});
			});

			// 削除ボタン
			setting.addButton((btn) => {
				btn.setButtonText(t("settings.apiKeyDelete"));
				btn.setWarning();
				btn.onClick(async () => {
					await this.plugin.secretManager.deleteApiKey(provider.id);
					new Notice(t("notice.apiKeyDeleted", { name: provider.name }));
					this.display();
				});
			});
		});

		// カスタムエンドポイント設定
		containerEl.createEl("h3", { text: t("settings.customEndpoint") });

		new Setting(containerEl)
			.setName(t("settings.endpointUrl"))
			.setDesc(t("settings.endpointUrlDesc"))
			.addText((text) => {
				text.inputEl.style.width = "100%";
				text.setPlaceholder("http://localhost:8080/v1/chat/completions");
				text.setValue(this.plugin.settings.customEndpoint);
				text.onChange(async (value) => {
					this.plugin.settings.customEndpoint = value;
					await this.plugin.saveSettings();
					this.applyCustomEndpoint();
				});
			});

		new Setting(containerEl)
			.setName(t("settings.modelId"))
			.setDesc(t("settings.modelIdDesc"))
			.addText((text) => {
				text.setPlaceholder("model-name");
				text.setValue(this.plugin.settings.customModelId);
				text.onChange(async (value) => {
					this.plugin.settings.customModelId = value;
					await this.plugin.saveSettings();
					this.applyCustomEndpoint();
				});
			});

		// 表示設定
		containerEl.createEl("h3", { text: t("settings.advanced") });

		new Setting(containerEl)
			.setName(t("settings.fontSize"))
			.setDesc(t("settings.fontSizeDesc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("small", t("settings.fontSizeSmall"));
				dropdown.addOption("medium", t("settings.fontSizeMedium"));
				dropdown.addOption("large", t("settings.fontSizeLarge"));
				dropdown.setValue(this.plugin.settings.fontSize);
				dropdown.onChange(async (value) => {
					this.plugin.settings.fontSize = value as "small" | "medium" | "large";
					await this.plugin.saveSettings();
					// ChatViewのフォントサイズを即時更新
					const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
					for (const leaf of leaves) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(leaf.view as any).updateFontSize?.();
					}
				});
			});

		// ストリーミング設定

		new Setting(containerEl)
			.setName(t("settings.streaming"))
			.setDesc(t("settings.streamingDesc"))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.streamingEnabled);
				toggle.onChange(async (value) => {
					this.plugin.settings.streamingEnabled = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("settings.temperature"))
			.setDesc(t("settings.temperatureDesc"))
			.addSlider((slider) => {
				slider.setLimits(0, 1, 0.1);
				slider.setValue(this.plugin.settings.temperature);
				slider.setDynamicTooltip();
				slider.onChange(async (value) => {
					this.plugin.settings.temperature = value;
					await this.plugin.saveSettings();
				});
			});

		const presets = getSystemPromptPresets();
		new Setting(containerEl)
			.setName(t("settings.preset"))
			.setDesc(t("settings.presetDesc"))
			.addDropdown((dropdown) => {
				presets.forEach((preset) => {
					dropdown.addOption(preset.id, preset.name);
				});
				dropdown.setValue("default");
				dropdown.onChange(async (value) => {
					const preset = presets.find((p) => p.id === value);
					if (preset) {
						this.plugin.settings.systemPrompt = preset.prompt;
						await this.plugin.saveSettings();
						this.display();
					}
				});
			});

		new Setting(containerEl)
			.setName(t("settings.systemPrompt"))
			.setDesc(t("settings.systemPromptDesc"))
			.addTextArea((text) => {
				text.inputEl.style.width = "100%";
				text.inputEl.style.minHeight = "80px";
				text.inputEl.style.fontSize = "14px";
				text.setPlaceholder(t("settings.systemPromptPlaceholder"));
				text.setValue(this.plugin.settings.systemPrompt);
				text.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private applyCustomEndpoint(): void {
		const provider = this.plugin.providerRegistry.get("custom") as CustomEndpointProvider | undefined;
		if (provider) {
			provider.configure(
				this.plugin.settings.customEndpoint,
				this.plugin.settings.customModelId,
			);
		}
	}
}
