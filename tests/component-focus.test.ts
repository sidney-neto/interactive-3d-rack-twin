import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render } from "@testing-library/react";
import { createElement } from "react";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Ray,
  Spherical,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";
import { createViewerStore } from "../src/store/viewerStore";
import { selectAssetHit } from "../src/three/interactions/assetHitSelection";
import {
  ComponentFocusProvider,
  useComponentFocus,
  type ComponentFocus,
} from "../src/three/interactions/ComponentFocus";
import { componentFrame } from "../src/three/interactions/componentFrame";
import { componentIdFromHit } from "../src/three/interactions/ComponentInteraction";
import {
  animateModelCover,
  createModelInstance,
} from "../src/three/models/modelInstance";
import { setExplodeFactor } from "../src/three/models/explodedView";

it("registers scene roots and only removes roots owned by that registration", () => {
  let focus: ComponentFocus | undefined;
  function Probe() {
    focus = useComponentFocus();
    return null;
  }
  render(createElement(ComponentFocusProvider, null, createElement(Probe)));
  const first = new Object3D();
  const replacement = new Object3D();
  let removeFirst = () => {};
  let removeReplacement = () => {};
  act(() => {
    removeFirst = focus!.register(new Map([["SERVER-01.GPU-01", first]]));
    removeReplacement = focus!.register(
      new Map([["SERVER-01.GPU-01", replacement]]),
    );
  });
  expect(focus!.get("SERVER-01.GPU-01")).toBe(replacement);
  act(removeFirst);
  expect(focus!.get("SERVER-01.GPU-01")).toBe(replacement);
  act(removeReplacement);
  expect(focus!.get("SERVER-01.GPU-01")).toBeUndefined();
});

it("frames finite transformed world bounds and returns undefined for empty roots", () => {
  const server = new Group();
  server.position.set(1.2, 0.7, -0.4);
  server.rotation.y = Math.PI / 3;
  const component = new Group();
  component.position.set(0.2, 0.1, 0.3);
  component.add(
    new Mesh(new BoxGeometry(0.4, 0.2, 0.6), new MeshBasicMaterial()),
  );
  server.add(component);
  server.updateMatrixWorld(true);

  const initial = componentFrame(component, 1.5, 38);
  const expected = new Box3().setFromObject(component);
  expect(initial?.center.distanceTo(expected.getCenter(new Vector3()))).toBeLessThan(
    1e-6,
  );
  expect(Number.isFinite(initial?.distance)).toBe(true);
  expect(initial!.distance).toBeGreaterThanOrEqual(0.65);

  server.position.x += 0.8;
  component.position.y += 0.5;
  const moved = componentFrame(component, 1.5, 38);
  expect(moved!.center.distanceTo(initial!.center)).toBeGreaterThan(0.8);
  expect(componentFrame(new Group(), 1.5, 38)).toBeUndefined();
});

it("keeps CPU and DIMM focus rays clear of the cover and upper tray", async () => {
  const file = readFileSync(
    resolve("public/assets/models/servers/poweredge-xe7745.glb"),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    Uint8Array.from(file).buffer,
    "",
  );
  const instance = createModelInstance(scene, "SERVER-01", true);
  const camera = new Vector3();
  const hit = new Vector3();

  for (const factor of [0, 1]) {
    setExplodeFactor(instance, factor);
    animateModelCover(instance, 0.1743 * 1.8, 1, factor);
    instance.object.updateMatrixWorld(true);
    const blockers = [instance.cover!, instance.object.getObjectByName("upper_tray")!];

    for (const id of [
      "SERVER-01.CPU-A",
      "SERVER-01.CPU-B",
      "SERVER-01.DIMM-A01",
      "SERVER-01.DIMM-B01",
    ]) {
      const frame = componentFrame(instance.componentRegistry.get(id)!, 1.5, 38)!;
      camera
        .setFromSpherical(new Spherical(frame.distance, frame.polarAngle, 0.55))
        .add(frame.center);
      const ray = new Ray(
        camera,
        frame.center.clone().sub(camera).normalize(),
      );
      for (const blocker of blockers) {
        const intersection = ray.intersectBox(new Box3().setFromObject(blocker), hit);
        expect(
          intersection && intersection.distanceTo(camera) < frame.distance - 0.001,
          `${id} focus ray crossed ${blocker.name} at explode factor ${factor}`,
        ).toBeFalsy();
      }
    }
  }
});

it("resolves only open, catalog-backed components owned by the server", async () => {
  const assets = await new StaticAssetRepository().listAssets();
  const catalog = new Map(assets.map((asset) => [asset.id, asset]));
  const server = new Group();
  const gpu = new Group();
  const surface = new Mesh();
  gpu.userData.logicalAssetId = "SERVER-01.GPU-01";
  gpu.add(surface);
  server.add(gpu);
  const registry = new Map([["SERVER-01.GPU-01", gpu]]);

  expect(componentIdFromHit(surface, registry, "SERVER-01", false, catalog)).toBeUndefined();
  expect(componentIdFromHit(surface, registry, "SERVER-01", true, catalog)).toBe(
    "SERVER-01.GPU-01",
  );
  expect(componentIdFromHit(surface, registry, "SERVER-02", true, catalog)).toBeUndefined();
  expect(componentIdFromHit(new Object3D(), registry, "SERVER-01", true, catalog)).toBeUndefined();
});

it("selects the owning server for a closed cover and an open structural barrier", async () => {
  const assets = await new StaticAssetRepository().listAssets();
  const catalog = new Map(assets.map((asset) => [asset.id, asset]));
  const store = createViewerStore(assets);
  const source = new Group();
  const cover = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  cover.name = "top_cover";
  cover.userData = { interactionRole: "cover", selectable: false };
  source.add(cover);
  const instance = createModelInstance(source, "SERVER-01");

  expect(instance.cover!.userData.logicalAssetId).toBeNull();
  selectAssetHit(instance.cover!, "SERVER-01", catalog, store);
  expect(store.getState()).toMatchObject({
    selectedAssetId: "SERVER-01",
    selectedServerId: "SERVER-01",
    serverOpen: false,
  });

  const actions = store.getState();
  actions.extractServer();
  actions.openServer();
  actions.selectComponent("SERVER-01.GPU-01");
  const support = new Object3D();
  support.userData = { logicalAssetId: null, selectable: false };
  selectAssetHit(support, "SERVER-01", catalog, store);
  expect(store.getState()).toMatchObject({
    selectedAssetId: "SERVER-01",
    selectedComponentId: null,
    serverOpen: true,
  });
});

it("stores validated per-server model capability without clearing it on viewer reset", async () => {
  const assets = await new StaticAssetRepository().listAssets();
  const store = createViewerStore(assets);
  const empty = store.getState();
  store.getState().setComponentIds("SERVER-01", []);
  expect(store.getState()).toBe(empty);
  store.getState().setComponentIds("SERVER-01", [
    "SERVER-01.GPU-01",
    "SERVER-02.GPU-01",
    "SERVER-01.MISSING",
  ]);
  expect(store.getState().componentIdsByServer).toEqual({
    "SERVER-01": ["SERVER-01.GPU-01"],
  });
  const unchanged = store.getState();
  store.getState().setComponentIds("SERVER-01", ["SERVER-01.GPU-01"]);
  expect(store.getState()).toBe(unchanged);
  store.getState().resetViewer();
  expect(store.getState().componentIdsByServer["SERVER-01"]).toEqual([
    "SERVER-01.GPU-01",
  ]);
  store.getState().setComponentIds("SERVER-01", []);
  expect(store.getState().componentIdsByServer["SERVER-01"]).toBeUndefined();
});

it("keeps the cover clear of staged upper layers while opening and reassembling", async () => {
  const file = readFileSync(
    resolve("public/assets/models/servers/poweredge-xe7745.glb"),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    Uint8Array.from(file).buffer,
    "",
  );
  const instance = createModelInstance(scene, "SERVER-01", true);
  const upperNames = ["upper_tray", "system_board", "cpu_a", "cpu_b"];
  const coverBox = new Box3();
  const upperBox = new Box3();
  const gpu = instance.componentRegistry.get("SERVER-01.GPU-01")!;
  const assembledFrame = componentFrame(gpu, 1.5, 38)!;
  instance.object.position.z += 0.4;
  setExplodeFactor(instance, 0.5);
  const extractedFrame = componentFrame(gpu, 1.5, 38)!;
  expect(extractedFrame.center.z - assembledFrame.center.z).toBeCloseTo(0.4, 6);
  expect(extractedFrame.center.y).not.toBeCloseTo(assembledFrame.center.y, 6);
  instance.object.position.z -= 0.4;

  for (const factor of [0.02, 0.05, 0.1, 0.15, 0.2, 0.5, 1, 0.5, 0.2, 0.05]) {
    setExplodeFactor(instance, factor);
    animateModelCover(instance, factor > 0.5 ? 0.31 : 0, 0.1, factor);
    instance.object.updateMatrixWorld(true);
    coverBox.setFromObject(instance.cover!);
    upperBox.makeEmpty();
    for (const name of upperNames)
      upperBox.union(new Box3().setFromObject(instance.object.getObjectByName(name)!));
    expect(coverBox.min.y).toBeGreaterThan(upperBox.max.y);
  }
  const lifted = instance.cover!.getWorldPosition(new Vector3()).y;
  setExplodeFactor(instance, 0);
  animateModelCover(instance, 0, 0.1, 0);
  instance.object.updateMatrixWorld(true);
  expect(instance.cover!.getWorldPosition(new Vector3()).y).toBeLessThan(lifted);
});
