"""Small, texture-free mesh helpers. Parts use local XYZ meters and a material key."""

import math

import bpy


def migrate_legacy_branding():
    """Recognize pre-rebrand generated data without bypassing ownership checks."""
    pending = []
    for blocks in (bpy.data.scenes, bpy.data.collections, bpy.data.objects,
                   bpy.data.materials, bpy.data.worlds, bpy.data.images):
        for item in blocks:
            if "sidiaGenerated" not in item:
                continue
            name = item.name
            if item.get("sidiaGenerated") and name.startswith("SIDIA_"):
                name = "INTERACTIVE_3D_RACK_TWIN_" + name[len("SIDIA_"):]
                if blocks.get(name):
                    raise RuntimeError(f"Legacy rename conflicts with {name}; resolve it before generating.")
            pending.append((item, name))
    for item, name in pending:
        item["rackTwinGenerated"] = item.get("rackTwinGenerated", item["sidiaGenerated"])
        del item["sidiaGenerated"]
        item.name = name


def palette():
    colors = {
        "CHASSIS_DARK_METAL": ((0.23, 0.255, 0.28), 0.7, 0.42),
        "PANEL_BLACK": ((0.022, 0.028, 0.034), 0.3, 0.46),
        "DRIVE_CARRIER": ((0.055, 0.065, 0.075), 0.25, 0.48),
        "PORT_BLACK": ((0.005, 0.008, 0.011), 0.0, 0.6),
        "PORT_METAL": ((0.43, 0.48, 0.53), 0.8, 0.38),
        "INDICATOR": ((0.22, 0.39, 0.13), 0.1, 0.48),
        "LATCH": ((0.51, 0.21, 0.045), 0.15, 0.48),
        "LABEL": ((0.58, 0.63, 0.67), 0.1, 0.65),
        "VGA": ((0.06, 0.16, 0.34), 0.25, 0.45),
        "BOARD_GREEN": ((0.035, 0.18, 0.10), 0.05, 0.62),
        "CPU_PACKAGE": ((0.08, 0.11, 0.13), 0.15, 0.45),
        "CPU_CAP": ((0.52, 0.56, 0.59), 0.75, 0.28),
        "SOCKET": ((0.12, 0.13, 0.14), 0.1, 0.52),
        "HEATSINK": ((0.48, 0.52, 0.55), 0.85, 0.30),
        # Requested simplified copper heat-transfer treatment, not an OEM alloy claim.
        "CPU_COPPER": ((0.52, 0.23, 0.11), 0.78, 0.38),
        "MEMORY_PCB": ((0.035, 0.22, 0.11), 0.05, 0.62),
        "MEMORY_CHIP": ((0.012, 0.016, 0.020), 0.0, 0.58),
        "CONTACT": ((0.64, 0.43, 0.10), 0.65, 0.32),
        # Requested restrained gold treatment; not an exact OEM finish match.
        "GPU_SHROUD": ((0.56, 0.36, 0.10), 0.78, 0.40),
        "GPU_PCB": ((0.025, 0.12, 0.07), 0.05, 0.62),
        "NVLINK": ((0.16, 0.18, 0.20), 0.6, 0.32),
        "M2_PCB": ((0.035, 0.16, 0.08), 0.05, 0.62),
        "FAN_HOUSING": ((0.08, 0.09, 0.10), 0.2, 0.5),
        "FAN_ROTOR": ((0.018, 0.022, 0.026), 0.15, 0.45),
    }
    result = {}
    for key, (color, metal, rough) in colors.items():
        name = f"MAT_{key}"
        mat = bpy.data.materials.get(name)
        if mat and not mat.get("rackTwinGenerated"):
            raise RuntimeError(
                f"Unrelated material named {name}; rename it before generating."
            )
        mat = mat or bpy.data.materials.new(name)
        mat["rackTwinGenerated"] = True
        mat.use_nodes = True
        mat.diffuse_color = (*color, 1)
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*color, 1)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        result[key] = mat
    return result


def metadata(obj, **properties):
    for key, value in properties.items():
        obj[key] = value
    return obj


def rear_service_frame(width, bottom, top, material):
    """Fixed sheet pieces around the existing three NIC service corridors."""
    rectangles = [
        (-width / 2, -0.118, bottom, top),
        (-0.092, -0.076, bottom, top),
        (-0.050, -0.039, bottom, top),
        (0.039, width / 2, bottom, top),
        (-0.118, -0.092, bottom, 0.005),
        (-0.118, -0.092, 0.123, top),
        (-0.076, -0.050, bottom, 0.005),
        (-0.076, -0.050, 0.123, top),
        (-0.039, 0.039, bottom, 0.006),
        (-0.039, 0.039, 0.033, top),
    ]
    return [(( (left + right) / 2, 0, (low + high) / 2),
             (right - left, 0.003, high - low), material)
            for left, right, low, high in rectangles]


class Geometry:
    """Combine decorative boxes per logical part to keep WebGL draw calls modest."""

    def __init__(self, collection, materials):
        self.collection = collection
        self.materials = materials

    def object(self, name, data=None, parent=None, position=(0, 0, 0)):
        if bpy.data.objects.get(name):
            raise RuntimeError(
                f"Unrelated object named {name}; generation will not overwrite it."
            )
        obj = bpy.data.objects.new(name, data)
        obj["rackTwinGenerated"] = True
        self.collection.objects.link(obj)
        obj.parent = parent
        obj.location = position
        return obj

    def mesh(self, name):
        mesh_name = f"{name}_mesh"
        if bpy.data.meshes.get(mesh_name):
            raise RuntimeError(
                f"Unrelated mesh named {mesh_name}; generation will not overwrite it."
            )
        mesh = bpy.data.meshes.new(mesh_name)
        return mesh

    def part(self, name, parts, parent, position=(0, 0, 0), bevel=0.0004):
        vertices, faces, material_ids = [], [], []
        keys = list(self.materials)
        for (x, y, z), (w, d, h), material in parts:
            if min(w, d, h) <= 0:
                raise ValueError(f"Non-positive dimensions in {name}")
            start = len(vertices)
            vertices.extend(
                (x + sx * w / 2, y + sy * d / 2, z + sz * h / 2)
                for sx, sy, sz in [
                    (-1, -1, -1),
                    (1, -1, -1),
                    (1, 1, -1),
                    (-1, 1, -1),
                    (-1, -1, 1),
                    (1, -1, 1),
                    (1, 1, 1),
                    (-1, 1, 1),
                ]
            )
            faces.extend(
                tuple(start + i for i in face)
                for face in [
                    (0, 3, 2, 1),
                    (4, 5, 6, 7),
                    (0, 1, 5, 4),
                    (1, 2, 6, 5),
                    (2, 3, 7, 6),
                    (3, 0, 4, 7),
                ]
            )
            material_ids.extend([keys.index(material)] * 6)
        mesh = self.mesh(name)
        mesh.from_pydata(vertices, [], faces)
        for mat in self.materials.values():
            mesh.materials.append(mat)
        for polygon, material_id in zip(mesh.polygons, material_ids):
            polygon.material_index = material_id
        mesh.update()
        obj = self.object(name, mesh, parent, position)
        if bevel:
            modifier = obj.modifiers.new("Silhouette bevel", "BEVEL")
            modifier.width = bevel
            modifier.segments = 1
            modifier.affect = "EDGES"
            modifier.limit_method = "ANGLE"
        return obj

    def box(
        self, name, size, position, parent, material="CHASSIS_DARK_METAL", bevel=0.0004
    ):
        return self.part(name, [((0, 0, 0), size, material)], parent, position, bevel)

    def duplicate(self, source, name, parent, position):
        obj = self.object(name, source.data, parent, position)
        for modifier in source.modifiers:
            copy = obj.modifiers.new(modifier.name, modifier.type)
            copy.width, copy.segments = modifier.width, modifier.segments
        return obj

    def cylinder(self, name, radius, depth, parent, position, material, segments=12):
        """Small Y-axis cylinder for low-poly hubs/rotors."""
        vertices = [
            (radius * math.cos(i * 2 * math.pi / segments), y, radius * math.sin(i * 2 * math.pi / segments))
            for y in (-depth / 2, depth / 2)
            for i in range(segments)
        ]
        faces = [tuple(range(segments - 1, -1, -1)), tuple(range(segments, 2 * segments))]
        faces.extend(
            (i, (i + 1) % segments, segments + (i + 1) % segments, segments + i)
            for i in range(segments)
        )
        mesh = self.mesh(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(self.materials[material])
        mesh.update()
        return self.object(name, mesh, parent, position)


def grille(width, height, depth=0.0015, columns=10, rows=5):
    """Sparse bars over a dark recess, not boolean holes or internal fans."""
    parts = [((0, depth, 0), (width, depth, height), "PORT_BLACK")]
    for i in range(columns + 1):
        parts.append(
            (
                (-width / 2 + i * width / columns, 0, 0),
                (0.0012, depth, height),
                "DRIVE_CARRIER",
            )
        )
    for i in range(rows + 1):
        parts.append(
            (
                (0, 0, -height / 2 + i * height / rows),
                (width, depth, 0.0012),
                "DRIVE_CARRIER",
            )
        )
    return parts
