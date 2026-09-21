<div align="center">

<h1>Interactive 3D Rack Twin</h1>

![Version](https://img.shields.io/badge/version-v0.1.0-555)
&nbsp;![Status: static-data MVP](https://img.shields.io/badge/status-static--data%20MVP-9B30FF)
&nbsp;![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
&nbsp;![Three.js](https://img.shields.io/badge/Three.js-3D-FF6A00?logo=threedotjs&logoColor=white)
&nbsp;![Blender](https://img.shields.io/badge/Blender-3D%20models-E87D0D?logo=blender&logoColor=white)

</div>

Interactive 3D Rack Twin is a browser-based viewer for exploring a server rack, its equipment and internal hardware components. This **static-data MVP** uses configured inventory and illustrative 3D models, not live monitoring or OEM CAD.

<div align="center">

<video src="media/demo.mp4" controls width="800" aria-label="Interactive 3D Rack Twin demo"></video>

</div>

## Features and equipment

- **Navigate:** orbit through 360°, zoom, and use front, rear, focus and reset views.
- **Inspect:** select equipment or components in the scene, rack map or inspector to explore specifications.
- **Explore servers:** remove bezels, extract and open servers, then inspect their components in exploded views.
- **Present:** run Executive or Detailed guided tours with pause, resume, stop and adjustable speed.
- **Edit locally:** rename equipment and change rack positions with bounds and overlap validation.

| Quantity | Equipment | Default placement |
| --- | --- | --- |
| 1 | 44U rack | U1–U44 |
| 2 | Dell PowerEdge XE7745 servers | U35–U38, U39–U42 |
| 2 | Dell PowerSwitch S5232F-ON switches | U43, U44 |

Configured inventory per server includes four NVIDIA H200 GPUs, two AMD EPYC 9555 CPUs and 24 × 64 GB DDR5 DIMMs. Modeled components also include the NVLink bridge, front SSDs, BOSS boot storage, network adapters, fans and power supplies. Switch inspection covers ports, fans and power supplies. These values describe the bundled inventory, not a verified physical installation.

## Quick start

Use **Node.js 22.12 or newer**, npm, and a desktop browser with WebGL support. From the repository directory:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The development server binds to the local machine.

The supplied server and switch models are ready to use. Blender is needed only to regenerate them.

## Using the viewer

Select equipment in the rack map or 3D scene, then use the Inspector to select and focus its components. For server internals, use **Extract server**, **Open server**, **Remove bezel**, then **Exploded view**. Each server keeps its own state. **Reset camera** changes only the camera; **Rack View** assembles and returns both servers, installs their bezels and clears selection. Saved equipment edits are preserved.

### Guided presentations

Choose **Executive** for a rack overview and representative server/switch components, or **Detailed** to visit all available components on both servers and switches. Click **Play presentation**; stop playback before changing modes.

- **Pause / Resume** pauses camera motion and progression; service animations already in progress may finish.
- **Stop** or **Escape** restores the previous selection, service states and camera preset. Escape is ignored while using form controls; exact manually orbited camera positions are not restored.
- **1× / 2× / 4×** changes speed without skipping steps.
- Manual orbit or scrolling pauses. Selecting equipment, editing or using another viewer action cancels playback and retains the current service pose for inspection.
- Hiding the tab pauses playback until you resume. Reduced-motion preferences are honored.

Normal completion returns to the assembled rack. Unavailable models retain placeholders and an availability note identifies omitted components. The rack and other equipment stay rendered during close-ups, so they can occlude a view.

### Editing and saved-data recovery

Select a server or switch, choose **Edit equipment**, and update its display name or starting rack unit. The starting unit is the lowest occupied unit: a 4U server at U20 occupies U20–U23. Positions must be integers within the rack and must not overlap other equipment. Close and return a server to the rack before moving it. **Save changes** persists the edit; **Cancel** discards the draft.

Edits use the browser-local key `interactive-3d-rack-twin.equipment-overrides.v1`, scoped to the origin, including its port. Only names and starting units are stored; bundled inventory files are not changed. The legacy `sidia-3d-rack-twin.equipment-overrides.v1` record remains readable when the new key is absent. Saving writes the new key and preserves the legacy record. **Rack View** resets visualization state, not saved equipment edits.

Invalid or conflicting saved data triggers a warning and loads defaults without deleting the record. Saving stays blocked until the record is repaired. In browser developer tools, open **Application/Storage → Local Storage** for the current origin and back up this application's records first. Restore valid data, or remove only the active application key and reload. If removing the new key exposes an invalid legacy record, back up and repair or remove that legacy key too. Do not clear unrelated browser storage.

If storage permissions or quota prevent saving, the form remains open and the existing inventory stays unchanged. Resolve the browser storage issue and retry. Other tabs see saved edits after reload; there is no cross-device synchronization.

## Technology and checks

Built with React, TypeScript, Vite, Three.js, React Three Fiber, Drei and Zustand. Checks use Vitest, Testing Library and ESLint.

```sh
npm test
npm run lint
npm run build
```

The build includes TypeScript checks and writes to `dist/`. Use `npm run preview` to inspect it locally.

## Documentation and limitations

See the [model guide](docs/model-integration.md) for Blender generation, validation, integration conventions and hardware references.

Equipment edits persist only in the current browser and origin, including its port. There is no backend, shared database or live telemetry. The interface targets desktop use; mobile layouts are outside the current scope. Geometry and service motions are visual approximations, not maintenance instructions.
