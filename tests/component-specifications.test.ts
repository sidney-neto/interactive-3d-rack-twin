import { expect, it } from "vitest";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";
import type { ComponentAsset } from "../src/types/assets";

function isolatedRepository() {
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  return {
    repository: new StaticAssetRepository(() => storage),
    reload: () => new StaticAssetRepository(() => storage),
  };
}

it("derives the complete component inventory from each server specification", async () => {
  const { repository } = isolatedRepository();
  const assets = await repository.listAssets();

  for (const parentId of ["SERVER-01", "SERVER-02"]) {
    const server = assets.find((asset) => asset.id === parentId);
    if (server?.type !== "server") throw new Error(`Missing ${parentId}`);
    const children = assets.filter(
      (asset): asset is ComponentAsset =>
        asset.type === "component" && asset.parentId === parentId,
    );

    expect(children).toHaveLength(56);
    expect(children.filter((asset) => asset.assetType === "gpu")).toHaveLength(4);
    expect(children.filter((asset) => asset.assetType === "cpu")).toHaveLength(2);
    expect(children.filter((asset) => asset.assetType === "memory")).toHaveLength(24);
    expect(children.filter((asset) => asset.assetType === "network")).toHaveLength(6);
    expect(server.gpu.interconnect).toEqual({
      type: "NVLink",
      topology: "4-way",
      slots: [21, 23, 25, 27],
    });

    for (const [index, slot] of [21, 23, 25, 27].entries()) {
      expect(children.find((asset) => asset.slot === `GPU-0${index + 1}`)).toMatchObject({
        specifications: { memoryGB: 141, physicalSlot: slot },
      });
    }
    for (const cpu of children.filter((asset) => /^CPU-/.test(asset.slot)))
      expect(cpu.specifications).toMatchObject({ cores: 64, threads: 128 });
    for (const dimm of children.filter((asset) => /^DIMM-/.test(asset.slot)))
      expect(dimm.specifications).toMatchObject({
        capacityGB: 64,
        speed: "6400 MT/s",
      });
    for (const nic of children.filter((asset) => /^NIC-/.test(asset.slot)))
      expect(nic.specifications?.speedGbps).toBe(
        nic.slot.startsWith("NIC-25G-") ? 25 : 100,
      );

    const front = children.filter((asset) => /^SSD-/.test(asset.slot));
    expect(front).toHaveLength(8);
    for (const drive of front)
      expect(drive.specifications).toMatchObject({
        location: "front",
        capacityTB: 3.2,
      });

    const boot = children.filter((asset) => /^BOSS-M2-/.test(asset.slot));
    expect(boot).toHaveLength(2);
    for (const drive of boot)
      expect(drive.specifications).toMatchObject({
        location: "internal",
        capacityGB: 960,
      });
  }
});

it("keeps component IDs stable across equipment edits and reload", async () => {
  const { repository, reload } = isolatedRepository();
  const before = await repository.listAssets();
  const ids = before
    .filter((asset) => asset.type === "component")
    .map((asset) => asset.id);

  await repository.updateEquipment("SERVER-01", {
    name: "Renamed XE7745",
    startU: 39,
  });
  const after = await reload().listAssets();

  expect(after.filter((asset) => asset.type === "component").map((asset) => asset.id)).toEqual(ids);
  expect(ids.filter((id) => id.startsWith("SERVER-01."))).toHaveLength(56);
  expect(ids.filter((id) => id.startsWith("SERVER-02."))).toHaveLength(56);
});
