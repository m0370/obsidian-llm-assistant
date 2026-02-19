import { setIcon } from "obsidian";
import { t } from "../i18n";

export interface MessageData {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
}

export class ChatMessage {
	private containerEl: HTMLElement;
	private messageEl: HTMLElement;
	private contentEl: HTMLElement;
	private data: MessageData;

	constructor(parentEl: HTMLElement, data: MessageData, onEdit?: () => void) {
		this.data = data;
		this.containerEl = parentEl;
		this.build(onEdit);
	}

	private build(onEdit?: () => void): void {
		this.messageEl = this.containerEl.createDiv({
			cls: `llm-message llm-message-${this.data.role}`,
		});

		// 空コンテンツのアシスタントメッセージは非表示
		if (this.data.role === "assistant" && !this.data.content) {
			this.messageEl.addClass("is-hidden");
		}

		// メッセージヘッダー（ラベル + 編集ボタン）
		const headerEl = this.messageEl.createDiv({ cls: "llm-message-header" });

		// ロールラベル
		const labelEl = headerEl.createDiv({ cls: "llm-message-label" });
		labelEl.textContent = this.data.role === "user" ? t("message.user") : t("message.assistant");

		// タイムスタンプ（ホバー/タップで表示）
		if (this.data.timestamp) {
			const date = new Date(this.data.timestamp);
			const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			headerEl.createSpan({ cls: "llm-message-timestamp", text: timeStr });
		}

		// ユーザーメッセージにのみ編集ボタンを追加
		if (this.data.role === "user" && onEdit) {
			const editBtn = headerEl.createEl("button", {
				cls: "llm-message-edit-btn clickable-icon",
				attr: { "aria-label": t("message.edit") },
			});
			setIcon(editBtn, "pencil");
			editBtn.addEventListener("click", () => onEdit());
		}

		// メッセージコンテンツ
		this.contentEl = this.messageEl.createDiv({ cls: "llm-message-content" });
		this.contentEl.textContent = this.data.content;
	}

	getContentEl(): HTMLElement {
		return this.contentEl;
	}

	getMessageEl(): HTMLElement {
		return this.messageEl;
	}

	updateContent(content: string): void {
		this.data.content = content;
		this.contentEl.textContent = content;
		if (content) {
			this.messageEl.removeClass("is-hidden");
		}
	}

	appendContent(chunk: string): void {
		this.data.content += chunk;
		this.contentEl.textContent = this.data.content;
		if (this.data.content) {
			this.messageEl.removeClass("is-hidden");
		}
	}
}
