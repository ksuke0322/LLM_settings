"""小物(オール・装飾品・備品等)を主要構造物の実際の表面に取り付けるためのヘルパー。

事故: 解析的に仮定した寸法(「だいたいこの高さ」)で配置すると、
取り付け先の実際の表面とズレて刺さる/浮く(blender-isometric-rules SKILL.md 2章参照)。
必ず host.bound_box から実際のワールド座標を取得して基準にすること。
"""
from mathutils import Vector


def get_world_bbox(obj):
    """objのbound_boxをワールド座標のVectorリストとして返す(8頂点)。"""
    return [obj.matrix_world @ Vector(c) for c in obj.bound_box]


def get_top_z(obj):
    """objのワールドbound_boxの最大Z(取り付け面の基準として使う上端高さ)を返す。"""
    return max(v.z for v in get_world_bbox(obj))


def get_bottom_z(obj):
    """objのワールドbound_boxの最小Z(底面高さ)を返す。"""
    return min(v.z for v in get_world_bbox(obj))


def get_xy_extent(obj):
    """objのワールドbound_boxのXY範囲 (min_x, max_x, min_y, max_y) を返す。

    舷縁の幅・奥行き等、取り付け先の実寸を基準にオフセットを計算する際に使う。
    """
    bbox = get_world_bbox(obj)
    xs = [v.x for v in bbox]
    ys = [v.y for v in bbox]
    return min(xs), max(xs), min(ys), max(ys)


def attach_above(accessory_obj, host_obj, clearance=0.025, xy_offset=(0.0, 0.0)):
    """accessory_objをhost_objの実際の上端Z + clearanceの高さに配置する。

    xy_offset: host中心からのXYオフセット(取り付け位置の調整用)。
    """
    top_z = get_top_z(host_obj)
    accessory_obj.location.x = host_obj.location.x + xy_offset[0]
    accessory_obj.location.y = host_obj.location.y + xy_offset[1]
    accessory_obj.location.z = top_z + clearance
    return top_z


def verify_no_clip(accessory_obj, host_obj, min_clearance=0.0):
    """accessory_objの底面がhost_objの上端より上にあるか(刺さっていないか)を検証する。

    戻り値: (ok: bool, clearance: float)
    """
    accessory_bottom = get_bottom_z(accessory_obj)
    host_top = get_top_z(host_obj)
    clearance = accessory_bottom - host_top
    return clearance >= min_clearance, clearance
