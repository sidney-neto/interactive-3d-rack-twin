import servers from "../mock/servers.json";
import switches from "../mock/switches.json";
import components from "../mock/components.json";
import type { Asset, ComponentAsset, ServerAsset, SwitchAsset } from "../../types/assets";
import type { AssetRepository, EquipmentChanges } from "./AssetRepository";
import { StaticRackRepository } from "./StaticRackRepository";
import { readStatus } from "./readStatus";
import {
  applyEquipmentOverrides,
  parseEquipmentChanges,
} from "../equipmentEditing";

import { s5232fComponents } from "../s5232fComponents";

const storageKey = "interactive-3d-rack-twin.equipment-overrides.v1";
// Read-only legacy fallback preserves equipment edits from before the rebrand.
const legacyStorageKey = "sidia-3d-rack-twin.equipment-overrides.v1";

export function componentSpecifications(
  component: ComponentAsset,
  server: ServerAsset,
): ComponentAsset {
  const { slot } = component;
  const specifications = /^GPU-0[1-4]$/.test(slot)
    ? {
        memoryGB: server.gpu.memoryGB,
        physicalSlot: server.gpu.interconnect?.slots[Number(slot.slice(-1)) - 1],
      }
    : /^CPU-[AB]$/.test(slot)
      ? {
          cores: server.cpu.coresPerCpu,
          threads: server.cpu.threadsPerCpu,
        }
      : /^DIMM-[AB](?:0[1-9]|1[0-2])$/.test(slot)
        ? {
            capacityGB: server.memory.capacityPerDimmGB,
            speed: server.memory.speed,
          }
        : /^SSD-0[1-8]$/.test(slot)
          ? { capacityTB: server.storage.ssd.capacityTB, location: "front" as const }
          : /^BOSS-M2-0[12]$/.test(slot)
            ? {
                capacityGB: server.storage.boss.capacityGB,
                location: "internal" as const,
              }
            : /^NIC-25G-0[12]$/.test(slot)
              ? { speedGbps: 25 }
              : /^NIC-100G-0[1-4]$/.test(slot)
                ? { speedGbps: 100 }
                : undefined;
  if (slot === "NVLINK-01")
    return {
      ...component,
      details: {
        ...component.details,
        "Configured topology": `${server.gpu.interconnect?.topology ?? "Unspecified"} GPU group`,
        "Connected GPUs": Array.from({ length: server.gpu.quantity }, (_, i) => `${server.id}.GPU-${String(i + 1).padStart(2, "0")}`).join(", "),
        "Configured GPU slots": server.gpu.interconnect?.slots.join(", ") ?? "Not specified in configured inventory",
      },
    };
  return specifications ? { ...component, specifications } : component;
}

export class StaticAssetRepository implements AssetRepository {
  loadWarning: string | null = null;
  constructor(
    private readonly getStorage: () => Pick<
      Storage,
      "getItem" | "setItem"
    > = () => window.localStorage,
  ) {}

  private async defaults(): Promise<readonly Asset[]> {
    const rack = await new StaticRackRepository().getRack("RACK-01");
    const serverAssets = servers.map(
      (server): ServerAsset => ({
        ...server,
        type: "server",
        status: readStatus(server.status),
        gpu: server.gpu as ServerAsset["gpu"],
      }),
    );
    const switchAssets: SwitchAsset[] = switches.map(a => ({ ...a, type: "switch", status: readStatus(a.status) }));
    return [
      ...(rack ? [rack] : []),
      ...serverAssets,
      ...switchAssets,
      ...switchAssets.flatMap(s5232fComponents),
      ...components.map((component): Asset => {
        const asset: ComponentAsset = {
          ...component,
          type: "component",
          status: readStatus(component.status),
          specifications: component.specifications as ComponentAsset["specifications"],
        };
        const server = serverAssets.find(({ id }) => id === asset.parentId);
        return server ? componentSpecifications(asset, server) : asset;
      }),
    ];
  }
  async listAssets(): Promise<readonly Asset[]> {
    const defaults = await this.defaults();
    try {
      const storage = this.getStorage();
      const overrides: unknown = JSON.parse(
        storage.getItem(storageKey) ?? storage.getItem(legacyStorageKey) ?? "{}",
      );
      const assets = applyEquipmentOverrides(defaults, overrides);
      this.loadWarning = null;
      return assets;
    } catch {
      this.loadWarning =
        "Saved equipment edits could not be loaded from browser storage. Default inventory is shown; saved data has not been changed. Restore valid saved data or clear this app's saved edits before saving.";
      return defaults;
    }
  }
  async getAsset(id: string): Promise<Asset | undefined> {
    return (await this.listAssets()).find((asset) => asset.id === id);
  }
  async updateEquipment(
    id: string,
    changes: EquipmentChanges,
  ): Promise<readonly Asset[]> {
    const defaults = await this.defaults();
    let storage: Pick<Storage, "getItem" | "setItem">;
    let overrides: unknown;
    let current: readonly Asset[];
    try {
      storage = this.getStorage();
      overrides = JSON.parse(storage.getItem(storageKey) ?? storage.getItem(legacyStorageKey) ?? "{}");
      current = applyEquipmentOverrides(defaults, overrides);
    } catch {
      throw new Error(
        "Cannot save: saved equipment edits could not be read from browser storage. Restore valid saved data or clear this app's saved edits, then reload.",
      );
    }
    const clean = parseEquipmentChanges(changes);
    const next = applyEquipmentOverrides(current, { [id]: clean });
    try {
      storage.setItem(
        storageKey,
        JSON.stringify({
          ...(overrides as Record<string, EquipmentChanges>),
          [id]: clean,
        }),
      );
    } catch {
      throw new Error(
        "Could not save to browser storage. Your changes were not applied. Check storage permissions or available space and try again.",
      );
    }
    this.loadWarning = null;
    return next;
  }
}
