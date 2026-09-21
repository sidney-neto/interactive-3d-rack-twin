# Interactive 3D Rack Twin — Section 2.2 Design

Interactive 3D Infrastructure Digital Twin Viewer

Status: conversational design and written specification approved on 2026-09-08, including the explicit amendment that all four H200 GPUs are connected by a four-way NVLink bridge assembly. Section 2.2 implementation, regeneration and verification completed on 2026-09-08; see `docs/xe7745-internals-verification.md`.

## Scope and preservation

Extend the existing XE7745 procedural model and existing React Three Fiber integration. Keep one reusable `public/assets/models/servers/poweredge-xe7745.glb` and one generated source `blender/poweredge-xe7745.blend`. Both SERVER-01 and SERVER-02 use this asset, with independent mutable scene hierarchies.

Preserve Section 2.1 exterior geometry, dimensions, orientation, root origin, removable front bezel, separate top cover, equipment labels, saved names and rack positions, selection, RackUnitMap, InspectorPanel, camera presets, extraction, fallback, and the existing repository/provider architecture. Do not add the separately pending Dell logo.

No rack or switch modeling, extra server assets, network/power cables, tiny PCB electronics, simulation, telemetry APIs, backend, authentication, or deployment. NVLink bridge geometry is explicitly in scope; it is not network cabling.

## Existing architecture

- `XE7745.tsx` handles rack placement and extraction and delegates GLB loading to `ModelAsset.tsx`.
- `modelInstance.ts` clones the cached scene, shares geometry/materials, maps logical IDs, and locates the cover and bezel. Its per-instance transforms must remain independent.
- `modelNodeMapper.ts` maps names/extras and propagates identity to descendants. Existing exterior drive slots use DRIVE-01 through DRIVE-08; the repository already uses SSD-01 through SSD-08.
- `viewerStore.ts` keeps independent per-server extraction/open/exploded/bezel flags. Switching servers preserves the other server's state intentionally. Keep this behavior.
- `CameraController.tsx` currently resolves components to their parent server; component bounds are not yet used.
- `StaticAssetRepository.ts` provides a shared inventory snapshot and validated browser-local equipment overrides. Existing component data has 47 logical entries per server, with mostly descriptive specifications.
- The existing generator has safe owned-collection cleanup, linked mesh duplication, simple glTF-compatible materials, meter-scale checks, export validation, and isolated source-file finalization. Reuse these safeguards.

## Technical references and model accuracy

Official public references only; do not extract proprietary CAD or interactive-guide model assets.

1. [Dell XE7745 internal zones](https://www.dell.com/support/manuals/en-in/poweredge-xe7745/pexe7745_ism_pub/inside-the-system?guid=guid-98a5f7a0-2803-4367-acda-f62ae712a8e0&lang=en-us): upper 1U CPU zone and lower 3U GPU zone.
2. [Dell expansion-card installation guidelines](https://www.dell.com/support/manuals/en-us/poweredge-xe7745/pexe7745_ism_pub/expansion-card-installation-guidelines?guid=guid-339e39b4-678e-470a-9d93-25baad6e7316&lang=en-us): RC0-3 for four H200s with NVL four-way bridge; slot population 21, 23, 25, 27.

Use the two-level arrangement rather than flattening all components onto one artificial motherboard. Exact component coordinates, bridge casing and connector details are original simplified approximations, not CAD accuracy. Centralize these coordinates in Blender configuration. Consult the official internal diagrams, GPU, fan and memory documentation while placing components; record further sources in the beginner guide.

The four-way bridge is modeled as one logical assembly representing the installed bridge set, not as a claim about the number of individual OEM connector pieces. No electrical behavior, throughput simulation or invented adapter SKU is introduced.

## Hardware and identity contract

| Physical representation | Count | Logical identity / repository data |
| --- | ---: | --- |
| Passive PCIe H200 NVL accelerator | 4 | GPU-01 through GPU-04; 141 GB each; physical slots 21, 23, 25, 27 |
| NVLink four-way bridge assembly | 1 logical assembly | Static relationship connecting GPU-01 through GPU-04; visual support, not a fifth GPU |
| EPYC CPU and heatsink assembly | 2 | CPU-A, CPU-B; 64 cores / 128 threads each |
| DDR5 RDIMM | 24 | DIMM-A01–A12, DIMM-B01–B12; 64 GB, 6400 MT/s; 1536 GB total |
| Existing front data drives | 8 | SSD-01–SSD-08; front-mounted, 3.2 TB each, 25.6 TB raw |
| BOSS controller | 1 | BOSS; boot-storage controller |
| Internal BOSS M.2 devices | 2 | BOSS-M2-01, BOSS-M2-02; internal, 960 GB each |
| External network interfaces | 6 | NIC-25G-01–02 and NIC-100G-01–04 |

Add system board, upper tray, front storage backplane, reusable fan modules, GPU mounts and PCIe support context. The documented GPU configuration does not require inventing conventional riser cards: model only appropriate board/bracket support. Generic internal network-card context relates to the existing rear ports without inventing vendor SKUs or duplicate port identities.

**Storage invariant:** the existing eight `front_drive_01` through `front_drive_08` objects are the eight 3.2 TB devices. Add only their backplane/support behind them. Never create an additional internal eight-drive set. The two BOSS M.2 devices are a separate internal boot subsystem.

## Procedural generation

Add a full `generate_xe7745.py` entry point and a focused internal-generation module with centralized layout/count configuration. Reuse the existing exterior generator's construction functions and export/finalization code, making only the extraction needed for full-server generation. Retain a documented exterior-only entry point; the default `generate.sh` runs the complete model.

Hierarchy:

```text
XE7745_ROOT
  exterior                     existing reviewed exterior
  internals
    internal_chassis
    system_board
    cpu_zone                   cpu_a, cpu_b; package + heatsink children
    memory                     dimm_a01–a12, dimm_b01–b12
    gpu_zone                   gpu_01–04, nvlink_bridge_4way
    storage                    front_storage_backplane, boss_n1 + boss_m2_01–02
    cooling                    deterministic fan_module_* roots
    network                    generic adapters related to existing port IDs
    pcie                       mounting boards/brackets/supports
```

Assembled dimensions remain 0.4820 m wide × 0.89956 m deep × 0.1743 m high, logical height 4U. Blender uses X width, Y depth, Z up; front is -Y. Exported glTF uses Y up, front +Z. Preserve the bottom-footprint-centered root and existing frontend placement adjustment; do not normalize or re-center after animation.

Use linked mesh data for repeated GPUs, DIMMs, fans and M.2s. Use a small Principled BSDF palette, shallow bevels and no render/baking dependency. Preserve unrelated Blender data; validate before saving/exporting and report errors with component-generation context.

Static extras include `assetType`, `slot`, `selectable`, `focusable`, `explodable`, `explodeGroup`, and `interactionRole` where relevant. No runtime measurements. The bridge is non-selectable visual support with `interactionRole = "nvlink-bridge"`, associated GPU slots, and an independent animation root. No SERVER-01/02 values are baked into the model.

## Data and mapping

Extend existing component metadata with structured capacity, speed, core/thread and location fields through the repository. Preserve current logical IDs and parent relationships. Reuse existing server specifications or component templates within the data layer where this removes duplication without changing provider contracts.

Explicit mappings include `boss_n1 -> BOSS`, `boss_m2_01 -> BOSS-M2-01`, and `front_drive_01 -> SSD-01`. Normalize older DRIVE-* model metadata to the existing SSD-* inventory IDs without changing saved equipment edits. GPU, CPU, DIMM and NIC mappings remain instance-aware.

Record the NVLink grouping as static repository configuration for the server summary; do not claim telemetry or add an interaction inventory item just for decoration. Port identities remain independent of generic physical adapter grouping.

## Scene registry, selection and focus

Build one component-root registry per cloned model. Resolve a child hit to the nearest logical selectable root and then the instance-specific ID. Store original local transforms once. Keep Object3D references in the rendering layer, outside the business/viewer Zustand store.

Closed servers select as servers. Open/exploded servers enable registered component selection. Non-selectable board, supports and bridge must not steal component interaction. Respect installed-bezel occlusion; to directly access front drives the user removes the bezel. Component inventory remains keyboard-operable.

Use an instance-local overlay or equivalent non-destructive highlight for hover/selection. Do not change cached source materials. Register live component roots with a scene-local focus lookup; calculate world bounds when focus is requested, including extraction and current exploded transforms. Release registrations on unmount. Missing model/nodes fall back safely to equipment focus and existing placeholders rather than fabricated component coordinates.

Keep smooth camera transitions, front/rear conventions and user orbit interruption. Frame components from an appropriate above/front or rear angle with a safe minimum distance. Bounds beneath the upper tray may be physically occluded in the assembled open view; expose these through exploded view, not hidden transparency or distorted assembled placement.

## Exploded-view behavior

Use a centralized pure transform configuration and a normalized `explodeFactor` (0 assembled, 1 exploded), animated over approximately 900 ms with controlled easing and reduced-motion support. Calculate every pose from immutable assembled transforms so repeated toggles and reset never accumulate drift.

- Top cover lifts separately; bezel behavior remains independent.
- Four-way NVLink assembly lifts clear of GPU connectors during the initial part of the transition, before the four GPUs fan out. Reassembly reverses the sequence. Never stretch the rigid bridge between separated GPUs or leave it attached to only one card.
- GPUs rise and spread in slot order, each remaining selectable.
- Upper board/tray, CPU assemblies and DIMM banks separate coherently to expose the lower zone; heatsinks lift from packages.
- Memory remains arranged in ordered A and B banks, not random directions.
- Existing front SSDs slide forward with their entire carrier assemblies. When the bezel is installed, require its removal before entering exploded view, with an explanatory action state; do not slide drives through it or silently change bezel state.
- BOSS and its M.2 children use parent-relative offsets without double-counting parent motion.
- Network adapters and their associated external port visual assemblies move together where needed; preserve the original closed exterior positions on return.
- Fans and support boards move modestly. Chassis stays anchored.

Switching selected servers preserves existing intentional per-server states. Editing equipment must not remount/reset model state. Reset Viewer assembles all components, closes covers, returns servers, installs bezels, clears hover/selection and resets the camera. Reset Camera must not change any hardware state.

## Integration surface

Expected changes are limited to the Blender generator/helpers/validator/tests/guide; `modelInstance.ts`, `modelNodeMapper.ts`, `ModelAsset.tsx`, `XE7745.tsx`, `AssetSelection.tsx`, `CameraController.tsx`; focused registry/exploded helpers; component types/data/repository; Inspector/ServerActions; relevant tests and documentation. Keep existing rack placement, equipment-edit persistence and telemetry boundaries intact.

Missing/unreadable GLBs retain the current placeholder and error boundary. Older exterior-only models remain usable without unsupported interaction claims. Inventory stays available, and component focus can fall back to the server with an explanatory limitation. No new runtime dependencies are planned.

## Verification and handoff

Add regression tests before implementation for instance-aware mapping, nearest-root selection, closed/open gating, immutable assembled/exploded transforms, nested transforms, NVLink bridge release before GPU separation, shared-source isolation, reset, component repository lookup and storage location/count/capacity.

Validate exactly four GPU roots, two CPU roots, 24 DIMMs, eight front SSD roots, two internal BOSS M.2 roots, six network-port roots and the bridge assembly. Verify bridge grouping covers the four GPUs and no duplicate internal SSD set exists. Check unique names, extras, units, orientation, exterior bounds, embedded resources and no exported cameras/lights.

Run the actual full generator twice, checking equivalent names/counts/geometry and no duplicates. Open the generated .blend and parse the GLB. Measure object/mesh/triangle counts and file size. Target below 200,000 triangles, never above 250,000 without explicit justification; aim below 15 MB and do not add geometry merely to reach a target count.

Run existing `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`. Browser checks cover both servers, component classes, focus, front/rear, NVLink assembled/exploded appearance, front-drive motion, bezel/open/extract/reset independence and fallback. Preserve and restore any temporarily edited browser inventory.

Update the main README and beginner Blender guide with Desktop Scripting/Run Script, headless `generate.sh`, BLENDER_BIN override, output locations, viewport navigation, limitations and the requested manual checklists. Report actual measured results and explicitly separate VERIFIED from NOT VERIFIED. No generation or check is declared successful without execution.

Always report storage separately: Front Storage — 8 × 3.2 TB, FRONT; BOSS — 2 × 960 GB NVMe M.2, INTERNAL. Stop after Section 2.2 for visual approval.
