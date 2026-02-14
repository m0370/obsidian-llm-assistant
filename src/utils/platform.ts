import { Platform } from "obsidian";

export function isDesktop(): boolean {
	return Platform.isDesktop;
}

export function isMobile(): boolean {
	return Platform.isMobile;
}

export function isIOS(): boolean {
	return Platform.isIosApp;
}

export function isAndroid(): boolean {
	return Platform.isAndroidApp;
}

export function getDeviceType(): "desktop" | "tablet" | "phone" {
	if (Platform.isDesktop) return "desktop";
	const width = window.innerWidth;
	if (width >= 600) return "tablet";
	return "phone";
}

export function canUseFetchStreaming(supportsCORS: boolean): boolean {
	if (!supportsCORS) return false;
	// モバイルでもCORS対応プロバイダーならfetch()を試行可能
	// 失敗時はrequestUrl()にフォールバック
	return true;
}
