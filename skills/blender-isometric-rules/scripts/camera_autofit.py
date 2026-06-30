"""カメラ画角の自動フィットヘルパー(blender-isometric-rules SKILL.md 4章)。

カメラのortho_scale/位置を固定の決め打ち値にせず、対象オブジェクト群の
ワールドbounding boxをカメラのright/up軸へ投影して必要半幅・半高から算出する。
"""
from mathutils import Vector


def get_world_bbox_corners(objs):
    """複数オブジェクトの全bound_box頂点をワールド座標で集める。"""
    corners = []
    for obj in objs:
        if obj.type != "MESH" or obj.hide_get():
            continue
        corners.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
    return corners


def autofit_ortho_camera(camera_obj, objs, aspect_ratio=16 / 9, margin=1.15):
    """camera_objのortho_scaleと位置を、objs全体が収まるように自動算出する。

    camera_objの視線方向(matrix_world)は変更せず、right/up軸への投影のみで
    必要なortho_scaleを計算し、bounding boxの中心を見続けるよう位置を再配置する。
    """
    corners = get_world_bbox_corners(objs)
    if not corners:
        return None

    cam_matrix = camera_obj.matrix_world
    right = (cam_matrix.to_3x3() @ Vector((1, 0, 0))).normalized()
    up = (cam_matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
    forward = (cam_matrix.to_3x3() @ Vector((0, 0, -1))).normalized()

    center = sum(corners, Vector((0, 0, 0))) / len(corners)

    half_width = max(abs((c - center).dot(right)) for c in corners)
    half_height = max(abs((c - center).dot(up)) for c in corners)

    half_width *= margin
    half_height *= margin

    # ortho_scaleはカメラ縦方向の幅として解釈されるため、アスペクト比を考慮し
    # 縦・横どちらの制約がきついかを比較して大きい方を採用する。
    ortho_scale = max(half_height * 2, half_width * 2 / aspect_ratio)

    camera_obj.data.ortho_scale = ortho_scale

    distance = (camera_obj.location - center).length or 10.0
    camera_obj.location = center - forward * distance

    return ortho_scale
