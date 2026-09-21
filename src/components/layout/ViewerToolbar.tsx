import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { Icon } from "./Icon";
import type { CameraMode } from "../../types/viewer";

export function ViewerToolbar() {
  const { store, catalog } = useInfrastructure();
  const selectedId = useViewerStore((s) => s.selectedAssetId);
  const selected = catalog.get(selectedId ?? "");
  const isSwitch = selected?.type === "switch" || selected?.type === "component" && catalog.get(selected.parentId)?.type === "switch";
  const camera = useViewerStore((s) => s.cameraMode);
  const controls: {
    mode: CameraMode;
    label: string;
    icon: "rotate" | "front" | "rear" | "focus";
  }[] = [
    { mode: "free", label: "Rotate", icon: "rotate" },
    { mode: "front", label: isSwitch ? "Front / I/O" : "Front", icon: "front" },
    { mode: "rear", label: isSwitch ? "Rear / PSU" : "Rear", icon: "rear" },
    { mode: "focus", label: "Focus", icon: "focus" },
  ];
  return (
    <div className="viewer-toolbar" role="toolbar" aria-label="Camera controls">
      {controls.map((c) => (
        <button
          key={c.mode}
          aria-pressed={camera === c.mode}
          onClick={() => store.getState().setCamera(c.mode)}
        >
          <Icon name={c.icon} size={17} />
          <span>{c.label}</span>
        </button>
      ))}
      <span className="toolbar-divider" />
      <button
        onClick={() => store.getState().setCamera("free")}
        aria-label="Reset camera"
      >
        <Icon name="reset" size={17} />
        <span>Reset</span>
      </button>
    </div>
  );
}
