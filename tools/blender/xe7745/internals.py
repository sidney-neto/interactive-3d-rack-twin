"""Original low-poly XE7745 internal layout approximation; no vendor CAD."""

import bpy
import bmesh
import math
from mathutils import Vector

from geometry import metadata, rear_service_frame


INTERNAL_SPEC = {
    "gpu_slots": (21, 23, 25, 27),
    "cpu_sockets": ("a", "b"),
    "dimms_per_cpu": 12,
    "front_drive_count": 8,
    "boss_m2_count": 2,
    "nic_ports": {"25g": 2, "100g": 4},
}

# PCIe dual-slot pitch; the four occupied locations remain the RC0-3 left bank.
GPU_PITCH = 0.04064
GPU_CENTER_X = -0.0845
GPU_POSITIONS = tuple((GPU_CENTER_X + (i - 1.5) * GPU_PITCH, -0.100, 0.064) for i in range(4))
# The wide north-edge connector is offset toward the card PCB side.
GPU_NVLINK_SOCKET = (0.014, -0.016, 0.055)
GPU_NVLINK_SOCKET_SIZE = (0.008, 0.100, 0.002)

# Approximate meters derived from the public Dell zone diagrams, not measured CAD.
INTERNAL_LAYOUT = {
    "upper_tray": (0.0, 0.045, 0.128),
    "system_board": (0.0, 0.045, 0.132),
    "cpu": {"a": (-0.090, 0.105, 0.138), "b": (0.090, 0.105, 0.138)},
    "dimm_y": 0.105,
    "dimm_x": {
        "a": (-0.179, -0.172, -0.165, -0.158, -0.151, -0.144, -0.050, -0.043, -0.036, -0.029, -0.022, -0.015),
        "b": (0.015, 0.022, 0.029, 0.036, 0.043, 0.050, 0.144, 0.151, 0.158, 0.165, 0.172, 0.179),
    },
    "gpu": GPU_POSITIONS,
    "nvlink_bridge": (GPU_CENTER_X + GPU_NVLINK_SOCKET[0], -0.116, 0.12375),
    "front_backplane": (0.0, -0.300, 0.1493),
    "boss": (0.0, -0.365, 0.144),
    "gpu_baseboard": (0.0, -0.0175, 0.0045),
    "empty_gpu_x": (0.038, 0.087, 0.136, 0.185),
    "gpu_fan_x": (-0.168, -0.101, -0.034, 0.034, 0.101, 0.168),
    "gpu_fan_z": (0.039, 0.089),
    "cpu_fans": (
        (-0.165, -0.245, 0.150),
        (-0.055, -0.245, 0.150),
        (0.055, -0.245, 0.150),
        (0.165, -0.245, 0.150),
    ),
    "nic": {
        "25g": (0.0, 0.355, 0.020),
        # Rear-view RIGHT, center outward: visual positions 1 and 3 (not Dell slot IDs).
        "100g_01": (-0.063, 0.355, 0.064),
        "100g_02": (-0.105, 0.355, 0.064),
    },
}

# Approximate local part offsets/dimensions and bevel widths, also in meters.
INTERNAL_GEOMETRY = {
    "cpu": {
        "parts": (
            ((0, 0, 0), (0.062, 0.072, 0.004), "CPU_PACKAGE"),
            ((0, 0, 0.0024), (0.052, 0.062, 0.001), "CPU_CAP"),
        ),
        "bevel": 0.00025,
        "socket_size": (0.068, 0.078, 0.002),
        "socket_position": (0, 0, -0.003),
        "socket_bevel": 0.0002,
        "heatsink_parts": (
            # Dell installation Fig. 2 + video 00:50: local base, copper fan-out,
            # wide rear radiator strip and narrower forward extension (a T).
            # Estimated meters fitted to existing sockets; not OEM dimensions.
            ((0, 0, -0.0008), (0.064, 0.080, 0.0046), "CPU_COPPER"),
            *(((-0.0315 + i * 0.0015, 0, 0.010), (0.0006, 0.080, 0.017), "HEATSINK") for i in range(43)),
            ((0, 0, 0.019), (0.046, 0.060, 0.001), "PANEL_BLACK"),
            ((0, 0, 0.0196), (0.015, 0.018, 0.0002), "LABEL"),
            ((0, -0.120, -0.0015), (0.174, 0.044, 0.0018), "CPU_COPPER"),
            ((0, -0.162, -0.0015), (0.116, 0.040, 0.0018), "CPU_COPPER"),
            *(
                ((x, -0.140 if abs(x) < 0.058 else -0.120, 0.01175),
                 (0.0006, 0.084 if abs(x) < 0.058 else 0.044, 0.0265), "HEATSINK")
                for x in (-0.0864 + i * 0.0018 for i in range(97))
            ),
            # Small dark head slots remain legible without engraving text.
            *(( (x, y, 0.0221), (0.003, 0.0006, 0.0002), "PORT_BLACK")
              for x in (-0.030, 0.030) for y in (-0.035, 0, 0.035)),
        ),
        "heatsink_position": (0, 0, 0.006),
        # Thin stamped fins need sharp edges; beveling every fin wastes triangles.
        "heatsink_bevel": 0,
        "dimm_z": 0.151,
        "dimm_parts": (
            ((0, 0, 0), (0.003, 0.130, 0.025), "MEMORY_PCB"),
            ((0, 0, -0.0125), (0.005, 0.132, 0.0015), "CONTACT"),
            *(
                ((0, -0.045 + i * 0.030, 0.001), (0.004, 0.022, 0.017), "MEMORY_CHIP")
                for i in range(4)
            ),
        ),
        "dimm_bevel": 0.00015,
    },
    "gpu": {
        # H200 NVL upright passive PCIe silhouette. Estimated visual details, not CAD.
        # Longitudinal 266.7 mm body, vertical PCB, gold finned shell and black spine.
        "parts": (
            ((0, 0, 0.003), (0.035, 0.2667, 0.092), "PANEL_BLACK"),
            ((0.018, 0, 0.001), (0.0016, 0.2667, 0.107), "GPU_PCB"),
            ((0.0193, 0, 0.0065), (0.001, 0.2667, 0.0979), "PANEL_BLACK"),
            ((-0.0185, 0, 0.0065), (0.001, 0.2667, 0.0979), "GPU_SHROUD"),
            ((0.009, 0, 0.0545), (0.020, 0.2667, 0.002), "PANEL_BLACK"),
            # Sparse stamped fins: linked mesh data avoids four expensive copies.
            *(((-0.007, -0.1302 + i * 0.0084, 0.0545), (0.023, 0.0065, 0.002), "GPU_SHROUD") for i in range(32)),
            *(((-0.0191, -0.1302 + i * 0.0084, 0.0065), (0.0004, 0.0014, 0.0979), "GPU_SHROUD") for i in range(32)),
            # Passive end grilles, not onboard fans or display connectors.
            *(((-0.014 + i * 0.004, y, 0.001), (0.0008, 0.001, 0.086), "GPU_SHROUD") for i in range(8) for y in (-0.1335, 0.1335)),
            # Bracket edge and mounting tab at the same end as the PCIe fingers.
            ((0, -0.135, 0.001), (0.039, 0.0015, 0.10486), "PORT_METAL"),
            ((0, -0.137, 0.052), (0.039, 0.005, 0.002), "PORT_METAL"),
            *(((-0.014 + i * 0.004, -0.1358, 0.002), (0.0022, 0.0003, 0.077), "PORT_BLACK") for i in range(8)),
            ((0.018, -0.035, -0.0535), (0.0016, 0.080, 0.0042), "CONTACT"),
            ((0.018, -0.082, -0.0535), (0.0016, 0.010, 0.0042), "CONTACT"),
            # Restrained auxiliary power connector at the opposite end; no cable.
            ((0.007, 0.134, -0.021), (0.013, 0.002, 0.010), "SOCKET"),
            ((0.007, 0.1351, -0.021), (0.010, 0.0003, 0.006), "PORT_BLACK"),
        ),
        "bevel": 0,
        # One wide rigid four-card bridge, matching the NVIDIA public product image.
        "bridge_parts": (
            ((0, 0, 0), (0.165, 0.106, 0.0035), "NVLINK"),
            ((0, 0, 0.0019), (0.160, 0.101, 0.0003), "PANEL_BLACK"),
        ),
        "bridge_foot_size": (0.008, 0.100, 0.002),
        "bridge_bevel": 0.00015,
    },
    "storage": {
        "backplane_parts": (
            # Two sides leave the central BOSS service corridor open.
            ((-0.12025, 0, 0), (0.1645, 0.006, 0.031), "BOARD_GREEN"),
            ((0.12025, 0, 0), (0.1645, 0.006, 0.031), "BOARD_GREEN"),
            *(
                ((x, -0.004, z), (0.022, 0.004, 0.005), "PORT_BLACK")
                for x in (-0.167, -0.083, 0.083, 0.167)
                for z in (-0.005, 0.005)
            ),
        ),
        "backplane_bevel": 0.0002,
        "boss_parts": (
            ((0, 0, 0), (0.064, 0.105, 0.004), "BOARD_GREEN"),
            ((0, 0.040, 0.004), (0.028, 0.018, 0.006), "MEMORY_CHIP"),
            ((-0.033, -0.006, 0.001), (0.002, 0.112, 0.010), "PORT_METAL"),
            ((0.033, -0.006, 0.001), (0.002, 0.112, 0.010), "PORT_METAL"),
        ),
        "boss_bevel": 0.00025,
        "m2_positions": ((-0.017, -0.018, 0.006), (0.017, -0.018, 0.006)),
        "m2_parts": (
            ((0, 0, 0), (0.022, 0.060, 0.002), "M2_PCB"),
            ((0, -0.014, 0.002), (0.016, 0.020, 0.003), "MEMORY_CHIP"),
            ((0, 0.017, 0.002), (0.016, 0.012, 0.003), "MEMORY_CHIP"),
            ((0, 0.027, 0.002), (0.006, 0.003, 0.003), "CONTACT"),
        ),
        "m2_bevel": 0.00015,
    },
    "cooling": {
        "gpu_fan_y": -0.365,
        "gpu_fan_parts": (
            ((0, 0, 0), (0.062, 0.044, 0.046), "FAN_HOUSING"),
            ((0, -0.023, 0), (0.043, 0.002, 0.004), "FAN_ROTOR"),
            ((0, -0.023, 0), (0.004, 0.002, 0.043), "FAN_ROTOR"),
        ),
        "gpu_fan_bevel": 0.0003,
        "gpu_rotor": (0.018, 0.004, (0, -0.024, 0), 12),
        "cpu_fan_parts": (
            ((0, 0, 0), (0.096, 0.042, 0.032), "FAN_HOUSING"),
            ((-0.024, -0.022, 0), (0.031, 0.002, 0.003), "FAN_ROTOR"),
            ((-0.024, -0.022, 0), (0.003, 0.002, 0.031), "FAN_ROTOR"),
            ((0.024, -0.022, 0), (0.031, 0.002, 0.003), "FAN_ROTOR"),
            ((0.024, -0.022, 0), (0.003, 0.002, 0.031), "FAN_ROTOR"),
        ),
        "cpu_fan_bevel": 0.0003,
        "cpu_rotor": (0.013, 0.004, -0.023, (-0.024, 0.024), 12),
    },
    "network": {
        "adapter_parts": (
            # Extend the existing PCB to its port cages; parenting was already correct.
            ((0, -0.0035, 0), (0.072, 0.141, 0.004), "BOARD_GREEN"),
            ((0, 0.035, 0.004), (0.045, 0.018, 0.007), "MEMORY_CHIP"),
            ((0, -0.048, 0), (0.064, 0.006, 0.020), "PORT_METAL"),
        ),
        "adapter_bevel": 0.00025,
        "qsfp_adapter_parts": (
            ((0, 0, 0), (0.003, 0.110, 0.090), "BOARD_GREEN"),
            ((-0.004, 0.005, 0), (0.006, 0.046, 0.038), "MEMORY_CHIP"),
            *(((-0.008, -0.012 + i * 0.006, 0), (0.004, 0.002, 0.034), "HEATSINK") for i in range(7)),
            ((0, -0.034, -0.046), (0.003, 0.045, 0.005), "CONTACT"),
        ),
    },
    "structure": {
        "chassis_parts": (
            ((-0.216, 0, 0.075), (0.004, 0.790, 0.142), "CHASSIS_DARK_METAL"),
            ((0.216, 0, 0.075), (0.004, 0.790, 0.142), "CHASSIS_DARK_METAL"),
            *(( (x, y + 0.390, z), size, material)
              for (x, y, z), size, material in rear_service_frame(0.428, 0.004, 0.146, "CHASSIS_DARK_METAL")),
        ),
        "chassis_bevel": 0.0002,
        "tray_parts": (
            ((0, 0, 0), (0.424, 0.690, 0.003), "CHASSIS_DARK_METAL"),
            ((-0.209, 0, 0.010), (0.003, 0.690, 0.020), "PORT_METAL"),
            ((0.209, 0, 0.010), (0.003, 0.690, 0.020), "PORT_METAL"),
        ),
        "tray_bevel": 0.0002,
        "board_parts": (
            ((0, 0, 0), (0.405, 0.650, 0.003), "BOARD_GREEN"),
            ((0, 0.292, 0.003), (0.250, 0.040, 0.004), "PORT_BLACK"),
        ),
        "board_bevel": 0.0002,
        "gpu_mount_size": (0.039, 0.292, 0.004),
        # Clear the fixed front sheet, rear wall and inner sidewalls.
        "gpu_baseboard_size": (0.424, 0.811, 0.001),
        "gpu_mount_z": 0.008,
        "gpu_mount_bevel": 0.0002,
    },
}


def _heatsink_pipes(g, heatsink):
    """One copper mesh: rounded tubes splay only after clearing the DIMM ends."""
    vertices, faces = [], []
    # ponytail: ten visible tube runs, estimated from imagery; replace with measured paths if CAD becomes available.
    for index in range(10):
        start_x = -0.0225 + index * 0.005
        end_x = -0.050 + index * 0.100 / 9
        centers = []
        for step in range(27):
            y = 0.045 - step * 0.195 / 26
            t = max(0, min(1, (-y - 0.060) / 0.070))
            centers.append(Vector((start_x + (end_x - start_x) * t * t * (3 - 2 * t), y, 0.0015)))
        start = len(vertices)
        for step, center in enumerate(centers):
            tangent = centers[min(step + 1, 26)] - centers[max(step - 1, 0)]
            side = tangent.cross(Vector((0, 0, 1))).normalized()
            for ring in range(8):
                angle = ring * math.tau / 8
                vertices.append(center + 0.0022 * (math.cos(angle) * side + Vector((0, 0, math.sin(angle)))))
        faces.append(tuple(start + i for i in range(8)))
        for step in range(26):
            for ring in range(8):
                a = start + step * 8 + ring
                b = start + step * 8 + (ring + 1) % 8
                faces.append((a, a + 8, b + 8, b))
        faces.append(tuple(start + 26 * 8 + i for i in reversed(range(8))))
    mesh = g.mesh(f"{heatsink.name}_pipes")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(g.materials["CPU_COPPER"])
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    mesh.update()
    g.object(f"{heatsink.name}_pipes", mesh, heatsink)


def _component(obj, asset_type, slot, group):
    return metadata(
        obj,
        assetType=asset_type,
        slot=slot,
        selectable=True,
        focusable=True,
        explodable=True,
        explodeGroup=group,
    )


def _build_cpus(g, parent, spec):
    shape = INTERNAL_GEOMETRY["cpu"]
    first_dimm = None
    memory = g.object("memory", parent=parent)
    metadata(memory, selectable=False, explodable=True, explodeGroup="upper-tray")
    cpu_zone = g.object("cpu_zone", parent=parent)
    metadata(cpu_zone, selectable=False, explodable=True, explodeGroup="upper-tray")
    for socket in spec["cpu_sockets"]:
        cpu = g.part(
            f"cpu_{socket}",
            shape["parts"],
            cpu_zone,
            INTERNAL_LAYOUT["cpu"][socket],
            shape["bevel"],
        )
        _component(cpu, "cpu", f"CPU-{socket.upper()}", "cpu")
        socket_obj = g.box(
            f"cpu_{socket}_socket",
            shape["socket_size"],
            shape["socket_position"],
            cpu,
            "SOCKET",
            shape["socket_bevel"],
        )
        metadata(socket_obj, interactionRole="cpu-socket", explodable=False)
        heatsink = g.part(
            f"cpu_{socket}_heatsink",
            shape["heatsink_parts"],
            cpu,
            shape["heatsink_position"],
            shape["heatsink_bevel"],
        )
        metadata(
            heatsink,
            interactionRole="heatsink",
            explodable=True,
            explodeGroup="cpu-heatsink",
        )
        _heatsink_pipes(g, heatsink)
        for index, (x, y) in enumerate(((x, y) for x in (-0.030, 0.030) for y in (-0.035, 0, 0.035)), 1):
            screw = g.cylinder(f"{heatsink.name}_screw_{index}", 0.0025, 0.018,
                               heatsink, (x, y, 0.013), "PORT_METAL", 12)
            screw.rotation_euler.x = math.pi / 2
        for index, x in enumerate(INTERNAL_LAYOUT["dimm_x"][socket], 1):
            name = f"dimm_{socket}{index:02d}"
            position = (x, INTERNAL_LAYOUT["dimm_y"], shape["dimm_z"])
            if first_dimm is None:
                dimm = g.part(
                    name,
                    shape["dimm_parts"],
                    memory,
                    position,
                    shape["dimm_bevel"],
                )
                first_dimm = dimm
            else:
                dimm = g.duplicate(first_dimm, name, memory, position)
            _component(
                dimm,
                "memory",
                f"DIMM-{socket.upper()}{index:02d}",
                f"memory-{socket}",
            )


def _build_gpus(g, parent, spec):
    shape = INTERNAL_GEOMETRY["gpu"]
    gpu_zone = g.object("gpu_zone", parent=parent)
    metadata(gpu_zone, selectable=False, explodable=True, explodeGroup="gpu-zone")
    first = None
    for index, (position, physical_slot) in enumerate(
        zip(INTERNAL_LAYOUT["gpu"], spec["gpu_slots"]), 1
    ):
        name = f"gpu_{index:02d}"
        gpu = (
            g.part(name, shape["parts"], gpu_zone, position, shape["bevel"])
            if first is None
            else g.duplicate(first, name, gpu_zone, position)
        )
        first = first or gpu
        _component(gpu, "gpu", f"GPU-{index:02d}", "gpu")
        metadata(gpu, physicalSlot=physical_slot, formFactor="PCIe dual-slot", visualVariant="H200 NVL")
        socket = g.box(f"{name}_nvlink_socket", GPU_NVLINK_SOCKET_SIZE,
                       GPU_NVLINK_SOCKET, gpu, "SOCKET", 0)
        # Visual children inherit GPU selection and travel with their card.
        metadata(socket, interactionRole="nvlink-socket")

    bridge = g.part(
        "nvlink_bridge_4way", shape["bridge_parts"], gpu_zone,
        INTERNAL_LAYOUT["nvlink_bridge"], shape["bridge_bevel"],
    )
    for index, position in enumerate(GPU_POSITIONS, 1):
        # Derive each foot from its socket: no independent hand-positioned connector.
        socket_world = Vector(position) + Vector(GPU_NVLINK_SOCKET)
        socket_world.z += GPU_NVLINK_SOCKET_SIZE[2] / 2 + shape["bridge_foot_size"][2] / 2
        foot = g.box(f"nvlink_connector_{index:02d}", shape["bridge_foot_size"],
                     socket_world - Vector(INTERNAL_LAYOUT["nvlink_bridge"]), bridge, "CONTACT", 0)
        metadata(foot, interactionRole="nvlink-connector", physicalSlot=spec["gpu_slots"][index - 1])
    metadata(
        bridge,
        assetType="gpu-interconnect",
        interactionRole="nvlink-bridge",
        slot="NVLINK-01",
        selectable=True,
        focusable=True,
        explodable=True,
        explodeGroup="nvlink-bridge",
        physicalSlots=list(spec["gpu_slots"]),
    )


def _build_storage(g, parent, spec):
    shape = INTERNAL_GEOMETRY["storage"]
    storage = g.object("storage", parent=parent)
    metadata(storage, selectable=False, explodable=True, explodeGroup="storage")
    backplane = g.part(
        "front_storage_backplane",
        shape["backplane_parts"],
        storage,
        INTERNAL_LAYOUT["front_backplane"],
        shape["backplane_bevel"],
    )
    metadata(backplane, selectable=False, explodable=True, explodeGroup="front-storage")
    boss = g.part(
        "boss_n1",
        shape["boss_parts"],
        storage,
        INTERNAL_LAYOUT["boss"],
        shape["boss_bevel"],
    )
    _component(boss, "storage-controller", "BOSS", "boss")
    _reparent_ports(boss, ["front_boss_n1"])
    first = None
    for index in range(1, spec["boss_m2_count"] + 1):
        name = f"boss_m2_{index:02d}"
        position = shape["m2_positions"][index - 1]
        if first is None:
            drive = g.part(
                name,
                shape["m2_parts"],
                boss,
                position,
                shape["m2_bevel"],
            )
            first = drive
        else:
            drive = g.duplicate(first, name, boss, position)
        _component(drive, "drive", f"BOSS-M2-{index:02d}", "boss-m2")
        drive["location"] = "internal"
    for index in range(1, spec["front_drive_count"] + 1):
        drive = bpy.data.objects.get(f"front_drive_{index:02d}")
        if drive is None:
            raise RuntimeError(f"Missing existing front drive {index:02d}")
        _component(drive, "drive-bay", f"SSD-{index:02d}", "front-storage")
        drive["location"] = "front"


def _build_cooling(g, parent):
    shape = INTERNAL_GEOMETRY["cooling"]
    cooling = g.object("cooling", parent=parent)
    metadata(cooling, selectable=False, explodable=True, explodeGroup="cooling")
    first = None
    index = 0
    for z in INTERNAL_LAYOUT["gpu_fan_z"]:
        for x in INTERNAL_LAYOUT["gpu_fan_x"]:
            index += 1
            name = f"fan_module_{index:02d}"
            position = (x, shape["gpu_fan_y"], z)
            fan = (
                g.part(name, shape["gpu_fan_parts"], cooling, position, shape["gpu_fan_bevel"])
                if first is None
                else g.duplicate(first, name, cooling, position)
            )
            first = first or fan
            metadata(
                fan,
                assetType="fan-module",
                interactionRole="cooling-support",
                selectable=False,
                explodable=True,
                explodeGroup="cooling-gpu",
            )
            radius, depth, rotor_position, segments = shape["gpu_rotor"]
            rotor = (
                g.cylinder(
                    f"{name}_rotor", radius, depth, fan, rotor_position, "FAN_ROTOR", segments
                )
                if index == 1
                else g.duplicate(
                    bpy.data.objects["fan_module_01_rotor"],
                    f"{name}_rotor",
                    fan,
                    rotor_position,
                )
            )
            metadata(rotor, interactionRole="fan-rotor")
    first = None
    for position in INTERNAL_LAYOUT["cpu_fans"]:
        index += 1
        name = f"fan_module_{index:02d}"
        fan = (
            g.part(name, shape["cpu_fan_parts"], cooling, position, shape["cpu_fan_bevel"])
            if first is None
            else g.duplicate(first, name, cooling, position)
        )
        first = first or fan
        metadata(
            fan,
            assetType="fan-module",
            interactionRole="cooling-support",
            selectable=False,
            explodable=True,
            explodeGroup="cooling-upper",
        )
        radius, depth, rotor_y, rotor_xs, segments = shape["cpu_rotor"]
        for label, x in zip(("left", "right"), rotor_xs):
            source_name = f"fan_module_13_rotor_{label}"
            rotor = (
                g.cylinder(source_name, radius, depth, fan, (x, rotor_y, 0), "FAN_ROTOR", segments)
                if index == 13
                else g.duplicate(
                    bpy.data.objects[source_name],
                    f"{name}_rotor_{label}",
                    fan,
                    (x, rotor_y, 0),
                )
            )
            metadata(rotor, interactionRole="fan-rotor")


def _reparent_ports(adapter, names):
    bpy.context.view_layer.update()
    for name in names:
        port = bpy.data.objects.get(name)
        if port is None:
            raise RuntimeError(f"Missing existing network port {name}")
        world = port.matrix_world.copy()
        port.parent = adapter
        port.matrix_world = world


def _build_network(g, parent):
    shape = INTERNAL_GEOMETRY["network"]
    network = g.object("network", parent=parent)
    metadata(network, selectable=False, explodable=True, explodeGroup="network")
    adapter_25 = g.part(
        "nic_25g_adapter", shape["adapter_parts"], network,
        INTERNAL_LAYOUT["nic"]["25g"], shape["adapter_bevel"]
    )
    metadata(adapter_25, assetType="network-adapter", selectable=False, explodable=True, explodeGroup="network")
    _reparent_ports(adapter_25, ["rear_nic_25g_01", "rear_nic_25g_02"])
    first = None
    for index in range(1, 3):
        name = f"nic_100g_adapter_{index:02d}"
        position = INTERNAL_LAYOUT["nic"][f"100g_{index:02d}"]
        adapter = (
            g.part(name, shape["qsfp_adapter_parts"], network, position, shape["adapter_bevel"])
            if first is None
            else g.duplicate(first, name, network, position)
        )
        first = first or adapter
        metadata(adapter, assetType="network-adapter", selectable=False, explodable=True,
                 explodeGroup="network", rearViewBank="right", rearViewPosition=2 * index - 1)
        _reparent_ports(
            adapter,
            [f"rear_nic_100g_{2 * index - 1:02d}", f"rear_nic_100g_{2 * index:02d}"],
        )
        # Occupied bracket travels with its card; empty neighboring slot covers stay fixed.
        _reparent_ports(adapter, [f"rear_expansion_left_{2 * index - 1}"])


def _build_board_details(g, board, gpu_board):
    """Decorative approximations distributed around the existing service clearances."""
    templates = {}

    def add(parent, kind, index, x, y, size):
        name = f"{parent.name}_{kind}_{index:02d}"
        shape = "capacitor" if kind == "capacitor" else "resistor" if kind == "resistor" else "box"
        key = (shape, *size)
        if key in templates:
            obj = g.duplicate(templates[key], name, parent, (x, y, 0))
        elif shape == "resistor":
            mesh = g.mesh(name)
            mesh.from_pydata([(x * size[0], y * size[1], 0) for x, y in [(-.25, -.5), (.25, -.5), (.25, .5), (-.25, .5)]], [], [(0, 1, 2, 3)])
            mesh.materials.append(g.materials["PORT_BLACK"])
            obj = g.object(name, mesh, parent, (x, y, 0))
        else:
            obj = (g.cylinder(name, size[0] / 2, size[1], parent, (x, y, 0), "PORT_METAL", segments=6)
                   if shape == "capacitor" else g.box(name, size, (x, y, 0), parent, "PORT_BLACK", 0))
            # ponytail: undersides are permanently against the PCB; restore caps if parts become removable.
            mesh = obj.data
            bm = bmesh.new()
            bm.from_mesh(mesh)
            axis = 1 if shape == "capacitor" else 2
            bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.calc_center_median()[axis] < -size[axis] / 2 + 1e-7], context='FACES_ONLY')
            if shape == "capacitor":
                bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
            bm.to_mesh(mesh)
            bm.free()
            if shape == "box":
                for vertex in mesh.vertices:
                    vertex.co.z += size[2] / 2
            mesh.update()
        templates.setdefault(key, obj)
        if shape == "capacitor":
            obj.rotation_euler.x = math.pi / 2
            obj.location.z = size[1] / 2
        if shape == "resistor":
            obj.location.z = .00015
            ends_name = f"{name}_ends"
            if "resistor_ends" in templates:
                ends = g.duplicate(templates["resistor_ends"], ends_name, obj, (0, 0, 0))
            else:
                mesh = g.mesh(ends_name)
                mesh.from_pydata([(x * size[0], y * size[1], 0) for a, b in [(-.5, -.25), (.25, .5)]
                                  for x, y in [(a, -.5), (b, -.5), (b, .5), (a, .5)]], [], [(0, 1, 2, 3), (4, 5, 6, 7)])
                mesh.materials.append(g.materials["PORT_METAL"])
                ends = g.object(ends_name, mesh, obj)
                templates["resistor_ends"] = ends
            metadata(ends, selectable=False, focusable=False, explodable=False, decorative=True)
        metadata(obj, selectable=False, focusable=False, explodable=False, decorative=True, decorativeKind=kind)
        return obj

    # Global board-plane X/Y in meters. Narrow side parts and passive strips occupy
    # corridors that the CPU/DIMM and GPU/blank footprints leave genuinely free.
    layouts = [
        (board, .0015, [
            (-.166, -.176, .034, .030), (-.113, -.145, .036, .025),
            (-.054, -.116, .029, .022), (.012, -.158, .042, .032),
            (.076, -.128, .032, .024), (.147, -.170, .042, .028),
            (-.151, .222, .038, .029), (-.084, .270, .044, .029),
            (-.022, .222, .035, .028), (.041, .278, .048, .029),
            (.111, .215, .034, .025), (.167, .283, .030, .024),
            (-.191, -.034, .012, .027), (.192, -.020, .010, .025),
            (-.191, .093, .011, .023), (.192, .126, .010, .022),
            (-.130, .285, .015, .018), (.085, .266, .014, .020),
        ], [(-.146, -.113), (.173, -.119), (-.054, .271), (.151, .221)],
         [(-.192, .164), (.192, .045), (-.079, -.105), (.095, -.176), (-.042, .199), (.152, .303)],
         [(-.045, -.196), (.045, -.196), (-.174, .295), (.149, .190)]),
        (gpu_board, .0005, [
            (-.162, -.297, .032, .026), (-.105, -.289, .035, .026),
            (-.048, -.315, .034, .022), (.081, -.292, .042, .027),
            (.151, -.304, .035, .030), (-.137, .104, .042, .030),
            (-.058, .083, .033, .025), (.028, .140, .052, .034),
            (.137, .091, .048, .032), (-.164, .211, .034, .035),
            (-.074, .183, .031, .027), (.102, .210, .044, .030),
            (-.199, -.144, .014, .034), (-.198, -.028, .014, .025),
            (.023, .084, .015, .020), (.178, .160, .018, .025),
            (-.018, .214, .015, .020), (.025, .254, .014, .020),
        ], [(-.178, .156), (-.036, .128), (.070, .224), (.181, -.276)],
         [(.0625, -.144), (.1115, -.093), (.1605, -.020), (-.185, -.236), (.181, .224), (-.043, .252)],
         [(-.008, -.266), (.048, -.266), (-.132, .169), (.159, .263)]),
    ]
    for owner, surface_z, chips, caps, resistors, headers in layouts:
        groups = [g.object(f"{owner.name}_details_{i:02d}", parent=owner,
                           position=(0, -owner.location.y, surface_z)) for i in (1, 2)]
        for group in groups:
            metadata(group, selectable=False, focusable=False, explodable=False, decorative=True)
        for i, (x, y, w, d) in enumerate(chips, 1):
            add(groups[y >= 0], "ic" if i <= 12 else "regulator", i, x, y, (w, d, .002 if i <= 12 else .003))
        for i, (x, y) in enumerate(caps, 1):
            add(groups[y >= 0], "capacitor", i, x, y, (.008, .005, .008))
        for i, (x, y) in enumerate(resistors, 1):
            add(groups[y >= 0], "resistor", i, x, y, (.007, .0025, 1))
        for i, (x, y) in enumerate(headers, 1):
            add(groups[y >= 0], "header", i, x, y, (.014, .008, .004))
        # One short flat U-shaped cable per board, terminating under its first two headers.
        (x1, y), (x2, _) = headers[:2]
        cable = g.object(f"{owner.name}_details_01_cable", parent=groups[0])
        metadata(cable, selectable=False, focusable=False, explodable=False, decorative=True, decorativeKind="cable")
        for i, (x, cy, w, d) in enumerate([
            (x1, y - .010, .003, .016),
            ((x1 + x2) / 2, y - .0195, x2 - x1 + .003, .003),
            (x2, y - .010, .003, .016),
        ], 1):
            segment = add(cable, "cable", i, x, cy, (w, d, .0014))
            del segment["decorativeKind"]


def generate_internals(g, root, spec=INTERNAL_SPEC):
    """Build the complete simplified two-zone internal assembly."""
    internals = g.object("internals", parent=root)
    metadata(internals, selectable=False, explodable=True, interactionRole="internals")
    shape = INTERNAL_GEOMETRY["structure"]
    internal_chassis = g.part(
        "internal_chassis",
        shape["chassis_parts"],
        internals,
        bevel=shape["chassis_bevel"],
    )
    metadata(internal_chassis, selectable=False, explodable=False, interactionRole="chassis")
    upper_tray = g.part(
        "upper_tray",
        shape["tray_parts"],
        internals,
        INTERNAL_LAYOUT["upper_tray"],
        shape["tray_bevel"],
    )
    metadata(upper_tray, selectable=False, explodable=True, explodeGroup="upper-tray", interactionRole="upper-tray")
    board = g.part(
        "system_board",
        shape["board_parts"],
        internals,
        INTERNAL_LAYOUT["system_board"],
        shape["board_bevel"],
    )
    metadata(board, assetType="system-board", selectable=False, explodable=True, explodeGroup="upper-tray")
    gpu_board = g.box("gpu_baseboard", shape["gpu_baseboard_size"],
                      INTERNAL_LAYOUT["gpu_baseboard"], internals, "BOARD_GREEN", 0.00015)
    metadata(gpu_board, assetType="gpu-baseboard", selectable=False, explodable=False)
    _build_board_details(g, board, gpu_board)
    _build_cpus(g, internals, spec)
    _build_gpus(g, internals, spec)
    _build_storage(g, internals, spec)
    _build_cooling(g, internals)
    _build_network(g, internals)
    pcie = g.object("pcie", parent=internals)
    metadata(pcie, selectable=False, explodable=True, explodeGroup="pcie")
    for index, position in enumerate(INTERNAL_LAYOUT["gpu"], 1):
        mount = g.box(
            f"gpu_mount_{index:02d}",
            shape["gpu_mount_size"],
            (position[0], position[1], shape["gpu_mount_z"]),
            pcie,
            "PORT_METAL",
            shape["gpu_mount_bevel"],
        )
        metadata(mount, selectable=False, explodable=True, explodeGroup="pcie")
    # Vacant double-width mounting context, not additional accelerator assets.
    for index, x in enumerate(INTERNAL_LAYOUT["empty_gpu_x"], 1):
        empty = g.box(
            f"gpu_empty_slot_{index:02d}", (0.036, 0.292, 0.004),
            (x, -0.100, shape["gpu_mount_z"]), pcie, "PORT_METAL", 0.0002,
        )
        metadata(empty, assetType="empty-gpu-slot", selectable=False, explodable=True, populated=False)
    from pcb import finish_pcb

    bpy.context.view_layer.update()
    finish_pcb(g, board, .405, .650, "CPU", INTERNAL_LAYOUT)
    finish_pcb(g, gpu_board, .424, .811, "GPU", INTERNAL_LAYOUT)
    return internals
