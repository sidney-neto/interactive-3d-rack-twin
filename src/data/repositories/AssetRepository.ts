import type { Asset } from "../../types/assets";

export interface EquipmentChanges {
  name: string;
  startU: number;
}

export interface AssetRepository {
  readonly loadWarning?: string | null;
  listAssets(): Promise<readonly Asset[]>;
  getAsset(id: string): Promise<Asset | undefined>;
  updateEquipment(
    id: string,
    changes: EquipmentChanges,
  ): Promise<readonly Asset[]>;
}
