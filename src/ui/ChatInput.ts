import { setIcon } from "obsidian";
import { t } from "../i18n";

export class ChatInput {
	private containerEl: HTMLElement;
	private textareaEl: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private onSend: (text: string) => void;
	private isComposing = false;
	private viewportHandler: (() => void) | null = null;
	private orientationHandler: (() => void) | null = null;

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
				rows: "1",
			},
		});

		// Sendボタン（テキストエリアと同じ行）
		this.sendBtn = wrapper.createEl("button", {
			cls: "llm-send-btn",
			attr: { "aria-label": t("input.send") },
		});
		setIcon(this.sendBtn, "send");
		this.sendBtn.addEventListener("click", () => {
			this.send();
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

		// フォーカス時: visualViewport対応環境ではviewportHandlerに委譲
		// 非対応環境のみフォールバック
		this.textareaEl.addEventListener("focus", () => {
			if (!window.visualViewport) {
				setTimeout(() => {
					this.scrollChatToBottom();
				}, 300);
			}
		});
	}

	/**
	 * iOSキーボード表示時のレイアウト調整
	 *
	 * 方針:
	 * - window.innerHeight との差分でキーボード高さを算出（innerHeightはキーボードで変わらない）
	 * - scrollIntoViewを廃止（iOS Safariでページ全体スクロールと競合するため）
	 * - chatOutput.scrollTopで確実にスクロール
	 * - resizeイベントのみ使用
	 * - 高さ設定後にforce reflowで確実に反映
	 */
	private setupKeyboardHandler(): void {
		if (!window.visualViewport) return;
		const vv = window.visualViewport;

		let isKeyboardOpen = false;

		this.viewportHandler = () => {
			const chatView = this.containerEl.closest(".llm-assistant-view") as HTMLElement;
			if (!chatView) return;

			// キーボード高さ = layoutViewport高さ - visualViewport高さ
			// window.innerHeight はキーボードに影響されない（iOS WKWebView）
			const keyboardHeight = window.innerHeight - vv.height;
			const threshold = 100;

			if (keyboardHeight > threshold) {
				if (!isKeyboardOpen) {
					isKeyboardOpen = true;
					chatView.classList.add("keyboard-open");
				}

				// chatViewの高さをvisualViewportに合わせる
				chatView.style.setProperty("height", `${vv.height}px`, "important");
				chatView.style.setProperty("max-height", `${vv.height}px`, "important");

				// force reflow
				void chatView.offsetHeight;

				// チャット出力エリアの末尾にスクロール
				requestAnimationFrame(() => {
					this.scrollChatToBottom();
				});
			} else {
				if (isKeyboardOpen) {
					isKeyboardOpen = false;
					chatView.style.removeProperty("height");
					chatView.style.removeProperty("max-height");
					chatView.classList.remove("keyboard-open");
				}
			}
		};

		vv.addEventListener("resize", this.viewportHandler);

		// 画面回転対応
		this.orientationHandler = () => {
			setTimeout(() => {
				if (this.viewportHandler) this.viewportHandler();
			}, 500);
		};
		window.addEventListener("orientationchange", this.orientationHandler);
	}

	/**
	 * チャット出力エリアの末尾にスクロール
	 * scrollIntoViewの代替（iOS Safariとの競合回避）
	 */
	private scrollChatToBottom(): void {
		const chatOutput = this.containerEl.closest(
			".llm-assistant-view"
		)?.querySelector(".llm-chat-output") as HTMLElement;
		if (chatOutput) {
			chatOutput.scrollTop = chatOutput.scrollHeight;
		}
	}

	private autoExpand(): void {
		const textarea = this.textareaEl;
		textarea.style.height = "auto";
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		const maxHeight = viewportHeight * 0.25;
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

	/**
	 * 外部から送信をトリガー
	 */
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
		if (this.viewportHandler && window.visualViewport) {
			window.visualViewport.removeEventListener("resize", this.viewportHandler);
			this.viewportHandler = null;
		}
		if (this.orientationHandler) {
			window.removeEventListener("orientationchange", this.orientationHandler);
			this.orientationHandler = null;
		}
		const chatView = this.containerEl.closest(".llm-assistant-view") as HTMLElement;
		if (chatView) {
			chatView.style.removeProperty("height");
			chatView.style.removeProperty("max-height");
			chatView.classList.remove("keyboard-open");
		}
	}
}
