"""背景ディテール用Geometry Nodesスキャッター構築ヘルパー(blender-isometric-rules SKILL.md 2章)。

既定手法: Distribute Points on Faces(Poisson Disk) + Instance on Points + Collection Info。
複数の配置面(例: 岩場上面/水面)がある場合は面ごとに別ブランチを作り、
最後にJoin Geometryで合成する。Position/Normalベースの面選択を使う場合は
Subdivide Meshで入力メッシュを十分に細分化してから渡すこと(単一の大きな面では
Selectionが面単位で一括評価され、空間的な絞り込みが機能しない)。

このモジュールはノードグラフを直接構築するため、ノード検索は名前ではなく
bl_idname/node.typeで行う(日本語環境ではノード名がローカライズされる)。
"""
import bpy


def build_scatter_branch(node_tree, source_obj_socket, asset_collection, *,
                          subdivide_level=6, distance_min=0.3, density_max=50.0,
                          selection_node_builder=None):
    """1つの配置面(ソースオブジェクト)に対する散布ブランチを構築し、出力ジオメトリソケットを返す。

    selection_node_builder: (node_tree) -> 出力ソケット を返す関数。
        Normal/Position/距離条件等のSelectionマスクを組み立てるための差し替え用。
        Noneの場合はSelection未設定(全面に散布)。
    """
    obj_info = node_tree.nodes.new("GeometryNodeObjectInfo")
    obj_info.transform_space = "RELATIVE"

    subdivide = node_tree.nodes.new("GeometryNodeSubdivideMesh")
    subdivide.inputs["Level"].default_value = subdivide_level
    node_tree.links.new(obj_info.outputs["Geometry"], subdivide.inputs["Mesh"])

    distribute = node_tree.nodes.new("GeometryNodeDistributePointsOnFaces")
    distribute.distribute_method = "POISSON"
    node_tree.links.new(subdivide.outputs["Mesh"], distribute.inputs["Mesh"])
    distribute.inputs["Distance Min"].default_value = distance_min
    distribute.inputs["Density Max"].default_value = density_max

    if selection_node_builder is not None:
        selection_output = selection_node_builder(node_tree)
        node_tree.links.new(selection_output, distribute.inputs["Selection"])

    collection_info = node_tree.nodes.new("GeometryNodeCollectionInfo")
    collection_info.inputs["Collection"].default_value = asset_collection
    collection_info.inputs["Separate Children"].default_value = True
    collection_info.inputs["Reset Children"].default_value = True

    instance = node_tree.nodes.new("GeometryNodeInstanceOnPoints")
    node_tree.links.new(distribute.outputs["Points"], instance.inputs["Points"])
    node_tree.links.new(collection_info.outputs["Instances"], instance.inputs["Instance"])
    instance.inputs["Pick Instance"].default_value = True

    return obj_info, instance.outputs["Instances"]


def build_normal_z_selection(node_tree, threshold=0.95):
    """Normal.z > threshold を満たす面のみ選択するSelectionノード群を構築する。

    岩場上面(平面部のみ)に小石・貝殻・潮だまりを配置する用途で使う。
    """
    normal = node_tree.nodes.new("GeometryNodeInputNormal")
    separate = node_tree.nodes.new("ShaderNodeSeparateXYZ")
    node_tree.links.new(normal.outputs["Normal"], separate.inputs["Vector"])

    compare = node_tree.nodes.new("FunctionNodeCompare")
    compare.data_type = "FLOAT"
    compare.operation = "GREATER_THAN"
    compare.inputs[1].default_value = threshold
    node_tree.links.new(separate.outputs["Z"], compare.inputs[0])

    return compare.outputs["Result"]


def build_radius_band_selection(node_tree, center, min_radius, max_radius):
    """中心(center)からの距離が[min_radius, max_radius]の範囲を選択するSelectionノード群を構築する。

    水面の岸辺バンド(藻類・漂流木等)に使う。Subdivideしたメッシュに対して使うこと
    (単一の大きな面のままだと面単位で一括True/Falseになり機能しない)。
    """
    position = node_tree.nodes.new("GeometryNodeInputPosition")

    center_node = node_tree.nodes.new("FunctionNodeInputVector")
    center_node.vector = center

    delta = node_tree.nodes.new("ShaderNodeVectorMath")
    delta.operation = "SUBTRACT"
    node_tree.links.new(position.outputs["Position"], delta.inputs[0])
    node_tree.links.new(center_node.outputs["Vector"], delta.inputs[1])

    length = node_tree.nodes.new("ShaderNodeVectorMath")
    length.operation = "LENGTH"
    node_tree.links.new(delta.outputs["Vector"], length.inputs[0])

    cmp_min = node_tree.nodes.new("FunctionNodeCompare")
    cmp_min.data_type = "FLOAT"
    cmp_min.operation = "GREATER_THAN"
    cmp_min.inputs[1].default_value = min_radius
    node_tree.links.new(length.outputs["Value"], cmp_min.inputs[0])

    cmp_max = node_tree.nodes.new("FunctionNodeCompare")
    cmp_max.data_type = "FLOAT"
    cmp_max.operation = "LESS_THAN"
    cmp_max.inputs[1].default_value = max_radius
    node_tree.links.new(length.outputs["Value"], cmp_max.inputs[0])

    band_and = node_tree.nodes.new("FunctionNodeBooleanMath")
    band_and.operation = "AND"
    node_tree.links.new(cmp_min.outputs["Result"], band_and.inputs[0])
    node_tree.links.new(cmp_max.outputs["Result"], band_and.inputs[1])

    return band_and.outputs["Boolean"]


def add_exclusion_zone(node_tree, base_selection, exclude_x_abs, exclude_y_min, exclude_y_max):
    """新規構造物(桟橋等)のfootprintを除外する矩形ゾーンを既存Selectionに合成する。

    除外矩形: |X| < exclude_x_abs かつ exclude_y_min <= Y <= exclude_y_max。
    NOT(除外フラグ) を base_selection とANDして返す。
    """
    position = node_tree.nodes.new("GeometryNodeInputPosition")
    separate = node_tree.nodes.new("ShaderNodeSeparateXYZ")
    node_tree.links.new(position.outputs["Position"], separate.inputs["Vector"])

    abs_x = node_tree.nodes.new("ShaderNodeMath")
    abs_x.operation = "ABSOLUTE"
    node_tree.links.new(separate.outputs["X"], abs_x.inputs[0])

    cmp_x = node_tree.nodes.new("FunctionNodeCompare")
    cmp_x.data_type = "FLOAT"
    cmp_x.operation = "LESS_THAN"
    cmp_x.inputs[1].default_value = exclude_x_abs
    node_tree.links.new(abs_x.outputs["Value"], cmp_x.inputs[0])

    cmp_y_min = node_tree.nodes.new("FunctionNodeCompare")
    cmp_y_min.data_type = "FLOAT"
    cmp_y_min.operation = "GREATER_EQUAL"
    cmp_y_min.inputs[1].default_value = exclude_y_min
    node_tree.links.new(separate.outputs["Y"], cmp_y_min.inputs[0])

    cmp_y_max = node_tree.nodes.new("FunctionNodeCompare")
    cmp_y_max.data_type = "FLOAT"
    cmp_y_max.operation = "LESS_EQUAL"
    cmp_y_max.inputs[1].default_value = exclude_y_max
    node_tree.links.new(separate.outputs["Y"], cmp_y_max.inputs[0])

    exclude_flag = node_tree.nodes.new("FunctionNodeBooleanMath")
    exclude_flag.operation = "AND"
    node_tree.links.new(cmp_x.outputs["Result"], exclude_flag.inputs[0])

    y_and = node_tree.nodes.new("FunctionNodeBooleanMath")
    y_and.operation = "AND"
    node_tree.links.new(cmp_y_min.outputs["Result"], y_and.inputs[0])
    node_tree.links.new(cmp_y_max.outputs["Result"], y_and.inputs[1])
    node_tree.links.new(y_and.outputs["Boolean"], exclude_flag.inputs[1])

    not_exclude = node_tree.nodes.new("FunctionNodeBooleanMath")
    not_exclude.operation = "NOT"
    node_tree.links.new(exclude_flag.outputs["Boolean"], not_exclude.inputs[0])

    final_and = node_tree.nodes.new("FunctionNodeBooleanMath")
    final_and.operation = "AND"
    node_tree.links.new(base_selection, final_and.inputs[0])
    node_tree.links.new(not_exclude.outputs["Boolean"], final_and.inputs[1])

    return final_and.outputs["Boolean"]


def count_visible_from_camera(scene, depsgraph, camera_obj, detail_objs, occluder_objs):
    """各背景ディテールがカメラから視認可能か(occluder_objsに遮蔽されていないか)をray_castで確認する。

    戻り値: visible_count, [(obj, visible: bool), ...]
    """
    results = []
    cam_pos = camera_obj.matrix_world.translation
    for obj in detail_objs:
        target = obj.matrix_world.translation
        direction = (target - cam_pos).normalized()
        distance = (target - cam_pos).length
        success, location, normal, index, hit_obj, matrix = scene.ray_cast(
            depsgraph, cam_pos, direction, distance=distance - 0.01
        )
        blocked = success and hit_obj in occluder_objs
        results.append((obj, not blocked))
    visible_count = sum(1 for _, v in results if v)
    return visible_count, results
