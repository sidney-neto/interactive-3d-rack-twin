import { readFileSync } from "node:fs";
import { Box3, Mesh, MeshStandardMaterial, Raycaster, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, expect, it } from "vitest";
import { createModelInstance } from "../src/three/models/modelInstance";
import { explodeOffset, setExplodeFactor } from "../src/three/models/explodedView";

let source: Awaited<ReturnType<GLTFLoader["parseAsync"]>>["scene"];
beforeAll(async () => {
  const file = readFileSync("public/assets/models/servers/poweredge-xe7745.glb");
  source = (await new GLTFLoader().parseAsync(Uint8Array.from(file).buffer, "")).scene;
});
const bounds = (name: string) => new Box3().setFromObject(source.getObjectByName(name)!);

it("uses upright H200 NVL cards with a broad four-way bridge seated on matching top connectors", () => {
  source.updateMatrixWorld(true);
  const bridge = bounds("nvlink_bridge_4way");
  expect(bridge.getSize(new Vector3()).z).toBeGreaterThan(0.09);
  const cards = [1, 2, 3, 4].map(i => source.getObjectByName(`gpu_0${i}`)!);
  for (const [i, card] of cards.entries()) {
    const box = new Box3().setFromObject(card), size = box.getSize(new Vector3());
    expect(size.y).toBeGreaterThan(0.105);
    expect(size.z).toBeGreaterThan(0.265);
    expect(size.z).toBeLessThan(0.28);
    expect(card.userData).toMatchObject({ formFactor: "PCIe dual-slot", physicalSlot: 21 + 2 * i });
    if (i) {
      expect(card.getWorldPosition(new Vector3()).x - cards[i - 1]!.getWorldPosition(new Vector3()).x).toBeCloseTo(0.04064, 5);
      expect(box.intersectsBox(new Box3().setFromObject(cards[i - 1]!))).toBe(false);
    }
    const socket = new Box3().setFromObject(card.getObjectByName(`gpu_0${i + 1}_nvlink_socket`)!);
    const foot = bounds(`nvlink_connector_0${i + 1}`);
    expect(foot.getCenter(new Vector3()).x).toBeCloseTo(socket.getCenter(new Vector3()).x, 6);
    expect(foot.getCenter(new Vector3()).z).toBeCloseTo(socket.getCenter(new Vector3()).z, 6);
    expect(foot.min.y).toBeCloseTo(socket.max.y, 6);
    expect(bridge.min.x).toBeLessThan(socket.min.x);
    expect(bridge.max.x).toBeGreaterThan(socket.max.x);
  }
  expect(bridge.max.y).toBeLessThan(bounds("upper_tray").min.y);
  for (const id of ["SERVER-01", "SERVER-02"]) {
    const instance = createModelInstance(source, id, true);
    expect(instance.object.getObjectByName("gpu_01_nvlink_socket")!.userData.logicalAssetId).toBe(`${id}.GPU-01`);
    expect(instance.object.getObjectByName("nvlink_connector_01")!.userData.logicalAssetId).toBe(`${id}.NVLINK-01`);
  }
});

it("exports full E3.S bodies behind all eight existing carriers, separate from the backplane", () => {
  const backplane = bounds("front_storage_backplane");
  for (let i = 1; i <= 8; i++) {
    const name = `front_drive_0${i}`;
    const box = bounds(name);
    const size = box.getSize(new Vector3());
    expect(size.z, name).toBeGreaterThan(0.11);
    expect(size.x).toBeCloseTo(0.08, 2);
    expect(size.y).toBeLessThan(0.01);
    expect(box.min.z).toBeGreaterThan(backplane.max.z);
    expect(source.getObjectByName(name)!.userData.slot).toBe(`SSD-0${i}`);
  }
});

it("exports full PSU housings attached to the eight original rear faces", () => {
  for (let i = 1; i <= 8; i++) {
    const node = source.getObjectByName(`rear_psu_0${i}`)!;
    expect(new Box3().setFromObject(node).getSize(new Vector3()).z).toBeGreaterThan(0.1);
    expect(node.userData).toMatchObject({ slot: `PSU-0${i}`, explodable: true });
  }
});

it("uses metallic gold only on GPU surfaces and retains CPU heatsink fins", () => {
  const colors = (name: string) => {
    const materials = new Set<MeshStandardMaterial>();
    source.getObjectByName(name)!.traverse((node) => {
      if (node instanceof Mesh)
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          if (material instanceof MeshStandardMaterial) materials.add(material);
    });
    return [...materials];
  };
  for (let i = 1; i <= 4; i++) {
    expect(colors(`gpu_0${i}`).some(({ name, color, metalness }) =>
      name.includes("GPU_SHROUD") && color.r > color.g * 1.15 && color.g > color.b * 1.7 && metalness > 0.6,
    )).toBe(true);
  }
  expect(colors("cpu_a_heatsink").some(({ name }) => name === "MAT_HEATSINK")).toBe(true);
  expect(colors("cpu_a_heatsink").some(({ name }) => name === "MAT_GPU_SHROUD")).toBe(false);
});

it("mounts two vertical dual-QSFP28 cards in rear-view right positions 1 and 3", () => {
  for (const [card, x] of [[1, -0.063], [2, -0.105]] as const) {
    const adapter = source.getObjectByName(`nic_100g_adapter_0${card}`)!;
    expect(adapter.getWorldPosition(new Vector3()).x).toBeCloseTo(x, 5);
    expect(adapter.userData).toMatchObject({ rearViewBank: "right", rearViewPosition: card === 1 ? 1 : 3 });
    const ports = [card * 2 - 1, card * 2].map((i) => source.getObjectByName(`rear_nic_100g_0${i}`)!);
    for (const port of ports) {
      expect(port.parent).toBe(adapter);
      expect(port.getWorldPosition(new Vector3()).x).toBeCloseTo(x, 5);
      expect(port.userData.connector).toBe("QSFP28");
      expect(new Box3().setFromObject(port).getSize(new Vector3()).x)
        .toBeGreaterThan(bounds("rear_nic_25g_01").getSize(new Vector3()).x);
    }
    expect(new Box3().setFromObject(ports[0]!).intersectsBox(new Box3().setFromObject(ports[1]!))).toBe(false);
  }
});

it("keeps front fans in their original grid and extracts eight complete PSUs rearward", () => {
  const firstFan = explodeOffset("fan_module_01", 1);
  expect(firstFan[0]).toBe(0);
  expect(firstFan[1]).toBe(0);
  expect(firstFan[2]).toBeGreaterThan(0.1);
  for (let i = 1; i <= 12; i++)
    expect(explodeOffset(`fan_module_${String(i).padStart(2, "0")}`, 1)).toEqual(firstFan);
  for (let i = 1; i <= 8; i++) {
    const offset = explodeOffset(`rear_psu_0${i}`, 1);
    expect(offset[0]).toBe(0);
    expect(offset[1]).toBe(0);
    expect(offset[2]).toBeLessThan(-0.1);
  }
});

it("shows the recessed dark aperture instead of an obstructing metal bracket in all four QSFP28 ports", () => {
  source.updateMatrixWorld(true);
  for (let i = 1; i <= 4; i++) {
    const center = source.getObjectByName(`rear_nic_100g_0${i}`)!.getWorldPosition(new Vector3());
    const hit = new Raycaster(new Vector3(center.x, center.y, -1), new Vector3(0, 0, 1))
      .intersectObject(source, true)[0]!;
    expect(hit.object).toBeInstanceOf(Mesh);
    const materials = (hit.object as Mesh).material;
    const material = Array.isArray(materials) ? materials[hit.face!.materialIndex]! : materials;
    expect(material.name).toBe("MAT_PORT_BLACK");
  }
});

it("aligns GPUs and keeps the detached rigid bridge close without intersecting during motion", () => {
  const instance = createModelInstance(source, "SERVER-01");
  const bridge = instance.object.getObjectByName("nvlink_bridge_4way")!;
  const gpuBoxes = () => [1, 2, 3, 4].map((i) => new Box3().setFromObject(instance.object.getObjectByName(`gpu_0${i}`)!));
  const bridgeSize = new Box3().setFromObject(bridge).getSize(new Vector3());
  for (let step = 1; step <= 20; step++) {
    setExplodeFactor(instance, step / 20);
    instance.object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(bridge);
    for (const gpu of gpuBoxes()) expect(box.intersectsBox(gpu)).toBe(false);
    expect(box.getSize(new Vector3()).distanceTo(bridgeSize)).toBeLessThan(1e-6);
  }
  const boxes = gpuBoxes();
  for (const box of boxes) expect(box.min.y).toBeCloseTo(boxes[0]!.min.y, 6);
  const gap = new Box3().setFromObject(bridge).min.y - boxes[0]!.max.y;
  expect(gap).toBeGreaterThan(0.005);
  expect(gap).toBeLessThan(0.065);
});

it("restores every assembly and leaves the second instance and shared source untouched", () => {
  const first = createModelInstance(source, "SERVER-01");
  const second = createModelInstance(source, "SERVER-02");
  const snapshots = [source, first.object, second.object].map((root) => {
    const values: Array<{ node: Object3D; position: number[]; quaternion: number[]; scale: number[] }> = [];
    root.traverse((node) => values.push({ node, position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray() }));
    return values;
  });
  const psu = first.object.getObjectByName("rear_psu_01")!;
  const rest = psu.getWorldPosition(new Vector3());
  setExplodeFactor(first, 1);
  expect(psu.getWorldPosition(new Vector3()).z).toBeLessThan(rest.z - 0.1);
  setExplodeFactor(first, 0);
  for (const snapshot of snapshots.flat()) {
    expect(snapshot.node.position.toArray()).toEqual(snapshot.position);
    expect(snapshot.node.quaternion.toArray()).toEqual(snapshot.quaternion);
    expect(snapshot.node.scale.toArray()).toEqual(snapshot.scale);
  }
});

it("keeps the front fan/SSD lanes and rear NIC/PSU lanes separate throughout the transition", () => {
  const instance = createModelInstance(source, "SERVER-01");
  const box = (name: string) => new Box3().setFromObject(instance.object.getObjectByName(name)!);
  for (let step = 0; step <= 100; step++) {
    setExplodeFactor(instance, step / 100);
    instance.object.updateMatrixWorld(true);
    for (let fan = 1; fan <= 12; fan++)
      for (let drive = 1; drive <= 8; drive++)
        expect(box(`fan_module_${String(fan).padStart(2, "0")}`).intersectsBox(box(`front_drive_0${drive}`))).toBe(false);
    for (let card = 1; card <= 2; card++)
      for (let psu = 1; psu <= 8; psu++)
        expect(box(`nic_100g_adapter_0${card}`).intersectsBox(box(`rear_psu_0${psu}`))).toBe(false);
    for (let fan = 13; fan <= 16; fan++)
      for (let gpu = 1; gpu <= 4; gpu++)
        expect(box(`fan_module_${fan}`).intersectsBox(box(`gpu_0${gpu}`)), `fan ${fan}/GPU ${gpu} at ${step}%`).toBe(false);
    // The combined BOSS box includes empty space below its lifted M.2s.
    // Check physical mesh bounds, not that empty parent envelope.
    instance.object.getObjectByName("boss_n1")!.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.computeBoundingBox();
      const part = node.geometry.boundingBox!.clone().applyMatrix4(node.matrixWorld);
      expect(box("front_storage_backplane").intersectsBox(part), `backplane/${node.name} at ${step}%`).toBe(false);
      for (let drive = 1; drive <= 8; drive++)
        expect(box(`front_drive_0${drive}`).intersectsBox(part), `SSD ${drive}/${node.name} at ${step}%`).toBe(false);
    });
  }
});
