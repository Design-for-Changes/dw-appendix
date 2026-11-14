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
- `src/calc/computePoint.js`：給与点ごとの計算を組み合わせる入口。税・社会保険・手当・医療・教育の計算は同ディレクトリのモジュールに分離。
- `src/calc/optimalModel.js`：現行制度系列から探索的な調整モデルを算出。
- `fixtures/cases.json`：モデル世帯と期待される変化点。
- `scripts/verify.mjs`：計算系列と期待値の回帰照合。
- `fixtures/refactor-contract.json`：リファクタリング前の21条件・27,321給与点と、生成JSON160ファイルの出力ハッシュ。既存出力との一致を検証するもので、制度解釈の正しさを保証するものではない。
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

基準日は既定で2026年11月13日、検索結果の出力先は
`private/research/egov-law-search.json` である。検索だけでは採否を決めず、公開済みの個別審査結果を上書きしない。

## Web Appendixの使用データ
- 表A1　主な制度の所得判定・変動方法（`#income-assessment`）
- 表A2　e-Gov法令検索の結果と採否（`#law-screening`）
- 表A3　計算内容と関数の対応（`#calculation-functions`、Web Appendix D内）

表A1は「所得判定・変動方法」タブに7列・10行の詳細と原典リンクを掲載する。データは
`public/data/research/income-assessment-rules.json`。

表A2は現行184法律を対象に、採用9法律と、理由別に分類した除外175法律を示す。法律の採用と数値試算の対象選定は区別する。
法令ごとの理由・根拠条文・原文リンクは `public/data/research/egov-law-screening.json` に収録する。
自治体の参照資料は `public/data/research/municipal-source-list.json`。26市の基本資料に加え、実際に参照したPDF・個別制度案内・要綱を掲載し、市別の類型該当や○×表は公開しない。

表A3は計算の流れとソース関数を対応させ、名前付き関数の引数・返却値・所在を検索できる。`npm run generate:functions`でコメントと構文木から生成し、`npm run verify:functions`でソースのハッシュ・所在と照合する。クラスは使用していない。

## ドキュメント
- `docs/model-household.md`：提示ケースとモデル条件。
- `docs/calculation-architecture.md`：モジュール構成、関数一覧の生成、検証と未解決の計算範囲。
- `docs/model-social-insurance.md`：社会保険料の近似式と検算。
- `docs/calculation-source-registry.md`：計算根拠と確度。
- `docs/appendix-data-pipeline.md`：計算コアと表示用データの分離・整合性検証。
- `docs/verification-methodology.md`：回帰検証の方法。
- `docs/research-data.md`：法令・自治体制度データの抽出条件と公開方法。
