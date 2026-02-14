# Obsidian LLM Assistant — プロジェクト開発ルール

## プロジェクト概要
Obsidian上でLLM（Claude / GPT / Gemini等）を活用するモバイルファースト設計プラグイン。

## 絶対禁止事項（モバイル互換性）
- `require('fs')`, `require('path')` → `app.vault` API を使用
- `require('child_process')` → 使用不可
- `require('electron')` → `Platform.isDesktop` でガード
- `require('crypto')` (Node.js) → `window.crypto.subtle` を使用
- `process.env` → SecretStorage でAPI鍵管理
- 正規表現の後読み `(?<=...)` → iOS Safari非対応のため禁止

## 必須ルール
- `manifest.json` の `isDesktopOnly` は必ず `false`
- 全てのファイル操作は `app.vault` API 経由
- API鍵は `SecretManager` 経由のみでアクセス
- 外部通信は `streaming.ts` の `sendRequest()` 経由
- CSSはモバイルファースト（ベースがモバイル、メディアクエリでデスクトップ拡張）
- フォントサイズ最小 16px（iOS auto-zoom防止）
- タップターゲット最小 44px（Apple HIG準拠）
- `onunload()` で全イベントリスナー・タイマーをクリーンアップ

## UIフレームワーク
- Phase 1-3: 素のDOM + Obsidian API（React/Preact不使用）
- 状態管理: プラグインインスタンスに集約

## ファイル構成
```
src/main.ts              — プラグインエントリポイント
src/constants.ts         — 定数定義
src/settings/            — 設定画面
src/ui/                  — UIコンポーネント
src/llm/                 — LLMプロバイダー
src/vault/               — Vault連携
src/security/            — セキュリティ
src/utils/               — ユーティリティ
```

## エージェント担当境界
- `src/main.ts` は共有ファイル → 統合はオーケストレーターが実施
- 各エージェントは自分の担当ディレクトリ内のみ変更

## バージョニング・コミット・Issue管理ルール

### バージョニング
- セマンティックバージョニング: `0.MINOR.PATCH` 形式
- 改修を加えるたびにPATCHを +1（0.1.0 → 0.1.1 → 0.1.2 ...）
- バージョン変更は以下の3ファイルを同時に更新:
  - `manifest.json` の `version`
  - `package.json` の `version`
  - `versions.json` に新バージョンのエントリを追加

### コミットルール
- 改修をある程度加えるたびに自律的にコミットする（細かく頻繁に）
- コミットメッセージ形式: `v0.1.X: 簡潔な変更概要 (closes #N)`
  - 対応するIssueがある場合は `closes #N` または `fixes #N` を含める
- コミット後は `git push` でGitHubに履歴を残す
- リモート: `https://github.com/m0370/obsidian-LLM.git` (origin/main)

### Issue管理
- 問題点を発見した場合は `gh issue create` でGitHub Issueとして記録
- 改良はIssueベースで進め、どのバージョンがどのIssueに対応したか追跡可能にする
- Issueラベル: `bug`, `enhancement`, `mobile`, `ux` など適宜付与

### ビルド・デプロイ
- ソース: `/Users/tgoto/Library/Mobile Documents/com~apple~CloudDocs/my web site/obsidian_LLM_plugin/`
- デプロイ先: `/Users/tgoto/Library/Mobile Documents/iCloud~md~obsidian/Documents/My Obsidian/.obsidian/plugins/obsidian-llm-assistant/`
- ビルドコマンド: `npm run build`
- デプロイ: `main.js` と `styles.css` をデプロイ先にコピー
