import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import {
  animateModelCover,
  createModelInstance,
  setModelBezelRemoved,
} from "./modelInstance";
import { nextExplodeFactor, setExplodeFactor } from "./explodedView";
import { ComponentInteraction } from "../interactions/ComponentInteraction";
import { useComponentFocus } from "../interactions/ComponentFocus";
import { useInfrastructure } from "../../data/infrastructureContext";
import { dockedServer, serviceSignature } from "../../store/viewerStore";

function GLBModel({
  url,
  assetId,
  centerOrigin,
  coverLift,
  bezelRemoved,
  serverOpen,
  exploded,
  onBezelAvailabilityChange,
}: {
  url: string;
  assetId: string;
  centerOrigin: boolean;
  coverLift: number;
  bezelRemoved: boolean;
  serverOpen: boolean;
  exploded: boolean;
  onBezelAvailabilityChange?: (available: boolean) => void;
}) {
  const { scene } = useGLTF(url);
  const { store } = useInfrastructure();
  const focus = useComponentFocus();
  const instance = useMemo(
    () => createModelInstance(scene, assetId, centerOrigin),
    [scene, assetId, centerOrigin],
  );
  const explodeFactor = useRef(0);
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    onBezelAvailabilityChange?.(!!instance.bezel);
    return () => onBezelAvailabilityChange?.(false);
  }, [instance, onBezelAvailabilityChange]);
  useEffect(() => {
    const roots = new Map(instance.componentRegistry);
    roots.set(assetId, instance.object);
    const unregister = focus.register(roots);
    store
      .getState()
      .setComponentIds(assetId, [...instance.componentRegistry.keys()]);
    store.getState().reportModel(assetId, "ready");
    return () => {
      unregister();
      store.getState().setComponentIds(assetId, []);
      store.getState().reportModel(assetId, "loading");
    };
  }, [assetId, focus, instance, store]);
  useEffect(() => {
    setModelBezelRemoved(instance, bezelRemoved);
  }, [instance, bezelRemoved]);
  useFrame((_, delta) => {
    const s = store.getState();
    const elapsed = delta * s.presentationRate;
    const target = serverOpen && exploded ? 1 : 0;
    explodeFactor.current = nextExplodeFactor(
      explodeFactor.current,
      target,
      reducedMotion.current ? Number.POSITIVE_INFINITY : elapsed,
    );
    setExplodeFactor(instance, explodeFactor.current);
    animateModelCover(
      instance,
      serverOpen ? coverLift : 0,
      reducedMotion.current ? 1 : 1 - Math.exp(-8 * elapsed),
      explodeFactor.current,
    );
    s.reportMotion(`${assetId}:model`, serviceSignature(s.servers[assetId] ?? dockedServer),
      serverOpen === (s.servers[assetId]?.open ?? false) && exploded === (s.servers[assetId]?.exploded ?? false) &&
      explodeFactor.current === target && (!instance.cover || instance.cover.position.distanceTo(instance.target) < 0.0001));
  });
  // Cached geometry/materials stay unmodified and are shared by cloned instances.
  return (
    <ComponentInteraction
      registry={instance.componentRegistry}
      serverId={assetId}
      open={serverOpen}
    >
      <primitive object={instance.object} dispose={null} />
    </ComponentInteraction>
  );
}
function ModelFallback({ assetId, status, children }: { assetId: string; status: "loading" | "unavailable"; children: ReactNode }) {
  const { store } = useInfrastructure();
  useEffect(() => { store.getState().reportModel(assetId, status); }, [assetId, status, store]);
  return children;
}
export function ModelAsset({
  url,
  assetId,
  children,
  centerOrigin = false,
  coverLift = 0,
  bezelRemoved = false,
  serverOpen = false,
  exploded = false,
  onBezelAvailabilityChange,
}: {
  url: string | null;
  assetId: string;
  children: ReactNode;
  centerOrigin?: boolean;
  coverLift?: number;
  bezelRemoved?: boolean;
  serverOpen?: boolean;
  exploded?: boolean;
  onBezelAvailabilityChange?: (available: boolean) => void;
}) {
  const fallback = (status: "loading" | "unavailable") => <ModelFallback assetId={assetId} status={status}>{children}</ModelFallback>;
  if (!url) return fallback("unavailable");
  return (
    <ErrorBoundary
      key={url}
      label={`Failed to load model for ${assetId}: ${url}. Using placeholder.`}
      fallback={fallback("unavailable")}
    >
      <Suspense fallback={fallback("loading")}>
        <GLBModel
          url={url}
          assetId={assetId}
          centerOrigin={centerOrigin}
          coverLift={coverLift}
          bezelRemoved={bezelRemoved}
          serverOpen={serverOpen}
          exploded={exploded}
          onBezelAvailabilityChange={onBezelAvailabilityChange}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
