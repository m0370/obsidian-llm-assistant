/**
 * Web Crypto API によるAPI鍵暗号化フォールバック
 *
 * SecretStorage APIが利用できない環境向け。
 * window.crypto.subtle のみ使用（モバイル完全互換）。
 *
 * 暗号化フロー:
 *   マスターパスワード
 *     → PBKDF2 (100,000 iterations, SHA-256)
 *     → AES-256-GCM鍵
 *     → encrypt(API鍵) → { encrypted, iv, salt }
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

export interface EncryptedData {
	encrypted: string; // Base64
	iv: string;        // Base64
	salt: string;      // Base64
}

/**
 * マスターパスワードからAES-256-GCM鍵を導出
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password) as BufferSource,
		"PBKDF2",
		false,
		["deriveKey"]
	);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: salt as BufferSource,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"]
	);
}

/**
 * API鍵を暗号化
 */
export async function encryptApiKey(
	plaintext: string,
	masterPassword: string
): Promise<EncryptedData> {
	const encoder = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

	const key = await deriveKey(masterPassword, salt);

	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv as BufferSource },
		key,
		encoder.encode(plaintext) as BufferSource
	);

	return {
		encrypted: arrayBufferToBase64(encrypted),
		iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
		salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
	};
}

/**
 * 暗号化されたAPI鍵を復号
 */
export async function decryptApiKey(
	data: EncryptedData,
	masterPassword: string
): Promise<string> {
	const salt = base64ToUint8Array(data.salt);
	const iv = base64ToUint8Array(data.iv);
	const encrypted = base64ToUint8Array(data.encrypted);

	const key = await deriveKey(masterPassword, salt);

	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: iv as BufferSource },
		key,
		encrypted as BufferSource
	);

	const decoder = new TextDecoder();
	return decoder.decode(decrypted);
}

// --- ユーティリティ ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
