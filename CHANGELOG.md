# Changelog

All notable changes to the Obsidian LLM Assistant plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.15] - 2026-02-19

### Added
- `vault_list` tool: LLM can now list files/folders in the vault with sorting, filtering, and pagination ([#53](https://github.com/m0370/obsidian-LLM/issues/53))
- `dataview_query` tool: LLM can execute Dataview DQL queries when the Dataview plugin is installed ([#53](https://github.com/m0370/obsidian-LLM/issues/53))
- Dataview install suggestion: when Dataview is not installed, LLM is instructed to suggest it for advanced queries

## [0.4.14] - 2026-02-19

### Changed
- Anthropic (Claude) now uses real SSE streaming via `fetch()` instead of chunked simulation via `requestUrl()` ([#52](https://github.com/m0370/obsidian-LLM/issues/52))
- Deploy procedure updated to include `manifest.json` copy

## [0.4.13] - 2026-02-19

### Fixed
- RAG index cache reliability: save cache after buildIndex/buildIndexFromCache completion, not only on destroy ([#26](https://github.com/m0370/obsidian-LLM/issues/26), [#32](https://github.com/m0370/obsidian-LLM/issues/32))
- RAG startup performance: mtime-based fast check skips SHA-256 hash computation for unchanged files
- Debounced auto-save (30s) after incremental file updates to prevent cache staleness
- Cache version bumped to v2 (old v1 caches trigger automatic full rebuild)

## [0.4.12] - 2026-02-19

### Added
- eslint-plugin-obsidianmd integration for local Obsidian Review Bot-equivalent code scanning
- `npm run lint` / `npm run lint:fix` scripts
- Lint-pass required before build/deploy in CLAUDE.md workflow

## [0.4.11] - 2026-02-19

### Added
- Vault Proximity Score: RAG search results are now boosted based on Vault structure (WikiLinks, folder distance, filename similarity, modification time) ([#46](https://github.com/m0370/obsidian-LLM/issues/46))
- Settings UI for enabling/disabling Proximity Score and adjusting boost strength (0.0–1.0)

## [0.4.10] - 2026-02-19

### Added
- Toggle switches to enable/disable OpenRouter and Ollama providers ([#50](https://github.com/m0370/obsidian-LLM/issues/50))

### Fixed
- Mobile layout issues for buttons inside the Advanced Settings section

## [0.4.9] - 2026-02-18

### Added
- Welcome message displayed on first launch
- Code block copy button for easy code snippet copying ([#39](https://github.com/m0370/obsidian-LLM/issues/39))
- Send button visual state changes to indicate availability ([#40](https://github.com/m0370/obsidian-LLM/issues/40), [#43](https://github.com/m0370/obsidian-LLM/issues/43))

### Fixed
- Updated Anthropic models to latest stable versions (Sonnet 4.6, Haiku alias fix)
- Improved fetchModels filtering to return only the latest stable models per provider
- Unified `style.display` usage to `is-hidden` CSS class; fixed capitalization in settings labels

## [0.4.8] - 2026-02-18

### Fixed
- Model list updates in Settings now propagate to ChatView in real time ([#48](https://github.com/m0370/obsidian-LLM/issues/48))

## [0.4.7] - 2026-02-18

### Added
- Stop and regenerate buttons for in-progress responses
- Scroll-to-bottom button for long conversations
- Three-tier keyboard handling: Capacitor Keyboard API for precise keyboard height detection, eliminating the gap between input field and keyboard on iOS ([#49](https://github.com/m0370/obsidian-LLM/issues/49))

## [0.4.6] - 2026-02-17

### Fixed
- Addressed remaining Required items from the Obsidian Community Plugin Review Bot

## [0.4.5] - 2026-02-17

### Fixed
- All issues reported by the Obsidian Community Plugin Review Bot
- `onOpen`/`onClose` async-without-await warnings; migrated ChatInput to `setCssStyles`

## [0.4.4] - 2026-02-16

### Added
- Desktop-only warning when selecting Ollama on mobile devices ([#35](https://github.com/m0370/obsidian-LLM/issues/35))

## [0.4.3] - 2026-02-16

### Changed
- Settings screen now uses collapsible accordion sections ([#30](https://github.com/m0370/obsidian-LLM/issues/30))
- New chat icon updated ([#31](https://github.com/m0370/obsidian-LLM/issues/31))

## [0.4.2] - 2026-02-16

### Added
- Persistent RAG index cache to avoid unnecessary rebuilds on startup

## [0.4.1] - 2026-02-16

### Fixed
- Embedding search robustness: corrected Gemini `taskType`, expanded RRF candidate pool, prioritized recently edited files for embedding

## [0.4.0] - 2026-02-16

### Added
- Embedding-based semantic search with hybrid RAG (Phase 2) ([#29](https://github.com/m0370/obsidian-LLM/issues/29))

## [0.3.0] - 2026-02-16

### Added
- RAG Phase 1: TF-IDF full-text search with `vault_search` tool ([#25](https://github.com/m0370/obsidian-LLM/issues/25), [#26](https://github.com/m0370/obsidian-LLM/issues/26))
- Automatic RAG index building on startup
- Gemini 3 `thought_signature` support with raw parts preservation during Function Calling

### Changed
- Removed o4-mini from model list (model deprecated); updated model roster

### Fixed
- Improved `requestUrl` 400 error fallback: retry without tools and show detailed error messages

## [0.2.2] - 2026-02-16

### Fixed
- Ollama connection errors by adding `requestUrl()` fallback from `fetch()` ([#27](https://github.com/m0370/obsidian-LLM/issues/27))

## [0.2.1] - 2026-02-16

### Fixed
- Chat messages could not be sent when using providers that do not require an API key ([#27](https://github.com/m0370/obsidian-LLM/issues/27))

## [0.2.0] - 2026-02-15

### Changed
- Plugin ID changed to `llm-assistant` for community plugin submission
- Added English README for Obsidian Community Plugins listing

## [0.1.14] - 2026-02-15

### Added
- Anthropic `fetchModels` support; Gemini model filter improvements

### Fixed
- iPad portrait layout issue with API key input fields ([#18](https://github.com/m0370/obsidian-LLM/issues/18))
- Gemini `fetchModels` refined to four curated models
- Settings screen CSS corrections

## [0.1.13] - 2026-02-15

### Added
- User-friendly error messages for API rate limit responses ([#24](https://github.com/m0370/obsidian-LLM/issues/24))

## [0.1.12] - 2026-02-15

### Added
- Tool Use support for all LLM providers ([#15](https://github.com/m0370/obsidian-LLM/issues/15), [#16](https://github.com/m0370/obsidian-LLM/issues/16))
- Dynamic model list fetched from each provider ([#9](https://github.com/m0370/obsidian-LLM/issues/9))

### Fixed
- Model metadata corrections; disabled streaming during Tool Use calls

## [0.1.11] - 2026-02-15

### Changed
- Complete rewrite of iOS keyboard detection: migrated through Visual Viewport API, polling-based detection, three-tier fallback, and finally focus-based detection (removed Visual Viewport entirely)

### Fixed
- iPad icon visibility issue ([#23](https://github.com/m0370/obsidian-LLM/issues/23))
- Removed debug overlay

## [0.1.10] - 2026-02-15

### Changed
- Major layout overhaul: removed action bar, integrated Send button into input area, relocated menu

## [0.1.9] - 2026-02-15

### Fixed
- Bottom area vertical space efficiency improvements ([#22](https://github.com/m0370/obsidian-LLM/issues/22), [#12](https://github.com/m0370/obsidian-LLM/issues/12), [#13](https://github.com/m0370/obsidian-LLM/issues/13))
- iOS keyboard interaction fixes

## [0.1.8] - 2026-02-15

### Added
- Version number display in the settings screen

## [0.1.7] - 2026-02-15

### Changed
- Migrated Anthropic integration to the Tool Use API ([#17](https://github.com/m0370/obsidian-LLM/issues/17))

## [0.1.6] - 2026-02-15

### Changed
- Mobile UI redesign with Gemini-style action bar ([#13](https://github.com/m0370/obsidian-LLM/issues/13))

### Fixed
- iOS keyboard interaction issues

## [0.1.5] - 2026-02-15

### Fixed
- Diff computation moved to asynchronous execution to prevent UI blocking ([#8](https://github.com/m0370/obsidian-LLM/issues/8))

## [0.1.4] - 2026-02-15

### Fixed
- Gemini SSE (Server-Sent Events) parsing made more robust ([#6](https://github.com/m0370/obsidian-LLM/issues/6))

## [0.1.3] - 2026-02-15

### Removed
- Plaintext API key storage mode completely removed ([#5](https://github.com/m0370/obsidian-LLM/issues/5))

## [0.1.2] - 2026-02-15

### Fixed
- Vault write operations corrected ([#11](https://github.com/m0370/obsidian-LLM/issues/11))
- Input field focus behavior improved
- iOS keyboard handling stabilized

## [0.1.1] - 2026-02-15

### Fixed
- iPhone compatibility issues ([#1](https://github.com/m0370/obsidian-LLM/issues/1), [#2](https://github.com/m0370/obsidian-LLM/issues/2), [#3](https://github.com/m0370/obsidian-LLM/issues/3))
- Vault read operations stabilized
- Development rules and project configuration established

## [0.1.0] - 2026-02-14

### Added
- Initial release of LLM Assistant for Obsidian
- Multi-provider support: Claude (Anthropic), GPT (OpenAI), Gemini (Google), Ollama, OpenRouter
- Chat interface with streaming responses
- Vault integration tools: `vault_read`, `vault_write`, `vault_list`
- Secure API key storage via Obsidian SecretStorage
- Mobile-first responsive design
- Settings screen with provider/model configuration

---

# Changelog (Japanese / 日本語版)

Obsidian LLM Assistantプラグインの全ての注目すべき変更点を記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づいています。

## [0.4.15] - 2026-02-19

### 追加
- `vault_list`ツール: LLMがVault内のファイル/フォルダ一覧をソート・フィルタ・ページネーション付きで取得可能に ([#53](https://github.com/m0370/obsidian-LLM/issues/53))
- `dataview_query`ツール: Dataviewプラグインインストール時にLLMがDQLクエリを実行可能に ([#53](https://github.com/m0370/obsidian-LLM/issues/53))
- Dataview未インストール時の案内: 高度なクエリが必要な場面でDataviewインストールを提案するようLLMに指示

## [0.4.14] - 2026-02-19

### 変更
- Anthropic (Claude) のストリーミングを実SSE方式に変更 — `requestUrl()` 擬似描画から `fetch()` リアルタイムストリーミングへ ([#52](https://github.com/m0370/obsidian-LLM/issues/52))
- デプロイ手順に `manifest.json` コピーを追加

## [0.4.13] - 2026-02-19

### 修正
- RAGインデックスキャッシュの信頼性向上 — buildIndex/buildIndexFromCache完了後にも保存（destroy時のみだった問題を修正） ([#26](https://github.com/m0370/obsidian-LLM/issues/26), [#32](https://github.com/m0370/obsidian-LLM/issues/32))
- RAG起動パフォーマンス改善 — mtime高速チェックで未変更ファイルのSHA-256ハッシュ計算をスキップ
- 増分更新後の30秒デバウンス付き自動キャッシュ保存を追加
- キャッシュバージョンをv2に更新（旧v1キャッシュは自動フル再構築）

## [0.4.12] - 2026-02-19

### 追加
- eslint-plugin-obsidianmd 導入 — ObsidianReviewBotと同等のコードスキャンをローカルで実行可能に
- `npm run lint` / `npm run lint:fix` スクリプト追加
- CLAUDE.mdのデプロイ手順にlint通過を必須化

## [0.4.10] - 2026-02-19

### 追加
- OpenRouter/Ollamaプロバイダーの有効/無効トグルを追加 ([#50](https://github.com/m0370/obsidian-LLM/issues/50))

### 修正
- 高度な設定内ボタンのモバイルレイアウト崩れを修正

## [0.4.9] - 2026-02-18

### 追加
- ウェルカムメッセージの表示 ([#39](https://github.com/m0370/obsidian-LLM/issues/39))
- コードブロックのコピーボタン ([#40](https://github.com/m0370/obsidian-LLM/issues/40))
- Sendボタンの状態変化による視覚的フィードバック ([#43](https://github.com/m0370/obsidian-LLM/issues/43))

### 修正
- Anthropicモデルを最新安定版に更新 (Sonnet 4.6, Haiku alias修正)
- fetchModelsで各プロバイダーの最新安定版のみ返すようフィルタリング強化
- `style.display`を`is-hidden`クラスに統一、設定ラベルの大文字修正

## [0.4.8] - 2026-02-18

### 修正
- 設定画面のモデルリスト更新をChatViewに連動 ([#48](https://github.com/m0370/obsidian-LLM/issues/48))

## [0.4.7] - 2026-02-18

### 追加
- 停止/再生成ボタンの追加
- スクロールボタンの追加
- キーボード対応の3層化: Capacitor Keyboard APIで正確なキーボード高さ(px)を取得し、入力欄とキーボードの隙間を解消 ([#49](https://github.com/m0370/obsidian-LLM/issues/49))

## [0.4.6] - 2026-02-17

### 修正
- ObsidianReviewBot指摘修正 — 残りのRequired項目対応

## [0.4.5] - 2026-02-17

### 修正
- Obsidian Community Plugin Review Botの全指摘を修正
- `onOpen`/`onClose` async-without-await対策、ChatInputの`setCssStyles`移行

## [0.4.4] - 2026-02-16

### 追加
- モバイル環境でOllama選択時にPC専用警告を表示 ([#35](https://github.com/m0370/obsidian-LLM/issues/35))

## [0.4.3] - 2026-02-16

### 変更
- 設定画面をアコーディオン形式に変更 ([#30](https://github.com/m0370/obsidian-LLM/issues/30))
- 新規チャットアイコンを変更 ([#31](https://github.com/m0370/obsidian-LLM/issues/31))

## [0.4.2] - 2026-02-16

### 追加
- RAGインデックスキャッシュの永続化 — 起動時の不要な再構築を回避

## [0.4.1] - 2026-02-16

### 修正
- Embedding検索の堅牢性改善 — Gemini taskType修正、RRF候補拡大、編集ファイル優先Embedding

## [0.4.0] - 2026-02-16

### 追加
- Embedding検索 + ハイブリッドRAG実装 (Phase 2) ([#29](https://github.com/m0370/obsidian-LLM/issues/29))

## [0.3.0] - 2026-02-16

### 追加
- RAG機能Phase 1実装 — TF-IDF全文検索 + `vault_search`ツール ([#25](https://github.com/m0370/obsidian-LLM/issues/25), [#26](https://github.com/m0370/obsidian-LLM/issues/26))
- 起動時RAGインデックス自動構築
- Gemini 3 `thought_signature`対応 — Function Calling時のrawParts保持

### 変更
- o4-mini廃止に伴うモデルリスト更新

### 修正
- `requestUrl` 400エラー時のフォールバック改善 — ツールなしリトライ + 詳細エラーメッセージ

## [0.2.2] - 2026-02-16

### 修正
- Ollama接続エラーを修正 — `fetch()`から`requestUrl()`へのフォールバック追加 ([#27](https://github.com/m0370/obsidian-LLM/issues/27))

## [0.2.1] - 2026-02-16

### 修正
- APIキー不要なプロバイダーでチャット送信できない問題を修正 ([#27](https://github.com/m0370/obsidian-LLM/issues/27))

## [0.2.0] - 2026-02-15

### 変更
- プラグインIDを`llm-assistant`に変更 — コミュニティプラグイン申請準備
- 英語版READMEの追加

## [0.1.14] - 2026-02-15

### 追加
- Anthropic fetchModels追加、Geminiモデルフィルタ強化

### 修正
- iPad縦画面でのAPIキー入力欄レイアウト修正 ([#18](https://github.com/m0370/obsidian-LLM/issues/18))
- Gemini fetchModelsを4モデルに厳選
- 設定画面CSS修正

## [0.1.13] - 2026-02-15

### 追加
- APIレート制限時のユーザーフレンドリーなエラー表示 ([#24](https://github.com/m0370/obsidian-LLM/issues/24))

## [0.1.12] - 2026-02-15

### 追加
- 全プロバイダーTool Use対応 ([#15](https://github.com/m0370/obsidian-LLM/issues/15), [#16](https://github.com/m0370/obsidian-LLM/issues/16))
- 動的モデルリスト取得 ([#9](https://github.com/m0370/obsidian-LLM/issues/9))

### 修正
- モデル情報修正、Tool Use時ストリーミング無効化

## [0.1.11] - 2026-02-15

### 変更
- iOSキーボード検出を全面刷新: Visual Viewport API → ポーリング検出 → 3段階フォールバック → フォーカスベース検出に最終移行（visualViewport完全廃止）

### 修正
- iPadアイコン非表示修正 ([#23](https://github.com/m0370/obsidian-LLM/issues/23))
- デバッグオーバーレイ削除

## [0.1.10] - 2026-02-15

### 変更
- レイアウト大幅改修 — アクションバー撤廃、Send統合、メニュー移動

## [0.1.9] - 2026-02-15

### 修正
- ボトムエリア縦スペース効率化 ([#22](https://github.com/m0370/obsidian-LLM/issues/22), [#12](https://github.com/m0370/obsidian-LLM/issues/12), [#13](https://github.com/m0370/obsidian-LLM/issues/13))
- iOSキーボード修正

## [0.1.8] - 2026-02-15

### 追加
- 設定画面にバージョン番号を表示

## [0.1.7] - 2026-02-15

### 変更
- Anthropic Tool Use API移行 ([#17](https://github.com/m0370/obsidian-LLM/issues/17))

## [0.1.6] - 2026-02-15

### 変更
- モバイルUI刷新 — Gemini風アクションバー追加 ([#13](https://github.com/m0370/obsidian-LLM/issues/13))

### 修正
- iOSキーボード修正

## [0.1.5] - 2026-02-15

### 修正
- 差分計算の非同期化 — UIブロッキングを防止 ([#8](https://github.com/m0370/obsidian-LLM/issues/8))

## [0.1.4] - 2026-02-15

### 修正
- Gemini SSEパースの堅牢化 ([#6](https://github.com/m0370/obsidian-LLM/issues/6))

## [0.1.3] - 2026-02-15

### 削除
- APIキー平文保存モードの完全廃止 ([#5](https://github.com/m0370/obsidian-LLM/issues/5))

## [0.1.2] - 2026-02-15

### 修正
- vault_write修正 ([#11](https://github.com/m0370/obsidian-LLM/issues/11))
- 入力フォーカス改善
- iOSキーボード対応

## [0.1.1] - 2026-02-15

### 修正
- iPhone対応修正 ([#1](https://github.com/m0370/obsidian-LLM/issues/1), [#2](https://github.com/m0370/obsidian-LLM/issues/2), [#3](https://github.com/m0370/obsidian-LLM/issues/3))
- vault_read安定化
- 開発ルール整備

## [0.1.0] - 2026-02-14

### 追加
- LLM Assistant for Obsidian 初回リリース
- マルチプロバイダー対応: Claude (Anthropic), GPT (OpenAI), Gemini (Google), Ollama, OpenRouter
- ストリーミングレスポンス付きチャットインターフェース
- Vault連携ツール: `vault_read`, `vault_write`, `vault_list`
- Obsidian SecretStorageによるAPIキーのセキュア管理
- モバイルファースト設計のレスポンシブUI
- プロバイダー/モデル設定画面
