# Obsidian Plugin Development Requirements (2026 Edition)

## 1. プロジェクト概要
**ターゲット:** Claude 4.6 / GPT-5 / Gemini 3.0 世代のLLMを活用した次世代Obsidianプラグイン
**開発コンセプト:** モバイルファースト設計、広大な執筆スペースの確保、および高度なVault理解（RAG）の統合。

---

## 2. ユーザー要望 (Core Requirements)

### プラットフォーム・互換性
* **マルチプラットフォーム:** Mac, Windows, iPad, iPhone, Android のすべてで動作すること。
* **iPhone対応の徹底:** デスクトップ専用APIを排除し、iPhoneでも完全に動作すること。
* **レスポンシブUI:** デバイス（PC/スマホ/タブレット）に応じて画面表示を自動調節し、視認性を損なわないこと。

### LLM・API機能
* **最新モデルへの対応:** * GPT-5 / GPT-5.2
    * Gemini 3.0 Flash / Gemini 3.0 Pro
    * Claude 4.6 Opus / Sonnet / Haiku
* **柔軟な接続:** 有料モデルのAPI利用に加え、API不要の廉価・旧式モデル（ローカルLLM等）の利用オプション。
* **セキュアな認証:** APIキーをプラグイン内で保持し、可能な限り暗号化して保存すること。

### UI/UX デザイン
* **直感的な操作:** 画面右端からのドラッグ（サイドバー形式）で起動。
* **広い作業領域:** 既存の "Copilot" プラグインの課題（入力・表示エリアの狭さ）を解決し、プロンプト入力欄と回答表示欄を十分に広く確保すること。

---

## 3. 技術仕様（2026年版 Obsidian API準拠）

### A. クロスプラットフォーム実装
* **Mobile-Safe API:** `fs` や `child_process` を避け、`app.vault` および `requestUrl` を使用。
* **UIフレームワーク:** Obsidianの `WorkspaceLeaf` を基本とし、モバイル版では全画面ドロワーに切り替わるCSS設計を採用。

### B. セキュリティ (SecretStorage)
* Obsidian v1.11以降の `SecretStorage` API（またはOS標準のキーチェーン）を利用し、APIキーを平文ではなくデバイス固有の安全な領域に保存。

### C. 視認性最適化 (Adaptive UI)
| デバイス | UI実装方針 |
| :--- | :--- |
| **PC** | 可変幅サイドバー。入力欄の自動伸長（Auto-expanding textarea）。 |
| **Tablet** | 分割画面（Split View）に最適化したフォントサイズ設定。 |
| **Mobile** | オーバーレイ・ドロワー。16px以上のフォント（iOSのズーム防止）とタップターゲットの拡大。 |

---

## 4. 機能要件チェックリスト

- [ ] **Vaultコンテキスト認識:** 現在のファイルおよびVault全体のセマンティック検索によるRAG機能。
- [ ] **ストリーミング回答:** リアルタイムでのテキスト生成表示。
- [ ] **モデルスイッチャー:** UI上での即時モデル切り替え。
- [ ] **ローカルフォールバック:** WebLLM / WASM を用いたデバイス内推論のサポート。

---

## 5. 参照リソース
* **Obsidian Developer Docs:** [Plugin API](https://docs.obsidian.md/Home)
* **Mobile UI Updates:** Obsidian Mobile 2.0 (v1.11+) のレスポンシブ設計ガイドライン