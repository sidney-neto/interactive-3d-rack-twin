import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { useExplodedViewAvailability } from "../../hooks/useExplodedViewAvailability";
import { Icon } from "./Icon";

export function ViewModes() {
  const { store, assets, catalog } = useInfrastructure();
  const selectedId = useViewerStore((s) => s.selectedAssetId);
  const selected = catalog.get(selectedId ?? "");
  const equipment = selected?.type === "component" ? catalog.get(selected.parentId) : selected;
  const switchId = equipment?.type === "switch" ? equipment.id : null;
  const mode = useViewerStore((s) => s.viewerMode);
  const { serverId, componentModelAvailable, canEnter, reason } =
    useExplodedViewAvailability();
  return (
    <nav className="view-modes" aria-label="Viewer modes">
      <button
        aria-pressed={mode !== "exploded" && mode !== "component"}
        onClick={() => store.getState().resetViewer()}
      >
        <Icon name="cube" size={16} />
        Rack View
      </button>
      <button
        disabled={!canEnter}
        title={switchId ? "Switch disassembly is outside Section 2.3" : reason ?? "Open a conceptual exploded view"}
        aria-describedby={reason ? "toolbar-explosion-prerequisite" : undefined}
        aria-pressed={mode === "exploded"}
        onClick={() => {
          if (!canEnter) return;
          const s = store.getState();
          s.extractServer();
          s.openServer();
          s.enterExplodedView();
          s.setCamera("focus");
        }}
      >
        <Icon name="layers" size={16} />
        Exploded View
      </button>
      <button
        disabled={!serverId && !switchId}
        title={
          switchId
            ? "Inspect physical switch ports and removable modules"
            : componentModelAvailable
            ? "Open the selected server to inspect its component inventory"
            : "Component model unavailable; inventory focus uses the parent server"
        }
        aria-pressed={mode === "component"}
        onClick={() => {
          const s = store.getState();
          if (!switchId) {
            s.extractServer();
            s.openServer();
          }
          const component = assets.find(
            (a) => a.type === "component" && a.parentId === (switchId ?? serverId),
          );
          if (component) s.selectComponent(component.id);
          s.setCamera("focus");
        }}
      >
        <Icon name="chip" size={16} />
        Components
      </button>
      <button
        aria-controls="asset-inspector"
        onClick={() => document.getElementById("asset-inspector")?.focus()}
      >
        <Icon name="specs" size={16} />
        Specifications
      </button>
      <span className="view-mode-note">
        {switchId ? (
          <span id="toolbar-explosion-prerequisite">{switchId} · Physical ports and modules</span>
        ) : reason ? (
          <span id="toolbar-explosion-prerequisite">{reason}</span>
        ) : (
          <>
            {serverId}
            <span className="separator">/</span>3D workspace
          </>
        )}
      </span>
    </nav>
  );
}
