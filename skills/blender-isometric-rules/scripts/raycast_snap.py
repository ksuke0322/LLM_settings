"""不定形化した地形(岩場・地面等)の実際の表面高さへオブジェクトをスナップするヘルパー。

解析式(理想的な円錐台・平面等を仮定した数式)でZ座標を計算すると、
bmeshランダムオフセット+Displaceモディファイアで不定形化した実際のメッシュとの
ズレにより浮き/沈み込みが発生する(ルール: blender-isometric-rules SKILL.md 2章)。
必ずこの関数で実メッシュ表面をraycastして高さを取得すること。

使い方:
    hit_z = snap_to_surface(bpy.context, target_obj, x, y)
    if hit_z is not None:
        new_obj.location = (x, y, hit_z + embed_offset)
"""
import bpy
from mathutils import Vector


def snap_to_surface(context, target_obj, x, y, z_start=5.0, z_dir=(0, 0, -1)):
    """target_obj(地形等)の表面高さを (x, y) でraycastして取得する。

    target_obj自身がレイを遮ってしまう自己遮蔽を避けるため、
    target_objだけを一時的にhide_set(True)するのではなく、
    target_objをray_castの対象として明示的に指定する depsgraph 経由で評価する。
    target_obj以外のオブジェクトが (x, y) 上空を遮っている場合は
    一時的にhide_set(True)してから呼ぶこと。

    戻り値: ヒットしたワールドZ座標。ヒットしなければ None。
    """
    depsgraph = context.evaluated_depsgraph_get()
    origin = Vector((x, y, z_start))
    direction = Vector(z_dir).normalized()

    success, location, normal, index, hit_obj, matrix = context.scene.ray_cast(
        depsgraph, origin, direction
    )
    if not success:
        return None
    if target_obj is not None and hit_obj != target_obj:
        return None
    return location.z


def snap_objects_to_surface(context, target_obj, placements, embed_ratio=0.15):
    """placements: [(obj, x, y, size), ...] のリストを一括スナップする。

    embed_ratio: オブジェクトサイズに対する埋め込み比率(目安10〜20%)。
    target_objを一時的に隠して自己遮蔽を避けてから処理し、最後に表示状態を戻す。

    戻り値: [(obj, hit_z または None), ...]
    """
    was_hidden = target_obj.hide_get() if target_obj else False
    if target_obj is not None:
        target_obj.hide_set(True)

    results = []
    try:
        for obj, x, y, size in placements:
            hit_z = snap_to_surface(context, None, x, y)
            if hit_z is None:
                results.append((obj, None))
                continue
            obj.location.x = x
            obj.location.y = y
            obj.location.z = hit_z + size * embed_ratio
            results.append((obj, hit_z))
    finally:
        if target_obj is not None:
            target_obj.hide_set(was_hidden)

    return results


def verify_grounding(context, obj, target_obj, tolerance=0.01):
    """配置後の検証: objの底面Zとtarget_obj表面のヒット高さの差が許容誤差以内か確認する。

    戻り値: (ok: bool, diff: float)
    """
    bbox_world = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    bottom_z = min(v.z for v in bbox_world)
    x, y = obj.location.x, obj.location.y

    was_hidden = target_obj.hide_get()
    target_obj.hide_set(True)
    try:
        hit_z = snap_to_surface(context, None, x, y)
    finally:
        target_obj.hide_set(was_hidden)

    if hit_z is None:
        return False, float("inf")
    diff = abs(bottom_z - hit_z)
    return diff <= tolerance, diff
