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
