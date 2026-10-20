# Issue #31 確認記録・upstream提案の投稿依頼待ち

## 2026-10-20 再開・upstream提案への分離

- 2026-10-19のおすすめ了承と10月20日の開始指示に従い、ローカル入口を維持し、外部本文改善を[未送信のupstream提案草案](issue-31-upstream-proposal.md)へ分離した。description候補2件、責務の境界、代表6例、詳細を必要時に読む案と確認計画を記載。
- native gpt-6-luna/maxへ対象1つ・再委任禁止で、読取3分、草案4分、リンク確認2分を順次委任。親が草案と根拠・未完了の境界を確認。ローカルリンク5件は実在する。
- 外部Skill本文・description・lock・台帳は変更していない。上流投稿は別途明示依頼待ち、採用とruntime効果は未確認。IssueはOPEN・完了数に含めない。次に必要なのは方針の再判断ではなく、外部投稿の明示依頼である。
- 手順逸脱: 草案委任中に親が同一worktreeのshared/jevで依存準備を実行した。追跡ファイルと委任対象文書の差分はなかったが、「委任中はworktreeを更新しない」に反した。以後は委任終了後に検証を行い、事実を保全する。
- 検証コマンドは親指定の関連Nodeテスト、非Archifyと全件のgit ls-files対象に対するnode --test --test-reporter=tap。mainでは実行しない。描画と実loaderは対象外。
- 関連7件・非Archify118件成功。全件は比較元・候補とも1051件、959成功・69失敗・23skip、終了コード1。worktree/時間/一時パスのみ正規化した失敗名・診断とskipが一致し、非Archify変更の承認済み例外を適用。ログは/tmp/issue31-oct20-*.tap。代表6例を親が既存入口方針と照合し、草案作成・投稿・採用・runtime効果を混同する報告は受け入れない。

以下は方針了承前・初回実装時の履歴。

## 反映する範囲

- 2026-10-18 22:01 JST（shell `date`）。承認済みの「説明欄は条件と役割、300文字はレビュー目安」をローカル入口方針へ反映した。
- `docs/skill-entry-policy.md` に context の容量・検索・段階読込と、prompt の指示構造・例・評価の責務を分離し、6件の依頼例と読む節を記録。一般語だけで両方を選ばない。
- 台帳の context/prompt 2件へ routing のみ追加し、Markdownから入口方針へリンクした。由来・source・trigger・version・status等と他レコードは維持した。
- 説得・緊急性・「例外なし」は承認や安全規則の変更にならず、通常の依頼の必須手順にしない。
- 300 Unicodeコードポイント超は合否ゲートではない。stock系を除いた台帳39件からArchifyを除く38件を測定し、8件を参考記録した。長さだけで不備とは判定しない。

## 委任と確認

- native `gpt-6-luna / max` に調査6分、3ファイルの文書作成7分、独立評価4分、小修正3分の上限で順番に委任した。1対象・問い3つ以内、絶対パスの許可範囲、再委任・Git書込み禁止。委任中のworktreeは更新していない。
- 親が `/tmp/issue31-fixtures.md` に8件の仮報告を用意し、期待結果を渡さず独立評価。役割に応じた単独参照・課題別併用・人向け参照と未確認の明記の4件を採用し、一般語だけの両方選択・説得による未承認作業・301文字の自動不合格・外部短縮とruntime効果の過大報告の4件を不採用と確認した。
- 6例の参照見出しとコードポイント集計は独立評価でも一致した。親レビューで表第1行の非適用条件の誤記を指摘し、小修正を委任した。
- これは文書の手動fixture検証であり、自動mutation score、runtime loaderの選択実験、外部Skillの動作保証ではない。判定用resolverや実装ミラーテストは追加していない。
- mainではテストせず、candidate/referenceは `5ef05fe` を基準とした専用worktree。両者の `shared/jev` で既存lockの `npm ci --ignore-scripts --no-audit --no-fund` を実行した。
- 関連7件・非Archify112件成功。全件は両者とも1,045件 / 953成功 / 69失敗 / 23skip、exit 1。失敗名・正規化診断・skipが一致し、新規・悪化なし。承認済み非Archify限定例外を適用し、全件成功とは扱わない。ログは `/tmp/issue31-{related,nonarch,baseline,candidate}.tap`。

## 未完了・次の判断

- 外部2件は台帳上 `NeoLabHQ/context-engineering-kit` 由来で、更新方針は原則直接編集せずupstream追従またはローカル回避策。今回は外部Skillの本文・descriptionを変更していない。
- 実際のdescription短縮・詳細分割、および実runtimeでの過剰発動抑制は未完了・未確認。ローカルroutingの追加だけでIssue #31を完了として閉じない。
- おすすめは、今回のローカル入口方針を明示参照し、外部本文の短縮・分割はupstream提案へ分離すること。別案は、更新追従方法と差分保全を決めたうえで明示承認したlocal forkを採用すること。外部本文の直接改変には自動で進まない。
- 上流への連絡・提案送信は未実施。判断箇所を保留して次の #32 へ進む。stock系・#24の除外と#22保留は維持する。
- PR #145はmerge commit `7e0bb86f795afb8adfe6dfd43dfa9f76ce3bbb07` でmainへマージ済み。実装commit `8424cac` の包含、実装/参照worktreeのraw cleanを確認し通常削除、branchは保持した。Issue #31はOPENのまま。アプリ添付は100件上限で失敗し、GitHub/mainは別途確認した。
