"""Dependency-free checks of the exported GLB, also runnable with system Python."""

import itertools
import json
import math
from pathlib import Path
import struct
import sys


def matrix(node):
    if "matrix" in node:
        values = node["matrix"]
        return [[values[col * 4 + row] for col in range(4)] for row in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    scale = node.get("scale", [1, 1, 1])
    translation = node.get("translation", [0, 0, 0])
    result = [
        [
            1 - 2 * (y * y + z * z),
            2 * (x * y - z * w),
            2 * (x * z + y * w),
            translation[0],
        ],
        [
            2 * (x * y + z * w),
            1 - 2 * (x * x + z * z),
            2 * (y * z - x * w),
            translation[1],
        ],
        [
            2 * (x * z - y * w),
            2 * (y * z + x * w),
            1 - 2 * (x * x + y * y),
            translation[2],
        ],
        [0, 0, 0, 1],
    ]
    for row in range(3):
        for col in range(3):
            result[row][col] *= scale[col]
    return result


def multiply(a, b):
    return [
        [sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)
    ]


def validate_glb(path, require_internals=False):
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"GLB is missing: {path}")
    binary = path.read_bytes()
    if len(binary) < 20 or struct.unpack_from("<4sII", binary) != (
        b"glTF",
        2,
        len(binary),
    ):
        raise ValueError("Invalid GLB header/length")
    length, kind = struct.unpack_from("<II", binary, 12)
    if kind != 0x4E4F534A:
        raise ValueError("GLB JSON chunk is missing")
    doc = json.loads(binary[20 : 20 + length])
    if len(doc.get("scenes", [])) != 1:
        raise ValueError("Export must contain only the generated scene")
    nodes, meshes, accessors = doc["nodes"], doc["meshes"], doc["accessors"]
    names = [node.get("name") for node in nodes]
    if None in names or len(set(names)) != len(names):
        raise ValueError("Every exported node must have a unique name")
    by_name = dict(zip(names, nodes))
    parent_indices = {}
    for parent_index, node in enumerate(nodes):
        for child_index in node.get("children", []):
            if child_index in parent_indices:
                raise ValueError(f"Node has multiple parents: {nodes[child_index]['name']}")
            parent_indices[child_index] = parent_index

    def parent_name(name):
        index = names.index(name)
        return names[parent_indices[index]] if index in parent_indices else None
    required = [
        "XE7745_ROOT",
        "top_cover",
        "chassis_shell",
        "chassis_bottom",
        "front_frame",
        "front_bezel",
        "bezel_honeycomb",
        "rack_ear_left",
        "rack_ear_right",
        "front_panel",
        "front_vent_left",
        "front_vent_right",
        "front_boss_n1",
        "front_service_tag",
        "front_control_left",
        "front_control_right",
        "rear_panel",
        "rear_idrac",
        "rear_usb_01",
        "rear_usb_02",
        "rear_vga",
        "rear_pcie_region",
    ]
    required += [f"front_drive_{i:02d}" for i in range(1, 9)]
    required += [f"rear_psu_{i:02d}" for i in range(1, 9)]
    required += [
        f"rear_nic_{speed}_{i:02d}"
        for speed, count in [("25g", 2), ("100g", 4)]
        for i in range(1, count + 1)
    ]
    missing = set(required) - set(names)
    if missing:
        raise ValueError(f"Missing required nodes: {sorted(missing)}")
    root = by_name["XE7745_ROOT"].get("extras", {})
    if root.get("assetType") != "server" or root.get("selectable") is not True:
        raise ValueError("Root metadata was not exported")
    require_internals = require_internals or root.get("modelSection") == "2.2-full"
    if require_internals:
        internal_required = [
            "internals",
            "internal_chassis",
            "upper_tray",
            "system_board",
            "cpu_zone",
            "cpu_a",
            "cpu_b",
            "cpu_a_heatsink",
            "cpu_b_heatsink",
            "memory",
            "gpu_zone",
            "gpu_baseboard",
            "nvlink_bridge_4way",
            "storage",
            "front_storage_backplane",
            "boss_n1",
            "boss_m2_01",
            "boss_m2_02",
            "cooling",
            "network",
            "nic_25g_adapter",
            "nic_100g_adapter_01",
            "nic_100g_adapter_02",
            "pcie",
        ]
        internal_required += [f"gpu_{i:02d}" for i in range(1, 5)]
        internal_required += [f"gpu_empty_slot_{i:02d}" for i in range(1, 5)]
        internal_required += [
            f"dimm_{socket}{i:02d}"
            for socket in ("a", "b")
            for i in range(1, 13)
        ]
        internal_required += [f"fan_module_{i:02d}" for i in range(1, 17)]
        missing = set(internal_required) - set(names)
        if missing:
            raise ValueError(f"Missing required internals: {sorted(missing)}")
        if parent_name("front_boss_n1") != "boss_n1":
            raise ValueError("BOSS front face must travel with its controller")
        for name in ["gpu_baseboard", *[f"gpu_empty_slot_{i:02d}" for i in range(1, 5)]]:
            if by_name[name].get("extras", {}).get("selectable") is not False:
                raise ValueError(f"Support geometry must not be selectable: {name}")
    cover = by_name["top_cover"]
    bezel = by_name["front_bezel"]
    if not bezel.get("children") or any(
        bezel.get("extras", {}).get(key) != value
        for key, value in {
            "assetType": "server-bezel",
            "interactionRole": "bezel",
            "movable": True,
            "selectable": False,
        }.items()
    ):
        raise ValueError("Removable bezel hierarchy/metadata is missing")
    if (
        names.index("top_cover") in bezel["children"]
        or names.index("front_frame") in bezel["children"]
    ):
        raise ValueError("Cover and structural frame must stay independent of bezel")
    if "mesh" not in cover or cover.get("extras", {}).get("interactionRole") != "cover":
        raise ValueError("Separate movable top cover is missing")
    if (
        cover["extras"].get("movable") is not True
        or cover["extras"].get("selectable") is not False
    ):
        raise ValueError("Cover interaction properties are wrong")
    for name in required:
        node = by_name[name]
        extras = node.get("extras", {})
        if name.startswith(("front_drive_", "rear_psu_", "rear_nic_")):
            slot = (
                name.removeprefix("front_")
                .removeprefix("rear_")
                .upper()
                .replace("_", "-")
            )
            if name.startswith("front_drive_") and require_internals:
                slot = slot.replace("DRIVE-", "SSD-")
            if extras.get("slot") != slot:
                raise ValueError(f"Missing slot on {name}")
            if name.startswith("front_drive_") and require_internals:
                if extras.get("location") != "front":
                    raise ValueError(f"Front storage location missing on {name}")
    if require_internals:
        import re

        counts = {
            r"gpu_\d{2}": 4,
            r"cpu_[ab]": 2,
            r"dimm_[ab]\d{2}": 24,
            r"front_drive_\d{2}": 8,
            r"boss_m2_\d{2}": 2,
            r"fan_module_\d{2}": 16,
        }
        for pattern, expected in counts.items():
            actual = sum(bool(re.fullmatch(pattern, name)) for name in names)
            if actual != expected:
                raise ValueError(f"{pattern} count {actual}, expected {expected}")
        if any(name.startswith("internal_ssd_") for name in names):
            raise ValueError("Duplicate internal SSD roots are forbidden")
        slots = [by_name[f"gpu_{i:02d}"]["extras"].get("physicalSlot") for i in range(1, 5)]
        if slots != [21, 23, 25, 27]:
            raise ValueError(f"Wrong GPU physical slot group: {slots}")
        component_contracts = {}
        for index in range(1, 5):
            component_contracts[f"gpu_{index:02d}"] = {
                "assetType": "gpu", "slot": f"GPU-{index:02d}",
                "selectable": True, "focusable": True, "explodable": True,
                "explodeGroup": "gpu", "physicalSlot": slots[index - 1],
                "formFactor": "PCIe dual-slot", "visualVariant": "H200 NVL",
            }
            socket = f"gpu_{index:02d}_nvlink_socket"
            foot = f"nvlink_connector_{index:02d}"
            if socket not in by_name or parent_name(socket) != f"gpu_{index:02d}":
                raise ValueError(f"Missing or detached NVLink socket: {socket}")
            if foot not in by_name or parent_name(foot) != "nvlink_bridge_4way":
                raise ValueError(f"Missing or detached NVLink bridge foot: {foot}")
            if by_name[foot].get("extras", {}).get("physicalSlot") != slots[index - 1]:
                raise ValueError(f"Wrong bridge connector slot: {foot}")
        for socket in ("a", "b"):
            component_contracts[f"cpu_{socket}"] = {
                "assetType": "cpu", "slot": f"CPU-{socket.upper()}",
                "selectable": True, "focusable": True, "explodable": True,
                "explodeGroup": "cpu",
            }
            for index in range(1, 13):
                component_contracts[f"dimm_{socket}{index:02d}"] = {
                    "assetType": "memory",
                    "slot": f"DIMM-{socket.upper()}{index:02d}",
                    "selectable": True, "focusable": True, "explodable": True,
                    "explodeGroup": f"memory-{socket}",
                }
        component_contracts["boss_n1"] = {
            "assetType": "storage-controller", "slot": "BOSS",
            "selectable": True, "focusable": True, "explodable": True,
            "explodeGroup": "boss",
        }
        for index in range(1, 3):
            component_contracts[f"boss_m2_{index:02d}"] = {
                "assetType": "drive", "slot": f"BOSS-M2-{index:02d}",
                "location": "internal", "selectable": True, "focusable": True,
                "explodable": True, "explodeGroup": "boss-m2",
            }
        for name, expected in component_contracts.items():
            extras = by_name[name].get("extras", {})
            wrong = {key: value for key, value in expected.items() if extras.get(key) != value}
            if wrong:
                raise ValueError(f"Wrong interaction metadata on {name}: {wrong}")
        bridge = by_name["nvlink_bridge_4way"].get("extras", {})
        if any(
            bridge.get(key) != value
            for key, value in {
                "interactionRole": "nvlink-bridge",
                "selectable": True,
                "slot": "NVLINK-01",
                "explodable": True,
            }.items()
        ) or list(bridge.get("physicalSlots", [])) != slots:
            raise ValueError("NVLink four-way grouping metadata is wrong")
        for socket in ("a", "b"):
            heatsink = by_name[f"cpu_{socket}_heatsink"].get("extras", {})
            if heatsink.get("interactionRole") != "heatsink" or "selectable" in heatsink:
                raise ValueError(f"CPU {socket.upper()} heatsink must inherit CPU selection")
        expected_nic_parents = {
            "rear_nic_25g_01": "nic_25g_adapter",
            "rear_nic_25g_02": "nic_25g_adapter",
            "rear_nic_100g_01": "nic_100g_adapter_01",
            "rear_nic_100g_02": "nic_100g_adapter_01",
            "rear_nic_100g_03": "nic_100g_adapter_02",
            "rear_nic_100g_04": "nic_100g_adapter_02",
        }
        for name, expected_parent in expected_nic_parents.items():
            if parent_name(name) != expected_parent:
                raise ValueError(f"Wrong network adapter parent on {name}")
    if (
        doc.get("cameras")
        or "KHR_lights_punctual" in doc.get("extensions", {})
    ):
        raise ValueError("Unexpected cameras or lights")
    if any("uri" in resource for resource in doc.get("buffers", []) + doc.get("images", [])):
        raise ValueError("GLB resources must be embedded")
    # PCB finish uses three embedded maps per board; keep texture use bounded.
    if len(doc.get("images", [])) > 6 or len(doc.get("textures", [])) > 6:
        raise ValueError("PCB texture budget exceeded")
    for image in doc.get("images", []):
        if image.get("mimeType") != "image/png" or "bufferView" not in image:
            raise ValueError("PCB maps must be embedded PNGs")
        view = doc["bufferViews"][image["bufferView"]]
        offset = 28 + length + view.get("byteOffset", 0)
        png = binary[offset:offset + view["byteLength"]]
        if len(png) < 33 or png[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("Invalid PCB PNG payload")
        width, height = struct.unpack_from(">II", png, 16)
        if width != 1024 or height != 2048:
            raise ValueError("PCB map resolution must be 1024 x 2048")
    size_budget = 15_000_000 if require_internals else 5_000_000
    if not doc.get("materials") or len(binary) > size_budget:
        raise ValueError(f"Materials missing or GLB exceeds {size_budget} byte budget")
    low, high = [math.inf] * 3, [-math.inf] * 3
    triangles = 0
    unique_triangles = 0
    world_positions = {}
    identity = [[int(i == j) for j in range(4)] for i in range(4)]

    for mesh in meshes:
        for primitive in mesh["primitives"]:
            positions = accessors[primitive["attributes"]["POSITION"]]
            count = (
                accessors[primitive["indices"]]["count"]
                if "indices" in primitive
                else positions["count"]
            )
            unique_triangles += count // 3

    def visit(index, parent):
        nonlocal triangles
        node = nodes[index]
        transform = multiply(parent, matrix(node))
        world_positions[node["name"]] = [transform[i][3] for i in range(3)]
        if "mesh" in node:
            for primitive in meshes[node["mesh"]]["primitives"]:
                if primitive.get("mode", 4) != 4 or "material" not in primitive:
                    raise ValueError("Expected triangles with PBR materials")
                positions = accessors[primitive["attributes"]["POSITION"]]
                count = (
                    accessors[primitive["indices"]]["count"]
                    if "indices" in primitive
                    else positions["count"]
                )
                if count % 3:
                    raise ValueError("Incomplete triangle")
                triangles += count // 3
                for point in itertools.product(
                    *zip(positions["min"], positions["max"])
                ):
                    for row in range(3):
                        value = (
                            sum(transform[row][col] * point[col] for col in range(3))
                            + transform[row][3]
                        )
                        low[row], high[row] = (
                            min(low[row], value),
                            max(high[row], value),
                        )
        for child in node.get("children", []):
            visit(child, transform)

    for index in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        visit(index, identity)
    dimensions = [high[i] - low[i] for i in range(3)]
    if any(
        abs(actual - expected) > 0.00001
        for actual, expected in zip(dimensions, [0.482, 0.1743, 0.89956])
    ):
        raise ValueError(f"Wrong Y-up dimensions: {dimensions}")
    if (
        abs(low[1]) > 0.00001
        or abs(low[0] + high[0]) > 0.00001
        or abs(low[2] + high[2]) > 0.00001
    ):
        raise ValueError(f"Wrong bottom-center origin: {low}, {high}")
    if (
        world_positions["front_drive_01"][2] < 0.4
        or world_positions["rear_psu_01"][2] > -0.35
    ):
        raise ValueError("Front/rear orientation is incorrect")
    triangle_budget = 250_000 if require_internals else 50_000
    if not 100 < triangles < triangle_budget:
        raise ValueError(f"Triangle budget exceeded or geometry empty: {triangles}")
    return {
        "Objects": len(nodes),
        "Meshes": len(meshes),
        "Instanced triangles": triangles,
        "Unique mesh triangles": unique_triangles,
        "GLB bytes": len(binary),
        "Bounds XYZ (m)": [[round(x, 6) for x in low], [round(x, 6) for x in high]],
    }


if __name__ == "__main__":
    target = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path(__file__).resolve().parents[3]
        / "public/assets/models/servers/poweredge-xe7745.glb"
    )
    try:
        print(json.dumps(validate_glb(target), indent=2))
    except (ValueError, KeyError, OSError, struct.error) as error:
        sys.exit(f"XE7745 validation failed: {error}")
