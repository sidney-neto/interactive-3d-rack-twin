import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { Asset, RackAsset } from "../types/assets";
import type { createViewerStore, ViewerStore } from "../store/viewerStore";
import type { InfrastructureServices } from "./services";
import type { EquipmentChanges } from "./repositories/AssetRepository";

export interface Infrastructure {
  rack: RackAsset;
  assets: readonly Asset[];
  catalog: ReadonlyMap<string, Asset>;
  store: ReturnType<typeof createViewerStore>;
  services: InfrastructureServices;
  loadWarning: string | null;
  updateEquipment: (id: string, changes: EquipmentChanges) => Promise<void>;
}
export const InfrastructureContext = createContext<Infrastructure | null>(null);
export function useInfrastructure() {
  const context = useContext(InfrastructureContext);
  if (!context) throw new Error("InfrastructureProvider is required");
  return context;
}
export function useViewerStore<T>(selector: (state: ViewerStore) => T): T {
  return useStore(useInfrastructure().store, selector);
}
