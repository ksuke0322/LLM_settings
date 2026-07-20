"""全アセット棚卸し(作り込みティア監査)。シーンを種類単位で機械列挙し、
仮マテリアル / 非接地 を検出する。手選択は不要。
使い方: Blender内で exec(open(path).read()); audit(ground_name="Ground_Grass")

ブロッキング判定は material(仮マテリアル検出) と 接地 のみ。
作り込み(craft)は「素のprimitiveのまま放置していないか」を機械的に拾う *助言* であり、
PASS/FAILでブロックしない。作り込み品質(署名パーツが意図通りに実現されているか、
背景小物がそのクラスに読めるか)の合否は独立サブエージェントレビュー(ステップ8B: 物理的妥当性 /
ステップ8C: 仕様実現)で判定する。機械ゲートのPASSを「見た目OK」と読み替えないこと。
"""
import bpy

CRAFT_MODS = {'BEVEL', 'SUBSURF', 'DISPLACE', 'SOLIDIFY', 'BOOLEAN', 'NODES', 'ARRAY'}
PRIM_VERTS = {8, 32, 64, 96, 42, 12, 16, 24, 48}  # 素のprimitive頂点数の目安


def _mat_kind(mat):
    if not mat or not mat.use_nodes:
        return 'none'
    types = {n.type for n in mat.node_tree.nodes}
    if 'TEX_IMAGE' in types:
        return 'image'
    if types & {'TEX_NOISE', 'TEX_VORONOI', 'VALTORGB', 'TEX_WAVE', 'TEX_MUSGRAVE', 'BUMP'}:
        return 'procedural'
    return 'placeholder'


def _base_color_suspect(mat):
    """助言: Principled BSDFのBase Colorが既定グレー(~0.8)のまま未接続なら「色を設定し忘れ」の疑い。
    (背景ディテールが白いまま出た事故の機械側バックストップ。ブロッキングにはしない。)"""
    if not mat or not mat.use_nodes or not mat.node_tree:
        return False
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        return False
    bc = bsdf.inputs.get('Base Color')
    if not bc or bc.is_linked:
        return False
    r, g, b = bc.default_value[0], bc.default_value[1], bc.default_value[2]
    return all(abs(v - 0.8) < 0.02 for v in (r, g, b))


def _has_craft(o):
    return any(m.type in CRAFT_MODS for m in o.modifiers)


def _is_gn_host(o):
    # GNスキャッターのホスト面: NODESモディファイア有り かつ 自前マテリアル無し(不可視の分布面。アセットではない)
    has_mat = bool(o.data.materials) and any(o.data.materials)
    return any(m.type == 'NODES' for m in o.modifiers) and not has_mat


def _group_key(o):
    mat = o.data.materials[0].name if (o.type == 'MESH' and o.data.materials) else '-'
    prefix = o.name.split('.')[0].rstrip('0123456789_')
    return (prefix, o.data.name.split('.')[0] if o.type == 'MESH' else o.type, mat)


def _grounded(o, ground):
    if not ground:
        return True
    bb = [o.matrix_world @ v.co for v in o.data.vertices] if o.type == 'MESH' else None
    if not bb:
        return True
    zmin = min(v.z for v in bb)
    if zmin > 0.35:  # 高所/付属パーツ(屋根・窓・アーチ石・木の葉・散布元z=50等)は地面接地の対象外
        return True
    dg = bpy.context.evaluated_depsgraph_get()
    cx = sum(v.x for v in bb) / len(bb)
    cy = sum(v.y for v in bb) / len(bb)
    ok, loc, *_ = bpy.context.scene.ray_cast(dg, (cx, cy, zmin + 1.0), (0, 0, -1), distance=5.0)
    if not ok:
        return True
    return (zmin - loc.z) < 0.08  # 地面より8cm以上浮いていたらNG。めり込み(zmin<地面)はOK


def audit(ground_name="Ground_Grass", polyhaven_kinds=None):
    ground = bpy.data.objects.get(ground_name)
    polyhaven_kinds = polyhaven_kinds or set()
    groups = {}
    for o in bpy.context.scene.objects:
        if o.type not in ('MESH',):
            continue
        if o is ground:
            continue
        if o.hide_render:            # 最終非表示の寸法プロキシ等はアセット対象外
            continue
        if _is_gn_host(o):           # GN散布ホスト面(不可視の分布面)はアセット対象外
            continue
        groups.setdefault(_group_key(o), []).append(o)
    print("ブロッキング判定: material / 接地 のみ。作り込み(craft)・色(color)は助言。")
    print("作り込み品質の合否はステップ8B(物理的妥当性)・8C(署名パーツの仕様実現)で判定する。")
    print(f"{'種類':<22}{'数':>3} {'材質':<11}{'接地':<5}{'作込(助言)':<11}{'色(助言)':<9} 総合")
    fails = []
    advisories = []
    for (prefix, mesh, mat), objs in sorted(groups.items()):
        rep = objs[0]
        mk = _mat_kind(rep.data.materials[0] if rep.data.materials else None)
        craft = _has_craft(rep) or len(rep.data.vertices) not in PRIM_VERTS
        grd = all(_grounded(o, ground) for o in objs)
        color_suspect = any(_base_color_suspect(m) for o in objs for m in o.data.materials if m)
        mat_ok = (mk == 'image') if prefix in polyhaven_kinds else (mk in ('image', 'procedural'))
        ok = mat_ok and grd          # ブロッキングは material と 接地 のみ
        if not ok:
            fails.append((prefix, mk, grd))
        if not craft:
            advisories.append((prefix, 'craft', '素のprimitive相当(作り込み手法が見当たらない)'))
        if color_suspect:
            advisories.append((prefix, 'color', 'Base Colorが既定グレーのまま未接続(色の設定忘れ疑い)'))
        print(f"{prefix:<22}{len(objs):>3} {mk:<11}"
              f"{'OK' if grd else 'NG':<5}"
              f"{'OK' if craft else 'WARN':<11}"
              f"{'OK' if not color_suspect else 'WARN':<9} {'PASS' if ok else 'FAIL'}")
    print("---")
    print("RESULT:", "PASS" if not fails else f"FAIL ({len(fails)} kinds)")
    for f in fails:
        print("  FAIL:", f[0], "mat=" + f[1], "grounded=" + ("OK" if f[2] else "NG"))
    for a in advisories:
        print(f"  WARN[{a[1]}]:", a[0], "-", a[2])
    if advisories:
        print("  (WARNは機械側の助言。最終的な作り込み品質は8B/8Cの独立レビューで判定する。)")
    return fails


audit()
