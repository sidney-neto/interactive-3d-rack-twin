import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import {
  XE7745_EXPLODED_COVER_LIFT,
  explodeOffset,
  nextExplodeFactor,
  normalizeExplodeFactor,
  setExplodeFactor,
} from "../src/three/models/explodedView";
import {
  animateModelCover,
  createModelInstance,
} from "../src/three/models/modelInstance";

it("clamps, stages and reverses the normalized explode factor", () => {
  expect(normalizeExplodeFactor(-1)).toBe(0);
  expect(normalizeExplodeFactor(2)).toBe(1);
  expect(normalizeExplodeFactor(Number.NaN)).toBe(0);
  expect(nextExplodeFactor(0.6, 0, 0.09)).toBeCloseTo(0.5, 10);
  expect(nextExplodeFactor(0.4, 1, 0.09)).toBeCloseTo(0.5, 10);
  expect(nextExplodeFactor(0.98, 1, 1)).toBe(1);

  expect(explodeOffset("gpu_01", 0)).toEqual([0, 0, 0]);
  expect(explodeOffset("gpu_01", 0.2)).toEqual([0, 0, 0]);
  expect(explodeOffset("nvlink_bridge_4way", 0.2)[1]).toBeGreaterThan(0);
  expect(explodeOffset("front_drive_01", 1)[2]).toBeGreaterThan(0);
  expect(explodeOffset("front_drive_01", 0)).toEqual([0, 0, 0]);
});

it("applies parent-local poses from immutable rest without changing shared source state", () => {
  const source = new Group();
  const blenderRoot = new Group();
  blenderRoot.rotation.x = -Math.PI / 2;
  source.add(blenderRoot);
  const material = new MeshStandardMaterial();
  const geometry = new BoxGeometry(0.02, 0.02, 0.02);
  const gpu = new Mesh(geometry, material);
  gpu.name = "gpu_01";
  gpu.userData = { slot: "GPU-01", selectable: true, explodable: true };
  gpu.position.set(-0.15, -0.1, 0.058);
  const bridge = new Mesh(geometry, material);
  bridge.name = "nvlink_bridge_4way";
  bridge.userData = { selectable: false, explodable: true };
  bridge.position.set(-0.08, -0.09, 0.111);
  const boss = new Group();
  boss.name = "boss_n1";
  boss.userData = { slot: "BOSS", selectable: true, explodable: true };
  boss.position.set(0, -0.315, 0.105);
  const m2 = new Mesh(geometry, material);
  m2.name = "boss_m2_01";
  m2.userData = {
    slot: "BOSS-M2-01",
    selectable: true,
    explodable: true,
  };
  m2.position.set(-0.022, -0.018, 0.006);
  blenderRoot.add(gpu, bridge, boss);
  boss.add(m2);

  const first = createModelInstance(source, "SERVER-01");
  const second = createModelInstance(source, "SERVER-02");
  const firstBoss = first.object.getObjectByName("boss_n1")!;
  const firstM2 = first.object.getObjectByName("boss_m2_01")!;
  const firstGpu = first.object.getObjectByName("gpu_01")!;
  const firstBridge = first.object.getObjectByName("nvlink_bridge_4way")!;
  const rest = [firstGpu, firstBridge, firstBoss, firstM2].map((node) => ({
    node,
    position: node.position.toArray(),
    quaternion: node.quaternion.toArray(),
    scale: node.scale.toArray(),
  }));
  const m2WorldRest = firstM2.getWorldPosition(new Vector3());

  setExplodeFactor(first, 1);
  first.object.updateMatrixWorld(true);
  const m2WorldDelta = firstM2
    .getWorldPosition(new Vector3())
    .sub(m2WorldRest);
  const bossOffset = explodeOffset("boss_n1", 1);
  const m2Offset = explodeOffset("boss_m2_01", 1);
  expect(m2WorldDelta.toArray()).toEqual(
    bossOffset.map((value, index) =>
      expect.closeTo(value + (m2Offset[index] ?? 0), 8),
    ),
  );
  expect(firstGpu.position.toArray()).not.toEqual(rest[0]!.position);
  expect(firstBridge.position.toArray()).not.toEqual(rest[1]!.position);
  expect(second.object.getObjectByName("gpu_01")!.position.toArray()).toEqual(
    gpu.position.toArray(),
  );
  expect(gpu.position.toArray()).toEqual([-0.15, -0.1, 0.058]);
  expect((firstGpu as Mesh).material).toBe(material);
  expect((firstGpu as Mesh).geometry).toBe(geometry);

  for (let cycle = 0; cycle < 2; cycle++) {
    setExplodeFactor(first, 0);
    for (const snapshot of rest) {
      expect(snapshot.node.position.toArray()).toEqual(snapshot.position);
      expect(snapshot.node.quaternion.toArray()).toEqual(snapshot.quaternion);
      expect(snapshot.node.scale.toArray()).toEqual(snapshot.scale);
    }
    setExplodeFactor(first, 1);
  }
  setExplodeFactor(first, 0);
  expect(firstBridge.position.toArray()).toEqual(rest[1]!.position);
  expect(() =>
    setExplodeFactor(createModelInstance(new Group(), "SERVER-01"), 1),
  ).not.toThrow();
});

it("keeps the actual bridge between the lifted tray and delayed GPUs", async () => {
  const file = readFileSync(
    resolve("public/assets/models/servers/poweredge-xe7745.glb"),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    Uint8Array.from(file).buffer,
    "",
  );
  const instance = createModelInstance(scene, "SERVER-01", true);
  const bridge = instance.object.getObjectByName("nvlink_bridge_4way")!;
  const tray = instance.object.getObjectByName("upper_tray")!;
  const gpus = [1, 2, 3, 4].map((index) =>
    instance.object.getObjectByName(`gpu_0${index}`)!,
  );
  const gpu = gpus[3]!;
  const cpu = instance.object.getObjectByName("cpu_a")!;
  const heatsink = instance.object.getObjectByName("cpu_a_heatsink")!;
  const dimms = Array.from({ length: 12 }, (_, index) =>
    instance.object.getObjectByName(
      `dimm_a${String(index + 1).padStart(2, "0")}`,
    )!,
  );
  const adapter = instance.object.getObjectByName("nic_100g_adapter_01")!;
  const port = instance.object.getObjectByName("rear_nic_100g_01")!;
  const drive = instance.object.getObjectByName("front_drive_01")!;
  const gpuRest = gpu.position.toArray();
  const cpuLocalRest = cpu.position.toArray();
  const heatsinkLocalRest = heatsink.position.toArray();
  const cpuWorldRest = cpu.getWorldPosition(new Vector3());
  const heatsinkWorldRest = heatsink.getWorldPosition(new Vector3());
  const driveRest = drive.getWorldPosition(new Vector3());
  const adapterRest = adapter.getWorldPosition(new Vector3());
  const portRest = port.getWorldPosition(new Vector3());

  setExplodeFactor(instance, 0.2);
  instance.object.updateMatrixWorld(true);
  expect(gpu.position.toArray()).toEqual(gpuRest);
  expect(new Box3().setFromObject(bridge).max.y).toBeLessThan(
    new Box3().setFromObject(tray).min.y,
  );

  setExplodeFactor(instance, 1);
  animateModelCover(instance, XE7745_EXPLODED_COVER_LIFT, 1);
  instance.object.updateMatrixWorld(true);
  const gpuTop = Math.max(
    ...gpus.map((node) => new Box3().setFromObject(node).max.y),
  );
  expect(new Box3().setFromObject(bridge).min.y).toBeGreaterThan(gpuTop);
  expect(new Box3().setFromObject(cpu).min.y).toBeGreaterThan(gpuTop);
  const cpuDelta = cpu.getWorldPosition(new Vector3()).sub(cpuWorldRest);
  const heatsinkDelta = heatsink
    .getWorldPosition(new Vector3())
    .sub(heatsinkWorldRest);
  expect(cpuDelta.y).toBeCloseTo(0.67, 10);
  expect(heatsinkDelta.y).toBeCloseTo(0.77, 10);
  expect(heatsinkDelta.y - cpuDelta.y).toBeCloseTo(0.1, 10);
  expect(gpus.map((node) => node.getWorldPosition(new Vector3()).x)).toEqual(
    [...gpus]
      .map((node) => node.getWorldPosition(new Vector3()).x)
      .sort((a, b) => a - b),
  );
  expect(dimms.map((node) => node.getWorldPosition(new Vector3()).x)).toEqual(
    [...dimms]
      .map((node) => node.getWorldPosition(new Vector3()).x)
      .sort((a, b) => a - b),
  );
  expect(drive.getWorldPosition(new Vector3()).z).toBeGreaterThan(driveRest.z);
  const adapterDelta = adapter
    .getWorldPosition(new Vector3())
    .sub(adapterRest);
  const portDelta = port.getWorldPosition(new Vector3()).sub(portRest);
  expect(portDelta.distanceTo(adapterDelta)).toBeLessThan(1e-10);
  const internalTop = Math.max(
    ...instance.explodedPoses.map(
      ({ node }) => new Box3().setFromObject(node).max.y,
    ),
  );
  expect(new Box3().setFromObject(instance.cover!).min.y).toBeGreaterThan(
    internalTop,
  );
  setExplodeFactor(instance, 0);
  expect(cpu.position.toArray()).toEqual(cpuLocalRest);
  expect(heatsink.position.toArray()).toEqual(heatsinkLocalRest);
});
