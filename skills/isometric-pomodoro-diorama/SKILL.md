---
name: isometric-pomodoro-diorama
description: IsometricPomodoro アプリのテーマ動画（浮島ジオラマがクールごとに組み上がる映像）を、ストーリー仕様書 → マスター画像（Codex 画像生成）→ TRELLIS.2 で 3D 化 → Blender で組み立て → 背景・雲の合成 → クールごとの組み上がり動画、の流れで作るときに使う。新しいテーマを作るとき、既存テーマ（雪・風車）を作り直すとき、この流れ自体を改善するときに読む。旧スキル isometric-story-workflow / blender-isometric-rules の手作業モデリング手順は使わない。
---

# 浮島ジオラマの制作フロー

1 ストーリー = 島 1 つ。ストーリー仕様書のクール構成に沿って、マスター画像で完成形を決め、土台と部品（段階ごとに姿が変わる物は段階ごとの部品）を別々に画像→3D 化し、Blender で組み立てる。動画はクールごとに 1 本（10 秒）で、前のクールの完成形から始まり、そのクールの完成形で終わる。
採用実績: 雪の山小屋・風車（2026-10-31、見た目）、温室ストーリー01 の 4 クール（2026-11-03、組み上がりの初検証）、水車小屋の粉挽き場 6 クール（2026-11-05、FLIP の水・回り始め）、鍛冶屋の炉場 4 クール（2026-11-06、炎・煙・新しい how）。

## 動画の仕様（アプリ側の決まり。必ず守る）

- アプリは 1 クールの動画を 25 分の集中に合わせて 1 回だけ再生する（ループしない、約 150 倍スロー）。出典: `specs/flow/004-video-assets-integration.md`、`IsometricPomodoro/ArtworkCanvas/VideoArtworkView.swift`。
- 最終フレームが「そのクールの完成形」として、選択カード・図鑑・完成グリッドに正方形で表示される。最終フレームの完成形を中央 1080×1080 に収める。出典: `specs/flow/006-artwork-video-format.md`。
- クール数と各クールで完成するものは、ストーリー仕様書 `docs/story-ideas/themes/<theme>/story-NN-*.md` の「クール構成」と frontmatter `cools` に従う。テーマの決まり（`_theme.md`）と `WORLD_GUIDELINES.md` も読む。
- 完成形の 10 秒ループ（雪・風車・水車小屋・温室 anim-v1）はこの仕様に合わない。25 分に引き伸ばされてほぼ止まって見え、何も組み上がらない（2026-11-02 に判明）。

## 採用済みの見た目の規則（毎回守る）

1. 主役は島。背景と雲は島を隠さない。島のすぐ下の雲も島の後ろに描く。
2. 雲は島の下だけでなく、画面の下端まで重ねて埋める。
3. 島の上下運動は小さく（画面高さの 0.4%、10 秒で 1 往復）、雲の流れは大きく（`cloud_drift` 0.06）。
4. 島の底は小さく（半径の 0.5 倍、垂れ岩 3 本）、色・目地は真上の石積みから引き継ぐ。
5. 見た目は完成形の静止画で決めてから動画にする。各クールの動画は最終フレームまで動いてよい（完成形で止める時間は作らない、ユーザー判断 2026-11-02）。
6. 動きは形が変わるもの（回転・揺れ・上下・降る・流れる）。明るさの増減を動きとして数えない。

理由と出典は [references/legacy-lessons.md](references/legacy-lessons.md)「新フローの採用判断」。

## 役割分担

| 担当 | やること |
|---|---|
| Claude（親） | 設計、プロンプトの記入、全画像の合否判定、TRELLIS.2 と Blender の実行、仕様 JSON の記入、ユーザーへの提示、記録、Git |
| Codex | 画像生成だけ（`codex-delegate.mjs` 経由）。3D・Blender 作業は任せない |
| ユーザー | 3 つの停止点（マスター画像・静止画・動画）での承認 |

## 道具と置き場所

作業はアプリリポジトリの専用 worktree で行う。以下の変数をこの名前で使う。

```bash
REPO=$(git rev-parse --show-toplevel)                  # 作業中の worktree
S=$REPO/scripts/experiments/image_to_3d                # スクリプトと仕様 JSON
B=/Applications/Blender.app/Contents/MacOS/Blender     # Blender 4.5
TR=~/work/image-to-3d/trellis2mlx                      # TRELLIS.2 MLX（.venv 入り）
SK=~/.agents/skills/isometric-pomodoro-diorama         # このスキル
T=<theme>                                              # テーマ名（英小文字・ハイフン。例 snow, windmill, watermill）
IMG=$REPO/.tmp/diorama/$T                              # 生成画像（資産ごとのフォルダ）
W=~/work/image-to-3d/diorama/$T                        # 3D・レンダー・動画の出力
```

| 場所 | 中身 | Git |
|---|---|---|
| `$IMG/<asset>/` | `prompt.txt`、参照画像、`<asset>-vN.png`、`<asset>-gen-log.json` | 管理外（`.tmp/` は `info/exclude` 済み。worktree ごとに別なので、別の worktree に移るときはフォルダごとコピーする） |
| `$W/parts/` | 部品の `NAME.png`（3D 化に使った入力画像）と `NAME.glb` を同じ名前で並べる | 管理外 |
| `$W/shell/` | 土台の GLB と計測結果 | 管理外 |
| `$W/still-vN/`、`$W/anim-vN/` | 静止画（`scene.png`、`scene.blend`）と動画（`loop.mp4`） | 管理外 |
| `$S/dress_specs/$T.json`、`$S/layout_specs/$T.json` | テーマの仕上げ仕様と配置仕様 | 管理する |
| `$REPO/specs/experiments/results/image-to-3d-202610/report.md` | 制作記録 | 管理する |

使うスクリプトは `$S` 直下のもの:

| スクリプト | 役目 |
|---|---|
| `assemble_theme.py` | 組み立て・静止画（`base_dress.py`・`material_enrich.py`・`split_rotor.py`・`sway.py` を呼ぶ） |
| `animate_theme.py` | クールごとの `.blend` と動画（`build_cools.py`・`water_fx.py`・`fire_fx.py`・`flip_water.py` を呼ぶ） |
| `flip_water.py` | FLIP の水の焼き上げの準備（完成静止画で 1 回） |
| `base_quality.py` | 土台の計測 |
| `smooth_lawn.py` | 芝のような上面の器を 3D 化前に平らにする |

研究用で本番の流れでは使わない: `flip_trial.py`（FLIP の試験）、`mantaflow_smoke.py`・`mantaflow_trial.py`（Mantaflow の比較）。`$S/legacy/` は旧フローの記録で、使わない。

各工程を始めるとき、[references/legacy-lessons.md](references/legacy-lessons.md) と [references/external-lessons.md](references/external-lessons.md) の、その工程の項目を読む（下の各工程に書いた節）。

## 版の呼び方

工程をまたいで使う版は、決めた時点で次の変数に入れ、`report.md` にも書く。後の工程のコマンドはこの変数を使う。

| 変数 | 決める工程 | 例 |
|---|---|---|
| `MASTER` | 2 | `$IMG/$T-master/$T-master-v1.png` |
| `SHELL` | 3 | `$W/shell/base-s7.glb`（選んだ版の画像・シード） |
| `BG`、`CLOUD` | 7 | `$IMG/$T-bg/$T-bg-v1.png` |
| `STILL` | 9 | `$W/still-v3`（ユーザーが承認した静止画の版） |

出力フォルダの版番号（`still-vN`、`anim-test-vN`、`anim-vN`）は作るたびに 1 つ増やし、前の版を上書きしない。

## 画像の生成のしかた（全工程共通）

1. `mkdir -p $IMG/<asset>` を作り、[references/prompts.md](references/prompts.md) の該当テンプレートを埋めて `prompt.txt` に保存する。参照画像は次の名前でそのフォルダへコピーする。
   - マスター画像 → `ref-master.png`（土台・部品・背景）
   - 採用した背景 → `ref-bg.png`（雲）
2. 依頼を作って実行する（Bash のバックグラウンド実行。1 枚 5〜15 分）。
   ```bash
   python3 $SK/scripts/make_image_request.py $IMG/<asset> <KIND> [ref.png ...] > $IMG/<asset>/req.json
   rtk proxy node ~/.agents/bin/codex-delegate.mjs < $IMG/<asset>/req.json > $IMG/<asset>/out.json 2>&1
   ```
3. **1 本ずつ**頼む。並行に頼むと出力が衝突する。
4. `out.json` の `status` が FAILED でも、理由が「`~/.codex/generated_images/` への自動保存」だけなら画像は使える。その他の FAILED は理由を読んで依頼を直す。
5. 親が画像を原寸で Read して判定する。context-mode が入っていると 16KB を超える Read は拒否されるので、Read に `limit: 1` を付ける（画像は全体が読める。2026-11-05）。不合格は理由をプロンプトに足して作り直す（1 資産 3 回まで。3 回とも不合格なら止めてユーザーに相談する）。

## 工程

### 1. テーマの設計（親）

次を決めて、`report.md` の末尾に `## テーマ「<日本語名>」の制作（YYYY-MM-DD）` の節を作って書く。節の中は `### 設計`・`### 生成と 3D 化`・`### 静止画`・`### 動画`・`### 分かったこと`・`### 残る課題` の順に、工程が進むたびに足す。

- 最初にストーリー仕様書（`docs/story-ideas/themes/<theme>/story-NN-*.md`）と `_theme.md` を読む。主役・周りの物・クール数・各クールで完成するものは仕様書から取る。親が勝手に決めない（温室で仕様書を読まずにマスターを作り、作り直しになった 2026-11-02）。
- テーマ名 `T`、`{world}` の 1 語句（場所・季節・時間帯）。
- 主役 1 つと、周りの部品 3〜7 個（仕様書の「周辺の余白」から選ぶ）。部品ごとに「1 枚の画像で描ける 1 つの物」にする。
- **クール分解**: 仕様書のクールごとに、そのクールで起きることを次の 2 種類に分けて `report.md` に表で書く。
  - 現れる物: 新しく置かれる部品・仕上げの層。現れ方（下の `how`）を決める。
  - 姿が変わる物: 骨組み→完成、苗→育った株→花と実のように、同じ場所で段階が進む物。段階ごとに別の部品を作る（4 で画像、5 で 3D 化）。完成形の静止画に写らない前の段階には配置仕様で `"hidden": true` を付ける。
  - 1 クールで足す物は 2〜4 グループにし、ひと目で何が増えたか分かるようにする。最後のクールの最終状態 = 完成形の静止画。
  - ガラスのように透ける外皮は 3D 化すると不透明に焼き込まれ中が見えなくなるので、骨組みだけを部品にし、配置仕様の `"glass"` で Blender が透明な囲いを作る（温室）。
- 動く物と動き方。今のスクリプトで動かせるのは次のものだけ。
  - 回る: `rotor`（`split_rotor.py`）。途中のクールから回すなら `spin_from_cool`（工程 8）
  - 揺れる: `sway` のプリセット `wheat`／`grass`／`cloth`
  - 降る: `snow`
  - 流れる水: `stream` の帯、または FLIP（下の「水と…」）。落ちる水の粒は `water_fx`
  - 炎・煙・火花: `animation.fire_fx`（下の「煙と炎」）
  - 組み上がり: `cools` の `how`（工程 8）
  - 島の上下と雲の流れ: どのテーマにも自動で付く
- 雪・風車と型が違う点（水・ガラス・細い植物など）と、それをどの工程で扱うか。上で表せない動きや、検出が外れそうな回転部分（張り出しの小さい水車など）は、`report.md` に「未対応」と書き、静止画（9）の前にユーザーと扱いを決める。決めた方法で作ったら、スクリプトとこのスキルに足す。

### 水と、張り出しの小さい回転部分（水車小屋 2026-11-01 で対応）

- 川・水路は器の画像に描かない（上面の模様は TRELLIS で崩れる）。器は川なしで作り、配置仕様の `stream`（点列・幅・滝 `fall`）で Blender が水の帯と滝を描く。動きは `animation.water`（模様の流れ `speed`、輪郭の揺れ `wave`）。書式は `assemble_theme.py`・`animate_theme.py` の docstring。
- 落ちる水には粒を足す（`water_fx.py`、配置仕様の `animation.water_fx`）。`fall`（滝の下端のしぶき）・`lip`（縁の泡）・`drips`（水車のしずく）を使う。`wheel`（水車の下の撹拌）は橋や柱に隠れやすいので、見えるときだけ。値は `layout_specs/watermill.json` から始める（ユーザー採用 2026-11-01）。本物の流体シミュレーション（Mantaflow）はこの絵柄に合わず使わない（`report.md`「水表現の研究」）。
- 水を主役級に見せたいテーマは、FLIP Fluids で本物の流れを焼く（`$S/flip_water.py`、水車小屋 anim-v4 の H6 から飛沫を除いた設定、標準の流れへ組み込み 2026-11-05）。土台を水路の形に掘り下げ、上流から流して滝へ落とす。
  - 配置仕様の `animation.water` に `{"engine": "flip", "from_cool": N, "res": 96, "preroll": 150}` を書く。川の形は `stream` から作られ、テーマ固有の値は要らない。
  - 焼き上げは完成静止画で 1 回だけ（`flip_water.py LAYOUT FLIP_DIR` → アドオンの `run_simulation.py`）。各クールは `animate_theme.py --cool N --flip FLIP_DIR` で同じキャッシュを使う。どちらも Blender 起動時に `--python-expr` で FLIP アドオンを有効にする。
  - `from_cool` より前のクールは帯の水のまま。そのクールでは前半の水路が空で、回転が始まる時に水が来る。後のクールは始めから流れている。
  - 目安（watermill2、450 フレーム）: 焼き約 2 分・キャッシュ約 0.7GB、描画 1 本 30 分前後。動画を作り終えたらキャッシュと連番画像は消してよい。
  - 研究用の `$S/flip_trial.py` の指定一式・失敗と直し方は `report.md`「FLIP」の節。
  - 滝の飛沫（whitewater）は付けない（`--whitewater 0`）。水路と滝の流れだけで足りるとユーザー判断（2026-11-02）。
  - 流れの模様は速度の属性で動かす（`--flow 0.1`）。UVW 属性だけでは画面上ほぼ動かず、水路が止まって見えた。
- 回転部分の自動検出が外れたら（`rotor-check` の画像で別の部分が回っていたら）、`split_rotor.py` を単体で `--hub '[x,y,z]' --axis '[x,y,z]' --radius r [--keep '[[lo],[hi]]']`（部品の座標系）で試し、効いた値を `rotor` に書く。`--reach` も渡せる。
- 回転物を単体の部品として作ったとき（建物と別に作った水車など）は、張り出しがないので自動検出は必ず外れる。頂点の主成分分析で、分散が最小の軸を回転軸に、高さの半分を中心にして、`hub`／`axis`／`radius` を明示する。`slab` は車輪の厚みより少し薄くして（水車小屋 2 で 0.2）、軸の出っ張りを本体として残す。厚み以上にすると本体の頂点が 0 になって落ちる（水車小屋 2、2026-11-04）。
- 切り出した回転部分を回して崩れて見えるとき（切り口のギザギザ、壁に焼き込まれた色）は、`rotor.rebuild` で同じ軸・半径の Blender 製の水車に差し替える。

### 煙と炎（鍛冶屋の炉場 2026-11-05 で対応）

- 炎・煙・火花は配置仕様の `animation.fire_fx` に書く（`fire_fx.py`。書式は docstring）。どれも時刻だけで形が決まり、焼き込みは要らない。
  - `flame`: 円錐の舌が動くノイズで形を変え、高さが伸び縮みする。色は発光だけで出す（地の色を明るくすると日光と AgX で鮭色に白飛びした）。発光の強さは 0.8 前後。強いと色が抜ける。
  - `smoke`: トゥーン調の煙玉が昇りながら膨らみ、風 `wind` で曲がり、縮んで消える。色は暗め（`[0.3, 0.29, 0.29]` で灰色に見える。0.5 以上は白く飛んだ）。
  - `sparks`: `water_fx.spray` の粒。金床などから飛んで落ちる。
- 出る位置は部品の箱の中の割合 `{"part": "forge", "at": [x, y, z]}` で書く（0〜1）。箱は最終コマ（組み上がった後）で測る。最初のコマで測ると炉がまだ平らなときの位置になり、煙が火口から出た。値は短い試しレンダー（`--frames 31 --every 30`）で口・煙突に合わせる。奥行き方向の軸は画面では左右にも動くので、2 通り並べて選ぶ。
- 途中のクールで火が入るときは `"from_cool": n, "start": 秒`。時間はクールをまたいで続く（物語の時間 =（クール−1）×10 秒＋場面の時間）ので、次のクールの 1 コマ目は前のクールの最後と同じ炎・煙になる。
- 煙の物理シミュレーション（`mantaflow_smoke.py`、`"engine": "mantaflow"`）は比較用。黒いもやになり絵柄に合わず、3 秒でキャッシュ 885MB。ユーザーは煙玉を選んだ（2026-11-05）。

### 2. マスター画像（Codex → 親 → **停止点 1**）

- `$IMG/$T-master/`、KIND=master、参照なし。テンプレートは prompts.md の 1。
- 見る項目: external「適用候補 1」。
- 親の判定: 主役の輪郭が一目で分かる / 周りの物が 3〜7 個で重なっていない / 色が 3〜5 色にまとまっている / 島の全体が余白付きで入っている / 文字がない。
- 合格した画像を SendUserFile で見せ、**ユーザーの承認を得るまで 3 に進まない**。承認された版を `MASTER` に入れる。

### 3. 土台の器と 3D 化（Codex → 親）

1. `$IMG/$T-base/` に `MASTER` を `ref-master.png` としてコピーし、KIND=base で生成する（prompts.md の 2）。判定: 上面が平ら、縁が面一、上に何もない、側面が 2〜3 段の積み石、背景が透過。合格した版を `BASEIMG` に入れる（例 `$IMG/$T-base/$T-base-v1.png`）。
2. 3D 化する。高速設定でシード 2 つ（7 と 42）を順番に回す（1 本約 10 分、メモリ約 25GB。同時に 2 本走らせない）。
   ```bash
   mkdir -p $W/shell ~/work/image-to-3d/logs
   for s in 7 42; do (cd $TR && PYTHONPATH=. .venv/bin/python generate.py --image $BASEIMG \
     --output $W/shell/base-s$s.glb --seed $s --no-cascade --steps 8 --target-faces 200000 --texture-size 1024 \
     > ~/work/image-to-3d/logs/$T-base-s$s.log 2>&1); done
   ```
3. 計測する: `$B -b --factory-startup -P $S/base_quality.py -- $W/shell/base-s7.glb $W/shell/q-s7`（42 も同様）。
4. 選ぶ: `metrics.json` の `boundary_edges_per_1k` が 50 以下、`dark_texel_share` が 0 のものから、灰色の拡大図（出力の PNG）でささくれが少ない方。両方とも不合格なら、シードを 1 つ足す（例 3、出力 `base-s3.glb`）。それでも不合格なら器の画像を作り直す。選んだ GLB を `SHELL` に入れる。
5. 上面が芝のように細かな質感の器は、灰色の図で上面が毛羽立った凹凸になり、`boundary_edges_per_1k` が 200〜350 に跳ねる。プロンプトで「毛並みなし」と頼んでも消えない（温室 2026-11-02、3 シード＋描き直し 2 回とも不合格）。器の画像の緑の画素だけを平らにする前処理を通してから 3D 化する: `$TR/.venv/bin/python $S/smooth_lawn.py BASEIMG.png BASEIMG-s.png`（温室では s42 が 54.6、上面は平らになり採用）。

### 4. 部品の画像（Codex → 親）

- 部品ごとに `$IMG/$T-<part>/` を作り、`MASTER` を `ref-master.png` としてコピーする。KIND=part、参照 = `ref-master.png`。テンプレートは prompts.md の 3。
- 形が向きで決まる部品（流れ沿いの石垣・柵など）は、部品画像の段階で「まっすぐ」「この長さ」と形を指定する。弧に描かれると、配置の `turn` では直らない（水車小屋 2 の石垣）。描き直さずに済ませるなら、配置仕様でその部品に `"straighten": 1.0` を書くと弓なりが取れる（`assemble_theme.py`）。向きは `turn` を数通り試して流れや道と平行になる値を選ぶ（石垣は 80、2026-11-05）。マスターの木・柵・茂みも部品に入れないと、島がマスターより寂しくなる。
- 判定: マスターのその物と形・色・付属物が一致 / 1 つだけで欠けていない / 地面や影がない / 細い所が太く描かれている / 回る部品は回転部分が本体の外へ張り出している。
- 段階ごとの部品（工程 1 のクール分解で決めたもの）は、同じ器・同じ並び・同じ大きさで中身だけ変えて描かせる（例: 「two long rectangular wooden raised planting beds … the same size and layout」を全段階のプロンプトに入れる）。入れ替えたときに位置がずれないようにするため。骨組みの段階は「ALL openings completely EMPTY, NO glass」と明記する。

### 5. 部品の 3D 化と検査（親）

```bash
mkdir -p $W/parts
for p in <part> ...; do cp $IMG/$T-$p/$T-$p-v1.png $W/parts/$p.png
  (cd $TR && PYTHONPATH=. .venv/bin/python generate.py --image $W/parts/$p.png --output $W/parts/$p.glb \
   --seed 7 --no-cascade --steps 8 --target-faces 200000 --texture-size 1024 > ~/work/image-to-3d/logs/$T-$p.log 2>&1); done
```

- 入力は必ず背景透過の PNG にする。透過なら `generate.py` は背景除去（rembg）を通さない。不透明な画像を渡すと rembg が走り、TRELLIS.2 採用時の運用条件（背景除去を通さない）に反する。
- 採用した版が v1 でないときは、その版をコピーする。`NAME.png` は消さない（窓の発光 `glow` がこの画像を使う）。
- 部品の合否は数値で決めない（`base_quality.py` の閾値は土台用で、部品には使わない）。組み立て後の静止画（9）で、形・割れ・向き・欠けを目で判定する。単体の見た目を先に確かめたい部品だけ、`base_quality.py` の出力レンダー（カラー・灰色・拡大）を見る。見る項目: external「適用候補 2」、legacy「Blender実装の罠」。
- 縁に alpha 1/255 ほどの色が残る画像は、alpha 8 未満を 0 にしてから 3D 化する（残すと縁が赤い膜になった。水車小屋 2 の樋）。
- `generate.py` が異常終了（exit 133 など）したら、同じシードでもう一度回す（鍛冶屋の鞴は 2 回目で通った）。
- 崩れた部品はシード 42 で作り直し、それでも崩れたら画像を太く・塊で描き直す。

### 6. 仕上げ仕様（親）: `$S/dress_specs/$T.json`

- マスターを見て、土台の上面と縁に足す細部（草の束・雪の帯・小石・花など）を書く。書式は `base_dress.py` の docstring。上面の素材が近い既存の仕様（草なら `windmill.json`、雪なら `snow.json`）を写して始める。
- キーは 5 つで、全部書く。
  - `_source`: マスターから読み取った内容を 1 文で。
  - `surfaces`: 土台の上面テクスチャを色で分ける区分（名前ごとに `hue`／`sat`／`val` の範囲、0〜1）。`scatter` 層がこの名前で散らす場所を選ぶ。範囲は、器の GLB を `base_quality.py` でレンダーしたカラー画像から、各素材の色を読んで決める。決めたら 1 回組み立て（9）、散らした物が意図した素材の上にだけ載っているかで確かめる。
  - `layers`: `rim`（縁）／`scatter`（区分の上）／`ring`（帯）の層。部品の種類は `blades`／`blob`／`cluster`／`spike`／`drape`。
  - `camera`: `{"elevation": 32〜35, "azimuth": -50}`（雪 32、風車 35 の実績）。
  - `world`: 環境光の色（リニア RGB）。背景画像があると組み立て時に背景の平均色で上書きされるので、写した値のままでよい。
- 垂れるもの・細いもの・浅いもの（つらら・垂れ苔・縁の雪）は 3D 化させず、ここで足す。

### 7. 背景と雲（Codex → 親）

- 背景: `$IMG/$T-bg/` に `MASTER` を `ref-master.png` としてコピー、KIND=backdrop（prompts.md の 4）。判定: 島・建物がない、中央が静か、文字がない。合格した版を `BG` に入れる。
- 雲: `$IMG/$T-cloud/` に `BG` を `ref-bg.png` としてコピー、KIND=cloud（prompts.md の 5）。判定: 雲だけ、四隅の alpha が 0。合格した版を `CLOUD` に入れる。
- 見る項目: legacy「マテリアル・ライティング」の背景との統一、external「適用候補 5・7」。

### 8. 配置仕様（親）: `$S/layout_specs/$T.json`

`assemble_theme.py` と `animate_theme.py` の docstring が書式の正本。新しいテーマは次の値から始める（雪・風車で採用した値。`light`・`world_strength` は風車の値で、雪は energy 6.0・elevation 22・world_strength 0.55）。`portrait` は必ず `true`（ないと 1080×1080 になる）。`backdrop` のパスは `BG`・`CLOUD` の版に合わせる。

```json
{
  "_source": "マスターから読み取った配置を 1 文で",
  "props": [{"part": "<part>", "xy": [x, y], "size": s, "by": "height", "turn": 0, "keep_out": 1.0}],
  "light": {"energy": 4.5, "elevation": 35, "azimuth": -20, "fill": [0.6, 0.72, 1.0], "fill_energy": 0.6},
  "world_strength": 0.7, "margin": 1.08, "look": "AgX - Medium High Contrast", "exposure": 0.3,
  "backdrop": {"image": "../../../../.tmp/diorama/<T>/<T>-bg/<T>-bg-v1.png",
               "cloud": "../../../../.tmp/diorama/<T>/<T>-cloud/<T>-cloud-v1.png",
               "cloud_overlap": 0.2, "cloud_width": 1.7},
  "underside": {"depth": 0.5, "lobes": 3},
  "portrait": true,
  "animation": {"seconds": 10, "bob": 0.004, "bob_cycles": 1, "cloud_drift": 0.06}
}
```

- `xy` は最終カメラから見た位置（x＝右、y＝奥、単位は土台上面の半径）。`size` は半径に対する比、`by` は高さか幅のどちらで合わせるか。`turn` 0 は生成画像と同じ向き。
- 窓・ランプが光る部品に `"glow": 4.0`。回る部品に `"rotor": {"slab": 0.07}` と、`animation` に `"spin_turns": 1`。クールの途中から回し始めるなら `animation.spin_from_cool: N`（N より前のクールは止まり、クール N の中ほどから 1 秒かけて回り始め、後のクールは最初から回る）。揺れる部品は `animation.sway` に `{"<part>": "wheat"}`。雪を降らせるなら `animation.snow`（雪テーマは 260）。
- 同じ部品を複数置くと、色が自動で少しずつずれる（`vary_copy`）。
- 画像のパスは配置仕様からの相対パス。
- 段階ごとの部品は同じ `xy`・`turn`・`size` で重ねて置き、完成形に写らない段階に `"hidden": true`。ガラスの外皮は骨組みの部品に `"glass": {"sill": 0.2, "eave": 0.55, "ridge": 0.92, "alpha": 0.12}`（`glass_<i>` ができる）。
- `cools`: 工程 1 のクール分解をそのまま書く。書式は `build_cools.py` の docstring が正本。
  ```json
  "cools": [
    {"title": "骨組みが完成する", "steps": [{"add": ["stones"], "how": "pop"}, {"add": ["frame"], "how": "grow"}]},
    {"title": "ガラスが張られ温室が完成する", "steps": [{"add": ["glass"], "how": "fade"}, {"add": ["bench"], "how": "grow"}]},
    {"title": "植物が育っていく", "steps": [{"add": ["plants1"], "how": "grow"},
                                          {"add": ["plants2"], "remove": ["plants1"], "how": "grow"}]}]
  ```
  - 選び方: 部品名（置いた全部）、`"dress:<n>"`（仕上げ仕様の n 番目の層）、`glass`。土台は常にある。どのクールにも出てこない物は、クール 1 の最初からある。
  - `how`: `grow`（下から生える。地面に立つ物）、`drop`（上から落ちる。置かれる物）、`pop`（その場で大きくなる。小物）、`scatter`（仕上げの層の一粒ずつが時間差で出る。草花・小石）、`fade`（透明から。ガラス）。`remove` を同じ step に書くと、前の段階が縮んで消え、次の段階が生える（入れ替え）。
  - 形が変わる現れ方（issue #86、2026-11-06 採用）: `bend`（根元から丸まった形が起き上がる。壁・柵・家・板）、`morph`（根元の低いドームが形へ変わる。屋根・布・丸い物）、`slide`（横から弧を描いて滑り込む。道・橋・荷車・舟）、`spin`（回りながら落ちて収まる。樽・壺・袋など丸い小物）、`squash`（落ちて潰れ、伸び戻って収まる。重さを見せたい物）。`scatter` に `"order": "center"` を足すと、層の中心から外へ広がる（大きめの小物を並べた層向き。草のような細かい層では差がほとんど見えない）。
  - 選び方: 1 クールの中で同じ how を続けない。主役の 1 つ（そのクールの題になる物）に `bend`・`morph` のような形が変わる how を使い、添え物は `pop`・`scatter` にする。外から入る `slide`・`spin`・`squash` は画面の外から来て見えるので、近くの物と重ならないか間引きレンダーで確かめる。明るさの増減だけの現れ方は動きとして数えない（`fade` はガラスに限る）。
  - スロー再生で見えにくいことは外す理由にしない（テーマ図鑑で通常の速さでも再生する）。
  - 大きい部品（小屋など）に `grow` を使わない。最初の 1〜2 秒が地面の平たい板に見える（水車小屋 2 のクール 3）。`pop`（水車小屋 2 の小屋、ユーザー承認 2026-11-05）か `bend`（鍛冶屋の小屋、2026-11-06 承認）にする。
  - step はクールの 10 秒を順に分け合い、30% ずつ重なる。1 フレーム目から動き始め、最終フレームまで動く。

### 9. 組み立てと静止画（親 → **停止点 2**）

```bash
$B -b --factory-startup -P $S/assemble_theme.py -- $SHELL $S/dress_specs/$T.json \
  $S/layout_specs/$T.json $W/parts $W/still-v1 $MASTER > $W/still-v1.log 2>&1; grep -E "^ASSEMBLE|Error" $W/still-v1.log
```

- 最後の引数（マスター画像）は省かない。省くと背景と雲が合成されず、透明な `scene.png` になる。
- 出力: `scene.png`（1080×1920、背景と雲を合成済み）、`scene.blend`、`assemble_report.json`。
- 見る項目: legacy「Blender実装の罠」「マテリアル・ライティング」「レビューと品質判定」、external「適用候補 3・4・6・9」。
- 親の判定（`scene.png` を原寸で Read し、マスターと並べて見る）:
  - 部品の浮き・刺さり・仕上げ部品とのぶつかりがない。
  - `assemble_report.json` の `dropped_shard_verts`（土台から削った小さな欠片の頂点数）は記録するだけで、合否には使わない。土台に穴や欠けが見えたときだけ、この値が大きくないか確かめる。
  - 雲が島（石垣を含む）に一切かかっていない。雲が画面の下端まで続いている。
  - 島の底が小さく、石積みと色がつながっている。
  - 窓の発光が窓とランプだけに出ている（軒や雪に光る斑点がない）。
  - 主役と部品の大きさの釣り合い、向きがマスターと合っている。向きは、部品画像で手前にある物（柵・扉など）がシーンでも手前に来ているかで確かめる。部品の色が淡い・くすむときは、色を直す前に裏を見ていないか疑う（温室のひまわりは後ろ向きで、がくの色が出ていた。`turn` 180 で解決）。
  - 細い物（花びら・葉先）がシルエットに出て空色に白く飛ぶときは、配置仕様の `backdrop.rim`（縁に空の色を足す強さ、既定 0.45）を下げる（温室 0.15）。
- 直すのは仕様 JSON の数値。スクリプトにテーマ固有の値を書かない。直したら `still-v2`、`v3` と出力を分け、前の版と ffmpeg で横に並べて差を確かめる（`ffmpeg -i a.png -i b.png -filter_complex hstack out.jpg`）。
- 同じ指摘が 2 回続けて直らなかったら、3 回目を試さずユーザーに相談する。
- 合格した `scene.png` を SendUserFile で見せ、**ユーザーの承認を得るまで 10 に進まない**。承認された版のフォルダを `STILL` に入れる。

### 10. クールごとの動き付き .blend（親）

完成形の `scene.blend` から、クールごとに動きを付けて保存する（レンダーはしない。1 本 1 分ほど）。

```bash
for c in 1 2 3 4; do $B -b --factory-startup $STILL/scene.blend -P $S/animate_theme.py -- \
  $S/layout_specs/$T.json $W/anim-v1/cool$c --cool $c --save 1 > $W/anim-v1/prep-c$c.log 2>&1; done
```

- FLIP の水を使うテーマは、先に完成静止画で 1 回焼き（工程 1 の「水と…」）、`--save` にも `--flip FLIP_DIR` を付け、`--python-expr` で FLIP アドオンを有効にする。`from_cool` のクールだけ水路が空から始まるので、前のクールの最後（帯の水）との継ぎ目で絵が飛ぶ（未解決、水車小屋 2）。
- クール数は仕様書の `cools` に合わせる。出力は `$W/anim-v1/coolN/coolN.blend`。背景と雲を重ねる位置（完成形から決めた枠）も `.blend` に保存され、全クールで構図がそろう。
- 保存した `.blend` を 30 フレームおきに間引きレンダーして、動きを確かめる（1 クール約 3 分）。
  ```bash
  $B -b --factory-startup $W/anim-v1/cool$c/cool$c.blend -P $S/animate_theme.py -- $S/layout_specs/$T.json $W/check-c$c --every 30
  ```
  クールごとに 10 コマを横に、クールを縦に並べた確認シートを作り（`tile=10x1` と `vstack`）、次を見る。
  - 各クールの 1 コマ目が、前のクールの最後のコマと同じ状態。
  - 現れる物が書いた順に現れ、最後のコマが完成形（最後のクールは静止画と同じ）。
  - 入れ替え（`remove`）で前の段階が残っていない。小さい物・ガラスの奥の物は拡大シートでも見る。
- 確認シートと `.blend` の場所をユーザーに渡す。

### 11. ユーザーの手直し（**停止点 3**）

ユーザーが破綻を少し直す。流れ（ユーザー合意 2026-11-02）:

1. 形の破綻（めり込み・浮き・3D 化の崩れ・大きさ・材質）は、完成形のマスター `$STILL/scene.blend` で直してもらう。全クールに共通なので 1 回で済む。
2. 形を直したら、親が 10 をやり直す（`coolN.blend` は作り直され、そこにあった直しは消える）。
3. 動きの破綻（タイミング・順番・落ちる高さ）は、各 `coolN.blend` で直してもらう。
4. 直した `coolN.blend` をそのままレンダーする（12）。

- 手直しの後に組み立て（9）をやり直さない（`scene.blend` が上書きされる）。やり直すときは `still-v2` に出し、手直しも入れ直す。
- オブジェクトの名前を変えない・複製しない（`cools` は名前で選ぶ）。`"hidden"` の段階の表示を触らない。背景と雲は Blender の外で合成するので、コンポジターの直しは効かない。
- ユーザーが「見た目より動きの検証」と言うときは、手直しを飛ばして 12 へ進む。

### 12. 動画（親）

```bash
$B -b --factory-startup $W/anim-v1/cool$c/cool$c.blend -P $S/animate_theme.py -- $S/layout_specs/$T.json $W/anim-v1/cool$c
```

- 保存済みの `.blend` は、動きを付け直さずそのままレンダーする（`scene["prepared"]`）。1 クール約 20 分、FLIP の水があるクールは約 30 分。Bash の `run_in_background` で全クールを順に走らせ、完了通知を待つ。
- クールごとに検査する。どれか 1 つでも違えば不合格。
  ```bash
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name,pix_fmt,nb_frames -of csv=p=0 $M
  ffprobe -v error -show_entries stream=codec_type -of csv=p=0 $M   # video だけ（音声なし）
  ffmpeg -v error -i $M -f null - && echo decode-ok
  ```
  期待値: `h264,1080,1920,yuv420p,30/1,300`、`decode-ok`、ファイル 3〜5MB。
- 継ぎ目: クール N の最終フレームとクール N+1 の 1 フレーム目の差が小さいこと（島の上下と雲の位置だけが違う）。最後のクールの最終フレームが完成形の静止画と同じ見た目であること。
- 動画を SendUserFile で送り、感想をもらう。指摘は仕様 JSON の数値 → スクリプトの汎用処理 → 画像の作り直しの順で直す。

### 旧: 完成形のループ（参考）

`--cool` を付けずに `animate_theme.py` を実行すると、完成形のまま島が上下し雲が流れる 10 秒ループになる（雪・風車・水車小屋の anim）。アプリの仕様には合わないので本番には使わない。

### 13. 記録と反映（親）

- `report.md` のテーマの節（工程 1 で作ったもの）に、`MASTER`・`SHELL`・`BG`・`CLOUD`・`STILL` の版、失敗と直し方、ユーザーの評価を書く。
- ユーザーの指摘・新しい失敗は、規則・理由・出典の 3 行でこのスキルへ足す（下の「改善のしかた」）。
- Git（ブランチ・コミット・PR）はユーザーの承認を得てから行う。生成画像・GLB・動画はコミットしない。

### 14. 片付け（親、動画の承認後）

残すのは最終版と、それを保つのに必要な物だけ。作り直せば同じになる物と、採用されなかった版は消す（ユーザー方針 2026-11-06）。

| 残す | 消す |
|---|---|
| `STILL/scene.blend`・`scene.png` | クールの `.blend`（`scene.blend` から 1 本約 1 分で作り直せる） |
| `$W/parts/`（PNG と GLB） | FLIP のキャッシュ（約 2 分で焼き直せる） |
| `SHELL` に選んだ GLB | 不採用のシードの GLB と計測フォルダ（`q-s7` など） |
| 最終の各クールの `loop.mp4`（アプリに入れる前は特に） | 古い版（`still-vN`・`cools-vN`・`video-vN`・`anim-vN` の採用版以外） |
| `$IMG/` の生成画像（作り直すと絵が変わる） | 確認用（`check-*`・`sheet-*`・`compare-*`・`*-test`・比較動画）とログ |
| ユーザーが手直しした `coolN.blend` | 作り直したテーマの旧フォルダ（他テーマが参照していないことを確かめる） |

- 手順: 消す対象の一覧と大きさを `du -sh` でユーザーに見せ、承認を得てから `~/.Trash/diorama-cleanup-YYYYMMDD/` へ元の構成のまま移す。完全に消す（ゴミ箱を空にする）のはユーザーが行う。
- 移した後、`STILL/scene.blend` と全クールの `loop.mp4` が残っていることを確かめる。
- 消す前に確かめる: 配置仕様の `backdrop` などが参照する画像・GLB は残す（温室 2 は旧温室の背景を参照している）。Git にないスクリプト（試作など）は、要るならリポジトリへ移してから消す。

## 改善のしかた

このスキルが正本。改善点が出たら、その場でこのスキルを直す。

| 出てきたもの | 直す場所 |
|---|---|
| 守るべき見た目・作り方の規則 | `references/legacy-lessons.md`（規則・理由・出典の 3 行）。毎回守るものは上の「採用済みの見た目の規則」にも足す |
| 外部資料から得た知見 | `references/external-lessons.md` |
| プロンプトの変更 | `references/prompts.md`（変えた理由を末尾の「試して捨てたもの」かテンプレートの注に書く） |
| 工程・順番・コマンド・停止点の変更 | この `SKILL.md` |
| スクリプトの機能 | アプリリポジトリの `$S`（テーマ固有の値は書かない）。使い方が変わったらこの `SKILL.md` のコマンドも直す |

- `[要再検証]` の付いた規則は旧フローの知見。新フローで確かめたら印を外し、確認日と根拠を出典に書き足す。
- `~/.agents` は Git リポジトリなので、スキルを直したらユーザーの承認を得てからコミットする。
