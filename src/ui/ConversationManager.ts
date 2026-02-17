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

/**
 * 会話履歴の保存・読み込み・削除を管理
 * vault.adapter経由でJSONファイルとして保存（設定フォルダ内にアクセスするため）
 */
export class ConversationManager {
	private app: App;

	private get conversationsFolder(): string {
		return `${this.app.vault.configDir}/plugins/llm-assistant/conversations`;
	}
	private get indexFile(): string {
		return `${this.conversationsFolder}/index.json`;
	}

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 会話を保存
	 */
	async save(conversation: Conversation): Promise<void> {
		await this.ensureFolder();
		const filePath = `${this.conversationsFolder}/${conversation.id}.json`;
		const content = JSON.stringify(conversation, null, 2);
		await this.app.vault.adapter.write(filePath, content);
		await this.updateIndex(conversation);
	}

	/**
	 * 会話を読み込み
	 */
	async load(id: string): Promise<Conversation | null> {
		const filePath = `${this.conversationsFolder}/${id}.json`;
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
		const filePath = `${this.conversationsFolder}/${id}.json`;
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
		const exists = await this.app.vault.adapter.exists(this.conversationsFolder);
		if (!exists) {
			await this.app.vault.adapter.mkdir(this.conversationsFolder);
		}
	}

	private async loadIndex(): Promise<ConversationIndex> {
		try {
			const exists = await this.app.vault.adapter.exists(this.indexFile);
			if (!exists) return { conversations: [] };
			const content = await this.app.vault.adapter.read(this.indexFile);
			return JSON.parse(content) as ConversationIndex;
		} catch {
			return { conversations: [] };
		}
	}

	private async saveIndex(index: ConversationIndex): Promise<void> {
		await this.ensureFolder();
		const content = JSON.stringify(index, null, 2);
		await this.app.vault.adapter.write(this.indexFile, content);
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
