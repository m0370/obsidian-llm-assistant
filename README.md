# LLM Assistant for Obsidian

Chat with multiple LLMs (Claude, GPT, Gemini) in your vault. Mobile-first design with secure API key management.

**Works on all platforms** — iPhone / iPad / Mac / Windows / Android.

---

## English Documentation

### Features

- **Chat UI** — Real-time streaming with Markdown rendering
- **Multi-provider support** — Switch between 6 LLM providers from the header selector
- **Note context** — Attach vault notes as context for LLM conversations (with token count display)
- **Vault file read/write** — LLM can read and propose edits to vault files via tool use or text tags
- **Quick actions** — Summarize, translate, proofread, explain, or expand selected text from the editor context menu
- **Conversation history** — Auto-save, browse, resume, and delete past conversations
- **System prompt presets** — 6 built-in presets (polite Japanese assistant, technical writer, translator, etc.)
- **Secure API key management** — SecretStorage API / WebCrypto encryption / plaintext (3 levels)
- **Responsive design** — Optimized for smartphone, tablet, and desktop

### Supported Providers

| Provider | Example Models | API Key | Streaming | Notes |
|:---|:---|:---:|:---:|:---|
| **OpenAI** | GPT-5, GPT-5.2 | Required | Yes | |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.5, Haiku 4.5 | Required | Chunked | Uses requestUrl() due to CORS |
| **Google Gemini** | Gemini 2.5 Flash/Pro | Required | Yes | |
| **OpenRouter** | Claude, GPT, Llama, DeepSeek, etc. | Required | Yes | Unified access to multiple provider models |
| **Ollama** | Llama 3.3, Gemma 3, Qwen 3 | Not required | Yes | Desktop only, local execution |
| **Custom** | User-specified | Optional | Yes | Connect to any OpenAI-compatible API |

### Requirements

- **Obsidian** v1.11.4 or later
- **API key** for your chosen provider (except Ollama)
- For Ollama: [Ollama](https://ollama.com/) installed on your desktop

### Installation

#### Community Plugin (after approval)

1. Open Obsidian **Settings**
2. Go to **Community plugins** > **Browse**
3. Search for "LLM Assistant"
4. Click **Install**

#### Via BRAT (beta testing)

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community plugins
2. Open Command Palette (`Ctrl/Cmd + P`) and run "BRAT: Add a beta plugin for testing"
3. Enter the repository URL: `m0370/obsidian-llm-assistant`
4. The plugin will be automatically downloaded and installed

#### Manual Installation

1. Download the following 3 files from [GitHub Releases](https://github.com/m0370/obsidian-llm-assistant/releases):
   - `main.js`
   - `styles.css`
   - `manifest.json`
2. Create folder `.obsidian/plugins/llm-assistant/` in your vault
3. Place the 3 downloaded files in this folder
4. Restart or reload Obsidian
5. Enable "LLM Assistant" in **Settings** > **Community plugins**

### Usage

#### Setup

1. After enabling the plugin, click the ribbon icon (chat bubble) in the left sidebar, or run "LLM Assistant: Open Chat Panel" from the Command Palette
2. The chat panel opens in the right side pane
3. Open settings (gear icon in chat header, or Obsidian Settings > LLM Assistant)
4. Enter the **API key** for your chosen provider
5. Click "Test" to verify the API key

#### Chat

1. Select a **provider and model** from the header dropdown
2. Type your message in the text area at the bottom
3. Press `Enter` or the send button to send (`Shift + Enter` for new line)
4. The assistant's response streams in real-time with Markdown rendering
5. Click "+" to start a new chat (current conversation is auto-saved)

#### Note Attachment

Attach vault notes as context for LLM conversations:

- **Paperclip button** — Attach the currently active note
- **Folder button** — Pick a file from the file picker

Attached notes appear in the context bar with token counts. Remove individually with the x button.

#### Quick Actions

Select text in the editor and right-click (or long-press on mobile) to access:

| Action | Description |
|:---|:---|
| LLM: Summarize | Summarize selected text concisely |
| LLM: Translate to English | Translate to English |
| LLM: Translate to Japanese | Translate to Japanese |
| LLM: Proofread | Check grammar and suggest corrections |
| LLM: Explain | Explain in an easy-to-understand way |
| LLM: Expand | Elaborate on the selected text |

#### Conversation History

- Click the history icon in the header menu to view past conversations
- Click a conversation to resume it
- Delete unwanted conversations with the x button
- Conversations are auto-saved when you send a message

#### System Prompt Presets

Select a preset from the dropdown in settings:

| Preset | Purpose |
|:---|:---|
| Default | No preset |
| Polite Japanese Assistant | Responds politely in Japanese |
| Technical Writer | Technical documentation support |
| Creative Writer | Creative writing assistance |
| Translator | Professional translation with nuance preservation |
| Code Reviewer | Code quality and security review |

### Settings

| Category | Setting | Description |
|:---|:---|:---|
| **LLM** | Provider | Select the LLM provider |
| | Model | Select the model |
| **Security** | API key storage | SecretStorage (recommended) / WebCrypto encryption / Plaintext |
| | Master password | Shown only for WebCrypto. Kept in memory for session only |
| **API Keys** | Per-provider API keys | With test and delete buttons |
| **Custom Endpoint** | Endpoint URL | URL of an OpenAI-compatible API |
| | Model ID | Model identifier to use |
| **Advanced** | Streaming mode | Real-time response display (on/off) |
| | Temperature | Generation creativity (0.0-1.0) |
| | Preset | System prompt template selection |
| | System prompt | Default instruction to LLM (free text) |

### Security

API key storage has 3 levels:

| Level | Method | Description |
|:---|:---|:---|
| **Recommended** | SecretStorage API | Uses OS-level secure storage (macOS Keychain, etc.). Requires Obsidian v1.11.4+ |
| **Alternative** | WebCrypto encryption | PBKDF2 (100k iterations) + AES-256-GCM encryption. Requires master password (session-only) |
| **Not recommended** | Plaintext | Stored unencrypted in plugin data. For development/testing only (warning displayed) |

### Migration from previous versions

If you previously installed the plugin under the ID `obsidian-llm-assistant` (via BRAT or manually), you need to rename the plugin folder:

1. Close Obsidian
2. Rename `.obsidian/plugins/obsidian-llm-assistant/` to `.obsidian/plugins/llm-assistant/`
3. Reopen Obsidian

Your conversation history and settings will be preserved.

### Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (file watching)
npm run dev

# Run tests
npm test

# Mobile compatibility check
npm run check-mobile
```

### License

[MIT License](LICENSE)

---

---

## Japanese Documentation

Obsidian上でLLM（大規模言語モデル）を活用し、ノート執筆支援やVault内ファイルの理解を行うプラグインです。

**モバイルファースト設計** — iPhone / iPad / Mac / Windows / Android の全プラットフォームで動作します。

---

### 概要

既存のObsidian向けLLMプラグインの多くは、機能過多でUIが煩雑になり、プロンプト入力画面や出力結果の表示スペースが狭いという課題がありました。また、iPhoneやiPadでは動作しないプラグインも少なくありません。

LLM Assistantは以下の方針で設計されています:

- 広い入出力スペースを確保したシンプルなチャットUI
- 全プラットフォーム（iPhone/iPad/Mac/Windows/Android）での動作保証
- 複数のLLMプロバイダーに対応（APIキーがあればすぐに使える）
- API鍵の安全な保管（SecretStorage / WebCrypto暗号化）

---

### 機能一覧

- **チャットUI** — ストリーミング対応のリアルタイム表示、Markdownレンダリング
- **マルチプロバイダー対応** — 6種類のLLMプロバイダーをヘッダーのセレクタで切り替え
- **ノート添付コンテキスト** — Vault内のノートをコンテキストとしてLLMに送信（トークンカウント表示付き）
- **Vaultファイルの読み込み・編集** — LLMがTool UseまたはテキストタグでVaultファイルを読み取り、編集を提案
- **クイックアクション** — エディタの右クリックメニューから選択テキストを要約・翻訳・校正・解説・展開
- **会話履歴** — 会話の自動保存・一覧表示・再開・削除
- **システムプロンプトプリセット** — 丁寧な日本語アシスタント、テクニカルライター、翻訳者など6種類
- **セキュアなAPI鍵管理** — SecretStorage API / WebCrypto暗号化 / 平文の3段階から選択
- **レスポンシブデザイン** — スマートフォン・タブレット・デスクトップそれぞれに最適化

---

### 対応LLMプロバイダー

| プロバイダー | モデル例 | APIキー | ストリーミング | 備考 |
|:---|:---|:---:|:---:|:---|
| **OpenAI** | GPT-5, GPT-5.2 | 必要 | 対応 | |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.5, Haiku 4.5 | 必要 | 段階描画 | CORS非対応のためrequestUrl()使用 |
| **Google Gemini** | Gemini 2.5 Flash/Pro | 必要 | 対応 | |
| **OpenRouter** | Claude, GPT, Llama, DeepSeek等 | 必要 | 対応 | 複数プロバイダーのモデルを統合アクセス |
| **Ollama** | Llama 3.3, Gemma 3, Qwen 3 等 | 不要 | 対応 | デスクトップ専用、ローカル実行 |
| **カスタム** | ユーザー指定 | 任意 | 対応 | OpenAI互換APIの任意URLに接続 |

---

### 動作要件

- **Obsidian** v1.11.4 以上
- 各プロバイダーの**APIキー**（Ollamaを除く）
- Ollamaを使用する場合は、デスクトップ環境に[Ollama](https://ollama.com/)がインストールされていること

---

### 入手方法

#### 方法1: Obsidianコミュニティプラグイン（公開後）

1. Obsidianの **設定** を開く
2. **コミュニティプラグイン** > **閲覧** をクリック
3. 「LLM Assistant」を検索
4. **インストール** をクリック

#### 方法2: BRAT経由（ベータテスト用）

[BRAT（Beta Reviewer's Auto-update Tool）](https://github.com/TfTHacker/obsidian42-brat) を使えば、コミュニティプラグインに未登録のプラグインもインストールできます。

1. Obsidianのコミュニティプラグインから **BRAT** をインストール・有効化
2. コマンドパレット（`Ctrl/Cmd + P`）を開き、「BRAT: Add a beta plugin for testing」を実行
3. リポジトリURL `m0370/obsidian-llm-assistant` を入力
4. 自動的にプラグインがダウンロード・インストールされます

#### 方法3: 手動インストール

1. [GitHub Releases](https://github.com/m0370/obsidian-llm-assistant/releases) から最新リリースの以下3ファイルをダウンロード:
   - `main.js`
   - `styles.css`
   - `manifest.json`
2. Vaultの `.obsidian/plugins/llm-assistant/` フォルダを作成
3. ダウンロードした3ファイルをこのフォルダに配置
4. Obsidianを再起動（またはリロード）
5. **設定** > **コミュニティプラグイン** で「LLM Assistant」を有効化

---

### アンインストール方法

#### Obsidian設定画面から

1. **設定** > **コミュニティプラグイン** を開く
2. 「LLM Assistant」の右にあるトグルをオフにして**無効化**
3. プラグイン名をクリックして詳細を開き、**アンインストール** をクリック

#### 手動削除

`.obsidian/plugins/llm-assistant/` フォルダを削除し、Obsidianを再起動してください。

> 会話履歴データは `.obsidian/plugins/llm-assistant/conversations/` に保存されています。プラグイン削除時に一緒に削除されます。

---

### 旧バージョンからの移行

以前 `obsidian-llm-assistant` というIDでプラグインをインストールしていた場合（BRAT経由や手動インストール）、プラグインフォルダのリネームが必要です:

1. Obsidianを終了
2. `.obsidian/plugins/obsidian-llm-assistant/` を `.obsidian/plugins/llm-assistant/` にリネーム
3. Obsidianを再起動

会話履歴と設定はそのまま引き継がれます。

---

### 使い方

#### 初期設定

1. **プラグインを有効化**後、左サイドバーのリボンアイコン（吹き出しマーク）をクリック、またはコマンドパレットから「LLM Assistant: チャットパネルを開く」を実行
2. 右サイドパネルにチャット画面が表示されます
3. **設定画面を開く**（チャットヘッダーの歯車ボタン、またはObsidian設定 > LLM Assistant）
4. 使用したいプロバイダーの**APIキー**を入力
5. 「テスト」ボタンでAPIキーの有効性を確認

#### チャットの基本操作

1. チャットヘッダーのドロップダウンで**プロバイダーとモデル**を選択
2. 画面下部のテキストエリアにメッセージを入力
3. `Enter` キーまたは送信ボタンで送信（`Shift + Enter` で改行）
4. アシスタントの応答がストリーミング表示されます（Markdown形式でレンダリング）
5. 「+」ボタンで新規チャットを開始（現在の会話は自動保存されます）

#### ノートの添付

Vault内のノートをコンテキストとしてLLMに送信できます。

- **クリップボタン** — 現在アクティブなノートを添付
- **フォルダボタン** — ファイルピッカーからノートを選択して添付

添付されたノートはコンテキストバーに表示され、トークン数も確認できます。xボタンで個別に削除できます。

#### クイックアクション

エディタでテキストを選択し、右クリック（モバイルでは長押し）メニューから以下のアクションを実行できます:

| アクション | 説明 |
|:---|:---|
| LLM: 要約する | 選択テキストを簡潔に要約 |
| LLM: 英語に翻訳 | 英語に翻訳 |
| LLM: 日本語に翻訳 | 日本語に翻訳 |
| LLM: 校正する | 文法・表現を校正し修正点を説明 |
| LLM: 解説する | わかりやすく解説 |
| LLM: 詳しく書く | テキストをより詳しく展開 |

選択テキストがプロンプトに追加され、チャットパネルに送信されます。

#### 会話履歴

- ヘッダーメニューの履歴アイコンで**会話履歴一覧**を表示
- 過去の会話をクリックして再開
- xボタンで不要な会話を削除
- 新しいメッセージを送信すると自動的に保存されます

#### システムプロンプトプリセット

設定画面の「プリセット」ドロップダウンから、用途に応じたシステムプロンプトを選択できます:

| プリセット名 | 用途 |
|:---|:---|
| デフォルト | プリセットなし |
| 丁寧な日本語アシスタント | 日本語で丁寧に回答 |
| テクニカルライター | 技術文書の執筆支援 |
| クリエイティブライター | 創造的な文章作成支援 |
| 翻訳者 | プロの翻訳（ニュアンス保持） |
| コードレビュアー | コード品質・セキュリティレビュー |

プリセットを選択するとシステムプロンプト欄に自動入力されます。カスタマイズも可能です。

---

### 設定項目一覧

| カテゴリ | 設定項目 | 説明 |
|:---|:---|:---|
| **LLM** | プロバイダー | 使用するLLMプロバイダーを選択 |
| | モデル | 使用するモデルを選択 |
| **セキュリティ** | API鍵の保存方式 | SecretStorage（推奨）/ WebCrypto暗号化 / 平文 |
| | マスターパスワード | WebCrypto選択時のみ表示。セッション中のみ保持 |
| **APIキー** | 各プロバイダーのAPIキー | テスト・削除ボタン付き |
| **カスタムエンドポイント** | エンドポイントURL | OpenAI互換APIのURL |
| | モデルID | 使用するモデルの識別子 |
| **詳細設定** | ストリーミングモード | レスポンスのリアルタイム表示（オン/オフ） |
| | Temperature | 生成の創造性（0.0〜1.0） |
| | プリセット | システムプロンプトのテンプレート選択 |
| | システムプロンプト | LLMへのデフォルト指示（自由記述） |

---

### セキュリティについて

API鍵の保管方法は3段階から選択できます:

| レベル | 方式 | 説明 |
|:---|:---|:---|
| **推奨** | SecretStorage API | OSレベルのセキュアストレージ（macOS Keychain等）を利用。Obsidian v1.11.4以上で利用可能 |
| **代替** | WebCrypto暗号化 | PBKDF2（10万回反復）+ AES-256-GCMで暗号化。マスターパスワードが必要（セッション中のみ保持） |
| **非推奨** | 平文保存 | プラグインデータに暗号化なしで保存。開発・テスト用途向け（警告表示あり） |

---

### 開発

```bash
# 依存関係のインストール
npm install

# ビルド
npm run build

# 開発モード（ファイル監視）
npm run dev

# テスト
npm test

# モバイル互換性チェック
npm run check-mobile
```

---

### ライセンス

[MIT License](LICENSE)
