# Model generation and integration

The viewer ships one reusable server GLB and one switch GLB. The rack uses procedural geometry until a custom model is configured. Hardware inventory lives in `src/data/mock/` and `src/data/s5232fComponents.ts`; model metadata supplies identity and visualization behavior.

## Regenerate with Blender

From the repository root:

```sh
./tools/blender/xe7745/generate.sh
./tools/blender/s5232f/generate.sh
```

The wrappers default to `/Applications/Blender.app/Contents/MacOS/Blender`. Override the executable for another installation:

```sh
BLENDER_BIN="/path/to/blender" ./tools/blender/xe7745/generate.sh
```

| Model | Editable source | Web asset |
| --- | --- | --- |
| XE7745 | `blender/poweredge-xe7745.blend` | `public/assets/models/servers/poweredge-xe7745.glb` |
| S5232F-ON | `blender/powerswitch-s5232f-on.blend` | `public/assets/models/switches/powerswitch-s5232f-on.glb` |

Generation replaces these outputs and the generator-owned collection. Save manual experiments in a separately named file first. Unrelated objects and name collisions are protected; legacy generator ownership is migrated on rerun. The switch also writes `tools/blender/s5232f/generation-summary.json`.

For the desktop workflow, save any open work and choose **File → New → General**. In **Scripting → Text → Open**, open `tools/blender/xe7745/generate_xe7745.py` or `tools/blender/s5232f/generate_s5232f.py` from disk and click **Run Script**. Use a fresh scene for each model because required object names overlap. Outputs are saved automatically; open the resulting `.blend` to inspect it. Use the Terminal command if you need full error output.

Use **View → Viewpoint → Front / Back / Top**, the viewport axis gizmo to orbit, and **View → Frame All** to fit the model. For server internals, temporarily hide `top_cover`; hide `upper_tray`, `system_board`, `cpu_zone` and `memory` to expose the lower GPU zone. Do not save inspection-only visibility changes.

Reload the browser after regeneration to replace cached GLBs; saved equipment edits do not need clearing. The exterior-only `generate_xe7745_exterior.py` writes the same server outputs, so rerun the full generator to restore internals. PCB textures are generated and embedded locally using Blender's included NumPy; no additional add-ons or texture downloads are needed.

## Validate

Validate existing exports without launching Blender:

```sh
python3 tools/blender/xe7745/validate_glb.py
python3 tools/blender/s5232f/validate_s5232f.py
npm test
npm run lint
npm run build
```

For generator changes, run the repeatability and ownership checks with your Blender executable. These checks regenerate the output artifacts:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python tools/blender/xe7745/test_generator.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python tools/blender/s5232f/test_generator.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python tools/blender/xe7745/test_rebrand.py
```

Byte-identical regeneration is checked within the same Blender version, not across exporter releases. Inspect both instances in the viewer after geometry changes: selection/focus, server opening/explosion/reset, switch front/rear views and fallback for unavailable models. Use test output and the validators for current measurements rather than historical test counts.

Optional switch previews use `tools/blender/s5232f/preview.py` with the same Blender background flags and write to `docs/images/s5232f/`.

## Model conventions

| Model | Dimensions (width × depth × height) | Logical height |
| --- | --- | --- |
| XE7745 complete envelope | 482 × 899.56 × 174.3 mm | 4U |
| S5232F-ON chassis | 434 × 460 × 43.6 mm; ears extend width to 482.6 mm | 1U |

Both generators use meters, X width, Y depth and Z up, with front/I/O at −Y. Exported glTF uses Y up and front/I/O at +Z. Roots (`XE7745_ROOT`, `S5232F_ROOT`) are bottom-centered; `centerOrigin` translates each clone to its enclosure center without rescaling. Rack placement remains outside the loaded hierarchy.

The server has an upper CPU/RAM zone and lower GPU zone: two CPUs, 24 DIMMs, four H200 NVL PCIe cards in slots 21/23/25/27 and one rigid four-way NVLink bridge. Four gray vacant positions and PCB details are decorative, not extra inventory. Front storage is eight data SSDs; the BOSS assembly holds two separate boot M.2 devices. Three NIC assemblies contain two 25G and four 100G ports. Cooling includes twelve front GPU fans, four upper dual-fan modules and eight rear PSUs.

Keep `top_cover` (`interactionRole=cover`) and `front_bezel` (`interactionRole=bezel`) separate. Component roots and assembled transforms drive service animation: upper assemblies rise vertically, front drives/BOSS/fans move forward, and NICs/PSUs move rearward. The bridge disengages before the GPUs. Decorations inherit their board's movement and remain nonselectable. Do not embed server or switch instance IDs in the GLB.

The switch has 32 QSFP28 cages in eight 2×2 blocks, two SFP+ cages, two PSUs, four removable fans and four management/console/USB interfaces. QSFP28 numbering is odd upper/even lower, left to right; it does not establish switch-OS names or SNMP indices. `qsfp28_17` maps to `SWITCH-01.PORT-17`; other slots include `SFPPLUS-01/02`, `PSU-01/02`, `FAN-01..04`, `MGMT`, `CONSOLE-RJ45`, `CONSOLE-MICROUSB` and `USB-A`.

## Component identity

Physical equipment has stable IDs such as `SERVER-01`. Components use parent plus slot: `SERVER-01.GPU-01`, `SERVER-01.CPU-A`, `SERVER-01.DIMM-A01`, `SERVER-01.NIC-100G-01`. The same GLB node `gpu_01` becomes a different logical asset when instantiated as SERVER-02.

`modelNodeMapper` translates names or optional Blender custom properties exported as glTF extras (`Object3D.userData`):

```text
gpu_01 + SERVER-01                 → SERVER-01.GPU-01
cpu_a + SERVER-02                  → SERVER-02.CPU-A
rear_nic_100g_01 + SERVER-01        → SERVER-01.NIC-100G-01
slot: DRIVE-01 + SERVER-02         → SERVER-02.SSD-01
assetSlot: GPU-04 + SERVER-01       → SERVER-01.GPU-04
selectable: false                  → no selectable identity
unknown/decorative node            → parent equipment ID
```

Supported slots include GPU, CPU, DIMM, BOSS, BOSS M.2, SSD, legacy DRIVE, PSU, NVLINK-01 and 25G/100G NIC names. Both `assetSlot` (preferred) and `slot` extras are supported. Legacy `DRIVE-xx` metadata normalizes to the existing `SSD-xx` inventory IDs; it never creates a second set. Component identity and selection exclusion on a parent group are inherited by its mesh descendants; explicit child metadata can override them. Metadata fields such as `assetType`, `assetModel`, `selectable`, `focusable`, `explodable` and `explodeGroup` drive visualization behavior. Technical specs are still read from the repository; GLB metadata never overrides infrastructure truth. Selection checks the catalog before accepting a mapped ID. Unknown nodes select the parent server.

## Replace or add a model

1. Export optimized binary glTF from Blender with transforms applied, custom properties enabled, and stable node names.
2. Place files in the prepared paths:

   ```text
   public/assets/models/rack/rack-44u.glb
   public/assets/models/switches/powerswitch-s5232f-on.glb
   public/assets/models/servers/poweredge-xe7745.glb
   ```

3. Set the asset's `geometry.modelUrl` in its JSON file to the corresponding `/assets/models/...` URL. Keep `null` to use placeholder geometry without making a failing request.
4. Export in meters, +Y up and +Z front. The rack loader retains its centered-origin convention. The XE7745 and S5232F generators use a bottom-center origin; its `centerOrigin` adapter translates the model to the existing centered instance without scaling. Visualization dimensions are recorded in `geometry`, with physical height separate from logical 4U height. Equipment placement remains outside the loaded model.
5. Add component catalog entries matching exported slots when those physical components are introduced. The XE7745's separate `top_cover` (or `interactionRole=cover`) lifts using its per-instance open/exploded state. The current full model has named immutable component roots for deterministic animation; arbitrary mechanical disassembly is not inferred.

`ModelAsset` uses `useGLTF` and clones the cached scene for each logical instance. Geometry/material resources remain shared and are never recolored or permanently mutated for selection. A separate selection envelope supplies the blue highlight. Each model has its own Suspense and error boundary: missing/corrupt GLBs fall back to that model's placeholder and log a meaningful development error. Other assets and UI remain usable. The overall Canvas has a WebGL failure message and retry path.

## Fidelity and references

Geometry, PCB artwork, heatsink tube paths and service motions are visual approximations, not OEM CAD, electrical layouts or maintenance procedures. Exact installed PSU specifications, bridge SKU/bandwidth, switch airflow and physical deployment are not established. The switch has no modeled internals or disassembly. No proprietary CAD or interactive vendor models are incorporated.

Public references used for the models:

- [Dell XE7745 front view](https://www.dell.com/support/manuals/en-us/poweredge-xe7745/pexe7745_ism_pub/front-view-of-the-system?guid=guid-40fae83d-47c0-4ef0-ab7c-454d732c6223&lang=en-us)
- [Dell XE7745 rear view](https://www.dell.com/support/manuals/en-us/poweredge-xe7745/pexe7745_ism_pub/rear-view-of-the-system?guid=guid-93b016c0-7492-490f-bab9-5a7aa5f5fe34&lang=en-us)
- [Dell chassis dimensions](https://www.dell.com/support/manuals/en-us/poweredge-xe7745/pexe7745_ism_pub/chassis-dimensions?guid=guid-20932a39-825d-40d8-a073-457877ec83ed&lang=en-us)
- [Dell front bezel removal](https://www.dell.com/support/manuals/en-kg/poweredge-xe7745/pexe7745_ism_pub/removing-the-front-bezel?guid=guid-0be380b3-d7c7-418b-b854-e9188c984e89&lang=en-us)
- [Dell inside the system](https://www.dell.com/support/manuals/en-in/poweredge-xe7745/pexe7745_ism_pub/inside-the-system?guid=guid-98a5f7a0-2803-4367-acda-f62ae712a8e0&lang=en-us)
- [Dell expansion-card guidelines](https://www.dell.com/support/manuals/en-us/poweredge-xe7745/pexe7745_ism_pub/expansion-card-installation-guidelines?guid=guid-339e39b4-678e-470a-9d93-25baad6e7316&lang=en-us)
- [Dell configurations and features](https://www.dell.com/support/manuals/en-us/poweredge-xe7745/pexe7745_ism_pub/poweredge-xe7745-system-configurations-and-features?guid=guid-fc4d1e39-8398-44b8-9046-c88c40a4f25b)
- [NVIDIA H200](https://www.nvidia.com/en-au/data-center/h200/)
- [Dell BOSS replacement transcript](https://www.dell.com/support/resources/en-pk/3dviewer/ic140xe7745001925b/how-to-replace-the-boss-n1-dc-mhs-module-on-a-poweredge-xe7745)
- [NVIDIA H200 NVL reference topology](https://docs.nvidia.com/enterprise-reference-architectures/white-paper/latest/appendix-d.html)
- [AMD EPYC 9555](https://www.amd.com/en/products/processors/server/epyc/9005-series/amd-epyc-9555.html)
- [Blender viewport navigation](https://docs.blender.org/manual/en/latest/editors/3dview/navigate/navigation.html)
- [Dell July 2023 guide](https://dl.dell.com/content/manual38150967-dell-powerswitch-s5200f-on-series-installation-guide-july-2023.pdf?language=en-us)
- [Dell dimensions](https://www.dell.com/support/manuals/en-us/networking-s5232f-on/s5200-on_install_pub/physical-dimensions?guid=guid-f98776dd-3449-405e-9dba-e6dd2000dc58&lang=en-us)
- [Dell August 2021 guide, distributor-hosted copy](https://gzhls.at/blob/ldb/4/b/e/5/fa2bbc4377109a8bcaa14fb31911aac3384e.pdf)
- [Dell XE7745 installation guidelines](https://www.dell.com/support/manuals/en-us/poweredge-xe7745/pexe7745_ism_pub/expansion-card-installation-guidelines?guid=guid-339e39b4-678e-470a-9d93-25baad6e7316)
- [Dell XE7745 technical guide](https://www.delltechnologies.com/asset/en-uk/products/servers/technical-support/poweredge-xe7745-technical-guide.pdf)
- [NVIDIA H200 NVL official product image](https://blogs.nvidia.com/blog/hopper-h200-nvl/)
- [Dell: Inside the system, Figure 1 — 1U Top CPU Zone](https://www.dell.com/support/manuals/pt-br/poweredge-xe7745/pexe7745_ism_pub/inside-the-system?guid=guid-98a5f7a0-2803-4367-acda-f62ae712a8e0&lang=en-us)
- [Dell: Installing the heat sink, Figure 2](https://www.dell.com/support/manuals/en-gt/poweredge-xe7745/pexe7745_ism_pub/installing-the-heat-sink?guid=guid-d40444f1-7c24-4622-90b5-3e06a441bdae&lang=en-us)
- [Dell: How to replace the heatsink on a PowerEdge XE7745](https://www.dell.com/support/contents/en-us/videos/videoplayer/how-to-replace-the-heatsink-on-a-poweredge-xe7745/6375484419112)

The retained Dell captures under `docs/images/xe7745-heatsink/` are attributed comparison material: [installed top view](images/xe7745-heatsink/dell-top.png), [installation illustration](images/xe7745-heatsink/dell-installation.png) and [replacement video frame](images/xe7745-heatsink/dell-video-0050.png). Other images under `docs/images/` are historical inspection captures and may show earlier model revisions.
