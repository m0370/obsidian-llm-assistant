import type { TFile } from "obsidian";
import type { VaultReader, FileContent } from "./VaultReader";
import { estimateTokens, formatTokenCount } from "../utils/TokenCounter";
import { t } from "../i18n";

export interface ContextEntry {
	file: TFile;
	content: string;
	tokens: number;
}

/**
 * LLMに送信するコンテキストを構築・管理するクラス
 */
export class NoteContext {
	private entries: ContextEntry[] = [];
	private vaultReader: VaultReader;
	private tokenLimit: number;

	constructor(vaultReader: VaultReader, tokenLimit = 100000) {
		this.vaultReader = vaultReader;
		this.tokenLimit = tokenLimit;
	}

	/**
	 * ファイルをコンテキストに追加
	 */
	async addFile(file: TFile): Promise<ContextEntry | null> {
		// 重複チェック
		if (this.entries.some((e) => e.file.path === file.path)) {
			return null;
		}

		const content = await this.vaultReader.cachedReadFile(file);
		const tokens = estimateTokens(content);

		// トークン上限チェック
		if (this.getTotalTokens() + tokens > this.tokenLimit) {
			return null;
		}

		const entry: ContextEntry = { file, content, tokens };
		this.entries.push(entry);
		return entry;
	}

	/**
	 * ファイルをコンテキストから削除
	 */
	removeFile(filePath: string): void {
		this.entries = this.entries.filter((e) => e.file.path !== filePath);
	}

	/**
	 * コンテキストをクリア
	 */
	clear(): void {
		this.entries = [];
	}

	/**
	 * 全エントリーを取得
	 */
	getEntries(): ContextEntry[] {
		return [...this.entries];
	}

	/**
	 * コンテキストテキストを構築（LLMに送信する形式）
	 */
	buildContextText(): string {
		if (this.entries.length === 0) return "";

		const parts = this.entries.map((entry) => {
			return `--- ${entry.file.name} (${entry.file.path}) ---\n${entry.content}`;
		});

		return `${t("context.header")}\n\n${parts.join("\n\n")}`;
	}

	/**
	 * 合計トークン数を取得
	 */
	getTotalTokens(): number {
		return this.entries.reduce((sum, e) => sum + e.tokens, 0);
	}

	/**
	 * フォーマットされたトークン数を取得
	 */
	getFormattedTokens(): string {
		return formatTokenCount(this.getTotalTokens());
	}

	/**
	 * トークン上限内かどうか
	 */
	isWithinLimit(): boolean {
		return this.getTotalTokens() <= this.tokenLimit;
	}

	/**
	 * エントリー数を取得
	 */
	getCount(): number {
		return this.entries.length;
	}

	/**
	 * トークン上限を設定
	 */
	setTokenLimit(limit: number): void {
		this.tokenLimit = limit;
	}
}
