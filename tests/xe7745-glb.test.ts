import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import { createModelInstance } from "../src/three/models/modelInstance";

it("exports a meter-scale Y-up full server with named internals and a lightweight envelope", async () => {
  const path = resolve("public/assets/models/servers/poweredge-xe7745.glb");
  expect(
    existsSync(path),
    "Generate the XE7745 GLB before running asset checks",
  ).toBe(true);
  const file = readFileSync(path);
  expect(file.byteLength).toBeLessThan(5_000_000);
  const json = JSON.parse(
    file.subarray(20, 20 + file.readUInt32LE(12)).toString(),
  );
  expect(json.scenes).toHaveLength(1);
  expect(
    json.nodes.some((node: { name: string }) =>
      ["Cube", "Camera", "Light"].includes(node.name),
    ),
  ).toBe(false);
  const { scene } = await new GLTFLoader().parseAsync(
    Uint8Array.from(file).buffer,
    "",
  );
  const ray = new Raycaster(new Vector3(0, 0, 1), new Vector3(0, 0, -1));
  for (const id of ["SERVER-01", "SERVER-02"]) {
    const instance = createModelInstance(scene, id, true);
    const hit = ray.intersectObject(instance.object, true)[0];
    expect(hit?.object.userData.logicalAssetId).toBe(id);
  }
  const bounds = new Box3().setFromObject(scene);
  const size = bounds.getSize(new Vector3());
  expect(size.x).toBeCloseTo(0.482, 5);
  expect(size.y).toBeCloseTo(0.1743, 5);
  expect(size.z).toBeCloseTo(0.89956, 5);
  expect(bounds.min.y).toBeCloseTo(0, 5);
  expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0, 5);
  expect(scene.getObjectByName("XE7745_ROOT")?.userData).toMatchObject({
    assetType: "server",
    model: "PowerEdge XE7745",
    formFactor: "4U",
    selectable: true,
    modelSection: "2.2-full",
  });
  expect(scene.getObjectByName("top_cover")?.userData).toMatchObject({
    interactionRole: "cover",
    movable: true,
    selectable: false,
  });
  const bezel = scene.getObjectByName("front_bezel");
  expect(bezel?.userData).toMatchObject({
    assetType: "server-bezel",
    interactionRole: "bezel",
    movable: true,
    selectable: false,
  });
  expect(bezel?.children.length).toBeGreaterThan(0);
  expect(scene.getObjectByName("front_frame")?.parent).not.toBe(bezel);
  expect(scene.getObjectByName("top_cover")?.parent).not.toBe(bezel);
  for (const name of [
    "rack_ear_left",
    "rack_ear_right",
    "front_boss_n1",
    "front_control_left",
    "front_control_right",
    "rear_idrac",
    "rear_usb_01",
    "rear_usb_02",
    "rear_vga",
    "rear_pcie_region",
  ])
    expect(scene.getObjectByName(name), name).toBeDefined();
  for (let index = 1; index <= 8; index++) {
    const suffix = String(index).padStart(2, "0");
    const drive = scene.getObjectByName(`front_drive_${suffix}`)!;
    const psu = scene.getObjectByName(`rear_psu_${suffix}`)!;
    expect(drive?.userData).toMatchObject({
      assetType: "drive-bay",
      slot: `SSD-${suffix}`,
      location: "front",
      selectable: true,
      focusable: true,
      explodable: true,
      explodeGroup: "front-storage",
    });
    expect(psu?.userData.slot).toBe(`PSU-${suffix}`);
    expect(drive.getWorldPosition(new Vector3()).z).toBeGreaterThan(0.4);
    expect(psu.getWorldPosition(new Vector3()).z).toBeLessThan(-0.35);
  }
  for (const [speed, count] of [
    ["25G", 2],
    ["100G", 4],
  ] as const)
    for (let index = 1; index <= count; index++) {
      const suffix = String(index).padStart(2, "0");
      expect(
        scene.getObjectByName(`rear_nic_${speed.toLowerCase()}_${suffix}`)
          ?.userData,
      ).toMatchObject({
        assetType: "network-port",
        speed,
        slot: `NIC-${speed}-${suffix}`,
      });
    }
  const gpuSlots = [21, 23, 25, 27];
  const gpuPositions: Vector3[] = [];
  const gpuRoots = json.nodes.filter((node: { name: string }) =>
    /^gpu_\d{2}$/.test(node.name),
  );
  expect(gpuRoots).toHaveLength(4);
  for (let index = 1; index <= 4; index++) {
    const suffix = String(index).padStart(2, "0");
    const gpu = scene.getObjectByName(`gpu_${suffix}`)!;
    expect(gpu.userData).toMatchObject({
      assetType: "gpu",
      slot: `GPU-${suffix}`,
      physicalSlot: gpuSlots[index - 1],
      selectable: true,
      focusable: true,
      explodable: true,
      explodeGroup: "gpu",
    });
    expect(gpu.parent?.name).toBe("gpu_zone");
    gpuPositions.push(gpu.getWorldPosition(new Vector3()));
  }
  expect(gpuPositions.every((position) => position.x < 0.02)).toBe(true);
  expect(gpuPositions.map(({ x }) => x)).toEqual([...gpuPositions].map(({ x }) => x).sort((a, b) => a - b));
  const bridgePosition = scene
    .getObjectByName("nvlink_bridge_4way")!
    .getWorldPosition(new Vector3());
  expect(bridgePosition.x).toBeCloseTo(
    [1, 2, 3, 4].reduce((sum, i) => sum + scene.getObjectByName(`gpu_0${i}_nvlink_socket`)!.getWorldPosition(new Vector3()).x, 0) / 4,
    5,
  );
  expect(bridgePosition.y).toBeGreaterThan(
    Math.max(...gpuPositions.map(({ y }) => y)),
  );
  expect(scene.getObjectByName("nvlink_bridge_4way")?.userData).toMatchObject({
    interactionRole: "nvlink-bridge",
    selectable: true,
    slot: "NVLINK-01",
    explodable: true,
    physicalSlots: [21, 23, 25, 27],
  });
  expect(scene.getObjectByName("nvlink_bridge_4way")?.parent?.name).toBe(
    "gpu_zone",
  );

  expect(
    json.nodes.filter((node: { name: string }) => /^cpu_[ab]$/.test(node.name)),
  ).toHaveLength(2);
  for (const socket of ["a", "b"] as const) {
    const cpu = scene.getObjectByName(`cpu_${socket}`)!;
    const heatsink = scene.getObjectByName(`cpu_${socket}_heatsink`)!;
    expect(cpu.userData).toMatchObject({
      assetType: "cpu",
      slot: `CPU-${socket.toUpperCase()}`,
      selectable: true,
      focusable: true,
      explodable: true,
      explodeGroup: "cpu",
    });
    expect(cpu.parent?.name).toBe("cpu_zone");
    expect(heatsink.parent).toBe(cpu);
    expect(heatsink.userData).toMatchObject({
      interactionRole: "heatsink",
      explodable: true,
    });
    expect(heatsink.userData).not.toHaveProperty("selectable");
  }
  expect(
    json.nodes.filter((node: { name: string }) =>
      /^dimm_[ab]\d{2}$/.test(node.name),
    ),
  ).toHaveLength(24);
  for (const socket of ["a", "b"] as const)
    for (let index = 1; index <= 12; index++) {
      const suffix = String(index).padStart(2, "0");
      expect(scene.getObjectByName(`dimm_${socket}${suffix}`)?.userData).toMatchObject({
        assetType: "memory",
        slot: `DIMM-${socket.toUpperCase()}${suffix}`,
        selectable: true,
        focusable: true,
        explodable: true,
        explodeGroup: `memory-${socket}`,
      });
    }

  expect(scene.getObjectByName("boss_n1")?.userData).toMatchObject({
    assetType: "storage-controller",
    slot: "BOSS",
    selectable: true,
    focusable: true,
    explodable: true,
    explodeGroup: "boss",
  });
  for (let index = 1; index <= 2; index++) {
    const suffix = String(index).padStart(2, "0");
    const m2 = scene.getObjectByName(`boss_m2_${suffix}`)!;
    expect(m2.userData).toMatchObject({
      assetType: "drive",
      slot: `BOSS-M2-${suffix}`,
      location: "internal",
      selectable: true,
      focusable: true,
      explodable: true,
      explodeGroup: "boss-m2",
    });
    expect(m2.parent?.name).toBe("boss_n1");
    expect(m2.getWorldPosition(new Vector3()).z).toBeGreaterThan(0.25);
    expect(m2.getWorldPosition(new Vector3()).z).toBeLessThan(0.4);
  }
  expect(
    json.nodes.filter((node: { name: string }) =>
      /^front_drive_\d{2}$/.test(node.name),
    ),
  ).toHaveLength(8);
  expect(
    json.nodes.some((node: { name: string }) =>
      /^internal_ssd_/.test(node.name),
    ),
  ).toBe(false);
  expect(
    json.nodes.filter((node: { name: string }) =>
      /^fan_module_\d{2}$/.test(node.name),
    ),
  ).toHaveLength(16);
  for (const name of [
    "internals",
    "internal_chassis",
    "system_board",
    "cpu_zone",
    "memory",
    "gpu_zone",
    "storage",
    "front_storage_backplane",
    "boss_n1",
    "cooling",
    "network",
    "nic_25g_adapter",
    "nic_100g_adapter_01",
    "nic_100g_adapter_02",
    "pcie",
  ])
    expect(scene.getObjectByName(name), name).toBeDefined();
  for (const name of ["rear_nic_25g_01", "rear_nic_25g_02"])
    expect(scene.getObjectByName(name)?.parent?.name).toBe("nic_25g_adapter");
  for (let index = 1; index <= 4; index++)
    expect(
      scene.getObjectByName(`rear_nic_100g_0${index}`)?.parent?.name,
    ).toBe(`nic_100g_adapter_0${Math.ceil(index / 2)}`);
  const names = new Set<string>();
  // Exported logical nodes are unique. GLTFLoader may repeat primitive names
  // beneath separate roots when four GPU objects share the same mesh resource.
  for (const node of json.nodes) {
    expect(names.has(node.name), node.name).toBe(false);
    names.add(node.name);
  }
  let triangles = 0;
  scene.traverse((node) => {
    expect(node.userData).not.toHaveProperty("temperature");
    if (node instanceof Mesh) {
      triangles +=
        (node.geometry.index?.count ??
          node.geometry.attributes.position.count) / 3;
      expect(node.material).toBeDefined();
    }
  });
  expect(triangles).toBeGreaterThan(100);
  expect(triangles).toBeLessThan(50_000);
});
