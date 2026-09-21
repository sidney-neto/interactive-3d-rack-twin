import { useEffect, useState, type ReactNode } from "react";
import {
  InfrastructureContext,
  type Infrastructure,
} from "./infrastructureContext";
import {
  services as defaultServices,
  type InfrastructureServices,
} from "./services";
import { createViewerStore } from "../store/viewerStore";
import { validateRackLayout } from "./rackLayout";
import { isEquipment } from "../types/assets";
import { applyEquipmentOverrides } from "./equipmentEditing";
import type { EquipmentChanges } from "./repositories/AssetRepository";

export function InfrastructureProvider({
  children,
  services = defaultServices,
}: {
  children: ReactNode;
  services?: InfrastructureServices;
}) {
  const [data, setData] = useState<Omit<
    Infrastructure,
    "updateEquipment"
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      services.racks.getRack("RACK-01"),
      services.assets.listAssets(),
    ])
      .then(([rack, assets]) => {
        if (!rack)
          throw new Error("RACK-01 is missing from the rack repository.");
        validateRackLayout(rack, assets);
        if (!cancelled)
          setData({
            rack,
            assets,
            catalog: new Map(assets.map((a) => [a.id, a])),
            store: createViewerStore(assets),
            services,
            loadWarning: services.assets.loadWarning ?? null,
          });
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load infrastructure data.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [services]);
  const updateEquipment = async (id: string, changes: EquipmentChanges) => {
    if (!data) throw new Error("Infrastructure is still loading.");
    const asset = data.catalog.get(id);
    if (!asset || !isEquipment(asset))
      throw new Error(`Unknown equipment: ${id}`);
    const state = data.store.getState().servers[id];
    if (
      asset.type === "server" &&
      changes.startU !== asset.rackPosition.startU &&
      (state?.extracted || state?.open || state?.exploded)
    ) {
      throw new Error(
        "Return this server to the rack and close it before changing its rack position.",
      );
    }
    applyEquipmentOverrides(data.assets, { [id]: changes });
    const assets = await services.assets.updateEquipment(id, changes);
    setData((current) =>
      current
        ? {
            ...current,
            assets,
            catalog: new Map(assets.map((a) => [a.id, a])),
            loadWarning: services.assets.loadWarning ?? null,
          }
        : current,
    );
    const selection = data.store.getState();
    if (selection.selectedAssetId === id || selection.selectedServerId === id)
      selection.setCamera("focus");
  };
  if (error)
    return (
      <main className="loading-screen" role="alert">
        <h1>Interactive 3D Rack Twin</h1>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </main>
    );
  if (!data)
    return (
      <main className="loading-screen" role="status">
        Loading Interactive 3D Rack Twin…
      </main>
    );
  return (
    <InfrastructureContext.Provider value={{ ...data, updateEquipment }}>
      {children}
    </InfrastructureContext.Provider>
  );
}
