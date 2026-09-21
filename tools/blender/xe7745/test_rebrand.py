"""Run in background Blender: legacy ownership migration must preserve user data."""
from pathlib import Path
import runpy
import bpy

HERE = Path(__file__).resolve().parent
for script, model in [(HERE / 'generate_xe7745_exterior.py', 'XE7745'),
                      (HERE.parent / 's5232f/generate_s5232f.py', 'S5232F')]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    module = runpy.run_path(str(script))
    legacy = bpy.data.collections.new(f'SIDIA_{model}_GENERATED')
    legacy['sidiaGenerated'] = True
    scene = bpy.data.scenes.new(f'SIDIA_{model}_PREVIEW')
    scene['sidiaGenerated'] = True
    scene.collection.children.link(legacy)
    owned = bpy.data.objects.new('old_generated_object', None)
    owned['sidiaGenerated'] = True
    legacy.objects.link(owned)
    sentinel = bpy.data.objects.new('UNRELATED_USER_OBJECT', None)
    legacy.objects.link(sentinel)
    material = bpy.data.materials.new('MAT_CHASSIS_DARK_METAL')
    material['sidiaGenerated'] = True
    conflict = bpy.data.collections.new(module['COLLECTION'])
    try:
        module['initialize']()
    except RuntimeError:
        pass
    else:
        raise AssertionError('Legacy rename collision was accepted')
    assert legacy.name == f'SIDIA_{model}_GENERATED' and legacy['sidiaGenerated']
    bpy.data.collections.remove(conflict)
    try:
        module['initialize']()
    except RuntimeError:
        pass
    else:
        raise AssertionError('Legacy collection with unrelated contents was accepted')
    assert bpy.data.objects.get(sentinel.name) is sentinel
    assert bpy.data.objects.get(owned.name) is owned
    legacy.objects.unlink(sentinel)
    bpy.context.scene.collection.objects.link(sentinel)
    new_scene, collection = module['initialize']()
    module['palette']()
    assert bpy.data.objects.get('UNRELATED_USER_OBJECT') is sentinel
    assert bpy.data.objects.get('old_generated_object') is None
    assert new_scene is scene and new_scene.name == module['SCENE']
    assert collection.name == module['COLLECTION']
    assert material['rackTwinGenerated'] and 'sidiaGenerated' not in material
    material['rackTwinGenerated'] = False
    try:
        module['palette']()
    except RuntimeError:
        pass
    else:
        raise AssertionError('Unrelated material was overwritten')
    print(f'PASS: {model} legacy migration and user-data safeguards')
