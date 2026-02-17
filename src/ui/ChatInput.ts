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
				rows: "1",
			},
		});

		// Sendボタン（テキストエリアと同じ行）
		this.sendBtn = wrapper.createEl("button", {
			cls: "llm-send-btn clickable-icon",
			attr: { "aria-label": t("input.send") },
		});
		setIcon(this.sendBtn, "send");
		this.sendBtn.addEventListener("click", () => {
			this.send();
		});

		// auto-expand
		this.textareaEl.addEventListener("input", () => {
			this.autoExpand();
		});

		// IME
		this.textareaEl.addEventListener("compositionstart", () => {
			this.isComposing = true;
		});
		this.textareaEl.addEventListener("compositionend", () => {
			this.isComposing = false;
		});

		// Enter送信
		this.textareaEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey && !this.isComposing && !e.isComposing) {
				e.preventDefault();
				this.send();
			}
		});
	}

	private autoExpand(): void {
		const textarea = this.textareaEl;
		textarea.setCssStyles({ height: "auto" });
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		const maxHeight = viewportHeight * 0.25;
		const scrollHeight = textarea.scrollHeight;
		textarea.setCssStyles({
			height: `${Math.min(scrollHeight, maxHeight)}px`,
			overflowY: scrollHeight > maxHeight ? "auto" : "hidden",
		});
	}

	private send(): void {
		const text = this.textareaEl.value.trim();
		if (!text) return;
		this.onSend(text);
		this.textareaEl.value = "";
		this.textareaEl.setCssStyles({ height: "auto" });
		this.textareaEl.focus();
	}

	triggerSend(): void {
		this.send();
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
	}

	enable(): void {
		this.textareaEl.disabled = false;
	}

	disableSend(): void {
		this.sendBtn.disabled = true;
	}

	enableSend(): void {
		this.sendBtn.disabled = false;
	}

	destroy(): void {
		// キーボード対応は responsive.ts の setupMobileViewportHandler に委譲
	}
}
