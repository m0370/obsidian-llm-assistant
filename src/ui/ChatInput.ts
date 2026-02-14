import { setIcon } from "obsidian";
import { t } from "../i18n";

export class ChatInput {
	private containerEl: HTMLElement;
	private textareaEl: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private onSend: (text: string) => void;
	private isComposing = false;

	constructor(containerEl: HTMLElement, onSend: (text: string) => void) {
		this.containerEl = containerEl;
		this.onSend = onSend;
		this.build();
	}

	private build(): void {
		const wrapper = this.containerEl.createDiv({ cls: "llm-chat-input" });

		// テキストエリア（auto-expanding）
		this.textareaEl = wrapper.createEl("textarea", {
			cls: "llm-input-textarea",
			attr: {
				placeholder: t("input.placeholder"),
				rows: "2",
			},
		});

		// auto-expand: 入力に応じて高さを自動調整
		this.textareaEl.addEventListener("input", () => {
			this.autoExpand();
		});

		// IME変換中かどうかを追跡（日本語・中国語・韓国語等の入力対応）
		this.textareaEl.addEventListener("compositionstart", () => {
			this.isComposing = true;
		});
		this.textareaEl.addEventListener("compositionend", () => {
			this.isComposing = false;
		});

		// Enter送信 (Shift+Enterで改行、IME変換中は送信しない)
		this.textareaEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey && !this.isComposing && !e.isComposing) {
				e.preventDefault();
				this.send();
			}
		});

		// 送信ボタン
		this.sendBtn = wrapper.createEl("button", {
			cls: "llm-send-btn",
			attr: { "aria-label": t("input.send") },
		});
		setIcon(this.sendBtn, "send");
		this.sendBtn.addEventListener("click", () => {
			this.send();
		});
	}

	private autoExpand(): void {
		const textarea = this.textareaEl;
		textarea.style.height = "auto";
		const maxHeight = window.innerHeight * 0.5; // 画面の50%が上限
		const scrollHeight = textarea.scrollHeight;
		textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
		textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
	}

	private send(): void {
		const text = this.textareaEl.value.trim();
		if (!text) return;
		this.onSend(text);
		this.textareaEl.value = "";
		this.textareaEl.style.height = "auto";
		this.textareaEl.focus();
	}

	setValue(text: string): void {
		this.textareaEl.value = text;
		this.autoExpand();
	}

	focus(): void {
		this.textareaEl.focus();
	}

	disable(): void {
		this.textareaEl.disabled = true;
		this.sendBtn.disabled = true;
	}

	enable(): void {
		this.textareaEl.disabled = false;
		this.sendBtn.disabled = false;
	}
}
