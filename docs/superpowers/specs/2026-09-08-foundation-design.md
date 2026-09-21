# Interactive 3D Rack Twin — Section 1 design

The supplied Section 1 specification is the implementation authority. This is an empty repository with no existing conventions or files to preserve. Build the local MVP; deployment is explicitly excluded.

## Architecture

Use React 19, strict TypeScript, Vite, Three.js, React Three Fiber, Drei and Zustand. Async RackRepository, AssetRepository and TelemetryProvider interfaces sit behind one composition root. Only static implementations import JSON. Load an immutable snapshot into React context; use logical IDs throughout UI and scene.

A separate Zustand store holds guarded viewer actions, logical camera requests and per-server extraction/open/explosion state. Derive the active server flags from the selected server's record. Invalid IDs and invalid transitions are no-ops. Returning one server never changes its sibling.

The charcoal app shell has a rack map at left, a dominant isolated 3D rack in the center, and an inspector at right. Show static-data provenance. Switches occupy U44 and U43; shared XE7745 instances occupy U39–42 and U35–38. The map uses one spanning button per equipment asset. All selection uses the same store.

The scene consumes geometry dimensions and rack placement from data. OrbitControls provides damped rotation and zoom with disabled pan. A camera controller interpolates spherical coordinates for front/rear/focus/reset without crossing through the rack. Models use reusable selection envelopes. Optional GLB loading is isolated by per-model error boundaries and Suspense; absent or failed models render useful placeholders.

Node names and Blender extras map through modelNodeMapper into catalog IDs. Unknown nodes resolve to their parent asset; unknown component IDs never enter viewer state. Placeholder cover and internal blocks only validate interaction, not hardware layout.

## Verification

Test repositories and rack validation, rack positions, ID mapping, guarded transitions including sibling isolation, and real RackUnitMap selection updating the inspector and focus request. Run TypeScript, lint, tests and production build. Inspect the local app at desktop sizes and exercise the server workflow. No APIs, deployment, detailed hardware, authentication or backend.
