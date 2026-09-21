"""Optional Workbench previews of the saved source. Never saves cameras into the asset."""
from pathlib import Path
import bpy
from mathutils import Vector

PROJECT = Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(PROJECT / "blender/powerswitch-s5232f-on.blend"))
scene = bpy.data.scenes["INTERACTIVE_3D_RACK_TWIN_S5232F_PREVIEW"]
bpy.context.window.scene = scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "BOTH"
scene.display.shading.background_type = "WORLD"
scene.world = bpy.data.worlds.new("PREVIEW_WORLD")
scene.world.color = (.06, .07, .09)
scene.render.image_settings.file_format = "PNG"
scene.render.resolution_percentage = 100
camera = bpy.data.objects.new("PREVIEW_CAMERA", bpy.data.cameras.new("PREVIEW_CAMERA"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.clip_start = .001
output = PROJECT / "docs/images/s5232f"
output.mkdir(parents=True, exist_ok=True)
for name, position, scale, target, resolution in [
    ("io-side", (0, -1, .022), .53, (0, 0, .022), (1600, 360)),
    ("psu-side", (0, 1, .022), .53, (0, 0, .022), (1600, 360)),
    ("perspective", (.65, -.85, .65), .78, (0, 0, .022), (1200, 900)),
    ("qsfp-closeup", (-.10, -.5, .045), .15, (-.10, -.224, .022), (1200, 500)),
]:
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = scale
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = str(output / f"{name}.png")
    bpy.ops.render.render(write_still=True)
print(f"Previews: {output}")
