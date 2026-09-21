import { beforeEach, expect, it } from "vitest";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";

const key = "interactive-3d-rack-twin.equipment-overrides.v1";
beforeEach(() => localStorage.clear());

it.each(["SERVER-01", "SWITCH-01"])(
  "preserves custom names and unrelated metadata when repositioning %s",
  async (id) => {
    const repo = new StaticAssetRepository();
    await repo.updateEquipment(id, { name: "Custom equipment", startU: 10 });
    const before = await repo.listAssets();
    const asset = before.find((a) => a.id === id)!;
    const after = await repo.updateEquipment(id, {
      name: asset.name,
      startU: 20,
    });
    expect(after.find((a) => a.id === id)).toEqual({
      ...asset,
      rackPosition: { startU: 20, heightU: id.startsWith("SERVER") ? 4 : 1 },
    });
    expect(after.filter((a) => a.id !== id)).toEqual(
      before.filter((a) => a.id !== id),
    );
    expect(await new StaticAssetRepository().getAsset(id)).toEqual(
      after.find((a) => a.id === id),
    );
  },
);

it("trims names, moves equipment and preserves all other asset/component data across reloads", async () => {
  const repo = new StaticAssetRepository();
  const before = await repo.listAssets();
  const result = await repo.updateEquipment("SERVER-01", {
    name: "  Training node  ",
    startU: 20,
  });
  const previous = before.find((a) => a.id === "SERVER-01");
  expect(result.find((a) => a.id === "SERVER-01")).toEqual({
    ...previous,
    name: "Training node",
    rackPosition: { startU: 20, heightU: 4 },
  });
  expect(result.filter((a) => a.id !== "SERVER-01")).toEqual(
    before.filter((a) => a.id !== "SERVER-01"),
  );
  expect(before.find((a) => a.id === "SERVER-01")).toMatchObject({
    name: "Dell PowerEdge XE7745 #1",
    rackPosition: { startU: 39 },
  });
  expect(await new StaticAssetRepository().getAsset("SERVER-01")).toMatchObject(
    { name: "Training node", rackPosition: { startU: 20 } },
  );
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
    "SERVER-01": { name: "Training node", startU: 20 },
  });
});

it("accepts bottom/top boundaries, vacated units and names shared with another asset", async () => {
  const repo = new StaticAssetRepository();
  await repo.updateEquipment("SERVER-01", { name: "Compute", startU: 1 });
  await repo.updateEquipment("SWITCH-01", { name: "Fabric", startU: 39 });
  await repo.updateEquipment("SWITCH-02", { name: "Fabric", startU: 40 });
  await repo.updateEquipment("SERVER-01", { name: "Compute", startU: 41 });
  const reloaded = new StaticAssetRepository();
  expect(await reloaded.getAsset("SERVER-01")).toMatchObject({
    rackPosition: { startU: 41, heightU: 4 },
  });
  await reloaded.updateEquipment("SERVER-01", { name: "Compute", startU: 1 });
  await reloaded.updateEquipment("SWITCH-01", { name: "Fabric", startU: 44 });
  expect(await new StaticAssetRepository().getAsset("SWITCH-01")).toMatchObject(
    { rackPosition: { startU: 44 } },
  );
});

it("excludes the current equipment from collisions while rejecting invalid positions and names", async () => {
  const repo = new StaticAssetRepository();
  await repo.updateEquipment("SERVER-01", {
    name: "Same position",
    startU: 39,
  });
  const persisted = localStorage.getItem(key);
  for (const startU of [0, -1, 1.5, 42, 45, NaN, Infinity]) {
    await expect(
      repo.updateEquipment("SERVER-01", { name: "Invalid", startU }),
    ).rejects.toThrow(/integer|range/i);
  }
  await expect(
    repo.updateEquipment("SERVER-01", { name: "Overlap", startU: 38 }),
  ).rejects.toThrow(/SERVER-02/);
  await expect(
    repo.updateEquipment("SWITCH-01", { name: "Overlap", startU: 43 }),
  ).rejects.toThrow(/SWITCH-02/);
  await expect(
    repo.updateEquipment("SERVER-01", { name: "   ", startU: 39 }),
  ).rejects.toThrow(/name/i);
  await expect(
    repo.updateEquipment("SERVER-01.GPU-01", { name: "GPU", startU: 1 }),
  ).rejects.toThrow(/equipment/i);
  expect(localStorage.getItem(key)).toBe(persisted);
});

it.each([
  "not JSON",
  JSON.stringify({ "SERVER-01": { name: "Bad", startU: 35 } }),
  JSON.stringify({ "SERVER-01": { name: "", startU: 20 } }),
  JSON.stringify({ "SERVER-01": { name: "Bad", startU: "20" } }),
  JSON.stringify({ "SERVER-01": { name: "Bad", startU: 20, heightU: 1 } }),
  JSON.stringify({ unknown: { name: "Bad", startU: 20 } }),
])(
  "falls back safely and reports invalid persisted overrides: %s",
  async (raw) => {
    localStorage.setItem(key, raw);
    const repo = new StaticAssetRepository();
    expect(await repo.getAsset("SERVER-01")).toMatchObject({
      rackPosition: { startU: 39 },
      name: "Dell PowerEdge XE7745 #1",
    });
    expect(repo.loadWarning).toMatch(/saved.*edits/i);
    expect(localStorage.getItem(key)).toBe(raw);
  },
);

it("keeps inventory readable when storage is blocked and rejects unsuccessful saves", async () => {
  const repo = new StaticAssetRepository(() => {
    throw new Error("storage blocked");
  });
  expect(await repo.getAsset("SERVER-01")).toMatchObject({
    rackPosition: { startU: 39 },
  });
  expect(repo.loadWarning).toMatch(/storage/i);
  await expect(
    repo.updateEquipment("SERVER-01", { name: "Unsaved", startU: 20 }),
  ).rejects.toThrow(/sav|storage/i);
  const full = new StaticAssetRepository(() => ({
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  }));
  await expect(
    full.updateEquipment("SERVER-01", { name: "Unsaved", startU: 20 }),
  ).rejects.toThrow(/sav|storage/i);
  expect(await full.getAsset("SERVER-01")).toMatchObject({
    rackPosition: { startU: 39 },
  });
});

// Legacy key is retained only to verify saved-data compatibility.
it("reads legacy equipment edits, saves under the new key and prefers new records", async () => {
  const legacyKey = "sidia-3d-rack-twin.equipment-overrides.v1";
  const legacy = JSON.stringify({ "SERVER-01": { name: "Existing node", startU: 20 } });
  localStorage.setItem(legacyKey, legacy);
  const repo = new StaticAssetRepository();
  expect(await repo.getAsset("SERVER-01")).toMatchObject({ name: "Existing node" });
  await repo.updateEquipment("SWITCH-01", { name: "Fabric", startU: 10 });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
    "SERVER-01": { name: "Existing node", startU: 20 },
    "SWITCH-01": { name: "Fabric", startU: 10 },
  });
  expect(localStorage.getItem(legacyKey)).toBe(legacy);
  localStorage.setItem(key, "{}");
  expect(await repo.getAsset("SERVER-01")).toMatchObject({ name: "Dell PowerEdge XE7745 #1" });
  localStorage.setItem(key, "invalid");
  await expect(repo.updateEquipment("SERVER-01", { name: "Unsaved", startU: 20 })).rejects.toThrow(/saved equipment/);
  expect(localStorage.getItem(key)).toBe("invalid");
  expect(localStorage.getItem(legacyKey)).toBe(legacy);
});
