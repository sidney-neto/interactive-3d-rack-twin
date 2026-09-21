import { readFileSync } from "node:fs";
import { Box3, Mesh, Raycaster, Triangle, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, expect, it } from "vitest";
import { animateModelCover, createModelInstance } from "../src/three/models/modelInstance";
import { setExplodeFactor } from "../src/three/models/explodedView";

let source: Object3D;
beforeAll(async () => {
  const file = readFileSync("public/assets/models/servers/poweredge-xe7745.glb");
  source = (await new GLTFLoader().parseAsync(Uint8Array.from(file).buffer, "")).scene;
  source.updateMatrixWorld(true);
});
const box = (root: Object3D, name: string) => new Box3().setFromObject(root.getObjectByName(name)!);

function materialBounds(root: Object3D, materialName: string) {
  const result = new Box3();
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const positions = node.geometry.getAttribute("position");
    const indices = node.geometry.index;
    const groups = node.geometry.groups.length ? node.geometry.groups : [{ start: 0, count: indices?.count ?? positions.count, materialIndex: 0 }];
    for (const group of groups) {
      const name = materials[group.materialIndex ?? 0]?.name;
      if (name !== materialName && !(materialName === "MAT_BOARD_GREEN" && name?.startsWith("MAT_BOARD_GREEN_"))) continue;
      for (let i = group.start; i < group.start + group.count; i++)
        result.expandByPoint(new Vector3().fromBufferAttribute(positions, indices?.getX(i) ?? i).applyMatrix4(node.matrixWorld));
    }
  });
  return result;
}

// A remote radiator's enclosing box includes empty space alongside the DIMMs.
// Test actual surfaces against the DIMM envelope, not that empty space.
function surfaceIntersectsBox(root: Object3D, bounds: Box3) {
  let intersects = false;
  const triangle = new Triangle();
  root.traverse(node => {
    if (!(node instanceof Mesh) || intersects || !bounds.intersectsBox(new Box3().setFromObject(node))) return;
    const positions = node.geometry.getAttribute("position");
    const indices = node.geometry.index;
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      [triangle.a, triangle.b, triangle.c].forEach((point, j) =>
        point.fromBufferAttribute(positions, indices?.getX(i + j) ?? i + j).applyMatrix4(node.matrixWorld));
      if (bounds.intersectsTriangle(triangle)) { intersects = true; break; }
    }
  });
  return intersects;
}

it("covers the usable lower floor in green without replacing or intersecting the chassis floor", () => {
  const board = source.getObjectByName("gpu_baseboard")!;
  const floor = box(source, "chassis_bottom");
  const green = materialBounds(board, "MAT_BOARD_GREEN");
  expect(green.min.y).toBeGreaterThan(floor.max.y);
  expect(green.min.x).toBeGreaterThan(floor.min.x);
  expect(green.max.x).toBeLessThan(floor.max.x);
  expect(green.min.z).toBeGreaterThan(floor.min.z);
  expect(green.max.z).toBeLessThan(floor.max.z);
  for (const x of [-0.21, 0, 0.21])
    for (const z of [-0.385, 0, 0.42])
      expect(new Raycaster(new Vector3(x, 0.01, z), new Vector3(0, -1, 0)).intersectObject(board, true).length, `floor ${x},${z}`).toBeGreaterThan(0);
  expect(board.userData.selectable).toBe(false);
});

it("aligns the extracted BOSS front face with all eight SSD carrier faces", () => {
  const instance = createModelInstance(source, "SERVER-01");
  const m2 = ["boss_m2_01", "boss_m2_02"].map(n => instance.object.getObjectByName(n)!);
  const rest = m2.map(n => n.position.clone());
  setExplodeFactor(instance, 1);
  instance.object.updateMatrixWorld(true);
  const bossFace = box(instance.object, "front_boss_n1");
  expect(bossFace.getCenter(new Vector3()).x).toBeCloseTo(0, 7);
  for (let i = 1; i <= 8; i++)
    expect(bossFace.max.z).toBeCloseTo(box(instance.object, `front_drive_0${i}`).max.z, 6);
  m2.forEach((node, i) => expect(node.position).toEqual(rest[i]));
});

it("connects NIC port cages to their PCBs and keeps the whole cards rigid during extraction", () => {
  const instance = createModelInstance(source, "SERVER-01");
  for (const [card, ports] of [
    ["nic_25g_adapter", ["rear_nic_25g_01", "rear_nic_25g_02"]],
    ["nic_100g_adapter_01", ["rear_nic_100g_01", "rear_nic_100g_02"]],
    ["nic_100g_adapter_02", ["rear_nic_100g_03", "rear_nic_100g_04"]],
  ] as const) {
    const adapter = instance.object.getObjectByName(card)!;
    const nodes = ports.map(n => instance.object.getObjectByName(n)!);
    const rest = nodes.map(n => n.position.clone());
    for (const factor of [0, 0.2, 0.5, 1, 0]) {
      setExplodeFactor(instance, factor);
      instance.object.updateMatrixWorld(true);
      const pcb = materialBounds(adapter, "MAT_BOARD_GREEN");
      nodes.forEach((port, i) => {
        expect(port.parent).toBe(adapter);
        expect(port.position).toEqual(rest[i]);
        expect(pcb.intersectsBox(new Box3().setFromObject(port)), `${card}/${port.name} physical connection`).toBe(true);
      });
    }
  }
});

it("lifts four solid gray vacant blanks alongside the GPU bank without creating GPU assets", () => {
  const instance = createModelInstance(source, "SERVER-01");
  for (let i = 1; i <= 4; i++) {
    const frame = instance.object.getObjectByName(`gpu_empty_slot_0${i}`)!;
    expect(frame.userData.selectable).toBe(false);
    expect([...instance.componentRegistry.values()]).not.toContain(frame);
    const bounds = new Box3().setFromObject(frame);
    const center = bounds.getCenter(new Vector3());
    expect(bounds.getSize(new Vector3()).toArray()).toEqual(expect.arrayContaining([
      expect.closeTo(0.036, 6), expect.closeTo(0.004, 6), expect.closeTo(0.292, 6),
    ]));
    // Sample the entire interior, including its center, rather than just the rim.
    for (const x of [-0.016, 0, 0.016])
      for (const z of [-0.144, -0.07, 0, 0.07, 0.144]) {
        const hits = new Raycaster(new Vector3(center.x + x, 0.014, center.z + z), new Vector3(0, -1, 0)).intersectObject(frame, true);
        expect(hits.length, `blank ${i}: ${x},${z}`).toBeGreaterThan(0);
        const material = (hits[0]!.object as Mesh).material;
        for (const m of Array.isArray(material) ? material : [material]) {
          expect(m.name).toBe("MAT_PORT_METAL");
          expect(m.transparent).toBe(false);
          expect(m.opacity).toBe(1);
        }
      }
    expect(materialBounds(frame, "MAT_PORT_METAL").isEmpty()).toBe(false);
  }
  const frame = instance.object.getObjectByName("gpu_empty_slot_01")!;
  const gpu = instance.object.getObjectByName("gpu_01")!;
  const restFrame = frame.getWorldPosition(new Vector3());
  const restGpu = gpu.getWorldPosition(new Vector3());
  for (const factor of [0.1, 0.3, 0.6, 1, 0]) {
    setExplodeFactor(instance, factor);
    const frameDelta = frame.getWorldPosition(new Vector3()).sub(restFrame);
    const gpuDelta = gpu.getWorldPosition(new Vector3()).sub(restGpu);
    expect(frameDelta.distanceTo(gpuDelta)).toBeLessThan(1e-7);
  }
});

it("populates front, central, rear and side board regions with varied decorative electronics", () => {
  for (const name of ["system_board", "gpu_baseboard"]) {
    const board = source.getObjectByName(name)!;
    const pcb = materialBounds(board, "MAT_BOARD_GREEN");
    const size = pcb.getSize(new Vector3());
    const cells = new Set<string>();
    const kinds = new Set<string>();
    let components = 0;
    const occupied: Array<[string, Box3]> = [];
    board.traverse(node => {
      if (typeof node.userData.decorativeKind !== "string") return;
      components++;
      kinds.add(node.userData.decorativeKind);
      const bounds = new Box3().setFromObject(node);
      occupied.push([node.name, bounds]);
      const center = bounds.getCenter(new Vector3());
      if (node.userData.decorativeKind === "capacitor") {
        const hits = new Raycaster(new Vector3(center.x, bounds.max.y + 0.001, center.z), new Vector3(0, -1, 0)).intersectObject(node, true);
        expect(hits.length, `${node.name} solid top`).toBeGreaterThan(0);
        expect(hits[0]!.face!.normal.clone().transformDirection(hits[0]!.object.matrixWorld).y, `${node.name} outward top`).toBeGreaterThan(0.9);
      }
      cells.add(`${Math.floor(3 * (center.x - pcb.min.x) / size.x)},${Math.floor(4 * (center.z - pcb.min.z) / size.z)}`);
    });
    occupied.forEach(([name, bounds], i) => {
      for (const [other, otherBounds] of occupied.slice(i + 1)) {
        // Cable endpoints intentionally enter their own connector housings.
        if ((name.endsWith("_cable") && other.includes("_header_")) || (other.endsWith("_cable") && name.includes("_header_"))) continue;
        expect(bounds.intersectsBox(otherBounds), `${name}/${other}`).toBe(false);
      }
    });
    expect(components, name).toBeGreaterThanOrEqual(28);
    expect(kinds).toEqual(new Set(["ic", "regulator", "capacitor", "resistor", "header", "cable"]));
    // Broad coverage, not a few isolated clusters or a count padded in one corner.
    expect(cells.size, name).toBeGreaterThanOrEqual(9);
    for (let row = 0; row < 4; row++)
      expect([...cells].some(cell => cell.endsWith(`,${row}`)), `${name} depth band ${row}`).toBe(true);
  }
});

it("keeps decorative board details clear, non-interactive and rigidly attached to their owning boards", () => {
  for (const server of ["SERVER-01", "SERVER-02"]) {
    const instance = createModelInstance(source, server);
    const blockers: Object3D[] = [];
    instance.object.traverse(node => {
      if (/^(cpu_[ab]|dimm_[ab]\d{2}|gpu_0[1-4]|gpu_mount_0[1-4]|gpu_empty_slot_0[1-4]|fan_module_\d{2}|nvlink_bridge_4way|nic_.*adapter.*|front_backplane|boss_.*|front_drive_\d{2}|rear_psu_0[1-8]|top_cover)$/.test(node.name)) blockers.push(node);
    });
    for (const boardName of ["system_board", "gpu_baseboard"]) {
      const board = instance.object.getObjectByName(boardName)!;
      const green = materialBounds(board, "MAT_BOARD_GREEN");
      for (let i = 1; i <= 2; i++) {
        const details = instance.object.getObjectByName(`${boardName}_details_0${i}`);
        expect(details, `${server}/${boardName}/${i}`).toBeDefined();
        expect(details!.parent).toBe(board);
        expect(details!.userData.selectable).toBe(false);
        expect(details!.userData.focusable).toBe(false);
        const bounds = new Box3().setFromObject(details!);
        expect(bounds.min.y).toBeCloseTo(green.max.y, 5);
        expect(bounds.max.y - green.max.y).toBeLessThan(0.006);
        expect(bounds.min.x).toBeGreaterThan(green.min.x);
        expect(bounds.max.x).toBeLessThan(green.max.x);
        expect(bounds.min.z).toBeGreaterThan(green.min.z);
        expect(bounds.max.z).toBeLessThan(green.max.z);

        const rest = new Map<Object3D, number[]>();
        details!.traverse(node => {
          expect(node.userData.selectable).not.toBe(true);
          expect(node.userData.focusable).not.toBe(true);
          expect(node.userData.logicalAssetId).toBeNull();
          expect([...instance.componentRegistry.values()]).not.toContain(node);
          rest.set(node, [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]);
        });
        const offset = details!.getWorldPosition(new Vector3()).sub(board.getWorldPosition(new Vector3()));
        const boardRest = board.getWorldPosition(new Vector3());
        for (const factor of [...Array.from({ length: 101 }, (_, step) => step / 100), 0]) {
          setExplodeFactor(instance, factor);
          animateModelCover(instance, 0, 1, factor);
          instance.object.updateMatrixWorld(true);
          const blocked = blockers.map(node => ({ name: node.name, bounds: new Box3().setFromObject(node) }));
          details!.traverse(part => {
            if (!(part instanceof Mesh)) return;
            const movedBounds = new Box3().setFromObject(part, true);
            const collision = blocked.find(blocker => movedBounds.intersectsBox(blocker.bounds));
            expect(collision?.name, `${part.name} clearance at ${factor}`).toBeUndefined();
          });
          expect(details!.getWorldPosition(new Vector3()).sub(board.getWorldPosition(new Vector3())).distanceTo(offset)).toBeLessThan(1e-7);
          rest.forEach((transform, node) => expect([...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]).toEqual(transform));
          if (factor === 1) expect(board.getWorldPosition(new Vector3()).y - boardRest.y).toBeCloseTo(boardName === "system_board" ? 0.63 : 0, 7);
        }
        expect(board.getWorldPosition(new Vector3())).toEqual(boardRest);
      }
    }
  }
});

it("keeps every lifted component on its assembled vertical axis and CPU/RAM within the board footprint", () => {
  const instance = createModelInstance(source, "SERVER-01");
  const lifted: Object3D[] = [];
  instance.object.traverse(n => {
    if (/^(gpu_0[1-4]|gpu_mount_0[1-4]|gpu_empty_slot_0[1-4]|cpu_[ab](_heatsink)?|dimm_[ab]\d{2}|system_board|upper_tray|nvlink_bridge_4way|fan_module_1[3-6])$/.test(n.name)) lifted.push(n);
  });
  const rests = lifted.map(node => ({ node, world: node.getWorldPosition(new Vector3()), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
  for (let step = 0; step <= 100; step++) {
    setExplodeFactor(instance, step / 100);
    instance.object.updateMatrixWorld(true);
    const board = materialBounds(instance.object.getObjectByName("system_board")!, "MAT_BOARD_GREEN");
    for (const { node, world, quaternion, scale } of rests) {
      const moved = node.getWorldPosition(new Vector3());
      expect(moved.x, node.name).toBeCloseTo(world.x, 7);
      expect(moved.z, node.name).toBeCloseTo(world.z, 7);
      expect(moved.y).toBeGreaterThanOrEqual(world.y - 1e-7);
      expect(node.quaternion.toArray()).toEqual(quaternion.toArray());
      expect(node.scale).toEqual(scale);
      if (/^(cpu_|dimm_)/.test(node.name)) {
        const bounds = new Box3().setFromObject(node);
        expect(bounds.min.x, node.name).toBeGreaterThan(board.min.x);
        expect(bounds.max.x, node.name).toBeLessThan(board.max.x);
        expect(bounds.min.z, node.name).toBeGreaterThan(board.min.z);
        expect(bounds.max.z, node.name).toBeLessThan(board.max.z);
      }
    }
    const dimms = lifted.filter(n => n.name.startsWith("dimm_"));
    for (const socket of ["a", "b"])
      for (const dimm of dimms)
        expect(surfaceIntersectsBox(instance.object.getObjectByName(`cpu_${socket}_heatsink`)!, new Box3().setFromObject(dimm)), `${socket}/${dimm.name} ${step}% clearance`).toBe(false);
  }
});

it("adds copper heat transfer to each existing CPU heatsink within the closed upper level", () => {
  const cover = box(source, "top_cover");
  for (const socket of ["a", "b"]) {
    const cpu = source.getObjectByName(`cpu_${socket}`)!;
    const heatsink = source.getObjectByName(`cpu_${socket}_heatsink`)!;
    expect(heatsink.parent).toBe(cpu);
    const copper = materialBounds(heatsink, "MAT_CPU_COPPER");
    expect(copper.isEmpty()).toBe(false);
    expect(materialBounds(heatsink, "MAT_HEATSINK").isEmpty()).toBe(false);
    const cap = materialBounds(cpu, "MAT_CPU_CAP");
    expect(copper.min.y).toBeCloseTo(cap.max.y, 5);
    expect(new Box3().setFromObject(heatsink).max.y).toBeLessThan(cover.min.y);
  }
});

it("removes detached redundant side panels while retaining the outer chassis", () => {
  expect(!!source.getObjectByName("pcie_support_left")).toBe(false);
  expect(!!source.getObjectByName("pcie_support_right")).toBe(false);
  const instance = createModelInstance(source, "SERVER-01");
  const chassis = box(instance.object, "chassis_shell");
  setExplodeFactor(instance, 1);
  expect(box(instance.object, "chassis_shell")).toEqual(chassis);
  expect(chassis.getSize(new Vector3()).x).toBeCloseTo(0.445, 5);
});

it("has two broad stepped front radiators connected to their CPU bases with six fixings each", () => {
  for (const socket of ["a", "b"]) {
    const heatsink = source.getObjectByName(`cpu_${socket}_heatsink`)!;
    const cpu = source.getObjectByName(`cpu_${socket}`)!;
    const center = cpu.getWorldPosition(new Vector3());
    const bounds = new Box3().setFromObject(heatsink);
    expect(bounds.getSize(new Vector3()).x).toBeGreaterThan(0.16);
    expect(bounds.max.z).toBeGreaterThan(box(source, `dimm_${socket}01`).max.z + 0.08);
    // +Z is physical front. Two widths of the T must contain actual fin surfaces.
    for (const [dx, dz] of [[0, 0.17], [0.075, 0.12], [-0.075, 0.12]] as const)
      expect(new Raycaster(new Vector3(center.x + dx, 0.18, center.z + dz), new Vector3(0, -1, 0)).intersectObject(heatsink, true).length).toBeGreaterThan(0);
    expect(new Raycaster(new Vector3(center.x + 0.075, 0.18, center.z + 0.17), new Vector3(0, -1, 0)).intersectObject(heatsink, true)).toHaveLength(0);
    const copper = materialBounds(heatsink, "MAT_CPU_COPPER");
    expect(copper.max.z).toBeGreaterThan(center.z + 0.12);
    expect(copper.min.z).toBeLessThan(center.z - 0.03);
    expect(heatsink.children.filter(n => n.name.includes("screw"))).toHaveLength(6);
    const pipes = heatsink.getObjectByName(`${heatsink.name}_pipes`) as Mesh;
    const contactY = materialBounds(cpu, "MAT_CPU_CAP").max.y;
    expect(surfaceIntersectsBox(pipes, new Box3(
      new Vector3(center.x - 0.032, contactY, center.z - 0.040),
      new Vector3(center.x + 0.032, contactY + 0.0046, center.z + 0.040),
    )), "tube surfaces enter the CPU contact base").toBe(true);
    expect(surfaceIntersectsBox(pipes, new Box3(
      new Vector3(center.x - 0.087, contactY, center.z + 0.12),
      new Vector3(center.x + 0.087, contactY + 0.028, center.z + 0.14),
    )), "tube surfaces enter the remote fin stack").toBe(true);
    const positions = pipes.geometry.getAttribute("position");
    const indices = pipes.geometry.index!;
    const points = [new Vector3(), new Vector3(), new Vector3()] as const;
    let volume = 0;
    for (let i = 0; i < indices.count; i += 3) {
      points.forEach((p, j) => p.fromBufferAttribute(positions, indices.getX(i + j)));
      volume += points[0].dot(points[1].cross(points[2])) / 6;
    }
    expect(volume, "closed tubes must have outward-facing surfaces").toBeGreaterThan(0);
    expect(bounds.min.y).toBeGreaterThan(box(source, "system_board").max.y);
    for (const fan of [13, 14, 15, 16]) expect(bounds.intersectsBox(box(source, `fan_module_${fan}`))).toBe(false);
  }
  expect(box(source, "cpu_a_heatsink").intersectsBox(box(source, "cpu_b_heatsink"))).toBe(false);
});

it("moves each complete heatsink rigidly with only its CPU lift plus 100 mm, then restores both instances", () => {
  const first = createModelInstance(source, "SERVER-01");
  const second = createModelInstance(source, "SERVER-02");
  const untouched = box(second.object, "cpu_a_heatsink");
  for (const instance of [first, second]) {
    for (const socket of ["a", "b"]) {
      const sink = instance.object.getObjectByName(`cpu_${socket}_heatsink`)!;
      const rest = sink.getWorldPosition(new Vector3());
      const children: { node: Object3D; rest: Vector3 }[] = [];
      sink.traverse(node => children.push({ node, rest: node.getWorldPosition(new Vector3()) }));
      expect(instance.componentRegistry.get(`${instance === first ? "SERVER-01" : "SERVER-02"}.CPU-${socket.toUpperCase()}`)).toBe(sink.parent);
      setExplodeFactor(instance, 1);
      const delta = sink.getWorldPosition(new Vector3()).sub(rest);
      expect(delta.toArray()).toEqual([0, expect.closeTo(0.77, 6), 0]);
      for (const child of children)
        expect(child.node.getWorldPosition(new Vector3()).sub(child.rest).distanceTo(delta)).toBeLessThan(1e-7);
      setExplodeFactor(instance, 0);
      for (const child of children)
        expect(child.node.getWorldPosition(new Vector3()).distanceTo(child.rest)).toBeLessThan(1e-7);
    }
    expect(box(second.object, "cpu_a_heatsink")).toEqual(untouched);
  }
});
