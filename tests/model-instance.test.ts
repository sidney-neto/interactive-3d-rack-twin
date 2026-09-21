import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from "three";
import { expect, it } from "vitest";
import {
  createModelInstance,
  animateModelCover,
  setModelBezelRemoved,
} from "../src/three/models/modelInstance";

it("centers bottom-origin models without scaling and moves each cloned cover in world-up independently", () => {
  const source = new Group();
  const blenderRoot = new Group();
  blenderRoot.rotation.x = -Math.PI / 2;
  source.add(blenderRoot);
  const chassis = new Mesh(
    new BoxGeometry(0.482, 0.89956, 0.1723),
    new MeshStandardMaterial(),
  );
  chassis.position.z = 0.08615;
  const cover = new Mesh(
    new BoxGeometry(0.44, 0.85, 0.002),
    new MeshStandardMaterial(),
  );
  cover.name = "top_cover";
  cover.position.z = 0.1733;
  cover.userData = { interactionRole: "cover", selectable: false };
  blenderRoot.add(chassis, cover);
  const first = createModelInstance(source, "SERVER-01", true);
  const second = createModelInstance(source, "SERVER-02", true);
  const bounds = new Box3().setFromObject(first.object);
  expect(bounds.getCenter(new Vector3()).length()).toBeCloseTo(0, 5);
  expect(bounds.getSize(new Vector3()).toArray()).toEqual(
    expect.arrayContaining([
      expect.closeTo(0.482, 5),
      expect.closeTo(0.1743, 5),
      expect.closeTo(0.89956, 5),
    ]),
  );
  const initial = first.cover!.getWorldPosition(new Vector3());
  animateModelCover(first, 0.3, 1);
  const lifted = first.cover!.getWorldPosition(new Vector3());
  expect(lifted.y - initial.y).toBeCloseTo(0.3, 5);
  expect(lifted.x).toBeCloseTo(initial.x, 5);
  expect(lifted.z).toBeCloseTo(initial.z, 5);
  expect(second.cover!.position.z).toBeCloseTo(0.1733, 5);
  expect(cover.position.z).toBeCloseTo(0.1733, 5);
  expect((first.cover as Mesh).material).toBe(cover.material);
  expect((first.cover as Mesh).geometry).toBe(cover.geometry);
  expect(first.cover!.userData.logicalAssetId).toBeNull();
  animateModelCover(first, 0, 1);
  expect(first.cover!.getWorldPosition(new Vector3()).y).toBeCloseTo(
    initial.y,
    5,
  );
});

it("toggles only the cloned bezel and preserves its installed transform and source materials", () => {
  const source = new Group();
  const bezel = new Mesh(
    new BoxGeometry(0.44, 0.17, 0.003),
    new MeshStandardMaterial(),
  );
  bezel.name = "front_bezel";
  bezel.userData = { interactionRole: "bezel", selectable: false };
  bezel.position.set(0, 0.08, 0.44);
  source.add(bezel);
  const first = createModelInstance(source, "SERVER-01");
  const second = createModelInstance(source, "SERVER-02");
  const raycaster = new Raycaster(
    new Vector3(0, 0.08, 1),
    new Vector3(0, 0, -1),
  );
  expect(first.bezel).toBeDefined();
  first.object.updateMatrixWorld(true);
  expect(raycaster.intersectObject(first.bezel!, true)).not.toHaveLength(0);
  setModelBezelRemoved(first, true);
  expect(first.bezel!.visible).toBe(false);
  expect(raycaster.intersectObject(first.bezel!, true)).toHaveLength(0);
  expect(second.bezel!.visible).toBe(true);
  expect(bezel.visible).toBe(true);
  expect((first.bezel as Mesh).material).toBe(bezel.material);
  setModelBezelRemoved(first, false);
  expect(first.bezel!.visible).toBe(true);
  expect(raycaster.intersectObject(first.bezel!, true)).not.toHaveLength(0);
  expect(first.bezel!.position.toArray()).toEqual([0, 0.08, 0.44]);
  expect(() =>
    setModelBezelRemoved(createModelInstance(new Group(), "SERVER-01"), true),
  ).not.toThrow();
});

it("leaves other models' origins unchanged and safely handles a missing cover", () => {
  const source = new Group();
  source.position.set(1, 2, 3);
  const instance = createModelInstance(source, "SWITCH-01");
  animateModelCover(instance, 0.3, 1);
  expect(instance.object.position.toArray()).toEqual([1, 2, 3]);
  expect(instance.cover).toBeUndefined();
});
