# マテリアル別デファクタスタンダード早見表

対象の質感タイプがこの表に該当する場合、都度ゼロから設計せず、原則としてここに記載した実装を既定の第一候補とする(独自実装で置き換える場合は、既定実装で質感レンジ・視認性を満たせない具体的な理由をレビュー時に明記する)。

- 「採用済み/未採用」が固定するのは**技法(ノード構成・実装方式)**であって数値パラメータではない。具体的な数値はSKILL.md 3章「マテリアルの質感レンジ」の範囲内でテーマ・シーンごとに再設計してよい(例: 岩の色味は寒色グレーの灯台と別テーマでは異なって当然)。
- 「現状の実装」列は`lighthouse_v2.blend`/`lighthouse_cool2.blend`で既に確定済みの実装であり、**同一プロジェクト内**で新規パーツを追加する場合はゼロから再構築せず`material.copy()`で複製して使う(別プロジェクト・別テーマでは技法のみ踏襲し、複製はしない)。

| ジャンル | デファクタスタンダード実装 | 現状の実装/このプロジェクトでの状況 |
|---|---|---|
| 水面(静止〜軽い波) | Noise Texture(+Wave Texture併用可)→Bump/Displace。低ポリ面は必ずSubdivision Surfaceで細分化してからかける(エイリアシング対策、SKILL.md 3章「低ポリ平面へのBump/Noise」参照) | 採用済み(`Mat_Water`、Subdivision levels=2、Noise Scale 8.0、Bump強度0.3) |
| 水面反射・透明感 | Principled BSDFのTransmission+IOR≈1.33、Roughness 0.05〜0.2 | 採用済み |
| 波打ち際の泡・しぶき | 白色をFresnel/Noiseマスクでベースカラーにブレンド、またはGNスキャッターの小粒子 | 未採用(現状シンプルな水面マテリアルのみ。必要になった段階で導入) |
| 空(グラデーション) | Tex Coord(Generated)→Mapping→Gradient Texture→ColorRamp→Background | 採用済み(World node tree) |
| 空(雲・大気感) | Volume Scatter+Noise Texture(4D、W軸で時間駆動)、またはトイ調なら平板メッシュ+NoiseマスクのAlpha抜き | 未採用 |
| 星・キラキラ(夜空) | Voronoi Texture(Distance To Point)を閾値カットしEmissionへ | 未採用(未使用テーマ) |
| スペキュラの粒状キラキラ(水面ハイライト等) | Noise TextureでRoughnessに微細ムラ+高いSpecular、Fresnelマスクで部分的にEmission加算 | 未採用(検討候補) |
| 窓から差す光の筋(God Ray) | Volume Scatter、density目安0.01〜0.05(SKILL.md 5章参照) | 未採用(検討候補) |
| ガラス・光を通す外装(ランタン等) | Transmission=1・Roughness低め・IOR≈1.45が基本だが、内部発光を強く見せたい場合はAlpha Blend(`blend_method='BLEND'`)の半透明値0.3〜0.5の方が制御しやすい(SKILL.md 3章「光源を内包する外装パーツ」参照) | 採用済み(Alpha Blend方式、`Lantern_Glass`) |
| 布・旗のなびき | Cloth Modifier+Wind Force Field。ループ再生が必要ならBake後にCyclesモディファイア(F-Curve)でループ化 | 未使用テーマ |
| 布マテリアルの繊維感 | Principled BSDFのSheenパラメータ+微細Noise | 未使用テーマ |
| 石材・岩の個体感 | bmeshで複数の岩塊メッシュ(icosphereベースのランダム変形)を個別生成しJoin、Bump強度・ColorRampコントラストで境界を陰影表現(SKILL.md 3章「不定形・自然物パーツ」参照) | 採用済み(`Rock_Island`) |
| 密生した草・植生 | Geometry Nodes(Distribute Points on Faces→Instance on Points)、専用のHair/Particle System(Curves)も可 | 未採用(このプロジェクトでは非植生の岩・貝殻スキャッターのみ) |
| 苔・地衣類のムラ | AO入力をマスクにColorRamp経由で緑をMix(隙間に苔が乗る定番のDirtマスク手法) | 未採用 |
| 積雪 | 上向き法線(Normal Z成分)をマスクにしたColorRampで白マテリアルをMix | 未使用テーマ |
| 灯りの揺らぎ(小規模、シミュ不要) | Emission StrengthをNoise/Sineで軽く時間駆動(±5〜10%程度) | 未採用(SKILL.md 6章「Ambient Loop Animation」で今後導入予定) |
| 本格的な火・煙 | Mantaflow(Fire+Smoke Domain) | 未使用テーマ(ランタン規模の炎には過剰) |
| 本格的な液体の物理挙動 | Mantaflow(液体Domain) | 未使用テーマ(静止画・短尺isometric用途ではオーバースペックなことが多い) |
