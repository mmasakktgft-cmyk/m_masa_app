# AP 過去問トレーナー

応用情報技術者試験（科目A）の適応型過去問演習 PWA。自分専用・実行時に AI を使わない（費用 0 円）。

仕様は [docs/SPEC.md](docs/SPEC.md) を参照。

## 開発

```bash
npm install
npm run dev            # 開発サーバー
npm test               # 出題アルゴリズム・習熟度・集計のテスト
npm run validate-data  # 問題データの整合性チェック
npm run build          # 本番ビルド（dist/）
```

## 構成

| パス | 内容 |
|---|---|
| `src/logic/selector.ts` | 出題アルゴリズム（重み付き抽選・重複防止・分野バランス） |
| `src/logic/mastery.ts` | 論点ごとの習熟度・復習間隔（回答記録から毎回再計算） |
| `src/logic/stats.ts` | 傾向分析・学習カルテの集計 |
| `src/screens/` | 各画面 |
| `public/data/index.json` | 問題セットの一覧 |
| `public/data/*.json` | 問題データ（1回分ずつ） |
| `public/data/topics.json` | 論点の定義 |

## 収録データ

| セット | 問題数 | 状態 |
|---|---|---|
| 令和7年度 秋期 午前（AP-R07A） | 80 | 全問 verified（IPA 解答例と正解・分野を機械照合済み） |
| 令和7年度 春期 午前（AP-R07H） | 80 | 同上 |
| 令和6年度 秋期 午前（AP-R06A） | 80 | 同上 |
| 令和6年度 春期 午前（AP-R06H） | 80 | 同上 |
| 令和5年度 秋期 午前（AP-R05A） | 80 | 同上 |
| 令和5年度 春期 午前（AP-R05H） | 80 | 同上 |
| 令和4年度 秋期 午前（AP-R04A） | 80 | 同上 |
| 令和4年度 春期 午前（AP-R04H） | 80 | 同上 |
| 令和3年度 秋期 午前（AP-R03A） | 80 | 同上 |
| 動作確認用サンプル（SAMPLE-01） | 7 | オリジナル問題。既定では出題しない |

## 問題データの追加

1. `public/data/` に `AP-R07A.json` のように1回分のファイルを追加（問題 ID は `AP-R07A-AM-01` の形式）
2. `public/data/index.json` の `sets` に登録、新しい論点は `topics.json` に追加
3. `npm run validate-data` が通ることを確認
4. 出典は IPA 指定の形式（例：令和7年度 秋期 応用情報技術者試験 午前 問1）で `source.label` に記載する
5. 正解は IPA 公式解答のみを正とし、検証手順（docs/SPEC.md §8）を通過したものだけ `verified` にする

## 公開

`claude/ap-exam-app-spec-bjvkom`（既定ブランチ）へのプッシュで GitHub Actions がビルドし、GitHub Pages に公開する。

## 出典

問題：独立行政法人情報処理推進機構（IPA）が公表している情報処理技術者試験の過去問題。解説はこのアプリ独自のもの。
