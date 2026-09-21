"""Interactive 3D Rack Twin — original simplified XE7745 exterior, not Dell CAD.

Run in Blender's Text Editor or via generate.sh. All dimensions are meters.
Only INTERACTIVE_3D_RACK_TWIN_XE7745_GENERATED data is rebuilt; unrelated scenes are preserved.
Blender front = -Y, up = +Z; glTF front = +Z, up = +Y.
"""

from pathlib import Path
import sys
import math
import subprocess
import tempfile
import bpy
from mathutils import Vector, Quaternion

# Blender's Text Editor supplies __file__ for an opened on-disk script.
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT = SCRIPT_DIR.parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from geometry import migrate_legacy_branding, Geometry, grille, metadata, palette, rear_service_frame
from validate_glb import validate_glb

XE7745_SPEC = {
    "width": 0.4820,
    "body_width": 0.4450,
    "height": 0.1743,
    "depth_with_bezel": 0.89956,
    "depth_without_bezel": 0.88673,
    "ear_to_rear_wall": 0.8302,
    "bezel_to_ear": 0.03483,
    "rack_units": 4,
    "front_drives": 8,
    "psu_bays": 8,
    "nic_25g": 2,
    "nic_100g": 4,
    "front_ssd_body": (0.076, 0.112, 0.0075),
    "psu_body": (0.071, 0.095, 0.032),
    "nic_100g_slot_x": (-0.063, -0.105),
    "nic_100g_port_z": (0.045, 0.077),
}
COLLECTION = "INTERACTIVE_3D_RACK_TWIN_XE7745_GENERATED"
SCENE = "INTERACTIVE_3D_RACK_TWIN_XE7745_PREVIEW"


def initialize():
    migrate_legacy_branding()
    old = bpy.data.collections.get(COLLECTION)
    if old:
        if not old.get("rackTwinGenerated"):
            raise RuntimeError(
                f"{COLLECTION} is not generator-owned; refusing to replace it."
            )
        foreign = [obj.name for obj in old.all_objects if not obj.get("rackTwinGenerated")]
        if foreign or old.children:
            raise RuntimeError(
                f"Unrelated contents in {COLLECTION}: {foreign or list(old.children.keys())}. Move them out before rerunning."
            )
        for obj in list(old.all_objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data and data.users == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
        bpy.data.collections.remove(old)
    scene = bpy.data.scenes.get(SCENE)
    if scene and not scene.get("rackTwinGenerated"):
        raise RuntimeError(f"{SCENE} is not generator-owned.")
    scene = scene or bpy.data.scenes.new(SCENE)
    scene["rackTwinGenerated"] = True
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.unit_settings.length_unit = "MILLIMETERS"
    collection = bpy.data.collections.new(COLLECTION)
    collection["rackTwinGenerated"] = True
    scene.collection.children.link(collection)
    bpy.context.window.scene = scene
    return scene, collection


def chassis(g, exterior, spec):
    w, h, d = spec["body_width"], spec["height"], spec["depth_with_bezel"]
    front = -d / 2
    ear = front + spec["bezel_to_ear"]
    rear = ear + spec["ear_to_rear_wall"]
    nose = front + d - spec["depth_without_bezel"]
    middle, length = (nose + rear) / 2, rear - nose
    g.part(
        "chassis_shell",
        [
            (
                (-w / 2 + 0.001, middle, h / 2),
                (0.002, length, h - 0.004),
                "CHASSIS_DARK_METAL",
            ),
            (
                (w / 2 - 0.001, middle, h / 2),
                (0.002, length, h - 0.004),
                "CHASSIS_DARK_METAL",
            ),
        ],
        exterior,
    )
    g.box(
        "chassis_bottom",
        (w, length, 0.002),
        (0, middle, 0.001),
        exterior,
        "PANEL_BLACK",
    )
    cover = g.box(
        "top_cover",
        (w - 0.004, length - 0.001, 0.002),
        (0, middle, h - 0.001),
        exterior,
    )
    metadata(
        cover,
        assetType="server-cover",
        interactionRole="cover",
        movable=True,
        selectable=False,
    )
    # A shallow label/latch remains part of the cover and follows its independent transform.
    g.box(
        "cover_latch",
        (0.035, 0.018, 0.0004),
        (0, 0.08, 0.0011),
        cover,
        "PANEL_BLACK",
        0,
    )
    # Keep the latch within the specified external height.
    cover.location.z -= 0.0004
    for side, suffix in [(-1, "left"), (1, "right")]:
        ear_width = (spec["width"] - w) / 2
        x = side * (w / 2 + ear_width / 2)
        obj = g.part(
            f"rack_ear_{suffix}",
            [
                ((0, 0, h / 2), (ear_width, 0.007, h), "PORT_METAL"),
                (
                    (0, -0.015, h * 0.30),
                    (ear_width * 0.6, 0.018, 0.009),
                    "CHASSIS_DARK_METAL",
                ),
                (
                    (0, -0.024, h * 0.20),
                    (ear_width * 0.6, 0.006, h * 0.24),
                    "PORT_METAL",
                ),
                ((0, -0.004, h * 0.83), (0.004, 0.001, 0.007), "PORT_BLACK"),
            ],
            exterior,
            (x, ear, 0),
        )
        metadata(obj, assetType="rack-ear", selectable=True)
    # Structural lip stays on the chassis when the removable bezel is hidden.
    g.part(
        "front_frame",
        [
            ((0, nose + 0.001, h - 0.002), (w, 0.002, 0.004), "PANEL_BLACK"),
            ((0, nose + 0.001, 0.002), (w, 0.002, 0.004), "PANEL_BLACK"),
        ],
        exterior,
        bevel=0.0003,
    )
    return front, rear


def front_face(g, parent, spec, front):
    h, w = spec["height"], spec["body_width"]
    face = g.object("front", parent=parent)
    # Recess the existing service face into the already reserved bezel depth.
    face.location.y = spec["depth_with_bezel"] - spec["depth_without_bezel"]
    y = front + 0.006
    g.part(
        "front_panel",
        # Preserve the exterior silhouette, opening only the central BOSS passage.
        [((-(w + 0.072) / 4, 0, h / 2), ((w - 0.080) / 2, 0.003, h - 0.005), "PANEL_BLACK"),
         (((w + 0.072) / 4, 0, h / 2), ((w - 0.080) / 2, 0.003, h - 0.005), "PANEL_BLACK"),
         ((0, 0, 0.067), (0.076, 0.003, 0.129), "PANEL_BLACK"),
         ((0, 0, 0.1675), (0.076, 0.003, 0.009), "PANEL_BLACK")],
        face,
        (0, y + 0.006, 0),
    )
    # Four columns, two horizontal E3.S carriers per column, with BOSS between pairs.
    carrier_parts = [
        ((0, 0, 0), (0.080, 0.009, 0.0082), "DRIVE_CARRIER"),
        ((0, -0.0048, 0), (0.068, 0.001, 0.0058), "PORT_BLACK"),
        ((-0.029, -0.0058, 0), (0.012, 0.0018, 0.0053), "LATCH"),
        ((0.010, -0.0055, 0), (0.022, 0.001, 0.003), "LABEL"),
        ((-0.008, -0.0056, 0), (0.0017, 0.001, 0.0017), "INDICATOR"),
        # Complete simplified E3.S enclosure and carrier rails, behind the original face.
        ((0, 0.061, 0), spec["front_ssd_body"], "PORT_METAL"),
        ((-0.0385, 0.061, 0), (0.001, 0.112, 0.008), "DRIVE_CARRIER"),
        ((0.0385, 0.061, 0), (0.001, 0.112, 0.008), "DRIVE_CARRIER"),
        ((0, 0.057, 0.00385), (0.049, 0.067, 0.0002), "LABEL"),
        ((0, 0.119, 0), (0.024, 0.004, 0.004), "PORT_BLACK"),
        ((0, 0.1212, 0), (0.020, 0.0004, 0.002), "CONTACT"),
    ]
    first = None
    for i in range(spec["front_drives"]):
        col, row = divmod(i, 2)
        x = [-0.167, -0.083, 0.083, 0.167][col]
        position = (x, y + 0.001, h - 0.020 - row * 0.010)
        name = f"front_drive_{i + 1:02d}"
        obj = (
            g.part(name, carrier_parts, face, position, 0.00025)
            if first is None
            else g.duplicate(first, name, face, position)
        )
        first = first or obj
        metadata(obj, assetType="drive-bay", slot=f"DRIVE-{i + 1:02d}", selectable=True)
    g.part(
        "front_boss_n1",
        [
            ((0, 0, 0), (0.070, 0.010, 0.021), "CHASSIS_DARK_METAL"),
            ((-0.019, -0.0056, 0), (0.024, 0.002, 0.014), "PANEL_BLACK"),
            ((0.019, -0.0056, 0), (0.024, 0.002, 0.014), "PANEL_BLACK"),
            ((-0.028, -0.0068, 0), (0.003, 0.001, 0.010), "LATCH"),
            ((0.010, -0.0068, 0), (0.003, 0.001, 0.010), "LATCH"),
        ],
        face,
        (0, y + 0.002, h - 0.025),
    )
    # Exterior airflow grille only; no fan rotors, motor bodies or internal hardware.
    for side, label in [(-1, "left"), (1, "right")]:
        panel = g.object(f"front_vent_{label}", parent=face)
        for col in range(3):
            for row in range(2):
                x = side * (0.035 + col * 0.068)
                z = 0.035 + row * 0.064
                parts = grille(0.063, 0.059, columns=5, rows=4)
                parts.extend(
                    [
                        ((0, -0.0006, 0.018), (0.025, 0.002, 0.006), "DRIVE_CARRIER"),
                        ((0, -0.0018, 0.016), (0.018, 0.001, 0.0025), "LATCH"),
                    ]
                )
                g.part(
                    f"front_grille_{label}_{col + 1}_{row + 1}",
                    parts,
                    panel,
                    (x, y, z),
                    0,
                )
    for side, label in [(-1, "left"), (1, "right")]:
        parts = [((0, 0, 0), (0.013, 0.005, h - 0.009), "PORT_METAL")]
        if side < 0:
            parts.extend(
                [
                    ((0, -0.003, 0.065), (0.005, 0.002, 0.012), "PORT_BLACK"),
                    ((0, -0.003, 0.050), (0.005, 0.002, 0.007), "PORT_BLACK"),
                ]
            )
        else:
            parts.extend(
                [
                    ((0, -0.003, 0.068), (0.004, 0.002, 0.004), "INDICATOR"),
                    ((0, -0.003, 0.054), (0.003, 0.002, 0.008), "PORT_BLACK"),
                    ((0, -0.003, 0.041), (0.005, 0.002, 0.005), "PANEL_BLACK"),
                ]
            )
        g.part(f"front_control_{label}", parts, face, (side * 0.214, y, h / 2), 0.00025)
    g.box(
        "front_service_tag",
        (0.046, 0.004, 0.003),
        (0.168, front + 0.002, 0.004),
        face,
        "LABEL",
        0.0002,
    )
    g.part(
        "front_upper_vent",
        grille(0.410, 0.008, columns=32, rows=1),
        face,
        (0, y, h - 0.007),
        0,
    )


def front_bezel(g, parent, spec):
    """Original open honeycomb approximation: 33 large cells, no logo or lock mechanism."""
    w, h = spec["body_width"], spec["height"]
    assembly = g.object(
        "front_bezel",
        parent=parent,
        position=(0, -spec["depth_with_bezel"] / 2 + 0.002, h / 2),
    )
    metadata(
        assembly,
        assetType="server-bezel",
        interactionRole="bezel",
        movable=True,
        selectable=False,
    )
    parts = [
        ((0, 0, sign * (h / 2 - 0.003)), (w, 0.004, 0.006), "CHASSIS_DARK_METAL")
        for sign in (-1, 1)
    ] + [
        (
            (sign * (w / 2 - 0.004), 0, 0),
            (0.008, 0.004, h - 0.012),
            "CHASSIS_DARK_METAL",
        )
        for sign in (-1, 1)
    ]
    g.part("bezel_perimeter", parts, assembly, bevel=0.0005)
    g.box(
        "bezel_release_grip",
        (0.006, 0.004, 0.042),
        (-w / 2 + 0.004, 0, 0),
        assembly,
        "PANEL_BLACK",
    )
    g.box(
        "bezel_badge", (0.041, 0.003, 0.014), (0, -0.0003, 0), assembly, "PANEL_BLACK"
    )

    # Extruded hexagonal rings, combined into one mesh. No booleans, textures or dense perforations.
    vertices, faces = [], []
    radius, wall, thickness = 0.025, 0.0025, 0.003
    pitch = math.sqrt(3) * radius
    for col in range(11):
        for row in range(3):
            x = (col - 5) * radius * 1.5
            z = (row - 1) * pitch + ((col % 2) - 0.5) * pitch / 2
            offset = len(vertices)
            for y in (-thickness / 2, thickness / 2):
                for r in (radius, radius - wall):
                    vertices.extend(
                        (
                            x + r * math.cos(i * math.pi / 3),
                            y,
                            z + r * math.sin(i * math.pi / 3),
                        )
                        for i in range(6)
                    )
            for i in range(6):
                j = (i + 1) % 6
                for face in [
                    (i, j, j + 6, i + 6),
                    (i + 12, i + 18, j + 18, j + 12),
                    (i, i + 12, j + 12, j),
                    (i + 6, j + 6, j + 18, i + 18),
                ]:
                    faces.append(tuple(offset + index for index in face))
    mesh = bpy.data.meshes.new("bezel_honeycomb_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(g.materials["CHASSIS_DARK_METAL"])
    mesh.update()
    g.object("bezel_honeycomb", mesh, assembly)


def port(g, name, width, height, parent, position, color="PORT_BLACK", **extras):
    obj = g.part(
        name,
        [
            ((0, 0, 0), (width + 0.003, 0.004, height + 0.003), "PORT_METAL"),
            ((0, 0.0024, 0), (width, 0.001, height), color),
            ((0, 0.0030, -height * 0.3), (width * 0.65, 0.0008, 0.001), "LABEL"),
        ],
        parent,
        position,
        0.00015,
    )
    metadata(obj, selectable=True, **extras)
    return obj


def rear_face(g, parent, spec, rear):
    w, h = spec["body_width"], spec["height"]
    face = g.object("rear", parent=parent)
    g.part("rear_panel", rear_service_frame(w, 0.002, h - 0.002, "CHASSIS_DARK_METAL"),
           face, (0, rear - 0.0015, 0), 0)
    # PSU 1/2 at top, 3/4 next, 5/6 then 7/8: four faces on either side.
    first = None
    handle_depth = spec["depth_with_bezel"] / 2 - rear
    for i in range(spec["psu_bays"]):
        side, row = (-1 if i % 2 == 0 else 1), i // 2
        parts = [
            ((0, 0, 0), (0.073, 0.010, 0.039), "CHASSIS_DARK_METAL"),
            # Exterior housing only: body, lid seam, label and rear blind-mate suggestion.
            ((0, -0.0515, 0), spec["psu_body"], "PORT_METAL"),
            ((0, -0.0515, 0.0161), (0.058, 0.073, 0.0002), "CHASSIS_DARK_METAL"),
            ((0, -0.05, 0.0163), (0.030, 0.046, 0.0002), "LABEL"),
            ((0, -0.100, 0), (0.028, 0.002, 0.013), "PORT_BLACK"),
            ((-0.016, 0.0054, 0), (0.032, 0.001, 0.031), "PORT_BLACK"),
            ((0.020, 0.0056, 0), (0.023, 0.002, 0.025), "PORT_BLACK"),
            ((0.030, 0.007, 0), (0.003, 0.003, 0.016), "LATCH"),
            (
                (0.004, handle_depth / 2 - 0.0025, 0.014),
                (0.003, handle_depth - 0.005, 0.003),
                "PORT_METAL",
            ),
            (
                (0.004, handle_depth / 2 - 0.0025, -0.014),
                (0.003, handle_depth - 0.005, 0.003),
                "PORT_METAL",
            ),
            ((0.004, handle_depth - 0.006, 0), (0.004, 0.002, 0.031), "PORT_METAL"),
        ]
        for slot in range(5):
            parts.append(
                (
                    (-0.016, 0.0065, (slot - 2) * 0.005),
                    (0.030, 0.001, 0.0013),
                    "DRIVE_CARRIER",
                )
            )
        name = f"rear_psu_{i + 1:02d}"
        position = (side * 0.181, rear + 0.005, h - 0.022 - row * 0.042)
        obj = (
            g.part(name, parts, face, position, 0.0004)
            if first is None
            else g.duplicate(first, name, face, position)
        )
        first = first or obj
        metadata(
            obj, assetType="power-supply", slot=f"PSU-{i + 1:02d}", selectable=True,
            focusable=True, explodable=True, explodeGroup="power-supply"
        )
    g.box(
        "rear_io_region",
        (0.278, 0.003, 0.039),
        (0, rear + 0.0015, h - 0.021),
        face,
        "CHASSIS_DARK_METAL",
    )
    port(
        g,
        "rear_vga",
        0.016,
        0.007,
        face,
        (-0.112, rear + 0.006, h - 0.029),
        "VGA",
        assetType="management-port",
    )
    for i in range(2):
        port(
            g,
            f"rear_usb_{i + 1:02d}",
            0.012,
            0.004,
            face,
            (-0.085, rear + 0.006, h - 0.023 - i * 0.007),
            assetType="management-port",
        )
    port(
        g,
        "rear_idrac",
        0.014,
        0.010,
        face,
        (-0.055, rear + 0.006, h - 0.028),
        assetType="management-port",
    )
    # The grille helper faces front (-Y); reverse its depth for the rear surface.
    rear_grille = [
        ((x, -y, z), (a, b, c), mat)
        for (x, y, z), (a, b, c), mat in grille(0.154, 0.024, columns=19, rows=3)
    ]
    g.part("rear_upper_vent", rear_grille, face, (0.048, rear + 0.005, h - 0.019), 0)
    expansion = g.object("rear_pcie_region", parent=face)
    for side in [-1, 1]:
        for i in range(4):
            x = side * (0.063 + i * 0.021)
            parts = [((0, 0, 0), (0.018, 0.002, 0.114), "PORT_METAL")]
            occupied = side < 0 and i in (0, 2)
            parts.extend(
                ((0, 0.0015, (j - 4) * 0.010), (0.011, 0.001, 0.004), "PORT_BLACK")
                for j in range(9) if not occupied
            )
            g.part(
                f"rear_expansion_{'left' if side < 0 else 'right'}_{i + 1}",
                parts,
                expansion,
                (x, rear + 0.003, 0.064),
                0,
            )
    # Rear-view right is negative X. Positions 1/3, counted from center outward.
    # QSFP28 cages: open metal rim, shallow dark recess, no optics/cables fitted.
    for i in range(spec["nic_100g"]):
        x = spec["nic_100g_slot_x"][i // 2]
        width, height, depth = 0.0184, 0.0085, 0.025
        cage = g.part(
            f"rear_nic_100g_{i + 1:02d}",
            [
                # Shallow socket behind its rim, but in front of the simplified bracket.
                ((0, 0.004, 0), (width, 0.001, height), "PORT_BLACK"),
                *((((side * (width / 2 + 0.0005)), 0, 0), (0.001, depth, height + 0.002), "PORT_METAL") for side in (-1, 1)),
                *(((0, 0, side * (height / 2 + 0.0005)), (width, depth, 0.001), "PORT_METAL") for side in (-1, 1)),
                ((0, depth / 2 + 0.0003, -height / 2), (0.009, 0.0006, 0.0015), "PANEL_BLACK"),
            ],
            face,
            (x, rear + 0.007, spec["nic_100g_port_z"][i % 2]),
            0.00015,
        )
        metadata(cage, assetType="network-port", speed="100G", connector="QSFP28",
                 slot=f"NIC-100G-{i + 1:02d}", selectable=True)
    for i in range(spec["nic_25g"]):
        port(
            g,
            f"rear_nic_25g_{i + 1:02d}",
            0.013,
            0.006,
            face,
            (-0.012 + i * 0.024, rear + 0.007, 0.019),
            assetType="network-port",
            speed="25G",
            slot=f"NIC-25G-{i + 1:02d}",
        )
    center = [
        ((x, -y, z), (a, b, c), mat)
        for (x, y, z), (a, b, c), mat in grille(0.090, 0.078, columns=10, rows=9)
    ]
    g.part("rear_center_vent", center, face, (0, rear + 0.005, 0.078), 0)


def validate_scene(collection, spec, require_internals=False):
    bpy.context.view_layer.update()
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in collection.all_objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    expected = [spec["width"], spec["depth_with_bezel"], spec["height"]]
    for i, dimension in enumerate(expected):
        if abs(high[i] - low[i] - dimension) > 0.00001:
            raise RuntimeError(
                f"Axis {i} envelope is {high[i] - low[i]:.6f} m, expected {dimension}"
            )
    for obj in collection.all_objects:
        if obj.type == "MESH" and obj.data.validate():
            raise RuntimeError(f"Invalid generated geometry: {obj.name}")
        if any(abs(v - 1) > 1e-6 for v in obj.scale):
            raise RuntimeError(f"Non-unit scale on {obj.name}")
    if require_internals:
        names = [obj.name for obj in collection.all_objects]
        if len(names) != len(set(names)):
            raise RuntimeError("Generated object names are not unique")
        required = {
            "internals", "internal_chassis", "upper_tray", "system_board",
            "cpu_zone", "memory", "gpu_zone", "storage", "cooling", "network", "pcie",
            "cpu_a", "cpu_b", "cpu_a_heatsink", "cpu_b_heatsink",
            "nvlink_bridge_4way", "front_storage_backplane", "boss_n1",
            "boss_m2_01", "boss_m2_02", "nic_25g_adapter",
            "nic_100g_adapter_01", "nic_100g_adapter_02",
        }
        missing = required - set(names)
        if missing:
            raise RuntimeError(f"Missing internal objects: {sorted(missing)}")
        for name in (
            "internal_chassis", "upper_tray", "system_board", "cpu_zone", "memory",
            "gpu_zone", "storage", "cooling", "network", "pcie",
        ):
            if bpy.data.objects[name].parent != bpy.data.objects["internals"]:
                raise RuntimeError(f"Wrong internal hierarchy for {name}")
        exact = {
            "gpu": (r"gpu_\d{2}", 4),
            "dimm": (r"dimm_[ab]\d{2}", 24),
            "front drive": (r"front_drive_\d{2}", 8),
            "BOSS M.2": (r"boss_m2_\d{2}", 2),
            "fan": (r"fan_module_\d{2}", 16),
        }
        import re
        for label, (pattern, count) in exact.items():
            actual = sum(bool(re.fullmatch(pattern, name)) for name in names)
            if actual != count:
                raise RuntimeError(f"Expected {count} {label} roots, found {actual}")
        slots = [bpy.data.objects[f"gpu_{i:02d}"].get("physicalSlot") for i in range(1, 5)]
        if slots != [21, 23, 25, 27]:
            raise RuntimeError(f"Wrong GPU physical slot group: {slots}")
        if any(name.startswith("internal_ssd_") for name in names):
            raise RuntimeError("Duplicate internal SSD roots are forbidden")


def configure_viewport(scene):
    world = bpy.data.worlds.get("XE7745_WORLD")
    if world and not world.get("rackTwinGenerated"):
        raise RuntimeError(
            "Unrelated world named XE7745_WORLD; rename it before generating."
        )
    scene.world = world or bpy.data.worlds.new("XE7745_WORLD")
    scene.world["rackTwinGenerated"] = True
    scene.world.color = (0.12, 0.12, 0.12)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.shading.type = "SOLID"
                space.shading.color_type = "MATERIAL"
                space.clip_start = 0.001
                space.clip_end = 100
                space.region_3d.view_distance = 1.5
                space.region_3d.view_location = (0, 0, 0.08)
                space.region_3d.view_rotation = Quaternion((1, 0, 0), math.radians(68))


def main(include_internals=False):
    scene, collection = initialize()
    g = Geometry(collection, palette())
    root = g.object("XE7745_ROOT")
    metadata(
        root,
        assetType="server",
        manufacturer="Dell",
        model="PowerEdge XE7745",
        formFactor="4U",
        selectable=True,
        modelSection="2.2-full" if include_internals else "2.1-exterior",
        origin="bottom-center",
        physicalWidth=XE7745_SPEC["width"],
        physicalHeight=XE7745_SPEC["height"],
        physicalDepth=XE7745_SPEC["depth_with_bezel"],
    )
    exterior = g.object("exterior", parent=root)
    front, rear = chassis(g, exterior, XE7745_SPEC)
    front_face(g, exterior, XE7745_SPEC, front)
    front_bezel(g, exterior, XE7745_SPEC)
    rear_face(g, exterior, XE7745_SPEC, rear)
    if include_internals:
        from internals import generate_internals

        generate_internals(g, root)
    validate_scene(collection, XE7745_SPEC, require_internals=include_internals)
    configure_viewport(scene)
    blend = PROJECT / "blender/poweredge-xe7745.blend"
    glb = PROJECT / "public/assets/models/servers/poweredge-xe7745.glb"
    blend.parent.mkdir(parents=True, exist_ok=True)
    glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(glb),
        export_format="GLB",
        use_selection=True,
        use_active_scene=True,
        export_yup=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_apply=True,
        export_materials="EXPORT",
    )
    summary = validate_glb(glb, require_internals=include_internals)
    # A scene-only library excludes unrelated user work, but has no saved workspace.
    # Finalize it in an isolated background Blender so the deliverable opens framed.
    with tempfile.TemporaryDirectory(prefix="interactive-3d-rack-twin-xe7745-source-") as temporary:
        source = Path(temporary) / "generated.blend"
        bpy.data.libraries.write(str(source), {scene}, fake_user=True, compress=True)
        result = subprocess.run(
            [
                bpy.app.binary_path,
                "--background",
                str(source),
                "--python-exit-code",
                "1",
                "--python",
                str(Path(__file__).resolve()),
                "--",
                "--finalize-source",
                str(blend),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode:
            raise RuntimeError(
                f"Could not save standalone Blender source:\n{result.stdout}\n{result.stderr}"
            )
    print(f"\nXE7745 {'Full' if include_internals else 'Exterior'} Generation Complete")
    print("Dimensions (W × D × H): 482.0 × 899.56 × 174.3 mm")
    for key, value in summary.items():
        print(f"{key}: {value}")
    print(f"Blender: {blend}\nGLB: {glb}")


if __name__ == "__main__":
    if "--finalize-source" in sys.argv:
        destination = Path(sys.argv[sys.argv.index("--finalize-source") + 1])
        bpy.context.window.scene = bpy.data.scenes[SCENE]
        configure_viewport(bpy.context.scene)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(destination), compress=True)
    else:
        main()
