import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFShadowMap } from "three";
import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ViewerToolbar } from "../../components/layout/ViewerToolbar";
import { PresentationControls } from "../../components/layout/PresentationControls";
import { Scene } from "./Scene";

export default function Viewer3D() {
  const { rack, store, catalog } = useInfrastructure();
  const camera = useViewerStore((s) => s.cameraMode);
  const selected = useViewerStore((s) => s.selectedAssetId);
  const componentIdsByServer = useViewerStore((s) => s.componentIdsByServer);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [generation, setGeneration] = useState(0);
  const selectedAsset = catalog.get(selected ?? rack.id);
  const componentModelUnavailable =
    selectedAsset?.type === "component" &&
    !componentIdsByServer[selectedAsset.parentId]?.includes(selectedAsset.id);
  const fallback = (
    <div className="viewer-unavailable" role="alert">
      <strong>3D viewer unavailable</strong>
      <p>
        Enable WebGL in your browser. The rack map and inspector remain
        available.
      </p>
      <button
        onClick={() => {
          setLost(false);
          setReady(false);
          setGeneration((n) => n + 1);
        }}
      >
        Retry viewer
      </button>
    </div>
  );
  return (
    <section className="viewer" aria-label="Interactive 3D rack viewer">
      <div className="viewer-heading">
        <div className="viewer-breadcrumb">
          Infrastructure lab <span>/</span> {rack.id}
        </div>
        <h2>Rack overview</h2>
        <p>Isolated infrastructure · {rack.units}U</p>
      </div>
      <div className="viewport-badge">
        <span className="viewport-dot" />
        {camera === "rear"
          ? "REAR"
          : camera === "front"
            ? "FRONT"
            : camera === "focus"
              ? "FOCUS"
              : "PERSPECTIVE"}
      </div>
      <ErrorBoundary
        key={generation}
        fallback={fallback}
        label="WebGL initialization failed"
      >
        {lost ? (
          fallback
        ) : (
          <Canvas
            shadows={{ type: PCFShadowMap }}
            dpr={[1, 1.75]}
            camera={{
              position: [2.1, 1.85, 3.4],
              fov: 38,
              near: 0.01,
              far: 100,
            }}
            gl={{ antialias: true, alpha: false }}
            onPointerMissed={(event) => {
              if (event.type === "click") store.getState().clearSelection();
            }}
            onCreated={({ gl }) => {
              setReady(true);
              gl.domElement.addEventListener(
                "webglcontextlost",
                (event) => {
                  event.preventDefault();
                  setLost(true);
                },
                { once: true },
              );
            }}
            fallback={
              <p>
                Interactive rack visualization. Use the rack map to select
                equipment and the inspector to read its specifications.
              </p>
            }
          >
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
          </Canvas>
        )}
      </ErrorBoundary>
      {!ready && !lost && (
        <div className="canvas-loading" role="status">
          Loading 3D Environment…
        </div>
      )}
      <div className="viewer-caption">
        <span className="caption-line" />
        <div>
          <strong>{catalog.get(selected ?? rack.id)?.name ?? rack.name}</strong>
          <span>
            {selected ?? rack.id} ·{" "}
            {selected ? "Selected asset" : "Select equipment to explore"}
          </span>
        </div>
      </div>
      <div className="orientation">
        <span>Y</span>
        <div>
          <i />
          <b />Z <em>X</em>
        </div>
      </div>
      <ViewerToolbar />
      <PresentationControls />
      <div className="navigation-hint">
        {componentModelUnavailable ? (
          `Component model unavailable · focusing parent ${selectedAsset?.type === "component" && catalog.get(selectedAsset.parentId)?.type === "switch" ? "switch" : "server"}`
        ) : (
          <>
            Drag to orbit<span>·</span>Scroll to zoom<span>·</span>Click to inspect
          </>
        )}
      </div>
    </section>
  );
}
