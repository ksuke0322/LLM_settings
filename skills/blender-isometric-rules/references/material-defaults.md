# マテリアル別デファクタスタンダード早見表

対象の質感タイプがこの表に該当する場合、都度ゼロから設計せず、原則としてここに記載した実装を既定の第一候補とする(独自実装で置き換える場合は、既定実装で質感レンジ・視認性を満たせない具体的な理由をレビュー時に明記する)。

- 固定するのは**技法(ノード構成・実装方式)**であって数値パラメータではない。具体的な数値はSKILL.md 3章「マテリアルの質感レンジ」の範囲内でテーマ・シーンごとに再設計してよい(例: 岩の色味は寒色グレーの灯台と別テーマでは異なって当然)。
- **同一プロジェクト内**で新規パーツを追加する場合は、既に確定済みのマテリアルをゼロから再構築せず`material.copy()`で複製して使う(別プロジェクト・別テーマでは技法のみ踏襲し、複製はしない)。

| ジャンル | デファクタスタンダード実装 |
|---|---|
| 水面(静止〜軽い波) | Noise Texture(+Wave Texture併用可)→Bump/Displace。低ポリ面は必ずSubdivision Surfaceで細分化してからかける(エイリアシング対策、SKILL.md 3章「低ポリ平面へのBump/Noise」参照) |
| 水面反射・透明感 | Principled BSDFのTransmission+IOR≈1.33、Roughness 0.05〜0.2 |
| 空(グラデーション) | Tex Coord(Generated)→Mapping→Gradient Texture→ColorRamp→Background |
| ガラス・光を通す外装(ランタン等) | Transmission=1・Roughness低め・IOR≈1.45が基本だが、内部発光を強く見せたい場合はAlpha Blend(`blend_method='BLEND'`)の半透明値0.3〜0.5の方が制御しやすい(SKILL.md 3章「光源を内包する外装パーツ」参照) |
| 石材・岩の個体感 | bmeshで複数の岩塊メッシュ(icosphereベースのランダム変形)を個別生成しJoin、Bump強度・ColorRampコントラストで境界を陰影表現(SKILL.md 3章「不定形・自然物パーツ」参照) |
| 灯りの揺らぎ(小規模、シミュ不要) | Emission StrengthをNoise/Sineで軽く時間駆動(±5〜10%程度、SKILL.md 6章「Ambient Loop Animation」参照) |

## 未採用ジャンル(必要になった段階で標準ノード構成を検討する)

以下は現状のテーマで未使用。直面した時点で定番技法を調べて追加する(先回りでカタログ化しない):

- 泡・しぶき、雲・大気感、星・キラキラ、スペキュラ粒状ハイライト、God Ray(Volume Scatter)、布・旗のなびき(Cloth Modifier)と繊維感(Sheen)、密生植生(GN scatter)、苔・地衣類(AOマスク)、積雪(法線Zマスク)、本格的な火・煙・液体(Mantaflow)。
- Mantaflow系(火・煙・液体)は静止画〜短尺isometric用途ではオーバースペックなことが多い点に留意する。
