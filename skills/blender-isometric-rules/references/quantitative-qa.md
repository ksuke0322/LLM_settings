# 定量 QA 契約

## 目的と境界

レンダーやスクリーンショットを開く前に、Blender の評価済みシーンと F-Curve から取得できる事実を `PASS / FAIL / WARN` にする。ここで扱うのは設定・座標・投影・時系列の整合性であり、世界観、署名ディテールの読みやすさ、色や光の美しさは人間レビューに残す。

数値は手で JSON に転記してはならない。scene snapshot は Blender の実シーン、timeline snapshot は実 F-Curve から抽出する。設計値だけを validator に渡すことは禁止する。

## 実行順

1. `audit_assets.py` を実行し、種類単位の材質・作り込み・接地を棚卸しする。
2. 各クールの完成フレームで scene snapshot を抽出する。
3. `isometric-story-workflow/scripts/validate_scene_contract.py` と、クール間では `validate_cool_continuity.py` を実行する。
4. F-Curve を timeline snapshot として抽出し、`validate_timeline.py` を実行する。
5. FAIL を直して 1 に戻る。WARN は数値根拠と採否をレビュー・パケットへ残す。
6. ここまで PASS した成果物だけを `review-checklist.md` の人間レビューへ渡す。

## 実行コマンドとCustom Property

対象のrender可視メッシュには、必ず次のCustom Propertyを設定する。`story_id`は契約の`objects[].id`、`story_tier`は契約tier、`story_type`は背景種別またはアセット種別である。純粋な技術用メッシュだけは`qa_exempt=true`で除外できるが、映るアセットをこのフラグで回避してはならない。

- `story_id`: 論理アセットID。複数パーツは同じIDにして集約する。
- `story_tier`: `hero` / `midground` / `background`。
- `story_type`: 散布・種類数の計測単位。
- `story_natural=true`: 自然物の回転・scale・形状分散を測定する。
- `story_scatter=true`: GN/散布物として実数・種類・除外ゾーンを測定する。`story_exclusion_zones`には`[[min_x,min_y,max_x,max_y], ...]`のJSONを設定する。
- `story_stagger_group`: 同種要素の開始frame分散を測定するグループ名。
- `story_scale_reference=true`: 主役高さの1/3〜1/2であることを確認する寸法対比物。
- `qa_allow_overlap=true`: 意図した接合(部材の壁への埋め込み等)としてメッシュ重なりを許可する。
- `qa_airborne=true`: **壁付け・軸付けの部材**として接地検査を免除する。`_ray_ground()`は全アセットに地面との接触を要求するため、風車の羽根のように主要構造物へ取り付く回転体・懸架物は構造的にPASSできない。宣言しないアセットの判定は一切変わらない。**画面に映るのに地面へ置くべき物をこのフラグで回避してはならない**(浮き・めり込みの検出こそがこのゲートの目的である)。使う場合は取り付け先の納まりを`qa_allow_overlap`側の接合検査で担保し、物理的妥当性は8Bの独立レビューで判定する。

実行は`isometric-story-workflow/scripts/run_blender_quantitative_qa.py`を使う。これはheadless Blenderで`export_quantitative_evidence.py`を実行し、実測snapshot、既存contract validator、動画`ffprobe`を集約する。

```sh
python3 run_blender_quantitative_qa.py \
  --blend /absolute/cool1.blend --contract /absolute/story_contract.json --cool 1 \
  --video /absolute/cool1.mp4 --output-dir /absolute/evidence/cool1
```

`quantitative_qa_report.json`、`quantitative_qa_report.md`、および`raw/`配下の3 snapshotが成果物である。WARNは`--waivers /absolute/waivers.json`でcheck idをキー、理由を値とするwaiverを渡さない限りFAILになる。GitHub Actionsなどの常時CIは使わず、スキル更新時と各成果物レビュー前にローカルで実行する。

## scene snapshot の必須証跡

`validate_scene_contract.py` に渡す `scene` は、次を Blender から算出する。論理アセットが複数オブジェクトなら、全パーツを `story_id` カスタムプロパティで同じ契約 object id に紐付けて集約する。`story_tier` と `story_type` も同様に実オブジェクトへ持たせる。

| 項目 | 抽出方法 | 判定 |
|---|---|---|
| Collection | `scene.collection` を再帰走査し、render 可視の Collection 名を取得 | `common_environment` を含む |
| セーフエリア収まり | 評価済みワールド BBox を `world_to_camera_view` で投影。中央正方形は正規化座標 `x=0..1, y=0.21875..0.78125` | hero の投影 BBox が範囲外なら FAIL。coverage はセーフエリアに対する hero の最大辺比で算出し `>= 0.60` |
| 寸法・stage | 評価済み BBox の最大辺 / `stage_extent`、および全頂点の `abs(x/y/z) <= stage_extent` | 契約 `size_ratio` との差 `<= 0.10`、範囲外は FAIL |
| 接地 | ground の評価済み上面、または evaluated depsgraph の raycast により各アセットの最下点を測定 | 隙間・意図しない貫通が `0.01` 超で FAIL |
| 材質 | 使用材質のノード型を集計 | `TEX_IMAGE` は `image`、Noise/Voronoi/Wave/ColorRamp/Bump は `procedural`、どちらもないものは FAIL |
| 作り込み(助言) | tier を問わず modifier・頂点数を集計し、素の primitive 相当かを機械的に拾う | **助言(WARN)のみでブロッキングしない**。作り込み品質の合否は独立レビュー(8B: 物理的妥当性 / 8C: 署名パーツの仕様実現)で判定する |
| 背景 | `story_type` 単位で render 可視インスタンス数と種類数を集計 | 契約 `background.visible_count` / `types` と一致 |

scene snapshot には少なくとも `cool_number`、`collections`、`camera.hero_safe_area_coverage`、`assets[]` (`id`, `tier`, `material_kind`, `crafted`, `grounded`, `bounds_within_stage`, `size_ratio`) と `background` を入れる。抽出不能な値を `true` と仮定してはならず、`FAIL` として停止する。

## timeline snapshot の必須証跡

F-Curve を評価して、契約の各 transition について object id、開始/終了 frame、easing、entry type を抽出する。キーフレーム値の存在だけで合格としてはならない。

| 項目 | 定量判定 |
|---|---|
| 可視化と遷移の対 | `hide_viewport` / `hide_render` の CONSTANT 切替を持つ新規物体は、同じ区間に location / scale / Alpha / Emission の非 CONSTANT F-Curve を持つ |
| 接地固定の成長 | `scale.z` 成長中に BBox 下端の評価値が許容誤差 `0.01` 以内 |
| 発光 | 出現前は hide key、出現区間は Strength または Alpha の変化、完成後は基準値の ±5〜10% の変化を確認 |
| ambient loop | 完成後から最終 frame までの任意の 2 frame で、対象 F-Curve の評価値が同一ではない。loop seam の開始値と終了値の差は `0.01` 以下 |
| Stagger | 同種複数要素の開始 frame のレンジが、その遷移長の 30〜40% に入る。単体・意図的な同期は waiver を残す |
| 同時動作 | 実 transition から frame ごとの同時動作数を数え、契約 `concurrent_motion_limit` 以下 |

`validate_timeline.py` は契約との一致と同時動作数を正本として判定する。上表の実測値は timeline snapshot とレビュー・パケットにも残し、視覚的な滑らかさの判定とは混同しない。

## renderer / 動画の定量確認

レンダー後は `ffprobe` で 1080×1920、30fps、H.264/yuv420p、音声なし、7〜12秒を確認する。容量は 3〜5MB を WARN 範囲とし、仕様不一致は FAIL とする。フレーム差分率・平均輝度差は「静止していない」検出の補助値であり、映像として自然かの最終判断を置換しない。

## 人間レビューに残す項目

以下は定量 FAIL がないことを前提に、`review-checklist.md` で確認する: 署名ディテールがそのテーマらしく読めること、トイクレイ調の統一感、背景と主役の色・明度コントラスト、影やレリーフの読みやすさ、トランジションの気持ちよさ、世界が生きて見えること。
