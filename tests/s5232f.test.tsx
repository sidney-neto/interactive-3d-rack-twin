import { fireEvent, render, screen } from "@testing-library/react";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from "three";
import { expect, it } from "vitest";
import { mapModelNode } from "../src/three/interactions/modelNodeMapper";
import { createModelInstance } from "../src/three/models/modelInstance";
import { resolveComponentRoot } from "../src/three/interactions/componentRegistry";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";
import { createViewerStore } from "../src/store/viewerStore";
import { selectAssetHit } from "../src/three/interactions/assetHitSelection";
import { InfrastructureProvider } from "../src/data/InfrastructureProvider";
import { RackUnitMap } from "../src/components/rack-map/RackUnitMap";
import { InspectorPanel } from "../src/components/inspector/InspectorPanel";
import { ViewModes } from "../src/components/layout/ViewModes";
import { ViewerToolbar } from "../src/components/layout/ViewerToolbar";

it.each([
  ["SWITCH-01", "qsfp28_01", "PORT-01"],
  ["SWITCH-02", "qsfp28_32", "PORT-32"],
  ["SWITCH-01", "sfpplus_02", "SFPPLUS-02"],
  ["SWITCH-02", "fan_module_04", "FAN-04"],
  ["SWITCH-01", "psu_01", "PSU-01"],
  ["SWITCH-02", "mgmt_rj45", "MGMT"],
  ["SWITCH-01", "console_rj45", "CONSOLE-RJ45"],
  ["SWITCH-01", "console_microusb", "CONSOLE-MICROUSB"],
  ["SWITCH-01", "usb_type_a", "USB-A"],
])("maps %s %s to %s", (id, node, slot) => {
  expect(mapModelNode(id, node)).toBe(`${id}.${slot}`);
});

it("templates exact physical inventories and retains rack positions and one model URL", async () => {
  const repository = new StaticAssetRepository();
  const assets = await repository.listAssets();
  for (const [id, startU] of [["SWITCH-01", 44], ["SWITCH-02", 43]] as const) {
    expect(await repository.getAsset(id)).toMatchObject({
      rackPosition: { startU, heightU: 1 },
      geometry: { width: 0.434, depth: 0.46, height: 0.0436, modelUrl: "/assets/models/switches/powerswitch-s5232f-on.glb" },
      airflowMode: "unspecified",
    });
    const children = assets.filter(a => a.type === "component" && a.parentId === id);
    expect(children).toHaveLength(44);
    for (const [prefix, count] of [["PORT-", 32], ["SFPPLUS-", 2], ["PSU-", 2], ["FAN-", 4]] as const)
      expect(children.filter(a => a.id.startsWith(`${id}.${prefix}`))).toHaveLength(count);
    expect(await repository.getAsset(`${id}.PORT-17`)).toMatchObject({ status: "unknown", specifications: { speedGbps: 100, location: "I/O_SIDE" } });
    expect(await repository.getAsset(`${id}.MGMT`)).toMatchObject({ specifications: { speed: "10/100/1000 Base-T", location: "PSU_SIDE" } });
  }
});

it("selects the switch first and keeps cloned port/component identities and highlights isolated", async () => {
  const assets = await new StaticAssetRepository().listAssets();
  const catalog = new Map(assets.map(a => [a.id, a]));
  const store = createViewerStore(assets);
  const source = new Group();
  for (const name of ["qsfp28_10", "psu_01", "fan_module_04", "mgmt_rj45"]) {
    const root = new Group(); root.name = name; root.userData.selectable = true;
    root.add(new Mesh(new BoxGeometry(0.02, 0.01, 0.01), new MeshStandardMaterial()));
    source.add(root);
  }
  const first = createModelInstance(source, "SWITCH-01");
  const second = createModelInstance(source, "SWITCH-02");
  const port = first.componentRegistry.get("SWITCH-01.PORT-10")!;
  expect(port).toBeDefined();
  expect(resolveComponentRoot(port.children[0]!, first.componentRegistry)).toBe(port);
  selectAssetHit(port.children[0]!, "SWITCH-01", catalog, store);
  expect(store.getState()).toMatchObject({ selectedAssetId: "SWITCH-01", selectedComponentId: null, cameraMode: "focus" });
  store.getState().setComponentIds("SWITCH-01", [...first.componentRegistry.keys()]);
  expect(store.getState().componentIdsByServer["SWITCH-01"]).toHaveLength(4);
  for (const slot of ["PORT-10", "PSU-01", "FAN-04", "MGMT"]) {
    store.getState().selectComponent(`SWITCH-01.${slot}`);
    expect(store.getState()).toMatchObject({ selectedComponentId: `SWITCH-01.${slot}`, selectedServerId: null, serverOpen: false });
    store.getState().selectComponent(`SWITCH-02.${slot}`);
    expect(store.getState().selectedComponentId).toBe(`SWITCH-01.${slot}`);
    expect(second.componentRegistry.has(store.getState().selectedComponentId!)).toBe(false);
    const a = first.componentRegistry.get(`SWITCH-01.${slot}`)!;
    const b = second.componentRegistry.get(`SWITCH-02.${slot}`)!;
    expect(a).not.toBe(b);
    expect((a.children[0] as Mesh).material).toBe((b.children[0] as Mesh).material);
    expect(((b.children[0] as Mesh).material as MeshStandardMaterial).emissive.getHex()).toBe(0);
  }
  expect(source.children[0]!.userData.logicalAssetId).toBeUndefined();
});

it("lists ports, inspects QSFP/SFP/management, preserves map selection and offers both sides", async () => {
  render(<InfrastructureProvider><RackUnitMap /><InspectorPanel /><ViewerToolbar /><ViewModes /></InfrastructureProvider>);
  const first = await screen.findByRole("button", { name: /select SWITCH-01/i });
  fireEvent.click(first);
  expect(screen.getByRole("button", { name: "Components" })).toBeEnabled();
  expect(screen.queryByText("Select a server first")).not.toBeInTheDocument();
  expect(screen.getByText("434 × 460 × 43.6 mm")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Front / I/O" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rear / PSU" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Port 17" }));
  expect(screen.getByRole("heading", { name: "Port 17" })).toBeInTheDocument();
  expect(screen.getByText("100 Gbps")).toBeInTheDocument();
  expect(first).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "Extract server" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Back to switch/ }));
  fireEvent.click(screen.getByRole("button", { name: "SFP+ Port 2" }));
  expect(screen.getByText("10 Gbps")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Back to switch/ }));
  fireEvent.click(screen.getByRole("button", { name: "Out-of-Band Management" }));
  expect(screen.getByText("10/100/1000 Base-T")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /select SWITCH-02/i }));
  expect(first).toHaveAttribute("aria-pressed", "false");
});
