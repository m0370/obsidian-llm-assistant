import { t } from "../i18n";

export class ChatInput {
	private containerEl: HTMLElement;
	private textareaEl: HTMLTextAreaElement;
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
	 * iOSキーボード表示時のレイアウト調整（根本修正版）
	 *
	 * 方針:
	 * - initialHeight記録方式でキーボード高さを正確に算出
	 * - scrollIntoViewを廃止（iOS Safariでページ全体スクロールと競合するため）
	 * - chatOutput.scrollTopで確実にスクロール
	 * - resizeイベントのみ使用（scroll不要）
	 */
	private setupKeyboardHandler(): void {
		if (!window.visualViewport) return;
		const vv = window.visualViewport;

		let initialHeight = vv.height;
		let isKeyboardOpen = false;

		this.viewportHandler = () => {
			const chatView = this.containerEl.closest(".llm-assistant-view") as HTMLElement;
			if (!chatView) return;

			// キーボード高さ = 初期ビューポート高さ - 現在のビューポート高さ
			const keyboardHeight = initialHeight - vv.height;
			const threshold = 100; // 100px以上の変化でキーボードと判定

			if (keyboardHeight > threshold) {
				if (!isKeyboardOpen) {
					isKeyboardOpen = true;
					chatView.classList.add("keyboard-open");
				}

				// chatViewの高さをビューポートに合わせる
				const newHeight = vv.height;
				chatView.style.height = `${newHeight}px`;
				chatView.style.maxHeight = `${newHeight}px`;

				// チャット出力エリアの末尾にスクロール
				requestAnimationFrame(() => {
					this.scrollChatToBottom();
				});
			} else {
				if (isKeyboardOpen) {
					isKeyboardOpen = false;
					chatView.style.height = "";
					chatView.style.maxHeight = "";
					chatView.classList.remove("keyboard-open");
				}
			}
		};

		// resizeのみでキーボード検出（scrollは不要、二重処理を防止）
		vv.addEventListener("resize", this.viewportHandler);

		// 画面回転時にinitialHeightをリセット
		this.orientationHandler = () => {
			setTimeout(() => {
				if (!isKeyboardOpen) {
					initialHeight = vv.height;
				}
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
		const maxHeight = viewportHeight * 0.25; // ビジュアルビューポートの25%が上限
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
	 * 外部から送信をトリガー（アクションバーのSendボタン用）
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

	destroy(): void {
		if (this.viewportHandler && window.visualViewport) {
			window.visualViewport.removeEventListener("resize", this.viewportHandler);
			this.viewportHandler = null;
		}
		if (this.orientationHandler) {
			window.removeEventListener("orientationchange", this.orientationHandler);
			this.orientationHandler = null;
		}
		// キーボードで変更した高さをリセット
		const chatView = this.containerEl.closest(".llm-assistant-view") as HTMLElement;
		if (chatView) {
			chatView.style.height = "";
			chatView.style.maxHeight = "";
			chatView.classList.remove("keyboard-open");
		}
	}
}
