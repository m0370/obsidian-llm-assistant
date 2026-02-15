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
 * 3段階のフォールバック戦略:
 * 1. visualViewport.resize イベント + CSS変数
 * 2. フォーカス中120msポーリング + getBoundingClientRect直接測定
 * 3. フォーカス検知 + 推定キーボード高さによるフォールバック
 *
 * デバッグモード: コンテナに data-llm-debug="1" を設定するとデバッグ表示が出る
 */
export function setupMobileViewportHandler(
	containerEl: HTMLElement
): { destroy: () => void } | null {
	const vv = window.visualViewport;
	if (!vv) return null;

	// デスクトップでは不要
	if (Platform.isDesktop) return null;

	let isKeyboardOpen = false;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let initialVvHeight = vv.height; // 初期値を記録
	let vvEverChanged = false; // vv.height が実際に変化したか追跡
	let debugEl: HTMLElement | null = null;

	// デバッグ表示（設定で有効化可能）
	const showDebug = () => {
		if (!containerEl.dataset.llmDebug) return;
		if (!debugEl) {
			debugEl = document.createElement("div");
			debugEl.style.cssText =
				"position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.85);" +
				"color:#0f0;font-size:11px;font-family:monospace;padding:4px 8px;" +
				"z-index:99999;pointer-events:none;white-space:pre;line-height:1.4;";
			document.body.appendChild(debugEl);
		}
		const rect = containerEl.getBoundingClientRect();
		const visibleBottom = vv.offsetTop + vv.height;
		debugEl.textContent =
			`vv.h=${vv.height.toFixed(0)} vv.offT=${vv.offsetTop.toFixed(0)} innerH=${window.innerHeight}\n` +
			`el.top=${rect.top.toFixed(0)} el.bot=${rect.bottom.toFixed(0)} el.h=${rect.height.toFixed(0)}\n` +
			`visBot=${visibleBottom.toFixed(0)} overflow=${(rect.bottom - visibleBottom).toFixed(0)}\n` +
			`kbOpen=${isKeyboardOpen} vvChanged=${vvEverChanged} initVvH=${initialVvHeight.toFixed(0)}`;
	};

	/**
	 * メインのビューポート更新ロジック
	 * getBoundingClientRectで直接オーバーフローを測定し、コンテナの高さを調整する
	 */
	const update = () => {
		// CSS変数も並行して設定（CSSベースの対応がある環境向け）
		containerEl.style.setProperty("--llm-viewport-height", `${vv.height}px`);

		// vv.height が初期値から変化したか追跡
		if (Math.abs(vv.height - initialVvHeight) > 50) {
			vvEverChanged = true;
		}

		// 直接測定: コンテナの下端がvisualViewportの可視下端より下にはみ出しているか
		const rect = containerEl.getBoundingClientRect();
		const visibleBottom = vv.offsetTop + vv.height;
		const overflow = rect.bottom - visibleBottom;

		if (overflow > 30) {
			// コンテナがキーボードの裏にはみ出している → 高さを縮小
			const newHeight = rect.height - overflow;
			if (newHeight > 150) {
				containerEl.style.setProperty("height", `${newHeight}px`, "important");
				containerEl.style.setProperty("max-height", `${newHeight}px`, "important");

				if (!isKeyboardOpen) {
					isKeyboardOpen = true;
					containerEl.classList.add("keyboard-open");
				}

				requestAnimationFrame(() => {
					const chatOutput = containerEl.querySelector(".llm-chat-output") as HTMLElement;
					if (chatOutput) {
						chatOutput.scrollTop = chatOutput.scrollHeight;
					}
				});
			}
		} else if (isKeyboardOpen && overflow < -30) {
			// キーボードが閉じた
			restoreLayout();
		}

		showDebug();
	};

	/**
	 * フォールバック: visualViewport が変化しない環境向け
	 * フォーカスから一定時間後にvv.heightが変化していなければ、
	 * 推定キーボード高さでコンテナを縮小する
	 */
	const applyFocusFallback = () => {
		// vv.height が既に変化している場合はフォールバック不要
		if (vvEverChanged) return;
		// 既にキーボードオープン処理済みの場合はスキップ
		if (isKeyboardOpen) return;

		// 推定キーボード高さ: 画面の40%（iPhoneで概ね正確）
		const estimatedKbHeight = window.innerHeight * 0.4;
		const rect = containerEl.getBoundingClientRect();
		const newHeight = rect.height - estimatedKbHeight;

		if (newHeight > 150) {
			containerEl.style.setProperty("height", `${newHeight}px`, "important");
			containerEl.style.setProperty("max-height", `${newHeight}px`, "important");
			isKeyboardOpen = true;
			containerEl.classList.add("keyboard-open");

			requestAnimationFrame(() => {
				const chatOutput = containerEl.querySelector(".llm-chat-output") as HTMLElement;
				if (chatOutput) {
					chatOutput.scrollTop = chatOutput.scrollHeight;
				}
			});
		}

		showDebug();
	};

	const restoreLayout = () => {
		isKeyboardOpen = false;
		containerEl.style.removeProperty("height");
		containerEl.style.removeProperty("max-height");
		containerEl.classList.remove("keyboard-open");
		showDebug();
	};

	// --- イベントリスナー登録 ---

	// 1. visualViewport resize イベント
	vv.addEventListener("resize", update);

	// 2. focusin/focusout: ポーリング開始/停止 + フォールバック
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

	let focusFallbackTimer: ReturnType<typeof setTimeout> | null = null;

	const onFocusIn = (e: FocusEvent) => {
		const target = e.target as HTMLElement;
		if (target?.tagName === "TEXTAREA" || target?.tagName === "INPUT") {
			startPolling();
			// 300ms後に通常のupdate
			setTimeout(update, 300);
			// 600ms後: vv.heightが変化していなければフォールバックを適用
			focusFallbackTimer = setTimeout(applyFocusFallback, 600);
		}
	};

	const onFocusOut = (e: FocusEvent) => {
		const related = e.relatedTarget as HTMLElement | null;
		if (!related || (related.tagName !== "TEXTAREA" && related.tagName !== "INPUT")) {
			stopPolling();
			if (focusFallbackTimer) {
				clearTimeout(focusFallbackTimer);
				focusFallbackTimer = null;
			}
			// 少し待ってからレイアウト復元
			setTimeout(() => {
				if (document.activeElement?.tagName !== "TEXTAREA" &&
					document.activeElement?.tagName !== "INPUT") {
					restoreLayout();
				}
			}, 200);
		}
	};

	containerEl.addEventListener("focusin", onFocusIn);
	containerEl.addEventListener("focusout", onFocusOut);

	// 3. 画面回転対応
	const onOrientation = () => {
		initialVvHeight = vv.height;
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
			if (focusFallbackTimer) clearTimeout(focusFallbackTimer);
			containerEl.style.removeProperty("height");
			containerEl.style.removeProperty("max-height");
			containerEl.style.removeProperty("--llm-viewport-height");
			containerEl.classList.remove("keyboard-open");
			if (debugEl) {
				debugEl.remove();
				debugEl = null;
			}
		},
	};
}
