import { App, MarkdownView, TFile, TFolder, WorkspaceLeaf } from "obsidian";

export interface FileContent {
	path: string;
	name: string;
	content: string;
}

export interface VaultListParams {
	folder?: string;
	recursive?: boolean;
	sort_by?: "mtime" | "ctime" | "name" | "size";
	limit?: number;
	offset?: number;
	extensions?: string;
	include_folders?: boolean;
	size_filter?: "empty" | "small" | "large";
}

export interface VaultListEntry {
	path: string;
	name: string;
	type: "file" | "folder";
	size: number;
	mtime: number;
	children?: number;
}

export interface VaultListResult {
	entries: VaultListEntry[];
	total: number;
	hasMore: boolean;
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
			if (leaf.view instanceof MarkdownView) {
				const file = leaf.view.file;
				if (file instanceof TFile && file.extension === "md") {
					return file;
				}
			}
		}
		return null;
	}

	/**
	 * ノートの内容を作成
	 */
	async createNote(path: string, content: string): Promise<TFile> {
		const dir = path.substring(0, path.lastIndexOf("/"));
		if (dir) {
			const exists = await this.app.vault.adapter.exists(dir);
			if (!exists) {
				await this.app.vault.adapter.mkdir(dir);
			}
		}
		return this.app.vault.create(path, content);
	}

	/**
	 * 既存ノートを修正
	 */
	async modifyNote(file: TFile, content: string): Promise<void> {
		return this.app.vault.modify(file, content);
	}

	/**
	 * Vault内のファイル/フォルダ一覧を取得（vault_listツール用）
	 */
	listVaultContents(params: VaultListParams = {}): VaultListResult {
		const {
			folder,
			recursive = true,
			sort_by = "mtime",
			limit: rawLimit = 50,
			offset = 0,
			extensions = "md",
			include_folders = false,
			size_filter,
		} = params;

		const limit = Math.min(rawLimit, 200);
		const extSet = new Set(extensions.split(",").map(e => e.trim().toLowerCase()));

		// 起点フォルダを決定
		let rootFolder: TFolder;
		if (folder) {
			const f = this.app.vault.getAbstractFileByPath(folder);
			if (!(f instanceof TFolder)) {
				return { entries: [], total: 0, hasMore: false };
			}
			rootFolder = f;
		} else {
			rootFolder = this.app.vault.getRoot();
		}

		// エントリ収集
		const entries: VaultListEntry[] = [];
		this.collectListEntries(rootFolder, entries, extSet, include_folders, recursive);

		// サイズフィルタ
		let filtered = entries;
		if (size_filter) {
			filtered = entries.filter(e => {
				if (e.type === "folder") return false;
				if (size_filter === "empty") return e.size === 0;
				if (size_filter === "small") return e.size > 0 && e.size < 1024;
				if (size_filter === "large") return e.size >= 102400;
				return true;
			});
		}

		// ソート
		filtered.sort((a, b) => {
			if (sort_by === "mtime") return b.mtime - a.mtime;
			if (sort_by === "ctime") return b.mtime - a.mtime; // TFile.stat.ctime is available via mtime fallback
			if (sort_by === "name") return a.name.localeCompare(b.name);
			if (sort_by === "size") return b.size - a.size;
			return 0;
		});

		const total = filtered.length;
		const paged = filtered.slice(offset, offset + limit);

		return {
			entries: paged,
			total,
			hasMore: offset + limit < total,
		};
	}

	private collectListEntries(
		folder: TFolder,
		entries: VaultListEntry[],
		extSet: Set<string>,
		includeFolders: boolean,
		recursive: boolean,
	): void {
		for (const child of folder.children) {
			if (child instanceof TFile) {
				if (extSet.has(child.extension.toLowerCase())) {
					entries.push({
						path: child.path,
						name: child.name,
						type: "file",
						size: child.stat.size,
						mtime: child.stat.mtime,
					});
				}
			} else if (child instanceof TFolder) {
				if (includeFolders) {
					entries.push({
						path: child.path,
						name: child.name,
						type: "folder",
						size: 0,
						mtime: 0,
						children: child.children.length,
					});
				}
				if (recursive) {
					this.collectListEntries(child, entries, extSet, includeFolders, recursive);
				}
			}
		}
	}

	/**
	 * Dataview DQLクエリを実行（dataview_queryツール用）
	 */
	executeDataviewQuery(dql: string): { success: boolean; result: string; error?: string } {

		const dvApi = (this.app as any).plugins?.plugins?.["dataview"]?.api;
		if (!dvApi) {
			return {
				success: false,
				result: "",
				error: "Dataview plugin is not installed. Install it from Community Plugins, or use vault_list tool instead.",
			};
		}

		try {
			const queryResult = dvApi.query(dql);
			if (!queryResult.successful) {
				return { success: false, result: "", error: queryResult.error };
			}
			const formatted = this.formatDataviewValue(queryResult.value);
			return { success: true, result: formatted };
		} catch (e) {
			return {
				success: false,
				result: "",
				error: `Dataview query failed: ${e instanceof Error ? e.message : String(e)}`,
			};
		}
	}

	private formatDataviewValue(value: any): string {
		if (!value || !value.type) return String(value);

		if (value.type === "table") {
			const headers: string[] = value.headers || [];
	
			const rows: any[][] = value.values || [];
			if (rows.length === 0) return "(No results)";

			const lines: string[] = [];
			lines.push(headers.join(" | "));
			lines.push(headers.map(() => "---").join(" | "));
			const maxRows = Math.min(rows.length, 200);
			for (let i = 0; i < maxRows; i++) {
				lines.push(rows[i].map(cell => this.formatDataviewCell(cell)).join(" | "));
			}
			if (rows.length > 200) {
				lines.push(`... and ${rows.length - 200} more rows`);
			}
			return lines.join("\n");
		}

		if (value.type === "list") {
	
			const items: any[] = value.values || [];
			if (items.length === 0) return "(No results)";
			const maxItems = Math.min(items.length, 200);
			const lines = items.slice(0, maxItems).map(
				(item: unknown) => `- ${this.formatDataviewCell(item)}`
			);
			if (items.length > 200) {
				lines.push(`... and ${items.length - 200} more items`);
			}
			return lines.join("\n");
		}

		if (value.type === "task") {
	
			const tasks: any[] = value.values || [];
			if (tasks.length === 0) return "(No tasks)";
			const maxTasks = Math.min(tasks.length, 200);
			const lines = tasks.slice(0, maxTasks).map(
		
				(task: any) => `- [${task.completed ? "x" : " "}] ${task.text || String(task)}`
			);
			if (tasks.length > 200) {
				lines.push(`... and ${tasks.length - 200} more tasks`);
			}
			return lines.join("\n");
		}

		return String(value);
	}

	private formatDataviewCell(cell: unknown): string {
		if (cell === null || cell === undefined) return "";
		if (typeof cell === "object" && cell !== null) {
			// Dataview Link object
			if ("path" in cell && typeof (cell as Record<string, unknown>).path === "string") {
				return `[[${(cell as Record<string, unknown>).path}]]`;
			}
			// Date object
			if (cell instanceof Date) {
				return cell.toISOString().split("T")[0];
			}
			// Luxon DateTime
			if ("toFormat" in cell && typeof (cell as Record<string, unknown>).toFormat === "function") {
				return (cell as { toFormat: (fmt: string) => string }).toFormat("yyyy-MM-dd");
			}
			return String(cell);
		}
		return String(cell);
	}
}
