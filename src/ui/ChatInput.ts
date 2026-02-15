import { setIcon } from "obsidian";
import { t } from "../i18n";

export class ChatInput {
	private containerEl: HTMLElement;
	private textareaEl: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private onSend: (text: string) => void;
	private isComposing = false;
	private keyboardPollTimer: ReturnType<typeof setInterval> | null = null;
	private isKeyboardOpen = false;

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
			cls: "llm-send-btn",
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

		// --- iOSキーボード対応: focus/blurベースのポーリング ---
		this.textareaEl.addEventListener("focus", () => {
			this.startKeyboardPolling();
		});

		this.textareaEl.addEventListener("blur", () => {
			this.stopKeyboardPolling();
			// 少し待ってからリストア（他の要素へのフォーカス移動を考慮）
			setTimeout(() => {
				if (document.activeElement !== this.textareaEl) {
					this.restoreLayout();
				}
			}, 200);
		});
	}

	/**
	 * iOSキーボード対応: フォーカス中にポーリングで入力欄の可視性を監視
	 *
	 * なぜポーリング方式か:
	 * - Obsidian MobileのWKWebView内ではvisualViewport resizeイベントが
	 *   信頼性が低く、発火しない/タイミングがずれるケースが多い
	 * - getBoundingClientRectで直接「入力欄がキーボードに隠れているか」を検出
	 * - 100msポーリングで確実にキーボード出現を捕捉
	 */
	private startKeyboardPolling(): void {
		if (this.keyboardPollTimer) return;

		this.keyboardPollTimer = setInterval(() => {
			this.adjustForKeyboard();
		}, 100);

		// 初回は少し待ってから（キーボードアニメーション完了を待つ）
		setTimeout(() => this.adjustForKeyboard(), 300);
	}

	private stopKeyboardPolling(): void {
		if (this.keyboardPollTimer) {
			clearInterval(this.keyboardPollTimer);
			this.keyboardPollTimer = null;
		}
	}

	/**
	 * 入力欄がvisualViewportの外にあるかを直接測定し、
	 * chatViewの高さを縮めてキーボード上に入力欄を出す
	 */
	private adjustForKeyboard(): void {
		const chatView = this.containerEl.closest(".llm-assistant-view") as HTMLElement;
		if (!chatView) return;

		const vv = window.visualViewport;
		if (!vv) return;

		// visualViewportの可視領域の下端
		const visibleBottom = vv.offsetTop + vv.height;
		// chatViewの現在のbounding rect
		const chatViewRect = chatView.getBoundingClientRect();

		// chatViewの下端がvisualViewportの下端より下にあるか
		const overflow = chatViewRect.bottom - visibleBottom;

		if (overflow > 30) {
			// 入力欄がキーボードに隠れている
			// chatViewの高さを可視領域に収まるように縮小
			const newHeight = chatViewRect.height - overflow;

			if (newHeight > 150) { // 最低150px確保
				chatView.style.setProperty("height", `${newHeight}px`, "important");
				chatView.style.setProperty("max-height", `${newHeight}px`, "important");

				if (!this.isKeyboardOpen) {
					this.isKeyboardOpen = true;
					chatView.classList.add("keyboard-open");
				}

				// チャットを末尾にスクロール
				requestAnimationFrame(() => {
					this.scrollChatToBottom();
				});
			}
		} else if (this.isKeyboardOpen && overflow < -50) {
			// キーボードが閉じた（chatViewが可視領域より大幅に上にある）
			this.restoreLayout();
		}
	}

	/**
	 * キーボードが閉じた後のレイアウト復元
	 */
	private restoreLayout(): void {
		const chatView = this.containerEl.closest(".llm-assistant-view") as HTMLElement;
		if (!chatView) return;

		chatView.style.removeProperty("height");
		chatView.style.removeProperty("max-height");
		chatView.classList.remove("keyboard-open");
		this.isKeyboardOpen = false;
	}

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
		this.stopKeyboardPolling();
		this.restoreLayout();
	}
}
