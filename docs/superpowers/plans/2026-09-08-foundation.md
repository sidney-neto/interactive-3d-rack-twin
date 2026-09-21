# Interactive 3D Rack Twin Foundation Implementation Plan

**Goal:** Deliver the user's Section 1 static-data MVP in this repository.

**Architecture:** Async repository/provider contracts load a shared data snapshot. UI and reusable R3F models share logical IDs and a guarded Zustand store. GLB loading and camera movement stay outside asset metadata.

**Tech Stack:** React, TypeScript, Vite, Three.js, React Three Fiber, Drei, Zustand; Vitest and Testing Library for requested non-WebGL checks.

**Spec:** ../specs/2026-09-08-foundation-design.md

## Constraints

- UI title: Interactive 3D Rack Twin. Package: interactive-3d-rack-twin.
- Static data only; no deployment or real infrastructure integrations.
- One shared XE7745 implementation with separate instance state.
- Technical specifications stay outside Three.js components.

## Execution checklist

- [x] Base and domain: package/config, `src/types`, four static JSON files, `src/data`, `src/store`, positioning and node mapper. Tests cover literal rack positions, invalid placement/IDs, async retrieval, sequential state guards and per-server isolation.
- [x] UI: `src/app`, `src/components`, `src/styles`. A real map click test verifies selected ID, camera focus and inspector. Native buttons provide keyboard selection.
- [x] 3D: `src/three/{scene,camera,models,interactions}`. Shared selection and GLB fallback wrapper, rack frame, 1U switches and shared 4U servers. Per-server transforms and component identity are connected. Browser checks cover the interaction sequence and camera navigation.
- [x] Handoff: README and GLB directories/conventions complete. TypeScript, tests, lint and build verified. Browser checked at both requested desktop sizes. See `docs/verification.md` for results and limitations.
