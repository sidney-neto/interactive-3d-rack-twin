"""Original web-optimized S5232F-ON exterior; not Dell CAD.

Run from Blender Scripting > Open > Run Script, or ./generate.sh.
Reuses Section 2.2 geometry without modifying the XE7745 generator or assets.
"""
from pathlib import Path
import json
import math
import subprocess
import sys
import tempfile

import bpy
from mathutils import Vector, Quaternion

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT = SCRIPT_DIR.parents[2]
sys.path.insert(0, str(SCRIPT_DIR.parent / "xe7745"))
sys.path.insert(0, str(SCRIPT_DIR))
from geometry import migrate_legacy_branding, Geometry, metadata, palette
from config import S5232F_SPEC as SPEC, qsfp_position
from validate_s5232f import validate_glb

COLLECTION = "INTERACTIVE_3D_RACK_TWIN_S5232F_GENERATED"
SCENE = "INTERACTIVE_3D_RACK_TWIN_S5232F_PREVIEW"


def initialize():
    migrate_legacy_branding()
    old = bpy.data.collections.get(COLLECTION)
    if old:
        if not old.get("rackTwinGenerated") or old.children or any(not o.get("rackTwinGenerated") for o in old.all_objects):
            raise RuntimeError("Generated collection contains unrelated work; move it out before rerunning.")
        for obj in list(old.objects):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if isinstance(mesh, bpy.types.Mesh) and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        bpy.data.collections.remove(old)
    scene = bpy.data.scenes.get(SCENE)
    if scene and not scene.get("rackTwinGenerated"):
        raise RuntimeError(f"Unrelated scene named {SCENE}")
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


def label(g, name, text, parent, position, size=0.003, psu=False):
    curve = bpy.data.curves.new(f"{name}_font", "FONT")
    curve.body, curve.size, curve.align_x = text, size, "CENTER"
    curve.resolution_u = 1
    obj = g.object(name, curve, parent, position)
    obj.rotation_euler = (math.pi / 2, 0, math.pi if psu else 0)
    curve.materials.append(g.materials["LABEL"])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    if curve.users == 0:
        bpy.data.curves.remove(curve)
    return obj


def cage(w, h, depth=0.012, connector_hint=True):
    """Hollow rim, four short walls, recessed dark backing and a latch edge."""
    t = 0.00065
    return [
        ((0, depth - .0005, 0), (w, .001, h), "PORT_BLACK"),
        *((((side * (w / 2 - t / 2), depth / 2, 0)), (t, depth, h), "PORT_METAL") for side in (-1, 1)),
        *((((0, depth / 2, side * (h / 2 - t / 2))), (w, depth, t), "PORT_METAL") for side in (-1, 1)),
        ((0, .001, -h / 2 + .001), (w * .38, .002, .0006), "LATCH"),
        *([((0, depth - .0014, -h * .28), (w * .65, .001, .001), "MEMORY_PCB")] if connector_hint else []),
    ]


def chassis(g, root):
    w, d, h = SPEC["width_m"], SPEC["depth_m"], SPEC["height_m"]
    parent = g.object("chassis", parent=root)
    g.part("chassis_shell", [
        ((0, 0, .001), (w, d, .002), "CHASSIS_DARK_METAL"),
        *((((side * (w / 2 - .001), 0, h / 2)), (.002, d, h), "CHASSIS_DARK_METAL") for side in (-1, 1)),
    ], parent, bevel=.0003)
    g.box("top_panel", (w, d, .0015), (0, 0, h - .00075), parent)
    # Sparse surface slots suggest ventilation without booleans.
    slots = [((side * (w / 2 + .00002), -.12 + i * .007, h * .57), (.0001, .003, .016), "PORT_BLACK")
             for side in (-1, 1) for i in range(30)]
    g.part("side_ventilation", slots, parent, bevel=0)
    for side, suffix in [(-1, "left"), (1, "right")]:
        ew = (SPEC["mounting_width_m"] - w) / 2
        g.part(f"rack_ear_{suffix}", [
            ((0, 0, 0), (ew, .004, h - .001), "CHASSIS_DARK_METAL"),
            *((((0, -.0021, z)), (.0055, .0003, .007), "PORT_BLACK") for z in (-.0145, 0, .0145)),
        ], parent, (side * (w / 2 + ew / 2), -d / 2 + .002, h / 2), bevel=.00025)
    return parent


def io_side(g, root):
    side = g.object("io_side", parent=root)
    metadata(side, side="I/O_SIDE")
    y = -SPEC["depth_m"] / 2
    # Back plate stays behind the open cage cavities.
    g.box("io_panel", (SPEC["width_m"] - .004, .002, SPEC["height_m"] - .003),
          (0, y + .014, SPEC["height_m"] / 2), side, "PANEL_BLACK")
    # Sheet strips around openings keep the cages flush with a continuous face.
    # Split in horizontal bands, subtract rectangular apertures; no mesh booleans.
    holes = [(qsfp_position(i)[0], qsfp_position(i)[2], .0186, .0105) for i in range(1, 33)]
    holes += [(.194, z, .014, .009) for z in (.0296, .014)]
    levels = sorted({.0015, SPEC["height_m"] - .0015, *[z + sign * h / 2 for _, z, _, h in holes for sign in (-1, 1)]})
    strips = []
    for low, high in zip(levels, levels[1:]):
        blocked = sorted((x - w / 2, x + w / 2) for x, z, w, h in holes if z - h / 2 < (low + high) / 2 < z + h / 2)
        left = -SPEC["width_m"] / 2 + .0015
        for start, end in blocked + [(SPEC["width_m"] / 2 - .0015, SPEC["width_m"] / 2 - .0015)]:
            if start > left + .000001:
                strips.append((((left + start) / 2, y + .0008, (low + high) / 2), (start - left, .0015, high - low), "PANEL_BLACK"))
            left = end
    g.part("io_face", strips, side, bevel=0)
    ports = g.object("qsfp28_ports", parent=side)
    prototype = None
    for i in range(1, SPEC["qsfp28_port_count"] + 1):
        name = f"qsfp28_{i:02d}"
        port = g.object(name, parent=ports, position=qsfp_position(i))
        metadata(port, assetType="network-port", portType="QSFP28", physicalPort=i,
                 slot=f"PORT-{i:02d}", nominalSpeed="100G", selectable=True, focusable=True, side="I/O_SIDE")
        if prototype is None:
            prototype = g.part(f"{name}_cage", cage(.0186, .0105), port, bevel=.0001)
        else:
            g.duplicate(prototype, f"{name}_cage", port, (0, 0, 0))
        label(g, f"{name}_number", str(i), port, (0, -.00015, .0063 if i % 2 else -.0088), .0024)
    sfps = g.object("sfpplus_ports", parent=side)
    prototype = None
    for i in range(1, SPEC["sfpplus_port_count"] + 1):
        name = f"sfpplus_{i:02d}"
        port = g.object(name, parent=sfps, position=(.194, y, .0296 if i == 1 else .014))
        metadata(port, assetType="network-port", portType="SFP+", slot=f"SFPPLUS-{i:02d}",
                 nominalSpeed="10G", selectable=True, focusable=True, side="I/O_SIDE")
        if prototype is None:
            prototype = g.part(f"{name}_cage", cage(.014, .009), port, bevel=.0001)
        else:
            g.duplicate(prototype, f"{name}_cage", port, (0, 0, 0))
    label(g, "sfp_label", "SFP+", side, (.194, y - .0001, .020), .0024)
    stack = g.box("stack_id", (.008, .001, .013), (-.203, y + .0005, .029), side, "PORT_BLACK")
    # Unlit seven-segment outline: landmark, not a fabricated stack number.
    parts = [((0, -.0006, z), (.0038, .0002, .0005), "LABEL") for z in (-.004, 0, .004)]
    parts += [((x, -.0006, z), (.0005, .0002, .0032), "LABEL") for x in (-.002, .002) for z in (-.002, .002)]
    g.part("stack_segments", parts, stack, bevel=0)
    label(g, "stack_label", "ID", side, (-.203, y - .0001, .019), .0022)
    g.part("status_led_area", [((-.207 + c * .004, y, .007 + r * .004), (.0016, .0005, .0016), "LABEL")
                              for c in range(3) for r in range(2)], side, bevel=0)
    label(g, "switch_identification", "DELL  PowerSwitch S5232F-ON", side, (0, y - .0001, .0208), .0024)


def fan_visual(g, parent, name, radius=.015):
    g.cylinder(f"{name}_opening", radius, .0015, parent, (0, -.001, 0), "PORT_BLACK", 24)
    rotor = g.cylinder(f"{name}_rotor", radius * .30, .002, parent, (0, -.002, 0), "FAN_HOUSING", 16)
    for i in range(7):
        angle = i * math.tau / 7
        blade = g.box(f"{name}_blade_{i}", (.005, .0008, radius * .55),
                      (math.sin(angle) * radius * .57, -.0018, math.cos(angle) * radius * .57), parent, "FAN_HOUSING", 0)
        blade.rotation_euler.y = angle + .3
    g.part(f"{name}_handle", [
        ((0, -.004, 0), (.003, .003, radius * 1.6), "PORT_METAL"),
        ((0, -.006, 0), (.004, .002, .010), "LATCH"),
        ((-radius * .85, -.003, 0), (.002, .003, .015), "PORT_METAL"),
    ], parent, bevel=.00015)
    return rotor


def duplicate_tree(g, prototype, parent, name, position):
    copy = g.object(name, parent=parent, position=position)
    for child in prototype.children:
        item = g.duplicate(child, child.name.replace(prototype.name, name), copy, child.location)
        item.rotation_euler = child.rotation_euler
    return copy


def psu_side(g, root):
    side = g.object("psu_side", parent=root)
    metadata(side, side="PSU_SIDE")
    y, h = SPEC["depth_m"] / 2, SPEC["height_m"]
    g.box("psu_panel", (SPEC["width_m"] - .004, .002, h - .003), (0, y - .016, h / 2), side, "PANEL_BLACK")
    power, cooling = g.object("power", parent=side), g.object("cooling", parent=side)
    # Coordinates below are as seen facing PSU side: local +X is visual right.
    # Rotate each module 180 degrees so the shared I/O-oriented primitives face +Y.
    prototype = None
    for i, x in enumerate((.169, -.169), 1):
        name = f"psu_{i:02d}"
        if prototype is None:
            psu = g.object(name, parent=power, position=(x, y - .002, h / 2))
            g.box(f"{name}_body", (.091, .073, .038), (0, .0485, 0), psu, "CHASSIS_DARK_METAL")
            g.part(f"{name}_inlet", cage(.024, .027, .010, connector_hint=False), psu, (-.023, -.001, 0), bevel=.0002)
            g.part(f"{name}_ac_pins", [((-.023 + dx, .005, z), (.002, .006, .001), "PORT_METAL")
                                     for dx, z in [(-.006, -.005), (.006, -.005), (0, .006)]], psu, bevel=0)
            vent = g.object(f"{name}_fan", parent=psu, position=(.020, -.001, 0))
            fan_visual(g, vent, f"{name}_integrated", .016)
            # Flatten decorative fan descendants to reuse the complete module tree below.
            for child in list(vent.children):
                child.location += vent.location
                child.parent = psu
            bpy.data.objects.remove(vent, do_unlink=True)
            g.box(f"{name}_indicator", (.002, .001, .003), (-.005, -.003, .014), psu, "LABEL", 0)
            prototype = psu
        else:
            psu = duplicate_tree(g, prototype, power, name, (x, y - .002, h / 2))
        psu.rotation_euler.z = math.pi
        metadata(psu, assetType="power-supply", slot=f"PSU-{i:02d}", selectable=True, focusable=True, side="PSU_SIDE")
    prototype = None
    for i, x in enumerate((.096, .050, -.050, -.096), 1):
        name = f"fan_module_{i:02d}"
        if prototype is None:
            fan = g.object(name, parent=cooling, position=(x, y - .002, h / 2))
            g.box(f"{name}_body", (.043, .065, .038), (0, .0325, 0), fan, "CHASSIS_DARK_METAL")
            fan_visual(g, fan, name)
            prototype = fan
        else:
            fan = duplicate_tree(g, prototype, cooling, name, (x, y - .002, h / 2))
        fan.rotation_euler.z = math.pi
        metadata(fan, assetType="fan-module", slot=f"FAN-{i:02d}", selectable=True, focusable=True, side="PSU_SIDE")
    management = g.object("management", parent=side)
    for name, slot, kind, port_type, x, z, w, height in [
        ("mgmt_rj45", "MGMT", "management-port", "RJ45", .013, .031, .014, .012),
        ("console_rj45", "CONSOLE-RJ45", "console-port", "RJ45", .013, .016, .014, .012),
        ("console_microusb", "CONSOLE-MICROUSB", "console-port", "MicroUSB-B", .013, .006, .007, .003),
        ("usb_type_a", "USB-A", "usb-port", "USB-A", -.003, .020, .005, .013),
    ]:
        port = g.object(name, parent=management, position=(x, y, z))
        port.rotation_euler.z = math.pi
        metadata(port, assetType=kind, portType=port_type, slot=slot, selectable=True, focusable=True, side="PSU_SIDE")
        if name == "mgmt_rj45": metadata(port, role="out-of-band-management")
        g.part(f"{name}_socket", cage(w, height, .007), port, bevel=.0001)
    reset = g.cylinder("reset_button", .001, .001, management, (-.003, y, .007), "PORT_BLACK")
    metadata(reset, assetType="control", role="reset", selectable=False)
    tag = g.box("luggage_tag", (.003, .004, .026), (-.018, y, h / 2), management, "LATCH")
    metadata(tag, assetType="service-tag", selectable=False)
    label(g, "mgmt_label", "MGMT", management, (.013, y + .0002, .038), .002, psu=True)


def bake_linked_meshes(collection):
    """Evaluate bevel once per mesh and retain linked data in the final GLB."""
    groups = {}
    for obj in collection.objects:
        if obj.type == "MESH": groups.setdefault(obj.data, []).append(obj)
    for mesh, objects in groups.items():
        if not objects[0].modifiers: continue
        evaluated = objects[0].evaluated_get(bpy.context.evaluated_depsgraph_get())
        baked = bpy.data.meshes.new_from_object(evaluated)
        for obj in objects:
            obj.modifiers.clear()
            obj.data = baked
        name = mesh.name
        bpy.data.meshes.remove(mesh)
        baked.name = name


def viewport():
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.clip_start = .001
                space.shading.type = "SOLID"
                space.shading.color_type = "MATERIAL"
                space.region_3d.view_distance = .85
                space.region_3d.view_location = (0, 0, .022)
                space.region_3d.view_rotation = Quaternion((1, 0, 0), math.radians(72))


def main():
    scene, collection = initialize()
    materials = palette()
    g = Geometry(collection, {k: materials[k] for k in ["CHASSIS_DARK_METAL", "PANEL_BLACK", "PORT_BLACK", "PORT_METAL", "LATCH", "MEMORY_PCB", "LABEL", "FAN_HOUSING"]})
    root = g.object("S5232F_ROOT")
    metadata(root, assetType="switch", manufacturer="Dell", model="PowerSwitch S5232F-ON",
             formFactor="1U", rackUnits=SPEC["rack_units"], selectable=True, origin="bottom-center",
             physicalQsfp28Ports=32, physicalSfpPlusPorts=2, airflowMode=SPEC["airflow_mode"],
             physicalWidth=SPEC["width_m"], physicalDepth=SPEC["depth_m"], physicalHeight=SPEC["height_m"])
    chassis(g, root)
    io_side(g, root)
    psu_side(g, root)
    bpy.context.view_layer.update()
    bake_linked_meshes(collection)
    viewport()
    blend = PROJECT / "blender/powerswitch-s5232f-on.blend"
    glb = PROJECT / "public/assets/models/switches/powerswitch-s5232f-on.glb"
    blend.parent.mkdir(parents=True, exist_ok=True)
    glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
        use_active_scene=True, export_yup=True, export_extras=True, export_cameras=False,
        export_lights=False, export_animations=False, export_apply=False, export_materials="EXPORT")
    summary = validate_glb(glb)
    # Save only this generated scene, preserving unrelated open Blender work.
    with tempfile.TemporaryDirectory(prefix="interactive-3d-rack-twin-s5232f-") as temporary:
        source = Path(temporary) / "source.blend"
        bpy.data.libraries.write(str(source), {scene}, fake_user=True, compress=True)
        result = subprocess.run([bpy.app.binary_path, "--background", str(source), "--python-exit-code", "1",
                                 "--python", str(Path(__file__).resolve()), "--", "--finalize", str(blend)], capture_output=True, text=True)
        if result.returncode: raise RuntimeError(result.stdout + result.stderr)
    summary.update(blender_version=bpy.app.version_string, blender_objects=len(collection.objects),
                   blender_mesh_objects=sum(o.type == "MESH" for o in collection.objects),
                   blender_unique_meshes=len({o.data for o in collection.objects if o.type == "MESH"}))
    (SCRIPT_DIR / "generation-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("\n==================================================\nInteractive 3D Rack Twin\nDell PowerSwitch S5232F-ON Generation Complete\n==================================================")
    print(json.dumps(summary, indent=2))
    print(f"Blend: {blend}\nGLB: {glb}")


if __name__ == "__main__":
    if "--finalize" in sys.argv:
        bpy.context.window.scene = bpy.data.scenes[SCENE]
        viewport()
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=sys.argv[sys.argv.index("--finalize") + 1], compress=True)
    else:
        main()
