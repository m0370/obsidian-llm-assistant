import { App, TFile, TFolder, TAbstractFile, WorkspaceLeaf } from "obsidian";

export interface FileContent {
	path: string;
	name: string;
	content: string;
}

/**
 * Vault読み取りクラス
 * app.vault APIを使用してファイル操作を行う（Node.js fs禁止）
 */
export class VaultReader {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * アクティブノートを取得
	 */
	getActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile();
	}

	/**
	 * ファイルの内容を読み取り
	 */
	async readFile(file: TFile): Promise<string> {
		return this.app.vault.read(file);
	}

	/**
	 * キャッシュ経由でファイル読み取り（高速）
	 */
	async cachedReadFile(file: TFile): Promise<string> {
		return this.app.vault.cachedRead(file);
	}

	/**
	 * パスからファイルを取得
	 */
	getFileByPath(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) return file;
		return null;
	}

	/**
	 * 全マークダウンファイルを取得
	 */
	getAllMarkdownFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	/**
	 * フォルダ内のマークダウンファイルを取得
	 */
	getFilesInFolder(folderPath: string): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return [];

		const files: TFile[] = [];
		this.collectFiles(folder, files);
		return files;
	}

	private collectFiles(folder: TFolder, files: TFile[]): void {
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === "md") {
				files.push(child);
			} else if (child instanceof TFolder) {
				this.collectFiles(child, files);
			}
		}
	}

	/**
	 * ファイルの内容をFileContent形式で取得
	 */
	async getFileContent(file: TFile): Promise<FileContent> {
		const content = await this.cachedReadFile(file);
		return {
			path: file.path,
			name: file.basename,
			content,
		};
	}

	/**
	 * 複数ファイルの内容を一括取得
	 */
	async getMultipleFileContents(files: TFile[]): Promise<FileContent[]> {
		return Promise.all(files.map((f) => this.getFileContent(f)));
	}

	/**
	 * WikiLinkからリンク先ファイルを解決
	 */
	resolveWikiLink(linkText: string, sourcePath: string): TFile | null {
		const file = this.app.metadataCache.getFirstLinkpathDest(
			linkText,
			sourcePath
		);
		return file;
	}

	/**
	 * ファイルのWikiLinkを全て取得
	 */
	getFileLinks(file: TFile): string[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !cache.links) return [];
		return cache.links.map((link) => link.link);
	}

	/**
	 * テキスト中の[[wikilink]]を検出し、ファイル内容を取得
	 * 存在するファイルのみ返す
	 */
	async resolveWikiLinksInText(text: string): Promise<FileContent[]> {
		const wikiLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
		const results: FileContent[] = [];
		const seen = new Set<string>();

		let match;
		while ((match = wikiLinkRegex.exec(text)) !== null) {
			const linkText = match[1].trim();
			if (seen.has(linkText)) continue;
			seen.add(linkText);

			// metadataCache で解決
			const file = this.app.metadataCache.getFirstLinkpathDest(linkText, "");
			if (file && file instanceof TFile) {
				const content = await this.cachedReadFile(file);
				results.push({ path: file.path, name: file.basename, content });
			}
		}
		return results;
	}

	/**
	 * Vault内の全マークダウンファイルのパス一覧を取得（更新日時順）
	 */
	getVaultFileList(limit = 2000): string[] {
		return this.app.vault.getMarkdownFiles()
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, limit)
			.map(f => f.path);
	}

	/**
	 * 最近開いたMarkdownファイルを取得（モバイル用フォールバック）
	 * チャットパネルがアクティブの場合、getActiveFile()がnullを返すため、
	 * ワークスペースの他のリーフからMarkdownファイルを探す
	 */
	getMostRecentLeafFile(app: App): TFile | null {
		const leaves: WorkspaceLeaf[] = [];
		app.workspace.iterateAllLeaves((leaf) => {
			leaves.push(leaf);
		});
		for (const leaf of leaves) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const file = (leaf.view as any)?.file;
			if (file instanceof TFile && file.extension === "md") {
				return file;
			}
		}
		return null;
	}

	/**
	 * ノートの内容を作成
	 */
	async createNote(path: string, content: string): Promise<TFile> {
		return this.app.vault.create(path, content);
	}

	/**
	 * 既存ノートを修正
	 */
	async modifyNote(file: TFile, content: string): Promise<void> {
		return this.app.vault.modify(file, content);
	}
}
