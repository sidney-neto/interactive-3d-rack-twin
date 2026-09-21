/* eslint-disable react-refresh/only-export-components */
import { useRef, useState, type ReactNode } from "react";
import { Box3, Box3Helper, type Object3D } from "three";
import { useCursor } from "@react-three/drei";
import { createPortal, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { canSelectComponent, type Asset } from "../../types/assets";
import { resolveComponentRoot } from "./componentRegistry";

export function componentIdFromHit(
  hit: Object3D,
  registry: ReadonlyMap<string, Object3D>,
  serverId: string,
  open: boolean,
  catalog: ReadonlyMap<string, Asset>,
): string | undefined {
  const root = resolveComponentRoot(hit, registry);
  const id = root?.userData.logicalAssetId;
  const asset = typeof id === "string" ? catalog.get(id) : undefined;
  return canSelectComponent(asset, open) && asset.parentId === serverId
    ? asset.id
    : undefined;
}

function ComponentBounds({ root, selected }: { root: Object3D; selected: boolean }) {
  const scene = useThree((state) => state.scene);
  const [box] = useState(() => new Box3());
  const helper = useRef<Box3Helper>(null);
  useFrame(() => {
    root.updateWorldMatrix(true, true);
    box.setFromObject(root);
    if (helper.current) helper.current.visible = !box.isEmpty();
  });
  return createPortal(
    <box3Helper
      ref={helper}
      args={[box, selected ? "#66adff" : "#8499b4"]}
      raycast={() => {}}
    />,
    scene,
  );
}

export function ComponentInteraction({
  registry,
  serverId,
  open,
  children,
}: {
  registry: ReadonlyMap<string, Object3D>;
  serverId: string;
  open: boolean;
  children: ReactNode;
}) {
  const { catalog, store } = useInfrastructure();
  const selectedId = useViewerStore((state) => state.selectedComponentId);
  const selectedAssetId = useViewerStore((state) => state.selectedAssetId);
  const cameraRevision = useViewerStore((state) => state.cameraRevision);
  const hoverKey = `${open}:${selectedAssetId}:${cameraRevision}`;
  const [hovered, setHovered] = useState<{ id?: string; key: string }>({
    key: hoverKey,
  });
  const hoveredId = hovered.key === hoverKey ? hovered.id : undefined;
  useCursor(!!hoveredId);
  const activeId = selectedId ?? hoveredId ?? "";
  const root = canSelectComponent(catalog.get(activeId), open) && registry.get(activeId);
  const selectedAsset = catalog.get(selectedAssetId ?? "");
  const switchActive = catalog.get(serverId)?.type !== "switch" ||
    selectedAssetId === serverId || selectedAsset?.type === "component" && selectedAsset.parentId === serverId;
  const idFor = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    switchActive ? componentIdFromHit(event.object, registry, serverId, open, catalog) : undefined;
  return (
    <group
      onClick={(event) => {
        const id = idFor(event);
        if (!id || event.delta > 4) return;
        event.stopPropagation();
        const actions = store.getState();
        actions.selectAsset(serverId);
        actions.selectComponent(id);
        actions.setCamera("focus");
      }}
      onPointerMove={(event) => {
        const id = idFor(event);
        if (id) event.stopPropagation();
        setHovered({ id, key: hoverKey });
      }}
      onPointerOut={() => setHovered({ key: hoverKey })}
    >
      {children}
      {root && <ComponentBounds root={root} selected={root === registry.get(selectedId ?? "")} />}
    </group>
  );
}
