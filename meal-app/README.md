# ごはん記録（claude.ai 上の食事管理アプリ）

写真を撮るだけで Claude がカロリーと PFC を推定する、スマホ向けの食事管理アプリ。
claude.ai 上のページ（Artifact）として公開している：https://claude.ai/artifact/QGZUbARtNr2SqhfSVvX355

- AI の推定・アドバイス・献立づくりは、claude.ai の `sample` 機能で **利用者自身の Claude の利用枠** を使う（API キー・追加料金なし）
- 記録は claude.ai のアプリ用データベース（`db`）の **利用者ごとの非公開領域** に保存する。スマホと PC で同じ記録を使える
- 写真はアプリの写真置き場（`assets`）に保存する

## 機能

| 区分 | 機能 |
|---|---|
| 記録 | 朝・昼・夕・間食。写真を選ぶとそのまま Claude が品目・量・kcal・P/F/C を推定して入力。文章（「牛丼並盛」など）からの推定、手入力も可 |
| 目標 | 性別・年齢・身長・体重・活動量・目標から目標カロリーと PFC を自動算出（手動設定も可） |
| 体重・水分 | 体重・体脂肪率のグラフと BMI、水分のワンタップ記録 |
| 便利機能 | Myメニュー、最近食べたものから追加、献立計画（Claude が提案）、献立から買い物リスト |
| アドバイス | その日の食事と直近7日の傾向から Claude がアドバイス |
| データ | バックアップの保存・取り込み（写真は含まない）。GitHub 版（端末保存版）のバックアップも取り込める |

## 保存の形

1つのアプリで保存できる文書は 5,000 件までなので、1日の記録を1件にまとめている。

| パス | 中身 |
|---|---|
| `data/users/<自分>/app` | `{ profile }` |
| `data/users/<自分>/app/days/<YYYY-MM-DD>` | その日の食事・水分・体重・献立（`Day`） |
| `data/users/<自分>/lists` | Myメニュー・買い物リスト |

## 開発

```bash
cd meal-app
npm install
npm test        # 目標カロリー・回答の読み取り・バックアップ変換・買い物リストのテスト
npm run build   # dist/meal-log.html（公開する1枚のページ）を作る
```

`npm run build` は Vite でビルドしたあと、`scripts/inline.mjs` で JS と CSS を1枚の HTML にまとめる。
公開（更新）は、このファイルを Claude の Artifact ツールで同じ URL に publish する。宣言する機能は `db`・`user`・`assets`・`sample`（写真を送るので `{"images": true}`）・`downloads`。

claude.ai の外（`npm run dev` など）で開くと `window.claude` がないため、「claude.ai で開いてください」と表示される。

## 構成

| パス | 内容 |
|---|---|
| `src/platform.ts` | claude.ai の機能（`window.claude.use`）への入口とエラー文 |
| `src/store.tsx` | 記録の読み書き（購読・同じ文書への書き込みは1つずつ）、確認シート、通知 |
| `src/logic/claude.ts` | Claude への指示文と、回答（JSON）の読み取り |
| `src/logic/backup.ts` | バックアップの作成と、GitHub 版バックアップの変換 |
| `src/logic/nutrition.ts` | 基礎代謝（Mifflin-St Jeor 式）・目標カロリー・PFC |
| `src/screens/` | きょう・記録・献立/買い物・体重・設定 |
