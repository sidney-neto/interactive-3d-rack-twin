import {
  useInfrastructure,
  useViewerStore,
} from "../data/infrastructureContext";

export function useExplodedViewAvailability() {
  const { assets } = useInfrastructure();
  const serverId = useViewerStore((state) => state.selectedServerId);
  const bezelAvailable = useViewerStore(
    (state) => !!state.bezelAvailable[state.selectedServerId ?? ""],
  );
  const bezelRemoved = useViewerStore(
    (state) => !!state.servers[state.selectedServerId ?? ""]?.bezelRemoved,
  );
  const componentIds = useViewerStore(
    (state) => state.componentIdsByServer[state.selectedServerId ?? ""],
  );
  const inventoryComponents = assets.filter(
    (asset) => asset.type === "component" && asset.parentId === serverId,
  );
  const componentModelAvailable =
    inventoryComponents.length > 0 &&
    inventoryComponents.every((asset) => componentIds?.includes(asset.id));
  const reason = !serverId
    ? "Select a server first"
    : bezelAvailable && !bezelRemoved
      ? "Remove the bezel before entering exploded view."
      : !componentModelAvailable
        ? "Exploded component model is unavailable or still loading."
        : null;

  return {
    serverId,
    bezelAvailable,
    bezelRemoved,
    componentModelAvailable,
    canEnter: reason === null,
    reason,
  };
}
