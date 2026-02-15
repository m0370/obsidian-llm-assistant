import type { App } from "obsidian";
import type { MessageData } from "./ChatMessage";
import { t } from "../i18n";

export interface Conversation {
	id: string;
	title: string;
	messages: MessageData[];
	provider: string;
	model: string;
	createdAt: number;
	updatedAt: number;
}

interface ConversationIndex {
	conversations: Array<{
		id: string;
		title: string;
		provider: string;
		model: string;
		messageCount: number;
		createdAt: number;
		updatedAt: number;
	}>;
}

const CONVERSATIONS_FOLDER = ".obsidian/plugins/llm-assistant/conversations";
const INDEX_FILE = `${CONVERSATIONS_FOLDER}/index.json`;

/**
 * 会話履歴の保存・読み込み・削除を管理
 * vault.adapter経由でJSONファイルとして保存（.obsidianフォルダ内にアクセスするため）
 */
export class ConversationManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 会話を保存
	 */
	async save(conversation: Conversation): Promise<void> {
		await this.ensureFolder();
		const filePath = `${CONVERSATIONS_FOLDER}/${conversation.id}.json`;
		const content = JSON.stringify(conversation, null, 2);
		await this.app.vault.adapter.write(filePath, content);
		await this.updateIndex(conversation);
	}

	/**
	 * 会話を読み込み
	 */
	async load(id: string): Promise<Conversation | null> {
		const filePath = `${CONVERSATIONS_FOLDER}/${id}.json`;
		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) return null;
			const content = await this.app.vault.adapter.read(filePath);
			return JSON.parse(content) as Conversation;
		} catch {
			return null;
		}
	}

	/**
	 * 会話を削除
	 */
	async delete(id: string): Promise<void> {
		const filePath = `${CONVERSATIONS_FOLDER}/${id}.json`;
		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (exists) {
				await this.app.vault.adapter.remove(filePath);
			}
		} catch {
			// ignore
		}
		await this.removeFromIndex(id);
	}

	/**
	 * 会話一覧を取得（インデックスから）
	 */
	async list(): Promise<ConversationIndex["conversations"]> {
		const index = await this.loadIndex();
		return index.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	/**
	 * 新規会話IDを生成
	 */
	generateId(): string {
		return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
	}

	/**
	 * メッセージから会話タイトルを生成（最初のユーザーメッセージの先頭30文字）
	 */
	generateTitle(messages: MessageData[]): string {
		const firstUser = messages.find((m) => m.role === "user");
		if (!firstUser) return t("conversation.newChat");
		const text = firstUser.content.trim();
		return text.length > 30 ? text.substring(0, 30) + "..." : text;
	}

	// --- 内部メソッド ---

	private async ensureFolder(): Promise<void> {
		const exists = await this.app.vault.adapter.exists(CONVERSATIONS_FOLDER);
		if (!exists) {
			await this.app.vault.adapter.mkdir(CONVERSATIONS_FOLDER);
		}
	}

	private async loadIndex(): Promise<ConversationIndex> {
		try {
			const exists = await this.app.vault.adapter.exists(INDEX_FILE);
			if (!exists) return { conversations: [] };
			const content = await this.app.vault.adapter.read(INDEX_FILE);
			return JSON.parse(content) as ConversationIndex;
		} catch {
			return { conversations: [] };
		}
	}

	private async saveIndex(index: ConversationIndex): Promise<void> {
		await this.ensureFolder();
		const content = JSON.stringify(index, null, 2);
		await this.app.vault.adapter.write(INDEX_FILE, content);
	}

	private async updateIndex(conversation: Conversation): Promise<void> {
		const index = await this.loadIndex();
		const existing = index.conversations.findIndex((c) => c.id === conversation.id);
		const entry = {
			id: conversation.id,
			title: conversation.title,
			provider: conversation.provider,
			model: conversation.model,
			messageCount: conversation.messages.length,
			createdAt: conversation.createdAt,
			updatedAt: conversation.updatedAt,
		};

		if (existing >= 0) {
			index.conversations[existing] = entry;
		} else {
			index.conversations.push(entry);
		}
		await this.saveIndex(index);
	}

	private async removeFromIndex(id: string): Promise<void> {
		const index = await this.loadIndex();
		index.conversations = index.conversations.filter((c) => c.id !== id);
		await this.saveIndex(index);
	}
}
