"""Deterministic, packed PCB artwork/PBR maps; decorative, not OEM circuitry."""
import math
from pathlib import Path
import struct
import tempfile
import zlib

import bpy
import numpy as np

# Five-column technical bitmap lettering; no fonts or image-library dependency.
FONT = dict(zip('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-./ ', [
 '3E5151493E','00427F4000','4261514946','2141454B31','1814127F10',
 '2745454539','3C4A494930','0171090503','3649494936','064949291E',
 '7E1111117E','7F49494936','3E41414122','7F4141221C','7F49494941',
 '7F09090901','3E4149497A','7F0808087F','00417F4100','2040413F01',
 '7F08142241','7F40404040','7F020C027F','7F0408107F','3E4141413E',
 '7F09090906','3E4151215E','7F09192946','4649494931','01017F0101',
 '3F4040403F','1F2040201F','3F4038403F','6314081463','0708700807',
 '6151494543','0808080808','0060600000','2010080402','0000000000',
]))


def _packed_image(name, pixels, color_space):
    old = bpy.data.images.get(name)
    if old and not old.get('rackTwinGenerated'):
        raise RuntimeError(f'Unrelated image named {name}')
    if old:
        bpy.data.images.remove(old)
    h, w, _ = pixels.shape
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', w, h, 8, 2, 0, 0, 0))
    scanlines = b''.join(b'\0' + row.tobytes() for row in pixels.astype(np.uint8))
    data += chunk(b'IDAT', zlib.compress(scanlines, 9)) + chunk(b'IEND', b'')
    with tempfile.TemporaryDirectory(prefix='interactive-3d-rack-twin-pcb-') as folder:
        path = Path(folder) / f'{name}.png'
        path.write_bytes(data)
        image = bpy.data.images.load(str(path), check_existing=False)
        image.name = name
        image['rackTwinGenerated'] = True
        image.colorspace_settings.name = color_space
        image.pack()
    return image


def finish_pcb(g, board, width, depth, suffix, cpu_layout):
    """Planar artwork on the existing mesh: no geometry or transform changes."""
    w, h = 1024, 2048
    yy, xx = np.mgrid[:h, :w]
    weave = np.sin(xx * .12) * np.sin(yy * .10)
    color = np.empty((h, w, 3), dtype=np.float32)
    color[:] = (27, 60, 53)  # sRGB muted graphite/teal solder mask.
    color += (weave * .65)[..., None]
    height = np.zeros((h, w), dtype=np.float32)
    ao = np.full((h, w), 255, dtype=np.float32)
    rough = 174 + np.round(weave * 3)
    metal = np.full((h, w), 8, dtype=np.float32)
    y_min = board.location.y - depth / 2
    ink, trace, pad = (156, 170, 160), (40, 77, 64), (134, 139, 117)

    def pixel(x, y):
        return int((x / width + .5) * (w - 1)), int((1 - (y - y_min) / depth) * (h - 1))

    def rectangle(x, y, sx, sy, rgb, rise=0):
        x0, y0 = pixel(x - sx / 2, y + sy / 2)
        x1, y1 = pixel(x + sx / 2, y - sy / 2)
        sl = np.s_[max(0, y0):min(h, y1 + 1), max(0, x0):min(w, x1 + 1)]
        color[sl], height[sl] = rgb, rise
        if rgb == pad:
            rough[sl], metal[sl] = 130, 140

    def line(points, rgb=trace, thickness=.00045):
        for (x1, y1), (x2, y2) in zip(points, points[1:]):
            steps = max(abs(pixel(x2, y2)[0] - pixel(x1, y1)[0]), abs(pixel(x2, y2)[1] - pixel(x1, y1)[1]), 1)
            for t in np.linspace(0, 1, steps + 1):
                rectangle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness, thickness, rgb, .000025)

    def text(label, x, y, pitch=.00044):
        for char in label:
            for col, bits in enumerate(bytes.fromhex(FONT.get(char, FONT[' ']))):
                for row in range(7):
                    if bits & (1 << row):
                        rectangle(x + col * pitch, y - row * pitch, pitch * .8, pitch * .8, ink)
            x += 6 * pitch

    def ring(x, y, radius, mounting=False):
        cx, cy = pixel(x, y)
        rx, ry = max(1, radius / width * w), max(1, radius / depth * h)
        sl = np.s_[max(0, int(cy - ry - 1)):min(h, int(cy + ry + 2)), max(0, int(cx - rx - 1)):min(w, int(cx + rx + 2))]
        dist = ((xx[sl] - cx) / rx) ** 2 + ((yy[sl] - cy) / ry) ** 2
        outside, inside = dist <= 1, dist < (.30 if mounting else .25)
        color[sl][outside] = pad
        color[sl][inside] = (17, 28, 25)
        height[sl][outside] = .00009
        height[sl][inside] = -.00010
        rough[sl][outside], metal[sl][outside] = 120, 160

    # Use actual existing decorations as anchors for pads, reference IDs and local AO.
    for group in board.children:
        if not group.get('decorative'):
            continue
        for obj in group.children:
            kind = obj.get('decorativeKind')
            if kind not in ('ic', 'regulator', 'header', 'capacitor'):
                continue
            x, y = obj.location.x, obj.location.y
            sx, sy = obj.dimensions.x, obj.dimensions.y
            if kind == 'capacitor':
                sx = sy = .008
            # Soft contact shading only for decorations rigidly attached to this board.
            cx, cy = pixel(x, y)
            dx = np.maximum(np.abs(xx - cx) - sx / width * w / 2, 0)
            dy = np.maximum(np.abs(yy - cy) - sy / depth * h / 2, 0)
            ao = np.minimum(ao, 255 - 28 * np.exp(-(dx * dx + dy * dy) / 20))
            outline = [(x - sx / 2 - .0015, y - sy / 2 - .0015), (x + sx / 2 + .0015, y - sy / 2 - .0015),
                       (x + sx / 2 + .0015, y + sy / 2 + .0015), (x - sx / 2 - .0015, y + sy / 2 + .0015)]
            line(outline + outline[:1], ink, .00030)
            ref = {'ic': 'U', 'regulator': 'L', 'header': 'J', 'capacitor': 'C'}[kind] + obj.name.rsplit('_', 1)[-1]
            text(ref, max(-width / 2 + .003, x - sx / 2), y - sy / 2 - .003, .00035)
            if kind in ('ic', 'regulator') and sx > .020:
                for side in (-1, 1):
                    for n in range(5):
                        px, py = x + (n - 2) * sx / 6, y + side * (sy / 2 + .0011)
                        rectangle(px, py, .0015, .0018, pad, .00010)
                        # Short 45-degree fan-out, an illustrative PCB pattern only.
                        line([(px, py + side * .001), (px, py + side * .003),
                              (px + .003, py + side * .006), (px + .003, py + side * .010)])
                        ring(px + .003, py + side * .010, .0006)
                # Tiny passive banks near the controller, rendered in the surface maps.
                for n in range(3):
                    px, py = x + (n - 1) * .004, y - sy / 2 - .012
                    rectangle(px, py, .0025, .0013, pad, .00014)
                    rectangle(px, py, .0012, .0013, (33, 38, 36), .00020)

    # Faint routed copper bundles and via stitching in open board corridors.
    route_y = -.097 if suffix == 'CPU' else .051
    for n in range(4):
        y = route_y + n * .0013
        line([(-.179, y), (-.130, y), (-.121, y + .005), (.112, y + .005), (.122, y), (.177, y)], thickness=.00028)
    for side in (-1, 1):
        for n in range(8):
            ring(side * (width / 2 - .005), y_min + .09 + n * .063, .0005)

    # Label existing service zones and DIMM positions; no fabricated OEM part numbers.
    if suffix == 'CPU':
        for socket, (x, y, _) in cpu_layout['cpu'].items():
            for row in range(2):
                for col in range(5):
                    px, py = x - .012 + col * .006, .193 + row * .004
                    rectangle(px, py, .0038, .0018, pad, .00014)
                    rectangle(px, py, .0021, .0018, (34, 42, 38), .00028)
                    ring(px + .001, py + .002, .0005)
            text(f'CPU {socket.upper()}', x - .018, y + .080, .00065)
            for i, dx in enumerate(cpu_layout['dimm_x'][socket], 1):
                text(f'{socket.upper()}{i:02d}', dx - .002, .177, .00025)
        text('DDR5', -.192, .205, .00050)
        text('PWR', .133, .310, .00050)
        text('I/O', -.189, .319, .00050)
        mounting = [(-.192, -.205), (.191, .240)]
    else:
        for i, x in enumerate(cpu_layout['empty_gpu_x'], 5):
            text(f'SLOT {i}', x - .013, .059, .00040)
        text('PCIE', -.187, .065, .00050)
        text('PWR', .105, .268, .00050)
        mounting = [(-.198, .256), (.197, -.323)]
    for i, (x, y) in enumerate(mounting, 1):
        ring(x, y, .003, mounting=True)
        text(f'MH{i}', x - .004, y - .005, .00030)
    text(f'INTERACTIVE 3D RACK TWIN  XE7745  {suffix} PCB', -.105, y_min + depth - .003, .00045)
    text('DIGITAL TWIN / VISUAL MODEL', -.105, y_min + depth - .0075, .00036)

    # Tangent-space normal map: submillimeter depth, never geometry displacement.
    gy, gx = np.gradient(height)
    nx, ny = -gx / (width / w), gy / (depth / h)
    length = np.sqrt(nx * nx + ny * ny + 1)
    normal = np.stack((nx / length * .5 + .5, ny / length * .5 + .5, 1 / length * .5 + .5), axis=-1) * 255
    orm = np.stack((ao, rough, metal), axis=-1)
    images = [_packed_image(f'XE7745_{suffix}_{label}', pixels, space) for label, pixels, space in
              [('COLOR', color, 'sRGB'), ('NORMAL', normal, 'Non-Color'), ('ORM', orm, 'Non-Color')]]
    name = f'MAT_BOARD_GREEN_{suffix}'
    material = bpy.data.materials.get(name)
    if material and not material.get('rackTwinGenerated'):
        raise RuntimeError(f'Unrelated material named {name}')
    material = material or bpy.data.materials.new(name)
    material['rackTwinGenerated'] = True
    material['finish'], material['markings'] = 'muted-teal-pcb', 'decorative-not-oem'
    material.diffuse_color = (.011, .045, .036, 1)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output, bsdf = nodes.new('ShaderNodeOutputMaterial'), nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    textures = []
    for image in images:
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.extension = 'EXTEND'
        textures.append(texture)
    links.new(textures[0].outputs['Color'], bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeNormalMap')
    bump.inputs['Strength'].default_value = .35
    links.new(textures[1].outputs['Color'], bump.inputs['Color'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    split = nodes.new('ShaderNodeSeparateColor')
    links.new(textures[2].outputs['Color'], split.inputs['Color'])
    links.new(split.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(split.outputs['Blue'], bsdf.inputs['Metallic'])
    group = bpy.data.node_groups.get('glTF Material Output')
    if group is None:
        group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    occlusion = nodes.new('ShaderNodeGroup')
    occlusion.node_tree = group
    links.new(split.outputs['Red'], occlusion.inputs['Occlusion'])
    for index, old in enumerate(board.data.materials):
        if old == g.materials['BOARD_GREEN']:
            board.data.materials[index] = material
    uv = board.data.uv_layers.new(name='PCB')
    for polygon in board.data.polygons:
        for loop_index in polygon.loop_indices:
            co = board.data.vertices[board.data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (co.x / width + .5, co.y / depth + .5) if polygon.normal.z > .9 else (0, 0)
