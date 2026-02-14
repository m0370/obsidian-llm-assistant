import { Menu, Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CHAT, DEFAULT_SETTINGS, DISPLAY_NAME, getQuickActions } from "./constants";
import type { LLMAssistantSettings } from "./constants";
import { ChatView } from "./ui/ChatView";
import { LLMAssistantSettingTab } from "./settings/SettingsTab";
import { ProviderRegistry } from "./llm/ProviderRegistry";
import { CustomEndpointProvider } from "./llm/CustomEndpointProvider";
import { VaultReader } from "./vault/VaultReader";
import { SecretManager } from "./security/SecretManager";
import { resolveLocale, setLocale, t } from "./i18n";

export default class LLMAssistantPlugin extends Plugin {
	settings: LLMAssistantSettings = DEFAULT_SETTINGS;
	providerRegistry: ProviderRegistry = new ProviderRegistry();
	vaultReader: VaultReader;
	secretManager: SecretManager;

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

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
