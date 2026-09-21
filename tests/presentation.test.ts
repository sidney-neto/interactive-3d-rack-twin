import { expect, it } from "vitest";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";
import { buildPresentation, createPresentation, PRESENTATION_TIMING } from "../src/presentation/presentation";
import { createViewerStore, dockedServer, serviceSignature } from "../src/store/viewerStore";
import { isEquipment } from "../src/types/assets";

it("visits every loaded component once in deterministic equipment order and preserves physical port counts", async () => {
  const assets = await new StaticAssetRepository().listAssets();
  const components = assets.filter(a => a.type === "component");
  const ids: Record<string, string[]> = {};
  for (const a of components) (ids[a.parentId] ??= []).push(a.id);
  const { steps, notices } = buildPresentation(assets, "RACK-01", ids);
  expect(notices).toEqual([]);
  expect(steps.filter(s => s.componentId).map(s => s.componentId).sort()).toEqual(components.map(a => a.id).sort());
  expect(steps).toEqual(buildPresentation([...assets].reverse(), "RACK-01", ids).steps);
  expect([...new Set(steps.filter(s => s.assetId !== "RACK-01").map(s => s.assetId))]).toEqual(["SERVER-01", "SERVER-02", "SWITCH-01", "SWITCH-02"]);
  for (const id of ["SWITCH-01", "SWITCH-02"]) {
    expect(steps.filter(s => s.componentId?.startsWith(`${id}.PORT-`))).toHaveLength(32);
    expect(steps.filter(s => s.componentId?.startsWith(`${id}.SFPPLUS-`))).toHaveLength(2);
  }
  expect(steps[0]?.phase).toBe("Rack overview");
  expect(steps.at(-1)?.phase).toBe("Rack overview");
});

async function fixture() {
  const assets = await new StaticAssetRepository().listAssets();
  const viewer = createViewerStore(assets);
  const equipment = assets.filter(isEquipment);
  for (const a of equipment) {
    viewer.getState().reportModel(a.id, "ready");
    viewer.getState().setBezelAvailable(a.id, true);
    viewer.getState().setComponentIds(a.id, assets.filter(c => c.type === "component" && c.parentId === a.id).map(c => c.id));
  }
  const tour = createPresentation(viewer, assets, "RACK-01");
  tour.mode("detailed");
  let now = 0;
  const renderSettled = () => {
    const s = viewer.getState();
    for (const a of equipment) {
      const signature = serviceSignature(s.servers[a.id] ?? dockedServer);
      s.reportMotion(`${a.id}:model`, signature, true);
      if (a.type === "server") s.reportMotion(`${a.id}:body`, signature, true);
    }
    viewer.setState({ cameraSettledRevision: viewer.getState().cameraRevision });
  };
  const tick = (settle = true) => { now += 50; if (settle) renderSettled(); tour.tick(now); };
  return { assets, viewer, tour, tick, time: () => now };
}

it("finishes every step at 4× without skipping components and leaves both servers assembled", async () => {
  const f = await fixture();
  f.tour.speed(4); f.tour.play(0);
  const inspected = new Set<string>();
  for (let i = 0; i < 5000 && f.tour.state.getState().status !== "complete"; i++) {
    f.tick();
    const p = f.tour.state.getState();
    if (p.message === "Inspecting") {
      const step = p.steps[p.index]!;
      expect(f.viewer.getState().selectedAssetId).toBe(step.componentId ?? step.assetId);
      if (step.componentId) inspected.add(step.componentId);
    }
  }
  expect(f.tour.state.getState().status).toBe("complete");
  expect([...inspected].sort()).toEqual(f.assets.filter(a => a.type === "component").map(a => a.id).sort());
  expect(f.viewer.getState()).toMatchObject({ servers: {}, cameraMode: "free", selectedAssetId: null, presentationRate: 1, presentationPreparing: false });
});

it("builds an executive tour with one representative instance and one component per major category", async () => {
  const f = await fixture();
  const loaded = f.viewer.getState().componentIdsByServer;
  const result = buildPresentation(f.assets, "RACK-01", loaded, "executive");
  expect(result).toEqual(buildPresentation([...f.assets].reverse(), "RACK-01", loaded, "executive"));
  expect([...new Set(result.steps.map(s => s.assetId))]).toEqual(["RACK-01", "SERVER-01", "SWITCH-01"]);
  expect(result.steps.filter(s => s.orbitMs).map(s => s.assetId)).toEqual(["RACK-01", "SERVER-01", "SWITCH-01"]);
  const selected = result.steps.filter(s => s.componentId).map(s => f.assets.find(a => a.id === s.componentId));
  expect(selected.map(a => a?.type === "component" && a.assetType)).toEqual(["cpu", "memory", "gpu", "storage", "network"]);
  expect(result.steps.some(s => s.componentId?.startsWith("SWITCH-"))).toBe(false);
  expect(result.steps.find(s => s.phase === "Internal overview")?.pose?.exploded).toBe(true);
  expect(result.steps.at(-1)).toMatchObject({ assetId: "RACK-01", phase: "Rack overview" });
});

it("falls back to loaded representatives and replaces executive orbits with front/rear views for reduced motion", async () => {
  const f = await fixture();
  const loaded = { "SERVER-02": ["SERVER-02.GPU-01"], "SWITCH-02": ["SWITCH-02.PORT-01"] };
  const { steps } = buildPresentation(f.assets, "RACK-01", loaded, "executive", true);
  expect([...new Set(steps.map(s => s.assetId))]).toEqual(["RACK-01", "SERVER-02", "SWITCH-02"]);
  expect(steps.some(s => s.orbitMs)).toBe(false);
  for (const id of ["RACK-01", "SERVER-02", "SWITCH-02"]) {
    expect(steps.filter(s => s.assetId === id).map(s => s.side)).toEqual(expect.arrayContaining(["front", "rear"]));
  }
  expect(steps.filter(s => s.componentId).map(s => s.componentId)).toEqual(["SERVER-02.GPU-01"]);
  const absent = buildPresentation(f.assets, "RACK-01", {}, "executive");
  expect(absent.steps.filter(s => s.componentId)).toEqual([]);
  expect(absent.notices).toHaveLength(2);
  expect([...new Set(absent.steps.map(s => s.assetId))]).toEqual(["RACK-01", "SERVER-01", "SWITCH-01"]);
});

it("cancels executive orbit commands on stop and freezes their clock on pause", async () => {
  const f = await fixture(); f.tour.mode("executive"); f.tour.play(0);
  f.tick(); f.tick();
  expect(f.viewer.getState().cameraOrbitMs).toBeGreaterThan(0);
  f.tour.mode("detailed"); expect(f.tour.state.getState().mode).toBe("executive");
  f.tour.pause(); expect(f.viewer.getState().presentationPaused).toBe(true);
  f.tour.resume(f.time()); expect(f.viewer.getState().presentationPaused).toBe(false);
  f.tour.stop();
  expect(f.viewer.getState()).toMatchObject({ cameraOrbitMs: 0, presentationPaused: false });
  f.tour.play(f.time()); f.tick(); f.tick(); f.tour.dispose();
  expect(f.viewer.getState().cameraOrbitMs).toBe(0);
});

it("keeps the current service pose for manual component takeover while cancelling playback", async () => {
  const f = await fixture(); f.tour.mode("executive"); f.tour.play(0);
  const s = f.viewer.getState();
  s.selectServer("SERVER-01"); s.removeBezel(); s.extractServer(); s.openServer(); s.enterExplodedView();
  f.tour.pause(); f.tour.stop(false);
  s.selectComponent("SERVER-01.CPU-A"); s.setCamera("focus");
  expect(f.viewer.getState()).toMatchObject({ selectedComponentId: "SERVER-01.CPU-A", serverOpen: true, explodedView: true, presentationPaused: false, presentationPreparing: false, cameraOrbitMs: 0, presentationRate: 1 });
  const revision = f.viewer.getState().cameraRevision;
  for (let i = 0; i < 300; i++) f.tick();
  expect(f.viewer.getState().cameraRevision).toBe(revision);
});

it("frames the Executive service envelope before extraction and again before reassembly from a rear component", async () => {
  const f = await fixture(); f.tour.mode("executive"); f.tour.speed(4); f.tour.play(0);
  const waitForService = () => {
    for (let i = 0; i < 600 && !f.viewer.getState().cameraServiceView; i++) f.tick();
    expect(f.viewer.getState().cameraServiceView).toBe(true);
    expect(f.viewer.getState().presentationPreparing).toBe(false);
  };
  waitForService();
  expect(f.viewer.getState().servers["SERVER-01"] ?? dockedServer).toEqual(dockedServer);
  const before = f.viewer.getState().servers;
  for (let i = 0; i < 30; i++) f.tick(false);
  expect(f.viewer.getState().servers).toBe(before);
  f.tour.pause(); f.tick();
  expect(f.viewer.getState().servers).toBe(before);
  f.tour.resume(f.time()); f.tick();
  for (let i = 0; i < 50 && !f.viewer.getState().serverExtracted; i++) f.tick();
  expect(f.viewer.getState().serverExtracted).toBe(true);
  for (let i = 0; i < 600 && f.viewer.getState().cameraServiceView; i++) f.tick();
  for (let i = 0; i < 600 && !f.viewer.getState().selectedComponentId?.includes("NIC-"); i++) f.tick();
  expect(f.viewer.getState().selectedComponentId).toContain("NIC-");
  waitForService();
  expect(f.viewer.getState()).toMatchObject({ cameraSide: "front", serverExtracted: true, serverOpen: true, explodedView: true });
  const expanded = f.viewer.getState().servers;
  for (let i = 0; i < 30; i++) f.tick(false);
  expect(f.viewer.getState().servers).toBe(expanded);
  f.tour.stop();
  const revision = f.viewer.getState().cameraRevision;
  for (let i = 0; i < 300; i++) f.tick();
  expect(f.viewer.getState()).toMatchObject({ servers: {}, cameraServiceView: false, cameraRevision: revision });
});

it("guards repeated play, waits for real completion, pauses dwell, changes speed, resumes and restores the original view on stop", async () => {
  const f = await fixture();
  const s = f.viewer.getState();
  s.selectServer("SERVER-02"); s.removeBezel(); s.extractServer(); s.openServer(); s.enterExplodedView();
  s.selectComponent("SERVER-02.GPU-01"); s.setCamera("rear");
  const original = f.viewer.getState();
  f.tour.play(0); f.tick();
  f.tour.play(f.time());
  f.tick(false);
  expect(f.tour.state.getState().index).toBe(0);
  for (let i = 0; i < 50 && f.tour.state.getState().message !== "Moving camera"; i++) f.tick();
  for (let i = 0; i < 20; i++) f.tick(false);
  expect(f.tour.state.getState().message).toBe("Moving camera");
  f.tick();
  expect(f.tour.state.getState().message).toBe("Inspecting");
  f.tour.pause();
  for (let i = 0; i < 100; i++) f.tick();
  expect(f.tour.state.getState()).toMatchObject({ status: "paused", index: 0 });
  f.tour.speed(4); expect(f.viewer.getState().presentationRate).toBe(4);
  f.tour.speed(3); expect(f.tour.state.getState().speed).toBe(4);
  f.tour.resume(f.time());
  for (let i = 0; i < 8; i++) f.tick();
  expect(f.tour.state.getState().index).toBe(1);
  f.tour.stop();
  expect(f.viewer.getState()).toMatchObject({ selectedAssetId: original.selectedAssetId, selectedComponentId: original.selectedComponentId, selectedServerId: original.selectedServerId, servers: original.servers, cameraMode: original.cameraMode, viewerMode: original.viewerMode, presentationRate: original.presentationRate });
  const revision = f.viewer.getState().cameraRevision;
  for (let i = 0; i < 100; i++) f.tick();
  expect(f.viewer.getState().cameraRevision).toBe(revision);
});

it("times out unavailable loading and missing animation signals without hanging or claiming inspection", async () => {
  const f = await fixture();
  f.viewer.getState().reportModel("SERVER-01", "loading");
  f.tour.play(0);
  for (let i = 0; i < PRESENTATION_TIMING.loading / 50 - 1; i++) f.tick(false);
  expect(f.tour.state.getState().status).toBe("loading");
  f.tick(false);
  expect(f.tour.state.getState().steps.some(s => s.componentId?.startsWith("SERVER-01."))).toBe(false);
  expect(f.tour.state.getState().notices.join()).toContain("geometry unavailable");
  for (let i = 0; i < PRESENTATION_TIMING.settling / 50 + 1; i++) f.tick(false);
  expect(f.tour.state.getState().status).toBe("error");
  expect(f.viewer.getState()).toMatchObject({ selectedAssetId: null, presentationRate: 1 });
});

it("refocuses the same step after manual orbit and cancels on disposal", async () => {
  const f = await fixture(); f.tour.play(0);
  f.tick(); f.tick(); f.tick();
  const index = f.tour.state.getState().index;
  const revision = f.viewer.getState().cameraRevision;
  f.tour.pause();
  f.tour.pause("Manual orbit", true);
  f.tour.resume(f.time()); f.tick();
  expect(f.tour.state.getState().index).toBe(index);
  expect(f.viewer.getState().cameraRevision).toBeGreaterThan(revision);
  f.tour.dispose();
  const after = f.viewer.getState();
  f.tick(); expect(f.viewer.getState().cameraRevision).toBe(after.cameraRevision);
  expect(f.tour.state.getState().status).toBe("idle");
});

it("handles a previously removed bezel becoming unavailable without retrying its guarded action forever", async () => {
  const f = await fixture();
  f.viewer.getState().selectServer("SERVER-01");
  f.viewer.getState().removeBezel();
  f.viewer.getState().setBezelAvailable("SERVER-01", false);
  f.viewer.getState().reportModel("SERVER-01", "unavailable");
  f.tour.speed(4); f.tour.play(0);
  for (let i = 0; i < 600; i++) f.tick();
  expect(f.tour.state.getState().index).toBeGreaterThan(0);
  expect(f.tour.state.getState().steps.some(s => s.componentId?.startsWith("SERVER-01."))).toBe(false);
});

it("keeps parent overviews but explains unavailable geometry without claiming component coverage", async () => {
  const assets = await new StaticAssetRepository().listAssets();
  const { steps, notices } = buildPresentation(assets, "RACK-01", { "SWITCH-02": ["SWITCH-02.PORT-17", "unknown"] });
  expect(steps.filter(s => s.componentId).map(s => s.componentId)).toEqual(["SWITCH-02.PORT-17"]);
  expect(notices).toHaveLength(4);
  expect(steps.filter(s => s.phase === "Front exterior")).toHaveLength(2);
});
