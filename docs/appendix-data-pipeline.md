# Web Appendix の計算・表示データ分離

## 責務

- `src/calc/computePoint.js`
  - 計算の正本。ブラウザの表示処理からは直接呼ばない。
  - CI、回帰検証、表示用JSON生成で実行する。
- `scripts/generate-appendix-data.mjs`
  - fixture の P1〜P3を計算コアへ渡し、200〜1400万円・1万円刻みの表示用データを生成する。
  - 全ケースの曲線と崖は `summary.json.gz`、計算内訳は25給与点単位の `details/*.json.gz` に分ける。
- `src/hooks/useAppendixData.js`
  - ブラウザでは生成済みgzip JSONだけを読む。
  - 選択中の給与を含む内訳チャンクだけを取得し、給与掃引や税・社会保険計算は実行しない。

生成物は `public/generated/appendix/` に置くが、Git管理対象にはしない。`npm start`、`npm run build`、
`npm run verify` の前処理で必ず計算コアから再生成する。

## 整合性検証

`scripts/verify-appendix-data.mjs` は次を検証する。

1. 3ケースそれぞれが1,201給与点を持ち、200〜1400万円で連続している。
2. fixture の期待崖が生成済み表示データに存在し、落差が許容範囲内である。
3. 全3,603給与点について、軽量曲線JSONの可処分所得と内訳JSONの最終可処分所得が一致する。
4. 内訳チャンクに欠落がなく、ブラウザ用ページが `computeSeries` 等の計算コアへ依存していない。

したがって、計算ロジックを変更した場合も、表示用JSONだけが古い状態で公開されることをCIで防ぐ。
