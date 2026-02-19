/**
 * VaultProximityScorer — Vault距離スコア計算エンジン
 *
 * アクティブノートからの「距離」を4つの指標で計算し、
 * RAG検索結果にブーストを適用する。
 *
 * 指標（内部重み固定）:
 *   LinkScore  (0.4) — WikiLinkグラフでのBFS距離（2ホップまで）
 *   FolderScore(0.3) — フォルダパス共通プレフィックス比率
 *   NameScore  (0.15) — ファイル名bigram Jaccard係数
 *   TimeScore  (0.15) — 更新日時の指数減衰
 */

import { TFile } from "obsidian";
import type { App } from "obsidian";
import type { SearchResult } from "./types";

export interface ProximityConfig {
	enabled: boolean;
	boostFactor: number; // 0.0-1.0, default 0.5
}

export class VaultProximityScorer {
	private app: App;
	private linkGraph: Map<string, Set<string>> = new Map();

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * resolvedLinks から双方向リンクグラフを構築
	 */
	buildLinkGraph(): void {
		this.linkGraph.clear();
		const resolved = this.app.metadataCache.resolvedLinks;
		for (const [source, targets] of Object.entries(resolved)) {
			if (!this.linkGraph.has(source)) this.linkGraph.set(source, new Set());
			for (const target of Object.keys(targets)) {
				this.linkGraph.get(source)!.add(target);
				// 逆方向（バックリンク）
				if (!this.linkGraph.has(target)) this.linkGraph.set(target, new Set());
				this.linkGraph.get(target)!.add(source);
			}
		}
	}

	/**
	 * 単一ファイルのリンク情報を増分更新
	 */
	updateFileInGraph(path: string): void {
		// 旧エッジを削除
		this.removeFileFromGraph(path);

		// 新エッジを追加
		const resolved = this.app.metadataCache.resolvedLinks;
		const targets = resolved[path];
		if (!targets) return;

		if (!this.linkGraph.has(path)) this.linkGraph.set(path, new Set());
		for (const target of Object.keys(targets)) {
			this.linkGraph.get(path)!.add(target);
			if (!this.linkGraph.has(target)) this.linkGraph.set(target, new Set());
			this.linkGraph.get(target)!.add(path);
		}
	}

	/**
	 * ファイル削除時にグラフからエッジを除去
	 */
	removeFileFromGraph(path: string): void {
		const neighbors = this.linkGraph.get(path);
		if (neighbors) {
			for (const neighbor of neighbors) {
				this.linkGraph.get(neighbor)?.delete(path);
			}
		}
		this.linkGraph.delete(path);
	}

	/**
	 * 検索結果にVault距離ブーストを適用
	 * finalScore = originalScore * (1 + boostFactor * proximityScore)
	 */
	applyProximityBoost(
		results: SearchResult[],
		anchorFile: TFile | null,
		config: ProximityConfig,
	): SearchResult[] {
		if (!anchorFile || !config.enabled) return results;

		const boosted = results.map((r) => {
			const ps = this.calcProximityScore(anchorFile, r.chunk.filePath);
			return {
				...r,
				score: r.score * (1 + config.boostFactor * ps),
				proximityScore: ps,
			};
		});
		return boosted.sort((a, b) => b.score - a.score);
	}

	/**
	 * 総合距離スコアを計算（0-1）
	 */
	private calcProximityScore(anchor: TFile, targetPath: string): number {
		const link = this.calcLinkScore(anchor.path, targetPath);
		const folder = this.calcFolderScore(anchor.path, targetPath);
		const name = this.calcNameScore(anchor.basename, this.getBasename(targetPath));
		const time = this.calcTimeScore(anchor, targetPath);

		return 0.4 * link + 0.3 * folder + 0.15 * name + 0.15 * time;
	}

	/**
	 * LinkScore: BFS 2ホップ（1hop→0.8, 2hop→0.4, それ以外→0.0）
	 */
	private calcLinkScore(anchorPath: string, targetPath: string): number {
		if (anchorPath === targetPath) return 1.0;

		const neighbors = this.linkGraph.get(anchorPath);
		if (!neighbors) return 0.0;

		// 1ホップ
		if (neighbors.has(targetPath)) return 0.8;

		// 2ホップ
		for (const mid of neighbors) {
			const midNeighbors = this.linkGraph.get(mid);
			if (midNeighbors?.has(targetPath)) return 0.4;
		}

		return 0.0;
	}

	/**
	 * FolderScore: パスセグメント共通プレフィックス比率
	 */
	private calcFolderScore(anchorPath: string, targetPath: string): number {
		const aSeg = this.getFolderSegments(anchorPath);
		const tSeg = this.getFolderSegments(targetPath);
		const maxLen = Math.max(aSeg.length, tSeg.length);
		if (maxLen === 0) return 1.0; // 両方ルート直下

		let common = 0;
		for (let i = 0; i < Math.min(aSeg.length, tSeg.length); i++) {
			if (aSeg[i] === tSeg[i]) common++;
			else break;
		}
		return common / maxLen;
	}

	/**
	 * NameScore: bigram Jaccard係数（拡張子除外）
	 */
	private calcNameScore(anchorName: string, targetName: string): number {
		const aBigrams = this.getBigrams(anchorName.toLowerCase());
		const tBigrams = this.getBigrams(targetName.toLowerCase());

		if (aBigrams.size === 0 && tBigrams.size === 0) return 1.0;
		if (aBigrams.size === 0 || tBigrams.size === 0) return 0.0;

		let intersection = 0;
		for (const b of aBigrams) {
			if (tBigrams.has(b)) intersection++;
		}
		const union = aBigrams.size + tBigrams.size - intersection;
		return union > 0 ? intersection / union : 0.0;
	}

	/**
	 * TimeScore: exp(-diff / 7日) 指数減衰
	 */
	private calcTimeScore(anchor: TFile, targetPath: string): number {
		const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
		if (!(targetFile instanceof TFile)) return 0.0;

		const anchorMtime = anchor.stat.mtime;
		const targetMtime = targetFile.stat.mtime;
		const diffMs = Math.abs(anchorMtime - targetMtime);
		const diffDays = diffMs / (1000 * 60 * 60 * 24);

		return Math.exp(-diffDays / 7);
	}

	/**
	 * クリーンアップ
	 */
	destroy(): void {
		this.linkGraph.clear();
	}

	// --- ユーティリティ ---

	private getFolderSegments(filePath: string): string[] {
		const lastSlash = filePath.lastIndexOf("/");
		if (lastSlash === -1) return [];
		return filePath.substring(0, lastSlash).split("/");
	}

	private getBasename(filePath: string): string {
		const lastSlash = filePath.lastIndexOf("/");
		const fileName = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
		const dotIndex = fileName.lastIndexOf(".");
		return dotIndex >= 0 ? fileName.substring(0, dotIndex) : fileName;
	}

	private getBigrams(str: string): Set<string> {
		const bigrams = new Set<string>();
		for (let i = 0; i < str.length - 1; i++) {
			bigrams.add(str.substring(i, i + 2));
		}
		return bigrams;
	}
}
