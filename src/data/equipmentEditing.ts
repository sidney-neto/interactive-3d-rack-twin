import { isEquipment, type Asset } from "../types/assets";
import type { EquipmentChanges } from "./repositories/AssetRepository";
import { validateRackLayout } from "./rackLayout";

export function parseEquipmentChanges(value: unknown): EquipmentChanges {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "name" && key !== "startU")
  ) {
    throw new Error(
      "Equipment edits may only change display name and starting rack unit.",
    );
  }
  const { name, startU } = value as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim())
    throw new Error("Enter a non-empty display name.");
  if (typeof startU !== "number" || !Number.isInteger(startU))
    throw new Error("Starting rack unit must be an integer.");
  return { name: name.trim(), startU };
}

// Validate the complete candidate layout together: saved moves can use units vacated by other saved moves.
export function applyEquipmentOverrides(
  assets: readonly Asset[],
  overrides: unknown,
): readonly Asset[] {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Invalid saved equipment edits.");
  const updates = new Map<string, Asset>();
  for (const [id, value] of Object.entries(overrides)) {
    const asset = assets.find((a) => a.id === id);
    if (!asset || !isEquipment(asset))
      throw new Error(`Unknown equipment: ${id}`);
    const changes = parseEquipmentChanges(value);
    if (!assets.some((a) => a.type === "rack" && a.id === asset.rackId))
      throw new Error(`Missing rack for ${id}.`);
    updates.set(id, {
      ...asset,
      name: changes.name,
      rackPosition: { ...asset.rackPosition, startU: changes.startU },
    });
  }
  const next = assets.map((asset) => updates.get(asset.id) ?? asset);
  for (const asset of next)
    if (asset.type === "rack") validateRackLayout(asset, next);
  return next;
}
