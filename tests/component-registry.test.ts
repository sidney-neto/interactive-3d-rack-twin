import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Group, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import {
  buildComponentRegistry,
  resolveComponentRoot,
} from "../src/three/interactions/componentRegistry";
import { mapModelHierarchy } from "../src/three/interactions/modelNodeMapper";
import { createModelInstance } from "../src/three/models/modelInstance";

it("registers each nearest selectable inventory root and resolves its descendants", () => {
  const root = new Group();
  const gpu = new Group();
  gpu.name = "gpu_01";
  gpu.userData = { slot: "GPU-01", selectable: true };
  const gpuSurface = new Mesh();
  const cpu = new Group();
  cpu.name = "cpu_a";
  cpu.userData = { slot: "CPU-A", selectable: true };
  const cpuPackage = new Mesh();
  const heatsink = new Mesh();
  heatsink.name = "cpu_a_heatsink";
  const storage = new Group();
  storage.userData = { selectable: false };
  const boss = new Group();
  boss.name = "boss_n1";
  boss.userData = { slot: "BOSS", selectable: true };
  const m2 = new Group();
  m2.name = "boss_m2_01";
  m2.userData = { slot: "BOSS-M2-01", selectable: true };
  const m2Surface = new Mesh();
  const support = new Group();
  support.name = "internal_chassis";
  support.userData = { selectable: false };
  const supportSurface = new Mesh();
  const bridge = new Mesh();
  bridge.name = "nvlink_bridge_4way";
  bridge.userData = { selectable: false };
  const psu = new Group();
  psu.name = "rear_psu_01";
  psu.userData = { slot: "PSU-01", selectable: true };
  const duplicate = new Group();
  duplicate.userData = { slot: "GPU-01", selectable: true };

  root.add(gpu, cpu, storage, support, bridge, psu, duplicate);
  gpu.add(gpuSurface);
  cpu.add(cpuPackage, heatsink);
  storage.add(boss);
  boss.add(m2);
  m2.add(m2Surface);
  support.add(supportSurface);
  mapModelHierarchy(root, "SERVER-01");

  const registry = buildComponentRegistry(root, "SERVER-01");
  expect([...registry.keys()]).toEqual([
    "SERVER-01.GPU-01",
    "SERVER-01.CPU-A",
    "SERVER-01.BOSS",
    "SERVER-01.BOSS-M2-01",
    "SERVER-01.PSU-01",
  ]);
  expect(registry.get("SERVER-01.GPU-01")).toBe(gpu);
  expect(resolveComponentRoot(gpuSurface, registry)).toBe(gpu);
  expect(resolveComponentRoot(cpuPackage, registry)).toBe(cpu);
  expect(resolveComponentRoot(heatsink, registry)).toBe(cpu);
  expect(resolveComponentRoot(m2Surface, registry)).toBe(m2);
  expect(resolveComponentRoot(supportSurface, registry)).toBeUndefined();
  expect(resolveComponentRoot(bridge, registry)).toBeUndefined();
});

it("builds the full component registry including PSUs and NVLink from the actual GLB", async () => {
  const file = readFileSync(
    resolve("public/assets/models/servers/poweredge-xe7745.glb"),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    Uint8Array.from(file).buffer,
    "",
  );
  const instance = createModelInstance(scene, "SERVER-01", true);

  expect(instance.componentRegistry.size).toBe(56);
  expect(instance.componentRegistry.has("SERVER-01.GPU-01")).toBe(true);
  expect(instance.componentRegistry.has("SERVER-01.BOSS-M2-02")).toBe(true);
  expect(instance.componentRegistry.has("SERVER-01.NIC-100G-04")).toBe(true);
  expect(
    [...instance.componentRegistry.keys()].some((id) => id.includes(".PSU-")),
  ).toBe(true);
  expect(instance.componentRegistry.has("SERVER-01.NVLINK-01")).toBe(true);
});
