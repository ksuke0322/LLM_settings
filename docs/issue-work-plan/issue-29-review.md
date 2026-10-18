# Issue #29 確認記録

## 対象と方針

- 2026-10-18 21:33 JST（shell `date`）。承認済みの「自動修正の範囲と回数を限定、人間レビュー」を実施。
- Blender側の本文と `references/quantitative-qa.md` の2文書に限定。具体的な補正条件は後者に集約した。#22で保留中の旧権限例外・委任経路、workflow本文、validator、数値閾値、waiver CLI形式は変更していない。
- 個別の承認済み計画にcheck ID、object-property、決定的操作・目標値、変更幅、有限の最大試行数、実行者を記録する。未設定なら自動補正しない。共通の数値上限は発明していない。個別計画は既存の実行者権限を拡張しない。
- 各試行の前後値・revision・fingerprint・実測証跡・回数・結果を残す。補正後はrevision更新、QAの全順序再実行、必要なレンダー更新、同一revisionの証跡とレビュー、Step 9の人間承認を要する。
- 上限到達、同一fingerprintでの同じ問題の連続再発、入力不変、許可範囲外、新たな判断で停止して親へ戻る。再承認なしで上限をリセットしない。
- WARN waiverには既存CLI形式とは別のレビューpacketに承認者・理由・影響範囲・check ID・revisionを記録する。FAILや人間レビューを免除しない。

## 委任と検証

- `gpt-6-luna / max` にBlender側の調査5分、レビュー側の調査4分、文書作成7分、漏れ2点の修正2分、独立評価4分、正常例の再評価1分の上限で順番に委任。1対象・問い3つ以内、絶対パス許可範囲、再委任・Git書込み禁止。委任中のworktreeは更新していない。
- 親は無条件の補正表現が接合節にも残っていること、既存権限を拡大しない明記の不足を見つけ、小修正を委任して確認した。
- 親が `/tmp/issue29-fixtures.md` に9つの仮報告を用意し、期待結果を渡さず独立評価。回数未設定、PASSだけで完成、同一問題反復、allowlist外の美観変更、旧revision流用、waiverでFAIL/人間承認を免除する誤報告6件は不採用。WARNの適切なwaiver、上限で停止する2件は採用可。
- 当初の正常例もcheck ID不足を指摘された。例にcheck ID・確定目標値・全記録を補い再評価し、既存権限内の実行・QA再実行・同一revisionレビュー・人間承認待ちの正常例が採用可能と確認した。
- これは文書方針の手動の誤判断fixture検証であり、実装の自動mutation scoreではない。実際のBlender操作・レンダー・画像レビューや、人間承認を取得したとは扱わない。文書に対応する判定用resolverや実装ミラーテストは追加していない。
- 関連する既存Pythonテストはbaseline/candidateとも115件成功。コマンドは `python3 -B -m unittest discover -s skills/isometric-story-workflow/tests`。既存unittestの入口を根拠に実行し、ログは `/tmp/issue29-{baseline,candidate}-python.tap`。
- 関連Nodeテスト `node --test bin/skill-inventory.test.mjs bin/workflow-policy.test.mjs` は7件成功。非Archifyは112件成功。
- mainではテストせず、candidate/referenceは `468fb13` を基準とした専用worktree。両者の `shared/jev` で既存lockに対する `npm ci --ignore-scripts --no-audit --no-fund` を実行した。
- 全件はbaseline/candidateとも1,045件 / 953成功 / 69失敗 / 23skip、exit 1。69失敗の名前・正規化診断とskipが一致し、新規・悪化なし。承認済みの非Archify限定例外を適用する。全件成功とは扱わない。ログは `/tmp/issue29-{related,nonarch,baseline,candidate}.tap`。

## 限界と完了処理

- 既存品質ゲートの値や実行者権限を変えていない。実成果物への自動適用・runtimeでの強制力を追加したとは扱わない。
- stock系、Archify、#24は対象外。#22の判断保留は維持する。
- 全件検証の比較、PR・マージ、main同期、clean確認・通常後片付けは後続の確認後に記録する。
