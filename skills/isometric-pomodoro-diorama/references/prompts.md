# 画像生成プロンプト

すべて Codex の画像生成（`scripts/make_image_request.py`）に `prompt.txt` として渡す。
`{...}` の部分だけをテーマごとに書き換え、それ以外の文は変えない。変えたくなったら、試した結果を `legacy-lessons.md` に書いてからこのファイルを直す。

## 1. マスター画像（KIND=master、参照画像なし、不透明）

テーマの完成イメージ。後の全工程（土台・部品・背景・配置）の色と画風の参照になる。

```text
A cozy isometric miniature diorama on a round floating base, in a soft stylised toy-clay 3D render style with warm lighting, like a premium mobile game illustration.

Theme: {主役と、その周りの物を 2〜3 文で。例: a small snowy mountain log cabin in winter. The cabin has a snow-covered roof with icicles and a stone chimney. Around it: a few snow-laden pine trees, a stack of firewood, a wooden sled, a lantern on a post, and a trampled footpath through the snow leading to the door.}

The base is a round plinth whose top is {上面の素材} and whose side shows {側面の石・土}. {縁や上面に散らばる細部を 1〜2 文で}

Three-quarter elevated orthographic view, the whole diorama visible and centered with generous margins, plain soft pale blue background, no text, labels or watermark. Square image.
```

- 主役は 1 つ。周りの物は 3〜7 個にする（多いと配置で埋もれる）。
- 主役が動く機構（羽根・水車など）を持つなら、Theme にその向きを書く（例: sails facing front-right）。

## 2. 土台の器（KIND=base、参照 = マスター画像、透過）

マスター画像の土台をそのまま 3D 化しない（開いた縁が 300 /1k を超え、つらら・枝・足跡が壊れる）。必ずこの器を作る。

```text
Draw ONE isolated 3D-ready miniature diorama base in the colours of ref-master.png, optimised for clean single-image 3D reconstruction.

Camera: a LOW three-quarter view, only about 20 degrees above the horizon, orthographic, so the tall side wall is clearly visible all around the front while the top surface is still visible.

Shape (most important):
- A TALL, thick round stone plinth, like a tall round cake: the side wall height is about ONE THIRD of the diameter.
- The side wall is {側面の石: natural dry-stone masonry / natural masonry of dark rough rocks and frozen earth}: 2 to 3 irregular courses of rounded {石の色} stones of DIFFERENT sizes and shapes, staggered like real stacked stones, with soft shallow joints. NOT a single row of identical tall slabs.
- The top surface is ONE perfectly flat, level plane of {上面の素材: grass / smooth fresh white snow}. NO steps, NO terraces, NO raised patches, NO sunken path, NO grooves.
- {小道など} exists ONLY as {色} COLOUR on that flat plane, with soft-edged colour boundaries.
- The {上面の素材} top meets the stone wall FLUSH at a crisp rounded edge. NO overhang, NO lip, NO fringe, NO hanging tufts.

Surface rules:
- Smooth matte clay surfaces with flat, clean colour fills and soft gradients only. NO dark strokes, NO specks, NO noise, NO {素材} texture lines, NO cracks.
- NOTHING stands on the top: no {マスターに描いた物を全部列挙}, people or animals.

Complete base fully visible and centered with generous margins.

TRUE TRANSPARENT RGBA background, with no backdrop, floor, cast shadow, contact shadow, text, labels or watermark. ONE object only. Square PNG.
```

変えてよいのは石の種類・色、上面の素材、小道の色、外形（丸・角丸の四角）だけ。次の 5 点は変えない: 低い視点 / 平らな上面 / 2〜3 段の積み石 / 面一の縁 / 上に何も置かない。
参照に渡すファイル名は `ref-master.png`（マスター画像をこの名前でコピーする）。前の土台画像は参照に渡さない（段差まで引き継がれる）。

## 3. 部品（KIND=part、参照 = マスター画像、透過、1 枚 1 部品）

```text
{部品の説明: "A small log cabin exactly like the one in the reference master: ..." のように、マスターのどの物か・形・色・付属物を 1〜3 文で}

Isolated single object for 3D reconstruction, stylised cosy toy-diorama style matching the reference master image ({マスターの光: warm evening light}, soft clay-like rounded forms). Draw it 3D-friendly: chunky solid volumes, {柔らかい素材: snow} as thick soft rounded masses (never thin flakes or wisps), no thin hairs, strands or tiny separate pieces, no floating parts; everything is one connected solid that sits flat on its own small footprint. Three-quarter view from slightly above, same camera angle as the master. Complete object fully visible and centred with generous margins. TRUE TRANSPARENT RGBA background, with no ground, {地面に当たる物: snow patch}, base, floor, cast shadow, contact shadow, text, labels or watermark. ONE object only. Square PNG.
```

- 細いもの（つらら・柵の横木など）は「thick」「chunky」と太さを指定する。細いままだと 3D 化で消える。
- 回す部分（羽根・水車）がある部品は、回転面が正面か斜め前を向き、建物本体から離れて見える向きで描かせる。`split_rotor.py` は「建物の外へ張り出した頂点」で回転部分を見つけるため。
- 部品ごとに別の資産フォルダを作る。同時に頼んでよい（`collect_image.py` がセッション別に回収する。2026-11-09）。

## 4. 背景（KIND=backdrop、参照 = マスター画像、不透明、縦長）

```text
A simple, calm sky backdrop rendered in the same soft stylised 3D-render look as the reference image (smooth, clean, gentle gradients; not a painting, no brush texture), for a cozy isometric toy-diorama of {world}. The sun sits low in the upper-left quarter as a soft glow. The upper half is an almost plain sky gradient with at most one or two soft out-of-focus clouds. The lower third is a soft sea of rounded 3D clouds catching the sunlight on their tops, slightly out of focus. No land, no mountains, no trees, no buildings, no island, no characters, no text. Low detail and low contrast so a diorama composited in the centre stands out. Portrait 2:3, full-bleed.
```

## 5. 島の下の雲（KIND=cloud、参照 = 4 で採用した背景、透過、横長）

```text
A single soft, fluffy cloud bank, wide and low, seen from the side, as an isolated element on a fully transparent background, for a cozy isometric toy-diorama illustration of {world}. A floating island will rest on top of it, so the top edge is a gentle row of rounded puffs and the bottom fades softly. Lit from above by the same light as the reference image: bright sun-lit tops in its colours, soft tinted shadows underneath (never grey or dirty). Soft hand-painted 3D-illustration style matching the reference. No island, no objects, no sky, no text. Landscape 3:2, the cloud spans about 90% of the width.
```

`{world}` は場所・季節・時間帯の 1 語句。4 と 5 で同じ語句を使う。
- 雪: `a snowy pine-forest mountain valley in warm golden evening light`
- 風車: `gentle pastoral wheat-field countryside on a clear sunny afternoon`

透過の雲は失敗しやすい（風車は 3 回目で成功）。市松模様が描き込まれた画像や白背景は不合格。

## 試して捨てたもの（背景）

- 遠景のある手描き背景: 3D の島と画材が分かれ、島が手前に浮いた。3D レンダー風の空で解消した。
- ノイズで作った雲: 灰色の煙に見えた。生成した雲は雲に見える。
- 周りの小島（土台の縮小コピー）は平たいコインに見え、3D に置いた雲の板は色がくすんだ。どちらも削除した。
