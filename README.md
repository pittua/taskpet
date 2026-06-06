# taskpet 🐾

**推しキャラ（AI）と一緒に進める、タスク管理アプリ。**

自分だけの「推し」キャラクターを設定すると、タスクの完了を褒めてくれたり、相談に乗ってくれたり、タスクごとにアドバイスをくれます。AI には Google Gemini を使用し、データは端末内にのみ保存されます（バックエンド不要）。

> Expo / React Native 製。Android 実機・エミュレータで動作します。

---

## ✨ 主な機能

- **タスク管理** — 追加 / 編集 / 削除、メモ、期限、繰り返し（毎日・毎週）
- **ドラッグ&ドロップ並び替え** — ハンドルをつかんで自由に並べ替え
- **期限通知** — 指定時刻にぴったり通知（exact alarm 対応、アプリを閉じていても発火）
- **推しキャラ設定** — 名前・アバター画像・性格（プロンプト）・テーマカラーをカスタマイズ
- **AI チャット相談** — 推しキャラと会話。タスク状況を踏まえて応答
- **タスク別アドバイス** — タスクごとに専用コメント。内容が変わらない限りキャッシュして再利用（API 節約）
- **完了時の褒め＆デイリーレポート** — 完了するとキャラが褒めてくれる
- **統計** — 今日の達成数・累計完了数（削除しても減らない／長押しでリセット）・完了率

## 🛠 技術スタック

- [Expo](https://expo.dev) SDK 54 / React Native 0.81 / React 19
- [expo-router](https://docs.expo.dev/router/introduction/)（ファイルベースルーティング）
- [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai)（Gemini `gemini-2.5-flash`）
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)（通知・正確なアラーム）
- [react-native-draglist](https://www.npmjs.com/package/react-native-draglist)（並び替え）
- AsyncStorage によるローカル永続化（サーバー・ログイン不要）

## 🔑 Gemini API キーについて

このアプリは **各ユーザーが自分の Gemini API キーを用意** して使う設計です（キーはアプリに同梱されません。端末内にのみ保存されます）。

1. [Google AI Studio](https://aistudio.google.com/app/apikey) で無料の API キーを取得
2. アプリの **設定（⚙）画面** に貼り付けて保存

> キーが未設定だと AI 機能（チャット・アドバイス・褒め）は動作しません。タスク管理機能だけなら未設定でも使えます。

## 🚀 開発・ビルド手順

> **注意:** カスタムネイティブモジュールを使うため、**Expo Go では動きません**。開発ビルド（dev client）が必要です。

### 前提

- Node.js（LTS 推奨）
- Android Studio + Android SDK
- JDK（Android Studio 同梱の JBR でも可）

### 手順

```bash
# 1. クローン
git clone https://github.com/pittua/taskpet.git
cd taskpet

# 2. 依存をインストール
npm install

# 3. Android 実機/エミュレータでビルド＆起動（android/ は自動生成されます）
npx expo run:android
```

起動後、アプリの設定画面で Gemini API キーを入力してください。

## 📦 APK の入手（ビルド不要で使いたい人向け）

ビルド済みの APK は [Releases](https://github.com/pittua/taskpet/releases) から入手できます。
ダウンロードして Android 端末にインストール（提供元不明アプリの許可が必要）してください。各自で Gemini API キーの設定が必要です。

## 📄 ライセンス

[MIT License](./LICENSE) © 2026 pittua
