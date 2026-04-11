import { ItemView, MarkdownRenderer, MarkdownView, Menu, Notice, WorkspaceLeaf, setIcon, TFile } from "obsidian";
import "../obsidian.d";
import { VIEW_TYPE_CHAT, DISPLAY_NAME } from "../constants";
import type LLMAssistantPlugin from "../main";
import type { LLMProvider, Message, ToolDefinition, ToolResult } from "../llm/LLMProvider";
import { sendRequest, RateLimitError } from "../llm/streaming";
import { NoteContext } from "../vault/NoteContext";
import { ConversationManager, type Conversation } from "./ConversationManager";
import { ConversationListModal } from "./ConversationListModal";
import { FilePickerModal } from "./FilePickerModal";
import { ChatInput } from "./ChatInput";
import { ChatMessage, type MessageData } from "./ChatMessage";
import { setupMobileViewportHandler } from "./responsive";
import { t } from "../i18n";
import { estimateTokens } from "../utils/TokenCounter";

/** Anthropic Tool Use API 用のツール定義 */
const VAULT_TOOLS: ToolDefinition[] = [
	{
		name: "vault_read",
		description: "Read the content of a file from the user's Obsidian vault. Use this to access note contents when the user asks about a specific file, or when you need to read a file before editing it.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The file path relative to the vault root (e.g. 'Notes/my-note.md')",
				},
			},
			required: ["path"],
		},
	},
	{
		name: "vault_write",
		description: "Write or update a file in the user's Obsidian vault. Always read the file first with vault_read, then propose the full modified content. The user will see a diff and can approve or reject.",
		input_schema: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path relative to vault root" },
				content: { type: "string", description: "Complete new content for the file" },
			},
			required: ["path", "content"],
		},
	},
];

/** vault_list ツール定義（常時利用可能） */
const VAULT_LIST_TOOL: ToolDefinition = {
	name: "vault_list",
	description: "List files and folders in the user's Obsidian vault. Use this to explore vault structure, find recently modified files, locate empty notes, or browse folder contents. Returns file metadata (path, size, modification time) without file contents — use vault_read to read specific files.",
	input_schema: {
		type: "object",
		properties: {
			folder: { type: "string", description: "Folder path to list (default: vault root)" },
			recursive: { type: "boolean", description: "Include subfolders (default: true)" },
			sort_by: { type: "string", enum: ["mtime", "ctime", "name", "size"], description: "Sort order (default: mtime)" },
			limit: { type: "number", description: "Max items to return, 1-200 (default: 50)" },
			offset: { type: "number", description: "Skip first N items for pagination (default: 0)" },
			extensions: { type: "string", description: "File extensions to include, comma-separated (default: md)" },
			include_folders: { type: "boolean", description: "Include folders in results (default: false)" },
			size_filter: { type: "string", enum: ["empty", "small", "large"], description: "Filter by size: empty (0 bytes), small (<1KB), large (>=100KB)" },
		},
		required: [],
	},
};

/** vault_search ツール定義（RAG有効時のみ追加） */
const VAULT_SEARCH_TOOL: ToolDefinition = {
	name: "vault_search",
	description: "Search the user's entire Obsidian vault for notes related to a topic. Returns the most relevant note sections. Use this when you need to find information across the vault.",
	input_schema: {
		type: "object",
		properties: {
			query: { type: "string", description: "Search query" },
			topK: { type: "number", description: "Number of results (default: 5, max: 10)" },
		},
		required: ["query"],
	},
};

/** dataview_query ツール定義（Dataviewプラグイン有効時のみ追加） */
const DATAVIEW_QUERY_TOOL: ToolDefinition = {
	name: "dataview_query",
	description: "Execute a Dataview Query Language (DQL) query against the vault. Requires the Dataview community plugin. Use for advanced queries: filtering by tags, frontmatter, dates, aggregations, task lists, etc. For simple file listing, prefer vault_list instead.",
	input_schema: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "DQL query string (e.g. 'TABLE file.mtime FROM #project WHERE status = \"active\" SORT file.mtime DESC')",
			},
		},
		required: ["query"],
	},
};

interface EditHunk {
	oldText: string;
	newText: string;
	displayDiff: Array<{type: "same" | "add" | "remove" | "separator", line: string}>;
	applied: boolean;
}

export class ChatView extends ItemView {
	plugin: LLMAssistantPlugin;
	private chatOutput: HTMLElement;
	private chatInput: ChatInput;
	private headerEl: HTMLElement;
	private modelSelector: HTMLSelectElement;
	private contextBar: HTMLElement;
	private noteContext: NoteContext;
	private conversationManager: ConversationManager;
	private currentConversationId: string | null = null;
	private messages: MessageData[] = [];
	private isGenerating = false;
	private viewportCleanup: { destroy: () => void } | null = null;
	private scrollToBottomBtn: HTMLElement | null = null;
	private abortController: AbortController | null = null;
	private regenerateBtn: HTMLElement | null = null;
	private welcomeEl: HTMLElement | null = null;
	private currentScope: "active" | "local" | "vault" = "active";
	private scopeButtons: Map<"active" | "local" | "vault", HTMLButtonElement> = new Map();

	constructor(leaf: WorkspaceLeaf, plugin: LLMAssistantPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CHAT;
	}

	getDisplayText(): string {
		return DISPLAY_NAME;
	}

	getIcon(): string {
		return "message-square";
	}

	onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("llm-assistant-view");
		container.addClass(`llm-font-${this.plugin.settings.fontSize}`);

		// 初期化
		this.noteContext = new NoteContext(this.plugin.vaultReader);
		this.conversationManager = new ConversationManager(this.app);
		this.currentScope = this.plugin.settings.contextScope ?? "active";

		// ヘッダー
		this.headerEl = container.createDiv({ cls: "llm-header" });
		this.buildHeader();

		// チャット出力エリア
		this.chatOutput = container.createDiv({ cls: "llm-chat-output" });

		// ウェルカムメッセージ（メッセージ0件時に表示）
		this.showWelcome();

		// 「最新へ」スクロールボタン
		this.scrollToBottomBtn = container.createDiv({ cls: "llm-scroll-to-bottom is-hidden" });
		setIcon(this.scrollToBottomBtn, "arrow-down");
		this.scrollToBottomBtn.addEventListener("click", () => {
			this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
		});
		this.chatOutput.addEventListener("scroll", () => {
			const { scrollTop, scrollHeight, clientHeight } = this.chatOutput;
			const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
			this.scrollToBottomBtn?.toggleClass("is-hidden", isNearBottom);
		});

		// 内部リンク（[[wikilink]]）のクリックハンドラ
		this.chatOutput.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			const link = target.closest("a.internal-link");
			if (link) {
				event.preventDefault();
				const href = link.getAttribute("data-href") || link.textContent;
				if (href) {
					void this.app.workspace.openLinkText(href, "", false);
				}
			}
		});

		// ボトムエリア（コンテキスト + 入力）
		const bottomArea = container.createDiv({ cls: "llm-bottom-area" });

		// コンテキストバー（添付ノート表示）
		this.contextBar = bottomArea.createDiv({ cls: "llm-context-bar is-hidden" });

		// スコープバー（コンテキストバーと入力エリアの間）
		this.buildScopeBar(bottomArea);

		// 入力エリア（textarea + Sendボタンが1行に統合）
		const inputContainer = bottomArea.createDiv({ cls: "llm-chat-input-container" });
		this.chatInput = new ChatInput(inputContainer, (text: string) => {
			void this.handleSend(text);
		});

		// フォーカスベースのキーボード対応（モバイル）
		this.viewportCleanup = setupMobileViewportHandler(container);

		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.viewportCleanup?.destroy();
		this.viewportCleanup = null;
		this.chatInput?.destroy();
		this.contentEl.empty();

		return Promise.resolve();
	}

	private buildHeader(): void {
		// モデルセレクタ
		const selectorWrapper = this.headerEl.createDiv({ cls: "llm-model-selector-wrapper" });
		this.modelSelector = selectorWrapper.createEl("select", { cls: "llm-model-selector" });
		this.populateModelSelector();
		this.modelSelector.addEventListener("change", () => {
			const [providerId, modelId] = this.modelSelector.value.split("::");
			this.plugin.settings.activeProvider = providerId;
			this.plugin.settings.activeModel = modelId;
			void this.plugin.saveSettings();
		});

		// 右側: 新規チャット + ⊕メニュー
		const headerActions = this.headerEl.createDiv({ cls: "llm-header-actions" });

		const newChatBtn = headerActions.createEl("button", {
			cls: "llm-header-btn clickable-icon",
			attr: { "aria-label": t("header.newChat") },
		});
		setIcon(newChatBtn, "refresh-cw");
		newChatBtn.addEventListener("click", () => {
			void this.saveCurrentConversation().catch(() => { /* ignore */ }).then(() => {
				this.clearChat();
				this.chatInput.focus();
			});
		});

		// ⊕ 多機能メニューボタン
		const menuBtn = headerActions.createEl("button", {
			cls: "llm-header-btn clickable-icon",
			attr: { "aria-label": t("actionBar.more") },
		});
		setIcon(menuBtn, "plus-circle");
		menuBtn.addEventListener("click", (evt) => {
			this.showPlusMenu(evt);
		});
	}

	private buildScopeBar(container: HTMLElement): void {
		const scopeBar = container.createDiv({ cls: "llm-scope-bar" });
		const scopes: Array<"active" | "local" | "vault"> = ["active", "local", "vault"];

		for (const scope of scopes) {
			const btn = scopeBar.createEl("button", {
				cls: "llm-scope-btn" + (this.currentScope === scope ? " is-active" : ""),
				text: t(`scope.${scope}`),
				attr: { "aria-label": t(`scope.${scope}`) },
			});
			this.scopeButtons.set(scope, btn);
			btn.addEventListener("click", () => {
				this.setScope(scope);
			});
		}
	}

	private setScope(scope: "active" | "local" | "vault"): void {
		if (this.currentScope === scope) return;
		const wasVault = this.currentScope === "vault";
		this.currentScope = scope;

		// ボタン状態更新
		for (const [s, btn] of this.scopeButtons) {
			btn.toggleClass("is-active", s === scope);
		}

		// Vault切替時のみ警告
		if (scope === "vault" && !wasVault) {
			new Notice(t("scope.vaultWarning"));
		}
	}

	/** 設定画面からのモデルリスト更新時に呼ばれる */
	updateModelSelector(): void {
		this.populateModelSelector();
	}

	private populateModelSelector(): void {
		this.modelSelector.empty();
		const providers = this.plugin.providerRegistry.getAll();
		providers.forEach((provider) => {
			// トグルで無効化されたプロバイダーをスキップ
			if (!this.isProviderEnabled(provider.id)) return;

			const optgroup = this.modelSelector.createEl("optgroup", {
				attr: { label: provider.name },
			});
			provider.models.forEach((model) => {
				const option = optgroup.createEl("option", {
					text: model.name,
					value: `${provider.id}::${model.id}`,
				});
				if (
					provider.id === this.plugin.settings.activeProvider &&
					model.id === this.plugin.settings.activeModel
				) {
					option.selected = true;
				}
			});
		});
	}

	private isProviderEnabled(providerId: string): boolean {
		if (providerId === "openrouter") return this.plugin.settings.enableOpenRouter;
		if (providerId === "ollama") return this.plugin.settings.enableOllama;
		return true;
	}

	private showPlusMenu(evt: MouseEvent | TouchEvent): void {
		const menu = new Menu();

		// 📎 アクティブノートを添付
		menu.addItem((item) => {
			item.setTitle(t("toolbar.attachActive"))
				.setIcon("paperclip")
				.onClick(() => {
					const activeFile = this.plugin.vaultReader.getActiveFile();
					if (!activeFile) {
						new Notice(t("notice.noActiveNote"));
						return;
					}
					void this.noteContext.addFile(activeFile).then((entry) => {
						if (entry) {
							this.updateContextBar();
							new Notice(t("notice.attached", { name: activeFile.basename }));
						} else {
							new Notice(t("notice.alreadyAttachedOrLimit"));
						}
					});
				});
		});

		// 📁 ファイルを選択
		menu.addItem((item) => {
			item.setTitle(t("toolbar.pickFile"))
				.setIcon("folder")
				.onClick(() => {
					new FilePickerModal(this.app, (file) => {
						void this.noteContext.addFile(file).then((entry) => {
							if (entry) {
								this.updateContextBar();
								new Notice(t("notice.attached", { name: file.basename }));
							} else {
								new Notice(t("notice.alreadyAttachedOrLimit"));
							}
						});
					}).open();
				});
		});

		menu.addSeparator();

		// 📋 応答をコピー
		menu.addItem((item) => {
			item.setTitle(t("toolbar.copy"))
				.setIcon("copy")
				.onClick(() => {
					const lastAssistant = [...this.messages]
						.reverse()
						.find((m) => m.role === "assistant");
					if (lastAssistant) {
						void navigator.clipboard.writeText(lastAssistant.content);
						new Notice(t("notice.copied"));
					}
				});
		});

		// 📄 ノートに挿入
		menu.addItem((item) => {
			item.setTitle(t("toolbar.insertToNote"))
				.setIcon("file-text")
				.onClick(() => {
					this.insertToActiveNote();
				});
		});

		menu.addSeparator();

		// 🕐 会話履歴
		menu.addItem((item) => {
			item.setTitle(t("header.history"))
				.setIcon("history")
				.onClick(() => {
					new ConversationListModal(
						this.app,
						this.conversationManager,
						(conversation) => { void this.loadConversation(conversation); },
					).open();
				});
		});

		menu.addSeparator();

		// ⚙ 設定
		menu.addItem((item) => {
			item.setTitle(t("header.settings"))
				.setIcon("settings")
				.onClick(() => {
					const setting = this.app.setting;
					if (setting) {
						setting.open();
						setting.openTabById("llm-assistant");
					}
				});
		});

		menu.showAtMouseEvent(evt as MouseEvent);
	}

	private updateContextBar(): void {
		this.contextBar.empty();
		const entries = this.noteContext.getEntries();

		if (entries.length === 0) {
			this.contextBar.addClass("is-hidden");
			return;
		}

		this.contextBar.removeClass("is-hidden");

		for (const entry of entries) {
			const tag = this.contextBar.createDiv({ cls: "llm-context-tag" });
			tag.createSpan({
				text: `${entry.file.basename} (${entry.tokens}t)`,
				cls: "llm-context-tag-name",
			});
			const removeBtn = tag.createEl("button", {
				cls: "llm-context-tag-remove",
				text: "\u00D7",
				attr: { "aria-label": t("conversation.delete") },
			});
			removeBtn.addEventListener("click", () => {
				this.noteContext.removeFile(entry.file.path);
				this.updateContextBar();
			});
		}

		// トータルトークン数
		this.contextBar.createSpan({
			text: `Total: ${this.noteContext.getFormattedTokens()}`,
			cls: "llm-context-total",
		});
	}

	private insertToActiveNote(): void {
		const lastAssistant = [...this.messages]
			.reverse()
			.find((m) => m.role === "assistant");
		if (!lastAssistant) {
			new Notice(t("notice.noMessageToInsert"));
			return;
		}

		const activeFile = this.plugin.vaultReader.getActiveFile();
		if (!activeFile) {
			new Notice(t("notice.noActiveNote"));
			return;
		}

		// エディタのカーソル位置に挿入
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) return;

		const editor = markdownView.editor;
		if (editor) {
			const cursor = editor.getCursor();
			editor.replaceRange(lastAssistant.content, cursor);
			new Notice(t("notice.insertedToNote"));
		}
	}

	/**
	 * 外部からメッセージを送信（クイックアクション等）
	 */
	sendMessage(text: string): void {
		this.chatInput.setValue(text);
		void this.handleSend(text);
	}

	private async handleSend(text: string): Promise<void> {
		if (!text.trim() || this.isGenerating) return;

		// ウェルカムメッセージを非表示
		this.hideWelcome();

		// 既存の再生成ボタンを削除
		this.regenerateBtn?.remove();
		this.regenerateBtn = null;

		// ユーザーメッセージを追加
		const userMsg: MessageData = {
			role: "user",
			content: text,
			timestamp: Date.now(),
		};
		this.messages.push(userMsg);
		void this.renderMessage(userMsg, this.messages.length - 1);

		// LLMプロバイダーを取得
		const provider = this.plugin.providerRegistry.get(
			this.plugin.settings.activeProvider
		);
		if (!provider) {
			this.showError(t("error.providerNotFound"));
			return;
		}

		// API鍵を取得（SecretManager経由）
		const apiKey = await this.getApiKey(provider);
		if (provider.requiresApiKey && !apiKey) {
			const apiKeyUrl = provider.apiKeyUrl;
			if (apiKeyUrl) {
				this.showError(t("error.apiKeyNotSetWithUrl", { name: provider.name, url: apiKeyUrl }));
			} else {
				this.showError(t("error.apiKeyNotSet", { name: provider.name }));
			}
			return;
		}
		const finalApiKey = apiKey || "";

		// 生成開始
		this.isGenerating = true;
		this.abortController = new AbortController();
		this.chatInput.disable();
		this.chatInput.disableSend();

		// 生成中インジケーター + 停止ボタン
		const generatingEl = this.showGeneratingIndicator();
		const stopBtn = generatingEl.createEl("button", {
			cls: "llm-stop-btn",
			attr: { "aria-label": t("chat.stop") },
		});
		setIcon(stopBtn, "square");
		stopBtn.createSpan({ text: t("chat.stop") });
		stopBtn.addEventListener("click", () => {
			this.abortController?.abort();
		});

		// アシスタントメッセージの枠を先に作成（空コンテンツは ChatMessage 側で自動非表示）
		const assistantMsg: MessageData = {
			role: "assistant",
			content: "",
			timestamp: Date.now(),
		};
		this.messages.push(assistantMsg);
		const messageComponent = new ChatMessage(this.chatOutput, assistantMsg);

		try {
			// システムプロンプトを構築
			const systemPrompt = await this.buildSystemPrompt(text, provider);

			// 会話履歴をMessage[]形式に変換
			const chatMessages: Message[] = this.messages
				.filter((m) => m.role !== "system")
				.slice(0, -1) // 空のアシスタントメッセージは除外
				.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				}));

			// プロバイダーに応じてLLM呼び出し方式を分岐
			let finalContent: string;
			let writeOperations: Array<{path: string, content: string}>;

			if (provider.supportsToolUse) {
				// Tool Use API を使用（Anthropic, OpenAI, Gemini, OpenRouter）
				const result = await this.callLLMWithToolUse(
					provider, chatMessages, systemPrompt, finalApiKey,
					assistantMsg, messageComponent,
				);
				finalContent = result.text;
				writeOperations = result.writeProposals;
			} else {
				// テキストタグ方式（Ollama, Custom等）
				const rawContent = await this.callLLMWithFileReading(
					provider, chatMessages, systemPrompt, finalApiKey,
					assistantMsg, messageComponent,
				);
				writeOperations = this.parseVaultWriteTags(rawContent);
				finalContent = this.stripVaultWriteTags(rawContent);
			}

			assistantMsg.content = finalContent;

			// MarkdownRendererで再レンダリング
			const contentEl = messageComponent.getContentEl();
			contentEl.empty();
			await MarkdownRenderer.render(
				this.app,
				assistantMsg.content,
				contentEl,
				"",
				this
			);
			this.addCodeCopyButtons(contentEl);

			// 編集提案UIを表示
			for (const op of writeOperations) {
				await this.renderEditProposal(contentEl, op);
			}
		} catch (err) {
			// Abort（停止ボタン）の場合はエラー表示せず、途中の応答を保持
			if (err instanceof DOMException && err.name === "AbortError") {
				if (!assistantMsg.content.trim()) {
					assistantMsg.content = t("chat.stopped");
				}
				messageComponent.updateContent(assistantMsg.content);
			} else {
				let errorContent: string;
				if (err instanceof RateLimitError) {
					errorContent = this.buildRateLimitMessage(err.providerId);
				} else {
					const errorMsg = err instanceof Error ? err.message : String(err);
					errorContent = t("error.occurred", { message: errorMsg });
				}
				assistantMsg.content = errorContent;
				messageComponent.updateContent(errorContent);
				messageComponent.getMessageEl().addClass("llm-message-error");
			}
		} finally {
			generatingEl.remove();
			this.isGenerating = false;
			this.abortController = null;
			this.chatInput.enable();
			this.chatInput.enableSend();
			this.chatInput.focus();
			this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
			// 再生成ボタンを表示
			this.showRegenerateButton();
			// 自動保存
			await this.saveCurrentConversation();
		}
	}

	/**
	 * システムプロンプトを構築（コンテキスト、アクティブノート、wikilink、Vault一覧を含む）
	 * スコープ: active（現在のノートのみ）/ local（+一次リンク先）/ vault（Vault全体）
	 */
	private async buildSystemPrompt(userText: string, provider?: LLMProvider): Promise<string> {
		const parts: string[] = [];
		const scope = this.currentScope;

		// 1. ユーザーのカスタムシステムプロンプト
		if (this.plugin.settings.systemPrompt) {
			parts.push(this.plugin.settings.systemPrompt);
		}

		// 2. ファイル読み込み・編集機能の指示（プロバイダーで分岐）
		if (provider?.supportsToolUse) {
			parts.push(t("context.toolUseInstruction"));
			// Dataview未インストール時の案内
			const hasDataview = !!(this.app as any).plugins?.plugins?.["dataview"]?.api;
			if (!hasDataview) {
				parts.push(t("context.dataviewSuggestion"));
			}
		} else {
			parts.push(t("context.vaultReadInstruction"));
			parts.push(t("context.vaultWriteInstruction"));
		}

		// 3. Vault全体のファイル一覧（Vault全体スコープのみ）
		// RAG有効 & インデックス構築済みの場合はスキップ（RAG検索で代替）
		if (scope === "vault" && !this.plugin.ragManager?.isBuilt()) {
			const vaultFiles = this.plugin.vaultReader.getVaultFileList(200);
			if (vaultFiles.length > 0) {
				const fileList = vaultFiles.join("\n");
				parts.push(`${t("context.vaultFiles")}\n${fileList}`);
			}
		}

		// 4. コンテキスト（手動添付ノート）
		const contextText = this.noteContext.buildContextText();
		if (contextText) {
			parts.push(contextText);
		}

		// 5. アクティブノートを自動取得（手動添付済みの場合は重複回避）
		// モバイルではチャットパネルがアクティブになるため、最近開いたMarkdownファイルでフォールバック
		let activeFile = this.plugin.vaultReader.getActiveFile();
		if (!activeFile) {
			activeFile = this.plugin.vaultReader.getMostRecentLeafFile(this.app);
		}
		if (activeFile) {
			const currentFile = activeFile;
			const alreadyAttached = this.noteContext.getEntries().some(
				e => e.file.path === currentFile.path
			);
			if (!alreadyAttached) {
				const content = await this.plugin.vaultReader.cachedReadFile(activeFile);
				parts.push(`${t("context.activeNote")}\n--- ${activeFile.name} (${activeFile.path}) ---\n${content}`);
			}
		}

		// 5b. Localスコープ: 一次リンク先ノートを追加（最大5件, 20Kトークン上限）
		if (scope === "local" && activeFile) {
			const localActiveFile = activeFile;
			const linkedFileNames = this.plugin.vaultReader.getFileLinks(localActiveFile);
			const resolvedLinked: TFile[] = linkedFileNames
				.map((name) => this.plugin.vaultReader.resolveWikiLink(name, localActiveFile.path))
				.filter((f): f is TFile => f !== null)
				.sort((a, b) => b.stat.mtime - a.stat.mtime);

			const MAX_LINKED = 5;
			let tokenBudget = 20000;
			let included = 0;
			for (const linkedFile of resolvedLinked) {
				if (included >= MAX_LINKED || tokenBudget <= 0) break;
				const alreadyInContext = this.noteContext.getEntries().some(e => e.file.path === linkedFile.path);
				const isActiveFile = activeFile && activeFile.path === linkedFile.path;
				if (alreadyInContext || isActiveFile) continue;
				const content = await this.plugin.vaultReader.cachedReadFile(linkedFile);
				const tokens = estimateTokens(content);
				if (tokens > tokenBudget) continue;
				tokenBudget -= tokens;
				parts.push(`--- ${linkedFile.basename} (${linkedFile.path}) ---\n${content}`);
				included++;
			}
			const remaining = resolvedLinked.length - included;
			if (remaining > 0) {
				parts.push(t("scope.linkedNotesOmitted", { count: remaining }));
			}
		}

		// 6. ユーザーメッセージ中の[[wikilink]]を検出し、ファイル内容を自動取得
		const linkedFiles = await this.plugin.vaultReader.resolveWikiLinksInText(userText);
		for (const linked of linkedFiles) {
			const alreadyInContext = this.noteContext.getEntries().some(e => e.file.path === linked.path);
			const isActiveFile = activeFile && activeFile.path === linked.path;
			if (!alreadyInContext && !isActiveFile) {
				parts.push(`--- ${linked.name} (${linked.path}) ---\n${linked.content}`);
			}
		}

		// 7. RAG自動検索結果を注入（Vault全体スコープのみ、かつインデックス構築済みの場合）
		if (scope === "vault" && this.plugin.ragManager?.isBuilt()) {
			const embeddingApiKey = await this.getEmbeddingApiKey();
			const ragResults = await this.plugin.ragManager.search(userText, undefined, undefined, embeddingApiKey);
			if (ragResults.length > 0) {
				const ragContext = this.plugin.ragManager.buildRAGContext(ragResults);
				parts.push(ragContext);
			}
		}

		return parts.join("\n\n");
	}

	/**
	 * LLMを呼び出し、応答中の<vault_read>タグを検出してファイルを自動読み込み
	 * 最大3回までファイル読み込みループを実行
	 */
	private async callLLMWithFileReading(
		provider: LLMProvider,
		chatMessages: Message[],
		systemPrompt: string,
		apiKey: string,
		assistantMsg: MessageData,
		messageComponent: ChatMessage,
	): Promise<string> {
		const MAX_FILE_READ_ROUNDS = 3;
		let currentMessages = [...chatMessages];
		let currentSystemPrompt = systemPrompt;

		for (let round = 0; round <= MAX_FILE_READ_ROUNDS; round++) {
			// ストリーミング用にコンテンツをリセット（ループ2回目以降）
			if (round > 0) {
				assistantMsg.content = "";
				messageComponent.updateContent(t("chat.readingFiles"));
			}

			const response = await sendRequest(
				provider,
				{
					model: this.plugin.settings.activeModel,
					messages: currentMessages,
					systemPrompt: currentSystemPrompt || undefined,
					temperature: this.plugin.settings.temperature,
					maxTokens: this.plugin.settings.maxTokens,
					stream: this.plugin.settings.streamingEnabled,
				},
				apiKey,
				(token: string) => {
					assistantMsg.content += token;
					const displayContent = this.getStreamingDisplayContent(assistantMsg.content);
					messageComponent.updateContent(displayContent);
					this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
				},
				this.abortController?.signal,
			);

			// 最終コンテンツを設定（常にフィルタ済みで表示）
			if (response.content && assistantMsg.content !== response.content) {
				assistantMsg.content = response.content;
			}
			messageComponent.updateContent(this.getStreamingDisplayContent(assistantMsg.content));

			// <vault_read>タグを検出
			const fileReadRequests = this.parseVaultReadTags(assistantMsg.content);
			if (fileReadRequests.length === 0 || round === MAX_FILE_READ_ROUNDS) {
				// タグがない、またはループ上限 → 最終応答としてタグを除去して返す
				return this.stripVaultReadTags(assistantMsg.content);
			}

			// ファイル読み込み中の表示（中間ラウンドのLLM出力は隠す）
			messageComponent.updateContent(t("chat.readingFiles"));

			// ファイルを読み込み
			const fileContents: string[] = [];
			for (const filePath of fileReadRequests) {
				const file = this.plugin.vaultReader.getFileByPath(filePath);
				if (file) {
					const content = await this.plugin.vaultReader.cachedReadFile(file);
					fileContents.push(`--- ${file.basename} (${file.path}) ---\n${content}`);
				} else {
					fileContents.push(`--- ${filePath} ---\n(File not found)`);
				}
			}

			// 会話にファイル内容を追加して再度LLMを呼び出す
			const fileContentText = fileContents.join("\n\n");
			const strippedAssistant = this.stripVaultReadTags(assistantMsg.content);
			// vault_readタグ除去後に空になる場合、プレースホルダーを入れる
			// （Gemini等、空のmodelメッセージを受け付けないプロバイダー対策）
			const assistantContent = strippedAssistant || t("chat.readingFiles");
			currentMessages = [
				...currentMessages,
				{ role: "assistant" as const, content: assistantContent },
				{ role: "user" as const, content: `${t("context.fileContentsProvided")}\n\n${fileContentText}` },
			];
		}

		return this.stripVaultReadTags(assistantMsg.content);
	}

	/**
	 * Anthropic Tool Use APIを使ったLLM呼び出し（最大5ラウンド）
	 * vault_read: 自動実行（ファイル読み取り）
	 * vault_write: ユーザー承認待ち（提案を蓄積してtool_resultで「表示済み」と返す）
	 */
	private async callLLMWithToolUse(
		provider: LLMProvider,
		chatMessages: Message[],
		systemPrompt: string,
		apiKey: string,
		assistantMsg: MessageData,
		messageComponent: ChatMessage,
	): Promise<{ text: string; writeProposals: Array<{path: string, content: string}> }> {
		const MAX_TOOL_ROUNDS = 5;
		const writeProposals: Array<{path: string, content: string}> = [];
		let currentMessages: Message[] = [...chatMessages];

		for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
			// ループ2回目以降はコンテンツをリセット
			if (round > 0) {
				assistantMsg.content = "";
				messageComponent.updateContent(t("chat.readingFiles"));
			}

			// ツール配列を構築（スコープに応じて制限）
			// Active/Local: vault_read + vault_write のみ（探索ツールは除外）
			// Vault全体: vault_list + vault_search + dataview_query も追加
			const hasDataview = !!(this.app as any).plugins?.plugins?.["dataview"]?.api;
			const isVaultScope = this.currentScope === "vault";
			const tools = [
				...VAULT_TOOLS,
				...(isVaultScope ? [VAULT_LIST_TOOL] : []),
				...(isVaultScope && this.plugin.ragManager?.isBuilt() ? [VAULT_SEARCH_TOOL] : []),
				...(isVaultScope && hasDataview ? [DATAVIEW_QUERY_TOOL] : []),
			];

			const response = await sendRequest(
				provider,
				{
					model: this.plugin.settings.activeModel,
					messages: currentMessages,
					systemPrompt: systemPrompt || undefined,
					temperature: this.plugin.settings.temperature,
					maxTokens: this.plugin.settings.maxTokens,
					stream: false, // Tool Use はストリーミング不可（requestUrl一括受信）
					tools,
				},
				apiKey,
				(token: string) => {
					assistantMsg.content += token;
					messageComponent.updateContent(assistantMsg.content);
					this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
				},
				this.abortController?.signal,
			);

			// テキスト部分を更新
			if (response.content) {
				assistantMsg.content = response.content;
				messageComponent.updateContent(assistantMsg.content);
			}

			// Tool Use がなければ完了
			if (!response.toolUses || response.toolUses.length === 0
				|| round === MAX_TOOL_ROUNDS) {
				return { text: assistantMsg.content, writeProposals };
			}

			// --- Tool Use の処理（プロバイダー非依存） ---
			messageComponent.updateContent(t("chat.readingFiles"));

			// アシスタントメッセージを会話履歴に追加（プロバイダー固有形式）
			if (provider.buildAssistantToolUseMessage) {
				currentMessages.push(
					provider.buildAssistantToolUseMessage(
						response.content || "",
						response.toolUses,
						response.rawAssistantParts,
					)
				);
			}

			// 各ツールを実行
			const toolResults: ToolResult[] = [];
			for (const toolUse of response.toolUses) {
				if (toolUse.name === "vault_read") {
					// 自動実行: ファイル読み取り
					const filePath = toolUse.input.path as string;
					const file = this.plugin.vaultReader.getFileByPath(filePath);
					if (file) {
						const content = await this.plugin.vaultReader.cachedReadFile(file);
						toolResults.push({ toolUseId: toolUse.id, name: toolUse.name, content });
					} else {
						toolResults.push({
							toolUseId: toolUse.id, name: toolUse.name,
							content: `Error: File not found at "${filePath}"`,
							isError: true,
						});
					}
				} else if (toolUse.name === "vault_write") {
					// ユーザー承認待ち: 提案を蓄積
					writeProposals.push({
						path: toolUse.input.path as string,
						content: toolUse.input.content as string,
					});
					toolResults.push({
						toolUseId: toolUse.id, name: toolUse.name,
						content: "Edit proposal displayed to user for review.",
					});
				} else if (toolUse.name === "vault_search") {
					// vault_search: RAGManagerに委譲
					const query = toolUse.input.query as string;
					const topK = toolUse.input.topK as number | undefined;
					const embeddingKey = await this.getEmbeddingApiKey();
					const searchResult = (await this.plugin.ragManager?.executeToolSearch(query, topK, embeddingKey))
						?? "RAG index not available. Please build the index first.";
					toolResults.push({
						toolUseId: toolUse.id, name: toolUse.name,
						content: searchResult,
					});
				} else if (toolUse.name === "vault_list") {
					// vault_list: VaultReaderに委譲
					messageComponent.updateContent(t("chat.listingFiles"));
					const result = this.plugin.vaultReader.listVaultContents({
						folder: toolUse.input.folder as string | undefined,
						recursive: toolUse.input.recursive as boolean | undefined,
						sort_by: toolUse.input.sort_by as "mtime" | "ctime" | "name" | "size" | undefined,
						limit: toolUse.input.limit as number | undefined,
						offset: toolUse.input.offset as number | undefined,
						extensions: toolUse.input.extensions as string | undefined,
						include_folders: toolUse.input.include_folders as boolean | undefined,
						size_filter: toolUse.input.size_filter as "empty" | "small" | "large" | undefined,
					});
					toolResults.push({
						toolUseId: toolUse.id, name: toolUse.name,
						content: this.formatVaultListResult(result),
					});
				} else if (toolUse.name === "dataview_query") {
					// dataview_query: VaultReaderに委譲
					messageComponent.updateContent(t("chat.queryingDataview"));
					const dql = toolUse.input.query as string;
					const dvResult = this.plugin.vaultReader.executeDataviewQuery(dql);
					toolResults.push({
						toolUseId: toolUse.id, name: toolUse.name,
						content: dvResult.success ? dvResult.result : `Error: ${dvResult.error}`,
						isError: !dvResult.success,
					});
				}
			}

			// ツール実行結果をメッセージとして追加（プロバイダー固有形式）
			if (provider.buildToolResultMessages) {
				currentMessages.push(...provider.buildToolResultMessages(toolResults));
			}
		}

		return { text: assistantMsg.content, writeProposals };
	}

	/**
	 * 応答中の<vault_read>path</vault_read>タグからファイルパスを抽出
	 */
	/**
	 * vault_list結果をMarkdownテーブル形式にフォーマット
	 */
	private formatVaultListResult(result: { entries: Array<{path: string; name: string; type: string; size: number; mtime: number; children?: number}>; total: number; hasMore: boolean }): string {
		if (result.total === 0) return "No files found matching the criteria.";

		const lines: string[] = [];
		lines.push(`Found ${result.total} items total. Showing ${result.entries.length} items.${result.hasMore ? " (use offset for more)" : ""}`);
		lines.push("");
		lines.push("Path | Type | Size | Modified");
		lines.push("---|---|---|---");
		for (const entry of result.entries) {
			const size = entry.type === "folder"
				? `${entry.children ?? 0} items`
				: this.formatFileSize(entry.size);
			const mtime = entry.mtime > 0
				? new Date(entry.mtime).toISOString().replace("T", " ").substring(0, 16)
				: "-";
			lines.push(`${entry.path} | ${entry.type} | ${size} | ${mtime}`);
		}
		return lines.join("\n");
	}

	private formatFileSize(bytes: number): string {
		if (bytes === 0) return "0B";
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
		return `${(bytes / 1048576).toFixed(1)}MB`;
	}

	/**
	 * Embedding用APIキーを取得
	 */
	private async getEmbeddingApiKey(): Promise<string> {
		if (!this.plugin.settings.ragEmbeddingEnabled) return "";
		const providerId = this.plugin.settings.ragEmbeddingProvider;
		if (providerId === "ollama") return "";
		if (this.plugin.settings.ragEmbeddingUseSharedKey) {
			return await this.plugin.secretManager.getApiKey(providerId) ?? "";
		}
		return await this.plugin.secretManager.getApiKey(`embedding-${providerId}`) ?? "";
	}

	private parseVaultReadTags(content: string): string[] {
		const regex = /<vault_read>([^<]+)<\/vault_read>/g;
		const paths: string[] = [];
		let match;
		while ((match = regex.exec(content)) !== null) {
			paths.push(match[1].trim());
		}
		return paths;
	}

	/**
	 * <vault_read>タグを応答から除去
	 */
	private stripVaultReadTags(content: string): string {
		return content.replace(/<vault_read>[^<]+<\/vault_read>/g, "").trim();
	}

	/**
	 * 応答中の<vault_write path="...">content</vault_write>を解析
	 */
	private parseVaultWriteTags(content: string): Array<{path: string, content: string}> {
		const regex = /<vault_write\s+path="([^"]+)">([\s\S]*?)<\/vault_write>/g;
		const writes: Array<{path: string, content: string}> = [];
		let match;
		while ((match = regex.exec(content)) !== null) {
			writes.push({ path: match[1].trim(), content: match[2].trim() });
		}
		return writes;
	}

	/**
	 * <vault_write>タグを応答から除去
	 */
	private stripVaultWriteTags(content: string): string {
		return content.replace(/<vault_write\s+path="[^"]*">[\s\S]*?<\/vault_write>/g, "").trim();
	}

	/**
	 * ストリーミング中の表示用コンテンツを生成
	 * vault_read / vault_write タグを非表示にし、自然な表示にする
	 */
	private getStreamingDisplayContent(content: string): string {
		// 完了済みの vault_read タグを除去
		let display = content.replace(/<vault_read>[^<]*<\/vault_read>/g, "");
		// 完了済みの vault_write タグを除去（複数行対応）
		display = display.replace(/<vault_write\s+path="[^"]*">[\s\S]*?<\/vault_write>/g, "");

		// 未完了の vault タグを末尾から除去（生成途中のタグ）
		const openTagMatch = display.match(/<vault[\s\S]*$/);
		if (openTagMatch) {
			display = display.substring(0, display.length - openTagMatch[0].length);
		}

		// <vault の先頭部分（<v, <va, <vau, <vaul）も除去
		display = display.replace(/<v(?:a(?:u(?:l)?)?)?$/, "");

		return display.trimEnd();
	}

	/**
	 * 編集提案UIを表示（チャンク単位の差分表示 + 個別承認/Undo）
	 */
	private async renderEditProposal(parentEl: HTMLElement, op: {path: string, content: string}): Promise<void> {
		const container = parentEl.createDiv({ cls: "llm-edit-proposal" });

		// ヘッダー
		const header = container.createDiv({ cls: "llm-edit-proposal-header" });
		const iconEl = header.createSpan({ cls: "llm-edit-proposal-icon" });
		setIcon(iconEl, "pencil");

		const file = this.plugin.vaultReader.getFileByPath(op.path);
		const isNew = !file;
		header.createSpan({ text: op.path, cls: "llm-edit-proposal-path" });
		header.createSpan({
			text: isNew ? t("edit.newFile") : t("edit.modified"),
			cls: `llm-edit-proposal-badge ${isNew ? "llm-badge-new" : "llm-badge-modified"}`,
		});

		if (isNew) {
			this.renderNewFileProposal(container, op);
			return;
		}

		// 既存ファイル: diff → チャンク分割
		const currentContent = await this.plugin.vaultReader.cachedReadFile(file);
		const rawDiff = await this.computeDiff(currentContent, op.content);
		const hunks = this.extractEditHunks(rawDiff);

		if (hunks.length === 0) {
			container.createDiv({ cls: "llm-diff-line llm-diff-same", text: t("edit.noChanges") });
			return;
		}

		// 一括操作ボタン（複数チャンク時のみ）
		if (hunks.length > 1) {
			const bulk = container.createDiv({ cls: "llm-edit-bulk-actions" });

			const applyAllBtn = bulk.createEl("button", { cls: "llm-edit-apply-btn" });
			setIcon(applyAllBtn, "check-circle");
			applyAllBtn.createSpan({ text: ` ${t("edit.applyAll")}` });

			const revertAllBtn = bulk.createEl("button", { cls: "llm-edit-undo-btn" });
			setIcon(revertAllBtn, "rotate-ccw");
			revertAllBtn.createSpan({ text: ` ${t("edit.revertAll")}` });

			// チャンク要素配列（一括操作用）
			const hunkCtrls: Array<{apply: () => Promise<void>, undo: () => Promise<void>, hunk: EditHunk}> = [];

			for (let i = 0; i < hunks.length; i++) {
				const ctrl = this.renderHunk(container, op.path, hunks[i], i + 1, hunks.length);
				hunkCtrls.push(ctrl);
			}

			applyAllBtn.addEventListener("click", () => {
				void (async () => {
					for (const c of hunkCtrls) {
						if (!c.hunk.applied) await c.apply();
					}
				})();
			});

			revertAllBtn.addEventListener("click", () => {
				void (async () => {
					for (const c of [...hunkCtrls].reverse()) {
						if (c.hunk.applied) await c.undo();
					}
				})();
			});
		} else {
			this.renderHunk(container, op.path, hunks[0], 1, 1);
		}
	}

	/**
	 * 新規ファイルの提案UI
	 */
	private renderNewFileProposal(container: HTMLElement, op: {path: string, content: string}): void {
		const diffContainer = container.createDiv({ cls: "llm-edit-diff" });
		for (const line of op.content.split("\n")) {
			diffContainer.createDiv({ cls: "llm-diff-line llm-diff-add", text: `+ ${line}` });
		}

		const actions = container.createDiv({ cls: "llm-edit-proposal-actions" });
		const applyBtn = actions.createEl("button", { cls: "llm-edit-apply-btn" });
		setIcon(applyBtn, "check");
		applyBtn.createSpan({ text: ` ${t("edit.apply")}` });

		const dismissBtn = actions.createEl("button", { cls: "llm-edit-dismiss-btn" });
		setIcon(dismissBtn, "x");
		dismissBtn.createSpan({ text: ` ${t("edit.dismiss")}` });

		applyBtn.addEventListener("click", () => {
			if (applyBtn.hasAttribute("disabled")) return;
			applyBtn.setAttribute("disabled", "true");
			void (async () => {
				try {
					await this.plugin.vaultReader.createNote(op.path, op.content);
					new Notice(t("notice.fileCreated", { name: op.path }));
					container.addClass("llm-edit-applied");
					applyBtn.setAttribute("disabled", "true");
					dismissBtn.addClass("is-hidden");

					// Undoボタンを表示
					const undoBtn = actions.createEl("button", { cls: "llm-edit-undo-btn" });
					setIcon(undoBtn, "undo");
					undoBtn.createSpan({ text: ` ${t("edit.undo")}` });
					undoBtn.addEventListener("click", () => {
						void (async () => {
							const f = this.plugin.vaultReader.getFileByPath(op.path);
							if (f) {
								await this.app.fileManager.trashFile(f);
								new Notice(t("notice.fileReverted", { name: op.path }));
							}
							container.removeClass("llm-edit-applied");
							applyBtn.removeAttribute("disabled");
							dismissBtn.removeClass("is-hidden");
							undoBtn.remove();
						})();
					});
				} catch (e) {
					console.error("Failed to create file:", op.path, e);
					new Notice(t("notice.fileCreateFailed", { name: op.path }));
					applyBtn.removeAttribute("disabled");
				}
			})();
		});

		dismissBtn.addEventListener("click", () => {
			container.addClass("llm-edit-dismissed");
			applyBtn.setAttribute("disabled", "true");
			dismissBtn.setAttribute("disabled", "true");
		});
	}

	/**
	 * 単一チャンクのUI描画（差分 + 適用/Undo/却下ボタン）
	 * @returns チャンク操作のコールバック（一括操作用）
	 */
	private renderHunk(
		parentEl: HTMLElement,
		filePath: string,
		hunk: EditHunk,
		index: number,
		total: number,
	): {apply: () => Promise<void>, undo: () => Promise<void>, hunk: EditHunk} {
		const hunkEl = parentEl.createDiv({ cls: "llm-edit-hunk" });

		// チャンクヘッダー（複数時のみ）
		if (total > 1) {
			hunkEl.createDiv({
				cls: "llm-edit-hunk-header",
				text: `${t("edit.chunk")} ${index} / ${total}`,
			});
		}

		// 差分表示
		const diffEl = hunkEl.createDiv({ cls: "llm-edit-diff" });
		for (const d of hunk.displayDiff) {
			if (d.type === "separator") {
				diffEl.createDiv({ cls: "llm-diff-line llm-diff-separator", text: "···" });
				continue;
			}
			const cls = d.type === "add" ? "llm-diff-add"
				: d.type === "remove" ? "llm-diff-remove" : "llm-diff-same";
			const prefix = d.type === "add" ? "+" : d.type === "remove" ? "−" : " ";
			diffEl.createDiv({ cls: `llm-diff-line ${cls}`, text: `${prefix} ${d.line}` });
		}

		// アクションボタン
		const actions = hunkEl.createDiv({ cls: "llm-edit-proposal-actions" });

		const applyBtn = actions.createEl("button", { cls: "llm-edit-apply-btn" });
		setIcon(applyBtn, "check");
		applyBtn.createSpan({ text: ` ${t("edit.apply")}` });

		const dismissBtn = actions.createEl("button", { cls: "llm-edit-dismiss-btn" });
		setIcon(dismissBtn, "x");
		dismissBtn.createSpan({ text: ` ${t("edit.dismiss")}` });

		let undoBtn: HTMLButtonElement | null = null;

		const doApply = async () => {
			if (hunk.applied) return;
			const f = this.plugin.vaultReader.getFileByPath(filePath);
			if (!f) return;
			const content = await this.plugin.vaultReader.readFile(f);
			const updated = content.replace(hunk.oldText, hunk.newText);
			if (content === updated) {
				new Notice(t("edit.matchNotFound"));
				return;
			}
			await this.plugin.vaultReader.modifyNote(f, updated);
			hunk.applied = true;
			hunkEl.addClass("llm-edit-applied");
			applyBtn.setAttribute("disabled", "true");
			dismissBtn.addClass("is-hidden");

			// Undoボタン表示
			if (!undoBtn) {
				undoBtn = actions.createEl("button", { cls: "llm-edit-undo-btn" });
				setIcon(undoBtn, "undo");
				undoBtn.createSpan({ text: ` ${t("edit.undo")}` });
				undoBtn.addEventListener("click", () => void doUndo());
			} else {
				undoBtn.removeAttribute("disabled");
				undoBtn.removeClass("is-hidden");
			}
			new Notice(t("notice.fileEdited", { name: filePath }));
		};

		const doUndo = async () => {
			if (!hunk.applied) return;
			const f = this.plugin.vaultReader.getFileByPath(filePath);
			if (!f) return;
			const content = await this.plugin.vaultReader.readFile(f);
			const reverted = content.replace(hunk.newText, hunk.oldText);
			if (content === reverted) {
				new Notice(t("edit.undoFailed"));
				return;
			}
			await this.plugin.vaultReader.modifyNote(f, reverted);
			hunk.applied = false;
			hunkEl.removeClass("llm-edit-applied");
			applyBtn.removeAttribute("disabled");
			dismissBtn.removeClass("is-hidden");
			if (undoBtn) undoBtn.addClass("is-hidden");
			new Notice(t("notice.fileReverted", { name: filePath }));
		};

		applyBtn.addEventListener("click", () => void doApply());

		dismissBtn.addEventListener("click", () => {
			hunkEl.addClass("llm-edit-dismissed");
			applyBtn.setAttribute("disabled", "true");
			dismissBtn.setAttribute("disabled", "true");
			if (undoBtn) undoBtn.setAttribute("disabled", "true");
		});

		return { apply: doApply, undo: doUndo, hunk };
	}

	/**
	 * 行レベルのdiffを計算（LCSベース、非同期でUIブロック回避）
	 */
	private async computeDiff(oldText: string, newText: string): Promise<Array<{type: "same" | "add" | "remove", line: string}>> {
		const oldLines = oldText.split("\n");
		const newLines = newText.split("\n");
		const m = oldLines.length;
		const n = newLines.length;

		// 大きすぎるファイルは全行addとして扱う
		if (m > 2000 || n > 2000) {
			return newLines.map(line => ({ type: "add" as const, line }));
		}

		// LCSテーブル構築（100行ごとにイベントループに制御を戻す）
		const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
		for (let i = 1; i <= m; i++) {
			if (i % 100 === 0) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}
			for (let j = 1; j <= n; j++) {
				if (oldLines[i - 1] === newLines[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1] + 1;
				} else {
					dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
				}
			}
		}

		// バックトラックしてdiff生成
		const result: Array<{type: "same" | "add" | "remove", line: string}> = [];
		let i = m, j = n;
		while (i > 0 || j > 0) {
			if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
				result.unshift({ type: "same", line: oldLines[i - 1] });
				i--; j--;
			} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
				result.unshift({ type: "add", line: newLines[j - 1] });
				j--;
			} else {
				result.unshift({ type: "remove", line: oldLines[i - 1] });
				i--;
			}
		}
		return result;
	}

	/**
	 * rawDiffからチャンク（離れた編集箇所の塊）を抽出する
	 * 各チャンクは oldText/newText（コンテキスト含む一意なテキスト）を持ち、
	 * find-and-replace で個別適用/Undoが可能
	 */
	private extractEditHunks(
		diff: Array<{type: "same" | "add" | "remove", line: string}>,
	): EditHunk[] {
		const CONTEXT = 3;
		const MERGE_GAP = 6; // これ以下の同一行数なら同じチャンクにまとめる

		// 変更行のインデックスを収集
		const changeIndices: number[] = [];
		for (let i = 0; i < diff.length; i++) {
			if (diff[i].type !== "same") changeIndices.push(i);
		}
		if (changeIndices.length === 0) return [];

		// 近接する変更をグループ化
		const groups: Array<{start: number, end: number}> = [
			{ start: changeIndices[0], end: changeIndices[0] },
		];
		for (let i = 1; i < changeIndices.length; i++) {
			const last = groups[groups.length - 1];
			if (changeIndices[i] - last.end <= MERGE_GAP) {
				last.end = changeIndices[i];
			} else {
				groups.push({ start: changeIndices[i], end: changeIndices[i] });
			}
		}

		// 各グループをコンテキスト付きチャンクに変換
		const hunks: EditHunk[] = [];
		for (const g of groups) {
			const hunkStart = Math.max(0, g.start - CONTEXT);
			const hunkEnd = Math.min(diff.length - 1, g.end + CONTEXT);

			const oldLines: string[] = [];
			const newLines: string[] = [];
			const displayDiff: Array<{type: "same" | "add" | "remove" | "separator", line: string}> = [];

			for (let i = hunkStart; i <= hunkEnd; i++) {
				displayDiff.push(diff[i]);
				if (diff[i].type === "same") {
					oldLines.push(diff[i].line);
					newLines.push(diff[i].line);
				} else if (diff[i].type === "remove") {
					oldLines.push(diff[i].line);
				} else {
					newLines.push(diff[i].line);
				}
			}

			hunks.push({
				oldText: oldLines.join("\n"),
				newText: newLines.join("\n"),
				displayDiff,
				applied: false,
			});
		}

		return hunks;
	}

	private async getApiKey(provider: LLMProvider): Promise<string | null> {
		return this.plugin.secretManager.getApiKey(provider.id);
	}

	private showWelcome(): void {
		if (this.messages.length > 0) return;
		this.welcomeEl = this.chatOutput.createDiv({ cls: "llm-welcome" });
		this.welcomeEl.createEl("h3", { text: t("welcome.title") });
		const tips = this.welcomeEl.createEl("ul", { cls: "llm-welcome-tips" });
		tips.createEl("li", { text: t("welcome.tip1") });
		tips.createEl("li", { text: t("welcome.tip2") });
		tips.createEl("li", { text: t("welcome.tip3") });
		tips.createEl("li", { text: t("welcome.tip4") });
	}

	private hideWelcome(): void {
		if (this.welcomeEl) {
			this.welcomeEl.remove();
			this.welcomeEl = null;
		}
	}

	private showGeneratingIndicator(): HTMLElement {
		const el = this.chatOutput.createDiv({ cls: "llm-generating" });
		el.createSpan({ text: t("chat.generating") });
		const dots = el.createDiv({ cls: "llm-generating-dots" });
		dots.createEl("span");
		dots.createEl("span");
		dots.createEl("span");
		this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
		return el;
	}

	private showRegenerateButton(): void {
		// 最後のユーザーメッセージを探す
		const lastUserIndex = this.messages.map(m => m.role).lastIndexOf("user");
		if (lastUserIndex < 0) return;

		this.regenerateBtn = this.chatOutput.createDiv({ cls: "llm-regenerate" });
		const btn = this.regenerateBtn.createEl("button", { cls: "llm-regenerate-btn" });
		setIcon(btn, "refresh-cw");
		btn.createSpan({ text: t("chat.regenerate") });
		btn.addEventListener("click", () => {
			if (this.isGenerating) return;
			const userMsg = this.messages[lastUserIndex];
			// 最後のユーザーメッセージ以降を削除して再送信
			this.messages = this.messages.slice(0, lastUserIndex);
			this.regenerateBtn?.remove();
			this.regenerateBtn = null;
			// DOM上のメッセージを再レンダリング
			this.chatOutput.empty();
			for (let i = 0; i < this.messages.length; i++) {
				void this.renderMessage(this.messages[i], i);
			}
			void this.handleSend(userMsg.content);
		});
	}

	/** コードブロックにコピーボタンを追加 */
	private addCodeCopyButtons(containerEl: HTMLElement): void {
		const codeBlocks = containerEl.querySelectorAll("pre > code");
		for (const codeEl of Array.from(codeBlocks)) {
			const preEl = codeEl.parentElement;
			if (!preEl || preEl.querySelector(".llm-code-copy-btn")) continue;

			preEl.addClass("llm-code-block-wrapper");
			const copyBtn = preEl.createEl("button", {
				cls: "llm-code-copy-btn clickable-icon",
				attr: { "aria-label": t("toolbar.copy") },
			});
			setIcon(copyBtn, "copy");
			copyBtn.addEventListener("click", () => {
				const text = codeEl.textContent || "";
				void navigator.clipboard.writeText(text).then(() => {
					copyBtn.empty();
					setIcon(copyBtn, "check");
					copyBtn.addClass("is-copied");
					setTimeout(() => {
						copyBtn.empty();
						setIcon(copyBtn, "copy");
						copyBtn.removeClass("is-copied");
					}, 1500);
				});
			});
		}
	}

	/**
	 * レート制限エラー時のユーザーフレンドリーなメッセージを構築
	 */
	private buildRateLimitMessage(providerId: string): string {
		const billingUrls: Record<string, string> = {
			gemini: "https://aistudio.google.com/",
			openai: "https://platform.openai.com/settings/organization/billing",
			anthropic: "https://console.anthropic.com/settings/plans",
			openrouter: "https://openrouter.ai/settings/credits",
		};
		const provider = this.plugin.providerRegistry.get(providerId);
		const providerName = provider?.name || providerId;
		const url = billingUrls[providerId];

		let msg = `**${t("error.rateLimitTitle")}**\n\n`;
		msg += t("error.rateLimitBody", { provider: providerName });
		if (url) {
			msg += `\n\n${t("error.rateLimitUpgrade", { url })}`;
		}
		return msg;
	}

	private showError(message: string): void {
		const errorMsg: MessageData = {
			role: "assistant",
			content: message,
			timestamp: Date.now(),
		};
		this.messages.push(errorMsg);
		const component = new ChatMessage(this.chatOutput, errorMsg);
		component.getMessageEl().addClass("llm-message-error");
		this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
	}

	private async renderMessage(msg: MessageData, index?: number): Promise<void> {
		const onEdit = (msg.role === "user" && index !== undefined && !this.isGenerating)
			? () => this.editMessage(index)
			: undefined;
		const messageEl = new ChatMessage(this.chatOutput, msg, onEdit);

		if (msg.role === "assistant" && msg.content) {
			const contentEl = messageEl.getContentEl();
			contentEl.empty();
			await MarkdownRenderer.render(
				this.app,
				msg.content,
				contentEl,
				"",
				this
			);
			this.addCodeCopyButtons(contentEl);
		}

		this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
	}

	private editMessage(index: number): void {
		if (this.isGenerating) return;
		const msg = this.messages[index];
		if (!msg || msg.role !== "user") return;

		// 指定インデックス以降のメッセージを削除
		this.messages = this.messages.slice(0, index);

		// DOM上のメッセージを再レンダリング
		this.chatOutput.empty();
		for (let i = 0; i < this.messages.length; i++) {
			void this.renderMessage(this.messages[i], i);
		}

		// 入力欄にメッセージ内容をセット
		this.chatInput.setValue(msg.content);
		this.chatInput.focus();
	}

	private async saveCurrentConversation(): Promise<void> {
		if (this.messages.length === 0) return;

		const now = Date.now();

		if (!this.currentConversationId) {
			this.currentConversationId = this.conversationManager.generateId();
		}

		const conversation: Conversation = {
			id: this.currentConversationId,
			title: this.conversationManager.generateTitle(this.messages),
			messages: this.messages,
			provider: this.plugin.settings.activeProvider,
			model: this.plugin.settings.activeModel,
			createdAt: this.messages[0]?.timestamp || now,
			updatedAt: now,
			scope: this.currentScope,
		};

		await this.conversationManager.save(conversation);
	}

	private async loadConversation(conversation: Conversation): Promise<void> {
		this.clearChat();
		this.currentConversationId = conversation.id;
		this.messages = [...conversation.messages];

		// スコープを復元（未保存の古い会話は設定のデフォルトを使用）
		const savedScope = conversation.scope ?? this.plugin.settings.contextScope ?? "active";
		this.setScope(savedScope);

		// メッセージを順番にレンダリング
		for (let i = 0; i < this.messages.length; i++) {
			await this.renderMessage(this.messages[i], i);
		}
	}

	/**
	 * フォントサイズクラスを設定に合わせて更新（設定画面から呼ばれる）
	 */
	updateFontSize(): void {
		const container = this.contentEl;
		container.removeClass("llm-font-small", "llm-font-medium", "llm-font-large");
		container.addClass(`llm-font-${this.plugin.settings.fontSize}`);
	}

	private clearChat(): void {
		this.messages = [];
		this.currentConversationId = null;
		this.chatOutput.empty();
		this.noteContext.clear();
		this.updateContextBar();
		// 新規チャット時はデフォルトスコープに戻す
		this.setScope(this.plugin.settings.contextScope ?? "active");
		this.showWelcome();
	}
}
