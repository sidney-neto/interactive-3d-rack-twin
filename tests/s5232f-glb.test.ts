import { readFileSync } from "node:fs";
import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import { createModelInstance } from "../src/three/models/modelInstance";
import { componentFrame } from "../src/three/interactions/componentFrame";
import { componentIdFromHit } from "../src/three/interactions/ComponentInteraction";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";

it("loads the actual shared switch GLB, validates physical layout and ray-picks every selectable component", async () => {
  const bytes = readFileSync("public/assets/models/switches/powerswitch-s5232f-on.glb");
  expect(bytes.byteLength).toBeLessThan(4_000_000);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  expect(new Set(json.nodes.map((n: { name: string }) => n.name)).size).toBe(json.nodes.length);
  const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, "");
  const bounds = new Box3().setFromObject(scene);
  expect(bounds.min.y).toBeCloseTo(0, 5);
  const chassis = new Box3().setFromObject(scene.getObjectByName("chassis_shell")!);
  chassis.union(new Box3().setFromObject(scene.getObjectByName("top_panel")!));
  const size = chassis.getSize(new Vector3());
  expect(size.toArray()).toEqual([expect.closeTo(.434, 5), expect.closeTo(.0436, 5), expect.closeTo(.460, 5)]);
  expect(scene.getObjectByName("S5232F_ROOT")?.userData).toMatchObject({ formFactor: "1U", rackUnits: 1, airflowMode: "unspecified" });
  expect(scene.getObjectByName("reset_button")?.userData.selectable).toBe(false);
  let triangles = 0;
  scene.traverse(n => {
    if (n instanceof Mesh) triangles += (n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3;
    for (const key of ["linkStatus", "utilization", "rxBytes", "rpm", "health"]) expect(n.userData).not.toHaveProperty(key);
    expect(n.type).not.toMatch(/Camera|Light/);
  });
  expect(triangles).toBeLessThan(50_000);
  const assets = await new StaticAssetRepository().listAssets();
  const catalog = new Map(assets.map(a => [a.id, a]));
  const first = createModelInstance(scene, "SWITCH-01", true);
  const second = createModelInstance(scene, "SWITCH-02", true);
  expect(first.componentRegistry.size).toBe(44);
  expect(second.componentRegistry.size).toBe(44);
  for (const instance of [first, second]) {
    instance.object.updateMatrixWorld(true);
    const ports = [...instance.componentRegistry].filter(([id]) => /\.PORT-/.test(id));
    expect(ports).toHaveLength(32);
    expect([...instance.componentRegistry.keys()].filter(id => /\.SFPPLUS-/.test(id))).toHaveLength(2);
    for (const [id, root] of instance.componentRegistry) {
      const a = catalog.get(id);
      expect(a?.type).toBe("component");
      const rear = a?.type === "component" && a.specifications?.location === "PSU_SIDE";
      const frame = componentFrame(root, 1.5, 38, .10)!;
      expect(frame.distance).toBeGreaterThanOrEqual(.10);
      if (/\.PORT-/.test(id)) expect(frame.distance).toBeLessThan(.2);
      const from = frame.center.clone().add(new Vector3(0, 0, rear ? -.2 : .2));
      const ray = new Raycaster(from, new Vector3(0, 0, rear ? 1 : -1));
      const hit = ray.intersectObject(instance.object, true)[0];
      expect(hit, id).toBeDefined();
      expect(componentIdFromHit(hit!.object, instance.componentRegistry, a!.type === "component" ? a!.parentId : "", false, catalog), id).toBe(id);
    }
    for (let i = 1; i <= 32; i++) {
      const port = instance.componentRegistry.get(`${instance === first ? "SWITCH-01" : "SWITCH-02"}.PORT-${String(i).padStart(2, "0")}`)!;
      expect(port.userData).toMatchObject({ physicalPort: i, portType: "QSFP28", nominalSpeed: "100G" });
      for (let j = i + 1; j <= 32; j++) {
        const sibling = ports[j - 1]![1];
        const p = new Box3().setFromObject(port), q = new Box3().setFromObject(sibling);
        expect(p.intersectsBox(q), `${i}/${j} overlap`).toBe(false);
      }
    }
  }
});
