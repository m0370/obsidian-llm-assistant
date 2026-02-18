import { Platform } from "obsidian";
import { hasCapacitorKeyboard } from "../utils/platform";

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

// ─── 共通ヘルパー ───

/** チャット出力を最下部にスクロール */
function scrollChatToBottom(containerEl: HTMLElement): void {
	requestAnimationFrame(() => {
		const chatOutput = containerEl.querySelector(".llm-chat-output") as HTMLElement;
		if (chatOutput) {
			chatOutput.scrollTop = chatOutput.scrollHeight;
		}
	});
}

/** デバッグ表示管理 */
function createDebugHelper(containerEl: HTMLElement) {
	let debugEl: HTMLElement | null = null;

	return {
		show(line1: string, line2: string, extra: string) {
			if (!containerEl.dataset.llmDebug) return;
			if (!debugEl) {
				debugEl = document.createElement("div");
				debugEl.style.cssText =
					"position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.85);" +
					"color:#0f0;font-size:11px;font-family:monospace;padding:4px 8px;" +
					"z-index:99999;pointer-events:none;white-space:pre;line-height:1.4;";
				document.body.appendChild(debugEl);
			}
			debugEl.textContent = `${line1}\n${line2}\n${extra}`;
		},
		showStatus(isKeyboardOpen: boolean, extra: string) {
			const rect = containerEl.getBoundingClientRect();
			const vv = window.visualViewport;
			this.show(
				`innerH=${window.innerHeight} vv.h=${vv?.height.toFixed(0) ?? "N/A"}`,
				`el.top=${rect.top.toFixed(0)} el.h=${rect.height.toFixed(0)} kbOpen=${isKeyboardOpen}`,
				extra
			);
		},
		destroy() {
			if (debugEl) {
				debugEl.remove();
				debugEl = null;
			}
		},
	};
}

/** コンテナのスタイルとクラスをクリーンアップ */
function cleanupContainer(containerEl: HTMLElement): void {
	containerEl.style.removeProperty("height");
	containerEl.style.removeProperty("max-height");
	containerEl.style.removeProperty("--llm-viewport-height");
	containerEl.classList.remove("keyboard-open");
}

// ─── Tier 1: Capacitor Keyboard API ───

function setupCapacitorHandler(
	containerEl: HTMLElement
): { destroy: () => void } {
	let isKeyboardOpen = false;
	let lastKbHeight = 0;
	const debug = createDebugHelper(containerEl);
	const listenerRemovers: Array<() => void> = [];

	const applyKeyboardHeight = (kbHeight: number) => {
		const rect = containerEl.getBoundingClientRect();
		const bottomOffset = window.innerHeight - rect.bottom;
		const overlap = kbHeight - bottomOffset;

		if (overlap > 0) {
			const newHeight = rect.height - overlap;
			if (newHeight > 120) {
				isKeyboardOpen = true;
				lastKbHeight = kbHeight;
				containerEl.style.setProperty("height", `${newHeight}px`, "important");
				containerEl.style.setProperty("max-height", `${newHeight}px`, "important");
				containerEl.classList.add("keyboard-open");
				scrollChatToBottom(containerEl);
				debug.showStatus(isKeyboardOpen,
					`[Cap] SHRINK: ${rect.height.toFixed(0)}->${newHeight.toFixed(0)} kb=${kbHeight} offset=${bottomOffset.toFixed(0)}`);
			}
		} else if (isKeyboardOpen) {
			// キーボード高さがbottomOffsetより小さい = 隙間不要
			debug.showStatus(isKeyboardOpen,
				`[Cap] NO-OVERLAP: kb=${kbHeight} offset=${bottomOffset.toFixed(0)}`);
		}
	};

	const restoreLayout = () => {
		if (!isKeyboardOpen) return;
		isKeyboardOpen = false;
		lastKbHeight = 0;
		containerEl.style.removeProperty("height");
		containerEl.style.removeProperty("max-height");
		containerEl.classList.remove("keyboard-open");
		debug.showStatus(isKeyboardOpen, "[Cap] RESTORE");
	};

	const keyboard = window.Capacitor!.Plugins!.Keyboard!;

	// keyboardWillShow: キーボードが表示されるタイミングで即座にリサイズ
	keyboard.addListener("keyboardWillShow", (info) => {
		applyKeyboardHeight(info.keyboardHeight);
	}).then(handle => {
		listenerRemovers.push(() => handle.remove());
	});

	// keyboardDidShow: QuickTypeバーの遅延表示等で最終高さが変わる場合の補正
	keyboard.addListener("keyboardDidShow", (info) => {
		if (info.keyboardHeight !== lastKbHeight) {
			// 高さが変わった場合はレイアウトをリセットしてから再適用
			if (isKeyboardOpen) {
				containerEl.style.removeProperty("height");
				containerEl.style.removeProperty("max-height");
				isKeyboardOpen = false;
			}
			applyKeyboardHeight(info.keyboardHeight);
		}
	}).then(handle => {
		listenerRemovers.push(() => handle.remove());
	});

	// keyboardWillHide: キーボード非表示開始
	keyboard.addListener("keyboardWillHide", () => {
		restoreLayout();
	}).then(handle => {
		listenerRemovers.push(() => handle.remove());
	});

	// keyboardDidHide: キーボード非表示完了（安全ネット）
	keyboard.addListener("keyboardDidHide", () => {
		restoreLayout();
	}).then(handle => {
		listenerRemovers.push(() => handle.remove());
	});

	// 画面回転時にリセット
	const onOrientation = () => restoreLayout();
	window.addEventListener("orientationchange", onOrientation);

	debug.showStatus(isKeyboardOpen, "[Cap] INIT");

	return {
		destroy: () => {
			window.removeEventListener("orientationchange", onOrientation);
			for (const remove of listenerRemovers) {
				remove();
			}
			listenerRemovers.length = 0;
			cleanupContainer(containerEl);
			debug.destroy();
		},
	};
}

// ─── Tier 2: visualViewport resize ───

function setupVisualViewportHandler(
	containerEl: HTMLElement
): { destroy: () => void } {
	let isKeyboardOpen = false;
	const debug = createDebugHelper(containerEl);
	const vv = window.visualViewport!;
	let initialHeight = vv.height;

	const onResize = () => {
		const diff = initialHeight - vv.height;
		if (diff > 100) {
			// キーボードが表示された
			const rect = containerEl.getBoundingClientRect();
			const newHeight = rect.height - diff;
			if (newHeight > 120) {
				isKeyboardOpen = true;
				containerEl.style.setProperty("height", `${newHeight}px`, "important");
				containerEl.style.setProperty("max-height", `${newHeight}px`, "important");
				containerEl.classList.add("keyboard-open");
				scrollChatToBottom(containerEl);
				debug.showStatus(isKeyboardOpen,
					`[VV] SHRINK: ${rect.height.toFixed(0)}->${newHeight.toFixed(0)} vvDiff=${diff.toFixed(0)}`);
			}
		} else if (isKeyboardOpen) {
			isKeyboardOpen = false;
			containerEl.style.removeProperty("height");
			containerEl.style.removeProperty("max-height");
			containerEl.classList.remove("keyboard-open");
			debug.showStatus(isKeyboardOpen, "[VV] RESTORE");
		}
	};

	vv.addEventListener("resize", onResize);

	const onOrientation = () => {
		// 回転後にinitialHeightを更新
		setTimeout(() => { initialHeight = vv.height; }, 500);
		if (isKeyboardOpen) {
			isKeyboardOpen = false;
			containerEl.style.removeProperty("height");
			containerEl.style.removeProperty("max-height");
			containerEl.classList.remove("keyboard-open");
		}
	};
	window.addEventListener("orientationchange", onOrientation);

	debug.showStatus(isKeyboardOpen, "[VV] INIT");

	return {
		destroy: () => {
			vv.removeEventListener("resize", onResize);
			window.removeEventListener("orientationchange", onOrientation);
			cleanupContainer(containerEl);
			debug.destroy();
		},
	};
}

// ─── Tier 3: Focus Fallback（固定比率推定） ───

function setupFocusFallbackHandler(
	containerEl: HTMLElement
): { destroy: () => void } {
	let isKeyboardOpen = false;
	let focusTimer: ReturnType<typeof setTimeout> | null = null;
	const debug = createDebugHelper(containerEl);

	const shrinkForKeyboard = () => {
		if (isKeyboardOpen) return;

		const rect = containerEl.getBoundingClientRect();
		const isTablet = window.innerWidth >= 600;
		const kbRatio = isTablet ? 0.32 : 0.40;
		const estimatedKbHeight = window.innerHeight * kbRatio;
		const newHeight = rect.height - estimatedKbHeight;

		if (newHeight > 120) {
			isKeyboardOpen = true;
			containerEl.style.setProperty("height", `${newHeight}px`, "important");
			containerEl.style.setProperty("max-height", `${newHeight}px`, "important");
			containerEl.classList.add("keyboard-open");
			scrollChatToBottom(containerEl);
			debug.showStatus(isKeyboardOpen,
				`[FB] SHRINK: ${rect.height.toFixed(0)}->${newHeight.toFixed(0)} (kb~${estimatedKbHeight.toFixed(0)})`);
		}
	};

	const restoreLayout = () => {
		if (!isKeyboardOpen) return;
		isKeyboardOpen = false;
		containerEl.style.removeProperty("height");
		containerEl.style.removeProperty("max-height");
		containerEl.classList.remove("keyboard-open");
		debug.showStatus(isKeyboardOpen, "[FB] RESTORE");
	};

	const onDocFocusIn = (e: FocusEvent) => {
		const target = e.target as HTMLElement;
		if (!target) return;
		if (!containerEl.contains(target)) return;
		if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") return;

		if (focusTimer) clearTimeout(focusTimer);
		focusTimer = setTimeout(shrinkForKeyboard, 350);
		debug.showStatus(isKeyboardOpen, "[FB] FOCUS-IN detected");
	};

	const onDocFocusOut = (e: FocusEvent) => {
		const target = e.target as HTMLElement;
		if (!target) return;
		if (!containerEl.contains(target)) return;

		if (focusTimer) {
			clearTimeout(focusTimer);
			focusTimer = null;
		}

		setTimeout(() => {
			const active = document.activeElement;
			if (!active ||
				!containerEl.contains(active) ||
				(active.tagName !== "TEXTAREA" && active.tagName !== "INPUT")) {
				restoreLayout();
			}
		}, 250);
	};

	document.addEventListener("focusin", onDocFocusIn, true);
	document.addEventListener("focusout", onDocFocusOut, true);

	const onOrientation = () => restoreLayout();
	window.addEventListener("orientationchange", onOrientation);

	debug.showStatus(isKeyboardOpen, "[FB] INIT");

	return {
		destroy: () => {
			document.removeEventListener("focusin", onDocFocusIn, true);
			document.removeEventListener("focusout", onDocFocusOut, true);
			window.removeEventListener("orientationchange", onOrientation);
			if (focusTimer) clearTimeout(focusTimer);
			cleanupContainer(containerEl);
			debug.destroy();
		},
	};
}

// ─── エントリポイント ───

/**
 * モバイルキーボード対応 — 3段階フォールバック方式
 *
 * Tier 1: Capacitor Keyboard API（Obsidian Mobile）
 *   - keyboardWillShow/keyboardDidShow で正確なキーボード高さ(px)を取得
 *   - 隙間ゼロの精密なレイアウト調整
 *
 * Tier 2: visualViewport resize（PWA等の非Capacitor環境）
 *   - Obsidian Mobile(WKWebView)では visualViewport.height が変化しないため
 *     Platform.isMobile の場合はスキップ
 *
 * Tier 3: Focus Fallback（セーフティネット）
 *   - focusin/focusout + 固定比率推定（iPhone: 40%, iPad: 32%）
 *
 * デバッグモード: containerEl.dataset.llmDebug = "1" で画面上部に情報表示
 */
export function setupMobileViewportHandler(
	containerEl: HTMLElement
): { destroy: () => void } | null {
	// デスクトップでは不要
	if (Platform.isDesktop) return null;

	// Tier 1: Capacitor Keyboard API（Obsidian Mobile）
	if (hasCapacitorKeyboard()) {
		return setupCapacitorHandler(containerEl);
	}

	// Tier 2: visualViewport resize（PWA等、Obsidian Mobileでは使わない）
	if (window.visualViewport && !Platform.isMobile) {
		return setupVisualViewportHandler(containerEl);
	}

	// Tier 3: Focus Fallback
	return setupFocusFallbackHandler(containerEl);
}
