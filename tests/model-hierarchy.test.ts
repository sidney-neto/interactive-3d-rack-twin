import { Group, Mesh } from "three";
import { expect, it } from "vitest";
import {
  mapModelHierarchy,
  mapModelNode,
} from "../src/three/interactions/modelNodeMapper";

it("maps reusable exterior names and Blender slot extras to instance-specific IDs", () => {
  expect(mapModelNode("SERVER-01", "rear_nic_100g_01")).toBe(
    "SERVER-01.NIC-100G-01",
  );
  expect(mapModelNode("SERVER-02", "rear_nic_25g_02")).toBe(
    "SERVER-02.NIC-25G-02",
  );
  expect(mapModelNode("SERVER-01", "front_drive_04")).toBe(
    "SERVER-01.SSD-04",
  );
  expect(mapModelNode("SERVER-02", "carrier", { slot: "DRIVE-08" })).toBe(
    "SERVER-02.SSD-08",
  );
  expect(mapModelNode("SERVER-01", "boss_n1")).toBe("SERVER-01.BOSS");
  expect(mapModelNode("SERVER-02", "dimm_b12")).toBe(
    "SERVER-02.DIMM-B12",
  );
  expect(mapModelNode("SERVER-01", "rear_psu_08")).toBe("SERVER-01.PSU-08");
  expect(
    mapModelNode("SERVER-01", "top_cover", { selectable: false }),
  ).toBeNull();
});

it("inherits GLB group identity and selection exclusion through mesh descendants", () => {
  const root = new Group();
  const gpu = new Group();
  gpu.name = "gpu_01";
  const surface = new Mesh();
  surface.name = "Mesh_001";
  const excluded = new Group();
  excluded.userData = { selectable: false };
  const hiddenSurface = new Mesh();
  const override = new Mesh();
  override.userData = { assetSlot: "GPU-02", selectable: true };
  root.add(gpu, excluded);
  gpu.add(surface, override);
  excluded.add(hiddenSurface);
  mapModelHierarchy(root, "SERVER-01");
  expect(surface.userData.logicalAssetId).toBe("SERVER-01.GPU-01");
  expect(hiddenSurface.userData.logicalAssetId).toBeNull();
  expect(override.userData.logicalAssetId).toBe("SERVER-01.GPU-02");
});
