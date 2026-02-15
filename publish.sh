#!/bin/bash
set -e

# 1. ホームディレクトリの誤った .git を削除
if [ -d "$HOME/.git" ]; then
    rm -rf "$HOME/.git"
fi

# 2. プロジェクトの Git 初期化
git init
git branch -M main

# 3. リモート登録
git remote add origin https://github.com/m0370/obsidian-llm-assistant.git || git remote set-url origin https://github.com/m0370/obsidian-llm-assistant.git

# 4. コミットとプッシュ
git add .
git commit -m "Initial commit: LLM Assistant plugin v0.1.14"
git push -u origin main

# 5. タグ作成
git tag -f 0.1.14
git push -f origin 0.1.14
