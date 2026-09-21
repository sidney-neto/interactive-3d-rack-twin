import { useCallback, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { MathUtils, type Group } from "three";
import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { rackPositionY, rackPositionZ } from "../../data/rackLayout";
import type { ServerAsset } from "../../types/assets";
import { dockedServer, serviceSignature } from "../../store/viewerStore";
import { AssetSelection } from "../interactions/AssetSelection";
import { Box } from "./Box";
import { ModelAsset } from "./ModelAsset";

export function XE7745({ asset }: { asset: ServerAsset }) {
  const { rack, assets, store } = useInfrastructure();
  const reportBezel = useCallback(
    (available: boolean) => {
      store.getState().setBezelAvailable(asset.id, available);
    },
    [asset.id, store],
  );
  const state = useViewerStore((s) => s.servers[asset.id] ?? dockedServer);
  const body = useRef<Group>(null);
  const cover = useRef<Group>(null);
  const internal = useRef<Group>(null);
  const reducedMotion = useRef(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const { width, depth } = asset.geometry;
  const height =
    asset.geometry.height ??
    asset.rackPosition.heightU * rack.geometry.unitHeight - 0.006;
  const z = rackPositionZ(asset, rack);
  // Only coarse CPU/GPU blocks are shown; the complete component inventory lives in the repository.
  const blocks = assets.filter(
    (a) =>
      a.type === "component" &&
      a.parentId === asset.id &&
      (a.assetType === "gpu" || a.assetType === "cpu"),
  );
  useFrame((_, delta) => {
    const s = store.getState();
    const speed = reducedMotion.current ? 1 : 1 - Math.exp(-8 * delta * s.presentationRate);
    if (body.current)
      body.current.position.z = MathUtils.lerp(
        body.current.position.z,
        z + (state.extracted ? depth * 0.9 : 0),
        speed,
      );
    if (cover.current)
      cover.current.position.y = MathUtils.lerp(
        cover.current.position.y,
        height / 2 + (state.open ? height * 2.2 : 0),
        speed,
      );
    if (internal.current)
      internal.current.position.y = MathUtils.lerp(
        internal.current.position.y,
        state.exploded ? height * 1.05 : 0,
        speed,
      );
    s.reportMotion(`${asset.id}:body`, serviceSignature(state),
      !!body.current && Math.abs(body.current.position.z - z - (state.extracted ? depth * 0.9 : 0)) < 0.0001 &&
      (!cover.current || Math.abs(cover.current.position.y - height / 2 - (state.open ? height * 2.2 : 0)) < 0.0001) &&
      (!internal.current || Math.abs(internal.current.position.y - (state.exploded ? height * 1.05 : 0)) < 0.0001));
  });
  return (
    <group
      ref={body}
      position={[0, rackPositionY(asset.rackPosition, rack), z]}
    >
      <AssetSelection
        assetId={asset.id}
        size={[width + 0.016, height + 0.006, depth + 0.01]}
      >
        <ModelAsset
          url={asset.geometry.modelUrl}
          assetId={asset.id}
          centerOrigin
          bezelRemoved={state.bezelRemoved}
          serverOpen={state.open}
          exploded={state.exploded}
          onBezelAvailabilityChange={reportBezel}
          coverLift={height * 1.8}
        >
          <Box
            size={[width, 0.015, depth]}
            position={[0, -height / 2, 0]}
            color="#68727e"
          />
          {[-1, 1].map((side) => (
            <Box
              key={side}
              size={[0.013, height, depth]}
              position={[(side * width) / 2, 0, 0]}
              color="#53606c"
            />
          ))}
          <Box
            size={[width, height, 0.027]}
            position={[0, 0, depth / 2 - 0.013]}
            color="#313b47"
          />
          <Box
            size={[width * 0.87, height * 0.61, 0.005]}
            position={[0, 0.003, depth / 2 + 0.002]}
            color="#111920"
          />
          {Array.from({ length: 12 }, (_, i) => (
            <Box
              key={i}
              size={[0.011, height * 0.49, 0.007]}
              position={[
                -width * 0.37 + i * width * 0.068,
                0.003,
                depth / 2 + 0.006,
              ]}
              color="#303a43"
            />
          ))}
          {[-1, 1].map((side) => (
            <Box
              key={`handle${side}`}
              size={[0.013, height * 0.72, 0.025]}
              position={[side * width * 0.47, 0, depth / 2 + 0.014]}
              color="#7b8794"
            />
          ))}
          <Box
            size={[width, height, 0.02]}
            position={[0, 0, -depth / 2]}
            color="#4a5661"
          />
          {[-1, 0, 1].map((i) => (
            <Box
              key={`back${i}`}
              size={[width * 0.21, height * 0.65, 0.004]}
              position={[i * width * 0.28, 0, -depth / 2 - 0.012]}
              color="#18212a"
            />
          ))}
          <group ref={cover} position={[0, height / 2, 0]}>
            <Box size={[width, 0.012, depth - 0.025]} color="#7a8590" />
          </group>
          {state.open && (
            <group ref={internal}>
              {blocks.map((block, i) => (
                <group
                  key={block.id}
                  position={[
                    (i % 2 === 0 ? -1 : 1) *
                      width *
                      (state.exploded ? 0.34 : 0.23),
                    height * 0.06,
                    (Math.floor(i / 2) - 1) * depth * 0.27,
                  ]}
                >
                  <Box
                    size={[width * 0.34, height * 0.35, depth * 0.18]}
                    color={
                      block.type === "component" && block.assetType === "gpu"
                        ? "#436378"
                        : "#75818a"
                    }
                  />
                </group>
              ))}
            </group>
          )}
        </ModelAsset>
        <Html
          position={[0, -height * 0.34, depth / 2 + 0.014]}
          transform
          distanceFactor={0.38}
          occlude
          style={{ pointerEvents: "none" }}
        >
          <span className="model-id server-label" title={asset.name}>
            <strong>{asset.name}</strong>
            <small>{asset.id}</small>
          </span>
        </Html>
      </AssetSelection>
    </group>
  );
}
