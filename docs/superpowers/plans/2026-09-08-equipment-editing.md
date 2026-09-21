# Equipment editing implementation plan

The user's equipment-editing specification is the approved scope. Preserve the current uncommitted foundation; no backend, new packages or model implementation is needed.

- [x] Add repository tests for trimmed names, legal moves, collisions, bounds, immutable identity/specs, reload persistence and storage failures. Extend AssetRepository with `updateEquipment(id, { name, startU })`, returning the updated snapshot. Use one versioned localStorage record keyed by asset ID. Validate all persisted overrides together so reloads preserve legal moves into vacated units. Invalid overrides fall back to bundled defaults with a visible warning; failed saves retain the existing snapshot.
- [x] Expose updates through InfrastructureProvider. Validate docked/closed server state at the application boundary. Keep the existing Zustand instance and refresh the shared assets/catalog only after persistence succeeds. Focus after a successful save without replacing selected IDs or sibling state.
- [x] Add an accessible EquipmentEditor to the inspector. Use native fields, read-only height, a derived occupied range, Save and Cancel. Update human-facing labels while retaining stable secondary IDs; eliminate the rack map's assumption of one contiguous free area.
- [x] Test the real editor/map/inspector flow, cancel, failure feedback and server movement restrictions. Run TypeScript, tests, ESLint and build. Review the change and verify server/switch editing, overlap rejection and reload persistence in the browser. Document storage scope and limitations.
