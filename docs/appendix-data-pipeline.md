# Web Appendix の計算・表示データ分離

## 責務

- `src/calc/computePoint.js`
  - 計算の正本。ブラウザの表示処理からは直接呼ばない。
  - CI、回帰検証、表示用JSON生成で実行する。
- `scripts/generate-appendix-data.mjs`
  - fixture の P1〜P3を計算コアへ渡し、200〜1500万円・1万円刻みの表示用データを生成する。
  - 探索的調整モデルの算式は `src/calc/optimalModel.js` を呼び出す。
  - 全ケースの曲線と崖は `summary.json.gz`、計算内訳は25給与点単位の `details/*.json.gz` に分ける。
- `src/hooks/useAppendixData.js`
  - ブラウザでは生成済みgzip JSONだけを読む。
  - 選択中の給与を含む内訳チャンクだけを取得し、給与掃引や税・社会保険計算は実行しない。

生成物は `public/generated/appendix/` に置くが、Git管理対象にはしない。`npm start`、`npm run build`、
`npm run verify` の前処理で必ず計算コアから再生成する。

## 整合性検証

`scripts/verify-appendix-data.mjs` は次を検証する。

1. 3ケースそれぞれが1,301給与点を持ち、200〜1500万円で連続している。
2. fixture の期待崖が生成済み表示データに存在し、落差が許容範囲内である。
3. 全3,903給与点について、軽量曲線JSONの可処分所得と内訳JSONの最終可処分所得が一致する。
4. 内訳チャンクに欠落がなく、ブラウザ用ページが `computeSeries` 等の計算コアへ依存していない。

したがって、計算ロジックを変更した場合も、表示用JSONだけが古い状態で公開されることをCIで防ぐ。

`generate:functions` は計算ソースのJSDocから関数一覧を生成し、独立したWeb Appendix F「関数資料」の表A3へ表示する。
`verify:functions` は一覧の件数、説明、ソース行・内容ハッシュを照合する。
`verify:contract` は2026年11月15日の制度式是正後の21ケース・27,321給与点と表示用160ファイルの全出力を照合する。リファクタリング前の旧契約は `fixtures/refactor-contract.json` に保持し、旧結果と修正後の値を混同しない。
この同値検証は過去の計算との一致を検査するものであり、制度式・採用値の妥当性は原典との別の検証を要する。
