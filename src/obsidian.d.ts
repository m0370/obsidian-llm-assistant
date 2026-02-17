/**
 * Obsidian API type extensions
 *
 * Obsidian's public type definitions don't include some APIs
 * that are available at runtime. This file provides type-safe
 * access to those APIs.
 */

import "obsidian";

interface ObsidianSettingManager {
	open(): void;
	openTabById(id: string): void;
}

declare module "obsidian" {
	interface SecretStorage {
		getSecret(key: string): Promise<string | null>;
		setSecret(key: string, value: string): Promise<void>;
		deleteSecret(key: string): Promise<void>;
	}

	interface App {
		/** SecretStorage API (available since Obsidian v1.11.4+) */
		secretStorage?: SecretStorage;
		/** Internal settings manager */
		setting?: ObsidianSettingManager;
	}
}

declare global {
	interface Window {
		moment?: {
			locale?: () => string;
		};
	}
}
