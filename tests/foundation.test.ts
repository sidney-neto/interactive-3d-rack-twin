import { describe, expect, it } from "vitest";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";
import { StaticRackRepository } from "../src/data/repositories/StaticRackRepository";
import { StaticTelemetryProvider } from "../src/data/providers/StaticTelemetryProvider";
import {
  validateRackLayout,
  rackPositionY,
  rackPositionZ,
  rackSpan,
} from "../src/data/rackLayout";
import { mapModelNode } from "../src/three/interactions/modelNodeMapper";
import { createViewerStore, getViewerState } from "../src/store/viewerStore";

const repository = new StaticAssetRepository();
const rackRepository = new StaticRackRepository();

describe("static infrastructure data", () => {
  it("uses the same mounted depth for equipment and camera targets", async () => {
    const rack = (await rackRepository.getRack("RACK-01"))!;
    const server = (await repository.getAsset("SERVER-01"))!;
    const switchAsset = (await repository.getAsset("SWITCH-01"))!;
    if (server.type !== "server" || switchAsset.type !== "switch")
      throw new Error("Missing equipment");
    expect(rackPositionZ(server, rack)).toBeCloseTo(0.00522, 6);
    expect(rackPositionZ(switchAsset, rack)).toBeCloseTo(0.225, 6);
    expect(rackPositionZ(server, rack) + server.geometry.depth / 2).toBeCloseTo(
      0.455,
      6,
    );
    expect(
      rackPositionZ(switchAsset, rack) + switchAsset.geometry.depth / 2,
    ).toBeCloseTo(0.455, 6);
  });
  it("retrieves distinct instances and their owned components", async () => {
    const assets = await repository.listAssets();
    const first = await repository.getAsset("SERVER-01");
    const second = await repository.getAsset("SERVER-02");
    expect(first).toMatchObject({ rackPosition: { startU: 39, heightU: 4 } });
    expect(second).toMatchObject({ rackPosition: { startU: 35, heightU: 4 } });
    expect(assets.filter((a) => a.type === "server")).toHaveLength(2);
    expect(await repository.getAsset("SERVER-02.GPU-01")).toMatchObject({
      parentId: "SERVER-02",
      model: "NVIDIA H200",
    });
    expect(await repository.getAsset("missing")).toBeUndefined();
    const telemetry = await new StaticTelemetryProvider().getTelemetry(
      "SERVER-01",
    );
    expect(telemetry).toEqual({
      assetId: "SERVER-01",
      source: "static",
      available: false,
      measurements: {},
    });
  });

  it("positions whole assets by their bottom rack unit and rejects overlap/out-of-range units", async () => {
    const rack = await rackRepository.getRack("RACK-01");
    const assets = await repository.listAssets();
    if (!rack) throw new Error("Missing rack");
    expect(() => validateRackLayout(rack, assets)).not.toThrow();
    expect(rackSpan({ startU: 39, heightU: 4 }, 44)).toEqual({
      row: 3,
      span: 4,
    });
    expect(rackPositionY({ startU: 1, heightU: 1 }, rack)).toBeCloseTo(
      0.122225,
    );
    expect(rackPositionY({ startU: 39, heightU: 4 }, rack)).toBeCloseTo(
      1.877875,
    );
    const server = await repository.getAsset("SERVER-01");
    if (!server || !("rackPosition" in server))
      throw new Error("Missing server");
    expect(() =>
      validateRackLayout(rack, [...assets, { ...server, id: "overlap" }]),
    ).toThrow(/overlap/i);
    expect(() =>
      validateRackLayout(rack, [
        { ...server, rackPosition: { startU: 43, heightU: 4 } },
      ]),
    ).toThrow(/range/i);
  });
});

describe("GLB logical identity adapter", () => {
  it("maps names, Blender extras, and safe parent fallbacks", () => {
    expect(mapModelNode("SERVER-01", "gpu_01")).toBe("SERVER-01.GPU-01");
    expect(mapModelNode("SERVER-02", "cpu_a")).toBe("SERVER-02.CPU-A");
    expect(mapModelNode("SERVER-01", "dimm_a01")).toBe("SERVER-01.DIMM-A01");
    expect(mapModelNode("SERVER-01", "nic_100g_01")).toBe(
      "SERVER-01.NIC-100G-01",
    );
    expect(
      mapModelNode("SERVER-01", "arbitrary", {
        assetSlot: "GPU-04",
        selectable: true,
      }),
    ).toBe("SERVER-01.GPU-04");
    expect(
      mapModelNode("SERVER-01", "gpu_01", { selectable: false }),
    ).toBeNull();
    expect(mapModelNode("SERVER-01", "chassis")).toBe("SERVER-01");
    expect(mapModelNode("SERVER-01", "other", { assetSlot: "../../BAD" })).toBe(
      "SERVER-01",
    );
  });
});

describe("viewer transitions", () => {
  async function setup() {
    return createViewerStore(await repository.listAssets());
  }

  it("runs the guarded selection/extraction/open/component/explosion/reset flow", async () => {
    const store = await setup();
    const action = store.getState();
    expect(getViewerState(store.getState())).toBe("RACK_VIEW");
    action.openServer();
    expect(store.getState().serverOpen).toBe(false);
    action.selectServer("SERVER-01");
    expect(getViewerState(store.getState())).toBe("SERVER_SELECTED");
    action.enterExplodedView();
    expect(store.getState().explodedView).toBe(false);
    action.extractServer();
    expect(getViewerState(store.getState())).toBe("SERVER_EXTRACTED");
    action.openServer();
    expect(getViewerState(store.getState())).toBe("SERVER_OPEN");
    action.selectComponent("SERVER-02.GPU-01");
    expect(store.getState().selectedComponentId).toBeNull();
    action.selectComponent("SERVER-01.GPU-01");
    expect(getViewerState(store.getState())).toBe("COMPONENT_SELECTED");
    action.enterExplodedView();
    expect(getViewerState(store.getState())).toBe("EXPLODED_VIEW");
    action.exitExplodedView();
    expect(getViewerState(store.getState())).toBe("SERVER_OPEN");
    action.closeServer();
    expect(getViewerState(store.getState())).toBe("SERVER_EXTRACTED");
    action.returnServer();
    expect(getViewerState(store.getState())).toBe("SERVER_SELECTED");
    action.resetViewer();
    expect(getViewerState(store.getState())).toBe("RACK_VIEW");
    expect(store.getState()).toMatchObject({
      selectedAssetId: null,
      serverOpen: false,
      serverExtracted: false,
      explodedView: false,
      servers: {},
    });
  });

  it("preserves sibling state and ignores invalid asset and server IDs", async () => {
    const store = await setup();
    const action = store.getState();
    action.selectServer("SERVER-01");
    action.extractServer();
    action.openServer();
    action.selectServer("SERVER-02");
    expect(store.getState().serverOpen).toBe(false);
    action.extractServer();
    action.returnServer();
    action.selectServer("SERVER-01");
    expect(store.getState()).toMatchObject({
      serverOpen: true,
      serverExtracted: true,
    });
    action.selectAsset("invalid");
    action.selectServer("SWITCH-01");
    expect(store.getState().selectedServerId).toBe("SERVER-01");
    action.selectAsset("SWITCH-01");
    expect(store.getState()).toMatchObject({
      selectedAssetId: "SWITCH-01",
      selectedServerId: null,
      serverOpen: false,
    });
    action.clearSelection();
    expect(store.getState().selectedAssetId).toBeNull();
  });
});
