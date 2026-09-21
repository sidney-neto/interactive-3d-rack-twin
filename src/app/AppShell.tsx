import { lazy, Suspense } from "react";
import { Header } from "../components/layout/Header";
import { ViewModes } from "../components/layout/ViewModes";
import { RackUnitMap } from "../components/rack-map/RackUnitMap";
import { InspectorPanel } from "../components/inspector/InspectorPanel";
import {
  useInfrastructure,
  useViewerStore,
} from "../data/infrastructureContext";
import { getViewerState } from "../store/viewerStore";
import { isEquipment } from "../types/assets";

const Viewer3D = lazy(() => import("../three/scene/Viewer3D"));
export function AppShell() {
  const { rack, assets } = useInfrastructure();
  const phase = useViewerStore(getViewerState);
  return (
    <div className="app-shell">
      <Header />
      <ViewModes />
      <main className="workspace">
        <RackUnitMap />
        <Suspense
          fallback={
            <div className="loading-screen" role="status">
              Loading 3D Environment…
            </div>
          }
        >
          <Viewer3D />
        </Suspense>
        <InspectorPanel />
      </main>
      <footer className="app-footer">
        <span>
          <i className="status-dot online" />
          Static dataset loaded
        </span>
        <span>
          {rack.id}
          <i>·</i>
          {rack.units}U<i>·</i>
          {assets.filter(isEquipment).length} assets
        </span>
        <span aria-live="polite">
          {phase.replaceAll("_", " ")}
          <i>·</i>WebGL viewer
        </span>
      </footer>
    </div>
  );
}
