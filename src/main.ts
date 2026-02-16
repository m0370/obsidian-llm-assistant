import { Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHAT, DEFAULT_SETTINGS, DISPLAY_NAME, getQuickActions } from "./constants";
import type { LLMAssistantSettings } from "./constants";
import { ChatView } from "./ui/ChatView";
import { LLMAssistantSettingTab } from "./settings/SettingsTab";
import { ProviderRegistry } from "./llm/ProviderRegistry";
import { CustomEndpointProvider } from "./llm/CustomEndpointProvider";
import { VaultReader } from "./vault/VaultReader";
import { SecretManager, type SecurityLevel } from "./security/SecretManager";
import { resolveLocale, setLocale, t } from "./i18n";
import type { RAGManager } from "./rag/RAGManager";
import { EmbeddingProviderRegistry } from "./rag/EmbeddingProvider";

export default class LLMAssistantPlugin extends Plugin {
	settings: LLMAssistantSettings = DEFAULT_SETTINGS;
	providerRegistry: ProviderRegistry = new ProviderRegistry();
	embeddingProviderRegistry: EmbeddingProviderRegistry = new EmbeddingProviderRegistry();
	vaultReader: VaultReader;
	secretManager: SecretManager;
	ragManager: RAGManager | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// i18n 初期化
		setLocale(resolveLocale(this.settings.language));

		this.vaultReader = new VaultReader(this.app);
		this.secretManager = new SecretManager(
			this.app,
			this.settings.securityLevel,
			async (data) => { await this.saveData(data); },
			async () => { return await this.loadData(); },
		);

		// plaintext からの移行（v0.1.3で廃止）
		await this.migratePlaintextKeys();

		// カスタムエンドポイント設定を反映
		const customProvider = this.providerRegistry.get("custom") as CustomEndpointProvider | undefined;
		if (customProvider && this.settings.customEndpoint) {
			customProvider.configure(this.settings.customEndpoint, this.settings.customModelId);
		}

		// ChatViewの登録
		this.registerView(VIEW_TYPE_CHAT, (leaf: WorkspaceLeaf) => {
			return new ChatView(leaf, this);
		});

		// リボンアイコン
		this.addRibbonIcon("message-square", DISPLAY_NAME, () => {
			this.activateChatView();
		});

		// コマンドパレット
		this.addCommand({
			id: "open-chat-view",
			name: t("command.openChat"),
			callback: () => {
				this.activateChatView();
			},
		});

		// 設定タブ
		this.addSettingTab(new LLMAssistantSettingTab(this.app, this));

		// RAGの初期化（有効時のみ動的インポート）+ 起動時自動インデックス構築
		if (this.settings.ragEnabled) {
			await this.initializeRAG();
			// 起動後にバックグラウンドでインデックス自動構築（UIをブロックしない）
			if (this.ragManager) {
				setTimeout(async () => {
					if (!this.ragManager || this.ragManager.isBuilt()) return;
					await this.ragManager.buildIndex((current, total) => {
						if (current === total) {
							new Notice(t("notice.ragIndexComplete", { files: total, chunks: this.ragManager?.getStats().totalChunks ?? 0 }));
						}
					});
				}, 2000); // 起動2秒後に開始
			}
		}

		// Embedding初期化（RAG有効 + Embedding有効時のみ）
		if (this.settings.ragEnabled && this.settings.ragEmbeddingEnabled && this.ragManager) {
			await this.ragManager.initializeEmbedding(
				this.embeddingProviderRegistry,
				this.settings.ragEmbeddingProvider,
				this.settings.ragEmbeddingModel,
				this.settings.ragEmbeddingCompactMode,
			);
			// VectorStoreをバックグラウンドで復元
			this.ragManager.loadVectorStore();
		}

		// RAGインデックス構築コマンド
		this.addCommand({
			id: "build-rag-index",
			name: t("command.buildRagIndex"),
			callback: async () => {
				if (!this.ragManager) {
					if (!this.settings.ragEnabled) {
						new Notice(t("notice.ragNotEnabled"));
						return;
					}
					await this.initializeRAG();
				}
				if (!this.ragManager) return;

				new Notice(t("notice.ragIndexBuilding", { current: 0, total: "..." }));
				await this.ragManager.buildIndex((current, total) => {
					if (current % 50 === 0 || current === total) {
						new Notice(t("notice.ragIndexBuilding", { current, total }));
					}
				});
				const stats = this.ragManager.getStats();
				new Notice(t("notice.ragIndexComplete", {
					files: stats.indexedFiles,
					chunks: stats.totalChunks,
				}));
			},
		});

		// Embeddingインデックス構築コマンド
		this.addCommand({
			id: "build-embedding-index",
			name: t("command.buildEmbeddingIndex"),
			callback: async () => {
				if (!this.settings.ragEmbeddingEnabled) {
					new Notice(t("notice.ragNotEnabled"));
					return;
				}
				if (!this.ragManager) {
					await this.initializeRAG();
				}
				if (!this.ragManager) return;

				// Embedding初期化（未初期化の場合）
				if (!this.ragManager.isEmbeddingEnabled()) {
					await this.ragManager.initializeEmbedding(
						this.embeddingProviderRegistry,
						this.settings.ragEmbeddingProvider,
						this.settings.ragEmbeddingModel,
						this.settings.ragEmbeddingCompactMode,
					);
				}

				// TF-IDFインデックスがまだなら先に構築
				if (!this.ragManager.isBuilt()) {
					await this.ragManager.buildIndex();
				}

				// Embedding用APIキー取得
				const providerId = this.settings.ragEmbeddingProvider;
				const keyId = this.settings.ragEmbeddingUseSharedKey ? providerId : `embedding-${providerId}`;
				const apiKey = await this.secretManager.getApiKey(keyId) ?? "";
				if (!apiKey && providerId !== "ollama") {
					new Notice(t("error.apiKeyNotSet", { name: providerId }));
					return;
				}

				new Notice(t("notice.ragEmbeddingBuilding", { current: 0, total: "..." }));
				try {
					await this.ragManager.buildEmbeddingIndex(apiKey, (current, total) => {
						if (current % 100 === 0 || current === total) {
							new Notice(t("notice.ragEmbeddingBuilding", { current, total }));
						}
					});
					const stats = this.ragManager.getStats();
					const size = this.formatBytes(stats.embeddingStorageBytes);
					new Notice(t("notice.ragEmbeddingComplete", { vectors: stats.embeddingIndexed, size }));
				} catch (e) {
					new Notice(t("notice.ragEmbeddingFailed", { error: (e as Error).message }));
				}
			},
		});

		// クイックアクション（エディタコンテキストメニュー）
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu, editor) => {
				const selection = editor.getSelection();
				if (!selection) return;

				menu.addSeparator();
				for (const action of getQuickActions()) {
					menu.addItem((item) => {
						item.setTitle(`LLM: ${action.name}`)
							.setIcon("message-square")
							.onClick(async () => {
								const prompt = action.prompt + selection;
								await this.activateChatView();
								const chatLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
								if (chatLeaves.length > 0) {
									const chatView = chatLeaves[0].view as ChatView;
									chatView.sendMessage(prompt);
								}
							});
					});
				}
			})
		);
	}

	async onunload(): Promise<void> {
		// RAGManagerのクリーンアップ（VectorStore永続化含む）
		if (this.ragManager) {
			await this.ragManager.destroy();
			this.ragManager = null;
		}
		// マスターパスワードをクリア
		this.secretManager.clearMasterPassword();
		// ChatViewの全インスタンスをデタッチ
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
	}

	async activateChatView(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_CHAT,
				active: true,
			});
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * plaintext で保存された API鍵を secretstorage/webcrypto に移行し、
	 * data.json から plaintextKeys フィールドを物理削除する。
	 */
	private async migratePlaintextKeys(): Promise<void> {
		const data = (await this.loadData()) as Record<string, unknown> | null;
		if (!data?.plaintextKeys) return;

		const plaintextKeys = data.plaintextKeys as Record<string, string>;
		const providers = Object.keys(plaintextKeys).filter(
			(k) => typeof plaintextKeys[k] === "string" && plaintextKeys[k].length > 0
		);
		if (providers.length === 0) {
			// 空の plaintextKeys を削除
			delete data.plaintextKeys;
			await this.saveData(data);
			return;
		}

		const targetLevel: SecurityLevel = this.secretManager.isSecretStorageAvailable()
			? "secretstorage" : "webcrypto";

		this.settings.securityLevel = targetLevel;
		this.secretManager.setSecurityLevel(targetLevel);

		let migrated = 0;
		for (const providerId of providers) {
			try {
				await this.secretManager.saveApiKey(providerId, plaintextKeys[providerId]);
				migrated++;
			} catch {
				// webcrypto でマスターパスワード未設定の場合などはスキップ
			}
		}

		// plaintextKeys フィールドを物理削除
		delete data.plaintextKeys;
		if (data.securityLevel === "plaintext") {
			data.securityLevel = targetLevel;
		}
		await this.saveData(data);
		await this.saveSettings();

		if (migrated > 0) {
			new Notice(`API keys migrated from plaintext to ${targetLevel} (${migrated} keys)`);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// plaintext が設定に残っていた場合のフォールバック
		if ((this.settings.securityLevel as string) === "plaintext") {
			this.settings.securityLevel = "secretstorage";
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * RAGManagerの初期化（動的インポート）
	 */
	async initializeRAG(): Promise<void> {
		if (this.ragManager) return;
		const { RAGManager } = await import("./rag/RAGManager");
		this.ragManager = new RAGManager(this.app, this.vaultReader, {
			topK: this.settings.ragTopK,
			minScore: this.settings.ragMinScore,
			chunkStrategy: this.settings.ragChunkStrategy,
			chunkMaxTokens: this.settings.ragChunkMaxTokens,
			excludeFolders: this.settings.ragExcludeFolders,
		});

		// Vaultイベントリスナーを登録（自動増分更新）
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.ragManager?.debouncedUpdate(file.path);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && file.extension === "md") {
					this.ragManager?.removeFileFromIndex(oldPath);
					this.ragManager?.debouncedUpdate(file.path);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.ragManager?.removeFileFromIndex(file.path);
				}
			}),
		);
	}

	/**
	 * RAGManagerの破棄
	 */
	async destroyRAG(): Promise<void> {
		if (this.ragManager) {
			await this.ragManager.destroy();
			this.ragManager = null;
		}
	}

	/**
	 * バイト数を人間が読みやすい形式に変換
	 */
	formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
	}
}
