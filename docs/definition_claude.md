# Obsidian LLM Assistant プラグイン — 統合要件定義書 v2.0

**作成日:** 2026年2月13日  
**開発ツール:** Claude Code (Opus 4.6)  
**対象Obsidianバージョン:** v1.11.4以上（SecretStorage API必須）

---

## 1. プロジェクト概要

### 1.1 コンセプト

Obsidian上でLLM（Claude / GPT / Gemini等）を活用し、ノート執筆支援・Vault内ファイル理解を行うプラグイン。既存のCopilotプラグインの課題（入出力エリアの狭さ、機能過多によるUI煩雑さ）を解決し、**モバイルファースト設計**で広い執筆・対話スペースを確保する。

### 1.2 設計原則

| 原則 | 説明 |
|------|------|
| **Mobile-First** | iPhoneでの完全動作を第一優先。デスクトップは拡張として対応 |
| **Wide Workspace** | プロンプト入力・出力表示エリアの最大化。UIクロームの最小化 |
| **Provider Independence** | 特定LLMプロバイダーに依存しない。ユーザーが自由にモデルを選択 |
| **Data Sovereignty** | ユーザーデータはローカルに保持。外部サーバーへの送信はLLM APIコールのみ |

---

## 2. プラットフォーム要件（最重要）

### 2.1 対応プラットフォーム

| プラットフォーム | 優先度 | 備考 |
|:---|:---:|:---|
| **iPhone (iOS)** | **必須** | 動作しなければリリース不可 |
| **iPad (iPadOS)** | 必須 | Split View対応含む |
| **Mac (macOS)** | 必須 | — |
| **Windows** | 必須 | — |
| **Android** | 必須 | — |

### 2.2 manifest.jsonの必須設定

```json
{
  "isDesktopOnly": false,
  "minAppVersion": "1.11.4"
}
```

- `isDesktopOnly: false` — モバイルでのインストール有効化（最重要）
- `minAppVersion: "1.11.4"` — SecretStorage API利用のため必須

### 2.3 モバイル互換性のための禁止事項

Obsidian公式ドキュメントおよびコミュニティの知見に基づく制約：

| 禁止事項 | 理由 | 代替手段 |
|:---|:---|:---|
| `require('fs')`, `require('path')` | Node.js APIはモバイル非対応 | `app.vault.read()`, `app.vault.create()` |
| `require('child_process')` | 同上 | 使用不可。外部プロセス呼び出しは不可 |
| `require('electron')` | Electron APIはモバイル非対応 | `Platform.isDesktop`でガード |
| `process.env` | Node.js依存 | `SecretStorage`でAPI鍵管理 |
| `require('crypto')` (Node.js) | モバイル非対応 | `window.crypto.subtle` (Web Crypto API) |
| 正規表現の後読み（lookbehind） | **iOSのSafari/WebKitが非対応** | 先読みまたは別アルゴリズムで代替 |

### 2.4 プラットフォーム判定

```typescript
import { Platform } from "obsidian";

// 利用可能な判定
Platform.isDesktop    // Mac/Windows/Linux
Platform.isMobile     // iOS/Android
Platform.isIosApp     // iOS（iPhone + iPad）
Platform.isAndroidApp // Android
```

---

## 3. LLMプロバイダー要件

### 3.1 必須対応モデル

| プロバイダー | モデル | APIエンドポイント |
|:---|:---|:---|
| **OpenAI** | GPT-5, GPT-5.2 | `https://api.openai.com/v1/chat/completions` |
| **Google** | Gemini 3.0 Flash, Gemini 3.0 Pro | `https://generativelanguage.googleapis.com/v1beta/` |
| **Anthropic** | Claude Opus 4.6 / Sonnet / Haiku | `https://api.anthropic.com/v1/messages` |

### 3.2 拡張対応（任意）

| プロバイダー | 用途 | API不要の可否 |
|:---|:---|:---:|
| **OpenRouter** | 複数モデル統合アクセス。無料モデル枠あり | 一部可能 |
| **Groq** | 高速推論（Llama系） | 無料枠あり |
| **Ollama** | ローカルLLM（**デスクトップのみ**） | API不要 |
| **カスタムエンドポイント** | OpenAI互換APIの任意URL | — |

### 3.3 API不要モード（廉価/旧式モデル対応）

ユーザーがAPI鍵を持っていない場合にも基本機能を提供する戦略：

**レベル1: OpenRouter無料枠**（全プラットフォーム対応）
- OpenRouterの無料モデル（reka-flash等）を利用
- API鍵はOpenRouterの無料アカウント鍵のみ必要

**レベル2: Ollama連携**（デスクトップのみ）
- ローカルで動作するOllamaサーバーに接続
- `http://localhost:11434` へのリクエスト
- CORS設定: `OLLAMA_ORIGINS=app://obsidian.md*`

**レベル3: WebLLM/WASM デバイス内推論**（実験的・将来対応）
- WebGPUを利用したブラウザ内LLM推論
- iOS 26 (Safari 26) でWebGPUがデフォルト有効化済み
- ただしObsidianのWebView環境でのWebGPU利用可否は未検証のため、Phase 6以降の実験的機能とする
- iPhone上での実用性（メモリ制約、バッテリー消費）は要検証

---

## 4. ネットワーク通信とストリーミング（重要技術課題）

### 4.1 通信APIの選択

Obsidianプラグインからの外部APIコールには重大なプラットフォーム差異がある：

| API | CORS回避 | ストリーミング | デスクトップ | モバイル |
|:---|:---:|:---:|:---:|:---:|
| `requestUrl()` (Obsidian API) | ✅ | ❌ **非対応** | ✅ | ✅ |
| `fetch()` (Web標準) | ❌ 制約あり | ✅ | ✅ | ⚠️ CORSブロックの可能性 |

**根拠（Obsidianフォーラムでの公式回答待ちの問題）：**

> `requestUrl()`はレスポンスボディ全体を受信してから返すため、SSE/ストリーミングに対応していない。モバイルではNode.jsサーバーがないため、CORS回避手段が`requestUrl()`のみである。

### 4.2 ストリーミング実装戦略（プラットフォーム分岐）

```
デスクトップの場合:
  fetch() でSSEストリーミング → トークン逐次表示
  ※ CORSの問題がある場合は requestUrl() にフォールバック（非ストリーム）

モバイルの場合:
  方式A: fetch() を試行
    → 成功: ストリーミング表示
    → CORSブロック: 方式Bにフォールバック
  方式B: requestUrl() で全文受信
    → ローディングインジケーター表示後、一括表示
    → 長文の場合はチャンク分割して段階的に描画
```

**UIでの対応：**
- ストリーミング非対応時は「生成中...」のプログレスインジケーターを表示
- 受信完了後に一括表示する際、タイピングアニメーション風の段階描画で体感を改善
- 設定画面で「ストリーミングモード」のON/OFF切り替え可能に

### 4.3 各LLMプロバイダーのCORS状況

| プロバイダー | CORSヘッダー | `fetch()`可否 | 備考 |
|:---|:---:|:---:|:---|
| OpenAI | ✅ 設定済み | ✅ | ストリーミング可能 |
| Anthropic | ❌ 未設定 | ❌ | `requestUrl()`必須。モバイルストリーミング不可 |
| Google Gemini | ⚠️ 部分的 | 要検証 | API版は可能な場合あり |
| OpenRouter | ✅ 設定済み | ✅ | ストリーミング可能 |
| Ollama (ローカル) | 設定次第 | ✅ | OLLAMA_ORIGINS設定必須 |

**重要: AnthropicのAPIはCORSヘッダーを返さないため、Claudeモデル利用時のモバイルストリーミングは現時点で不可能。`requestUrl()`による一括受信のみ。**

---

## 5. API鍵管理とセキュリティ

### 5.1 SecretStorage API（第一選択肢）

Obsidian v1.11.4で導入された公式の秘密保管機能を最優先で利用する：

```typescript
// SecretStorage APIの利用（概念コード）
// プラグイン間でAPI鍵を共有可能
const secretStorage = app.secretStorage; // v1.11.4+

// SecretComponent を使った設定画面統合
class LLMSettingTab extends PluginSettingTab {
  display(): void {
    // SecretComponentで鍵入力UI自動生成
    new SecretComponent(containerEl, "openai-api-key", {
      name: "OpenAI API Key",
      desc: "OpenAI APIキーを入力"
    });
  }
}
```

**利点：**
- Obsidian公式APIのため、プラットフォーム間の互換性が保証される
- 他のLLMプラグインとAPI鍵を共有可能（ユーザーの利便性向上）
- デバイス固有の安全な保管領域を利用（デスクトップ: Electron safeStorage / OS Keychain）

**注意点：**
- SecretStorage APIのセキュリティレベルはプラットフォームにより異なる
- デスクトップではLevelDB上に保存される実装のため、完全な暗号化ではないとの指摘あり（フォーラムでの議論）

### 5.2 フォールバック: Web Crypto API による自前暗号化

SecretStorage APIが利用できない環境（古いObsidianバージョン）向け：

```
マスターパスワード
    ↓ PBKDF2 (100,000 iterations, SHA-256)
暗号鍵 (AES-256-GCM)
    ↓ encrypt
API鍵 → 暗号化データ + IV + Salt → plugin data.json内
```

- `window.crypto.subtle` のみ使用（モバイル完全互換）
- マスターパスワード方式: セッション中のみメモリ保持
- 簡易モード: `this.saveData()` での平文保存も選択可（利便性優先ユーザー向け）

### 5.3 API鍵管理の階層

```
優先度1: SecretStorage API (v1.11.4+) ← 推奨
優先度2: Web Crypto API による暗号化 ← マスターパスワード必要
優先度3: plugin data.json 平文保存 ← 簡易モード（警告表示付き）
```

---

## 6. UI/UX設計

### 6.1 基本コンセプト — Copilotとの差別化

| 課題（Copilot） | 本プラグインの対応 |
|:---|:---|
| 入力欄が1-2行で狭い | 展開可能テキストエリア（2行〜画面50%） |
| 出力欄がUIボタンで圧迫 | ヘッダー・ツールバーをアイコンのみに簡素化 |
| 機能過多でUI煩雑 | チャット画面のみの基本UI、詳細設定は別画面に分離 |
| モバイルでの操作性 | モバイルファーストのレスポンシブ設計 |

### 6.2 画面構成

#### デスクトップ（サイドパネル, ≥1024px）

```
┌─────────────────────────────────┐
│ [Model▼]           [⚙] [+New]  │  ← ヘッダー（1行、コンパクト）
├─────────────────────────────────┤
│                                 │
│  チャット出力エリア              │  ← スクロール可能
│  （Markdown対応レンダリング）    │     画面の 75-85% を占有
│                                 │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│ [📎] [📋]                      │  ← ツールバー（アイコンのみ、1行）
├─────────────────────────────────┤
│ プロンプト入力                   │  ← 最小2行、ドラッグで拡大可能
│                       [送信 ▶]  │     最大で画面50%まで
└─────────────────────────────────┘
```

- サイドバー幅: 350px〜600px（ドラッグでリサイズ可能）
- `WorkspaceLeaf` の `getRightLeaf()` で右サイドパネルに配置
- 入力エリアの `Auto-expanding textarea`（内容に応じて自動伸長）

#### タブレット（600-1023px）

- サイドパネルまたはフルスクリーンモードを切り替え可能
- Split View時のフォントサイズ最適化
- Obsidian v1.11のタッチUI改善に対応

#### スマートフォン（<600px, **特にiPhone**）

```
┌─────────────────────┐
│ [Model▼]  [⚙] [+]  │  ← コンパクトヘッダー
├─────────────────────┤
│                     │
│  チャット出力       │  ← フルスクリーン利用
│  エリア             │     画面の70-80%
│                     │
│                     │
├─────────────────────┤
│ [📎][📋]            │
├─────────────────────┤
│ 入力エリア    [▶]   │  ← 最小2行、キーボード上に固定
└─────────────────────┘
```

**iPhone固有の対応:**
- フォントサイズ16px以上（iOSのオートズーム防止）
- タップターゲット44px以上（Apple HIG準拠）
- オーバーレイ・ドロワー形式（Obsidian v1.11のフローティングナビゲーションに合わせた設計）
- SafeArea対応（ノッチ・Dynamic Island避け）
- キーボード表示時の入力エリア位置調整

### 6.3 レスポンシブCSS設計

```css
/* ベース: モバイルファースト */
.llm-assistant-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 16px; /* iOS auto-zoom 防止 */
}

.llm-chat-output {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch; /* iOS スムーズスクロール */
}

.llm-chat-input textarea {
  font-size: 16px; /* iOS: 16px未満だとズーム */
  min-height: 2.5em;
  max-height: 50vh;
  resize: vertical;
}

/* タブレット */
@media (min-width: 600px) {
  .llm-chat-input textarea {
    min-height: 3em;
  }
}

/* デスクトップ */
@media (min-width: 1024px) {
  .llm-assistant-view {
    min-width: 350px;
  }
}
```

### 6.4 UIフレームワーク選択

| 選択肢 | メリット | デメリット | 採用 |
|:---|:---|:---|:---:|
| **Obsidian API + 素のDOM** | 軽量、モバイル互換確実 | 状態管理が煩雑 | Phase 1-3 |
| **Preact (3KB)** | React互換、軽量 | バンドルサイズ増 | Phase 4以降検討 |
| **React + Jotai** (Copilot方式) | 高機能、状態管理容易 | 重い（バンドル50KB+） | 非推奨 |

**決定: Phase 1-3 は素のDOM + Obsidian API で実装。** 複雑化した場合のみPreact導入を検討。

---

## 7. 機能要件

### 7.1 コア機能（Phase 1-3）

| ID | 機能 | 詳細 | 優先度 |
|:---|:---|:---|:---:|
| F-01 | チャットUI | 右サイドパネルにチャット画面表示。ItemView継承 | P0 |
| F-02 | テキスト生成表示 | デスクトップ: ストリーミング / モバイル: 一括表示(段階描画) | P0 |
| F-03 | Markdownレンダリング | LLM出力をObsidian MarkdownRenderer で表示 | P0 |
| F-04 | モデルスイッチャー | UIドロップダウンで即時モデル切り替え | P0 |
| F-05 | 会話履歴 | セッション単位で保存・再開。Vault内JSONに保存 | P1 |
| F-06 | システムプロンプト | カスタムプロンプト設定。用途別プリセット提供 | P1 |

### 7.2 Vault連携機能（Phase 3-4）

| ID | 機能 | 詳細 | 優先度 |
|:---|:---|:---|:---:|
| F-10 | アクティブノート参照 | 現在のノートをワンタップでコンテキスト添付 | P0 |
| F-11 | ファイル選択参照 | Vault内ファイルピッカーで複数ファイル選択・添付 | P1 |
| F-12 | `[[wikilink]]` 解決 | リンク先ノートを自動的にコンテキストに含めるオプション | P2 |
| F-13 | ノート直接挿入 | LLM出力をカーソル位置に挿入 / 新規ノート保存 | P1 |
| F-14 | 選択テキスト操作 | 「要約」「翻訳」「校正」等のクイックアクション | P1 |
| F-15 | フォルダ一括読み込み | 指定フォルダのノートをコンテキストに含める（トークン警告付き） | P2 |

### 7.3 RAG / セマンティック検索（Phase 5, 将来機能）

| ID | 機能 | 詳細 | 優先度 |
|:---|:---|:---|:---:|
| F-20 | Vault全体コンテキスト | セマンティック検索でVault内から関連ノートを自動取得しRAGに利用 | P2 |
| F-21 | エンベディングインデックス | ローカルに埋め込みベクトルを構築・保持 | P3 |

### 7.4 ローカル/オフライン機能（Phase 6, 実験的）

| ID | 機能 | 詳細 | 優先度 |
|:---|:---|:---|:---:|
| F-30 | WebLLM統合 | WebGPU利用のブラウザ内LLM推論 | P3 |
| F-31 | Ollama連携 | デスクトップのみ、ローカルLLMサーバー接続 | P2 |

---

## 8. 技術アーキテクチャ

### 8.1 ディレクトリ構成

```
obsidian-llm-assistant/
├── src/
│   ├── main.ts                     # プラグインエントリポイント
│   ├── constants.ts                # 定数定義
│   ├── settings/
│   │   └── SettingsTab.ts          # 設定画面（SecretComponent統合）
│   ├── ui/
│   │   ├── ChatView.ts             # メインチャットビュー（ItemView継承）
│   │   ├── ChatInput.ts            # 入力コンポーネント（auto-expand）
│   │   ├── ChatMessage.ts          # メッセージ表示
│   │   ├── ModelSelector.ts        # モデル選択UI
│   │   ├── FilePickerModal.ts      # ファイル選択モーダル
│   │   └── responsive.ts           # レスポンシブ制御
│   ├── llm/
│   │   ├── LLMProvider.ts          # 抽象インターフェース
│   │   ├── OpenAIProvider.ts       # OpenAI (GPT-5系)
│   │   ├── AnthropicProvider.ts    # Anthropic (Claude系)
│   │   ├── GeminiProvider.ts       # Google (Gemini系)
│   │   ├── OpenRouterProvider.ts   # OpenRouter
│   │   ├── OllamaProvider.ts       # Ollama（デスクトップのみ）
│   │   └── streaming.ts            # ストリーミング/フォールバック制御
│   ├── vault/
│   │   ├── VaultReader.ts          # Vault読み取り（app.vault利用）
│   │   └── NoteContext.ts          # コンテキスト構築・トークン管理
│   ├── security/
│   │   ├── SecretManager.ts        # SecretStorage + フォールバック
│   │   └── WebCryptoFallback.ts    # Web Crypto API暗号化
│   └── utils/
│       ├── TokenCounter.ts         # トークン概算
│       └── platform.ts             # Platform判定ユーティリティ
├── styles.css                      # レスポンシブCSS（モバイルファースト）
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── versions.json
```

### 8.2 LLMプロバイダー抽象化

```typescript
interface LLMProvider {
  id: string;
  name: string;
  models: ModelInfo[];
  requiresApiKey: boolean;
  supportsCORS: boolean;  // fetch()ストリーミング可否の判定に使用

  // ストリーミング対応: AsyncGenerator
  chat(params: ChatRequest): AsyncGenerator<string, void, unknown>;

  // 一括受信（ストリーミング非対応時のフォールバック）
  chatComplete(params: ChatRequest): Promise<string>;

  validateApiKey(key: string): Promise<boolean>;
}

interface ChatRequest {
  model: string;
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  pricing?: { input: number; output: number };  // per 1M tokens
}
```

### 8.3 通信レイヤー設計

```typescript
// プラットフォームとプロバイダーに応じた通信方式の自動選択
async function sendRequest(
  provider: LLMProvider,
  params: ChatRequest,
  onToken?: (token: string) => void
): Promise<string> {

  const canStream = onToken !== undefined;
  const isMobile = Platform.isMobile;

  if (canStream && !isMobile && provider.supportsCORS) {
    // ケース1: デスクトップ + CORS対応 → fetch()ストリーミング
    return streamWithFetch(provider, params, onToken);
  }

  if (canStream && isMobile && provider.supportsCORS) {
    // ケース2: モバイル + CORS対応 → fetch()ストリーミング試行
    try {
      return await streamWithFetch(provider, params, onToken);
    } catch (corsError) {
      // フォールバック: requestUrl()一括受信
      return completeWithRequestUrl(provider, params, onToken);
    }
  }

  // ケース3: CORS非対応 → requestUrl()一括受信
  return completeWithRequestUrl(provider, params, onToken);
}
```

---

## 9. 開発フェーズ

### Phase 1: 基盤構築（最優先）

**目標: iPhoneで起動し、基本UIが表示される状態**

- [ ] obsidian-sample-pluginからプロジェクトスキャフォールド
- [ ] manifest.json設定（`isDesktopOnly: false`, `minAppVersion: "1.11.4"`）
- [ ] ItemView継承のChatView実装
- [ ] レスポンシブCSS（モバイルファースト、iPhone 16px対応）
- [ ] 右サイドパネルへの配置（`getRightLeaf()`）
- [ ] **iPhoneでの動作確認**（Obsidian Mobile実機テスト）

### Phase 2: LLM接続

**目標: 任意のLLMにプロンプトを送信し回答を表示**

- [ ] LLMProvider抽象インターフェース実装
- [ ] OpenAIProvider実装（fetch()ストリーミング対応）
- [ ] AnthropicProvider実装（requestUrl()一括受信）
- [ ] GeminiProvider実装
- [ ] プラットフォーム分岐の通信レイヤー
- [ ] モデルスイッチャーUI
- [ ] **iPhone + 各プロバイダーでの動作確認**

### Phase 3: Vault連携

**目標: ノートをコンテキストとしてLLMに送信**

- [ ] VaultReader実装（app.vault.read()ベース）
- [ ] アクティブノート参照ボタン
- [ ] ファイルピッカーモーダル
- [ ] コンテキスト構築（トークンカウント表示）
- [ ] ノート直接挿入機能

### Phase 4: セキュリティとAPI鍵管理

**目標: API鍵のセキュアな保管**

- [ ] SecretStorage API統合（SecretComponent利用）
- [ ] Web Crypto APIフォールバック実装
- [ ] プロバイダー別API鍵登録・テスト・削除UI
- [ ] セキュリティレベル選択UI

### Phase 5: UX強化

- [ ] 会話履歴の保存・再開・削除
- [ ] システムプロンプトプリセット
- [ ] 選択テキストのクイックアクション
- [ ] wikilink解決コンテキスト
- [ ] トークンコスト概算表示

### Phase 6: 拡張機能

- [ ] OpenRouter統合（無料モデル含む）
- [ ] Ollama連携（デスクトップのみ）
- [ ] カスタムエンドポイント設定
- [ ] WebLLM/WASM実験的統合（WebGPU対応環境のみ）

---

## 10. モバイル互換性チェックリスト（各フェーズ共通）

**ビルド時確認:**

- [ ] `npm run build` 後の `main.js` に `require('fs')` 等Node.js依存が含まれていないこと
- [ ] バンドルサイズが妥当であること（目標: < 500KB）
- [ ] 正規表現にlookbehindが使われていないこと

**iPhone実機テスト:**

- [ ] プラグインが正常にロード・有効化されること
- [ ] チャットUIが表示され、画面幅375pxで崩れないこと
- [ ] フォントサイズ16px以上が維持されていること（ダブルタップズームが発生しない）
- [ ] タップターゲットが44px以上であること
- [ ] キーボード表示時に入力エリアが隠れないこと
- [ ] API呼び出し（requestUrl / fetch）が成功すること
- [ ] SafeArea（ノッチ/Dynamic Island）を避けてUIが表示されること

**iPad テスト:**

- [ ] Split View での表示が崩れないこと
- [ ] サイドバーとフルスクリーンの切り替えが正常であること

---

## 11. 参照リソース

### 公式ドキュメント

- [Obsidian Developer Docs](https://docs.obsidian.md/Home)
- [Plugin API Reference](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [SecretStorage Guide](https://docs.obsidian.md/plugins/guides/secret-storage)
- [Mobile Development Guide](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development)
- [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Sample Plugin Template](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian API Type Definitions](https://github.com/obsidianmd/obsidian-api)

### 関連プラグインの参考実装

- [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) — LLMチャットUIの参考（ただしReact依存で重い）
- [ChatGPT-MD](https://github.com/bramses/chatgpt-md) — ストリーミング実装の参考

### プラットフォーム技術情報

- [requestUrl ストリーミング未対応の議論](https://forum.obsidian.md/t/support-streaming-the-request-and-requesturl-response-body/87381)
- [SecretStorage セキュリティ議論](https://forum.obsidian.md/t/cross-platform-secure-storage-for-secrets-and-tokens-that-can-be-syncd/100716)
- [WebGPU iOS 26対応](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
- [Obsidian Roadmap](https://obsidian.md/roadmap/)

---

## 12. 既知のリスクと対策

| リスク | 影響度 | 対策 |
|:---|:---:|:---|
| requestUrlのストリーミング非対応 | 高 | プラットフォーム分岐 + 段階描画UI。Obsidian公式のAPI拡張を継続監視 |
| AnthropicのCORS非対応 | 中 | requestUrl利用。モバイルでのClaude利用はストリーミング不可を許容 |
| SecretStorageのセキュリティレベル | 中 | Web Crypto APIフォールバック提供。ユーザーに選択肢を提示 |
| WebLLM/WASMのObsidian環境での動作 | 高 | Phase 6で実験的導入。未検証リスクを要件として明記 |
| iOS正規表現の後読み非対応 | 低 | コードレビューで使用箇所チェック。CIに静的解析追加 |

---

*本要件定義書は、Obsidian公式Developer Docs、APIリポジトリ、フォーラムでの技術議論、既存プラグイン（Copilot, ChatGPT-MD）の実装、およびWebGPU/WebLLMのプラットフォーム対応状況の調査に基づいて作成されています。*
