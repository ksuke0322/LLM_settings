"""animation_data_clear()の二重呼び出し事故を防ぐための安全なキーフレームヘルパー。

事故: 落下アニメーション用ヘルパーと非表示キーフレーム用ヘルパーをそれぞれ独立に
animation_data_clear()を呼ぶ実装にすると、後から呼んだ関数が先に設定した
別種類のキーフレームを消してしまう(blender-isometric-rules SKILL.md 7章参照)。

対策: animation_data_clear()はオブジェクトごとに最初の1回のみ呼ぶ。
このモジュールの関数はすべて ensure_anim() を経由し、既存のaction/animation_dataが
あれば一切クリアせずに再利用する。
"""
import bpy


def ensure_anim(obj):
    """objにanimation_data/actionが無ければ作成する。既存のものは絶対にクリアしない。

    複数のヘルパー(drop, hide, scale成長等)を同一オブジェクトに適用する場合、
    必ず最初にこの関数だけを呼んでアニメーション領域を確保し、
    各ヘルパー内ではこの関数以外でanimation_data_clear()を呼ばないこと。
    """
    if obj.animation_data is None:
        obj.animation_data_create()
    if obj.animation_data.action is None:
        action = bpy.data.actions.new(name=f"{obj.name}_Action")
        obj.animation_data.action = action
    return obj.animation_data.action


def reset_anim(obj):
    """明示的に「ゼロから作り直す」場合のみ使う、唯一許可されたクリア経路。

    クール間引き継ぎ(ルールR)で前段のアニメーションを完全に削除する場合等、
    意図的に全クリアしたいときだけ呼ぶ。通常の追加キーフレーム設定では使わない。
    """
    obj.animation_data_clear()
    ensure_anim(obj)


def set_hide_keyframes_safe(obj, hide_until_frame, scene_end_frame=None):
    """指定フレームまでhide_viewport/hide_renderをTrue、以降Falseに設定する(CONSTANT補間)。

    既存のアニメーション(drop/growth等)をクリアしない。
    """
    ensure_anim(obj)

    obj.hide_viewport = True
    obj.hide_render = True
    obj.keyframe_insert(data_path="hide_viewport", frame=1)
    obj.keyframe_insert(data_path="hide_render", frame=1)

    obj.hide_viewport = False
    obj.hide_render = False
    obj.keyframe_insert(data_path="hide_viewport", frame=hide_until_frame)
    obj.keyframe_insert(data_path="hide_render", frame=hide_until_frame)

    for fc in obj.animation_data.action.fcurves:
        if fc.data_path in ("hide_viewport", "hide_render"):
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"


def animate_drop_safe(obj, start_frame, end_frame, target_location, drop_height=2.0):
    """上空から最終位置へ落下させるアニメーションを追加する(既存アニメーションはクリアしない)。

    回転・スケールは変更しない。BEZIER補間。
    """
    ensure_anim(obj)

    start_loc = (target_location[0], target_location[1], target_location[2] + drop_height)
    obj.location = start_loc
    obj.keyframe_insert(data_path="location", frame=start_frame)

    obj.location = target_location
    obj.keyframe_insert(data_path="location", frame=end_frame)

    for fc in obj.animation_data.action.fcurves:
        if fc.data_path == "location":
            for kp in fc.keyframe_points:
                if start_frame <= kp.co.x <= end_frame:
                    kp.interpolation = "BEZIER"


def animate_grow_safe(obj, start_frame, end_frame, final_scale_z, base_location_z, start_scale_z=0.04):
    """下から生えるように scale.z を成長させ、底面が地面に固定されたまま伸びるようにする。

    location.zをscale.zに連動させ、底面のワールド座標を固定する。既存アニメーションはクリアしない。
    """
    ensure_anim(obj)

    obj.scale.z = start_scale_z
    obj.location.z = base_location_z
    obj.keyframe_insert(data_path="scale", frame=start_frame)
    obj.keyframe_insert(data_path="location", frame=start_frame)

    obj.scale.z = final_scale_z
    obj.location.z = base_location_z
    obj.keyframe_insert(data_path="scale", frame=end_frame)
    obj.keyframe_insert(data_path="location", frame=end_frame)

    for fc in obj.animation_data.action.fcurves:
        if fc.data_path in ("scale", "location"):
            for kp in fc.keyframe_points:
                if start_frame <= kp.co.x <= end_frame:
                    kp.interpolation = "BEZIER"


def verify_keyframes(obj, frame, data_path):
    """fcurve.evaluate(frame)で値を検証する(scene.frame_set()直後の直接読み取りは使わない)。"""
    if obj.animation_data is None or obj.animation_data.action is None:
        return None
    for fc in obj.animation_data.action.fcurves:
        if fc.data_path == data_path:
            return fc.evaluate(frame)
    return None
