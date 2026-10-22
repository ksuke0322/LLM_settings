# Step 8 Jev 影判定（段階 1：影運用）

Step 8 の 8A/8B/8C と並行して Jev（TypeSafe）に同じ観点を判定させ、結果を記録するだけの手順である。
目的は、本番データで Jev と Opus 独立レビューの一致・食い違いを蓄積し、将来 Opus の判定を一部省けるかを判断する材料を作ること。
検証の経緯と根拠は `docs/jev-step8-parity/plan.md` を参照する。

## 位置づけと禁止事項

- **影判定はゲートではない。** 8A/8B/8C の合否、指摘の採否、修正対象、収束判断、waiver に一切使わない。Jev が合格と判定しても Opus のレビューは省略しない。
- **独立レビューへ渡さない。** Jev の問い・結果・比較表を `isometric-story-review` の起動プロンプト、入力画像、添付に含めない。8A/8B/8C の独立性を弱めるため。
- 影判定の失敗（API エラー、timeout、検証エラー）は Step 8 を止めない。失敗として記録し、Step 8 はそのまま進める。
- 影判定は親が問いを作り、親が実行し、親が採点する。問いの作成と採点は委任しない（正本・判定に当たるため）。スクリプトの改修は上位委任規約に従って委任できる。

## 実行タイミング

1. `step8_parent_baseline` を保存し、8A/8B/8C に渡す render set を固定した後、独立レビューを起動する前に問いを作る。
   Opus の結果を見てから問いを作ると、問いが答えに引きずられるため。
2. 同じ render set に対して影判定を実行する（独立レビューと並行してよい）。
3. 8A/8B/8C の多数決を記録した後、比較表を作り、親が台帳へ採点する。
4. render set が変わったら、新しい attempt として 1〜3 をやり直す。異なる render set の結果を混ぜない。

## 対象とする観点

| 観点 | 対象 | 対象外（常に Opus だけが判定） |
|---|---|---|
| 8A | Acceptance Matrix の必須一致項目のうち、形・位置・数・接続など目に見える条件に分解できるもの | 配色・質感のリッチさ、雰囲気、密度感など主観的・相対的な基準 |
| 8B | 接地・接合・浮き・貫通・比率など、kind ごとに目に見える条件で問えるもの | 事前に何を確認するか決められない自由な点検 |
| 8C | 各 kind の署名パーツの実現、クラスの読み取り、存在理由 | なし（3 項目すべて対象） |

対象外の観点は問いを作らず、問いファイルにも入れない。

## 問いの作り方（v3 ルール）

1 行 = Acceptance Matrix の 1 項目、8C の 1 kind × 1 チェック、または 8B の 1 kind × 1 観点。

- **小問に分解する。** 1 行を、目に見える条件の Noul 2〜3 個（最大 3 個）に分ける。行の合格は「すべての小問が合格」。
- **肯定形の 1 文で書く。** 「Yes なら合格」になる向きに揃える（`polarity: "yes_is_pass"`）。「〜に読めない」「〜ではない」のような否定・二重否定を使わない。
- **見る画像を指す。** 問いの主語は `` `closeup_0` の巣箱の屋根は `` のように、見るべき画像のキーで始める。全体の配置や周囲との関係を問うときだけ `` `scene` `` を使う。
- **バッククォートは state のキーにだけ使う。** `scene`、`closeup_N`、`notes` 以外を `` ` `` で囲まない。kind 名は普通の言葉で書く。
- **`notes` で各画像が何を写すかを書く。** 例：`scene は巣箱のある草地の場面全体。closeup_0 は巣箱の拡大`。
- **criteria で Yes / No の意味を定義する。** `true` と `false` に、画像で確かめられる具体的な状態を 1 文ずつ書く。
- **数・位置・接続・形・色の有無で問う。** 「らしい」「自然な」「十分な」だけで終わる問いにしない。

例（8A、巣箱の燻煙器）：

```json
{"sub_0": {"type": "noul",
  "instructions": "`closeup_0` の燻煙器のふいごの側面に、ジグザグの折り目が見えますか。",
  "criteria": {"true": "蛇腹の折り目が見える", "false": "平らな板が重なっているだけに見える"},
  "polarity": "yes_is_pass"}}
```

## ファイル

すべて `pomodoro_assets/<theme>_<story>/evidence/` に置く。`<N>` はクール番号、`<A>` は attempt 番号（ReviewLedger v1 の attempt と揃える）。

### 問いファイル `cool<N>_jev_shadow_a<A>_questions.jsonl`

1 行 1 JSON。

```json
{
  "schema_version": 1,
  "id": "cool1-a1-8c-hive-signature",
  "review_type": "8A|8B|8C",
  "item": {"kind": "hive", "criterion": "署名パーツ: 入口スリット"},
  "render_set_sha256": "<64 桁の小文字 16 進数>",
  "state": {"scene": "/abs/path/cool1_final_still.png", "closeup_0": "/abs/path/cu_hive.png"},
  "notes": {"notes": "scene は場面全体。closeup_0 は巣箱の拡大"},
  "context": "画像はアイソメトリック視点の 3D レンダーです。各画像が何を写しているかは `notes` にあります。トイクレイ調の簡略化そのものは欠陥とみなしません。見えている内容だけで答えてください。",
  "aggregation": "all_pass",
  "questions": {"sub_0": {"type": "noul", "instructions": "...", "criteria": {"true": "...", "false": "..."}, "polarity": "yes_is_pass"}}
}
```

- `state` の値は存在する PNG / JPEG の絶対パス。長辺 1568px を超える画像は実行時に自動で縮小される（元画像は書き換えない）。
- `context` の文面は上の例を既定とし、変える場合は台帳の `parent_note` に理由を書く。
- 実行前に `validate-questions.mjs` で検証する。

### 結果ファイル `cool<N>_jev_shadow_a<A>_results.jsonl`

`run-jev-shadow.mjs` が 1 行ずつ追記する。各行は問いの `id`、`requested_model`、応答の `model`、`usage`、`error`、小問ごとの確率と判定、行の判定 `row_verdict`（`pass` / `defect` / `uncertain` / `invalid`）、`row_p_min` を持つ。
API キー、リクエストヘッダー、画像のバイト列は記録しない。

判定の区切り：確率 > 0.8 は Yes、< 0.2 は No、0.2〜0.8 は不確実。行は「1 つでも invalid → invalid、1 つでも欠陥 → defect、1 つでも不確実 → uncertain、すべて合格 → pass」。

### 台帳 `cool<N>_jev_shadow_ledger.jsonl`

多数決の確定後に、親が問いの行ごとに 1 行追記する。

```json
{
  "schema_version": 1,
  "attempt": 1,
  "row_id": "cool1-a1-8c-hive-signature",
  "review_type": "8C",
  "render_set_sha256": "<64 桁>",
  "jev_row_verdict": "pass|defect|uncertain|invalid",
  "opus_outcome": "defect|pass|not_judged",
  "opus_basis": "majority_confirmed|majority_not_confirmed|measured_true|measured_false|not_reviewed",
  "parent_note": "1 行"
}
```

- `opus_outcome` は親が多数決の記録（`cool<N>_step8_majority.md`）と実測から決める。2/3 以上で確定した指摘、または実測で裏付けた指摘に当たる行は `defect`。その観点で確定指摘がなく、実測で反証された指摘も含めて問題なしとなった行は `pass`。独立レビューがその観点を判定していない行は `not_judged`。
- `jev_row_verdict` は結果ファイルの値を転記する（`compare-jev-shadow.mjs --ledger-template` が下書きを作る）。

## 手順

スクリプトは `scripts/jev_shadow/` にある。事前に `~/.agents/shared/jev` で `npm ci` を済ませ、`TYPESAFE_API_KEY` を環境変数に設定しておく。

```bash
node ~/.agents/skills/isometric-story-workflow/scripts/jev_shadow/validate-questions.mjs <questions.jsonl>
```

```bash
node ~/.agents/skills/isometric-story-workflow/scripts/jev_shadow/run-jev-shadow.mjs --live --questions <questions.jsonl> --out <results.jsonl> --cache-dir <scratch の絶対パス>
```

- モデルは既定で `jev-1.14.0` に固定される。変える場合は `--model` を指定し、台帳の `parent_note` に書く。
- 途中で止まった場合は `--resume <results.jsonl>` で未完了の行だけを再実行する。

多数決の記録後：

```bash
node ~/.agents/skills/isometric-story-workflow/scripts/jev_shadow/compare-jev-shadow.mjs --results <results.jsonl> --reports <ReviewReport JSON...> --ledger-template <台帳の下書きの出力先>
```

比較表（Jev の行ごとの判定と、Opus の各 run の指摘を kind 別に並べたもの）を見ながら、親が下書きの `opus_outcome`・`opus_basis`・`parent_note` を埋めて台帳へ追記する。

複数クール・複数ストーリーの集計：

```bash
node ~/.agents/skills/isometric-story-workflow/scripts/jev_shadow/summarize-jev-shadow.mjs <台帳...> --results <結果ファイル...>
```

## 段階 2 へ進む判断材料

集計で次を確認する。判断はユーザーが行う。

- 実欠陥（`opus_outcome = defect`）のうち、Jev が `pass` と判定した件数（見逃し）。重大度 high に当たるものは別に数える。
- Opus 単発 run の見逃しとの比較（多数決で確定した指摘を、各 run が挙げていたか）。
- Jev が `pass` と確定した行の割合（Opus を省ける可能性のある割合）。
- Jev の費用（入力・出力トークン）。
- 見逃し率で判断するのは、実欠陥が 30 件以上たまってからとする。それまでは参考値として扱う。
