# レビュー・公開ワークフロー

この文書はステップ8〜12とレビュー成果物の提示を扱う。品質条件は `references/quality-gates.md`、Step 8の閉じた契約・baseline・台帳は `references/step8-review-control.md`、独立レビューの起動文は `references/step8-review-prompts.md`、manifest構造は `references/manifest-schema.md` を正本とする。画像一次確認の入出力形式は `references/codex-delegation.md` を参照する。

## レビュー成果物の提示

人間レビューを依頼するときは、会話文だけで依頼してはならない。成果物本体と補足説明を分離し、レビュー・パケットを独立したMarkdownファイルとして保存する。パケットには対象一覧、主要成果物の絶対パス、確認観点、承認/修正記録欄を含める。`evidence`はレビュー後の判定証跡、`review_package`はレビュー依頼時に確認する成果物として扱い、混在させない。

- **Codex**: 主要な静止画・動画を絶対パス付きMarkdownで会話内にインライン表示し、レビュー・パケットへのファイルリンクを渡す。会話本文は確認対象、パケットへのリンク、求める判断だけにする。ローカルMarkdownをArtifact相当の専用プレビューとしては扱わない。
- **Claude Code**: レビュー・パケットをArtifactとして作成し、成果物本体、確認観点、承認/修正欄をArtifact内で確認可能にする。
- **フォールバック**: インライン表示またはArtifactが使えない場合も、絶対パスを含む独立Markdownレビュー・パケットをファイルとして渡す。UI機能の不在を理由にレビューを省略しない。
- 人間レビューgateが`pass`になる場合、manifestの`review_package`にパケットの絶対パス、UI提示した主要成果物の絶対パス配列、提示方式を記録する。詳細は`references/manifest-schema.md`を正本とする。

### ステップ8: 自己レビュー(未解決の必須項目ゼロまでのループ・hard gate)

**背景(なぜループ必須か)**: 構造チェックを通過しても、質感・装飾密度・World設定が目標に届かない事故と、生成参考画像自体の不自然さへ過適合する事故の両方が起こり得る。製作者の自己採点バイアスを避けるため、判定はこのセッションの文脈を持たない独立サブエージェントに行わせ、`references/quality-gates.md`のAcceptance Matrixで未解決の必須項目が0になるまでループする。

#### `step8_parent_baseline`（8A起動前hard stop）と再実行制御

8Aを起動する前に、親エージェントは当該クールの基準参照画像1枚と現行完成stateレンダー1枚を自分で確認する。守る視覚アンカー3〜5個、参照画像と設計・物理妥当性が衝突する箇所、Acceptance Matrixへ反映した許容差・waiver候補を整理し、candidate/render set/current renderのSHA-256を添えて`evidence/cool<N>_step8_baseline.json`へ保存する。baselineと親の既知課題は独立レビュアーへ渡さず、親が確定した判定基準・必要な画像・実測値だけを渡す。

参照画像と設計・実物資料の衝突を含む「設計上の確定事項」は、ステップ4で作成した`design/reference_conflicts.md`から機械的に転記する。8Aプロンプトへ親が手入力で別の採否を書くことは禁止する。

基準画像が読めない、参照と設計の優先関係が未確定、Acceptance Matrixの必須/許容分類が曖昧、または現行レンダーがbaselineの対象と一致しない場合は、8Aを起動せず`needs_parent_decision`で停止する。baselineは8Aの開始条件であり、8B/8Cの独立性を弱める既知課題メモではない。

各試行は`references/step8-review-control.md`のReviewLedger v1へ、attempt番号、candidate `.blend`のSHA-256、render setのSHA-256、Acceptance Matrix revision、レポート絶対パス、指摘fingerprint、親の対応を記録する。8Aのvalidator起動時は親baselineの絶対パスを`--baseline`、waiverを使う場合はmanifestの絶対パスを`--manifest`で必ず渡し、`scripts/validate_step8_review.py`で次を確認する。`status=pass`以外を成功扱いにしない。

- candidate `.blend`とrender setが両方不変で、`measurement_revision`も更新されていない場合は再レビューしない。再レビューには新しいレンダーまたは更新済み実測値を要求する。
- 同一finding fingerprintが連続2回出た場合、3回目を自動起動せず`needs_parent_decision`で親へ戻す。
- 8Aのwaiverは既存manifestの`reason`、`impact`、`approved_by`が揃う場合だけ成立する。8B/8Cのwaiverはgate完了に使わない。
- JSON不正、画像未読、入力不足、タイムアウト、`needs_parent_decision`は成功扱いにしない。

**画像一次確認(前処理)**: 8A/8B/8Cに入る前に、`references/codex-delegation.md`に従って`step8_review_preflight`を実行する。結果は候補抽出・画像整理・違和感の事前把握にのみ使う。画像削減・保持の最終判断、8A/8B/8Cの最終判定、品質ゲートの合否、設計上の修正方針は委任しない。
- 同じ固定画像・model/config・prompt/schemaの成功済み一次解析は`scripts/validate_preflight_cache.py`で再利用可否を確認する。cache missや入力変更は通常の再解析へ進み、画像未読・timeout・JSON不正・低確信度は停止する。成功した短いJSONは`--record-report`でledgerへ記録する。記録時は`observations[]`の`item`・`evidence_image`・`confidence`・`note`を必須とし、confidenceは数値なら0.6以上、ラベルなら`medium`/`high`だけを許可する。
- 8A/8B/8Cへ渡す寸法・接触面・px換算は、`scripts/emit_measured_facts.py --blend <cool.blend> --contract <story_contract.json> --output <evidence/cool<N>_measured_facts.md>`の出力をそのまま使う。親が実測値を手入力してはならない。出力にはworld bbox、回転を打ち消したlocal断面、接触面z、px換算、散布代表個体を含める。

**多数決 v1を既定とする**: 8A/8B/8Cは同一レンダー・同一入力・同一プロンプトで独立3本を実施し、項目単位で2/3以上が挙げた指摘だけを確定する。8Aはrequired_match項目、8Bはhigh/medium項目、8Cはkind単位で集計する。多数決の記録は`references/step8-review-control.md`の様式に従い、`evidence/cool<N>_step8_majority.md`へ保存する。レンダーが変わったら再集計し、異なるレンダーを混ぜない。

**修正対象の制限**: 修正してよいのは、多数決で確定した指摘と、親が実測で裏付けた指摘だけである。1本のrunだけが挙げた指摘は、実測で真偽を確定できる場合を除き修正しない。8Aの`improvable`、8Bの`minor`、8Cのnote欄はゲート条件ではなく、その場で修正してはならない。`evidence/cool<N>_step8_advisories.md`へ記録し、ステップ9の人間レビュー用パケットへ含めて採否を決める。

ステップ8では**3種類の独立したレビューループをすべて実施**する(8A・8B・8C)。役割を1つのレビューに混載させない(混載は見落としの原因になり、実際に「PASSなのに低品質」の事故を生んだ)。

- **8A(相対比較)**: 参考画像との比較。質感・装飾密度・配色のリッチさが目標に届いているか。
- **8B(絶対妥当性)**: オブジェクト単体として物理的に自然か。比率・向き・接地・接合・破綻がないか(参考画像なし・一般常識と実物資料で判定)。
- **8C(仕様実現)**: 設計の約束を果たしたか。ワークシート「意図する見た目(名前付き署名パーツ)」の各パーツが**記載どおりの形・位置・向きで実現されているか**、背景小物が種類単位でそのクラスに読めるか、各オブジェクトの**存在理由が読めるか**(チェックリスト駆動)。

**参考画像自体は「アイソメ表現に忠実な完璧なお手本」ではない**(別の生成AIによる簡易生成物であり、非現実的な形状を含む場合がある)ため、8Aだけでは「参考画像と一致しているが両方ともおかしい」という共倒れを検出できない。8Bはこれを補う。8Cは「機械ゲートは通るが、設計に書いた"らしさ"が実装で抜け落ちている/存在理由が読めない」事故を塞ぐ(実際に発生した事故: 背景の草が素の円錐のまま、周辺小物が"とりあえず置いた"状態で意図が読めない、という崩れが、機械ゲートと8A/8Bを通過した後の人間レビューで初めて指摘された)。作り込み品質のブロッキング権限は機械ゲートではなく8B/8Cに置く。

**独立レビューのモデル固定(必須・漏れ厳禁)**: 8A・8B・8Cの独立サブエージェントは**必ず`subagent_type: isometric-story-review`で起動する**。このエージェント定義(`~/.claude/agents/isometric-story-review.md`)が`model: opus`・`effort: medium`を固定しているため、指名するだけでモデルと工数が一貫して適用される(Agentツールでmodel/effortを都度指定する必要はない/できない)。汎用エージェント(general-purpose等)で起動して製作スレッドのモデルを継承させることを禁止する。作業経緯・既知の課題は渡さない(独立性の維持)。

**起動プロンプトの正本(必須・漏れ厳禁)**: 8A・8B・8Cの起動プロンプトは`references/step8-review-prompts.md`を正本とし、同ファイルの雛形の`<...>`を埋めて使う。**雛形を使わずに毎回書き起こさない**(書き起こしは判定基準そのもののドリフトを生む。実際に8Aの呼称が「Acceptance Matrixレビュー」「Visual Acceptance」で、8Bが「常識・物理的妥当性」「常識チェック」で揺れた)。起動前に同ファイル末尾の「起動前チェックリスト」を1項目ずつ確認する。修正ループの2回目以降も同じ雛形で起動し、前回の指摘・修正履歴は渡さない(渡してよいのは新しいレンダー画像と更新された実測値だけ)。

**実行者の分担(必読)**: ステップ8で委任できるのは画像一次確認、レンダー実行、既存定量QAの実行だけである。具体的には、固定入力画像の`step8_review_preflight`、完成state静止画・密集エリアclose-up・kind単位close-up、および親が修正した候補`.blend`の再レンダーを委任できる。**8A/8B/8Cの判定と、その指摘に基づく候補`.blend`の修正実装は親が行う。** 判定は必ず`subagent_type: isometric-story-review`で行う。指摘の解釈・採否、設計側(存在理由・パーツ定義)の見直し、収束判断、waiver判断、証跡とmanifestの更新は親が行う。委任先は候補`.blend`を読み取り専用で使い、レビュー結果の解釈を任されない。実行経路・モデル・effort・権限は上位委任規約を参照する。

共通手順:

1. 完成state(最終frame)の静止画レンダリングを行う(Codexへ委任可)。動画レンダリングはこの静止画チェックを通過した後にのみ行う(コストが高いため、判断のたびに動画を作らない)。
2. `blender-isometric-rules`の`references/review-checklist.md`(A〜F節+構造別クローズアップ検証)に基づく構造的な自己レビュー(接合・接地・フレーミング等、コードで機械的に検証できる項目)を行う。

#### ステップ8A: Acceptance Matrixレビュー(相対比較)

3. **`subagent_type: isometric-story-review`(opus・effort中固定)**を、同一入力・同一プロンプトで3本独立起動する。完成state静止画、クール別チェック画像、Reference Pack、Acceptance Matrixだけを渡し、作業経緯・既知の課題は共有しない。起動プロンプトは`references/step8-review-prompts.md`の「8A 雛形」節を使う。
4. サブエージェントに各差分を「必須一致」「許容差あり」「改善可」「waiver」のいずれかへ分類させ、required_matchの項目単位で2/3以上のものだけを確定する。確定した必須一致の未解決項目は親が実際に修正し、Codexへ再レンダリングを依頼して手順3へ戻る。単発のimprovableは修正しない。
5. 「必須一致の未解決項目なし」になるまで、入力差分を台帳とvalidatorで確認しながら繰り返す。waiverは理由・影響・承認者が揃うまで未解決扱いとする。同一指摘fingerprintの連続再発や入力不変は自動反復せず、親の判断へ戻す。判定証跡をmanifestの`visual_acceptance`へ記録する。

#### ステップ8B: 常識チェックレビュー(絶対妥当性・参考画像なし)

6. 完成state静止画に加えて、**オブジェクトが密集するエリア(棚上・デスク上等の装飾小物、本棚の本の並び等)のクローズアップレンダリング**を用意する(全体静止画だけでは小さな装飾小物の破綻が解像度的に見逃されるため)。
7. **`subagent_type: isometric-story-review`(opus・effort中固定)**に、**生成参考画像は渡さず**、全体静止画、クローズアップ、対象物の実物資料だけを渡す。一般常識と実物資料に照らし、**物として自然か**(形状、比率、向き、接地、接合の不自然さ・破綻)を列挙させる。ここでは物理的妥当性に集中する(署名パーツが設計どおり実現されているか・存在理由が読めるかは8Cで判定するため、8Bに混載しない)。起動プロンプトは`references/step8-review-prompts.md`の「8B 雛形」節を使う。
8. 3本のうち2本以上が同じhigh/medium項目を報告した場合だけ、親が実際に修正(寸法比・向き・配置等)し、Codexへ再レンダリングを依頼して手順7に戻る。1本だけの指摘は実測で裏付けられない限り修正せず、`cool<N>_step8_advisories.md`へ記録する。
9. サブエージェントが「不自然な箇所なし」と判定するまで、入力差分を台帳とvalidatorで確認しながら7〜8を繰り返す。waiverで8Bを完了扱いにしない。

#### ステップ8C: 仕様実現レビュー(署名パーツの実現・チェックリスト駆動)

10. 入力を用意する: 全体静止画 + **種類(kind)単位のクローズアップ**(背景小物・背景ディテールを含む全kind。1枚に映らない場合はkindごとにカメラを寄せて複数枚) + ワークシートの各オブジェクトの「名前付き署名パーツ」と「存在理由」 + 各kindの実物資料。生成参考画像は渡さない。
11. **`subagent_type: isometric-story-review`(opus・effort中固定)**に**種類(kind)単位の判定表**を必須で出力させる。起動プロンプトは`references/step8-review-prompts.md`の「8C 雛形」節を使う。各kindについて次を判定する:
    1. 名前付き署名パーツが**記載どおりの形・位置・向きで実現されているか**(単に「在るか(presence)」ではなく「意図どおりに実現(realization)されているか」)。未実現のパーツを名指しで列挙させる。
    2. 描画スケールで「そのモノ/そのクラス」に読めるか(背景小物・背景ディテールはクラス単位で判定。素のprimitive=円錐/球/円柱に見えるものはNG)。
    3. 存在理由が読めるか(「なぜこの物がここにあるか」が画面から伝わるか。"とりあえず置いた"に見えるものはNG)。
12. 3本のうち2本以上が同じkindについて「未実現の署名パーツ」「クラスに読めないkind」「存在理由が読めないオブジェクト」を報告した場合だけ、親が実際に修正(7bへ戻って作り込み、必要なら設計側の存在理由・パーツ定義も見直す)し、Codexへ再レンダリングを依頼して手順11に戻る。1本だけのnoteは修正せずadvisoryに記録する。存在理由そのものが立たない物は削る判断も含める。
13. サブエージェントが全kindについて上記3点を満たすと判定するまで、入力差分を台帳とvalidatorで確認しながら11〜12を繰り返す。waiverで8Cを完了扱いにしない。判定表を`evidence/cool<N>_signature_realization.md`に残し、manifestの`signature_realization`(8C)へ記録する。

#### 収束条件

14. 収束しない、同じ指摘fingerprintが連続2回出る、または入力が変わらない場合は自動ループを継続せず、`needs_parent_decision`として親が状況(何が・何回・なぜ解決できないか)を確認して判断を仰ぐ。
15. ステップ9に進めるのは、**8Aで未解決の必須項目がなく、8Bで不自然な箇所なし、8Cで未実現の署名パーツ・読めないkind・読めない存在理由がなし**と判定された最終レンダリングのみ。作り込み品質のブロッキング権限はこの3レビュー(特に8B/8C)にあり、機械ゲート(ステップ7.5・7dのcraft助言)のPASSでは代替できない。

### ステップ9: 人間レビュー

- 完成state(最終frame)の静止画と必要なクローズアップを`review/cool<N>_still_review.md`のレビュー・パケットへまとめ、クライアント別の提示規約に従ってレビューを依頼する。承認なしで次に進まない。
- `evidence/cool<N>_step8_advisories.md`が存在する場合は、ステップ9の人間レビュー用パケットへ必ず添付し、advisoryの採否を人間が決める。advisoryだけを理由にステップ8を再実行してはならない。
- 提示前に`validate_review_evidence.py`へ`required_gates=["animatic", "still_human_review"]`を渡し、現在必要なanimatic・静止画のパケット、主要成果物、絶対パスを検証する。ファイル不足を人間レビューへ持ち込まない。

### ステップ9.5: プレビュー動画レンダリング

- ステップ9で承認が得られたら、追加の指示を待たずにそのクールのプレビュー動画を書き出す(静止画OK→動画レンダーは標準フローの一部)。
- 書き出し設定(解像度・fps・コーデック等)は`blender-isometric-rules`4章「レンダー出力仕様を固定する」に従う(数値はそちらを参照し、ここでは再掲しない)。
- 長尺(数百フレーム規模)のレンダリングは`blender-isometric-rules`7章のルールに従い、MCP経由の同期呼び出しではなくヘッドレスBlenderのコマンドラインプロセス(`blender -b <file.blend> -a`)をバックグラウンド起動で行う。
- **実行者の分担**: 上位委任規約と`references/codex-delegation.md`に従う場合、このレンダー実行を委任できる。親は実装済み候補`.blend`の絶対パス、出力先`output/`の絶対パス、frame範囲、`blender-isometric-rules`4章の出力仕様をレンダー依頼へ固定する。委任先は候補`.blend`を読み取り専用で使い、指定`output/`への動画出力とプロセス完了報告だけを行う。候補・正本`.blend`、manifest、gate判定は更新しない。完了判定、manifest更新、validator実行と結果の解釈、ユーザーへの提示は親が行う。
- 完了判定はプロセス終了だけでなく、manifestを更新して`python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_package.py <cool<N>_manifest.json> --through render --ledger <absolute-render-validation-ledger> --render-spec-revision <revision>`を実行する。この時点より後のgateは`pending`でよい。解像度、fps、codec、pixel format、音声なし、固定frame rate、尺、容量、全frame decodeの全項目が合格するまで次へ進まない。
- 長時間かかる場合は`ScheduleWakeup`等で定期的に進捗を確認し、都度ユーザーに待機状況を伝える。
- 完成した動画ファイルは絶対パスでユーザーに提示する。

### ステップ10: Motion QA・通し再生確認(hard gate)

- `references/quality-gates.md`のMotion QAを実施し、開始・中間・終了・state境界、速度、easing、ポッピング、ちらつき、遮蔽、Ambient Loopを確認する。
- 直前クールまでを必ず通しで確認し、カメラ、照明、色、共有object、回転位相の連続性を検査する。
- 修正後はblend/videoのrevisionを更新してから再レンダー・再検査し、現在のMotion QA keyをJSONで保存して`python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_repetition_ledger.py <absolute-motion-qa-ledger> --key-file <absolute-current-motion-key>`で再実行可否を確認する。同じ入力の`pass`は再検査せず、同じfinding fingerprintが2回連続した場合は自動再実行せず親が判断する。passまたは承認済みwaiverと証跡をmanifestへ記録するまで次のクールへ進まない。
- `python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_package.py <cool<N>_manifest.json> --through motion`が合格することを確認する。

### ステップ11: 次のクールへ進む

ステップ10のhard gateが通り、証跡とmanifestを更新した後に次のクールへ進む。次クールはステップ6から制作し、ストーリー共通のステップ3.5・5の設計内容を再利用する。

### ステップ12: ストーリー全体の最終レビュー

- 全クール完了後、通し動画とApp Integration QA証跡を`review/story_final_review.md`のレビュー・パケットへまとめ、クライアント別の提示規約に従って最終レビューを依頼する。
- 最終レビューは人間の確認と承認を必須とし、承認記録がない場合はストーリーを完成扱いにしない。
- `references/quality-gates.md`のApp Integration QAを実施する。25分進捗へのframe写像、pause/resume、完了frame、Focus・ThemeDetail・完了画面・正方形cropを実アプリの統合環境で確認する。
- 通し動画の絶対パスとストーリー最終レビュー証跡を全クールmanifestへ記録する。
- ストーリー最終レビュー前には`validate_review_evidence.py`へ3つの人間レビューgateすべてを渡し、レビュー・パケットと主要成果物の存在を検証する。
- `python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_theme_integration.py <theme_integration_input.json> --json-only`で`Content/themes.json`、バンドル動画、クール数、25分(1500秒)写像を検証してからApp Integration QAへ進む。
- 全クールに`python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_package.py <cool<N>_manifest.json> --through app`を実行し、全gateが`pass`または承認済み`waived`になった時点だけを完成とする。
- **上記が完了したら、ストーリー案側のステータスも同じ操作の中で更新する(別タスク・後回しにしない)**:
  1. 該当ストーリーファイル(`docs/story-ideas/themes/<theme>/story-NN-slug.md`)のfrontmatter`status`を`未着手`等から`完成`へ更新する。
  2. `docs/story-ideas/README.md`の「テーマ一覧」表で該当テーマ行の「ステータス内訳」列を実際の内訳(例: `完成:1・未着手:4`)に更新し、表直下の合計行(`合計: <N>テーマ / <M>ストーリー(完成X・未着手Y)`)の完成数・未着手数も合わせて更新する。
  3. 表の下の変更履歴に`> YYYY-MM-DD(ステータス更新): <テーマ>の「<ストーリー名>」は実際には制作済みのため、ステータスを未着手→完成に変更。`の形式(既存の`windmill-hill`更新履歴と同じ書式)で一行追記する。
  4. このステータス更新はストーリー全体の完成条件の一部であり、manifestの全gate `pass`だけでなく、この3ファイル(ストーリーファイル・README表・README変更履歴)の更新が揃って初めてステップ12完了とする。
