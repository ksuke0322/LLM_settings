"""全アセット棚卸し(作り込みティア監査)。シーンを種類単位で機械列挙し、
仮マテリアル / プリミティブ直置き / 非接地 を検出する。手選択は不要。
使い方: Blender内で exec(open(path).read()); audit(ground_name="Ground_Grass")
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
    print(f"{'種類':<22}{'数':>3} {'材質':<11}{'作込':<5}{'接地':<5} 総合")
    fails = []
    for (prefix, mesh, mat), objs in sorted(groups.items()):
        rep = objs[0]
        mk = _mat_kind(rep.data.materials[0] if rep.data.materials else None)
        craft = _has_craft(rep) or len(rep.data.vertices) not in PRIM_VERTS
        grd = all(_grounded(o, ground) for o in objs)
        mat_ok = (mk == 'image') if prefix in polyhaven_kinds else (mk in ('image', 'procedural'))
        ok = mat_ok and craft and grd
        if not ok:
            fails.append((prefix, mk, craft, grd))
        print(f"{prefix:<22}{len(objs):>3} {mk:<11}{'OK' if craft else 'NG':<5}{'OK' if grd else 'NG':<5} {'PASS' if ok else 'FAIL'}")
    print("---")
    print("RESULT:", "PASS" if not fails else f"FAIL ({len(fails)} kinds)")
    for f in fails:
        print("  FAIL:", f[0], "mat=" + f[1], "craft=" + ("OK" if f[2] else "NG"), "grounded=" + ("OK" if f[3] else "NG"))
    return fails


audit()
