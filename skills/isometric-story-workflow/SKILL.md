---
name: isometric-story-workflow
description: アイソメトリックポモドーロアプリ用に新しいテーマ・ストーリー・クールを設計・制作する際に必ず参照する。Story Beat、animatic、参考収集、設計表、Blender制作、静止画・Motion QA、アプリ統合確認、成果物manifestまでの品質ゲートを扱う。「新しいテーマを作って」「ストーリーを設計して」「クール1/クール2を作って」のようなタスクで必ず読む。Blenderでの具体的な実装ルールは blender-isometric-rules スキルを併用する。
---

# テーマ制作ワークフロー

## 位置づけ

- 本スキルは「いつ何を、どの順序で、どのレベルの厳密さで決めるか」を扱う。「Blenderでどう正しく作るか」は `blender-isometric-rules` スキルを参照する(ステップ6以降で必ず併用する)。
- 用語定義(必読): テーマ > ストーリー > クール > 映像 の階層。
  - テーマ: 世界観のまとまり(例: 小さな街)。
  - ストーリー: テーマ内の1つの物語ライン。複数クールの連作(基本3〜6クール)で構成される。
  - クール: 1回のポモドーロ(25分)で完結する単位。**クール1はゼロから完成させ、クール2以降は前クールの完成形をそのまま引き継いでさらに発展させる(ゼロから作り直さない)**。
  - 「ストーリーが切り替わる」ときは対象がゼロから始まる。「クールが切り替わる」が同じストーリー内なら前クールの完成形を引き継ぐ。
- **画像・動画をユーザーに提示する際は必ず絶対パスで貼る**(相対パスは作業ディレクトリとの二重連結でリンク切れを起こす事故が実際に発生した)。チャット内にインライン表示できる場合は表示し、加えて絶対パスも明記する。
- 物語・animatic・Acceptance Matrix・Motion QA・App Integration QAの詳細は`references/quality-gates.md`を必ず参照する。クール成果物manifestは`references/manifest-schema.md`に従い、`scripts/validate_story_package.py`で検証する。
- 反復実行での再読コストを抑えるため、ステップ2〜5で検証専用の`story_contract.json`を作成し、ステップ6以降は定量validatorの結果を先に読む。構造と更新規則は`references/story-contract-schema.md`を正本とする。
- Step 8の独立レビュー返却・親baseline・再実行台帳は`references/step8-review-control.md`と`scripts/validate_step8_review.py`を正本とする。8A/8B/8Cの品質判定モデルと独立性は変更しない。

## Ministral画像一次解析の共通ルール

ステップ1・3.5・6では画像の棚卸し・事前確認に、ステップ8では8A/8B/8Cの前処理にMinistralを使ってよい。いずれも読み取り専用の一次解析であり、設計・修正・品質ゲートの判断を代替しない。

### 実行条件

- 明示設定は`model: ministral-3:8b-16k`、`model_provider: ollama-local`、`model_reasoning_effort: none`、`oss_provider: ollama`を使う。通常のdelegate候補へ自動追加したり、hookから自動実行したりしない。
- 親エージェントが入力画像の絶対パスと順序を固定する。Ministralに画像の検索・選定・追加・省略をさせない。1回の解析目的も1つに限定する。
- 出力は短いJSONとし、`purpose`、`input_images`、`observations`、`uncertainties`、`failure`を含める。`observations[]`には少なくとも`item`、`evidence_image`(絶対パス)、`confidence`、`note`を記録する。
- 画像未読、JSON不正、タイムアウト、低確信度、根拠画像が一意でない場合は失敗扱いにする。推測で補完せず、画像の削減・省略も行わない。
- 親エージェントはMinistralの結果、根拠画像、必須保持画像を確認してから次工程へ渡す。Ministralの結果を正解ラベル、最終判定、設計仕様、修正方針として扱わない。

### 工程別の固定用途

- **ステップ1 — `reference_inventory`**: 主要オブジェクト、雰囲気・配色・質感、署名パーツ候補、構造関係、不確実項目を棚卸しする。参考画像の採否、Story Beat、オブジェクトの存在理由、寸法・カメラ・演出の決定は親が行う。
- **ステップ3.5 — `world_reference_preflight`**: `world_reference.png`の画像未読、明白な生成破綻、設計した世界観との大きな色・密度・要素ずれを候補として抽出する。生成画像の採用、品質、Reference Packの要否は親と人間レビューで決める。
- **ステップ6 — `cool_reference_preflight`**: `cool<N>_reference.png`について、当該クールまでの要素が見えるか、未来クールの要素が混入していないか、画像未読や明白な破綻がないかを確認する。チェック画像の採用・再生成・設計適合の決定は親が行う。
- **ステップ8 — `step8_review_preflight`**: 8A/8B/8Cの固定入力画像を一次確認し、画像の対応関係、重複・欠落候補、明白な違和感候補を整理する。画像を削減する場合も保持対象の最終判断は親が行い、最終判定・品質ゲートの合否は`isometric-story-review`と親が担う。

Ministralは、Web検索画像の取得、Story Beatの設計、Blender実装、候補`.blend`の修正、8A/8B/8C以外の品質ゲート、Motion QA、App Integration QAを担当しない。

## レビュー成果物の提示

人間レビューを依頼するときは、会話文だけで依頼してはならない。成果物本体と補足説明を分離し、レビュー・パケットを独立したMarkdownファイルとして保存する。パケットには対象一覧、主要成果物の絶対パス、確認観点、承認/修正記録欄を含める。`evidence`はレビュー後の判定証跡、`review_package`はレビュー依頼時に確認する成果物として扱い、混在させない。

- **Codex**: 主要な静止画・動画を絶対パス付きMarkdownで会話内にインライン表示し、レビュー・パケットへのファイルリンクを渡す。会話本文は確認対象、パケットへのリンク、求める判断だけにする。ローカルMarkdownをArtifact相当の専用プレビューとしては扱わない。
- **Claude Code**: レビュー・パケットをArtifactとして作成し、成果物本体、確認観点、承認/修正欄をArtifact内で確認可能にする。
- **フォールバック**: インライン表示またはArtifactが使えない場合も、絶対パスを含む独立Markdownレビュー・パケットをファイルとして渡す。UI機能の不在を理由にレビューを省略しない。
- 人間レビューgateが`pass`になる場合、manifestの`review_package`にパケットの絶対パス、UI提示した主要成果物の絶対パス配列、提示方式を記録する。詳細は`references/manifest-schema.md`を正本とする。

## Claude Code → Codex 委任（検査・証跡取得・レンダー実行）

- Claude Code親は、要件・設計・Blender実装・修正・優先順位・人間レビュー・waiver・統合判断・正本採用を担当する。Codexは、検査、証跡整合、既存validator・既存定量QAスクリプトの実行、animatic・完成済みspike・静止画・動画のレンダー実行だけを行う。Codexは候補`.blend`を実装・修正・保存しない。
- 実行時の標準経路はCodex MCPの完全一致ツール`mcp__codex__codex`から`gpt-5.6-luna` / `max`へ委任する。対象はレンダー、既存validator、scene/timeline snapshot、定量QA、証跡整合だけであり、Ministralへ移管しない。MCP可用性が`false`または`unknown`ならMinistralへフォールバックしない。親または可用性を確認済みのCLI経路へ戻す。継続対話が必要な場合だけ`mcp__codex__codex_reply`の完全一致を確認する。
- Codex委任は必須ではない。親が既存`AGENTS.md`のSubagent policyに照らしてCodex委任を選ぶ場合、`references/codex-delegation.md`を正本として、モデル、`reasoning effort`、依頼文、入力、検証、起動タイミングを固定する。

### 親のBlender実装とCodexの実行境界(最重要)

- **親(Claude Code)が候補`.blend`のBlender実装・修正を一貫して担当する。** 対象は7aのブロックアウト精緻化、7bのkindごとの作り込み、7cのマテリアル・テクスチャリング、ステップ4のspike作成、8A/8B/8C指摘の修正実装である。必要なBlender用コード、`bpy`を使うPython、GNノードグラフ構築、実装用スクリプトの作成・修正も親の担当とする。
- Codexが実行できるのは、既存のscene/timeline snapshot抽出・寸法・接合・視認個数などの実測スクリプト、既存validator、チェックリスト照合、固定済みレンダーだけである。**新規スクリプト、実測スクリプト、レンダー設定の作成・修正、候補`.blend`への変更は明示的に禁止する。**
- 親はCodexへ、既存スクリプト・既存validatorの絶対パス、入力、許可する出力先、または固定済みframe・カメラ・出力仕様だけを渡す。Codexが設計欠落、素材不適合、validator結果の解釈、または候補変更の必要性を検出した場合は、`needs_parent_decision`で返す。

### `danger-full-access` の限定的な例外(AGENTS.mdの読み替え)

- `AGENTS.md`は`danger-full-access`を禁止しているが、**本ワークフローのBlender実行を伴う委任に限り、`sandbox: "danger-full-access"`を使ってよい**(基本原則の「skills優先」に従う)。
- 根拠(実測済み): macOS + Blender 4.5系では、`workspace-write`のseatbeltサンドボックス内で`blender -b`が起動時のMetalデバイス照会で**必ずSIGSEGV(終了コード139)**する。`--version`のみ成功し、`HOME`/`TMPDIR`/`BLENDER_USER_RESOURCES`の変更、`--debug-gpu`、`--gpu-backend opengl|vulkan`、Cycles CPU指定のいずれでも回避できない(利用可能なGPU backendは`metal`のみ)。
- 適用範囲は、**CodexがBlenderで読取証跡を取得またはレンダーを実行する委任だけ**。検査のみなら`read-only`を使う。CodexはBlender実装・修正を行わないため、その目的でこの例外を使わない。
- 例外を使う場合も`Allowed paths`を`developer-instructions`で厳密に拘束し(`output/`・`evidence/`のみを書込み可、候補`.blend`は読取専用)、権限があることを理由に対象範囲を広げない。委任後は下記の確認を必ず行う。

### 委任後の確認(`pomodoro_assets`はgit管理外)

`pomodoro_assets`配下はgitリポジトリではないため`git status`/`git diff`が使えない。委任のたびに次の3点を親が確認する(省略不可)。

1. `design/`・`ref/`・`review/`・`story_contract.json`・`cool<N>_manifest.json`のmtimeが委任前から不変であること
2. `story_contract.json`の`source.design_doc_revision`が`design/story_design.md`の実mtimeと一致すること(正本が書き換えられていない証明になる)
3. 成果物が`Allowed paths`内にのみ出力され、候補`.blend`・正本`.blend`は委任前から不変であること

- 親は正本から`pomodoro_assets/<theme>_<story>/work/cool<N>_candidate.blend`を作成し、7a→7b→7cと8A/8B/8C指摘の修正を候補へ直接実装する。Codexは候補`.blend`を読み取り専用で使い、指定済み`evidence/`・`output/`だけを書き込める。正本`.blend`、候補`.blend`、manifest、state、設計書、レビュー判定はCodex委任中に更新しない。
- ステップ7a〜7c後と8修正後、Codexは既存のscene/timeline snapshot抽出・定量QA・asset auditを実行して証跡を出力できる。FAIL/WARNの解釈、修正方針、素材の検索・取得・選定・代替は親が担当する。
- ステップ4では親がspikeを実装し、Codexは親が固定したstate順序・尺・frame・カメラに沿うグレーanimaticと完成済みspikeをレンダーする。物語・時間設計・技術リスクの選定、レビュー・パケットの作成、人間レビューの依頼は親が行う。
- ステップ8ではCodexに完成state静止画・密集エリアclose-up・kind単位close-upのレンダーだけを委任する。8A/8B/8Cの指摘の解釈・採否・設計側の見直し・候補`.blend`の修正は親が行い、Codexは修正後の再レンダーと既存定量QAだけを実行する。
- ステップ9.5は`blender -b <file.blend> -a`のバックグラウンド起動による動画レンダー実行をCodexに委任する。完了判定、manifest更新、`validate_story_package.py --through render`の結果解釈、ユーザーへの提示は親が行う。
- Codexは4・8・9.5のレンダー時と、7a〜7d/7.5・8修正後の既存定量QA時に、指定された静止画・動画・定量snapshotを出力してよい。親は各委任後に候補・正本の不変性、変更範囲、成果物、定量QAを確認し、7a→7b→7c→7d/7.5→8→9→9.5→10の順序を崩さない。
- **8A・8B・8Cの判定そのものはCodexへ委任しない**。既存どおり`subagent_type: isometric-story-review`（Opus / medium）のClaude専用独立レビューとして実施し、作り込み品質のブロッキング権限はこの独立レビューに置く。Codexが担うのはレビュー前後のレンダーと既存証跡取得だけである。

| ステップ  | Codexの担当  | 起動タイミング・目的                                                               | Claude Code親に残す判断                                | 標準モデル         |
| --------- | ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ |
| 1         | 検査         | 入力Read後に要件・空欄を抽出                                                       | 参考の採否、世界観、技術リスク                         | gpt-5.6-luna / max |
| 2〜3      | 検査         | 設計書草案後に完全性・数値整合を検査                                               | Story Beat、構図、寸法、カメラ、演出設計               | gpt-5.6-luna / max |
| 3.25      | 検査         | 契約生成後にschema・mtime・validator結果を照合                                     | 契約内容と失敗の設計上の解決                           | gpt-5.6-luna / max |
| 3.5       | 検査         | 素材生成後にReference Pack・絶対パスを棚卸し                                       | 画像品質、世界観への適合、Pack要否                     | gpt-5.6-luna / max |
| 4         | レンダー     | 親が実装済みのグレーanimaticとspikeを、固定済みstate順序・尺・frame・カメラでレンダー | 物語・時間設計、spike実装、技術リスクの選定、waiver、人間レビュー | gpt-5.6-luna / max |
| 4         | 検査         | 人間レビュー前にreview packageをpreflight                                          | パケット内容、提示方式、承認の解釈                     | gpt-5.6-luna / max |
| 5〜6      | 検査         | 差分メモ・契約・manifest骨格を照合                                                 | 本番差分、クール構成、素材採否、正本更新               | gpt-5.6-luna / max |
| 7a〜7c    | 読取証跡取得 | 親の各実装後に既存scene/timeline抽出・定量QAを実行し、snapshotを出力               | ブロックアウト精緻化、作り込み、テクスチャリング、修正方針 | gpt-5.6-luna / max |
| 7d/7.5    | 検査         | 定量QA後にFAIL/WARN、gate、証跡を整理                                              | 修正方針、WARN/waiverの採否                            | gpt-5.6-luna / max |
| 8の前処理 | レンダー     | 完成state静止画・密集エリアclose-up・kind単位close-upをレンダー                    | 撮影対象kind、構図、レンダー要否                       | gpt-5.6-luna / max |
| 8の前処理 | 検査         | 8A〜8Cの入力・evidence不足を抽出                                                   | 独立レビューの起動と判定                               | gpt-5.6-luna / max |
| 8の修正   | 読取証跡・レンダー | 親が候補`.blend`を修正後、既存定量QAと必要な再レンダーを実行                     | 指摘の解釈・採否、設計側の見直し、候補修正、収束判断   | gpt-5.6-luna / max |
| 9         | 検査         | 人間レビュー前にreview packageとgateをpreflight                                    | 人間レビューと指摘の解釈                               | gpt-5.6-luna / max |
| 9.5       | レンダー     | 承認後に`blender -b -a`をバックグラウンド起動して動画を出力                        | レンダー指示、出力品質の判断、ユーザー提示             | gpt-5.6-luna / max |
| 9.5       | 検査         | 親の動画検証後にmanifestとvalidator結果を照合                                      | 完了判定、manifest更新、validator結果の解釈            | gpt-5.6-luna / max |
| 10        | 検査         | Motion QA後に証跡・gate・動画仕様を照合                                            | 動き・演出・連続性、修正判断                           | gpt-5.6-luna / max |
| 12        | 検査         | 最終レビュー前にmanifest・App QA入力をpreflight                                    | App Integration QA、完成・status更新、正本採用         | gpt-5.6-luna / max |

複数validator・複数クール・複数成果物をまたぐ技術原因追跡は、モデルを上げず親が原因を分解し、必要な読み取り作業だけを個別に委任して統合する。設計・視覚品質・waiver・人間レビュー・修正方針が必要な場合も親へ返す。Luna以外の追加モデルへの昇格は行わない。実際のCodex MCPパラメータ名と利用可否は、現行MCP定義に従う。

## ワークフロー全体

1. **(ストーリー単位)** 参考イメージ収集
2. **(ストーリー単位)** Story Beat Sheet・オブジェクト一覧表・寸法比例表等の作成(下記「ワークシート」節)
3. **(ストーリー単位)** 共通の寸法変数・カメラ・トランジションの型を一括設計
   3.25. **(ストーリー単位)** 設計書と本番制作差分メモから`story_contract.json`を作成し、`validate_story_contract.py`を通す
   3.5. **(ストーリー単位)** 世界観リファレンス画像と必要なReference Packを生成し、設計書ファイルに添付
4. **(ストーリー単位)** 低品質animaticと必要な技術spikeを作成し、人間レビュー — 必須の停止点
5. **(ストーリー単位)** テーマ固有差分(寸法変数・オブジェクト一覧・state構成)を`references/prompt-db-template.md`に従って本番制作差分メモ(`design/prompt_notes.md`)へ保存(ルール本体は再掲しない)
6. **(クール単位ループ)** 設計書ファイル+本番制作差分メモを明示Readし、クール用ファイル・クール別チェック画像・manifestを準備。**クール1の空`.blend`作成とblender-mcp接続は人間が行う — 必須の停止点**(クール2以降は`save_as_mainfile`での付け替えのみで停止不要)
7. **(クール単位ループ)** fetchしたテーマ固有差分+クール別チェック画像+`blender-isometric-rules`スキルで該当クールを実際に制作。制作は**7a ブロックアウト精緻化 → 7b 個別作り込み → 7c テクスチャリング**の3工程を順に踏む(プリミティブ直置き+後付けだけで完成としない)
   7.5. **(クール単位ループ)** 全アセット棚卸し(作り込みティア監査)。全オブジェクトを種類単位で機械列挙し、ティア・本物マテリアル・作り込み・接地の未達をゼロにする — 必須hard gate
8. **(クール単位ループ)** 構造的自己レビューに加え、独立サブエージェントによる(8A)Acceptance Matrixレビューと(8B)常識・実物資料レビューを未解決の必須項目ゼロまでループ
9. **(クール単位ループ)** 人間が目視レビュー(最終frame静止画が対象) — 必須の停止点
   9.5. **(クール単位ループ)** ステップ9の承認が得られたら、そのクールのプレビュー動画を書き出す(正式なフロー。追加の指示待ちは不要)
10. **(クール単位ループ)** Motion QAと直前クールまでの通し再生 — 必須のhard gate
11. 次のクールへ進む(6に戻る。ステップ3.5・5の共通設計は再利用)
12. 全クール完了後、ストーリー全体の動画レビューとApp Integration QAを行い、manifestを検証

ステップ1〜5(3.25・3.5を含む)はストーリーごとに1回だけ実施し、以降のクールループでは再利用する。

### ステップ1: 参考イメージ収集

- 最初に入力となる`docs/story-ideas/themes/<theme>/story-NN-slug.md`(該当ストーリーファイル)と同ディレクトリの`_theme.md`を明示Readし、一言要約、クール構成、世界観ガイドライン、技術リスクを設計書の初期入力として取り込む。パスを暗黙の前提だけで扱わない。
- テーマ名そのもの(例: 「lighthouse」)でWebSearchし、「isometric」等の修飾語は付けずに5〜8枚程度確認する(アイソメ表現自体ではなく、テーマに実在しそうなオブジェクト・雰囲気・配色を集めるため)。
- 画像はスクラッチ領域に一時保存して確認するだけにし、永続化やBlenderへの直接取り込みはしない。
- 確認した内容を「実在しそうなオブジェクト」「雰囲気・配色の傾向」「質感の傾向」の3点に簡潔にまとめ、ステップ2・3の初期値として使う。言語化メモは設計書ファイル(`design/story_design.md`)の一部として残す。
- 参考画像を設計へ落とし込む前に、上記「Ministral画像一次解析の共通ルール」の`reference_inventory`を実行する。一次解析は候補整理に限り、参考の採否と設計判断は親が行う。
- アイソメ表現そのもの(構図・ビジュアルスタイル)は参考画像の表現に関わらず本ワークフロー・`blender-isometric-rules`のルールに従う(ビジュアルスタイルはトイクレイ調/フラットトゥーンの2択から選ぶ。**いつ確定するか**: ステップ1で方向性を仮決めし、ステップ4の人間レビューで確定する。毎回都度確認が必須ではなく、ここで仮決め→レビュー時確定という流れに従う)。

### ステップ2・3: ワークシートを埋める

下記「ワークシート: 記入ルール」をすべて満たすまでステップ4へ進まない。実際に埋めた内容は、ワークシートを複製して`pomodoro_assets/<theme>_<story>/design/story_design.md`を新規作成する(冒頭に種本ファイル・テーマ・ストーリー・クール数を明記する)。
完成形の主役シルエットが画面中央の正方形セーフエリアに収まる構成になっているか、`docs/story-ideas/WORLD_GUIDELINES.md`の「構図原則」を確認しながら設計する。
最初にStory Beat Sheetを埋め、各クールの開始状態、因果、主役変化、感情的報酬、視線誘導、秒・frame設計、easing、同時動作上限、技術リスクを確定する。物語の因果が説明できない状態でオブジェクト分解へ進まない。

### ステップ3.25: ストーリー契約の定量preflight

- 設計書ファイル(`design/story_design.md`)を一度Readした後、`references/story-contract-schema.md`に従って`pomodoro_assets/<theme>_<story>/story_contract.json`を作る。設計書ファイルの長文説明やルール本文を複製しない。
- `python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_contract.py <story_contract.json> --json-only`が合格するまでステップ3.5・4へ進まない。
- 以後のクールでは、最初に設計書ファイル・本番制作差分メモ(プロンプトノート)のファイルmtimeだけを確認する。`story_contract.json`の`source.design_doc_revision`/`source.prompt_notes_revision`と一致する場合は両ファイル全文の再読み込みではなく契約ファイルを使う。不一致時だけ該当ファイルを再Readし、契約を更新して同validatorを再実行する。

### ステップ3.5: 世界観リファレンス画像生成

- 目的: スタイル・配色・雰囲気が全クールを通じて一貫しているかを、テキストだけでなく画像でも確認できるようにする。クール単位の実装チェックには使わない(クール2以降の要素も含む「最終形」の画像のため)。
- 入力: ストーリー全文(一言要約+各クールで完成するものの説明。`design/story_design.md`相当)と、ステップ2・3で確定した設計内容(オブジェクト一覧表・質感タイプ・World/ライティング設計表・配色・画面方針メモ)。クール1・クール2以降の区別なく、ストーリー全体の完成形を1枚に統合してよい。
- 生成手段: `/Applications/ChatGPT.app`をcomputer-useで操作して生成する。**ChatGPT.appの`Chat`タブ側で生成する。**モデルはデフォルトままでOK。
  - **bundle idは`com.openai.codex`**(`com.openai.chat`ではない)。`request_access`にはこのアプリを指定する。表示名`ChatGPT`でも解決できる。
  - `Escape`で閉じるとChatGPTがフォアグラウンドから外れて以降の操作がブロックされるため、閉じるときはウィンドウ内の別の場所をクリックする。
  - 生成画像はコンテキストメニューに`Copy Image`しか出ないため、`Copy Image`を実行したうえで`osascript`でクリップボードのPNGをファイルへ書き出す(`the clipboard as «class PNGf»`を`open for access ... with write permission`で保存する)。
  - **GUI操作の確認スクショは工程の節目だけに限る(トークン規約)。** `mcp__computer-use__screenshot`のフルスクショは1枚≈1,500トークンで、以降そのセッションの全ターンで再送され続ける(実測: 1ストーリーあたり23〜75枚、画像入力トークン全体の約35%を占め、成果物の品質には一切寄与していなかった)。次を守る:
    - 連続する操作は`mcp__computer-use__computer_batch`で1回にまとめ、確認は最後の1枚だけにする。操作のたびにスクショを撮らない。
    - 位置・状態の確認は`mcp__computer-use__zoom`で対象領域のみを撮る(実測31〜330トークン。フルスクショの1/5〜1/50)。中間確認はこちらを既定とする。
    - フルスクショを撮ってよい節目は、(a)アプリ起動直後の初期状態、(b)プロンプト投入後の生成完了確認、(c)`Copy Image`実行前のコンテキストメニュー確認、の3点を目安とする。
    - この規約は**GUI操作を見るためのスクショ**に対するものであり、生成画像そのもの・レンダー静止画・close-upの扱いには適用しない(それらは下記および8A/8B/8Cの規定に従う)。
- 生成後、`design/story_design.md`に画像への絶対パスを記載する(ステップ4の人間レビューの対象に含めるため)。ローカルにも`pomodoro_assets/<theme>_<story>/ref/world_reference.png`として保存する。
- `world_reference.png`保存後、上記「Ministral画像一次解析の共通ルール」の`world_reference_preflight`を実行し、画像の可読性と明白な破綻候補を記録する。採用可否と品質判断は親・人間レビューが行う。
- **生成画像を親の文脈へ読み込むのは判断に必要な最小限に留める。** 画像はレビュー・パケット経由で人間へ、および8A/8B/8Cの`isometric-story-review`サブエージェントへ渡すのが本線であり、親が全カットを閲覧する必要はない。
- Reference Pack(正面・側面・接合部close-up、最低1枚)の要否と優先順位は`references/quality-gates.md`の「Reference Pack」節を正本とする。

### ステップ4: 人間レビュー

- 設計書ファイル(`design/story_design.md`)の絶対パス、世界観リファレンス画像、Reference Pack、低品質animatic、必要なspikeを`review/story_design_review.md`のレビュー・パケットへまとめ、クライアント別の提示規約に従ってレビューを依頼する。生成を始める前に物語・時間設計・視線誘導・設計の曖昧さを確定させる。
- Story Beat Sheetで技術リスクが1件でもある場合、グレーマテリアルまたは簡易形状のspikeを作り、リスクを先に検証する。省略する場合は理由・影響・承認者をwaiverとして残す。
- 技術リスクには回転pivot・loop・重い散布だけでなく、**ステップ7bの高コストな作り込み手法**(曲面へのレリーフのUV破綻・継ぎ目、ディスプレイスメント適用時のメッシュ密度/レンダーコスト等)も含める。本制作前にspikeでUV破綻とコストを潰す(実装手法は`blender-isometric-rules`2.5章参照)。
- Animaticと必要なspikeの承認なしで次に進まない。詳細は`references/quality-gates.md`を参照する。
- **実行者の分担**: 親が検証項目を指定してspikeを候補`.blend`へ実装する。animaticと完成済みspikeのレンダーはCodex(`gpt-5.6-luna` / `max`)へ委任できる。委任する場合、親はstate順序・尺・frame・カメラ・出力仕様を固定し、Codexは候補ファイルを読み取り専用で使い、指定`output/`・`evidence/`だけを書き込む。物語・時間設計・技術リスクの選定、レビュー・パケットの作成、人間への提示、waiver判断は親が行う。

### ステップ5: 本番制作差分の記録

- ルール全文(`blender-isometric-rules`)はSkillが実装時に自動で効くため、設計書側に再掲しない(二重管理になる)。
- 設計内容(寸法比例表・オブジェクト一覧・World/配色・質感・Story Beat等)は**設計書ファイルを正本とし、本番制作差分メモに再転記しない**(設計書とプロンプトノートの二重管理を避ける)。`design/prompt_notes.md`には、設計書に載らない**本番制作固有の差分だけ**(制作パス・.blend名・state遷移の実フレーム・クール間引き継ぎ手順・manifest計画)と、設計書への参照を書く。
- 保存する内容は`references/prompt-db-template.md`(本番制作差分テンプレート)に従う(空欄・TBD不可)。テンプレート末尾の「保存前の最終確認」チェックリストを1項目ずつ確認してから保存し、設計書ファイルと相互に絶対パス参照を記載する。
- 保存後、`story_contract.json`の`source.prompt_notes_path`と`source.prompt_notes_revision`を更新し、`validate_story_contract.py`を再実行する。

### ステップ6: クール用ファイルを準備

- **必ず最初に**、対応する設計書ファイル(`design/story_design.md`)と本番制作差分メモ(`design/prompt_notes.md`)のファイルmtimeを確認する。`story_contract.json`の`source.design_doc_revision`および`source.prompt_notes_revision`と一致する場合は契約ファイルを入力に使う。不一致時は該当ファイルを明示Readし、契約を更新して`validate_story_contract.py`を通す。テーマ固有データを暗黙の前提だけで扱ってはならない。
- 作業ディレクトリは`/Users/sawairikeisuke/Documents/Blender/isometric/pomodoro_assets/<theme>_<story>/`を新規作成し、その配下で作業する。`.blend`はディレクトリ直下に`<story>_cool<N>.blend`(例: `lighthouse_cool1.blend`)で保存し、レンダリング結果は`output/`サブディレクトリに、設計書・プロンプトノートは`design/`サブディレクトリに置く。
- **クール1: 空`.blend`の用意は人間が行う — 必須の停止点**。AIはここで作業を止め、次を人間に依頼する: (1) Blenderを起動する、(2) File > New で新規ファイルを作り、既定のCube・Camera・Lightを削除して空にする、(3) `pomodoro_assets/<theme>_<story>/<story>_cool1.blend`として保存する、(4) blender-mcpアドオンのサーバを起動して接続可能にする。人間から「保存・接続完了」の返答を得るまで次へ進まない。AIは`bpy.data.filepath`が期待した絶対パスであることを確認してから制作を開始する。
- **MCP経由でのファイルロードを禁止する**: `bpy.ops.wm.read_homefile`・`bpy.ops.wm.open_mainfile`を`execute_blender_code`から実行してはならない。MCPコマンドは`bpy.app.timers`のコールバック内で走るため、ファイルロードは既存のPython参照を無効化して破損の原因になる。ファイルを切り替える必要が生じた場合は、AIが自分でロードせず人間にGUI操作を依頼する。
- クール2以降: **前クール完成後、同じ生きているセッションのまま`bpy.ops.wm.save_as_mainfile(filepath=".../<story>_cool<N>.blend")`で次クール用ファイルへ付け替える**(ゼロから作り直さない・ファイルを開き直さない)。`save_as_mainfile`はデータを解放せず保存先を付け替えるだけなので、直前クールの`.blend`はディスク上に完成スナップショットとして凍結され、MCP接続も維持される。付け替え後は`blender-isometric-rules`7章のルールR(クール間引き継ぎ)を必ず適用する。
- `references/manifest-schema.md`を基に作業ディレクトリ直下へ`cool<N>_manifest.json`の骨格を作る。未生成artifactはキーを省略し、未実施の将来gateは`pending`にする。成果物生成ごとに絶対パスを追加する。
- **クール別チェック画像の生成**: オブジェクト一覧表の「初出クール」列が**当該クール以下**(前クールまでの完成要素+今回新規追加分)の要素だけに絞ってプロンプトを組み、1枚生成する。未来のクール(まだ存在しないはずの要素)は絶対に含めない。生成手段はステップ3.5と同じ(GUI操作の確認スクショに関するトークン規約も同じく適用する)。保存先: `pomodoro_assets/<theme>_<story>/ref/cool<N>_reference.png`。
- `cool<N>_reference.png`保存後、上記「Ministral画像一次解析の共通ルール」の`cool_reference_preflight`を実行する。未来要素の混入や明白な画像破綻は候補として記録し、チェック画像の採用・再生成は親が決める。
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
- **実行者の分担**: 親が実装・FAIL/WARNの解釈・修正・gate判定を担当する。Codex(`gpt-5.6-luna` / `max`)へは、既存のsnapshot抽出・定量QA・asset auditスクリプトの実行と`evidence/`への出力だけを委任できる。候補`.blend`と既存スクリプトは読み取り専用とする。
- scene validatorはsafe area、Collection、アセット初出、ティア、材質、作り込み、接地、stage内、寸法比、背景密度を、continuity validatorは前クール完成物・World・共有材質の未承認差分を、timeline validatorは予定frame/easing/演出タイプ・同時動作数を検証する。
- `blender-isometric-rules/references/quantitative-qa.md` を同時に参照し、scene / timeline の入力は Blender の評価済み実シーンと実 F-Curve から抽出する。契約値を手転記した snapshot、目視だけの `grounded` / `crafted` / `coverage` は無効とする。
- 各クールで `audit_assets.py` → scene contract → continuity（クール2以降）→ timeline の順に PASS を得る。FAIL はステップ8へ持ち込まず修正する。WARN は数値と waiver を review package に含める。
- 実行は`run_blender_quantitative_qa.py --blend <cool.blend> --contract <story_contract.json> --cool <N> --output-dir <evidence>`を正本とする。必要なら`--video <cool.mp4>`を渡し、`ffprobe`の出力仕様判定も同じhard gateに含める。成果物・Custom Property・waiver形式は`story-contract-schema.md`と`blender-isometric-rules/references/quantitative-qa.md`に従う。
- **背景ディテールの視認個数(15〜30)は、評価済みGeometry Nodes出力から実測する。** GNスキャッターの結果はホストオブジェクトのメッシュへ実体化されるため、評価済みdepsgraphで`to_mesh()`し、**辺の連結成分(loose parts)を1個=背景ディテール1個として数える**。各連結成分の重心を`world_to_camera_view`でNDC化してフレーム内判定し、`scene.ray_cast`で遮蔽されないものを視認可能とする。
  - **Poisson分布をPython側で近似再現して数えるのは無効**とする(実際に、近似27個に対し実GN出力は23個という乖離が発生した)。`Distance Min`のチューニングも、近似ではなく実測個数をフィードバックして収束させる。
- 失敗時は該当する制作工程へ戻る。静止画の定性レビューや動画レンダリングで機械的に再発見しない。

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
- 判定結果(種類ごとの material / 接地 / craft助言)を`evidence/cool<N>_asset_audit.md`へ記録する。
- 「全部を1個ずつ見る」を、種類単位・機械列挙で網羅的かつ効率的に行うのが本ゲートの趣旨。既存のステップ8B・`review-checklist.md`B節(サンプル抽出・目視判定)を置き換えるものではなく、その前段で見落としをゼロにする網羅性チェックとして機能する。

### ステップ8: 自己レビュー(未解決の必須項目ゼロまでのループ・hard gate)

**背景(なぜループ必須か)**: 構造チェックを通過しても、質感・装飾密度・World設定が目標に届かない事故と、生成参考画像自体の不自然さへ過適合する事故の両方が起こり得る。製作者の自己採点バイアスを避けるため、判定はこのセッションの文脈を持たない独立サブエージェントに行わせ、`references/quality-gates.md`のAcceptance Matrixで未解決の必須項目が0になるまでループする。

#### `step8_parent_baseline`（8A起動前hard stop）と再実行制御

8Aを起動する前に、親エージェントは当該クールの基準参照画像1枚と現行完成stateレンダー1枚を自分で確認する。守る視覚アンカー3〜5個、参照画像と設計・物理妥当性が衝突する箇所、Acceptance Matrixへ反映した許容差・waiver候補を整理し、`evidence/cool<N>_step8_baseline.json`へ保存する。baselineと親の既知課題は独立レビュアーへ渡さず、親が確定した判定基準・必要な画像・実測値だけを渡す。

基準画像が読めない、参照と設計の優先関係が未確定、Acceptance Matrixの必須/許容分類が曖昧、または現行レンダーがbaselineの対象と一致しない場合は、8Aを起動せず`needs_parent_decision`で停止する。baselineは8Aの開始条件であり、8B/8Cの独立性を弱める既知課題メモではない。

各試行は`references/step8-review-control.md`のReviewLedger v1へ、attempt番号、candidate `.blend`のSHA-256、render setのSHA-256、Acceptance Matrix revision、レポート絶対パス、指摘fingerprint、親の対応を記録する。`scripts/validate_step8_review.py`で次を確認し、`status=pass`以外を成功扱いにしない。

- candidate `.blend`とrender setが両方不変で、`measurement_revision`も更新されていない場合は再レビューしない。再レビューには新しいレンダーまたは更新済み実測値を要求する。
- 同一finding fingerprintが連続2回出た場合、3回目を自動起動せず`needs_parent_decision`で親へ戻す。
- 8Aのwaiverは既存manifestの`reason`、`impact`、`approved_by`が揃う場合だけ成立する。8B/8Cのwaiverはgate完了に使わない。
- JSON不正、画像未読、入力不足、タイムアウト、`needs_parent_decision`は成功扱いにしない。

**Ministralによる画像一次解析(前処理)**: 8A/8B/8Cに入る前に、上記「Ministral画像一次解析の共通ルール」の`step8_review_preflight`を実行する。Ministralの結果は候補抽出・画像整理・違和感の事前把握にのみ使う。画像削減・保持の最終判断、8A/8B/8Cの最終判定、品質ゲートの合否、設計上の修正方針はMinistralへ委任しない。

ステップ8では**3種類の独立したレビューループをすべて実施**する(8A・8B・8C)。役割を1つのレビューに混載させない(混載は見落としの原因になり、実際に「PASSなのに低品質」の事故を生んだ)。

- **8A(相対比較)**: 参考画像との比較。質感・装飾密度・配色のリッチさが目標に届いているか。
- **8B(絶対妥当性)**: オブジェクト単体として物理的に自然か。比率・向き・接地・接合・破綻がないか(参考画像なし・一般常識と実物資料で判定)。
- **8C(仕様実現)**: 設計の約束を果たしたか。ワークシート「意図する見た目(名前付き署名パーツ)」の各パーツが**記載どおりの形・位置・向きで実現されているか**、背景小物が種類単位でそのクラスに読めるか、各オブジェクトの**存在理由が読めるか**(チェックリスト駆動)。

**参考画像自体は「アイソメ表現に忠実な完璧なお手本」ではない**(別の生成AIによる簡易生成物であり、非現実的な形状を含む場合がある)ため、8Aだけでは「参考画像と一致しているが両方ともおかしい」という共倒れを検出できない。8Bはこれを補う。8Cは「機械ゲートは通るが、設計に書いた"らしさ"が実装で抜け落ちている/存在理由が読めない」事故を塞ぐ(実際に発生した事故: 背景の草が素の円錐のまま、周辺小物が"とりあえず置いた"状態で意図が読めない、という崩れが、機械ゲートと8A/8Bを通過した後の人間レビューで初めて指摘された)。作り込み品質のブロッキング権限は機械ゲートではなく8B/8Cに置く。

**独立レビューのモデル固定(必須・漏れ厳禁)**: 8A・8B・8Cの独立サブエージェントは**必ず`subagent_type: isometric-story-review`で起動する**。このエージェント定義(`~/.claude/agents/isometric-story-review.md`)が`model: opus`・`effort: medium`を固定しているため、指名するだけでモデルと工数が一貫して適用される(Agentツールでmodel/effortを都度指定する必要はない/できない)。汎用エージェント(general-purpose等)で起動して製作スレッドのモデルを継承させることを禁止する。作業経緯・既知の課題は渡さない(独立性の維持)。

**起動プロンプトの正本(必須・漏れ厳禁)**: 8A・8B・8Cの起動プロンプトは`references/step8-review-prompts.md`を正本とし、同ファイルの雛形の`<...>`を埋めて使う。**雛形を使わずに毎回書き起こさない**(書き起こしは判定基準そのもののドリフトを生む。実際に8Aの呼称が「Acceptance Matrixレビュー」「Visual Acceptance」で、8Bが「常識・物理的妥当性」「常識チェック」で揺れた)。起動前に同ファイル末尾の「起動前チェックリスト」を1項目ずつ確認する。修正ループの2回目以降も同じ雛形で起動し、前回の指摘・修正履歴は渡さない(渡してよいのは新しいレンダー画像と更新された実測値だけ)。

**実行者の分担(必読)**: ステップ8で**Codex(`gpt-5.6-luna` / `max`)へ委任してよいのはレンダー実行と既存定量QAの実行だけ**である。具体的には、完成state静止画・密集エリアclose-up・kind単位close-up、および親が修正した候補`.blend`の再レンダーを委任する。**8A/8B/8Cの判定と、その指摘に基づく候補`.blend`の修正実装は親が行う。** 判定は必ず`subagent_type: isometric-story-review`で行い、Codexへ置き換えない。指摘の解釈・採否、設計側(存在理由・パーツ定義)の見直し、収束判断、waiver判断、証跡とmanifestの更新は親が行う。Codexは候補`.blend`を読み取り専用で使い、レビュー結果の解釈を任されない。

共通手順:

1. 完成state(最終frame)の静止画レンダリングを行う(Codexへ委任可)。動画レンダリングはこの静止画チェックを通過した後にのみ行う(コストが高いため、判断のたびに動画を作らない)。
2. `blender-isometric-rules`の`references/review-checklist.md`(A〜F節+構造別クローズアップ検証)に基づく構造的な自己レビュー(接合・接地・フレーミング等、コードで機械的に検証できる項目)を行う。

#### ステップ8A: Acceptance Matrixレビュー(相対比較)

3. **`subagent_type: isometric-story-review`(opus・effort中固定)**に、完成state静止画、クール別チェック画像、Reference Pack、Acceptance Matrixだけを渡す。作業経緯・既知の課題は共有しない。起動プロンプトは`references/step8-review-prompts.md`の「8A 雛形」節を使う。
4. サブエージェントに各差分を「必須一致」「許容差あり」「改善可」「waiver」のいずれかへ分類させる。必須一致の未解決項目は親が実際に修正し、Codexへ再レンダリングを依頼して手順3へ戻る。
5. 「必須一致の未解決項目なし」になるまで、入力差分を台帳とvalidatorで確認しながら繰り返す。waiverは理由・影響・承認者が揃うまで未解決扱いとする。同一指摘fingerprintの連続再発や入力不変は自動反復せず、親の判断へ戻す。判定証跡をmanifestの`visual_acceptance`へ記録する。

#### ステップ8B: 常識チェックレビュー(絶対妥当性・参考画像なし)

6. 完成state静止画に加えて、**オブジェクトが密集するエリア(棚上・デスク上等の装飾小物、本棚の本の並び等)のクローズアップレンダリング**を用意する(全体静止画だけでは小さな装飾小物の破綻が解像度的に見逃されるため)。
7. **`subagent_type: isometric-story-review`(opus・effort中固定)**に、**生成参考画像は渡さず**、全体静止画、クローズアップ、対象物の実物資料だけを渡す。一般常識と実物資料に照らし、**物として自然か**(形状、比率、向き、接地、接合の不自然さ・破綻)を列挙させる。ここでは物理的妥当性に集中する(署名パーツが設計どおり実現されているか・存在理由が読めるかは8Cで判定するため、8Bに混載しない)。起動プロンプトは`references/step8-review-prompts.md`の「8B 雛形」節を使う。
8. サブエージェントが不自然な箇所を1件でも報告した場合: 親が実際に修正(寸法比・向き・配置等)し、Codexへ再レンダリングを依頼して手順7に戻る。
9. サブエージェントが「不自然な箇所なし」と判定するまで、入力差分を台帳とvalidatorで確認しながら7〜8を繰り返す。waiverで8Bを完了扱いにしない。

#### ステップ8C: 仕様実現レビュー(署名パーツの実現・チェックリスト駆動)

10. 入力を用意する: 全体静止画 + **種類(kind)単位のクローズアップ**(背景小物・背景ディテールを含む全kind。1枚に映らない場合はkindごとにカメラを寄せて複数枚) + ワークシートの各オブジェクトの「名前付き署名パーツ」と「存在理由」 + 各kindの実物資料。生成参考画像は渡さない。
11. **`subagent_type: isometric-story-review`(opus・effort中固定)**に**種類(kind)単位の判定表**を必須で出力させる。起動プロンプトは`references/step8-review-prompts.md`の「8C 雛形」節を使う。各kindについて次を判定する:
    1. 名前付き署名パーツが**記載どおりの形・位置・向きで実現されているか**(単に「在るか(presence)」ではなく「意図どおりに実現(realization)されているか」)。未実現のパーツを名指しで列挙させる。
    2. 描画スケールで「そのモノ/そのクラス」に読めるか(背景小物・背景ディテールはクラス単位で判定。素のprimitive=円錐/球/円柱に見えるものはNG)。
    3. 存在理由が読めるか(「なぜこの物がここにあるか」が画面から伝わるか。"とりあえず置いた"に見えるものはNG)。
12. サブエージェントが「未実現の署名パーツ」「クラスに読めないkind」「存在理由が読めないオブジェクト」を1件でも報告した場合: 親が実際に修正(7bへ戻って作り込み、必要なら設計側の存在理由・パーツ定義も見直す)し、Codexへ再レンダリングを依頼して手順11に戻る。存在理由そのものが立たない物は削る判断も含める。
13. サブエージェントが全kindについて上記3点を満たすと判定するまで、入力差分を台帳とvalidatorで確認しながら11〜12を繰り返す。waiverで8Cを完了扱いにしない。判定表を`evidence/cool<N>_signature_realization.md`に残し、manifestの`signature_realization`(8C)へ記録する。

#### 収束条件

14. 収束しない、同じ指摘fingerprintが連続2回出る、または入力が変わらない場合は自動ループを継続せず、`needs_parent_decision`として親が状況(何が・何回・なぜ解決できないか)を確認して判断を仰ぐ。
15. ステップ9に進めるのは、**8Aで未解決の必須項目がなく、8Bで不自然な箇所なし、8Cで未実現の署名パーツ・読めないkind・読めない存在理由がなし**と判定された最終レンダリングのみ。作り込み品質のブロッキング権限はこの3レビュー(特に8B/8C)にあり、機械ゲート(ステップ7.5・7dのcraft助言)のPASSでは代替できない。

### ステップ9: 人間レビュー

- 完成state(最終frame)の静止画と必要なクローズアップを`review/cool<N>_still_review.md`のレビュー・パケットへまとめ、クライアント別の提示規約に従ってレビューを依頼する。承認なしで次に進まない。
- 提示前に`validate_review_evidence.py`へ`required_gates=["animatic", "still_human_review"]`を渡し、現在必要なanimatic・静止画のパケット、主要成果物、絶対パスを検証する。ファイル不足を人間レビューへ持ち込まない。

### ステップ9.5: プレビュー動画レンダリング

- ステップ9で承認が得られたら、追加の指示を待たずにそのクールのプレビュー動画を書き出す(静止画OK→動画レンダーは標準フローの一部)。
- 書き出し設定(解像度・fps・コーデック等)は`blender-isometric-rules`4章「レンダー出力仕様を固定する」に従う(数値はそちらを参照し、ここでは再掲しない)。
- 長尺(数百フレーム規模)のレンダリングは`blender-isometric-rules`7章のルールに従い、MCP経由の同期呼び出しではなくヘッドレスBlenderのコマンドラインプロセス(`blender -b <file.blend> -a`)をバックグラウンド起動で行う。
- **実行者の分担**: このレンダー実行はCodex(`gpt-5.6-luna` / `max`)へ委任できる。親は実装済み候補`.blend`の絶対パス、出力先`output/`の絶対パス、frame範囲、`blender-isometric-rules`4章の出力仕様をレンダー依頼へ固定する。Codexは候補`.blend`を読み取り専用で使い、指定`output/`への動画出力とプロセス完了報告だけを行う。候補・正本`.blend`、manifest、gate判定は更新しない。完了判定、manifest更新、validator実行と結果の解釈、ユーザーへの提示は親が行う。
- 完了判定はプロセス終了だけでなく、manifestを更新して`python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_package.py <cool<N>_manifest.json> --through render`を実行する。この時点より後のgateは`pending`でよい。解像度、fps、codec、pixel format、音声なし、固定frame rate、尺、容量、全frame decodeの全項目が合格するまで次へ進まない。
- 長時間かかる場合は`ScheduleWakeup`等で定期的に進捗を確認し、都度ユーザーに待機状況を伝える。
- 完成した動画ファイルは絶対パスでユーザーに提示する。

### ステップ10: Motion QA・通し再生確認(hard gate)

- `references/quality-gates.md`のMotion QAを実施し、開始・中間・終了・state境界、速度、easing、ポッピング、ちらつき、遮蔽、Ambient Loopを確認する。
- 直前クールまでを必ず通しで確認し、カメラ、照明、色、共有object、回転位相の連続性を検査する。
- 修正後は再レンダー・再検査し、passまたは承認済みwaiverと証跡をmanifestへ記録するまで次のクールへ進まない。
- `python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_package.py <cool<N>_manifest.json> --through motion`が合格することを確認する。

### ステップ12: ストーリー全体の最終レビュー

- 全クール完了後、通し動画とApp Integration QA証跡を`review/story_final_review.md`のレビュー・パケットへまとめ、クライアント別の提示規約に従って最終レビューを依頼する。
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

## ワークシート: 記入ルール

ステップ2・3で実際に埋める5つの表(Story Beat Sheet/オブジェクト一覧表/寸法比例表/Collection構成表/World・ライティング表)と配色・画面方針メモについて、詳細な列定義・カタログ・記入ルールは `references/worksheet-rules.md` を参照する。品質判定は`references/quality-gates.md`を参照する。空欄や「TBD」が残った状態でステップ4に進んではいけない。目次:

- Story Beat Sheet(開始状態/因果/主役変化/感情的報酬/視線誘導/時間設計/easing/同時動作上限/技術リスク)
- オブジェクト一覧表(名前/分類/存在理由(1文)/初出クール/前クール完成物との関係/動き方分類/登場演出タイプ/強化技法(a〜d)/サイズ比較対象/意図する見た目(名前付き署名パーツ)/作り込みティア)
- 背景ディテール(配置方法・種類数・配置平面・接地ルール)
- 寸法比例表(`STAGE_EXTENT`・背景ディテールとの衝突回避)
- Collection構成表(`common_environment`)
- 質感タイプ・構造タイプ・アセット方針表(PolyHaven選定)

## ステップ4(人間レビュー)に進む前の曖昧さチェックリスト

以下すべてにチェックが入らない場合、ステップ4に進んではいけない。

- [ ] Story Beat Sheetに空欄・TBDがなく、全クールの因果と最終報酬を一文で説明できる
- [ ] frame・秒数・30fps換算が一致し、easingと同時動作上限が具体的に決まっている
- [ ] 技術リスクが列挙され、該当項目のspike要否が決まっている
- [ ] オブジェクト一覧表に空欄・TBDがない
- [ ] 動き方分類が全要素について4分類のいずれかに割り当てられている
- [ ] 「登場演出タイプ」が全要素(主体・周辺要素)に割り当てられており、同一クール内で主体・周辺要素同士の重複がない
- [ ] 各クールに強化トランジション対象が最低1要素あり、「強化技法(a〜d)」列で具体的な手法が明記されている
- [ ] 「サイズ比較対象」列に列挙された全ペアで、サイズが最低30〜50%以上ばらついている
- [ ] 各stateに背景ディテールが最低15〜30個(カメラから視認可能な個数で)配置されている
- [ ] 背景ディテールの種類が最低5種類以上ある
- [ ] 各背景ディテールの種類ごとに配置平面が設計段階で明記されている
- [ ] 各背景ディテールの配置平面とraycastスナップ適用方針が設計済みである(実レンダー確認はステップ8で行う)
- [ ] 背景ディテールの代表寸法が近接主要構造物基準変数の25%〜55%の範囲に収まっている
- [ ] 寸法比例表の比率列がすべて「他の変数からの比率」で埋まっており、絶対値の直接入力がない
- [ ] STAGE_EXTENTが定義されており、各クールの追加要素がその範囲内に収まることを確認した
- [ ] 複数クール構成の場合、クール2以降の寸法もすべてクール1主体の定数からの比率になっている
- [ ] 複数クール構成でクール2以降に主要構造物を追加する場合、引き継いだ背景ディテールのSelectionマスクに除外ゾーンが追加されている
- [ ] Collection構成表にcommon_environment相当の常時表示Collectionが存在する
- [ ] 各要素の「前クール完成物との関係」が一言で言える
- [ ] **各要素に「存在理由(1文)」が記入されている**(なぜこの物がこの画面にあるか=役割・物語的必然。「スケール対比のためだけ」「余白埋め」等は不可。書けない物は削るか役割を与える)
- [ ] 各要素について「意図する見た目」が**名前付き署名パーツのリスト**で記入されている(**全ティア必須**。hero/中景は2つ以上、背景小物・スケール対比物・背景ディテールも「そのクラスに読める」パーツを最低1つ名前で書く。手法名ではなく意図で書く。素のprimitiveで"読める"としない)
- [ ] 各要素に**作り込みティア(hero / 中景 / 背景小物)**が割り当てられている(背景小物も「そのクラスに読める最低限の形」は作る=素のprimitive禁止)
- [ ] 質感タイプが全要素に割り当てられている(最低2種類以上)
- [ ] World・ライティング設計表に空欄がない
- [ ] 配色・画面方針メモに空欄がなく、ビジュアルスタイルがトイクレイ調/フラットトゥーンのいずれかに仮決めされている(ステップ4で確定)
- [ ] 構造タイプが全要素に割り当てられている(不要な要素は「—」明記)
- [ ] 内包する発光オブジェクトがある要素は半透明対象として明記されている
- [ ] アセット方針が全要素に割り当てられ、PolyHaven対象は`api.polyhaven.com`での実検索により実在確認済み(推測のアセット名でないこと)。該当なしの場合は「プロシージャルで代替」と明記されている
- [ ] 複数クール構成の場合、前クール共有マテリアルの要否が全要素に明記されている
- [ ] 世界観リファレンス画像(ステップ3.5)が生成され、設計書ファイル(`design/story_design.md`)に絶対パスで記載されている
- [ ] Reference Packが最低1枚あり、正面・側面・接合部のうち必要な構造を判断できる
- [ ] 低品質animaticと必要な技術spikeが作成され、レビュー対象に含まれている
- [ ] 完成形の主役シルエットが中央正方形セーフエリア(`docs/story-ideas/WORLD_GUIDELINES.md`「構図原則」。フルスクリーン背景の上下マージンの見え方含む)に収まる構成になっている
- [ ] オブジェクト一覧表の「アンビエントループ候補」列が埋まっている(該当なしの場合も明記されている)

## ローカルファイルとの役割分担

- 本スキルは「手続き的な手順・記入ルール」を扱う。実際に各ストーリーで埋めた表・生成された設計書・本番制作差分メモの実体は、`pomodoro_assets/<theme>_<story>/design/`配下のローカルファイル(`story_design.md`・`prompt_notes.md`)が正本である。ストーリー案は`docs/story-ideas/`配下のローカルファイルが正本である。Notionの旧「ストーリー案の置き場」DB・「設計書」DB・「Blender用プロンプト」DBはいずれも以後更新しない参照アーカイブとする。
- 本移行はフォワードオンリーとする。既に完成しNotion URLがmanifest等に残っている既存ストーリー(例: `windmill-hill`)は遡及修正しない。新規に着手するストーリーから`design/story_design.md`・`design/prompt_notes.md`をローカル正本として使う。
- ステップ6以降のBlender実装ルールは`blender-isometric-rules`スキルを必ず併用する。
