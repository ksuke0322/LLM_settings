# 新しいジオラマ制作フローへ引き継ぐ旧知見

`[要再検証]` は、Blenderの現行版・TRELLIS.2からのGLB・新しい合成/動画仕様で動作を確かめてから採用する項目を示す。

## Blender実装の罠（6件）

- 規則: `[要再検証]` Blender MCPを使う場合、`execute_blender_code`内で`bpy.ops.wm.read_homefile()`や`bpy.ops.wm.open_mainfile()`を呼ばない。
  理由: MCPのtimer callback中にファイルをロードすると、既存のPythonデータ参照が無効になり破損・クラッシュした。
  出典: blender-isometric-rules/SKILL.md「.blendファイルとMCPセッションの扱い」; isometric-story-workflow/references/production-workflow.md「ステップ6」
- 規則: `[要再検証]` 取り込んだGLBは原点・回転・スケール・評価済みワールド境界を確認し、取り付け位置は実表面の座標やraycastから決める。
  理由: 想定寸法だけで取り付けた小物が本体に刺さり、不定形地形では解析的な高さ計算が浮き・めり込みを生んだ。
  出典: blender-isometric-rules/SKILL.md「2. 構造・接合」; blender-isometric-rules/references/build-pitfalls.md「小物を主要構造物に取り付ける際の解析的仮定」; アプリリポジトリ assemble_theme.py `import_prop()`
- 規則: Blenderノードは表示名でなく`node.type`で探し、`diffuse_color`だけに頼らず実レンダー用ノードを確認する。
  理由: ノード名は環境によってローカライズされ、名前指定が失敗した。ビューポート色だけの設定はCycles/Eeveeに反映されない。
  出典: blender-isometric-rules/SKILL.md「3. マテリアル・質感」
- 規則: `[要再検証]` 同じオブジェクトに複数種類のキーを設定するとき、`animation_data_clear()`は最初に一度だけ呼ぶ。
  理由: 後から呼んだ補助関数が先の`hide_render`等のキーを消し、初期フレームから部品が見える事故が起きた。
  出典: blender-isometric-rules/references/animation-pitfalls.md「animation_data_clear()の二重呼び出し事故」
- 規則: `[要再検証]` 新規生成オブジェクトの`location.z`キーは、`fcurve.evaluate()`だけで合否を決めず、異なるフレームを実レンダーして確認する。
  理由: Python上の評価値や行列は正しくても、描画がZ移動を反映しない事例があった。
  出典: blender-isometric-rules/references/animation-pitfalls.md「location.zキーフレーム」
- 規則: `[要再検証]` 長尺動画は保存済みBlendをヘッドレスBlenderの別プロセスでレンダーし、コンテナの再生可能性も確かめる。
  理由: MCP同期呼び出しがタイムアウトし、`moov atom`のない未完成MP4が残る事故があった。
  出典: blender-isometric-rules/references/animation-pitfalls.md「長尺アニメーションレンダリング」; isometric-story-workflow/references/review-publication.md「ステップ9.5」

## 出力仕様（2件）

- 規則: `[要再検証]` 旧アプリ向けの暫定基準は1080×1920、30fps、H.264/yuv420pのMP4、音声なし、7〜12秒、3〜5MBを目安とし、主役を中央1080×1080の正方形セーフエリアに収める。
  理由: 旧素材では解像度・縦横比・fpsが混在し、全画面に合わせた構図は正方形cropで被写体が欠けた。
  出典: blender-isometric-rules/SKILL.md「4. カメラ」; isometric-story-workflow/references/manifest-schema.md「記入規則」; アプリリポジトリ specs/experiments/results/image-to-3d-202610/report.md「Hard gates」
- 規則: `[要再検証]` レンダー完了はプロセス終了だけで判定せず、ffprobeで解像度・fps/CFR・codec・pixel format・音声・尺を調べ、全frame decodeも確認する。
  理由: タイムアウト後のMP4はファイルが存在しても再生不能な場合があり、旧仕様でも出力値の混在が発生した。
  出典: isometric-story-workflow/references/manifest-schema.md「動画仕様」; blender-isometric-rules/references/animation-pitfalls.md「長尺アニメーションレンダリング」

## アニメーション（5件）

- 規則: `[要再検証]` stateの表示キーだけで出現させず、`hide_render`等の切替と成長・移動・フェードなどの見える遷移を組み合わせる。Emission強度0でも見える物体は開始前に隠す。
  理由: 非表示キーだけの修正は境界でのハードカットを生み、Emission 0の球も黒い不透明物として初期フレームに現れた。
  出典: blender-isometric-rules/SKILL.md「6. アニメーション・トランジション」; blender-isometric-rules/references/animation-pitfalls.md「hide単体追加による2種の事故」
- 規則: `[要再検証]` 同種の複数部品は開始を遷移時間の30〜40%ほどずらし、配置順などから再現可能なずらし方を決める。
  理由: 全部品の同時開始は機械的に見え、15%程度のずらしもレビューで「ほぼ同時」と判定された。
  出典: blender-isometric-rules/SKILL.md「6. アニメーション・トランジション」; blender-isometric-rules/references/animation-pitfalls.md「Stagger欠如」
- 規則: `[要再検証]` 完成後のAmbient Loopは位置・回転・スケール・輪郭など形を動かし、完成stateの異なる2フレームをレンダーしてシルエット変化を確かめる。
  理由: 数%の明滅やライトの増減は長時間表示で動きとして気づかれず、静止画に見えるという評価が続いた。
  出典: blender-isometric-rules/SKILL.md「6. Ambient Loop」; isometric-story-workflow/references/quality-gates.md「Motion QA gate」
- 規則: `[要再検証]` FCurveの周期繰り返しは、往復運動に`REPEAT`、途切れない一方向の流れに`REPEAT_OFFSET`を使い、初回遷移とループを同じcurveへ混ぜない。
  理由: 水面の座標がループ境界で巻き戻り、初回フェードを含めた周期が繰り返される事故が起きた。
  出典: blender-isometric-rules/references/animation-pitfalls.md「FCurve CYCLESモディファイアの2つの落とし穴」
- 規則: Image-to-3D部品を回す前に、実メッシュの回転軸・pivot・向きを確認し、軸や接続部品を含めて短い試験アニメーションで確かめる。（2026-10-31 確認: `split_rotor.py` の 45° 回転チェック画像と、間引きレンダーで確かめた）
  理由: TRELLIS.2比較では羽根の向きと軸の補正が必要で、生成メッシュだけから回転適性を保証できなかった。
  出典: アプリリポジトリ specs/experiments/results/image-to-3d-202610/report.md「アニメーション適性」; アプリリポジトリ assemble_theme.py `import_prop()`

## マテリアル・ライティング（6件）

- 規則: `[要再検証]` 取り込んだメッシュの全マテリアルslotを実レンダーで確認し、Principled BSDFと必要なテクスチャ/ノード接続を使う。Solid表示だけで色を判定しない。
  理由: `diffuse_color`だけの指定はビューポートにしか反映されず、低ポリ面に強いNoise/Bumpを乗せると市松状のaliasingも出た。
  出典: blender-isometric-rules/SKILL.md「3. マテリアル・質感」; blender-isometric-rules/references/build-pitfalls.md「低ポリ平面へのBump/Noise」
- 規則: `[要再検証]` Image-to-3Dが発光表現まで持ち込むと仮定せず、光る窓などは入力画像とGLBを照合し、必要ならEmissionを再構成して描画で確かめる。
  理由: TRELLIS.2では窓の発光が通常のテクスチャになり、光らない見た目に戻った。
  出典: blender-isometric-rules/SKILL.md「3. マテリアル・質感」; アプリリポジトリ assemble_theme.py `glow_from_image()`
- 規則: `[要再検証]` Noise/Bumpの細かさと強さはメッシュ分割・最終表示サイズに合わせ、構造の境界が読める必要がある部分は実ジオメトリで作る。
  理由: 高周波の水面Bumpはタイル床のように見え、目地をBumpだけで表した板は俯瞰でほとんど読めなかった。
  出典: blender-isometric-rules/SKILL.md「2.5 オブジェクトの作り込み」「3. マテリアル・質感」; blender-isometric-rules/references/build-pitfalls.md
- 規則: `[要再検証]` GLBの法線・スムーズシェーディングは曲面や有機形状で確認し、意図的に角を見せる部品だけフラットにする。
  理由: フラットシェードのままの有機形状では、Subsurf等で狙った丸みがレンダーに出なかった。
  出典: blender-isometric-rules/SKILL.md「3. シェーディング」; blender-isometric-rules/references/build-pitfalls.md「未指定フラットシェード」
- 規則: `[要再検証]` 背景画像・島・雲を別素材に見せないよう、マスター画像の光向きと色を背景/雲/Blender照明で合わせ、合成後の色変換を通して判定する。
  理由: 手描き背景は3Dレンダーと画材が分かれ、ノイズ雲は灰色の煙に見えた。マスターと同じ光の生成雲・3D調の空は統一感を改善した。
  出典: references/prompts.md「試して捨てたもの」（旧 scripts/experiments/image_to_3d/backdrop_prompt.md）; アプリリポジトリ assemble_theme.py `read_master_sky()`, `apply_light()`, `composite_backdrop()`
- 規則: `[要再検証]` 生成メッシュのテクスチャ色は入力画像だけで採否を決めず、実ライティングとview transform、背景合成後の見え方を確認する。
  理由: 生成テクスチャが入力より暗く、くすんだ色に変わった事例があり、元画像との一致だけでは最終色を予測できなかった。
  出典: アプリリポジトリ specs/experiments/results/image-to-3d-202610/report.md「背景透過・影なしの入力で屋根を作り直し」

## レビューと品質判定（3件）

- 規則: 数値・構造の機械ゲートは事実確認に使い、見た目の魅力・質感・完成度の合格判定に置き換えない。
  理由: 素の円柱・円錐のままでも自動レビューを通過し、人間レビューで低品質と判定されて作り直しになった。
  出典: blender-isometric-rules/references/quantitative-qa.md「目的と境界」; blender-isometric-rules/references/build-pitfalls.md「プリミティブ直置き+後付けだけで完成にした低品質」
- 規則: `[要再検証]` マスター画像との一致、物体としての自然さ、意図した形・役割が読めるかを独立した観点で確認し、製作者の既知課題や過去の判定をレビュアーに渡さない。
  理由: 生成参考画像自体が不自然なことがあり、比較だけでは「両方おかしい」状態や、設計意図の欠落を見抜けない。
  出典: isometric-story-workflow/references/quality-gates.md「Acceptance Matrix」; isometric-story-workflow/references/review-publication.md「ステップ8」
- 規則: `[要再検証]` 同じ指摘fingerprintが2回続いたら自動反復を止め、親の判断か新しい実測・レンダーを求める。
  理由: 同じ入力と同じ失敗の再実行では進展がなく、無制限ループを招く。
  出典: isometric-story-workflow/references/repetition-control.md「共通規則」; isometric-story-workflow/references/step8-review-control.md「再実行制御」

## その他（2件）

- 規則: `[要再検証]` 細部の設計粒度はワールド寸法でなく最終投影pixel数で決める。旧基準はシルエット12px以上、コントラスト境界は1本あたり6px以上。
  理由: セーフエリアで読めない細部は実メッシュでも視認できず、細い署名パーツはレンダー上で消えた。
  出典: blender-isometric-rules/SKILL.md「2.5.5 署名パーツのpx予算」; isometric-story-workflow/references/production-workflow.md「ステップ7.5」
- 規則: `[要再検証]` TRELLIS.2へ渡すマスターは、背景透過・影なしを基本候補にし、台座や白い縁取りが生成結果に残らないか確認する。
  理由: 接地影や背景除去を通した入力では薄い白縁が残り、透過・影なし入力ではその縁が解消した。
  出典: アプリリポジトリ specs/experiments/results/image-to-3d-202610/report.md「追加検証」

## 新フローの採用判断（2026-10-31 ユーザー評価、5件）

- 規則: 主役は島。背景や雲は島を際立たせる脇役として、島の一部（石垣を含む）を隠さない。島のすぐ下の雲も島の後ろに描く。
  理由: 雲が石垣の下側にかかると、島が欠けて見えると指摘された。雲を島の後ろへ回した版が「めちゃくちゃいい」と採用された。
  出典: アプリリポジトリ assemble_theme.py `cloud_under()`（どの雲も `1 - alpha` で島の後ろに描く）
- 規則: 島の下にだけ雲を置かず、画面の下端まで手前の雲を重ねて埋める。下の段ほど大きく、ぼかしを強く、流れを速くする。
  理由: 土台の下にだけ雲があると不自然だと指摘された。雲の層で埋めると、島が雲の上に浮いて見えた。
  出典: アプリリポジトリ assemble_theme.py `cloud_under()` の雲の層
- 規則: 島の上下運動は小さくする（画面高さの約0.4%、10秒で1往復）。雲の流れは大きくする（`cloud_drift` 0.06）。
  理由: 上下運動を画面高さの1.2%・2往復にしたら、島の動きが勝って雲の流れが目立たなかった。
  出典: アプリリポジトリ layout_specs/*.json `animation`
- 規則: 浮島の底は小さめ（島の半径の約0.5倍）にする。色・目地・石の大きさは真上の石積みから引き継ぐ。
  理由: 深さが半径の1.1倍、単色の岩だと底の主張が強く、石積みとも馴染まず不自然だと指摘された。
  出典: アプリリポジトリ assemble_theme.py `wall_colours()`, `add_underside()`, `rock_material()`
- 規則: 動画の作り直しは、静止画で見た目を決めてから行う。ループの周期はきっちり閉じなくてよい。
  理由: 動画は1本約21分かかる。継ぎ目の厳密さについては、ユーザーが「閉じなくてOK」と判断した。
  出典: 2026-10-31 のユーザー評価

## 捨てたもの

- ステップ番号とworksheet/animatic先行の制作順は、画像生成・TRELLIS.2・アセンブリ中心の新工程にそのまま対応しないため除外した。出典: isometric-story-workflow/SKILL.md; isometric-story-workflow/references/design-workflow.md
- `story_contract.json`、manifest、各validatorのschema/CLIは旧制作物を前提とする手順なので除外した。出典: isometric-story-workflow/references/story-contract-schema.md; isometric-story-workflow/references/manifest-schema.md
- Greyboxを土台に手作業で段階的に造形する工程と、その手法カタログは新フローが生成メッシュを組み立てるため除外した。出典: isometric-story-workflow/references/production-workflow.md; blender-isometric-rules/SKILL.md「2.5」
- Notion、Jev、委任先、旧スキル固有のレビューJSON/台帳手順はツール・運用依存のため除外した。レビュー独立性と再発停止の原則だけ残した。出典: isometric-story-workflow/references/jev-shadow-review.md; isometric-story-workflow/references/codex-delegation.md; isometric-story-workflow/references/step8-review-control.md
- 風車・灯台・巣箱など個別テーマの寸法・パーツ・ストーリーは再利用対象外のため除外した。出典: isometric-story-workflow/references/worksheet-rules.md; blender-isometric-rules/references/build-pitfalls.md

- 規則: 夜の場面は `light.color` を暖色で明示し、`backdrop` の `grade`・`haze`・`rim` を下げる。理由: 背景の紺が光の色と合成の両方から部品に乗り、真鍮や石が青くなる。出典: 天体観測小屋の still-v1〜v2（2026-11-09）。
- 規則: 光る窓がピンクや赤に見えたら、照明や `glow` より先に GLB のテクスチャで窓の画素の色を測り、窓の画素だけを琥珀色に塗り直す（元の GLB は残す）。理由: TRELLIS が窓を赤橙で焼いていて、照明の数値をいくら変えても直らなかった。出典: 天体観測小屋の still-v3〜v5（2026-11-10）。
- 規則: 夜の場面の金属部品は、部品画像のプロンプトに中立な色（neutral warm brass, no blue reflections）を書く。理由: 青い反射ごとテクスチャに焼き込まれ、夜の照明で青く沈んだ。出典: 天体観測小屋の望遠鏡（2026-11-09）。
- 規則: 親の中で回る子部品（ドームの中の望遠鏡など）は、子の回転の中心を親の回転軸に合わせる。理由: 子の中心のまま回すと、回る途中で親の壁を突き抜けた。出典: 天体観測小屋 cool4（2026-11-10）。
- 規則: 同じクールで現れた部品を `remove` で入れ替えるときは、次の部品と重ならないよう縮む動きの時刻を確かめ、重なるなら `build_` ピボットのキーを前倒しする。
  理由: 縮む動きは `remove_` ではなく `build_` ピボットに入り、現れ終わり直後から縮むので、後から落ちてくる完成形と重なった。
  出典: 窯 cool1 のユーザー指摘（2026-11-10）
- 規則: 棚や台に「中身が順に並ぶ」場面は、空の棚と中身（段ごと）を別の部品にし、中身を `pop` で順に出す。
  理由: 中身ごと焼き込んだ棚を段階の部品で入れ替えると、棚が生え直すように見えた。
  出典: 窯 cool2 のユーザー指摘（2026-11-10）
- 規則: `bend` などで前のクールの最後に無かった形が 1 フレーム目に出るときは、継ぎ目の検査で前クールの最終フレームと並べて確かめる。
  理由: 窯 cool3 の販売棚が 1 フレーム目に曲がった姿で出て、cool2 からの継ぎ目で跳ねた（ユーザー承認済みで残した）。
  出典: 窯 本番レンダー（2026-11-11）
- 規則: 群れ（`animation.swarm`）の立ち寄り先は、1 群れにつき `avoid` の部品の片側にまとめ、`margin` を小さく（0.02 程度）する。
  理由: 立ち寄り先が箱の両側にあると経路が箱に当たり、押し出しで 1 コマに大きく飛んで蜂が瞬間移動して見えた。
  出典: 養蜂箱 cool3 のユーザー指摘（2026-11-10）
- 規則: 液体（`animation.drip`）が主役のクールは、部品の出現を前半に詰めて液体を 4 秒以上流し、溢れは受け皿の外側の面を伝わせる。
  理由: 流れる時間が短く印象が弱かった。面から離れた溢れは腸詰めのように宙に浮いて見えた。
  出典: 養蜂箱 cool4 のユーザー指摘（2026-11-10）
- 規則: `slide` などで前のクールに無い部品が 1 フレーム目から見えないか、継ぎ目の検査で確かめる。
  理由: 養蜂箱 cool2 の 1 枚目の巣板が 1 フレーム目から宙にあり、cool1 からの継ぎ目で急に現れた（ユーザー承認済みで残した）。
  出典: 養蜂箱 本番レンダー（2026-11-11）
- 規則: 散らす部品（`scatter`）が組み上がりで飛んで来ないか、出る前のコマで部品の位置を確かめる。共通スクリプトを直したら、既存テーマの静止画を main と画素で比べる。
  理由: Blender 4.5 の Scale Elements には島ごとの中心の入力がなく、小石が島から約 100 倍離れた位置から飛んで来た。直した後、風車の静止画の差は main 同士の揺らぎ以下で、同じと確かめた。
  出典: 帆船クール 2（2026-11-10）。`build_cools.py` の修正（PR #108）
