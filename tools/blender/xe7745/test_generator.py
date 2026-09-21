"""Run in background Blender. Checks reruns, scene isolation, source reopening and export."""

from pathlib import Path
import hashlib
import json
import re
import struct
import sys
import tempfile
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_xe7745 import main
from generate_xe7745_exterior import (
    configure_viewport,
    PROJECT,
    COLLECTION,
    SCENE,
    XE7745_SPEC,
    validate_scene,
)
from geometry import Geometry, palette
from validate_glb import validate_glb


def mutated_glb(path, mutate, destination):
    binary = path.read_bytes()
    json_length, json_kind = struct.unpack_from("<II", binary, 12)
    doc = json.loads(binary[20 : 20 + json_length])
    mutate(doc)
    payload = json.dumps(doc, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    tail = binary[20 + json_length :]
    destination.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 20 + len(payload) + len(tail))
        + struct.pack("<II", len(payload), json_kind)
        + payload
        + tail
    )


def expect_glb_rejected(glb, label, mutate):
    with tempfile.TemporaryDirectory(prefix="interactive-3d-rack-twin-xe7745-invalid-") as temporary:
        path = Path(temporary) / "invalid.glb"
        mutated_glb(glb, mutate, path)
        try:
            validate_glb(path, require_internals=True)
        except ValueError:
            return
        raise AssertionError(f"Validator accepted {label}")


def node(doc, name):
    return next(item for item in doc["nodes"] if item["name"] == name)

sentinel = bpy.data.objects.new("UNRELATED_USER_OBJECT", None)
bpy.context.scene.collection.objects.link(sentinel)
main(include_internals=True)
glb = PROJECT / "public/assets/models/servers/poweredge-xe7745.glb"
first = validate_glb(glb, require_internals=True)
fingerprint = hashlib.sha256(glb.read_bytes()).hexdigest()
names = sorted(obj.name for obj in bpy.data.collections[COLLECTION].all_objects)

cpu_zone = bpy.data.objects["cpu_zone"]
cpu_zone.name = "missing_cpu_zone"
try:
    validate_scene(bpy.data.collections[COLLECTION], XE7745_SPEC, require_internals=True)
except RuntimeError:
    pass
else:
    raise AssertionError("Pre-export validation accepted a missing cpu_zone root")
finally:
    cpu_zone.name = "cpu_zone"

foreign_mesh = bpy.data.meshes.new("collision_probe_mesh")
probe = None
try:
    probe = Geometry(bpy.data.collections[COLLECTION], palette()).part(
        "collision_probe",
        [((0, 0, 0), (0.001, 0.001, 0.001), "PANEL_BLACK")],
        bpy.data.objects["internals"],
    )
except RuntimeError:
    pass
else:
    raise AssertionError("Geometry accepted a conflicting mesh datablock name")
finally:
    if probe:
        bpy.data.objects.remove(probe, do_unlink=True)
    bpy.data.meshes.remove(foreign_mesh)

for component, field in [
    ("gpu_01", "selectable"),
    ("cpu_a", "focusable"),
    ("dimm_a01", "explodable"),
    ("boss_n1", "assetType"),
    ("boss_m2_01", "location"),
]:
    expect_glb_rejected(
        glb,
        f"{component} without {field}",
        lambda doc, component=component, field=field: node(doc, component)["extras"].pop(field),
    )


def detach_nic(doc):
    port_index = doc["nodes"].index(node(doc, "rear_nic_25g_01"))
    node(doc, "nic_25g_adapter")["children"].remove(port_index)
    node(doc, "network").setdefault("children", []).append(port_index)


expect_glb_rejected(glb, "detached NIC port", detach_nic)
expect_glb_rejected(glb, "external PCB image", lambda doc: doc["images"][0].update(uri="outside.png"))
expect_glb_rejected(glb, "excess PCB images", lambda doc: doc["images"].append(doc["images"][0]))
expect_glb_rejected(glb, "invalid PCB image payload", lambda doc: doc["images"][0].update(bufferView=0))
bpy.data.collections[COLLECTION].objects.link(sentinel)
try:
    main(include_internals=True)
except RuntimeError as error:
    assert "unrelated" in str(error).lower()
else:
    raise AssertionError(
        "Rerun should refuse a collection containing unrelated objects"
    )
assert bpy.data.objects.get("UNRELATED_USER_OBJECT") is sentinel
assert "XE7745_ROOT" in bpy.data.objects, "Failed preflight deleted generated data"
bpy.data.collections[COLLECTION].objects.unlink(sentinel)
main(include_internals=True)
assert bpy.data.objects.get("UNRELATED_USER_OBJECT") is sentinel, (
    "Generator removed unrelated data"
)
assert (
    sorted(obj.name for obj in bpy.data.collections[COLLECTION].all_objects) == names
), "Duplicate names after rerun"
assert validate_glb(glb, require_internals=True) == first, "Geometry changed on identical rerun"
assert hashlib.sha256(glb.read_bytes()).hexdigest() == fingerprint, (
    "GLB not byte-deterministic in same Blender version"
)
world = bpy.data.worlds["XE7745_WORLD"]
world["rackTwinGenerated"] = False
world.color = (0.2, 0.3, 0.4)
previous = tuple(world.color)
try:
    configure_viewport(bpy.context.scene)
except RuntimeError:
    pass
else:
    raise AssertionError("Unrelated world should not be reused")
assert tuple(world.color) == previous
bpy.ops.wm.open_mainfile(filepath=str(PROJECT / "blender/poweredge-xe7745.blend"))
assert list(bpy.data.scenes.keys()) == [SCENE], "Saved source contains unrelated scenes"
assert "UNRELATED_USER_OBJECT" not in bpy.data.objects, (
    "Unrelated work leaked into generated source"
)
assert sorted(obj.name for obj in bpy.data.collections[COLLECTION].all_objects) == names
images = [image for image in bpy.data.images if image.name.startswith("XE7745_")]
assert len(images) == 6 and all(image.packed_file for image in images), "PCB maps must survive packed in the source"
assert bpy.data.objects["top_cover"].type == "MESH"
assert bpy.data.objects["nvlink_bridge_4way"].parent.name == "gpu_zone"
assert bpy.data.objects["cpu_a_heatsink"].parent.name == "cpu_a"
assert bpy.data.objects["cpu_b_heatsink"].parent.name == "cpu_b"
assert bpy.data.objects["boss_m2_01"].parent.name == "boss_n1"
assert bpy.data.objects["boss_m2_02"].parent.name == "boss_n1"
for pattern, count in ((r"gpu_\d{2}", 4), (r"dimm_[ab]\d{2}", 24), (r"fan_module_\d{2}", 16)):
    assert sum(bool(re.fullmatch(pattern, obj.name)) for obj in bpy.data.objects) == count
assert len({bpy.data.objects[f"gpu_{i:02d}"].data for i in range(1, 5)}) == 1
from mathutils import Vector
for i in range(1, 5):
    gpu = bpy.data.objects[f"gpu_{i:02d}"]
    socket = bpy.data.objects[f"gpu_{i:02d}_nvlink_socket"]
    foot = bpy.data.objects[f"nvlink_connector_{i:02d}"]
    assert gpu["formFactor"] == "PCIe dual-slot"
    assert socket.parent == gpu and foot.parent.name == "nvlink_bridge_4way"
    contact = socket.matrix_world.translation + Vector((0, 0, socket.dimensions.z / 2))
    bottom = foot.matrix_world.translation - Vector((0, 0, foot.dimensions.z / 2))
    assert (contact - bottom).length < 1e-6, "Bridge foot must seat on its GPU socket"
    assert gpu.dimensions.z > .105 and .265 < gpu.dimensions.y < .28
    if i > 1:
        previous = bpy.data.objects[f"gpu_{i-1:02d}"]
        assert abs(gpu.location.x - previous.location.x - .04064) < 1e-6
bridge = bpy.data.objects["nvlink_bridge_4way"]
assert bridge.dimensions.y > .09
assert len({bpy.data.objects[f"dimm_{bank}{i:02d}"].data for bank in "ab" for i in range(1, 13)}) == 1
assert len({bpy.data.objects[f"boss_m2_{i:02d}"].data for i in range(1, 3)}) == 1
assert len({bpy.data.objects[f"fan_module_{i:02d}"].data for i in range(1, 13)}) == 1
assert len({bpy.data.objects[f"fan_module_{i:02d}"].data for i in range(13, 17)}) == 1
assert bpy.data.scenes[SCENE].unit_settings.scale_length == 1
assert "XE7745_ROOT" in bpy.context.scene.objects
space = next(
    area.spaces.active for area in bpy.context.screen.areas if area.type == "VIEW_3D"
)
assert abs(space.region_3d.view_distance - 1.5) < 0.001, (
    "Saved source did not retain its beginner-friendly framing"
)
print(
    f"XE7745 generator checks passed: repeatable geometry, preserved user objects, clean .blend reopen. SHA256: {fingerprint}"
)
