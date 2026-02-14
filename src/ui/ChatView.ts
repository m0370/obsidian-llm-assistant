import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_CHAT, DISPLAY_NAME, PROVIDERS } from "../constants";
import type LLMAssistantPlugin from "../main";
import type { LLMProvider, Message } from "../llm/LLMProvider";
import { sendRequest } from "../llm/streaming";
import { NoteContext } from "../vault/NoteContext";
import { ConversationManager, type Conversation } from "./ConversationManager";
import { ConversationListModal } from "./ConversationListModal";
import { FilePickerModal } from "./FilePickerModal";
import { ChatInput } from "./ChatInput";
import { ChatMessage, type MessageData } from "./ChatMessage";
import { t } from "../i18n";

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

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("llm-assistant-view");
		container.addClass(`llm-font-${this.plugin.settings.fontSize}`);

		// 初期化
		this.noteContext = new NoteContext(this.plugin.vaultReader);
		this.conversationManager = new ConversationManager(this.app);

		// ヘッダー
		this.headerEl = container.createDiv({ cls: "llm-header" });
		this.buildHeader();

		// チャット出力エリア
		this.chatOutput = container.createDiv({ cls: "llm-chat-output" });

		// 内部リンク（[[wikilink]]）のクリックハンドラ
		this.chatOutput.addEventListener("click", (event) => {
			const target = event.target as HTMLElement;
			const link = target.closest("a.internal-link") as HTMLAnchorElement | null;
			if (link) {
				event.preventDefault();
				const href = link.getAttribute("data-href") || link.textContent;
				if (href) {
					this.app.workspace.openLinkText(href, "", false);
				}
			}
		});

		// コンテキストバー（添付ノート表示）
		this.contextBar = container.createDiv({ cls: "llm-context-bar" });
		this.contextBar.style.display = "none";

		// ツールバー
		const toolbar = container.createDiv({ cls: "llm-toolbar" });
		this.buildToolbar(toolbar);

		// 入力エリア
		const inputContainer = container.createDiv({ cls: "llm-chat-input-container" });
		this.chatInput = new ChatInput(inputContainer, (text: string) => {
			this.handleSend(text);
		});
	}

	async onClose(): Promise<void> {
		this.chatInput?.destroy();
		this.contentEl.empty();
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
			this.plugin.saveSettings();
		});

		// 右側ボタン群
		const headerActions = this.headerEl.createDiv({ cls: "llm-header-actions" });

		// 履歴ボタン
		const historyBtn = headerActions.createEl("button", {
			cls: "llm-header-btn",
			attr: { "aria-label": t("header.history") },
		});
		setIcon(historyBtn, "history");
		historyBtn.addEventListener("click", () => {
			new ConversationListModal(
				this.app,
				this.conversationManager,
				(conversation) => this.loadConversation(conversation),
			).open();
		});

		// 設定ボタン
		const settingsBtn = headerActions.createEl("button", {
			cls: "llm-header-btn",
			attr: { "aria-label": t("header.settings") },
		});
		setIcon(settingsBtn, "settings");
		settingsBtn.addEventListener("click", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const setting = (this.app as any).setting;
			if (setting) {
				setting.open();
				setting.openTabById("obsidian-llm-assistant");
			}
		});

		// 新規チャットボタン
		const newChatBtn = headerActions.createEl("button", {
			cls: "llm-header-btn",
			attr: { "aria-label": t("header.newChat") },
		});
		setIcon(newChatBtn, "plus");
		newChatBtn.addEventListener("click", async () => {
			try { await this.saveCurrentConversation(); } catch { /* ignore */ }
			this.clearChat();
			this.chatInput.focus();
		});
	}

	private populateModelSelector(): void {
		this.modelSelector.empty();
		const providers = this.plugin.providerRegistry.getAll();
		providers.forEach((provider) => {
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

	private buildToolbar(toolbar: HTMLElement): void {
		// アクティブノート参照ボタン
		const attachActiveBtn = toolbar.createEl("button", {
			cls: "llm-toolbar-btn",
			attr: { "aria-label": t("toolbar.attachActive") },
		});
		setIcon(attachActiveBtn, "paperclip");
		attachActiveBtn.addEventListener("click", async () => {
			const activeFile = this.plugin.vaultReader.getActiveFile();
			if (!activeFile) {
				new Notice(t("notice.noActiveNote"));
				return;
			}
			const entry = await this.noteContext.addFile(activeFile);
			if (entry) {
				this.updateContextBar();
				new Notice(t("notice.attached", { name: activeFile.basename }));
			} else {
				new Notice(t("notice.alreadyAttachedOrLimit"));
			}
		});

		// ファイルピッカーボタン
		const pickerBtn = toolbar.createEl("button", {
			cls: "llm-toolbar-btn",
			attr: { "aria-label": t("toolbar.pickFile") },
		});
		setIcon(pickerBtn, "folder");
		pickerBtn.addEventListener("click", () => {
			new FilePickerModal(this.app, async (file) => {
				const entry = await this.noteContext.addFile(file);
				if (entry) {
					this.updateContextBar();
					new Notice(t("notice.attached", { name: file.basename }));
				} else {
					new Notice(t("notice.alreadyAttachedOrLimit"));
				}
			}).open();
		});

		// コピーボタン
		const copyBtn = toolbar.createEl("button", {
			cls: "llm-toolbar-btn",
			attr: { "aria-label": t("toolbar.copy") },
		});
		setIcon(copyBtn, "copy");
		copyBtn.addEventListener("click", () => {
			const lastAssistant = [...this.messages]
				.reverse()
				.find((m) => m.role === "assistant");
			if (lastAssistant) {
				navigator.clipboard.writeText(lastAssistant.content);
				new Notice(t("notice.copied"));
			}
		});

		// ノート挿入ボタン
		const insertBtn = toolbar.createEl("button", {
			cls: "llm-toolbar-btn",
			attr: { "aria-label": t("toolbar.insertToNote") },
		});
		setIcon(insertBtn, "file-text");
		insertBtn.addEventListener("click", () => {
			this.insertToActiveNote();
		});
	}

	private updateContextBar(): void {
		this.contextBar.empty();
		const entries = this.noteContext.getEntries();

		if (entries.length === 0) {
			this.contextBar.style.display = "none";
			return;
		}

		this.contextBar.style.display = "flex";

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
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) return;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const editor = (activeLeaf.view as any).editor;
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
		this.handleSend(text);
	}

	private async handleSend(text: string): Promise<void> {
		if (!text.trim() || this.isGenerating) return;

		// ユーザーメッセージを追加
		const userMsg: MessageData = {
			role: "user",
			content: text,
			timestamp: Date.now(),
		};
		this.messages.push(userMsg);
		this.renderMessage(userMsg, this.messages.length - 1);

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
		if (!apiKey) {
			const providerConfig = PROVIDERS.find(p => p.id === provider.id);
			const apiKeyUrl = providerConfig?.apiKeyUrl;
			if (apiKeyUrl) {
				this.showError(t("error.apiKeyNotSetWithUrl", { name: provider.name, url: apiKeyUrl }));
			} else {
				this.showError(t("error.apiKeyNotSet", { name: provider.name }));
			}
			return;
		}

		// 生成開始
		this.isGenerating = true;
		this.chatInput.disable();

		// 生成中インジケーター
		const generatingEl = this.showGeneratingIndicator();

		// アシスタントメッセージの枠を先に作成
		const assistantMsg: MessageData = {
			role: "assistant",
			content: "",
			timestamp: Date.now(),
		};
		this.messages.push(assistantMsg);
		const messageComponent = new ChatMessage(this.chatOutput, assistantMsg);

		try {
			// システムプロンプトを構築
			const systemPrompt = await this.buildSystemPrompt(text);

			// 会話履歴をMessage[]形式に変換
			const chatMessages: Message[] = this.messages
				.filter((m) => m.role !== "system")
				.slice(0, -1) // 空のアシスタントメッセージは除外
				.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				}));

			// LLM呼び出し（vault_readタグによる自動ファイル読み込みループ付き）
			const finalContent = await this.callLLMWithFileReading(
				provider,
				chatMessages,
				systemPrompt,
				apiKey,
				assistantMsg,
				messageComponent,
			);

			// vault_writeタグを解析して編集提案を抽出
			const writeOperations = this.parseVaultWriteTags(finalContent);
			assistantMsg.content = this.stripVaultWriteTags(finalContent);

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

			// 編集提案UIを表示
			for (const op of writeOperations) {
				await this.renderEditProposal(contentEl, op);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			assistantMsg.content = t("error.occurred", { message: errorMsg });
			messageComponent.updateContent(assistantMsg.content);
			messageComponent.getMessageEl().addClass("llm-message-error");
		} finally {
			generatingEl.remove();
			this.isGenerating = false;
			this.chatInput.enable();
			this.chatInput.focus();
			this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
			// 自動保存
			await this.saveCurrentConversation();
		}
	}

	/**
	 * システムプロンプトを構築（コンテキスト、アクティブノート、wikilink、Vault一覧を含む）
	 */
	private async buildSystemPrompt(userText: string): Promise<string> {
		const parts: string[] = [];

		// 1. ユーザーのカスタムシステムプロンプト
		if (this.plugin.settings.systemPrompt) {
			parts.push(this.plugin.settings.systemPrompt);
		}

		// 2. ファイル読み込み・編集機能の指示（先頭近くに配置してLLMが確実に認識）
		parts.push(t("context.vaultReadInstruction"));
		parts.push(t("context.vaultWriteInstruction"));

		// 3. Vault全体のファイル一覧（コンパクト化: 最大200件）
		const vaultFiles = this.plugin.vaultReader.getVaultFileList(200);
		if (vaultFiles.length > 0) {
			const fileList = vaultFiles.join("\n");
			parts.push(`${t("context.vaultFiles")}\n${fileList}`);
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
			const alreadyAttached = this.noteContext.getEntries().some(
				e => e.file.path === activeFile!.path
			);
			if (!alreadyAttached) {
				const content = await this.plugin.vaultReader.cachedReadFile(activeFile);
				parts.push(`${t("context.activeNote")}\n--- ${activeFile.name} (${activeFile.path}) ---\n${content}`);
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
				}
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
	 * 応答中の<vault_read>path</vault_read>タグからファイルパスを抽出
	 */
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

			applyAllBtn.addEventListener("click", async () => {
				for (const c of hunkCtrls) {
					if (!c.hunk.applied) await c.apply();
				}
			});

			revertAllBtn.addEventListener("click", async () => {
				for (const c of [...hunkCtrls].reverse()) {
					if (c.hunk.applied) await c.undo();
				}
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

		let created = false;

		applyBtn.addEventListener("click", async () => {
			await this.plugin.vaultReader.createNote(op.path, op.content);
			new Notice(t("notice.fileCreated", { name: op.path }));
			created = true;
			container.addClass("llm-edit-applied");
			applyBtn.setAttribute("disabled", "true");

			// Undoボタンを表示
			const undoBtn = actions.createEl("button", { cls: "llm-edit-undo-btn" });
			setIcon(undoBtn, "undo");
			undoBtn.createSpan({ text: ` ${t("edit.undo")}` });
			undoBtn.addEventListener("click", async () => {
				const f = this.plugin.vaultReader.getFileByPath(op.path);
				if (f) {
					await this.app.vault.delete(f);
					new Notice(t("notice.fileReverted", { name: op.path }));
				}
				created = false;
				container.removeClass("llm-edit-applied");
				applyBtn.removeAttribute("disabled");
				undoBtn.remove();
			});
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

			// Undoボタン表示
			if (!undoBtn) {
				undoBtn = actions.createEl("button", { cls: "llm-edit-undo-btn" });
				setIcon(undoBtn, "undo");
				undoBtn.createSpan({ text: ` ${t("edit.undo")}` });
				undoBtn.addEventListener("click", () => doUndo());
			} else {
				undoBtn.removeAttribute("disabled");
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
			if (undoBtn) undoBtn.setAttribute("disabled", "true");
			new Notice(t("notice.fileReverted", { name: filePath }));
		};

		applyBtn.addEventListener("click", () => doApply());

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
			this.renderMessage(this.messages[i], i);
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
		};

		await this.conversationManager.save(conversation);
	}

	private async loadConversation(conversation: Conversation): Promise<void> {
		this.clearChat();
		this.currentConversationId = conversation.id;
		this.messages = [...conversation.messages];

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
	}
}
