import { Platform } from "obsidian";

export type DeviceClass = "phone" | "tablet" | "desktop";

export function getDeviceClass(): DeviceClass {
	if (Platform.isDesktop) return "desktop";
	const width = window.innerWidth;
	if (width >= 600) return "tablet";
	return "phone";
}

export function applyDeviceClass(containerEl: HTMLElement): void {
	const deviceClass = getDeviceClass();
	containerEl.classList.remove("llm-device-phone", "llm-device-tablet", "llm-device-desktop");
	containerEl.classList.add(`llm-device-${deviceClass}`);
}

export function setupResizeObserver(
	containerEl: HTMLElement,
	onResize?: (deviceClass: DeviceClass) => void
): ResizeObserver | null {
	if (typeof ResizeObserver === "undefined") return null;

	let lastDeviceClass = getDeviceClass();

	const observer = new ResizeObserver(() => {
		applyDeviceClass(containerEl);
		const currentDeviceClass = getDeviceClass();
		if (currentDeviceClass !== lastDeviceClass) {
			lastDeviceClass = currentDeviceClass;
			onResize?.(currentDeviceClass);
		}
	});

	observer.observe(containerEl);
	applyDeviceClass(containerEl);

	return observer;
}

/**
 * Visual Viewport API を使ったモバイルキーボード対応
 *
 * iOS Safari / WKWebView ではソフトウェアキーボード表示時に
 * layout viewport の高さは変わらず、visual viewport だけが縮む。
 * そのため height:100% のコンテナはキーボードの背後に隠れる。
 *
 * この関数は:
 * 1. --llm-viewport-height CSS変数を visualViewport.height に同期
 * 2. キーボード開閉を検知して .keyboard-open クラスを付与/除去
 * 3. キーボード表示時にチャット出力を末尾にスクロール
 *
 * @returns クリーンアップ用の destroy 関数、または非対応環境では null
 */
export function setupMobileViewportHandler(
	containerEl: HTMLElement
): { destroy: () => void } | null {
	const vv = window.visualViewport;
	if (!vv) return null;

	let isKeyboardOpen = false;
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const update = () => {
		// CSS変数にvisualViewportの高さを反映
		containerEl.style.setProperty("--llm-viewport-height", `${vv.height}px`);

		// キーボード検出: innerHeight(layout viewport)との差分
		// innerHeight はキーボード出現で変化しない（iOS WKWebView）
		const keyboardHeight = window.innerHeight - vv.height;
		const threshold = 100; // ツールバーの出没を誤検知しないよう余裕を持つ

		if (keyboardHeight > threshold) {
			if (!isKeyboardOpen) {
				isKeyboardOpen = true;
				containerEl.classList.add("keyboard-open");
			}
			// チャット末尾にスクロール
			requestAnimationFrame(() => {
				const chatOutput = containerEl.querySelector(".llm-chat-output") as HTMLElement;
				if (chatOutput) {
					chatOutput.scrollTop = chatOutput.scrollHeight;
				}
			});
		} else {
			if (isKeyboardOpen) {
				isKeyboardOpen = false;
				containerEl.classList.remove("keyboard-open");
			}
		}
	};

	// visualViewport resize イベントで更新
	vv.addEventListener("resize", update);

	// WKWebView で resize イベントが発火しないケースに備え、
	// ポーリングでもCSS変数を同期する（フォーカス中のみ有効化）
	const startPolling = () => {
		if (pollTimer) return;
		pollTimer = setInterval(update, 120);
	};
	const stopPolling = () => {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	};

	// textarea にフォーカスがある間だけポーリングを稼働
	const onFocusIn = (e: FocusEvent) => {
		const target = e.target as HTMLElement;
		if (target?.tagName === "TEXTAREA" || target?.tagName === "INPUT") {
			startPolling();
			// 初回は少し待ってから（キーボードアニメーション完了後）
			setTimeout(update, 300);
		}
	};
	const onFocusOut = (e: FocusEvent) => {
		const related = e.relatedTarget as HTMLElement | null;
		if (!related || (related.tagName !== "TEXTAREA" && related.tagName !== "INPUT")) {
			stopPolling();
			// 少し待ってから最終更新（キーボード閉じアニメーション後）
			setTimeout(update, 300);
		}
	};

	containerEl.addEventListener("focusin", onFocusIn);
	containerEl.addEventListener("focusout", onFocusOut);

	// 画面回転対応
	const onOrientation = () => {
		setTimeout(update, 500);
	};
	window.addEventListener("orientationchange", onOrientation);

	// 初期値を設定
	update();

	return {
		destroy: () => {
			vv.removeEventListener("resize", update);
			containerEl.removeEventListener("focusin", onFocusIn);
			containerEl.removeEventListener("focusout", onFocusOut);
			window.removeEventListener("orientationchange", onOrientation);
			stopPolling();
			containerEl.style.removeProperty("--llm-viewport-height");
			containerEl.classList.remove("keyboard-open");
		},
	};
}
