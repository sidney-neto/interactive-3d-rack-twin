import {
  isEquipment,
  type Asset,
  type RackAsset,
  type RackPosition,
  type RackEquipment,
} from "../types/assets";

export function rackPositionZ(asset: RackEquipment, rack: RackAsset): number {
  return (rack.geometry.depth - asset.geometry.depth) / 2 - 0.07;
}

export function rackPositionY(position: RackPosition, rack: RackAsset): number {
  return (
    rack.geometry.baseHeight +
    (position.startU - 1 + position.heightU / 2) * rack.geometry.unitHeight
  );
}
export function rackSpan(position: RackPosition, units: number) {
  return {
    row: units - position.startU - position.heightU + 2,
    span: position.heightU,
  };
}
export function rackRange(position: RackPosition): string {
  const end = position.startU + position.heightU - 1;
  return end === position.startU ? `U${end}` : `U${position.startU}–U${end}`;
}
export function validateRackLayout(
  rack: RackAsset,
  assets: readonly Asset[],
): void {
  const ids = new Set<string>();
  const occupied = new Map<number, Asset>();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new Error(`Duplicate asset ID: ${asset.id}`);
    ids.add(asset.id);
    if (!isEquipment(asset) || asset.rackId !== rack.id) continue;
    const { startU, heightU } = asset.rackPosition;
    if (
      !Number.isInteger(startU) ||
      !Number.isInteger(heightU) ||
      startU < 1 ||
      heightU < 1 ||
      startU + heightU - 1 > rack.units
    ) {
      throw new Error(
        `Rack position out of range for ${asset.id}: use an integer start from U1 to U${rack.units - heightU + 1} for this ${heightU}U equipment.`,
      );
    }
    for (let u = startU; u < startU + heightU; u++) {
      const conflict = occupied.get(u);
      if (conflict)
        throw new Error(
          `Rack overlap at U${u}: ${asset.name} (${asset.id}) conflicts with ${conflict.name} (${conflict.id}).`,
        );
      occupied.set(u, asset);
    }
  }
  for (const asset of assets) {
    if (
      asset.type === "component" &&
      (!ids.has(asset.parentId) || !asset.id.startsWith(`${asset.parentId}.`))
    ) {
      throw new Error(`Invalid component parent: ${asset.id}`);
    }
  }
}
