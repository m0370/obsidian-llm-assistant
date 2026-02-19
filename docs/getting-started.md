# LLM Assistant — Getting Started Guide

A beginner-friendly guide to setting up and using the LLM Assistant plugin for Obsidian.

---

## What is this plugin?

LLM Assistant lets you chat with AI (large language models) directly inside Obsidian. You can ask questions, get writing help, translate text, and even search your vault notes using AI — all from your phone, tablet, or desktop.

## Before you begin

To use this plugin, you need an **API key** from at least one AI provider. An API key is like a password that lets the plugin communicate with the AI service on your behalf.

### Which provider should I choose?

| Provider | Best for | Cost | Getting started |
|:---|:---|:---|:---|
| **Google Gemini** | Beginners, free trial | Free tier available | Easiest to start |
| **OpenAI** | GPT-5 users | Paid (pay-per-use) | Requires billing setup |
| **Anthropic** | Claude users | Paid (pay-per-use) | Requires billing setup |
| **OpenRouter** | Accessing multiple models | Paid (pay-per-use) | Unified gateway |
| **Ollama** | Privacy-focused, local AI | Free (runs on your PC) | Desktop only, requires setup |

**Not sure which to pick?** Start with **Google Gemini**. It offers a generous free tier, and the **Gemini 2.5 Flash** model is fast, capable, and completely free to use within the rate limits (up to 500 requests/day). No credit card required.

## Step 1: Get an API key

### Option A: Google Gemini (Recommended for beginners)

1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the generated key (it looks like `AIza...`)

That's it! No credit card or paid plan required. The free tier includes:
- **Gemini 2.5 Flash**: Up to 500 requests/day
- **Gemini 2.5 Pro**: Up to 25 requests/day

### Option B: OpenAI

1. Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create an account and set up billing
3. Click **Create new secret key**
4. Copy the key (it looks like `sk-...`)

### Option C: Anthropic (Claude)

1. Visit [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Create an account and set up billing
3. Click **Create Key**
4. Copy the key (it looks like `sk-ant-...`)

## Step 2: Enable the plugin

1. Open Obsidian **Settings**
2. Go to **Community plugins**
3. Find **LLM Assistant** and toggle it **on**
4. A chat bubble icon appears in the left sidebar

## Step 3: Enter your API key

1. Tap the **chat bubble icon** in the left sidebar to open the chat panel
2. Tap the **gear icon** in the chat header (or go to Settings > LLM Assistant)
3. In the **API Keys** section, find your provider (e.g., "Google Gemini")
4. Paste your API key into the field
5. Tap **Test** to verify it works — you should see a success message

## Step 4: Select a model and start chatting

1. At the top of the chat panel, tap the **model selector** dropdown
2. Choose your provider and model:
   - For Gemini: select **Gemini 2.5 Flash** (fast and free)
   - For OpenAI: select **GPT-5** or **GPT-5 Mini**
   - For Anthropic: select **Claude Sonnet 4.6** (good balance of speed and quality)
3. Type a message in the text box at the bottom
4. Press **Enter** (or tap the send button) to send
5. The AI's response will stream in real-time

**Tip**: Press `Shift + Enter` to add a new line without sending.

## You're all set!

That's everything you need to get started. Here are some things to try:

- **Ask a question**: "What is the Zettelkasten method?"
- **Get writing help**: "Help me rewrite this paragraph to be more concise: [paste text]"
- **Translate**: "Translate the following to English: [paste text]"
- **Summarize a long note**: Attach a note using the paperclip button, then ask "Summarize this note"

## Optional: Explore advanced features

Once you're comfortable with basic chatting, consider exploring:

- **Note attachment** (paperclip icon): Send vault notes as context to the AI
- **Quick actions**: Select text in the editor and right-click for AI-powered actions (summarize, translate, proofread, etc.)
- **Conversation history** (clock icon): Browse and resume past conversations
- **RAG (Vault Search)**: Let the AI automatically search your vault for relevant context (Settings > Advanced)
- **System prompts**: Customize the AI's behavior with presets (Settings > Presets)

For full documentation, see the [README](../README.md).

---

---

# LLM Assistant — はじめてのセットアップガイド

はじめてLLM Assistantプラグインを使う方に向けた、わかりやすい初期設定ガイドです。

---

## このプラグインでできること

LLM Assistantは、Obsidianの中でAI（大規模言語モデル）とチャットできるプラグインです。質問への回答、文章の執筆支援、翻訳、Vault内ノートのAI検索など、さまざまなことがiPhone・iPad・PC問わず行えます。

## はじめる前に

このプラグインを使うには、AIプロバイダーの**APIキー**が最低1つ必要です。APIキーとは、プラグインがあなたの代わりにAIサービスと通信するための認証コードのようなものです。

### どのプロバイダーを選べばいい？

| プロバイダー | おすすめの人 | 費用 | はじめやすさ |
|:---|:---|:---|:---|
| **Google Gemini** | はじめての方、無料で試したい方 | 無料枠あり | 最も簡単 |
| **OpenAI** | GPT-5を使いたい方 | 有料（従量課金） | 要クレジットカード |
| **Anthropic** | Claudeを使いたい方 | 有料（従量課金） | 要クレジットカード |
| **OpenRouter** | 複数モデルを試したい方 | 有料（従量課金） | 統合ゲートウェイ |
| **Ollama** | ローカルでAIを動かしたい方 | 無料（PC上で実行） | デスクトップ専用、要セットアップ |

**迷ったら、まずは Google Gemini がおすすめです。** 無料枠が充実しており、**Gemini 2.5 Flash** は高速・高性能で、1日500リクエストまで無料で使えます。クレジットカードの登録も不要です。

いずれのLLMの有料プランにも加入していない方は、まず Google Gemini API の無料枠で Gemini 2.5 Flash を試してみてください。性能に納得してから、必要に応じて OpenAI や Anthropic の有料プランを検討するのがおすすめです。

## ステップ 1: APIキーを取得する

### おすすめ: Google Gemini（無料ではじめる）

1. [Google AI Studio](https://aistudio.google.com/apikey) にアクセス
2. Googleアカウントでログイン
3. **「APIキーを作成」** をクリック
4. 表示されたキーをコピー（`AIza...` のような文字列です）

これだけで完了です！クレジットカードや有料プランの契約は不要です。

無料枠の目安：
- **Gemini 2.5 Flash**: 1日500リクエストまで無料
- **Gemini 2.5 Pro**: 1日25リクエストまで無料

個人の日常利用であれば、無料枠で十分に使えます。

### OpenAI を使う場合

1. [OpenAI API Keys](https://platform.openai.com/api-keys) にアクセス
2. アカウントを作成し、支払い情報を設定
3. **「Create new secret key」** をクリック
4. 表示されたキーをコピー（`sk-...` のような文字列です）

### Anthropic (Claude) を使う場合

1. [Anthropic Console](https://console.anthropic.com/settings/keys) にアクセス
2. アカウントを作成し、支払い情報を設定
3. **「Create Key」** をクリック
4. 表示されたキーをコピー（`sk-ant-...` のような文字列です）

## ステップ 2: プラグインを有効化する

1. Obsidianの **設定** を開く
2. **コミュニティプラグイン** に移動
3. **LLM Assistant** を見つけてトグルを **オン** に
4. 左サイドバーに吹き出しアイコンが表示されます

## ステップ 3: APIキーを登録する

1. 左サイドバーの **吹き出しアイコン** をタップしてチャットパネルを開く
2. チャットヘッダーの **歯車アイコン** をタップ（または 設定 > LLM Assistant）
3. **APIキー** セクションで、あなたのプロバイダー（例: 「Google Gemini」）を見つける
4. APIキーを貼り付ける
5. **「テスト」** ボタンをタップして、接続を確認 — 成功メッセージが表示されればOK

## ステップ 4: モデルを選んでチャット開始

1. チャットパネル上部の **モデル選択** ドロップダウンをタップ
2. プロバイダーとモデルを選択:
   - Gemini の場合: **Gemini 2.5 Flash**（高速・無料）がおすすめ
   - OpenAI の場合: **GPT-5** または **GPT-5 Mini**
   - Anthropic の場合: **Claude Sonnet 4.6**（速度と品質のバランスが良い）
3. 画面下部のテキストボックスにメッセージを入力
4. **Enter** キー（または送信ボタン）で送信
5. AIの回答がリアルタイムで表示されます

**ヒント**: `Shift + Enter` で改行できます（送信せずに複数行入力したいとき）。

## セットアップ完了！

これで準備は完了です。さっそく試してみましょう:

- **質問する**: 「Zettelkastenメソッドとは何ですか？」
- **文章の手直し**: 「この文章をもっと簡潔にしてください：[テキストを貼り付け]」
- **翻訳**: 「以下を英語に翻訳してください：[テキストを貼り付け]」
- **ノートを要約**: クリップアイコンでノートを添付して「このノートを要約してください」

## さらに便利に使うには

基本的なチャットに慣れたら、以下の機能も試してみてください:

- **ノート添付**（クリップアイコン）: Vault内のノートをAIに送信してコンテキストとして活用
- **クイックアクション**: エディタでテキストを選択 → 右クリック（モバイルは長押し）→ 要約・翻訳・校正などをAIが実行
- **会話履歴**（時計アイコン）: 過去の会話を一覧表示・再開
- **RAG（Vault検索）**: AIがVault内を自動検索して関連ノートをコンテキストに含める（設定 > 詳細設定）
- **システムプロンプト**: AIの応答スタイルをプリセットでカスタマイズ（設定 > プリセット）

詳しくは [README](../README.md) をご覧ください。
