/**
 * i18n（多言語対応）モジュール
 *
 * 外部ライブラリ不要。翻訳データ + t() 関数を単一ファイルに集約。
 * 対応言語: English (en), 日本語 (ja)
 */

type Locale = "en" | "ja";

let currentLocale: Locale = "en";

// --- 翻訳データ ---

const translations: Record<Locale, Record<string, string>> = {
	en: {
		// Command palette
		"command.openChat": "Open chat panel",

		// Header / toolbar
		"header.history": "History",
		"header.settings": "Settings",
		"header.newChat": "New chat",
		"toolbar.attachActive": "Attach active note",
		"toolbar.pickFile": "Select note",
		"toolbar.copy": "Copy",
		"toolbar.insertToNote": "Insert to note",

		// Action bar
		"actionBar.more": "More actions",

		// Chat input
		"input.placeholder": "Type a message...",
		"input.send": "Send",

		// Chat messages
		"message.user": "You",
		"message.assistant": "Assistant",

		// Generating
		"chat.generating": "Generating",

		// Notices
		"notice.noActiveNote": "No active note",
		"notice.attached": "{name} attached",
		"notice.alreadyAttachedOrLimit": "Already attached or token limit exceeded",
		"notice.copied": "Copied",
		"notice.noMessageToInsert": "No message to insert",
		"notice.insertedToNote": "Inserted to note",
		"notice.conversationDeleted": "Conversation deleted",
		"notice.apiKeySaveFailed": "Failed to save API key: {message}",
		"notice.apiKeyDeleted": "{name} API key deleted",
		"notice.apiKeyValid": "API key is valid",
		"notice.apiKeyInvalid": "API key is invalid",
		"notice.apiKeyTestFailed": "API key validation failed",

		// Errors
		"error.providerNotFound": "Provider not found",
		"error.apiKeyNotSet": "{name} API key is not set. Please enter it in Settings.",
		"error.occurred": "An error occurred: {message}",

		// Conversation
		"conversation.title": "History",
		"conversation.empty": "No conversation history",
		"conversation.messages": "{count} messages",
		"conversation.delete": "Delete",
		"conversation.newChat": "New chat",

		// Settings
		"settings.heading": "LLM Assistant Settings",
		"settings.language": "Language",
		"settings.languageDesc": "Display language for the UI",
		"settings.languageAuto": "Auto-detect",
		"settings.provider": "LLM Provider",
		"settings.providerDesc": "Select the LLM provider to use",
		"settings.model": "Model",
		"settings.modelDesc": "Select the model to use",
		"settings.security": "Security",
		"settings.securityAvailable": "SecretStorage API is available (recommended)",
		"settings.securityUnavailable": "SecretStorage API is not available. WebCrypto will be used",
		"settings.apiKeyStorage": "API Key Storage",
		"settings.secretStorage": "SecretStorage (Recommended)",
		"settings.webCrypto": "WebCrypto Encryption",
		"settings.masterPassword": "Master Password",
		"settings.masterPasswordDesc": "Used to encrypt API keys. Kept only during session",
		"settings.masterPasswordPlaceholder": "Master password",
		"settings.apiKeys": "API Keys",
		"settings.apiKeyInput": "Enter {name} API key",
		"settings.apiKeyTest": "Test",
		"settings.apiKeyTesting": "Testing...",
		"settings.apiKeyNotSet": "API key is not set",
		"settings.apiKeyDelete": "Delete",
		"settings.customEndpoint": "Custom Endpoint",
		"settings.endpointUrl": "Endpoint URL",
		"settings.endpointUrlDesc": "OpenAI-compatible API URL (e.g. http://localhost:8080/v1/chat/completions)",
		"settings.modelId": "Model ID",
		"settings.modelIdDesc": "Identifier of the model to use",
		"settings.advanced": "Advanced Settings",
		"settings.advancedAccordion": "Advanced Settings (RAG / Embedding)",
		"settings.streaming": "Streaming Mode",
		"settings.streamingDesc": "Show response in real-time (supported providers only)",
		"settings.temperature": "Temperature",
		"settings.temperatureDesc": "Creativity of generation (0.0=deterministic, 1.0=creative)",
		"settings.preset": "Preset",
		"settings.presetDesc": "Frequently used system prompt templates",
		"settings.systemPrompt": "System Prompt",
		"settings.systemPromptDesc": "Set default instructions to the LLM (can be overridden by presets)",
		"settings.systemPromptPlaceholder": "(e.g.) You are a helpful assistant.",

		// Quick actions
		"quickAction.summarize": "Summarize",
		"quickAction.summarize.prompt": "Please summarize the following text concisely:\n\n",
		"quickAction.translateEn": "Translate to English",
		"quickAction.translateEn.prompt": "Please translate the following text to English:\n\n",
		"quickAction.translateJa": "Translate to Japanese",
		"quickAction.translateJa.prompt": "Please translate the following text to Japanese:\n\n",
		"quickAction.proofread": "Proofread",
		"quickAction.proofread.prompt": "Please proofread the following text and explain corrections:\n\n",
		"quickAction.explain": "Explain",
		"quickAction.explain.prompt": "Please explain the following text clearly:\n\n",
		"quickAction.expand": "Expand",
		"quickAction.expand.prompt": "Please expand and elaborate on the following text:\n\n",

		// Presets
		"preset.default": "Default",
		"preset.default.prompt": "",
		"preset.politeJa": "Polite Japanese Assistant",
		"preset.politeJa.prompt": "You are an assistant that answers politely in Japanese.",
		"preset.technical": "Technical Writer",
		"preset.technical.prompt": "You are an assistant specialized in writing technical documentation. Be precise and concise.",
		"preset.creative": "Creative Writer",
		"preset.creative.prompt": "You are an assistant that helps with creative writing. Use engaging expressions.",
		"preset.translator": "Translator",
		"preset.translator.prompt": "You are a professional translator. Create natural translations while preserving the nuance of the original text.",
		"preset.codeReviewer": "Code Reviewer",
		"preset.codeReviewer.prompt": "You are a software engineering expert. Review code from quality, performance, and security perspectives.",

		// Provider / model labels
		"provider.ollama": "Ollama (Local)",
		"provider.custom": "Custom Endpoint",

		// Note context
		"context.header": "The following notes are referenced from the user's Obsidian Vault:",
		"context.activeNote": "Currently open note:",
		"context.vaultFiles": "Files in vault (user can reference any file using [[filename]] in their message and its content will be automatically loaded):",
		"context.linkedFiles": "Referenced notes from user's message:",

		// File picker
		"filePicker.placeholder": "Search notes...",

		// Message editing
		"message.edit": "Edit",

		// API key URLs
		"settings.apiKeyUrl": "Get API key: {url}",
		"error.apiKeyNotSetWithUrl": "{name} API key is not set. Get your key at: {url}",

		// Font size
		"settings.fontSize": "Font Size",
		"settings.fontSizeDesc": "Adjust the font size of the chat interface",
		"settings.fontSizeSmall": "Small",
		"settings.fontSizeMedium": "Medium (Default)",
		"settings.fontSizeLarge": "Large",

		// Vault file reading
		"context.vaultReadInstruction": "IMPORTANT: You can read the content of any file in the user's vault. To read a file, include <vault_read>filepath</vault_read> in your response (e.g. <vault_read>Notes/my-note.md</vault_read>). The system will automatically provide the file content and you can then answer based on it. Use this whenever the user asks about a specific note or you need to look up file contents.\n\nWhen you reference vault files in your response, ALWAYS use the [[filename]] wikilink format (e.g. [[My Note]] or [[folder/My Note]]). These will become clickable links that open the file directly in Obsidian. When you read a file using vault_read, mention which file(s) you referenced in your answer (e.g. \"Based on [[My Note]], ...\").",
		"context.vaultWriteInstruction": "FILE EDITING: When the user asks you to edit, modify, rewrite, fix typos, proofread, reformat, or create a file, you MUST use the vault_write tag to propose changes. Format: <vault_write path=\"filepath\">entire new file content here</vault_write>. ALWAYS read the file first with vault_read to get the current content, then output the full modified content inside vault_write. The user will see a diff of your changes and can approve or dismiss them. You can edit existing files or create new ones. Use this for: writing/editing blog posts, fixing typos, reformatting text into lists or tables, translating content, expanding or summarizing sections, reorganizing structure, and any text transformation the user requests.",
		"context.fileContentsProvided": "Here are the file contents you requested:",
		"chat.readingFiles": "Reading files from vault...",

		// Edit proposals
		"edit.newFile": "New file",
		"edit.modified": "Modified",
		"edit.apply": "Apply",
		"edit.applied": "Applied",
		"edit.dismiss": "Dismiss",
		"edit.dismissed": "Dismissed",
		"edit.noChanges": "(No changes detected)",
		"edit.chunk": "Chunk",
		"edit.applyAll": "Apply All",
		"edit.revertAll": "Revert All",
		"edit.undo": "Undo",
		"edit.undoFailed": "Could not undo — file may have been modified externally",
		"edit.matchNotFound": "Could not find matching text in file",
		"notice.fileEdited": "{name} has been updated",
		"notice.fileCreated": "{name} has been created",
		"notice.fileReverted": "{name} has been reverted",

		// Tool Use (Anthropic)
		"context.toolUseInstruction": "You have access to the user's Obsidian vault through tools. You can read any file using the vault_read tool and propose edits using the vault_write tool.\n\nIMPORTANT BEHAVIORS:\n- When the user mentions or asks about a specific note or file, proactively use vault_read to read it — do NOT ask for permission first.\n- When asked to edit, modify, fix, proofread, reformat, or create a file, ALWAYS read it first with vault_read, then use vault_write with the complete modified content.\n- You can read multiple files in sequence to gather information.\n- When referencing vault files in your response, use [[filename]] wikilink format for clickable links.\n- After reading a file, mention which file(s) you referenced (e.g. \"Based on [[My Note]], ...\").",

		// Model refresh
		"settings.refreshModels": "Refresh",
		"settings.refreshingModels": "Refreshing...",
		"notice.modelsRefreshed": "Model list updated ({count} models)",
		"notice.modelsRefreshFailed": "Failed to refresh models: {message}",
		"notice.modelsRefreshNoKey": "API key required to refresh models",

		// Rate limit (429)
		"error.rateLimitTitle": "API rate limit reached",
		"error.rateLimitBody": "You have exceeded the free tier usage limit for {provider}. Please wait a moment and try again, or upgrade to a paid API plan for higher limits.",
		"error.rateLimitUpgrade": "Upgrade to paid plan: {url}",

		// RAG
		"settings.rag": "RAG (Vault Search)",
		"settings.ragEnabled": "Enable RAG",
		"settings.ragEnabledDesc": "Automatically search your vault for relevant content when chatting with the LLM",
		"settings.ragTopK": "Number of results",
		"settings.ragTopKDesc": "Maximum number of relevant chunks to include in context (1-20)",
		"settings.ragMinScore": "Minimum relevance score",
		"settings.ragMinScoreDesc": "Only include results above this relevance threshold (0.0-1.0)",
		"settings.ragChunkStrategy": "Chunk strategy",
		"settings.ragChunkStrategyDesc": "How to split notes for indexing",
		"settings.ragChunkSection": "By section (headings)",
		"settings.ragChunkParagraph": "By paragraph",
		"settings.ragChunkFixed": "Fixed token size",
		"settings.ragChunkMaxTokens": "Max tokens per chunk",
		"settings.ragChunkMaxTokensDesc": "Maximum token count for each chunk (128-2048)",
		"settings.ragExcludeFolders": "Exclude folders",
		"settings.ragExcludeFoldersDesc": "Folders to exclude from RAG indexing (comma-separated). Use this to protect private or sensitive folders (e.g. Private, Work/Confidential)",
		"settings.ragBuildIndex": "Build Index",
		"settings.ragBuildingIndex": "Building...",
		"settings.ragRebuildIndex": "Rebuild Index",
		"settings.ragClearIndex": "Clear Index",
		"settings.ragIndexStats": "Index: {files} files, {chunks} chunks",
		"settings.ragIndexNotBuilt": "Index not built. Click 'Build Index' to start.",
		"settings.ragEmbedding": "Embedding Search (Semantic Search)",
		"settings.ragEmbeddingEnabled": "Enable Embedding Search",
		"settings.ragEmbeddingEnabledDesc": "Enables semantic search using Embedding API. Your vault text will be sent to the Embedding API server. Use the exclude folders setting above to protect sensitive content.",
		"settings.ragEmbeddingProvider": "Embedding Provider",
		"settings.ragEmbeddingProviderDesc": "Choose the provider for generating embeddings. This is independent of the chat provider.",
		"settings.ragEmbeddingModel": "Embedding Model",
		"settings.ragEmbeddingUseSharedKey": "Use chat API key",
		"settings.ragEmbeddingUseSharedKeyDesc": "Use the same API key as the chat provider. Disable to set a separate key for embeddings.",
		"settings.ragEmbeddingApiKey": "Embedding API Key",
		"settings.ragEmbeddingCostEstimate": "Estimated cost: {chunks} chunks x ~{tokensPerChunk} tokens = ${cost}",
		"settings.ragEmbeddingCostFree": "Free (local Ollama)",
		"settings.ragBuildEmbeddingIndex": "Build Embedding Index",
		"settings.ragBuildingEmbeddingIndex": "Building...",
		"settings.ragEmbeddingIndexStats": "Embedding: {vectors} vectors, {size}, model: {model}",
		"settings.ragEmbeddingIndexNotBuilt": "Embedding index not built",
		"settings.ragClearEmbeddingIndex": "Clear Embedding Index",
		"settings.ragEmbeddingGeminiTip": "Gemini offers a free tier (100 RPM, 1000 RPD). Great for getting started.",
		"settings.ragEmbeddingOllamaTip": "Ollama runs locally — no API key needed, no data sent externally.",
		"settings.ragEmbeddingOllamaMobileTip": "On mobile, 'localhost' refers to your phone, not your PC. Use your PC's IP address (e.g. 192.168.x.x:11434) to connect to Ollama from mobile.",
		"settings.ragEmbeddingCompactMode": "Compact mode (reduced dimensions)",
		"settings.ragEmbeddingCompactModeDesc": "Reduces embedding dimensions to save ~66% memory and storage. Recommended for mobile and large vaults. Minimal impact on search quality.",
		"settings.ragEmbeddingAutoIndex": "Background auto-embedding",
		"settings.ragEmbeddingAutoIndexDesc": "Automatically generate embeddings for new content during idle time. API costs will be incurred.",
		"settings.ragEmbeddingTotalTokens": "Total tokens used: {tokens} (estimated cost: ${cost})",
		"command.buildEmbeddingIndex": "Build Embedding Index",
		"notice.ragEmbeddingBuilding": "Building embedding index: {current} / {total} chunks",
		"notice.ragEmbeddingComplete": "Embedding index complete: {vectors} vectors ({size})",
		"notice.ragEmbeddingFailed": "Embedding generation failed: {error}. Text search will be used instead.",
		"notice.ragEmbeddingModelChanged": "Embedding model changed. Please rebuild the embedding index.",
		"command.buildRagIndex": "Build RAG Index",
		"notice.ragIndexBuilding": "Building RAG index... ({current}/{total})",
		"notice.ragIndexComplete": "RAG index complete: {files} files, {chunks} chunks",
		"notice.ragIndexUpdated": "RAG index updated: {files} files changed, {chunks} total chunks",
		"notice.ragIndexRestored": "RAG index restored from cache: {chunks} chunks",
		"notice.ragIndexCleared": "RAG index cleared",
		"notice.ragNotEnabled": "RAG is not enabled. Enable it in Settings > RAG.",
		"rag.contextHeader": "Relevant notes from vault (auto-retrieved by RAG):",
		"rag.noResults": "No relevant notes found for: {query}",
		"rag.toolSearchHeader": "Found {count} relevant sections for \"{query}\":",
	},

	ja: {
		// Command palette
		"command.openChat": "チャットパネルを開く",

		// Header / toolbar
		"header.history": "会話履歴",
		"header.settings": "設定",
		"header.newChat": "新規チャット",
		"toolbar.attachActive": "アクティブノートを添付",
		"toolbar.pickFile": "ノートを選択",
		"toolbar.copy": "コピー",
		"toolbar.insertToNote": "ノートに挿入",

		// Action bar
		"actionBar.more": "その他のアクション",

		// Chat input
		"input.placeholder": "メッセージを入力...",
		"input.send": "送信",

		// Chat messages
		"message.user": "You",
		"message.assistant": "Assistant",

		// Generating
		"chat.generating": "生成中",

		// Notices
		"notice.noActiveNote": "アクティブなノートがありません",
		"notice.attached": "{name} を添付しました",
		"notice.alreadyAttachedOrLimit": "既に添付済みか、トークン上限を超えています",
		"notice.copied": "コピーしました",
		"notice.noMessageToInsert": "挿入するメッセージがありません",
		"notice.insertedToNote": "ノートに挿入しました",
		"notice.conversationDeleted": "会話を削除しました",
		"notice.apiKeySaveFailed": "API鍵の保存に失敗: {message}",
		"notice.apiKeyDeleted": "{name} のAPIキーを削除しました",
		"notice.apiKeyValid": "APIキーは有効です",
		"notice.apiKeyInvalid": "APIキーが無効です",
		"notice.apiKeyTestFailed": "APIキーの検証に失敗しました",

		// Errors
		"error.providerNotFound": "プロバイダーが見つかりません",
		"error.apiKeyNotSet": "{name} のAPIキーが設定されていません。設定画面からAPIキーを入力してください。",
		"error.occurred": "エラーが発生しました: {message}",

		// Conversation
		"conversation.title": "会話履歴",
		"conversation.empty": "会話履歴がありません",
		"conversation.messages": "{count}メッセージ",
		"conversation.delete": "削除",
		"conversation.newChat": "新しいチャット",

		// Settings
		"settings.heading": "LLM Assistant 設定",
		"settings.language": "言語 / Language",
		"settings.languageDesc": "UIの表示言語",
		"settings.languageAuto": "自動検出 (Auto)",
		"settings.provider": "LLMプロバイダー",
		"settings.providerDesc": "使用するLLMプロバイダーを選択",
		"settings.model": "モデル",
		"settings.modelDesc": "使用するモデルを選択",
		"settings.security": "セキュリティ",
		"settings.securityAvailable": "SecretStorage APIが利用可能です（推奨）",
		"settings.securityUnavailable": "SecretStorage APIは利用できません。WebCryptoが使用されます",
		"settings.apiKeyStorage": "API鍵の保存方式",
		"settings.secretStorage": "SecretStorage (推奨)",
		"settings.webCrypto": "WebCrypto暗号化",
		"settings.masterPassword": "マスターパスワード",
		"settings.masterPasswordDesc": "API鍵の暗号化に使用。セッション中のみ保持されます",
		"settings.masterPasswordPlaceholder": "マスターパスワード",
		"settings.apiKeys": "API キー",
		"settings.apiKeyInput": "{name} のAPIキーを入力",
		"settings.apiKeyTest": "テスト",
		"settings.apiKeyTesting": "検証中...",
		"settings.apiKeyNotSet": "APIキーが設定されていません",
		"settings.apiKeyDelete": "削除",
		"settings.customEndpoint": "カスタムエンドポイント",
		"settings.endpointUrl": "エンドポイントURL",
		"settings.endpointUrlDesc": "OpenAI互換APIのURL（例: http://localhost:8080/v1/chat/completions）",
		"settings.modelId": "モデルID",
		"settings.modelIdDesc": "使用するモデルの識別子",
		"settings.advanced": "詳細設定",
		"settings.advancedAccordion": "高度な設定（RAG / Embedding）",
		"settings.streaming": "ストリーミングモード",
		"settings.streamingDesc": "レスポンスをリアルタイムで表示（対応プロバイダーのみ）",
		"settings.temperature": "Temperature",
		"settings.temperatureDesc": "生成の創造性（0.0=確定的、1.0=創造的）",
		"settings.preset": "プリセット",
		"settings.presetDesc": "よく使うシステムプロンプトのテンプレート",
		"settings.systemPrompt": "システムプロンプト",
		"settings.systemPromptDesc": "LLMへのデフォルト指示を設定（プリセット選択で上書き可能）",
		"settings.systemPromptPlaceholder": "（例）あなたは日本語で丁寧に回答するアシスタントです。",

		// Quick actions
		"quickAction.summarize": "要約する",
		"quickAction.summarize.prompt": "以下のテキストを簡潔に要約してください:\n\n",
		"quickAction.translateEn": "英語に翻訳",
		"quickAction.translateEn.prompt": "以下のテキストを英語に翻訳してください:\n\n",
		"quickAction.translateJa": "日本語に翻訳",
		"quickAction.translateJa.prompt": "以下のテキストを日本語に翻訳してください:\n\n",
		"quickAction.proofread": "校正する",
		"quickAction.proofread.prompt": "以下のテキストを校正し、修正点を説明してください:\n\n",
		"quickAction.explain": "解説する",
		"quickAction.explain.prompt": "以下のテキストをわかりやすく解説してください:\n\n",
		"quickAction.expand": "詳しく書く",
		"quickAction.expand.prompt": "以下のテキストをより詳しく展開して書いてください:\n\n",

		// Presets
		"preset.default": "デフォルト",
		"preset.default.prompt": "",
		"preset.politeJa": "丁寧な日本語アシスタント",
		"preset.politeJa.prompt": "あなたは日本語で丁寧に回答するアシスタントです。",
		"preset.technical": "テクニカルライター",
		"preset.technical.prompt": "あなたは技術文書の執筆を専門とするアシスタントです。正確で簡潔な説明を心がけてください。",
		"preset.creative": "クリエイティブライター",
		"preset.creative.prompt": "あなたは創造的な文章作成を支援するアシスタントです。読者を引き込む表現を使ってください。",
		"preset.translator": "翻訳者",
		"preset.translator.prompt": "あなたはプロの翻訳者です。原文のニュアンスを保ちつつ、自然な訳文を作成してください。",
		"preset.codeReviewer": "コードレビュアー",
		"preset.codeReviewer.prompt": "あなたはソフトウェアエンジニアリングの専門家です。コードの品質、パフォーマンス、セキュリティの観点からレビューしてください。",

		// Provider / model labels
		"provider.ollama": "Ollama (ローカル)",
		"provider.custom": "カスタムエンドポイント",

		// Note context
		"context.header": "以下はユーザーのObsidian Vaultから参照されたノートです:",
		"context.activeNote": "現在開いているノート:",
		"context.vaultFiles": "Vault内のファイル一覧（ユーザーはメッセージ中に[[ファイル名]]と書くことで、そのファイルの内容が自動的に読み込まれます）:",
		"context.linkedFiles": "ユーザーのメッセージから参照されたノート:",

		// File picker
		"filePicker.placeholder": "ノートを検索...",

		// Message editing
		"message.edit": "編集",

		// API key URLs
		"settings.apiKeyUrl": "APIキー取得: {url}",
		"error.apiKeyNotSetWithUrl": "{name} のAPIキーが設定されていません。こちらから取得: {url}",

		// Font size
		"settings.fontSize": "フォントサイズ",
		"settings.fontSizeDesc": "チャット画面のフォントサイズを調整",
		"settings.fontSizeSmall": "小",
		"settings.fontSizeMedium": "中（デフォルト）",
		"settings.fontSizeLarge": "大",

		// Vault file reading
		"context.vaultReadInstruction": "重要: ユーザーのVault内のファイルの内容を読み取ることができます。ファイルを読むには、応答に<vault_read>ファイルパス</vault_read>を含めてください（例: <vault_read>Notes/my-note.md</vault_read>）。システムが自動的にファイル内容を取得し、それに基づいて回答できます。ユーザーが特定のノートについて質問したり、ファイル内容を確認する必要がある場合に使用してください。\n\n回答中でVault内のファイルに言及する場合は、必ず[[ファイル名]]のwikilink形式を使ってください（例: [[私のノート]] や [[フォルダ/私のノート]]）。これらはObsidianで直接ファイルを開けるクリック可能なリンクになります。vault_readでファイルを読んだ場合は、回答の中でどのファイルを参照したかを明示してください（例: 「[[私のノート]]の内容によると…」）。",
		"context.vaultWriteInstruction": "ファイル編集: ユーザーがファイルの編集、修正、書き直し、誤字脱字の修正、校正、整形、作成を依頼した場合、必ずvault_writeタグで変更を提案してください。形式: <vault_write path=\"ファイルパス\">ファイルの全内容</vault_write>。必ず最初にvault_readでファイルの現在の内容を読み取り、その後修正した全内容をvault_writeで出力してください。ユーザーには変更の差分が表示され、適用または却下を選択できます。既存ファイルの編集と新規ファイルの作成の両方が可能です。用途: ブログ記事の執筆・編集、誤字脱字の修正、テキストの箇条書きや表形式への整形、翻訳、セクションの拡張や要約、構造の再構成、その他ユーザーが依頼するあらゆるテキスト変換。",
		"context.fileContentsProvided": "リクエストされたファイルの内容です:",
		"chat.readingFiles": "Vaultからファイルを読み込み中...",

		// Edit proposals
		"edit.newFile": "新規ファイル",
		"edit.modified": "変更あり",
		"edit.apply": "適用",
		"edit.applied": "適用済み",
		"edit.dismiss": "却下",
		"edit.dismissed": "却下済み",
		"edit.noChanges": "（変更なし）",
		"edit.chunk": "チャンク",
		"edit.applyAll": "すべて適用",
		"edit.revertAll": "すべて元に戻す",
		"edit.undo": "元に戻す",
		"edit.undoFailed": "元に戻せませんでした（ファイルが外部で変更された可能性があります）",
		"edit.matchNotFound": "ファイル内に一致するテキストが見つかりません",
		"notice.fileEdited": "{name} を更新しました",
		"notice.fileCreated": "{name} を作成しました",
		"notice.fileReverted": "{name} を元に戻しました",

		// Tool Use (Anthropic)
		"context.toolUseInstruction": "ユーザーのObsidian Vaultにツールを通じてアクセスできます。vault_readツールでファイルを読み取り、vault_writeツールで編集を提案できます。\n\n重要な振る舞い:\n- ユーザーが特定のノートやファイルに言及したり質問した場合、許可を求めずに積極的にvault_readで読み取ってください。\n- 編集、修正、校正、整形、作成を求められた場合、必ず最初にvault_readで読み取り、その後vault_writeで修正後の全内容を提案してください。\n- 情報を集めるために複数のファイルを順に読み取ることができます。\n- 回答中でVault内のファイルに言及する場合は、[[ファイル名]]のwikilink形式を使ってください。\n- ファイルを読んだ後は、どのファイルを参照したかを明示してください（例: 「[[私のノート]]によると…」）。",

		// Model refresh
		"settings.refreshModels": "更新",
		"settings.refreshingModels": "更新中...",
		"notice.modelsRefreshed": "モデル一覧を更新しました（{count}件）",
		"notice.modelsRefreshFailed": "モデル一覧の更新に失敗: {message}",
		"notice.modelsRefreshNoKey": "モデル一覧の更新にはAPIキーが必要です",

		// Rate limit (429)
		"error.rateLimitTitle": "APIの利用制限に達しました",
		"error.rateLimitBody": "{provider} の無料枠の利用上限を超えました。しばらく待ってから再試行するか、有料APIプランにアップグレードすると制限が大幅に緩和されます。",
		"error.rateLimitUpgrade": "有料プランへのアップグレード: {url}",

		// RAG
		"settings.rag": "RAG (Vault検索)",
		"settings.ragEnabled": "RAGを有効化",
		"settings.ragEnabledDesc": "LLMとのチャット時に、Vault全体から関連コンテンツを自動検索して提供します",
		"settings.ragTopK": "検索結果数",
		"settings.ragTopKDesc": "コンテキストに含める関連チャンクの最大数 (1-20)",
		"settings.ragMinScore": "最低関連度スコア",
		"settings.ragMinScoreDesc": "この閾値以上の関連度を持つ結果のみ含めます (0.0-1.0)",
		"settings.ragChunkStrategy": "チャンク分割方法",
		"settings.ragChunkStrategyDesc": "インデックス作成時のノート分割方式",
		"settings.ragChunkSection": "セクション単位（見出し）",
		"settings.ragChunkParagraph": "段落単位",
		"settings.ragChunkFixed": "固定トークン数",
		"settings.ragChunkMaxTokens": "チャンク最大トークン数",
		"settings.ragChunkMaxTokensDesc": "各チャンクの最大トークン数 (128-2048)",
		"settings.ragExcludeFolders": "除外フォルダ",
		"settings.ragExcludeFoldersDesc": "RAGインデックスから除外するフォルダ（カンマ区切り）。機密フォルダ（Private, Work/Confidential等）を保護できます",
		"settings.ragBuildIndex": "インデックス構築",
		"settings.ragBuildingIndex": "構築中...",
		"settings.ragRebuildIndex": "インデックス再構築",
		"settings.ragClearIndex": "インデックスクリア",
		"settings.ragIndexStats": "インデックス: {files}ファイル, {chunks}チャンク",
		"settings.ragIndexNotBuilt": "インデックスが未構築です。「インデックス構築」をクリックして開始してください。",
		"settings.ragEmbedding": "Embedding検索（セマンティック検索）",
		"settings.ragEmbeddingEnabled": "Embedding検索を有効化",
		"settings.ragEmbeddingEnabledDesc": "Embedding APIを使ったセマンティック検索を有効にします。Vaultのテキストがembedding APIサーバーに送信されます。機密フォルダは上記の除外設定で保護できます。",
		"settings.ragEmbeddingProvider": "Embeddingプロバイダー",
		"settings.ragEmbeddingProviderDesc": "Embeddingの生成に使用するプロバイダーを選択します。チャットプロバイダーとは独立して設定できます。",
		"settings.ragEmbeddingModel": "Embeddingモデル",
		"settings.ragEmbeddingUseSharedKey": "チャット用APIキーを使用",
		"settings.ragEmbeddingUseSharedKeyDesc": "チャットプロバイダーと同じAPIキーを使用します。無効にするとEmbedding専用のキーを設定できます。",
		"settings.ragEmbeddingApiKey": "Embedding用APIキー",
		"settings.ragEmbeddingCostEstimate": "推定コスト: {chunks}チャンク x 約{tokensPerChunk}トークン = ${cost}",
		"settings.ragEmbeddingCostFree": "無料（ローカルOllama）",
		"settings.ragBuildEmbeddingIndex": "Embeddingインデックス構築",
		"settings.ragBuildingEmbeddingIndex": "構築中...",
		"settings.ragEmbeddingIndexStats": "Embedding: {vectors}ベクトル, {size}, モデル: {model}",
		"settings.ragEmbeddingIndexNotBuilt": "Embeddingインデックス未構築",
		"settings.ragClearEmbeddingIndex": "Embeddingインデックスをクリア",
		"settings.ragEmbeddingGeminiTip": "Geminiには無料枠（100リクエスト/分, 1000リクエスト/日）があります。お試しに最適です。",
		"settings.ragEmbeddingOllamaTip": "Ollamaはローカル実行 — APIキー不要、データは外部に送信されません。",
		"settings.ragEmbeddingOllamaMobileTip": "モバイルでは「localhost」はスマホ自身を指します。PCのIPアドレス（例: 192.168.x.x:11434）を指定してOllamaに接続してください。",
		"settings.ragEmbeddingCompactMode": "省メモリモード（次元削減）",
		"settings.ragEmbeddingCompactModeDesc": "Embeddingの次元数を削減し、メモリとストレージを約66%節約します。モバイルや大規模Vaultで推奨。検索精度への影響は軽微です。",
		"settings.ragEmbeddingAutoIndex": "バックグラウンド自動Embedding",
		"settings.ragEmbeddingAutoIndexDesc": "アイドル時にバックグラウンドで新しいコンテンツのEmbeddingを自動生成します。APIコストが発生します。",
		"settings.ragEmbeddingTotalTokens": "累積使用トークン: {tokens}（推定コスト: ${cost}）",
		"command.buildEmbeddingIndex": "Embeddingインデックスを構築",
		"notice.ragEmbeddingBuilding": "Embeddingインデックス構築中: {current} / {total} チャンク",
		"notice.ragEmbeddingComplete": "Embeddingインデックス完了: {vectors}ベクトル ({size})",
		"notice.ragEmbeddingFailed": "Embedding生成に失敗: {error}。テキスト検索のみ使用します。",
		"notice.ragEmbeddingModelChanged": "Embeddingモデルが変更されました。Embeddingインデックスを再構築してください。",
		"command.buildRagIndex": "RAGインデックスを構築",
		"notice.ragIndexBuilding": "RAGインデックス構築中... ({current}/{total})",
		"notice.ragIndexComplete": "RAGインデックス完了: {files}ファイル, {chunks}チャンク",
		"notice.ragIndexUpdated": "RAGインデックス更新: {files}ファイル変更, {chunks}チャンク",
		"notice.ragIndexRestored": "RAGインデックス復元: {chunks}チャンク",
		"notice.ragIndexCleared": "RAGインデックスをクリアしました",
		"notice.ragNotEnabled": "RAGが無効です。設定 > RAG で有効にしてください。",
		"rag.contextHeader": "Vaultから自動検索された関連ノート（RAG）:",
		"rag.noResults": "「{query}」に関連するノートが見つかりませんでした",
		"rag.toolSearchHeader": "「{query}」に関連する{count}件のセクションが見つかりました:",
	},
};

// --- API ---

/**
 * 翻訳テキストを取得
 * @param key ドット区切りの翻訳キー
 * @param params プレースホルダー置換用パラメータ（{name}, {count} 等）
 */
export function t(key: string, params?: Record<string, string | number>): string {
	let text = translations[currentLocale][key] ?? translations.en[key] ?? key;

	if (params) {
		for (const [k, v] of Object.entries(params)) {
			text = text.replace(`{${k}}`, String(v));
		}
	}

	return text;
}

/**
 * 現在のロケールを設定
 */
export function setLocale(locale: Locale): void {
	currentLocale = locale;
}

/**
 * 現在のロケールを取得
 */
export function getLocale(): Locale {
	return currentLocale;
}

/**
 * ユーザー環境からロケールを自動検出
 * moment.locale() → navigator.language → "en"
 */
export function detectLocale(): Locale {
	try {
		// Obsidian は moment.js をグローバルに公開
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const momentLocale = (window as any).moment?.locale?.();
		if (typeof momentLocale === "string" && momentLocale.startsWith("ja")) {
			return "ja";
		}
	} catch {
		// ignore
	}

	try {
		if (navigator.language.startsWith("ja")) {
			return "ja";
		}
	} catch {
		// ignore
	}

	return "en";
}

/**
 * 設定値("auto" | "en" | "ja")から実際のロケールを解決
 */
export function resolveLocale(setting: "auto" | "en" | "ja"): Locale {
	if (setting === "auto") return detectLocale();
	return setting;
}
