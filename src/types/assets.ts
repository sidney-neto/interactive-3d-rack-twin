export type AssetStatus = "online" | "offline" | "unknown";
export interface RackPosition {
  startU: number;
  heightU: number;
}
export interface ModelGeometry {
  width: number;
  depth: number;
  height?: number;
  modelUrl: string | null;
}
interface BaseAsset {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  status: AssetStatus;
}
export interface RackAsset extends BaseAsset {
  type: "rack";
  units: number;
  location: string;
  geometry: ModelGeometry & {
    unitHeight: number;
    baseHeight: number;
    height: number;
  };
}
interface Equipment extends BaseAsset {
  rackId: string;
  rackPosition: RackPosition;
  geometry: ModelGeometry;
}
export interface ServerAsset extends Equipment {
  type: "server";
  cpu: {
    quantity: number;
    model: string;
    coresPerCpu: number;
    threadsPerCpu: number;
  };
  memory: {
    quantity: number;
    capacityPerDimmGB: number;
    generation: string;
    speed: string;
  };
  gpu: {
    quantity: number;
    model: string;
    memoryGB: number;
    interconnect?: {
      type: "NVLink";
      topology: "4-way";
      slots: number[];
    };
  };
  storage: {
    boss: { quantity: number; capacityGB: number; type: string };
    ssd: { quantity: number; capacityTB: number };
  };
  network: { interfaces25G: number; interfaces100G: number };
}
export interface SwitchAsset extends Equipment {
  type: "switch";
  ports: { quantity: number; speedGbps: number; connector: string };
  management: string;
  additionalPorts: SwitchAsset["ports"];
  powerSupplies: number;
  fanModules: number;
  airflowMode: string;
  role: string;
}
export interface ComponentAsset extends BaseAsset {
  type: "component";
  parentId: string;
  assetType: string;
  slot: string;
  description: string;
  details?: Partial<Record<string, string>>;
  references?: { title: string; url: string }[];
  specifications?: {
    memoryGB?: number;
    capacityGB?: number;
    capacityTB?: number;
    cores?: number;
    threads?: number;
    speed?: string;
    speedGbps?: number;
    location?: "front" | "internal" | "rear" | "I/O_SIDE" | "PSU_SIDE";
    physicalSlot?: number;
  };
}
export type Asset = RackAsset | ServerAsset | SwitchAsset | ComponentAsset;
export type RackEquipment = ServerAsset | SwitchAsset;
export function canSelectComponent(
  asset: Asset | undefined,
  serverOpen: boolean,
): asset is ComponentAsset {
  return asset?.type === "component" && (serverOpen || asset.assetType === "power-supply" || asset.specifications?.location === "I/O_SIDE" || asset.specifications?.location === "PSU_SIDE");
}
export function isEquipment(asset: Asset): asset is RackEquipment {
  return asset.type === "server" || asset.type === "switch";
}
