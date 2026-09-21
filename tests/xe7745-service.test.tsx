import { readFileSync } from "node:fs";
import { Box3, Mesh, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createModelInstance } from "../src/three/models/modelInstance";
import { explodeOffset, setExplodeFactor } from "../src/three/models/explodedView";
import { componentIdFromHit } from "../src/three/interactions/ComponentInteraction";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";
import { createViewerStore } from "../src/store/viewerStore";
import { InfrastructureProvider } from "../src/data/InfrastructureProvider";
import { InspectorPanel } from "../src/components/inspector/InspectorPanel";
import { RackUnitMap } from "../src/components/rack-map/RackUnitMap";
import { services } from "../src/data/services";

let source: Object3D;
beforeAll(async () => {
  const file = readFileSync("public/assets/models/servers/poweredge-xe7745.glb");
  source = (await new GLTFLoader().parseAsync(Uint8Array.from(file).buffer, "")).scene;
});
const repository = () => new StaticAssetRepository(() => ({ getItem: () => null, setItem: () => {} }));

// Surface triangles avoid counting the empty opening inside a frame's aggregate box.
function surfaceBounds(root: Object3D) {
  const boxes: Box3[] = [];
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const positions = node.geometry.getAttribute("position");
    const indices = node.geometry.index;
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const points = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, indices?.getX(i + j) ?? i + j).applyMatrix4(node.matrixWorld));
      boxes.push(new Box3().setFromPoints(points));
    }
  });
  return boxes;
}

it("keeps BOSS and NIC extraction clear of fixed service openings throughout motion", () => {
  const instance = createModelInstance(source, "SERVER-01");
  const object = instance.object;
  object.updateMatrixWorld(true);
  const fixedFront = surfaceBounds(object.getObjectByName("front_panel")!);
  const fixedRear = ["rear_panel", "internal_chassis", "rear_center_vent"].flatMap(n => surfaceBounds(object.getObjectByName(n)!));
  for (let step = 0; step <= 100; step++) {
    setExplodeFactor(instance, step / 100);
    object.updateMatrixWorld(true);
    const boss = new Box3().setFromObject(object.getObjectByName("boss_n1")!);
    expect(fixedFront.some(b => b.intersectsBox(boss)), `BOSS/front frame ${step}%`).toBe(false);
    for (let fan = 1; fan <= 16; fan++)
      expect(boss.intersectsBox(new Box3().setFromObject(object.getObjectByName(`fan_module_${String(fan).padStart(2, "0")}`)!)), `BOSS/fan ${fan} ${step}%`).toBe(false);
    for (const name of ["nic_25g_adapter", "nic_100g_adapter_01", "nic_100g_adapter_02"]) {
      const card = new Box3().setFromObject(object.getObjectByName(name)!);
      expect(fixedRear.some(b => b.intersectsBox(card)), `${name}/rear frame ${step}%`).toBe(false);
    }
  }
});

it("extracts the complete BOSS centrally forward at the existing front opening height", () => {
  const instance = createModelInstance(source, "SERVER-01");
  const boss = instance.object.getObjectByName("boss_n1")!;
  const face = instance.object.getObjectByName("front_boss_n1")!;
  expect(face.parent === boss).toBe(true);
  const rest = boss.getWorldPosition(new Vector3());
  expect(Math.abs(rest.y - face.getWorldPosition(new Vector3()).y)).toBeLessThan(0.01);
  const m2 = instance.object.getObjectByName("boss_m2_01")!;
  const relative = m2.position.clone();
  for (const factor of [0.1, 0.5, 1]) {
    setExplodeFactor(instance, factor);
    const moved = boss.getWorldPosition(new Vector3()).sub(rest);
    expect(moved.x).toBeCloseTo(0, 7);
    expect(moved.y).toBeCloseTo(0, 7);
    expect(moved.z).toBeGreaterThan(0);
    expect(m2.position).toEqual(relative);
  }
  setExplodeFactor(instance, 0);
  expect(boss.getWorldPosition(new Vector3())).toEqual(rest);
});

it("extracts NICs along rear slots and keeps upper cooling with the CPU tray", () => {
  for (const name of ["nic_25g_adapter", "nic_100g_adapter_01", "nic_100g_adapter_02"]) {
    const offset = explodeOffset(name, 1);
    expect(offset.slice(0, 2)).toEqual([0, 0]);
    expect(offset[2]).toBeLessThan(-0.12);
  }
  for (let i = 13; i <= 16; i++)
    for (const factor of [0.1, 0.5, 1])
      expect(explodeOffset(`fan_module_${i}`, factor)).toEqual(explodeOffset("system_board", factor));
});

it("keeps CPU fan housings above the upper board throughout explosion", () => {
  const instance = createModelInstance(source, "SERVER-01");
  for (let step = 0; step <= 100; step++) {
    setExplodeFactor(instance, step / 100);
    instance.object.updateMatrixWorld(true);
    const board = surfaceBounds(instance.object.getObjectByName("system_board")!);
    for (let i = 13; i <= 16; i++) {
      const fan = new Box3().setFromObject(instance.object.getObjectByName(`fan_module_${i}`)!);
      expect(board.some(part => part.intersectsBox(fan)), `upper board/fan ${i} ${step}%`).toBe(false);
    }
  }
});

it("adds a nonselectable green GPU board and four empty mounts without extra GPUs", () => {
  const board = source.getObjectByName("gpu_baseboard");
  expect(board).toBeDefined();
  expect(board!.userData.selectable).toBe(false);
  const names: string[] = [];
  let green = false;
  source.traverse((node) => names.push(node.name));
  board!.traverse((node) => {
    if (node instanceof Mesh)
      green ||= (Array.isArray(node.material) ? node.material : [node.material]).some(m => m.name.startsWith("MAT_BOARD_GREEN"));
  });
  expect(green).toBe(true);
  expect(names.filter(n => /^gpu_\d{2}$/.test(n))).toHaveLength(4);
  expect(names.filter(n => /^gpu_empty_slot_\d{2}$/.test(n))).toHaveLength(4);
  expect(names.filter(n => /^front_drive_\d{2}$/.test(n))).toHaveLength(8);
  expect(names.filter(n => /^boss_m2_\d{2}$/.test(n))).toHaveLength(2);
  // Measure the PCB itself; its decorative children intentionally extend above it.
  const bounds = new Box3().setFromObject(board!.clone(false));
  bounds.applyMatrix4(board!.parent!.matrixWorld);
  expect(bounds.min.y).toBeGreaterThan(0.002);
  expect(bounds.max.y).toBeLessThan(0.006);
});

it("selects external PSUs while closed but gates NVLink and internal hardware", async () => {
  const assets = await repository().listAssets();
  const catalog = new Map(assets.map(a => [a.id, a]));
  const store = createViewerStore(assets);
  for (const server of ["SERVER-01", "SERVER-02"]) {
    const instance = createModelInstance(source, server);
    store.getState().selectServer(server);
    for (let i = 1; i <= 8; i++) {
      const id = `${server}.PSU-0${i}`;
      const asset = catalog.get(id);
      expect(asset).toMatchObject({ type: "component", parentId: server, status: "unknown" });
      const node = instance.object.getObjectByName(`rear_psu_0${i}`)!;
      const hit = node.getObjectByProperty("isMesh", true) ?? node;
      expect(componentIdFromHit(hit, instance.componentRegistry, server, false, catalog)).toBe(id);
      store.getState().selectComponent(id);
      expect(store.getState().selectedComponentId).toBe(id);
      expect(store.getState().serverOpen).toBe(false);
    }
    const bridge = instance.object.getObjectByName("nvlink_bridge_4way")!;
    const bridgeId = `${server}.NVLINK-01`;
    expect(componentIdFromHit(bridge, instance.componentRegistry, server, false, catalog)).toBeUndefined();
    store.getState().selectComponent(bridgeId);
    expect(store.getState().selectedComponentId).toBe(`${server}.PSU-08`);
    store.getState().extractServer();
    store.getState().openServer();
    expect(componentIdFromHit(bridge, instance.componentRegistry, server, true, catalog)).toBe(bridgeId);
    store.getState().selectComponent(bridgeId);
    expect(store.getState().selectedComponentId).toBe(bridgeId);
    const asset = catalog.get(bridgeId);
    expect(asset?.type === "component" && asset.description).toMatch(/GPU.*data/);
  }
  store.getState().resetViewer();
  expect(store.getState().servers).toEqual({});
  expect(store.getState().selectedComponentId).toBeNull();
});

it("shows repository PSU unknowns and NVLink purpose in the existing Inspector", async () => {
  render(<InfrastructureProvider services={{ ...services, assets: repository() }}><RackUnitMap /><InspectorPanel /></InfrastructureProvider>);
  fireEvent.click(await screen.findByRole("button", { name: /select SERVER-01/i }));
  fireEvent.click(await screen.findByRole("button", { name: "PSU-01" }));
  expect(await screen.findByRole("heading", { name: "PSU-01" })).toBeInTheDocument();
  expect(screen.getAllByText("Not specified in configured inventory").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "← Back to server" }));
  fireEvent.click(screen.getByRole("button", { name: "Extract server" }));
  fireEvent.click(screen.getByRole("button", { name: "Open server" }));
  fireEvent.click(await screen.findByRole("button", { name: "NVLink bridge" }));
  expect(await screen.findByRole("heading", { name: "NVLink bridge" })).toBeInTheDocument();
  expect(screen.getByText(/not a file-copy service/i)).toBeInTheDocument();
  expect(screen.getByText(/SERVER-01.GPU-01.*SERVER-01.GPU-04/)).toBeInTheDocument();
});
