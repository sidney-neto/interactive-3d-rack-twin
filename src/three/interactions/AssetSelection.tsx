import { useState, type ReactNode } from "react";
import { Edges, useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import type { Vec3 } from "../models/Box";
import { selectAssetHit } from "./assetHitSelection";

export function AssetSelection({
  assetId,
  size,
  children,
}: {
  assetId: string;
  size: Vec3;
  children: ReactNode;
}) {
  const { catalog, store } = useInfrastructure();
  const selected = useViewerStore((s) => {
    const component = catalog.get(s.selectedComponentId ?? "");
    return s.selectedAssetId === assetId || s.selectedServerId === assetId ||
      component?.type === "component" && component.parentId === assetId;
  });
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > 4) return;
    selectAssetHit(event.object, assetId, catalog, store);
  };
  return (
    <group
      userData={{ assetId }}
      onClick={select}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {children}
      {(selected || hovered) && (
        <mesh raycast={() => {}}>
          <boxGeometry args={size} />
          <meshBasicMaterial
            transparent
            opacity={0.025}
            color="#59a5ff"
            depthWrite={false}
          />
          <Edges
            color={selected ? "#66adff" : "#8499b4"}
            lineWidth={selected ? 1.6 : 1}
            raycast={() => {}}
          />
        </mesh>
      )}
    </group>
  );
}
