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
 * モバイルキーボード対応 — フォーカスベースのシンプル方式
 *
 * Obsidian Mobile (WKWebView) では visualViewport.height がキーボード表示時に
 * 変化しないことが実機テストで確認された。そのため、ビューポートAPI に頼らず
 * document レベルの focusin/focusout でキーボードの開閉を推定し、
 * コンテナの高さを直接操作する。
 *
 * デバッグモード: containerEl.dataset.llmDebug = "1" で画面上部に情報表示
 */
export function setupMobileViewportHandler(
	containerEl: HTMLElement
): { destroy: () => void } | null {
	// デスクトップでは不要
	if (Platform.isDesktop) return null;

	let isKeyboardOpen = false;
	let focusTimer: ReturnType<typeof setTimeout> | null = null;
	let debugEl: HTMLElement | null = null;

	// デバッグ表示
	const showDebug = (extra: string = "") => {
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
		const vv = window.visualViewport;
		debugEl.textContent =
			`innerH=${window.innerHeight} vv.h=${vv?.height.toFixed(0) ?? "N/A"}\n` +
			`el.top=${rect.top.toFixed(0)} el.h=${rect.height.toFixed(0)} kbOpen=${isKeyboardOpen}\n` +
			`${extra}`;
	};

	/**
	 * キーボード表示時: コンテナ高さを縮小
	 */
	const shrinkForKeyboard = () => {
		if (isKeyboardOpen) return;

		const rect = containerEl.getBoundingClientRect();
		// iPhone: キーボード高さは概ね画面の36-42%
		// iPad:  キーボード高さは概ね画面の28-35%
		const isTablet = window.innerWidth >= 600;
		const kbRatio = isTablet ? 0.32 : 0.40;
		const estimatedKbHeight = window.innerHeight * kbRatio;
		const newHeight = rect.height - estimatedKbHeight;

		if (newHeight > 120) {
			isKeyboardOpen = true;
			containerEl.style.setProperty("height", `${newHeight}px`, "important");
			containerEl.style.setProperty("max-height", `${newHeight}px`, "important");
			containerEl.classList.add("keyboard-open");

			requestAnimationFrame(() => {
				const chatOutput = containerEl.querySelector(".llm-chat-output") as HTMLElement;
				if (chatOutput) {
					chatOutput.scrollTop = chatOutput.scrollHeight;
				}
			});

			showDebug(`SHRINK: ${rect.height.toFixed(0)} -> ${newHeight.toFixed(0)} (kb~${estimatedKbHeight.toFixed(0)})`);
		}
	};

	/**
	 * キーボード非表示時: レイアウト復元
	 */
	const restoreLayout = () => {
		if (!isKeyboardOpen) return;
		isKeyboardOpen = false;
		containerEl.style.removeProperty("height");
		containerEl.style.removeProperty("max-height");
		containerEl.classList.remove("keyboard-open");
		showDebug("RESTORE");
	};

	/**
	 * document レベルの focusin ハンドラ
	 * containerEl 内の textarea/input にフォーカスが当たったか判定
	 */
	const onDocFocusIn = (e: FocusEvent) => {
		const target = e.target as HTMLElement;
		if (!target) return;
		// このコンテナ内の要素か確認
		if (!containerEl.contains(target)) return;
		if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") return;

		// キーボードアニメーション完了を待ってから縮小
		if (focusTimer) clearTimeout(focusTimer);
		focusTimer = setTimeout(shrinkForKeyboard, 350);

		showDebug("FOCUS-IN detected");
	};

	/**
	 * document レベルの focusout ハンドラ
	 */
	const onDocFocusOut = (e: FocusEvent) => {
		const target = e.target as HTMLElement;
		if (!target) return;
		if (!containerEl.contains(target)) return;

		if (focusTimer) {
			clearTimeout(focusTimer);
			focusTimer = null;
		}

		// 少し待ってからレイアウト復元
		// （別の入力要素にフォーカスが移る場合は復元しない）
		setTimeout(() => {
			const active = document.activeElement;
			if (!active ||
				!containerEl.contains(active) ||
				(active.tagName !== "TEXTAREA" && active.tagName !== "INPUT")) {
				restoreLayout();
			}
		}, 250);
	};

	// document レベルでイベントを捕捉（バブルの問題を回避）
	document.addEventListener("focusin", onDocFocusIn, true);
	document.addEventListener("focusout", onDocFocusOut, true);

	// 画面回転時にレイアウトをリセット
	const onOrientation = () => {
		restoreLayout();
	};
	window.addEventListener("orientationchange", onOrientation);

	showDebug("INIT");

	return {
		destroy: () => {
			document.removeEventListener("focusin", onDocFocusIn, true);
			document.removeEventListener("focusout", onDocFocusOut, true);
			window.removeEventListener("orientationchange", onOrientation);
			if (focusTimer) clearTimeout(focusTimer);
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
