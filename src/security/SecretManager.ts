import type { App } from "obsidian";
import "../obsidian.d";
import { encryptApiKey, decryptApiKey, type EncryptedData } from "./WebCryptoFallback";

export type SecurityLevel = "secretstorage" | "webcrypto";

interface StoredKeys {
	[providerId: string]: EncryptedData | string;
}

/**
 * API鍵管理統合マネージャー
 *
 * 優先度1: SecretStorage API (v1.11.4+) — OS標準のセキュアストレージ
 * 優先度2: Web Crypto API暗号化 — PBKDF2 + AES-256-GCM
 */
export class SecretManager {
	private app: App;
	private securityLevel: SecurityLevel;
	private masterPassword: string | null = null;
	private saveDataFn: (data: Record<string, unknown>) => Promise<void>;
	private loadDataFn: () => Promise<Record<string, unknown> | null>;

	constructor(
		app: App,
		securityLevel: SecurityLevel,
		saveDataFn: (data: Record<string, unknown>) => Promise<void>,
		loadDataFn: () => Promise<Record<string, unknown> | null>,
	) {
		this.app = app;
		this.securityLevel = securityLevel;
		this.saveDataFn = saveDataFn;
		this.loadDataFn = loadDataFn;
	}

	/**
	 * セキュリティレベルを変更
	 */
	setSecurityLevel(level: SecurityLevel): void {
		this.securityLevel = level;
	}

	/**
	 * マスターパスワードを設定（WebCryptoモード用、セッション中のみメモリ保持）
	 */
	setMasterPassword(password: string): void {
		this.masterPassword = password;
	}

	/**
	 * マスターパスワードをクリア
	 */
	clearMasterPassword(): void {
		this.masterPassword = null;
	}

	/**
	 * マスターパスワードが設定済みか
	 */
	hasMasterPassword(): boolean {
		return this.masterPassword !== null;
	}

	/**
	 * SecretStorage APIが利用可能か
	 */
	isSecretStorageAvailable(): boolean {
		return !!this.app.secretStorage;
	}

	/**
	 * API鍵を保存
	 */
	async saveApiKey(providerId: string, apiKey: string): Promise<void> {
		const trimmedKey = apiKey.trim();
		switch (this.securityLevel) {
			case "secretstorage":
				await this.saveWithSecretStorage(providerId, trimmedKey);
				break;
			case "webcrypto":
				await this.saveWithWebCrypto(providerId, trimmedKey);
				break;
		}
	}

	/**
	 * API鍵を取得
	 */
	async getApiKey(providerId: string): Promise<string | null> {
		switch (this.securityLevel) {
			case "secretstorage":
				return this.getFromSecretStorage(providerId);
			case "webcrypto":
				return this.getFromWebCrypto(providerId);
		}
	}

	/**
	 * API鍵を削除
	 */
	async deleteApiKey(providerId: string): Promise<void> {
		switch (this.securityLevel) {
			case "secretstorage":
				await this.deleteFromSecretStorage(providerId);
				break;
			case "webcrypto":
				await this.deleteFromData(providerId);
				break;
		}
	}

	// --- SecretStorage API ---

	private async saveWithSecretStorage(providerId: string, apiKey: string): Promise<void> {
		const secretStorage = this.app.secretStorage;
		if (!secretStorage) {
			throw new Error("SecretStorage APIが利用できません");
		}
		const key = `llm-assistant-${providerId}`;
		await secretStorage.setSecret(key, apiKey);
	}

	private async getFromSecretStorage(providerId: string): Promise<string | null> {
		const secretStorage = this.app.secretStorage;
		if (!secretStorage) return null;
		const key = `llm-assistant-${providerId}`;
		const value = await secretStorage.getSecret(key);
		return value || null;
	}

	private async deleteFromSecretStorage(providerId: string): Promise<void> {
		const secretStorage = this.app.secretStorage;
		if (!secretStorage) return;
		const key = `llm-assistant-${providerId}`;
		await secretStorage.deleteSecret(key);
	}

	// --- Web Crypto API ---

	private async saveWithWebCrypto(providerId: string, apiKey: string): Promise<void> {
		if (!this.masterPassword) {
			throw new Error("マスターパスワードが設定されていません");
		}
		const encrypted = await encryptApiKey(apiKey, this.masterPassword);
		const data = (await this.loadDataFn()) || {};
		const storedKeys: StoredKeys = (data.encryptedKeys as StoredKeys) || {};
		storedKeys[providerId] = encrypted;
		data.encryptedKeys = storedKeys;
		await this.saveDataFn(data);
	}

	private async getFromWebCrypto(providerId: string): Promise<string | null> {
		if (!this.masterPassword) return null;
		const data = await this.loadDataFn();
		if (!data) return null;
		const storedKeys = data.encryptedKeys as StoredKeys | undefined;
		if (!storedKeys || !storedKeys[providerId]) return null;

		const encrypted = storedKeys[providerId];
		if (typeof encrypted === "string") return null; // 平文データ

		try {
			return await decryptApiKey(encrypted, this.masterPassword);
		} catch {
			return null; // パスワード不一致等
		}
	}

	// --- 共通削除 ---

	private async deleteFromData(providerId: string): Promise<void> {
		const data = (await this.loadDataFn()) || {};

		const encryptedKeys = data.encryptedKeys as StoredKeys | undefined;
		if (encryptedKeys) {
			delete encryptedKeys[providerId];
			data.encryptedKeys = encryptedKeys;
		}

		await this.saveDataFn(data);
	}
}
