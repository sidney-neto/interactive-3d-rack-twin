# Section 2.1 — XE7745 exterior

Design approved in chat on 2026-09-08. The user's Section 2.1 specification is the authority; no Section 2.2 work is authorized.

Generate original low-poly geometry using Blender Python, not Dell CAD or 3D guide assets. Envelope: 0.482 × 0.89956 × 0.1743 m (width/depth/height), with a 0.445 m chassis body, 8 front drives, BOSS face, left/right controls, ventilation, ears, and eight rear PSU faces. Rear ports represent the configured 2×25G / 4×100G configuration, not universal onboard ports. Use simple shared Principled materials, no textures or internal hardware.

Blender axes: X width, negative Y front, Z up. Root at center of bottom footprint. Export Y-up GLB with front +Z, unit scale, separate top_cover and glTF extras. Preserve a clean per-instance cover transform. Save only the generated collection into the intended GLB; never clear unrelated Blender objects. Re-running replaces only owned generated data. Save `blender/poweredge-xe7745.blend` and `public/assets/models/servers/poweredge-xe7745.glb`.

Reuse ModelAsset's Suspense/error boundary and cloned hierarchy. Add only a narrow cover/placement adapter; do not rescale the GLB to the old placeholder. Update visualization dimensions/path in server JSON while retaining 4U slots, IDs, specifications and local editing. Metadata mapping supports slot and exterior node names. Keep selection overlay independent of shared materials. Existing states remain; generated interior is empty, exploded state only raises cover further.

Verify actual exported names/extras, bounds, orientation, budgets and repeat generation. Test mapping and independent cover transforms with real Three.js objects; run existing tests/typecheck/lint/build and browser checks. Include beginner GUI and macOS headless instructions. Do not add dependencies, backend or telemetry.
