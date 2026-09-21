import { useEffect, useRef, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, Spherical, Vector3, type Object3D } from "three";
import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { isEquipment } from "../../types/assets";
import { rackPositionY, rackPositionZ } from "../../data/rackLayout";
import { useComponentFocus } from "../interactions/ComponentFocus";
import { componentFrame } from "../interactions/componentFrame";
import { serverPresentationFrame } from "./serverPresentationFrame";

export function CameraController() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const { rack, catalog, store } = useInfrastructure();
  const focus = useComponentFocus();
  const revision = useViewerStore((s) => s.cameraRevision);
  const preparing = useViewerStore((s) => s.presentationPreparing);
  const selectedAssetId = useViewerStore((s) => s.selectedAssetId);
  const selectedAsset = catalog.get(selectedAssetId ?? "");
  const selectedEquipment = selectedAsset?.type === "component" ? catalog.get(selectedAsset.parentId) : selectedAsset;
  const isSwitch = selectedEquipment?.type === "switch";
  const componentIdsByServer = useViewerStore((s) => s.componentIdsByServer);
  const target = useRef(new Vector3(0, rack.geometry.height / 2, 0));
  const spherical = useRef(new Spherical());
  const desired = useRef(new Spherical());
  const offset = useRef(new Vector3());
  const transitioning = useRef(false);
  const transitionRevision = useRef(-1);
  const orbitMotion = useRef<{ duration: number; elapsed: number; theta: number } | null>(null);
  const liveRoot = useRef<Object3D | undefined>(undefined);
  const serverFrame = useRef<ReturnType<typeof serverPresentationFrame> | undefined>(undefined);
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const state = store.getState();
    // A layout/registry refresh must not restart an in-flight revolution, including while paused.
    if (!preparing && orbitMotion.current && transitionRevision.current === state.cameraRevision) return;
    orbitMotion.current = null;
    if (preparing) { transitioning.current = false; return; }
    transitionRevision.current = state.cameraRevision;
    const selected = catalog.get(state.selectedAssetId ?? rack.id);
    let asset = selected;
    if (selected?.type === "component") asset = catalog.get(selected.parentId);
    const focusedAsset =
      (state.cameraMode === "focus" || asset?.type === "switch" && ["front", "rear"].includes(state.cameraMode)) && asset && isEquipment(asset)
        ? asset
        : undefined;
    liveRoot.current =
      focusedAsset?.type === "switch"
        ? focus.get(state.cameraMode === "focus" && selected?.type === "component" ? selected.id : focusedAsset.id)
        : state.cameraMode === "focus"
        ? selected?.type === "component"
          ? focus.get(selected.id)
          : focusedAsset?.type === "server" &&
              (state.cameraSide || state.cameraOrbitMs || state.servers[focusedAsset.id]?.exploded)
            ? focus.get(focusedAsset.id)
            : undefined
        : undefined;
    serverFrame.current = focusedAsset?.type === "server" && selected?.type !== "component" && (state.cameraOrbitMs || state.cameraServiceView)
      ? serverPresentationFrame(focus.get(focusedAsset.id), focusedAsset, rack, size.width / size.height, state.cameraServiceView)
      : undefined;
    const frame = serverFrame.current ?? (liveRoot.current
      ? componentFrame(liveRoot.current, size.width / size.height, 38, isSwitch ? 0.10 : 0.65)
      : undefined);
    const fullDistance =
      rack.geometry.height * Math.max(2.1, (1.35 * size.height) / size.width);
    if (frame) target.current.copy(frame.center);
    else
      target.current.set(
        0,
        focusedAsset
          ? rackPositionY(focusedAsset.rackPosition, rack)
          : rack.geometry.height / 2,
        focusedAsset
          ? rackPositionZ(focusedAsset, rack) +
              (focusedAsset.type === "server" &&
              state.servers[focusedAsset.id]?.extracted
                ? focusedAsset.geometry.depth * 0.9
                : 0)
          : 0,
      );
    spherical.current.setFromVector3(
      offset.current.copy(camera.position).sub(orbit.target),
    );
    let theta =
      serverFrame.current ? serverFrame.current.azimuthAngle : state.cameraSide === "rear" || state.cameraMode === "rear"
        ? Math.PI
        : state.cameraSide === "front" || state.cameraMode === "front"
          ? 0
          : focusedAsset?.type === "switch"
            ? selected?.type === "component" && selected.specifications?.location === "PSU_SIDE" ? Math.PI : 0
            : selected?.type === "component" &&
              (selected.assetType === "network" || selected.assetType === "power-supply")
            ? Math.PI
            : 0.55;
    theta =
      spherical.current.theta +
      MathUtils.euclideanModulo(
        theta - spherical.current.theta + Math.PI,
        2 * Math.PI,
      ) -
      Math.PI;
    desired.current.set(
      frame?.distance ??
        (focusedAsset
          ? Math.max(1.2, focusedAsset.geometry.depth * 2.05)
          : fullDistance),
      serverFrame.current ? serverFrame.current.polarAngle : state.cameraSide || focusedAsset?.type === "switch"
        ? Math.PI / 2
        : selected?.type === "component" && frame
        ? frame.polarAngle
        : focusedAsset
          ? 1.02
          : 1.36,
      theta,
    );
    transitioning.current = true;
    if (state.cameraOrbitMs && state.cameraSettledRevision !== state.cameraRevision && !reducedMotion.current)
      orbitMotion.current = { duration: state.cameraOrbitMs, elapsed: 0, theta };
  }, [
    revision,
    preparing,
    isSwitch,
    camera,
    catalog,
    componentIdsByServer,
    focus,
    rack,
    selectedAssetId,
    store,
    size.width,
    size.height,
  ]);
  useFrame((_, delta) => {
    const orbit = controls.current;
    const state = store.getState();
    if (!orbit || state.presentationPaused || (!transitioning.current && !orbitMotion.current)) return;
    if (!transitioning.current && orbitMotion.current) {
      const motion = orbitMotion.current;
      motion.elapsed = Math.min(motion.duration, motion.elapsed + Math.min(delta, 0.1) * 1000 * state.presentationRate);
      const progress = motion.elapsed / motion.duration;
      // Unwrapped angle: a complete revolution must not take the shortest path back to itself.
      spherical.current.theta = motion.theta + 2 * Math.PI * progress * progress * (3 - 2 * progress);
      camera.position.copy(offset.current.setFromSpherical(spherical.current)).add(orbit.target);
      orbit.update();
      if (progress === 1) {
        orbitMotion.current = null;
        store.setState({ cameraSettledRevision: transitionRevision.current });
      }
      return;
    }
    const frame = serverFrame.current ?? (liveRoot.current
      ? componentFrame(liveRoot.current, size.width / size.height, 38, isSwitch ? 0.10 : 0.65)
      : undefined);
    if (frame) {
      target.current.copy(frame.center);
      desired.current.radius = frame.distance;
    }
    const t = reducedMotion.current ? 1 : 1 - Math.exp(-5 * delta * store.getState().presentationRate);
    spherical.current.radius = MathUtils.lerp(
      spherical.current.radius,
      desired.current.radius,
      t,
    );
    spherical.current.phi = MathUtils.lerp(
      spherical.current.phi,
      desired.current.phi,
      t,
    );
    spherical.current.theta = MathUtils.lerp(
      spherical.current.theta,
      desired.current.theta,
      t,
    );
    orbit.target.lerp(target.current, t);
    camera.position
      .copy(offset.current.setFromSpherical(spherical.current))
      .add(orbit.target);
    orbit.update();
    if (
      Math.abs(spherical.current.radius - desired.current.radius) < 0.001 &&
      Math.abs(spherical.current.phi - desired.current.phi) < 0.001 &&
      Math.abs(spherical.current.theta - desired.current.theta) < 0.001 &&
      orbit.target.distanceTo(target.current) < 0.001
    ) {
      transitioning.current = false;
      if (!orbitMotion.current) store.setState({ cameraSettledRevision: transitionRevision.current });
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={isSwitch ? 0.08 : 0.65}
      maxDistance={rack.geometry.height * 4}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI / 2 + 0.1}
      target={[0, rack.geometry.height / 2, 0]}
      onStart={() => {
        transitioning.current = false;
        orbitMotion.current = null;
      }}
    />
  );
}
