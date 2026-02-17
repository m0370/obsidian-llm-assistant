import { App, Modal, Notice } from "obsidian";
import type { ConversationManager, Conversation } from "./ConversationManager";
import { t } from "../i18n";

/**
 * 会話履歴一覧モーダル
 */
export class ConversationListModal extends Modal {
	private manager: ConversationManager;
	private onSelect: (conversation: Conversation) => void;

	constructor(
		app: App,
		manager: ConversationManager,
		onSelect: (conversation: Conversation) => void,
	) {
		super(app);
		this.manager = manager;
		this.onSelect = onSelect;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("llm-conversation-list-modal");

		contentEl.createEl("h3", { text: t("conversation.title") });

		const list = await this.manager.list();

		if (list.length === 0) {
			contentEl.createEl("p", {
				text: t("conversation.empty"),
				cls: "llm-conversation-empty",
			});
			return;
		}

		const listEl = contentEl.createDiv({ cls: "llm-conversation-list" });

		for (const entry of list) {
			const item = listEl.createDiv({ cls: "llm-conversation-item" });

			const info = item.createDiv({ cls: "llm-conversation-info" });
			info.createDiv({ text: entry.title, cls: "llm-conversation-title" });
			const meta = info.createDiv({ cls: "llm-conversation-meta" });
			meta.textContent = `${entry.provider} / ${entry.model} | ${t("conversation.messages", { count: entry.messageCount })} | ${this.formatDate(entry.updatedAt)}`;

			// クリックで会話を読み込み
			info.addEventListener("click", () => {
				void this.manager.load(entry.id).then((conversation) => {
					if (conversation) {
						this.onSelect(conversation);
						this.close();
					}
				});
			});

			// 削除ボタン
			const deleteBtn = item.createEl("button", {
				cls: "llm-conversation-delete",
				text: "\u00D7",
				attr: { "aria-label": t("conversation.delete") },
			});
			deleteBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.manager.delete(entry.id).then(() => {
					new Notice(t("notice.conversationDeleted"));
					void this.onOpen(); // リスト更新
				});
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${month}/${day} ${hours}:${minutes}`;
	}
}
