# AI Voice Journal - Specifications

## 1. プロジェクト概要
* **コンセプト:** 「書くのが面倒」を解決する、友達と話す感覚のAIジャーナルアプリ。
* **コア体験:** リアルタイム音声対話による受動的な記録作成。
* **差別化:** ChatGPT Advanced Voice Modeのような「割り込み可能」「テンポの良い」会話体験と、Duolingoのような「継続したくなる」UI。

## 2. 技術スタック
* **Framework:** React Native (Expo SDK)
* **Language:** TypeScript
* **AI API:** Google Gemini 2.0 Flash (Multimodal Live API / WebSocket接続)
* **Storage:** AsyncStorage (ローカル保存・MVP段階) / 将来的にFirebase検討
* **Target:** iOS / Android (Mobile)

## 3. UXフロー & 詳細仕様

### A. オンボーディング (Initial Launch)
* 設定画面は存在しない。アプリ起動直後、いきなり通話画面へ遷移する。
* AIからの「こんにちは、君だけのAIジャーナルだよ」という音声でスタート。
* 会話の中で自然にユーザー名などをヒアリングし、内部設定に保存する。

### B. 通話画面 (Talk Screen)
* **UI:** * 画面中央にキャラクター画像を表示。
    * **口パクアニメーション:** ユーザー発話中は静止、AI発話中（音量検知）は「口を開けた画像」に切り替える簡易アニメーションを実装。
    * 背景はシンプルだが、通話中であることがわかる波形やエフェクトを表示。
* **体験:**
    * ユーザーは「会話終了ボタン」を押す必要がない（自然な会話）。
    * こちらが無言になればAIが話しかけ、AIが話していてもこちらが話せば割り込める（Gemini APIの機能活用）。

### C. 記録・コレクション画面 (Calendar Screen)
* **形式:** カレンダー形式。
* **表示:** * 日記が存在する日付マスには、生成された「日記カードのサムネイル」を表示。
    * 連続記録（ストリーク）がつながっている日付間は、鎖や炎のエフェクトでつなぐ（Duolingoライクな演出）。
* **日記カード詳細:**
    * タップするとカードが展開。
    * AIが生成した「タイトル」「要約」「感情タグ」「日付」が表示される。
    * 画像は当面、感情タグに応じたテンプレートイラストを使用。

## 4. データ構造 (MVP)
* **JournalEntry:**
    * id, date, audioPath, summaryText, title, emotionTag, visualTheme
* **UserSettings:**
    * userName, streakCount, lastTalkDate

## 5. デザイン・トーン
* 全体的にポップで楽しく、親しみやすいデザイン。
* 「事務的なツール」ではなく「ゲーム・ホビー」の雰囲気。