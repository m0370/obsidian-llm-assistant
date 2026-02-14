import { setIcon } from "obsidian";
import { t } from "../i18n";

export class ChatInput {
	private containerEl: HTMLElement;
	private textareaEl: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private onSend: (text: string) => void;
	private isComposing = false;
	private viewportHandler: (() => void) | null = null;

	constructor(containerEl: HTMLElement, onSend: (text: string) => void) {
		this.containerEl = containerEl;
		this.onSend = onSend;
		this.build();
		this.setupKeyboardHandler();
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

		// フォーカス時にスクロールで入力欄を可視化（iOSキーボード対応）
		this.textareaEl.addEventListener("focus", () => {
			setTimeout(() => {
				this.textareaEl.scrollIntoView({ block: "end", behavior: "smooth" });
			}, 300);
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

	/**
	 * visualViewport APIでiOSキーボード表示時のレイアウト調整
	 */
	private setupKeyboardHandler(): void {
		if (!window.visualViewport) return;

		this.viewportHandler = () => {
			const vv = window.visualViewport!;
			const keyboardHeight = window.innerHeight - vv.height;
			const chatView = this.containerEl.closest(".llm-assistant-view") as HTMLElement;
			if (!chatView) return;

			if (keyboardHeight > 50) {
				// キーボード表示中: ビューの高さをビジュアルビューポートに合わせる
				chatView.style.height = `${vv.height}px`;
			} else {
				// キーボード非表示: 通常のレイアウトに戻す
				chatView.style.height = "100%";
			}
		};

		window.visualViewport.addEventListener("resize", this.viewportHandler);
	}

	private autoExpand(): void {
		const textarea = this.textareaEl;
		textarea.style.height = "auto";
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		const maxHeight = viewportHeight * 0.3; // ビジュアルビューポートの30%が上限
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

	destroy(): void {
		if (this.viewportHandler && window.visualViewport) {
			window.visualViewport.removeEventListener("resize", this.viewportHandler);
			this.viewportHandler = null;
		}
		// キーボードで変更した高さをリセット
		const chatView = this.containerEl.closest(".llm-assistant-view") as HTMLElement;
		if (chatView) {
			chatView.style.height = "100%";
		}
	}
}
