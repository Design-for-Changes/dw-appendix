# dw-appendix — 障害福祉における給付・負担の制度間相互作用と全体最適

社会保障研究 投稿論文「障害福祉における給付・負担の制度間相互作用と全体最適」の
Web Appendix。障害児世帯モデルで、世帯主の給与に対する可処分所得の「崖」と
全体調整モデルを可視化する。

## 概要
給与収入を掃引し、特別児童扶養手当、障害児福祉手当、障害児通所支援の利用者負担、
重度心身障害者医療費助成、特別支援教育就学奨励費などが同時に作用したときの
可処分所得を計算する。制度の所得制限や負担区分によって可処分所得が不連続に低下する
地点を「崖」として表示する静的Webアプリケーションである。

## 再現性
- `src/calc/computePoint.js`：給与点ごとの計算コア。
- `fixtures/cases.json`：モデル世帯と期待される変化点。
- `scripts/verify.mjs`：計算系列と期待値の回帰照合。
- `public/sources/`：計算に使用した公的資料の収録版。
- `public/sources/manifest.json`：原典URL、取得日、収録ファイルのSHA-256。
- `.github/workflows/ci.yml`：ビルド、回帰照合、資料整合性の自動検証。

## ローカル実行
```
npm ci
npm start
npm run build
npm run verify
```

e-Gov法令API Version 2から法令抽出母集団を再取得する場合は、次を実行する。

```
npm run fetch:egov-screening
```

基準日は既定で2026年6月30日、出力先は
`public/data/research/egov-law-screening.json` である。

## Web Appendixの使用データ
- 表1　e-Gov法令検索による抽出母集団と採否（186件）

採用した8法律と自治体制度19類型は本文の表1・表2に掲載する。
対応データは `public/data/research/egov-law-screening.json` と
`public/data/research/municipal-program-types.json` に保存する。

## ドキュメント
- `docs/model-household.md`：提示ケースとモデル条件。
- `docs/model-social-insurance.md`：社会保険料の近似式と検算。
- `docs/calculation-source-registry.md`：計算根拠と確度。
- `docs/appendix-data-pipeline.md`：計算コアと表示用データの分離・整合性検証。
- `docs/verification-methodology.md`：回帰検証の方法。
- `docs/research-data.md`：法令・自治体制度データの抽出条件と公開方法。
