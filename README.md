# dw-appendix — 障害福祉 給付・負担 崖シミュレーター（論文 web appendix）

社会保障研究 投稿論文「部分最適と全体最適の観点からみた障害福祉制度の課題と展望」の
web appendix。障害児世帯モデルで、世帯主の給与に対する可処分所得の「崖」を可視化する。

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

## ドキュメント
- `docs/model-household.md`：提示ケースとモデル条件。
- `docs/model-social-insurance.md`：社会保険料の近似式と検算。
- `docs/calculation-source-registry.md`：計算根拠と確度。
- `docs/appendix-data-pipeline.md`：計算コアと表示用データの分離・整合性検証。
- `docs/verification-methodology.md`：回帰検証の方法。
