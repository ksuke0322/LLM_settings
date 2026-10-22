# 制作ワークフロー（クール単位）

この文書はステップ6〜7.5を扱う。Blenderの実装規則は `blender-isometric-rules` スキルを必ず併用する。委任の経路・権限と親子の作業境界は `~/.agents/AGENTS.md`、`~/.agents/references/delegate-flow.md`、`~/.agents/references/delegate-policy.md`、`references/codex-delegation.md`を参照する。

### ステップ6: クール用ファイルを準備

- **必ず最初に**、対応する設計書ファイル(`design/story_design.md`)と本番制作差分メモ(`design/prompt_notes.md`)のファイルmtimeを確認する。`story_contract.json`の`source.design_doc_revision`および`source.prompt_notes_revision`と一致する場合は契約ファイルを入力に使う。不一致時は該当ファイルを明示Readし、契約を更新して`validate_story_contract.py`を通す。テーマ固有データを暗黙の前提だけで扱ってはならない。
- 作業ディレクトリは`/Users/sawairikeisuke/Documents/Blender/isometric/pomodoro_assets/<theme>_<story>/`を新規作成し、その配下で作業する。`.blend`はディレクトリ直下に`<story>_cool<N>.blend`(例: `lighthouse_cool1.blend`)で保存し、レンダリング結果は`output/`サブディレクトリに、設計書・プロンプトノートは`design/`サブディレクトリに置く。
- **クール1: 空`.blend`の用意は人間が行う — 必須の停止点**。AIはここで作業を止め、次を人間に依頼する: (1) Blenderを起動する、(2) File > New で新規ファイルを作り、既定のCube・Camera・Lightを削除して空にする、(3) `pomodoro_assets/<theme>_<story>/<story>_cool1.blend`として保存する、(4) blender-mcpアドオンのサーバを起動して接続可能にする。人間から「保存・接続完了」の返答を得るまで次へ進まない。AIは`bpy.data.filepath`が期待した絶対パスであることを確認してから制作を開始する。
- **MCP経由でのファイルロードを禁止する**: `bpy.ops.wm.read_homefile`・`bpy.ops.wm.open_mainfile`を`execute_blender_code`から実行してはならない。MCPコマンドは`bpy.app.timers`のコールバック内で走るため、ファイルロードは既存のPython参照を無効化して破損の原因になる。ファイルを切り替える必要が生じた場合は、AIが自分でロードせず人間にGUI操作を依頼する。
- クール2以降: **前クール完成後、同じ生きているセッションのまま`bpy.ops.wm.save_as_mainfile(filepath=".../<story>_cool<N>.blend")`で次クール用ファイルへ付け替える**(ゼロから作り直さない・ファイルを開き直さない)。`save_as_mainfile`はデータを解放せず保存先を付け替えるだけなので、直前クールの`.blend`はディスク上に完成スナップショットとして凍結され、MCP接続も維持される。付け替え後は`blender-isometric-rules`7章のルールR(クール間引き継ぎ)を必ず適用する。
- `references/manifest-schema.md`を基に作業ディレクトリ直下へ`cool<N>_manifest.json`の骨格を作る。未生成artifactはキーを省略し、未実施の将来gateは`pending`にする。成果物生成ごとに絶対パスを追加する。
- **クール別チェック画像の生成**: オブジェクト一覧表の「初出クール」列が**当該クール以下**(前クールまでの完成要素+今回新規追加分)の要素だけに絞ってプロンプトを組み、1枚生成する。未来のクール(まだ存在しないはずの要素)は絶対に含めない。生成手段はステップ3.5と同じ(GUI操作の確認スクショに関するトークン規約も同じく適用する)。保存先: `pomodoro_assets/<theme>_<story>/ref/cool<N>_reference.png`。
- `cool<N>_reference.png`保存後、`references/codex-delegation.md`に従って`cool_reference_preflight`の画像一次確認を行う。未来要素の混入や明白な画像破綻は候補として記録し、チェック画像の採用・再生成は親が決める。
- **PolyHaven対象の適用確認**: ステップ2・3で確定したPolyHavenアセットを`blender-mcp`の`download_polyhaven_asset`/`set_texture`で実際にダウンロード・適用し、シーンの質感・色味と合うか確認する。問題なければそのまま採用する。合わない場合の扱い(AIが自己判断でプロシージャルへ差し替えず、一旦停止してユーザーにフォールバック可否を確認する)は`blender-isometric-rules`3章「外部アセット活用方針」を正本とする。

### ステップ7: 制作(7a → 7b → 7cの3工程)

ステップ6でfetchしたテーマ固有差分(寸法変数・オブジェクト一覧・state構成)と`blender-isometric-rules`スキルを組み合わせ、`blender-mcp`経由で該当クールを制作する。ステップ6で生成したクール別チェック画像を質感・装飾密度の参照として見ながら作り込む(寸法・配置等の構造的なルールは`blender-isometric-rules`を優先し、画像は質感・装飾のリッチさの目線合わせに使う)。

**実装者は親(Claude Code)である。** 親は候補`.blend`へ7a→7b→7cを順に実装し、各工程の後にCodexへ既存の読取証跡・定量QAを依頼できる。Codexは候補`.blend`を変更しない。

**制作は必ず以下の3工程を順に踏む。** プリミティブ(cube/cylinder/cone)を置いてBoolean/GNで後付けするだけの加算式で完成としてはならない(オブジェクト自体の詳細度が上がらず低品質になる事故が実際に発生した)。各工程の実装ルールは`blender-isometric-rules`2.5章「オブジェクトの作り込み」を参照する。

#### ステップ7a: ブロックアウト精緻化

- ステップ4で承認済みのグレーボックスanimatic(=既存のブロックアウト)を土台に、全体配置・プロポーション・カメラ画角を確定する。
- **プリミティブからの作り直しを禁止する**(承認済みのブロックアウトを捨てて一から組み直すと、レビュー済みの構図・比例が失われ、今回revertに至った加算式に逆戻りする)。ブロックアウトは「捨てる下書き」ではなく「詳細化していく土台」として扱う。

#### ステップ7b: 個別作り込み

- 各オブジェクトを、ワークシートの「意図する見た目(名前付き署名パーツ)」と「作り込みティア」に従って詳細化する。ベベル/Subsurfによる塊の丸み・二次形状、面のレリーフ(ディスプレイスメント・目地Boolean)、付属パーツの追加、GNインスタンス等の**手法選択はこの工程で行う**(ワークシートには手法を書かず、意図=名前付き署名パーツだけを書いてある。手法は描画スケールとスタイルからここで決める)。全ティアで「そのクラスに読める」ことが必須(背景小物も素のprimitiveで終わらせない)。この署名パーツはステップ8Cで記載どおりに実現されたか照合される。
- 度合いはスタイル(トイクレイ調=丸く柔らかい)× 描画スケール(1080正方形セーフエリア)で決める。過剰な実メッシュより浅いディスプレイスメントを既定とする。詳細は`blender-isometric-rules`2.5章。

#### ステップ7c: テクスチャリング

- マテリアル適用・質感ムラ・Bump・PolyHavenアセット適用を行う。実装ルールは`blender-isometric-rules`3章「マテリアル・質感」に委譲する(質感レンジ・PolyHaven適用時の自己判断差し替え禁止など)。

#### ステップ7d: 定量scene・継続性・timeline preflight

- Blenderからクール別scene snapshotとtimeline snapshotを抽出し、契約ファイルと合わせて`validate_scene_contract.py`、クール2以降は`validate_cool_continuity.py`、`validate_timeline.py`を実行する。
- **実行者の分担**: 親が実装・FAIL/WARNの解釈・修正・gate判定を担当する。委任経路と権限は上位委任規約に従い、`references/codex-delegation.md`で定めた範囲内で、既存のsnapshot抽出・定量QA・asset auditスクリプトの実行と指定先への証跡出力を委任できる。候補`.blend`と既存スクリプトは読み取り専用とする。
- scene validatorはsafe area、Collection、アセット初出、ティア、材質、作り込み、接地、stage内、寸法比、背景密度を、continuity validatorは前クール完成物・World・共有材質の未承認差分を、timeline validatorは予定frame/easing/演出タイプ・同時動作数を検証する。
- `blender-isometric-rules/references/quantitative-qa.md` を同時に参照し、scene / timeline の入力は Blender の評価済み実シーンと実 F-Curve から抽出する。契約値を手転記した snapshot、目視だけの `grounded` / `crafted` / `coverage` は無効とする。
- 各クールで `audit_assets.py` → scene contract → continuity（クール2以降）→ timeline の順に PASS を得る。FAIL はステップ8へ持ち込まず修正する。WARN は数値と waiver を review package に含める。
- 実行は`run_blender_quantitative_qa.py --blend <cool.blend> --contract <story_contract.json> --cool <N> --output-dir <evidence> --ledger <absolute-quantitative-ledger>`を正本とする。再発停止後に親が修正方針を確定した場合だけ`--parent-decision "理由"`を追加し、判断を台帳へ1件記録してQAを続行する。未指定時の挙動は変えない。必要なら`--video <cool.mp4>`を渡し、`ffprobe`の出力仕様判定も同じhard gateに含める。入力不変の`pass`だけを再利用し、同じFAIL fingerprintが2回連続した場合は親判断へ戻す。成果物・Custom Property・waiver形式は`story-contract-schema.md`と`blender-isometric-rules/references/quantitative-qa.md`に従う。
- **背景ディテールの視認個数(15〜30)は、評価済みGeometry Nodes出力から実測する。** GNスキャッターの結果はホストオブジェクトのメッシュへ実体化されるため、評価済みdepsgraphで`to_mesh()`し、**辺の連結成分(loose parts)を1個=背景ディテール1個として数える**。各連結成分の重心を`world_to_camera_view`でNDC化してフレーム内判定し、`scene.ray_cast`で遮蔽されないものを視認可能とする。
  - **Poisson分布をPython側で近似再現して数えるのは無効**とする(実際に、近似27個に対し実GN出力は23個という乖離が発生した)。`Distance Min`のチューニングも、近似ではなく実測個数をフィードバックして収束させる。
- 失敗時は該当する制作工程へ戻る。静止画の定性レビューや動画レンダリングで機械的に再発見しない。

### ステップ7e: 実装変更の自己検証レンダー

- 親が7b/7cで変更した後、変更したkindのclose-upだけを変更前と同じframe・camera・出力条件で再レンダーする。
- `scripts/verify_render_delta.py --before <before.png> --after <after.png> --threshold 0.002`を実行し、`changed_ratio`が閾値以上であることを確認する。必要なら`--region <x> <y> <width> <height>`で対象領域だけを比較する。
- 有効な画像で変更が閾値以上なら`status=pass`・終了コード`0`、有効な画像で変更がないか閾値未満なら`status=fail`・終了コード`1`、破損・未対応形式・サイズ不一致・領域不正など入力を評価できない場合は`status=error`・終了コード`2`とする。`error`を未変更の`fail`として扱わない。
- 同一PNG、または対象領域内に変更がない場合は`status=fail`とし、Step 8のrender setを作成しない。変更が画面に現れたことを親がclose-up画像で読み、意図した視覚変更であることを確認してから次へ進む。ピクセル差分だけではStep 8へ進めない。

### ステップ7.5: 全アセット棚卸し(作り込みティア監査) — hard gate

**背景**: 主体(hero)に作り込みが集中し、二次オブジェクト(草・小道・柵・木・背景小物)が
プリミティブ直置きや仮マテリアルのまま静止画QAを通過する事故が実際に発生した。これを機械的に塞ぐ。

- **粒度は「オブジェクトの種類(アセット)」単位**とする。1メッシュずつ手選択はしない
  (インスタンス・複製・GNスキャッターのインスタンス元は1種類として扱う)。
- `blender-isometric-rules`の`scripts/audit_assets.py`でシーンを機械列挙し、各種類について次を判定:
  1. **マテリアルが本物**か(ブロッキング): 仮プレースホルダ検出(Base Colorのみでノード変化なし＝procedural変化なし
     かつ画像テクスチャ未接続 → プレースホルダ疑い=FAIL)。設計書でPolyHaven指定の要素は
     実際に画像テクスチャが接続されているか。加えてBase Colorが既定グレーのまま未接続はWARN(色の設定忘れ疑い)。
  2. **接地**しているか(ブロッキング): raycastで浮き・めり込み検出=FAIL。
  3. **作り込み(craft)**(助言のみ・ブロッキングしない): 素のprimitive相当(作り込み手法が見当たらない)ならWARN。
     これは「作り込み品質OK」の証明ではない。**作り込み品質の合否は機械では判定せず、ステップ8B(物理的妥当性)・
     8C(署名パーツが設計どおり実現されているか)の独立レビューで判定する**。
- **material/接地のFAILが1つでもあればステップ8へ進めない**(7b/7cへ戻る)。craftのWARNは「7bで作り込むべき候補」を示す助言として使い、最終的な作り込み合否は8B/8Cに委ねる。
- **署名パーツのpx予算FAILが1つでもあればステップ8へ進めない**。`blender-isometric-rules/scripts/check_px_budget.py --contract <story_contract.json> --scale 332.3`を実行し、silhouetteは12px、contrastは可視境界1本あたり6px以上であることを確認する。凹みなど複数境界で読むcontrastは契約の`contrast_edges`で境界本数を明示し、各境界の判定pxが6px未満ならFAILとする。未達は設計を粗くするか、現スケールでは実現不能と記録してから先へ進む。
- 判定結果(種類ごとの material / 接地 / craft助言)を`evidence/cool<N>_asset_audit.md`へ記録する。
- 「全部を1個ずつ見る」を、種類単位・機械列挙で網羅的かつ効率的に行うのが本ゲートの趣旨。既存のステップ8B・`review-checklist.md`B節(サンプル抽出・目視判定)を置き換えるものではなく、その前段で見落としをゼロにする網羅性チェックとして機能する。
