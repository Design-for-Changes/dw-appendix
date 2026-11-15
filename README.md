# dw-appendix — 障害福祉における給付・負担の制度間相互作用と全体最適

社会保障研究 投稿論文「障害福祉における給付・負担の制度間相互作用と全体最適」の
Web Appendix。障害児世帯モデルで、世帯主の給与に対する可処分所得の「崖」と
全体調整モデルを可視化する。

シミュレーター名は「障害福祉給付・負担シミュレーター（dw-appendix）」とする。

## 概要
給与収入を掃引し、特別児童扶養手当、障害児福祉手当、障害児通所支援の利用者負担、
重度心身障害者医療費助成、特別支援教育就学奨励費などが同時に作用したときの
可処分所得を計算する。制度の所得制限や負担区分によって可処分所得が不連続に低下する
地点を「崖」として表示する静的Webアプリケーションである。

2026年11月15日：制度式の是正と改稿用条件の拡張を分けた。D・Eは旧医療・旧N04条件を含む従来3入力の参考計算であり、改稿用の結果ではない。Gは31家族構成×配偶者給与3条件×利用額3条件を定義しているが、N04需要測定の必須入力の原典確認待ちのため、結果を0円で補完せず保留している。[更新内容と制約](docs/calculation-update-20261115.md)を参照。

## 再現性
- `src/calc/computePoint.js`：給与点ごとの計算を組み合わせる入口。税・社会保険・手当・医療・教育の計算は同ディレクトリのモジュールに分離。
- `src/calc/optimalModel.js`：現行制度系列から探索的な調整モデルを算出。
- `fixtures/cases.json`：旧モデル世帯・旧期待値を保存した履歴。現在の是正後の期待値ではない。
- `fixtures/display-corrections-20261115.json`：是正後の従来3入力による表示用回帰値。
- `fixtures/calculation-contract-20261115.json`：原典例・境界テストと原因別対照の後に記録した21条件・27,321給与点と生成JSON160ファイルの回帰ハッシュ。制度全体の正しさを保証するものではない。
- `fixtures/refactor-contract.json`：数値不変リファクタリング時の旧契約を保存。制度式是正後の出力と一致させるための書換えはしない。
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

## Web Appendixの収録資料
- 表A1　給付・負担関連制度の所得区分・判定方法―船橋市をサンプルとした確認（`#income-assessment`）
- 表A2　e-Gov法令検索の結果と採否（`#law-screening`）
- 表A3　計算内容と関数の対応（`#calculation-functions`、Web Appendix F「関数資料」）

表A1はCに8列・44行（国20、船橋24）の詳細と原典リンクを掲載する。国9法律・自治体19類型に対応し、所得条件あり29／なし11／未確認4。データは
`public/data/research/income-assessment-rules.json`。

表A2は現行184法律を対象に、採用9法律と、理由別に分類した除外175法律を示す。法律の採用と数値試算の対象選定は区別する。
法令ごとの理由・根拠条文・原文リンクは `public/data/research/egov-law-screening.json` に収録する。
自治体の参照資料は `public/data/research/municipal-source-list.json`。26市の基本資料に加え、実際に参照したPDF・個別制度案内・要綱を掲載し、市別の類型該当や○×表は公開しない。

表A3は計算の流れからページ内の関数説明へ移動でき、関数説明から対応する処理・ソースへ辿れる。名前付き関数の引数・返却値・所在を検索でき、各関数への直接URLも利用できる。`npm run generate:functions`でコメントと構文木から生成し、`npm run verify:functions`でソースのハッシュ・所在と照合する。クラスは使用していない。

G（`#revision-scenarios`）の条件定義は `public/data/research/revision-scenarios.json`。`node scripts/generate-revision-scenarios.mjs`で再生成する。未確定の需要測定入力を含む場合、条件だけを保存し結果は出さない。これらを実態の分位点・代表世帯と呼ばず、人口や財政総額の重みは付けない。

## ドキュメント
- `docs/calculation-update-20261115.md`：制度式の更新、旧条件と改稿条件の区別、残る原典確認。
- `docs/model-household.md`：提示ケースとモデル条件。
- `docs/calculation-architecture.md`：モジュール構成、関数一覧の生成、検証と未解決の計算範囲。
- `docs/model-social-insurance.md`：社会保険料の近似式と検算。
- `docs/calculation-source-registry.md`：計算根拠と確度。
- `docs/appendix-data-pipeline.md`：計算コアと表示用データの分離・整合性検証。
- `docs/verification-methodology.md`：回帰検証の方法。
- `docs/research-data.md`：法令・自治体制度データの抽出条件と公開方法。
