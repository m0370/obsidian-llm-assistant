import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LLMAssistantPlugin from "../main";
import { VIEW_TYPE_CHAT, DISPLAY_NAME, getSystemPromptPresets } from "../constants";
import type { SecurityLevel } from "../security/SecretManager";
import type { CustomEndpointProvider } from "../llm/CustomEndpointProvider";
import type { LLMProvider } from "../llm/LLMProvider";
import { t, setLocale, resolveLocale } from "../i18n";
import { isMobile } from "../utils/platform";

export class LLMAssistantSettingTab extends PluginSettingTab {
	plugin: LLMAssistantPlugin;

	constructor(app: App, plugin: LLMAssistantPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(t("settings.heading")).setHeading();

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

		// プロバイダー選択（無効化されたプロバイダーを除外）
		const allProviders = this.plugin.providerRegistry.getAll();
		const enabledProviders = allProviders.filter((p) => this.isProviderEnabled(p.id));
		new Setting(containerEl)
			.setName(t("settings.provider"))
			.setDesc(t("settings.providerDesc"))
			.addDropdown((dropdown) => {
				enabledProviders.forEach((p) => {
					dropdown.addOption(p.id, p.name);
				});
				dropdown.setValue(this.plugin.settings.activeProvider);
				dropdown.onChange(async (value) => {
					this.plugin.settings.activeProvider = value;
					const provider = this.plugin.providerRegistry.get(value);
					if (provider && provider.models.length > 0) {
						this.plugin.settings.activeModel = provider.models[0].id;
					}
					await this.plugin.saveSettings();
					this.display();
					this.syncChatViewModelSelector();
				});
			});

		// Ollama + モバイル環境の警告
		if (this.plugin.settings.activeProvider === "ollama" && isMobile()) {
			const warningEl = containerEl.createDiv({ cls: "llm-embedding-privacy-note" });
			warningEl.createEl("small", { text: t("settings.ollamaMobileWarning") });
		}

		// モデル選択
		const activeProvider = this.plugin.providerRegistry.get(
			this.plugin.settings.activeProvider
		);
		if (activeProvider) {
			const modelSetting = new Setting(containerEl)
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
						this.syncChatViewModelSelector();
					});
				});

			// モデルリスト更新ボタン（fetchModels対応プロバイダーのみ）
			if (activeProvider.fetchModels) {
				modelSetting.addButton((btn) => {
					btn.setButtonText(t("settings.refreshModels"));
					btn.onClick(async () => {
						await this.refreshModels(activeProvider, btn);
					});
				});
			}
		}

		// セキュリティレベル選択
		new Setting(containerEl).setName(t("settings.security")).setHeading();

		const secDesc = this.plugin.secretManager.isSecretStorageAvailable()
			? t("settings.securityAvailable")
			: t("settings.securityUnavailable");

		new Setting(containerEl)
			.setName(t("settings.apiKeyStorage"))
			.setDesc(secDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption("secretstorage", t("settings.secretStorage"));
				dropdown.addOption("webcrypto", t("settings.webCrypto"));
				dropdown.setValue(this.plugin.settings.securityLevel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.securityLevel = value as SecurityLevel;
					this.plugin.secretManager.setSecurityLevel(value as SecurityLevel);
					await this.plugin.saveSettings();
					this.display();
				});
			});

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
		new Setting(containerEl).setName(t("settings.apiKeys")).setHeading();

		allProviders.filter((p) => p.requiresApiKey).forEach((provider) => {
			// OpenRouter / Ollama にはトグルを表示
			const toggleKey = this.getProviderToggleKey(provider.id);
			if (toggleKey) {
				new Setting(containerEl)
					.setName(t("settings.enableProvider", { name: provider.name }))
					.setDesc(t("settings.enableProviderDesc", { name: provider.name }))
					.addToggle((toggle) => {
						toggle.setValue(this.plugin.settings[toggleKey] as boolean);
						toggle.onChange(async (value) => {
							(this.plugin.settings[toggleKey] as boolean) = value;
							// 無効化したプロバイダーがactiveなら、最初の有効プロバイダーに切り替え
							if (!value && this.plugin.settings.activeProvider === provider.id) {
								const firstEnabled = allProviders.find((p) => this.isProviderEnabled(p.id) && p.id !== provider.id);
								if (firstEnabled) {
									this.plugin.settings.activeProvider = firstEnabled.id;
									if (firstEnabled.models.length > 0) {
										this.plugin.settings.activeModel = firstEnabled.models[0].id;
									}
								}
							}
							await this.plugin.saveSettings();
							this.display();
							this.syncChatViewModelSelector();
						});
					});
			}

			// トグルがOFFの場合、API Key入力欄を非表示
			if (!this.isProviderEnabled(provider.id)) return;

			const desc = provider.apiKeyUrl
				? `${t("settings.apiKeyInput", { name: provider.name })}  |  ${t("settings.apiKeyUrl", { url: provider.apiKeyUrl })}`
				: t("settings.apiKeyInput", { name: provider.name });
			const setting = new Setting(containerEl)
				.setName(`${provider.name} API Key`)
				.setDesc(desc);
			setting.settingEl.addClass("llm-apikey-setting");

			setting.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder(`${provider.name} API Key`);

				// 現在のAPI鍵を読み込み
				void this.plugin.secretManager.getApiKey(provider.id).then((key) => {
					if (key) text.setValue(key);
				}).catch(() => { /* ignore */ });

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

					btn.setButtonText(t("settings.apiKeyTesting"));
					btn.setDisabled(true);
					try {
						const valid = await provider.validateApiKey(apiKey);
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

		// Ollama トグル（requiresApiKey=false のため上記ループに含まれない）
		const ollamaProvider = allProviders.find((p) => p.id === "ollama");
		if (ollamaProvider) {
			new Setting(containerEl)
				.setName(t("settings.enableProvider", { name: ollamaProvider.name }))
				.setDesc(t("settings.enableProviderDesc", { name: ollamaProvider.name }))
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enableOllama);
					toggle.onChange(async (value) => {
						this.plugin.settings.enableOllama = value;
						if (!value && this.plugin.settings.activeProvider === "ollama") {
							const firstEnabled = allProviders.find((p) => this.isProviderEnabled(p.id) && p.id !== "ollama");
							if (firstEnabled) {
								this.plugin.settings.activeProvider = firstEnabled.id;
								if (firstEnabled.models.length > 0) {
									this.plugin.settings.activeModel = firstEnabled.models[0].id;
								}
							}
						}
						await this.plugin.saveSettings();
						this.display();
						this.syncChatViewModelSelector();
					});
				});
		}

		// カスタムエンドポイント設定
		new Setting(containerEl).setName(t("settings.customEndpoint")).setHeading();

		new Setting(containerEl)
			.setName(t("settings.endpointUrl"))
			.setDesc(t("settings.endpointUrlDesc"))
			.addText((text) => {
				text.inputEl.addClass("llm-settings-input-full");
				text.setPlaceholder(t("settings.endpointUrlPlaceholder"));
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
				text.setPlaceholder(t("settings.modelIdPlaceholder"));
				text.setValue(this.plugin.settings.customModelId);
				text.onChange(async (value) => {
					this.plugin.settings.customModelId = value;
					await this.plugin.saveSettings();
					this.applyCustomEndpoint();
				});
			});

		// 表示設定
		new Setting(containerEl).setName(t("settings.advanced")).setHeading();

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
						const view = leaf.view;
						if ("updateFontSize" in view && typeof view.updateFontSize === "function") {
							(view.updateFontSize as () => void)();
						}
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
				text.inputEl.addClass("llm-settings-textarea-system");
				text.setPlaceholder(t("settings.systemPromptPlaceholder"));
				text.setValue(this.plugin.settings.systemPrompt);
				text.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				});
			});

		// 「高度な設定」アコーディオン（RAG / Embedding）
		const advancedDetailsEl = containerEl.createEl("details", {
			cls: "llm-settings-advanced-details",
		});
		advancedDetailsEl.createEl("summary", {
			text: t("settings.advancedAccordion"),
			cls: "llm-settings-advanced-summary",
		});

		// RAG設定
		new Setting(advancedDetailsEl).setName(t("settings.rag")).setHeading();

		new Setting(advancedDetailsEl)
			.setName(t("settings.ragEnabled"))
			.setDesc(t("settings.ragEnabledDesc"))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.ragEnabled);
				toggle.onChange(async (value) => {
					this.plugin.settings.ragEnabled = value;
					await this.plugin.saveSettings();
					if (value) {
						await this.plugin.initializeRAG();
					} else {
						void this.plugin.destroyRAG();
					}
					this.display();
				});
			});

		if (this.plugin.settings.ragEnabled) {
			new Setting(advancedDetailsEl)
				.setName(t("settings.ragTopK"))
				.setDesc(t("settings.ragTopKDesc"))
				.addSlider((slider) => {
					slider.setLimits(1, 20, 1);
					slider.setValue(this.plugin.settings.ragTopK);
					slider.setDynamicTooltip();
					slider.onChange(async (value) => {
						this.plugin.settings.ragTopK = value;
						await this.plugin.saveSettings();
						this.plugin.ragManager?.updateSettings({ topK: value });
					});
				});

			new Setting(advancedDetailsEl)
				.setName(t("settings.ragMinScore"))
				.setDesc(t("settings.ragMinScoreDesc"))
				.addSlider((slider) => {
					slider.setLimits(0, 1, 0.05);
					slider.setValue(this.plugin.settings.ragMinScore);
					slider.setDynamicTooltip();
					slider.onChange(async (value) => {
						this.plugin.settings.ragMinScore = value;
						await this.plugin.saveSettings();
						this.plugin.ragManager?.updateSettings({ minScore: value });
					});
				});

			new Setting(advancedDetailsEl)
				.setName(t("settings.ragChunkStrategy"))
				.setDesc(t("settings.ragChunkStrategyDesc"))
				.addDropdown((dropdown) => {
					dropdown.addOption("section", t("settings.ragChunkSection"));
					dropdown.addOption("paragraph", t("settings.ragChunkParagraph"));
					dropdown.addOption("fixed", t("settings.ragChunkFixed"));
					dropdown.setValue(this.plugin.settings.ragChunkStrategy);
					dropdown.onChange(async (value) => {
						this.plugin.settings.ragChunkStrategy = value as "section" | "paragraph" | "fixed";
						await this.plugin.saveSettings();
						this.plugin.ragManager?.updateSettings({ chunkStrategy: value as "section" | "paragraph" | "fixed" });
					});
				});

			new Setting(advancedDetailsEl)
				.setName(t("settings.ragChunkMaxTokens"))
				.setDesc(t("settings.ragChunkMaxTokensDesc"))
				.addSlider((slider) => {
					slider.setLimits(128, 2048, 64);
					slider.setValue(this.plugin.settings.ragChunkMaxTokens);
					slider.setDynamicTooltip();
					slider.onChange(async (value) => {
						this.plugin.settings.ragChunkMaxTokens = value;
						await this.plugin.saveSettings();
						this.plugin.ragManager?.updateSettings({ chunkMaxTokens: value });
					});
				});

			new Setting(advancedDetailsEl)
				.setName(t("settings.ragExcludeFolders"))
				.setDesc(t("settings.ragExcludeFoldersDesc"))
				.addText((text) => {
					text.inputEl.addClass("llm-settings-input-full");
					text.setPlaceholder(t("settings.ragExcludeFoldersPlaceholder"));
					text.setValue(this.plugin.settings.ragExcludeFolders);
					text.onChange(async (value) => {
						this.plugin.settings.ragExcludeFolders = value;
						await this.plugin.saveSettings();
						this.plugin.ragManager?.updateSettings({ excludeFolders: value });
					});
				});

			// インデックス構築ボタン + 統計情報
			const indexSetting = new Setting(advancedDetailsEl);

			if (this.plugin.ragManager?.isBuilt()) {
				const stats = this.plugin.ragManager.getStats();
				indexSetting.setName(t("settings.ragIndexStats", {
					files: stats.indexedFiles,
					chunks: stats.totalChunks,
				}));
				indexSetting.addButton((btn) => {
					btn.setButtonText(t("settings.ragRebuildIndex"));
					btn.onClick(async () => {
						await this.buildRAGIndex(btn);
					});
				});
				indexSetting.addButton((btn) => {
					btn.setButtonText(t("settings.ragClearIndex"));
					btn.setWarning();
					btn.onClick(() => {
						this.plugin.ragManager?.clearIndex();
						new Notice(t("notice.ragIndexCleared"));
						this.display();
					});
				});
			} else {
				indexSetting.setName(t("settings.ragIndexNotBuilt"));
				indexSetting.addButton((btn) => {
					btn.setButtonText(t("settings.ragBuildIndex"));
					btn.setCta();
					btn.onClick(async () => {
						await this.buildRAGIndex(btn);
					});
				});
			}

			// --- Embedding検索セクション ---
			new Setting(advancedDetailsEl).setName(t("settings.ragEmbedding")).setHeading();

			new Setting(advancedDetailsEl)
				.setName(t("settings.ragEmbeddingEnabled"))
				.setDesc(t("settings.ragEmbeddingEnabledDesc"))
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.ragEmbeddingEnabled);
					toggle.onChange(async (value) => {
						this.plugin.settings.ragEmbeddingEnabled = value;
						await this.plugin.saveSettings();
						if (value && this.plugin.ragManager) {
							await this.plugin.ragManager.initializeEmbedding(
								this.plugin.embeddingProviderRegistry,
								this.plugin.settings.ragEmbeddingProvider,
								this.plugin.settings.ragEmbeddingModel,
								this.plugin.settings.ragEmbeddingCompactMode,
							);
						}
						this.display();
					});
				});

			if (this.plugin.settings.ragEmbeddingEnabled) {
				// プライバシー警告
				const privacyNote = advancedDetailsEl.createDiv({ cls: "llm-embedding-privacy-note" });
				privacyNote.createEl("small", { text: t("settings.ragEmbeddingEnabledDesc") });

				// Embeddingプロバイダー選択
				const embeddingProviders = this.plugin.embeddingProviderRegistry.getAll();
				new Setting(advancedDetailsEl)
					.setName(t("settings.ragEmbeddingProvider"))
					.setDesc(t("settings.ragEmbeddingProviderDesc"))
					.addDropdown((dropdown) => {
						for (const p of embeddingProviders) {
							dropdown.addOption(p.id, p.name);
						}
						dropdown.setValue(this.plugin.settings.ragEmbeddingProvider);
						dropdown.onChange(async (value) => {
							this.plugin.settings.ragEmbeddingProvider = value;
							const provider = this.plugin.embeddingProviderRegistry.get(value);
							if (provider && provider.models.length > 0) {
								this.plugin.settings.ragEmbeddingModel = provider.models[0].id;
							}
							await this.plugin.saveSettings();
							this.display();
						});
					});

				// プロバイダーTip
				const selectedProviderId = this.plugin.settings.ragEmbeddingProvider;
				if (selectedProviderId === "gemini") {
					const tipEl = advancedDetailsEl.createDiv({ cls: "llm-rag-note" });
					tipEl.createEl("small", { text: t("settings.ragEmbeddingGeminiTip") });
				} else if (selectedProviderId === "ollama") {
					const tipEl = advancedDetailsEl.createDiv({ cls: "llm-rag-note" });
					tipEl.createEl("small", { text: t("settings.ragEmbeddingOllamaTip") });
					// モバイル警告: localhostはスマホ自身を指す
					const mobileTipEl = advancedDetailsEl.createDiv({ cls: "llm-embedding-privacy-note" });
					mobileTipEl.createEl("small", { text: t("settings.ragEmbeddingOllamaMobileTip") });
				}

				// Embeddingモデル選択
				const selectedProvider = this.plugin.embeddingProviderRegistry.get(selectedProviderId);
				if (selectedProvider && selectedProvider.models.length > 0) {
					new Setting(advancedDetailsEl)
						.setName(t("settings.ragEmbeddingModel"))
						.addDropdown((dropdown) => {
							for (const m of selectedProvider.models) {
								dropdown.addOption(m.id, `${m.name} (${m.dimensions}d)`);
							}
							dropdown.setValue(this.plugin.settings.ragEmbeddingModel);
							dropdown.onChange(async (value) => {
								this.plugin.settings.ragEmbeddingModel = value;
								await this.plugin.saveSettings();
								this.display();
							});
						});
				}

				// APIキー設定（Ollama以外）
				if (selectedProvider && selectedProvider.requiresApiKey) {
					new Setting(advancedDetailsEl)
						.setName(t("settings.ragEmbeddingUseSharedKey"))
						.setDesc(t("settings.ragEmbeddingUseSharedKeyDesc"))
						.addToggle((toggle) => {
							toggle.setValue(this.plugin.settings.ragEmbeddingUseSharedKey);
							toggle.onChange(async (value) => {
								this.plugin.settings.ragEmbeddingUseSharedKey = value;
								await this.plugin.saveSettings();
								this.display();
							});
						});

					// 独立APIキー入力（共有キー無効時のみ）
					if (!this.plugin.settings.ragEmbeddingUseSharedKey) {
						const keyId = `embedding-${selectedProviderId}`;
						const keySetting = new Setting(advancedDetailsEl)
							.setName(t("settings.ragEmbeddingApiKey"));
						keySetting.addText((text) => {
							text.inputEl.type = "password";
							text.setPlaceholder(`${selectedProvider.name} API Key`);
							void this.plugin.secretManager.getApiKey(keyId).then((key) => {
								if (key) text.setValue(key);
							}).catch(() => { /* ignore */ });
							text.onChange(async (value) => {
								if (value) {
									try {
										await this.plugin.secretManager.saveApiKey(keyId, value);
									} catch (err) {
										const msg = err instanceof Error ? err.message : String(err);
										new Notice(t("notice.apiKeySaveFailed", { message: msg }));
									}
								}
							});
						});
					}
				}

				// 省メモリモード
				if (selectedProvider && selectedProviderId !== "ollama") {
					const modelInfo = selectedProvider.models.find(
						(m) => m.id === this.plugin.settings.ragEmbeddingModel,
					);
					if (modelInfo?.reducedDimensions) {
						new Setting(advancedDetailsEl)
							.setName(t("settings.ragEmbeddingCompactMode"))
							.setDesc(t("settings.ragEmbeddingCompactModeDesc"))
							.addToggle((toggle) => {
								toggle.setValue(this.plugin.settings.ragEmbeddingCompactMode);
								toggle.onChange(async (value) => {
									this.plugin.settings.ragEmbeddingCompactMode = value;
									await this.plugin.saveSettings();
								});
							});
					}
				}

				// コスト見積もり
				if (selectedProvider) {
					const modelInfo = selectedProvider.models.find(
						(m) => m.id === this.plugin.settings.ragEmbeddingModel,
					);
					const stats = this.plugin.ragManager?.getStats();
					const totalChunks = stats?.totalChunks ?? 0;
					const avgTokens = Math.floor(this.plugin.settings.ragChunkMaxTokens / 2);
					const costEl = advancedDetailsEl.createDiv({ cls: "llm-embedding-cost" });

					if (modelInfo?.costPer1MTokens === 0) {
						costEl.createEl("small", { text: t("settings.ragEmbeddingCostFree") });
					} else if (totalChunks > 0 && modelInfo?.costPer1MTokens) {
						const cost = ((totalChunks * avgTokens) / 1_000_000) * modelInfo.costPer1MTokens;
						costEl.createEl("small", {
							text: t("settings.ragEmbeddingCostEstimate", {
								chunks: totalChunks,
								tokensPerChunk: avgTokens,
								cost: cost.toFixed(4),
							}),
						});
					}
				}

				// バックグラウンド自動Embedding
				new Setting(advancedDetailsEl)
					.setName(t("settings.ragEmbeddingAutoIndex"))
					.setDesc(t("settings.ragEmbeddingAutoIndexDesc"))
					.addToggle((toggle) => {
						toggle.setValue(this.plugin.settings.ragAutoIndex);
						toggle.onChange(async (value) => {
							this.plugin.settings.ragAutoIndex = value;
							await this.plugin.saveSettings();
						});
					});

				// Embeddingインデックス構築ボタン + 統計
				const embeddingIndexSetting = new Setting(advancedDetailsEl);
				const embStats = this.plugin.ragManager?.getStats();
				if (embStats && embStats.embeddingIndexed > 0) {
					const size = this.plugin.formatBytes(embStats.embeddingStorageBytes);
					embeddingIndexSetting.setName(t("settings.ragEmbeddingIndexStats", {
						vectors: embStats.embeddingIndexed,
						size,
						model: embStats.embeddingModel ?? "",
					}));
					embeddingIndexSetting.addButton((btn) => {
						btn.setButtonText(t("settings.ragBuildEmbeddingIndex"));
						btn.onClick(async () => {
							await this.buildEmbeddingIndex(btn);
						});
					});
					embeddingIndexSetting.addButton((btn) => {
						btn.setButtonText(t("settings.ragClearEmbeddingIndex"));
						btn.setWarning();
						btn.onClick(async () => {
							await this.plugin.ragManager?.clearEmbeddingIndex();
							new Notice(t("notice.ragIndexCleared"));
							this.display();
						});
					});
				} else {
					embeddingIndexSetting.setName(t("settings.ragEmbeddingIndexNotBuilt"));
					embeddingIndexSetting.addButton((btn) => {
						btn.setButtonText(t("settings.ragBuildEmbeddingIndex"));
						btn.setCta();
						btn.onClick(async () => {
							await this.buildEmbeddingIndex(btn);
						});
					});
				}

				// 累積トークン数表示
				if (embStats && embStats.embeddingTotalTokensUsed > 0) {
					const modelInfo = selectedProvider?.models.find(
						(m) => m.id === this.plugin.settings.ragEmbeddingModel,
					);
					const costRate = modelInfo?.costPer1MTokens ?? 0;
					const cost = (embStats.embeddingTotalTokensUsed / 1_000_000) * costRate;
					const tokenEl = advancedDetailsEl.createDiv({ cls: "llm-embedding-cost" });
					tokenEl.createEl("small", {
						text: t("settings.ragEmbeddingTotalTokens", {
							tokens: embStats.embeddingTotalTokensUsed.toLocaleString(),
							cost: cost.toFixed(4),
						}),
					});
				}
			}
		}

		// バージョン情報
		const versionEl = containerEl.createEl("div", {
			cls: "llm-settings-version",
		});
		versionEl.createEl("small", {
			text: `${DISPLAY_NAME} v${this.plugin.manifest.version}`,
		});
	}

	private async refreshModels(provider: LLMProvider, btn: { setButtonText(text: string): void; setDisabled(disabled: boolean): void }): Promise<void> {
		if (!provider.fetchModels) return;

		// API鍵の取得（必要な場合）
		let apiKey = "";
		if (provider.requiresApiKey) {
			const key = await this.plugin.secretManager.getApiKey(provider.id);
			if (!key) {
				new Notice(t("notice.modelsRefreshNoKey"));
				return;
			}
			apiKey = key;
		}

		btn.setButtonText(t("settings.refreshingModels"));
		btn.setDisabled(true);
		try {
			const models = await provider.fetchModels(apiKey);
			provider.models = models;
			new Notice(t("notice.modelsRefreshed", { count: models.length }));
			this.display(); // UI再描画
			this.syncChatViewModelSelector();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(t("notice.modelsRefreshFailed", { message: msg }), 8000);
		} finally {
			btn.setButtonText(t("settings.refreshModels"));
			btn.setDisabled(false);
		}
	}

	private syncChatViewModelSelector(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
		for (const leaf of leaves) {
			const view = leaf.view;
			if ("updateModelSelector" in view && typeof view.updateModelSelector === "function") {
				(view.updateModelSelector as () => void)();
			}
		}
	}

	private async buildRAGIndex(btn: { setButtonText(text: string): void; setDisabled(disabled: boolean): void }): Promise<void> {
		if (!this.plugin.ragManager) {
			await this.plugin.initializeRAG();
		}
		if (!this.plugin.ragManager) return;

		btn.setButtonText(t("settings.ragBuildingIndex"));
		btn.setDisabled(true);
		try {
			await this.plugin.ragManager.buildIndex((current, total) => {
				if (current % 100 === 0 || current === total) {
					btn.setButtonText(`${t("settings.ragBuildingIndex")} (${current}/${total})`);
				}
			});
			const stats = this.plugin.ragManager.getStats();
			new Notice(t("notice.ragIndexComplete", {
				files: stats.indexedFiles,
				chunks: stats.totalChunks,
			}));
			this.display();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`RAG index build failed: ${msg}`, 8000);
		} finally {
			btn.setButtonText(t("settings.ragBuildIndex"));
			btn.setDisabled(false);
		}
	}

	private async buildEmbeddingIndex(btn: { setButtonText(text: string): void; setDisabled(disabled: boolean): void }): Promise<void> {
		if (!this.plugin.ragManager) {
			await this.plugin.initializeRAG();
		}
		if (!this.plugin.ragManager) return;

		// Embedding初期化（未初期化の場合）
		if (!this.plugin.ragManager.isEmbeddingEnabled()) {
			await this.plugin.ragManager.initializeEmbedding(
				this.plugin.embeddingProviderRegistry,
				this.plugin.settings.ragEmbeddingProvider,
				this.plugin.settings.ragEmbeddingModel,
				this.plugin.settings.ragEmbeddingCompactMode,
			);
		}

		// TF-IDFインデックスがまだなら先に構築
		if (!this.plugin.ragManager.isBuilt()) {
			btn.setButtonText(t("settings.ragBuildingIndex"));
			btn.setDisabled(true);
			await this.plugin.ragManager.buildIndex();
		}

		// Embedding用APIキー取得
		const providerId = this.plugin.settings.ragEmbeddingProvider;
		const keyId = this.plugin.settings.ragEmbeddingUseSharedKey ? providerId : `embedding-${providerId}`;
		const apiKey = await this.plugin.secretManager.getApiKey(keyId) ?? "";
		if (!apiKey && providerId !== "ollama") {
			new Notice(t("error.apiKeyNotSet", { name: providerId }));
			btn.setDisabled(false);
			return;
		}

		btn.setButtonText(t("settings.ragBuildingEmbeddingIndex"));
		btn.setDisabled(true);
		try {
			await this.plugin.ragManager.buildEmbeddingIndex(apiKey, (current, total) => {
				if (current % 50 === 0 || current === total) {
					btn.setButtonText(`${t("settings.ragBuildingEmbeddingIndex")} (${current}/${total})`);
				}
			});
			const stats = this.plugin.ragManager.getStats();
			const size = this.plugin.formatBytes(stats.embeddingStorageBytes);
			new Notice(t("notice.ragEmbeddingComplete", { vectors: stats.embeddingIndexed, size }));
			this.display();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(t("notice.ragEmbeddingFailed", { error: msg }), 8000);
		} finally {
			btn.setButtonText(t("settings.ragBuildEmbeddingIndex"));
			btn.setDisabled(false);
		}
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

	/** トグル対象プロバイダーの設定キーを返す。対象外なら null */
	private getProviderToggleKey(providerId: string): keyof import("../constants").LLMAssistantSettings | null {
		if (providerId === "openrouter") return "enableOpenRouter";
		if (providerId === "ollama") return "enableOllama";
		return null;
	}

	/** プロバイダーが有効かどうか。トグル対象外は常に有効 */
	isProviderEnabled(providerId: string): boolean {
		if (providerId === "openrouter") return this.plugin.settings.enableOpenRouter;
		if (providerId === "ollama") return this.plugin.settings.enableOllama;
		return true;
	}
}
