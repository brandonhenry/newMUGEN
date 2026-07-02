import json
import math
import os
import re
import sys
from pathlib import Path
from mathutils import Matrix, Vector

import bpy

DEFAULT_HIDDEN_LEAF_DECIMATE_RATIO = 0.45
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tga", ".dds"}


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) not in {4, 6}:
        raise SystemExit(
            "Usage: blender --background [source.blend] --python scripts/blender-export-stage.py -- "
            "output.glb preview.png meta.json stage-id [source-path source-kind]"
        )

    output_path = Path(args[0])
    preview_path = Path(args[1])
    meta_path = Path(args[2])
    stage_id = args[3]
    source_path = Path(args[4]) if len(args) == 6 else Path(bpy.data.filepath) if bpy.data.filepath else None
    source_kind = args[5].lower() if len(args) == 6 else source_kind_for_path(source_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.parent.mkdir(parents=True, exist_ok=True)

    warnings = []
    if source_path and (source_kind != "blend" or not bpy.data.filepath):
        import_source_scene(source_path, source_kind, warnings)

    image_files = relink_local_images()
    normalize_material_nodes(image_files)
    prepare_scene_for_stage(stage_id)
    meshes = visible_meshes()
    if not meshes:
        raise SystemExit("No visible mesh objects found in the Blender scene.")

    optimize_stage_meshes(stage_id)
    meshes = visible_meshes()
    before_bounds = world_bounds(meshes)
    normalize_scene(stage_id, before_bounds)
    export_meshes = bake_visible_mesh_transforms()
    after_bounds = world_bounds(export_meshes)

    ensure_lighting(stage_id)
    render_preview(stage_id, after_bounds, preview_path)
    export_glb(output_path, export_meshes)

    meta = {
        "source": {
            "stageId": stage_id,
            "blenderVersion": bpy.app.version_string,
            "objectCount": len(bpy.context.scene.objects),
            "meshCount": len(visible_meshes()),
            "sourcePath": str(source_path) if source_path else None,
            "sourceKind": source_kind,
            "warnings": warnings,
            "boundsBeforeNormalize": bounds_payload(before_bounds),
            "boundsAfterNormalize": bounds_payload(after_bounds),
        },
        "bounds": game_bounds_payload(after_bounds),
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def source_kind_for_path(path):
    if not path:
        return "blend"
    suffix = path.suffix.lower()
    if path.name.lower().endswith(".mesh.ascii"):
        return "mesh"
    if suffix in {".pmx", ".pmd"}:
        return "mmd"
    return suffix[1:] if suffix.startswith(".") else suffix


def import_source_scene(source_path, source_kind, warnings):
    if not source_path.exists():
        raise SystemExit(f"Missing source file: {source_path}")

    clear_scene()
    source_kind = "mesh" if source_kind == "mesh.ascii" else source_kind
    if source_kind == "blend":
        bpy.ops.wm.open_mainfile(filepath=str(source_path))
    elif source_kind == "mmd":
        import_mmd_source(source_path)
    elif source_kind in {"xps", "mesh"}:
        import_xps_source(source_path)
    elif source_kind == "fbx":
        bpy.ops.import_scene.fbx(filepath=str(source_path))
    elif source_kind == "dae":
        bpy.ops.wm.collada_import(filepath=str(source_path))
    elif source_kind == "obj":
        import_obj_source(source_path)
    else:
        raise SystemExit(f"Unsupported source kind: {source_kind}")

    warnings.extend(clean_imported_scene(source_path, source_kind))
    bpy.context.view_layer.update()


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.armatures,
        bpy.data.lights,
        bpy.data.cameras,
    ):
        for datablock in list(collection):
            if datablock.users == 0:
                collection.remove(datablock)


def import_xps_source(source_path):
    operator_attempts = [
        ("xps_tools.import_model", {"filepath": str(source_path)}),
        ("import_scene.xps", {"filepath": str(source_path)}),
        ("import_scene.xnalara_model", {"filepath": str(source_path)}),
        ("import_scene.xnalara", {"filepath": str(source_path)}),
    ]
    errors = []
    for operator_name, kwargs in operator_attempts:
        op = resolve_operator(operator_name)
        if not op:
            continue
        try:
            result = op(**kwargs)
            if result != {"CANCELLED"}:
                return
        except Exception as error:
            errors.append(f"{operator_name}: {error}")

    details = "; ".join(errors) if errors else "no known XPS/XNALara Blender import operator is registered"
    raise SystemExit(
        "Could not import XPS/XNALara source. Install or enable Blender Extensions io-xnalara "
        f"or johnzero7/XNALaraMesh. Details: {details}"
    )


def import_mmd_source(source_path):
    operator_attempts = [
        ("mmd_tools.import_model", {"filepath": str(source_path), "scale": 1.0}),
        ("mmd_tools.import_model", {"filepath": str(source_path)}),
        ("import_scene.mmd", {"filepath": str(source_path)}),
        ("import_scene.pmx", {"filepath": str(source_path)}),
        ("import_scene.pmd", {"filepath": str(source_path)}),
    ]
    errors = []
    for operator_name, kwargs in operator_attempts:
        op = resolve_operator(operator_name)
        if not op:
            continue
        try:
            result = op(**kwargs)
            if result != {"CANCELLED"}:
                return
        except TypeError as error:
            errors.append(f"{operator_name}: {error}")
        except Exception as error:
            errors.append(f"{operator_name}: {error}")

    details = "; ".join(errors) if errors else "no known MMD Tools import operator is registered"
    raise SystemExit(
        "Could not import MMD source. Install or enable Blender Extensions MMD Tools "
        f"or MMD-Blender/blender_mmd_tools. Details: {details}"
    )


def resolve_operator(name):
    group_name, operator_name = name.split(".", 1)
    group = getattr(bpy.ops, group_name, None)
    if not group:
        return None
    return getattr(group, operator_name, None)


def import_obj_source(source_path):
    if hasattr(bpy.ops, "wm") and hasattr(bpy.ops.wm, "obj_import"):
        bpy.ops.wm.obj_import(filepath=str(source_path))
        return
    if hasattr(bpy.ops, "import_scene") and hasattr(bpy.ops.import_scene, "obj"):
        bpy.ops.import_scene.obj(filepath=str(source_path))
        return
    raise SystemExit("Could not import OBJ source; no Blender OBJ import operator is registered.")


def clean_imported_scene(source_path, source_kind):
    warnings = []
    for obj in bpy.context.scene.objects:
        if obj.type in {"CAMERA", "LIGHT", "ARMATURE", "EMPTY"}:
            obj.hide_render = True
        if source_kind == "mmd" and is_mmd_helper_object(obj):
            obj.hide_render = True
            obj.hide_viewport = True
    if not any(obj.type == "MESH" and obj.visible_get() and not obj.hide_render for obj in bpy.context.scene.objects):
        warnings.append(f"No visible mesh remained after importing {source_path.name}.")
    return warnings


def is_mmd_helper_object(obj):
    names = [obj.name.lower()]
    if obj.data:
        names.append(obj.data.name.lower())
    for collection in obj.users_collection:
        names.append(collection.name.lower())
    combined = " ".join(names)
    return any(
        token in combined
        for token in [
            "rigid",
            "joint",
            "physics",
            "temporary",
            "mmd_shadow",
        ]
    )


def visible_meshes():
    return [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.visible_get() and not obj.hide_render
    ]


def relink_local_images():
    env_root = os.environ.get("KORE_STAGE_SOURCE_ROOT")
    if env_root:
        source_root = Path(env_root)
    elif bpy.data.filepath:
        source_root = Path(bpy.data.filepath).parent
    else:
        source_root = Path(".")
    image_files = {}
    for path in source_root.rglob("*"):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            image_files.setdefault(path.name.lower(), path)
            image_files.setdefault(path.stem.lower(), path)
            if path.stem.lower().endswith(".dds"):
                image_files.setdefault(path.stem[:-4].lower(), path)

    for image in bpy.data.images:
        candidates = [
            Path(image.filepath).name if image.filepath else "",
            image.name,
            image.name.replace(".dds.png", ".png"),
        ]
        for candidate in candidates:
            local_path = image_files.get(candidate.lower())
            if local_path:
                image.filepath = str(local_path)
                image.reload()
                break
    return image_files


def normalize_material_nodes(image_files):
    for material in bpy.data.materials:
        image_path = texture_for_material(material.name, image_files)
        if not image_path:
            continue
        image = load_image(image_path)
        if not image:
            continue
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        output = nodes.new(type="ShaderNodeOutputMaterial")
        output.location = (420, 0)
        principled = nodes.new(type="ShaderNodeBsdfPrincipled")
        principled.location = (120, 0)
        texture = nodes.new(type="ShaderNodeTexImage")
        texture.location = (-220, 80)
        texture.image = image
        texture.extension = "REPEAT"
        links.new(texture.outputs["Color"], principled.inputs["Base Color"])
        if "Alpha" in texture.outputs and "Alpha" in principled.inputs:
            links.new(texture.outputs["Alpha"], principled.inputs["Alpha"])
            material.blend_method = "BLEND"
        if "Roughness" in principled.inputs:
            principled.inputs["Roughness"].default_value = 0.68
        links.new(principled.outputs["BSDF"], output.inputs["Surface"])


def texture_for_material(name, image_files):
    normalized = name.lower().split(".")[0]
    normalized = normalized.replace("_", "")
    candidates = [normalized]
    candidates.extend(re.findall(r"[0-9a-f]{8}", normalized))
    if "text" in normalized:
        candidates.append(normalized.replace("text", ""))
    if normalized.endswith("000"):
        candidates.append(normalized[:-1])
    if normalized.endswith("001"):
        candidates.append(normalized[:-1])
    if normalized.startswith("40floor"):
        candidates.append("floor")
    if normalized.startswith("40wall") or normalized.startswith("40walls"):
        candidates.append("wall")
    if normalized.startswith("40wood") or normalized.startswith("40doorframe"):
        candidates.append("wood1")
    if normalized.startswith("40steps"):
        candidates.append("steps")

    for candidate in list(candidates):
        candidates.extend([
            f"{candidate}.png",
            f"{candidate}.dds",
            f"{candidate}.dds.png",
        ])

    for candidate in candidates:
        path = image_files.get(candidate)
        if path:
            return path
    return None


def load_image(path):
    normalized = str(path)
    for image in bpy.data.images:
        if Path(bpy.path.abspath(image.filepath)).resolve() == path.resolve():
            return image
    try:
        return bpy.data.images.load(normalized, check_existing=True)
    except Exception:
        return None


def prepare_scene_for_stage(stage_id):
    if stage_id == "hidden-leaf-village":
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            name = obj.name.lower()
            mesh_name = obj.data.name.lower() if obj.data else ""
            dims = obj.dimensions
            max_dim = max(dims)
            center = object_center(obj)
            distance = math.sqrt(center.x * center.x + center.y * center.y)
            in_village_crop = -260 <= center.x <= 260 and -240 <= center.y <= 230
            hide = (
                "sky" in name
                or name.startswith("quad")
                or mesh_name.startswith("plane.")
                or name.startswith("naruto_room")
                or name.startswith("ki")
                or name.startswith("ha00")
                or "kusa" in name
                or name.startswith("plane01")
                or name.startswith("outer plains")
                or name.startswith("plains_")
                or name.endswith("_control")
                or max_dim > 1100
                or distance > 340
                or not in_village_crop
            )
            if hide:
                obj.hide_render = True
                obj.hide_viewport = True
    elif stage_id.startswith("naruto-apartment"):
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            name = obj.name.lower()
            if "ceiling" in name:
                obj.hide_render = True
                obj.hide_viewport = True
    else:
        hide_generic_stage_helpers()

    bpy.context.view_layer.update()


def hide_generic_stage_helpers():
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        names = [obj.name.lower()]
        if obj.data:
            names.append(obj.data.name.lower())
            if len(obj.data.materials) <= 2:
                for material in obj.data.materials:
                    if material:
                        names.append(material.name.lower())
        if any(is_generic_stage_helper_name(name) for name in names):
            obj.hide_render = True
            obj.hide_viewport = True


def is_generic_stage_helper_name(name):
    normalized = name.replace("-", "_").replace(" ", "_")
    return (
        "skybox" in normalized
        or normalized.startswith("sky_")
        or normalized.endswith("_sky")
        or "_sky_" in normalized
    )


def object_center(obj):
    bounds = object_world_bounds(obj)
    if bounds is None:
        return obj.matrix_world.translation
    return bounds["center"]


def world_bounds(objects):
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        bounds = object_world_bounds(obj)
        if bounds is None:
            continue
        mins.x = min(mins.x, bounds["min"].x)
        mins.y = min(mins.y, bounds["min"].y)
        mins.z = min(mins.z, bounds["min"].z)
        maxs.x = max(maxs.x, bounds["max"].x)
        maxs.y = max(maxs.y, bounds["max"].y)
        maxs.z = max(maxs.z, bounds["max"].z)
    if not math.isfinite(mins.x):
        raise SystemExit("No valid mesh vertex bounds found in the Blender scene.")
    center = (mins + maxs) * 0.5
    size = maxs - mins
    return {"min": mins, "max": maxs, "center": center, "size": size}


def object_world_bounds(obj):
    if obj.type != "MESH" or not obj.data.vertices:
        return None

    obj.data.update()
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for vertex in obj.data.vertices:
        world_vertex = obj.matrix_world @ vertex.co
        mins.x = min(mins.x, world_vertex.x)
        mins.y = min(mins.y, world_vertex.y)
        mins.z = min(mins.z, world_vertex.z)
        maxs.x = max(maxs.x, world_vertex.x)
        maxs.y = max(maxs.y, world_vertex.y)
        maxs.z = max(maxs.z, world_vertex.z)

    center = (mins + maxs) * 0.5
    size = maxs - mins
    return {"min": mins, "max": maxs, "center": center, "size": size}


def normalize_scene(stage_id, bounds):
    target = 72.0 if stage_id == "hidden-leaf-village" else 18.0
    footprint = max(bounds["size"].x, bounds["size"].y, 0.001)
    scale = target / footprint
    transform = (
        Matrix.Translation(Vector((-bounds["center"].x * scale, -bounds["center"].y * scale, -bounds["min"].z * scale)))
        @ Matrix.Diagonal((scale, scale, scale, 1.0))
    )

    for obj in visible_meshes():
        world_matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = transform @ world_matrix

    bpy.context.view_layer.update()


def bake_visible_mesh_transforms():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    export_collection = bpy.data.collections.new("KORE_export_stage")
    bpy.context.scene.collection.children.link(export_collection)
    source_objects = visible_meshes()
    baked_objects = []

    for obj in source_objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        mesh.transform(obj.matrix_world)
        mesh.update()
        if not mesh.materials and obj.data.materials:
            for material in obj.data.materials:
                mesh.materials.append(material)
        baked = bpy.data.objects.new(f"KORE_export_{obj.name}", mesh)
        baked.matrix_world = Matrix.Identity(4)
        baked.hide_render = False
        baked.hide_viewport = False
        export_collection.objects.link(baked)
        baked_objects.append(baked)

    for obj in source_objects:
        obj.hide_render = True
        obj.hide_viewport = True

    bpy.context.view_layer.update()
    return baked_objects


def optimize_stage_meshes(stage_id):
    if stage_id != "hidden-leaf-village":
        return
    remove_unneeded_material_slots()
    auto_retopology_stage_meshes(stage_id)
    decimate_stage_meshes(stage_id)


def remove_unneeded_material_slots():
    for obj in visible_meshes():
        if not obj.data.materials:
            continue
        used_slots = {poly.material_index for poly in obj.data.polygons}
        for index in range(len(obj.data.materials) - 1, -1, -1):
            if index not in used_slots:
                obj.data.materials.pop(index=index)


def auto_retopology_stage_meshes(stage_id):
    if stage_id != "hidden-leaf-village":
        return
    candidates = [
        obj
        for obj in visible_meshes()
        if should_quadriflow_retopology(obj)
    ]
    candidates.sort(key=lambda obj: len(obj.data.polygons), reverse=True)

    for obj in candidates[:28]:
        source_faces = len(obj.data.polygons)
        target_faces = max(450, min(2200, int(source_faces * 0.12)))
        materials = list(obj.data.materials)
        if obj.data.shape_keys:
            obj.shape_key_clear()
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.quadriflow_remesh(
                use_mesh_symmetry=False,
                use_preserve_sharp=True,
                use_preserve_boundary=True,
                preserve_attributes=True,
                smooth_normals=True,
                mode="FACES",
                target_faces=target_faces,
                seed=0,
            )
            if not obj.data.materials and materials:
                for material in materials:
                    obj.data.materials.append(material)
            print(f"KORE retopo quadriflow {obj.name}: {source_faces} -> {len(obj.data.polygons)} faces")
        except Exception as error:
            print(f"KORE retopo quadriflow failed for {obj.name}: {error}; decimate fallback will run")
        finally:
            obj.select_set(False)
    bpy.context.view_layer.update()


def should_quadriflow_retopology(obj):
    mode = os.environ.get("KORE_RETOPO_MODE", "off").lower()
    if mode in {"off", "false", "0"}:
        return False
    faces = len(obj.data.polygons)
    if faces < 6500:
        return False
    if mode in {"force", "forced", "all"}:
        return True
    if has_image_texture_material(obj):
        return False
    return True


def has_image_texture_material(obj):
    for material in obj.data.materials:
        if not material:
            continue
        if material.use_nodes and material.node_tree:
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE":
                    return True
        if material.name.lower().startswith("sa00") and "text" in material.name.lower():
            return True
    return False


def decimate_stage_meshes(stage_id):
    if stage_id != "hidden-leaf-village":
        return
    mode = os.environ.get("KORE_DECIMATE_MODE", "safe").lower()
    if mode in {"off", "false", "0", "none"}:
        return
    try:
        ratio = float(os.environ.get("KORE_DECIMATE_RATIO", str(DEFAULT_HIDDEN_LEAF_DECIMATE_RATIO)))
    except ValueError:
        ratio = DEFAULT_HIDDEN_LEAF_DECIMATE_RATIO
    ratio = max(0.04, min(0.85, ratio))
    for obj in visible_meshes():
        if len(obj.data.polygons) < 900:
            continue
        before_bounds = object_world_bounds(obj)
        if before_bounds is None:
            continue
        before_mesh = obj.data.copy()
        if obj.data.shape_keys:
            obj.shape_key_clear()
        modifier = obj.modifiers.new("KORE_runtime_decimate", "DECIMATE")
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            after_bounds = object_world_bounds(obj)
            if not decimation_bounds_are_valid(before_bounds, after_bounds):
                bad_mesh = obj.data
                obj.data = before_mesh
                bpy.data.meshes.remove(bad_mesh)
                print(f"KORE decimate reverted {obj.name}: bounds expanded outside safe limits")
            else:
                bpy.data.meshes.remove(before_mesh)
        except Exception:
            obj.modifiers.remove(modifier)
            bpy.data.meshes.remove(before_mesh)
        finally:
            obj.select_set(False)
    bpy.context.view_layer.update()


def decimation_bounds_are_valid(before_bounds, after_bounds):
    if after_bounds is None:
        return False
    before_size = before_bounds["size"]
    after_size = after_bounds["size"]
    before_max = max(before_size.x, before_size.y, before_size.z, 0.001)
    after_max = max(after_size.x, after_size.y, after_size.z)
    center_shift = (after_bounds["center"] - before_bounds["center"]).length
    return after_max <= before_max * 1.35 and center_shift <= before_max * 0.25


def ensure_lighting(stage_id):
    if not any(obj.type == "LIGHT" for obj in bpy.context.scene.objects):
        if stage_id == "hidden-leaf-village":
            add_sun("KORE_preview_sun", rotation=(math.radians(42), 0, math.radians(-35)), energy=3.2)
            add_area("KORE_preview_fill", location=(-8, -10, 14), energy=420, size=22)
        else:
            add_area("KORE_preview_key", location=(-5, -6, 7), energy=520, size=7)
            add_area("KORE_preview_fill", location=(5, 4, 5), energy=120, size=8)

    world = bpy.context.scene.world or bpy.data.worlds.new("KORE_preview_world")
    bpy.context.scene.world = world
    world.color = (0.66, 0.82, 1.0) if stage_id == "hidden-leaf-village" else (0.09, 0.075, 0.065)


def add_sun(name, rotation, energy):
    light_data = bpy.data.lights.new(name, type="SUN")
    light_data.energy = energy
    light = bpy.data.objects.new(name, light_data)
    light.rotation_euler = rotation
    bpy.context.collection.objects.link(light)


def add_area(name, location, energy, size):
    light_data = bpy.data.lights.new(name, type="AREA")
    light_data.energy = energy
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    light.location = location
    bpy.context.collection.objects.link(light)


def render_preview(stage_id, bounds, preview_path):
    scene = bpy.context.scene
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1

    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
        scene.eevee.taa_render_samples = 64
    except Exception:
        scene.render.engine = "BLENDER_WORKBENCH"

    camera = bpy.data.objects.new("KORE_preview_camera", bpy.data.cameras.new("KORE_preview_camera"))
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    center = bounds["center"]
    footprint = max(bounds["size"].x, bounds["size"].y, 1.0)
    height = max(bounds["size"].z, 2.0)
    if stage_id == "hidden-leaf-village":
        location = center + Vector((footprint * 0.28, -footprint * 0.72, height * 0.92 + 16.0))
        target = Vector((center.x, center.y, bounds["min"].z + height * 0.26))
        camera.data.lens = 24
    else:
        location = center + Vector((footprint * 0.22, -footprint * 0.76, height * 0.86 + 3.4))
        target = Vector((center.x, center.y, bounds["min"].z + height * 0.34))
        camera.data.lens = 22

    camera.location = location
    look_at(camera, target)
    camera.data.clip_end = max(1000.0, footprint * 8.0)
    camera.data.angle = math.radians(48)

    scene.render.filepath = str(preview_path)
    bpy.ops.render.render(write_still=True)


def look_at(obj, target):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def export_glb(output_path, export_objects=None):
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    export_objects = export_objects or visible_meshes()
    if not export_objects:
        raise SystemExit("No visible mesh objects selected for glTF export.")
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = export_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def bounds_payload(bounds):
    return {
        "min": vector_payload(bounds["min"]),
        "max": vector_payload(bounds["max"]),
        "center": vector_payload(bounds["center"]),
        "size": vector_payload(bounds["size"]),
    }


def game_bounds_payload(bounds):
    size = bounds["size"]
    center = bounds["center"]
    radius = math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z) * 0.5
    return {
        "center": [round(center.x, 4), round(center.z, 4), round(-center.y, 4)],
        "size": [round(size.x, 4), round(size.z, 4), round(size.y, 4)],
        "radius": round(radius, 4),
    }


def vector_payload(vector):
    return [round(vector.x, 4), round(vector.y, 4), round(vector.z, 4)]


if __name__ == "__main__":
    main()
