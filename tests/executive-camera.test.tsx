import { act, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createModelInstance, animateModelCover } from "../src/three/models/modelInstance";
import { setExplodeFactor } from "../src/three/models/explodedView";
import { rackPositionY, rackPositionZ } from "../src/data/rackLayout";
import { CameraController } from "../src/three/camera/CameraController";
import { InfrastructureContext, type Infrastructure } from "../src/data/infrastructureContext";
import { services } from "../src/data/services";
import { createViewerStore } from "../src/store/viewerStore";

const runtime = vi.hoisted(() => ({ frame: (() => {}) as (_: unknown, dt: number) => void, camera: undefined as unknown, target: undefined as unknown, roots: new Map<string, Object3D>(), size: { width: 1200, height: 900 }, manual: () => {} }));
vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: typeof runtime.frame) => { runtime.frame = callback; },
  useThree: () => ({ camera: runtime.camera, size: runtime.size }),
}));
vi.mock("@react-three/drei", async () => {
  const { useImperativeHandle, useMemo } = await import("react");
  const { Vector3 } = await import("three");
  return { OrbitControls: ({ ref, onStart }: { ref: React.Ref<unknown>; onStart: () => void }) => {
    const controls = useMemo(() => ({ target: new Vector3(), update() { (runtime.camera as PerspectiveCamera).lookAt(this.target); } }), []);
    runtime.target = controls.target;
    useImperativeHandle(ref, () => controls); runtime.manual = onStart;
    return null;
  } };
});
vi.mock("../src/three/interactions/ComponentFocus", () => {
  const focus = { get: (id: string) => runtime.roots.get(id) };
  return { useComponentFocus: () => focus };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture(reduced = false) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  runtime.roots.clear();
  const assets = await services.assets.listAssets();
  const rack = (await services.racks.getRack("RACK-01"))!;
  const store = createViewerStore(assets);
  const camera = new PerspectiveCamera(38, 1200 / 900, 0.01, 100);
  camera.position.set(2.1, 1.85, 3.4); runtime.camera = camera;
  runtime.size = { width: 1200, height: 900 };
  const context: Infrastructure = { assets, rack, store, catalog: new Map(assets.map(a => [a.id, a])), services, loadWarning: null, updateEquipment: async () => {} };
  const view = () => <InfrastructureContext.Provider value={context}><CameraController /></InfrastructureContext.Provider>;
  const rendered = render(view());
  const frame = () => act(() => runtime.frame({}, 1 / 60));
  return { assets, rack, store, camera, frame, resize: (width = 800) => { runtime.size = { width, height: 900 }; rendered.rerender(view()); } };
}

it("travels a full circle before acknowledging completion, freezes on pause, and cancels on a new command", async () => {
  const f = await fixture();
  act(() => f.store.getState().setCamera("free", undefined, 6000));
  for (let i = 0; i < 180; i++) f.frame();
  const revision = f.store.getState().cameraRevision;
  expect(f.store.getState().cameraSettledRevision).not.toBe(revision);
  const paused = f.camera.position.clone();
  f.store.setState({ presentationPaused: true });
  for (let i = 0; i < 120; i++) f.frame();
  expect(f.camera.position.distanceTo(paused)).toBe(0);
  f.resize(); f.frame();
  expect(f.camera.position.distanceTo(paused)).toBe(0);
  f.store.setState({ presentationPaused: false });
  f.frame();
  const resumedAngle = Math.atan2(f.camera.position.x, f.camera.position.z) - Math.atan2(paused.x, paused.z);
  expect(Math.atan2(Math.sin(resumedAngle), Math.cos(resumedAngle))).toBeGreaterThan(0);
  expect(f.camera.position.distanceTo(paused)).toBeLessThan(0.15);
  // Restart from a settled rack framing so angular travel is independent of approach motion.
  act(() => f.store.getState().setCamera("free"));
  for (let i = 0; i < 180; i++) f.frame();
  const start = f.camera.position.clone();
  let angle = Math.atan2(start.x, start.z), travel = 0;
  act(() => f.store.getState().setCamera("free", undefined, 6000));
  const rev = f.store.getState().cameraRevision;
  for (let i = 0; i < 600 && f.store.getState().cameraSettledRevision !== rev; i++) {
    f.frame();
    const next = Math.atan2(f.camera.position.x, f.camera.position.z);
    travel += Math.atan2(Math.sin(next - angle), Math.cos(next - angle)); angle = next;
  }
  expect(travel).toBeCloseTo(2 * Math.PI, 2);
  expect(f.camera.position.distanceTo(start)).toBeLessThan(0.01);
  expect(f.store.getState().cameraSettledRevision).toBe(rev);
  f.resize(700);
  for (let i = 0; i < 180; i++) f.frame();
  const completed = f.camera.position.clone();
  for (let i = 0; i < 120; i++) f.frame();
  expect(f.camera.position.distanceTo(completed)).toBe(0);
  act(() => f.store.getState().setCamera("free", undefined, 6000));
  for (let i = 0; i < 60; i++) f.frame();
  runtime.manual();
  const manual = f.camera.position.clone();
  for (let i = 0; i < 120; i++) f.frame();
  expect(f.camera.position.distanceTo(manual)).toBe(0);
  act(() => f.store.getState().setCamera("front"));
  for (let i = 0; i < 180; i++) f.frame();
  expect(f.camera.position.x).toBeCloseTo(0, 2);
  const final = f.camera.position.clone();
  for (let i = 0; i < 500; i++) f.frame();
  expect(f.camera.position.distanceTo(final)).toBe(0);
});

it("starts and ends the server orbit front-centered with low elevation and fits every chassis corner during rotation", async () => {
  const f = await fixture();
  const chassis = new Mesh(new BoxGeometry(0.482, 0.1743, 0.89956));
  const mount = new Group(); mount.add(chassis); mount.position.set(0.2, 1.8, 0.15);
  runtime.roots.set("SERVER-01", chassis);
  const bounds = new Box3().setFromCenterAndSize(mount.position, new Vector3(0.482, 0.1743, 0.89956));
  const center = bounds.getCenter(new Vector3());
  act(() => { f.store.getState().selectAsset("SERVER-01"); f.store.getState().setCamera("focus", undefined, 5000); });
  let sawFront = false, samples = 0;
  for (let i = 0; i < 600 && f.store.getState().cameraSettledRevision !== f.store.getState().cameraRevision; i++) {
    f.frame();
    if ((runtime.target as Vector3).distanceTo(center) > 0.001) continue;
    const offset = f.camera.position.clone().sub(center);
    if (Math.abs(offset.x) < 0.002 && offset.z > 0 && offset.y / offset.z < 0.22) sawFront = true;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new Vector3(x, y, z).project(f.camera);
      expect(Math.abs(point.x)).toBeLessThan(1);
      expect(Math.abs(point.y)).toBeLessThan(1);
      expect(point.z).toBeLessThan(1);
    }
    samples++;
  }
  expect(samples).toBeGreaterThan(200);
  expect(sawFront).toBe(true);
  expect(f.camera.position.x).toBeCloseTo(center.x, 2);
  const offset = f.camera.position.clone().sub(center);
  expect(offset.y / offset.z).toBeGreaterThan(0.05);
  expect(offset.y / offset.z).toBeLessThan(0.22);
  chassis.geometry.dispose();
});

it("honors reduced motion even if an orbit command is requested directly", async () => {
  const f = await fixture(true);
  act(() => f.store.getState().setCamera("free", undefined, 6000));
  f.frame();
  expect(f.store.getState().cameraSettledRevision).toBe(f.store.getState().cameraRevision);
  const start = new Vector3().copy(f.camera.position);
  for (let i = 0; i < 120; i++) f.frame();
  expect(f.camera.position.distanceTo(start)).toBe(0);
});

it("keeps the actual GLB inside a diagonal service view throughout expansion and return from rear inspection", async () => {
  const f = await fixture();
  const asset = f.assets.find(a => a.id === "SERVER-01");
  if (asset?.type !== "server") throw new Error("Expected server fixture");
  const bytes = readFileSync("public/assets/models/servers/poweredge-xe7745.glb");
  const source = (await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, "")).scene;
  const model = createModelInstance(source, asset.id, true);
  const body = new Group(); body.add(model.object);
  const dockedZ = rackPositionZ(asset, f.rack);
  body.position.set(0, rackPositionY(asset.rackPosition, f.rack), dockedZ);
  runtime.roots.set(asset.id, model.object);
  act(() => { f.store.getState().selectAsset(asset.id); f.store.getState().setCamera("focus", "front", 0, true); });
  for (let i = 0; i < 240; i++) f.frame();
  expect(f.store.getState().cameraSettledRevision).toBe(f.store.getState().cameraRevision);
  const assertServiceAngle = () => {
    const offset = f.camera.position.clone().sub(runtime.target as Vector3);
    const yaw = Math.atan2(offset.x, offset.z) * 180 / Math.PI;
    expect(yaw).toBeGreaterThanOrEqual(20);
    expect(yaw).toBeLessThanOrEqual(25);
    expect(offset.y / Math.hypot(offset.x, offset.z)).toBeCloseTo(Math.tan(8 * Math.PI / 180), 2);
  };
  assertServiceAngle();
  const position = f.camera.position.clone();
  act(() => f.store.setState({ presentationPreparing: true }));
  for (let i = 0; i <= 30; i++) {
    const extraction = Math.min(1, i / 10), open = Math.max(0, Math.min(1, (i - 10) / 10)), explosion = Math.max(0, (i - 20) / 10);
    body.position.z = dockedZ + asset.geometry.depth * 0.9 * extraction;
    setExplodeFactor(model, explosion);
    animateModelCover(model, (asset.geometry.height ?? 0.1743) * 1.8 * open, 1, explosion);
    body.updateWorldMatrix(true, true); // The real renderer updates parent transforms every frame.
    f.frame();
    const box = new Box3().setFromObject(model.object);
    const front = new Vector3(0, 0, asset.geometry.depth / 2).applyMatrix4(body.matrixWorld).project(f.camera);
    expect(front.y).toBeGreaterThan(-0.5); // Keep the front panel above the bottom toolbar area.
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new Vector3(x, y, z).project(f.camera);
      expect(Math.abs(point.x)).toBeLessThan(1);
      expect(Math.abs(point.y)).toBeLessThan(1);
      expect(point.z).toBeLessThan(1);
    }
    expect(f.camera.position.distanceTo(position)).toBe(0);
  }
  act(() => { f.store.setState({ presentationPreparing: false }); f.store.getState().setCamera("focus", "rear"); });
  for (let i = 0; i < 240; i++) f.frame();
  act(() => f.store.getState().setCamera("focus", "front", 0, true));
  for (let i = 0; i < 240; i++) f.frame();
  assertServiceAngle();
  expect(f.store.getState().cameraSettledRevision).toBe(f.store.getState().cameraRevision);
});
