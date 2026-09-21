import { createStore } from "zustand/vanilla";
import { isEquipment, type Asset, type ComponentAsset } from "../types/assets";
import { dockedServer, serviceSignature, type createViewerStore, type ViewerSnapshot } from "../store/viewerStore";
import type { ServerViewState } from "../types/viewer";

export const PRESENTATION_TIMING = { component: 1000, overview: 1500, orbit: 5000, loading: 12000, settling: 12000 };
type PresentationMode = "executive" | "detailed";
type Step = { assetId: string; componentId?: string; phase: string; side?: "front" | "rear"; pose?: ServerViewState; orbitMs?: number; summary?: string };
const expanded: ServerViewState = { bezelRemoved: true, extracted: true, open: true, exploded: true };
const groups = ["cpu", "memory", "gpu", "gpu-interconnect", "storage", "network", "power-supply", "fan-module"];
const groupNames: Record<string, string> = { cpu: "Processors", memory: "Memory", gpu: "GPUs", "gpu-interconnect": "GPU interconnect", storage: "Storage", network: "Network interfaces", "power-supply": "Power supplies", "fan-module": "Cooling", "network-port": "Data ports" };
const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function buildPresentation(assets: readonly Asset[], rackId: string, loadedIds: Record<string, readonly string[]>, mode: PresentationMode = "detailed", reducedMotion = false) {
  const steps: Step[] = [{ assetId: rackId, phase: "Rack overview" }];
  const notices: string[] = [];
  let equipment = assets.filter(isEquipment).filter(a => a.rackId === rackId)
    .sort((a, b) => (a.type === b.type ? natural(a.id, b.id) : a.type === "server" ? -1 : 1));
  const orbit = (step: Step) => {
    if (reducedMotion) steps.push({ ...step, phase: `${step.phase} · Front`, side: "front" }, { ...step, phase: `${step.phase} · Rear`, side: "rear" });
    else steps.push({ ...step, phase: `${step.phase} · 360°`, orbitMs: PRESENTATION_TIMING.orbit });
  };
  if (mode === "executive") {
    steps.length = 0;
    orbit({ assetId: rackId, phase: "Rack overview", summary: [...new Set(equipment.map(a => a.model))].join(" · ") });
    equipment = (["server", "switch"] as const).flatMap(type => {
      const candidates = equipment.filter(a => a.type === type);
      const preferred = `${type.toUpperCase()}-01`;
      const available = candidates.filter(a => loadedIds[a.id] !== undefined);
      const selected = available.find(a => a.id === preferred) ?? available[0] ?? candidates.find(a => a.id === preferred) ?? candidates[0];
      return selected ? [selected] : [];
    });
  }
  for (const asset of equipment) {
    const available = new Set(loadedIds[asset.id]);
    const inventory = assets.filter((a): a is ComponentAsset => a.type === "component" && a.parentId === asset.id);
    const components = inventory.filter(a => available.has(a.id));
    if (components.length < inventory.length) notices.push(`${asset.name}: ${inventory.length - components.length} components skipped — geometry unavailable.`);
    const overview = (phase: string, side: "front" | "rear") => steps.push({ assetId: asset.id, phase, side, pose: asset.type === "server" ? dockedServer : undefined });
    const component = (a: ComponentAsset) => steps.push({ assetId: asset.id, componentId: a.id, phase: groupNames[a.assetType] ?? "Management interfaces", pose: asset.type === "server" ? expanded : undefined });
    if (mode === "executive") {
      orbit({ assetId: asset.id, phase: "Exterior overview", pose: asset.type === "server" ? dockedServer : undefined });
      if (asset.type === "server") {
        if (components.length) {
          steps.push({ assetId: asset.id, phase: "Internal overview", pose: expanded });
          for (const category of ["cpu", "memory", "gpu", "storage", "network"]) {
            const representative = components.filter(c => c.assetType === category).sort((a, b) => natural(a.id, b.id))[0];
            if (representative) component(representative);
          }
          overview("Return to rack", "front");
        }
      } else {
        overview("Front / I/O", "front");
        steps[steps.length - 1]!.summary = `${asset.ports.quantity} × ${asset.ports.connector} · ${asset.ports.speedGbps} GbE / ${asset.additionalPorts.quantity} × ${asset.additionalPorts.connector} · ${asset.additionalPorts.speedGbps} GbE`;
        overview("Rear / PSU", "rear");
        steps[steps.length - 1]!.summary = `${asset.powerSupplies} power supplies · ${asset.fanModules} fan modules · ${asset.management}`;
      }
      continue;
    }
    overview(asset.type === "server" ? "Front exterior" : "Front / I/O", "front");
    if (asset.type === "server") {
      overview("Rear exterior", "rear");
      components.sort((a, b) => (groups.indexOf(a.assetType) < 0 ? groups.length : groups.indexOf(a.assetType)) - (groups.indexOf(b.assetType) < 0 ? groups.length : groups.indexOf(b.assetType)) || natural(a.id, b.id)).forEach(component);
      if (components.length) overview("Return to rack", "front");
    } else {
      components.filter(a => a.specifications?.location === "I/O_SIDE").sort((a, b) => natural(a.id, b.id)).forEach(component);
      overview("Rear / PSU", "rear");
      components.filter(a => a.specifications?.location !== "I/O_SIDE").sort((a, b) => {
        const rank = (c: ComponentAsset) => c.assetType === "power-supply" ? 0 : c.assetType === "fan-module" ? 1 : 2;
        return rank(a) - rank(b) || natural(a.id, b.id);
      }).forEach(component);
    }
  }
  steps.push({ assetId: rackId, phase: "Rack overview" });
  return { steps, notices };
}

type Status = "idle" | "loading" | "playing" | "paused" | "complete" | "error";
export function createPresentation(viewer: ReturnType<typeof createViewerStore>, assets: readonly Asset[], rackId: string) {
  const equipment = assets.filter(isEquipment).filter(a => a.rackId === rackId);
  const servers = equipment.filter(a => a.type === "server");
  const state = createStore(() => ({ status: "idle" as Status, mode: "executive" as PresentationMode, speed: 1, index: 0, steps: [] as Step[], notices: [] as string[], message: "", elapsedMs: 0 }));
  let snapshot: ViewerSnapshot | undefined;
  let stage: "prepare" | "camera" | "dwell" = "prepare";
  let waited = 0, remaining = 0, elapsed = 0, previous = 0;
  let pausedStatus: "loading" | "playing" = "playing";
  let reframe = false;
  let serviceServerId: string | undefined;
  const active = () => ["loading", "playing", "paused"].includes(state.getState().status);
  const restore = () => {
    if (snapshot) viewer.getState().restoreView(snapshot);
    snapshot = undefined;
  };
  const next = () => {
    const s = state.getState();
    if (s.index + 1 === s.steps.length) {
      viewer.getState().resetViewer();
      viewer.setState({ presentationRate: snapshot?.presentationRate ?? 1, presentationPreparing: false });
      snapshot = undefined;
      state.setState({ status: "complete", message: "Presentation complete", elapsedMs: elapsed });
    } else {
      stage = "prepare"; waited = 0; serviceServerId = undefined;
      viewer.setState({ presentationPreparing: true });
      state.setState({ index: s.index + 1, message: "Preparing view", elapsedMs: elapsed });
    }
  };
  const settled = () => {
    const s = viewer.getState();
    return equipment.every(a => {
      const pose = a.type === "server" ? s.servers[a.id] ?? dockedServer : dockedServer;
      const signature = serviceSignature(pose);
      const keys = [ ...(a.type === "server" ? [`${a.id}:body`] : []), ...(s.modelStatus[a.id] === "ready" ? [`${a.id}:model`] : []) ];
      return keys.every(key => s.motion[key]?.target === signature && s.motion[key]?.settled);
    });
  };
  // One existing service action at a time; target-specific renderer reports prevent stale completion.
  const prepareServers = (step: Step) => {
    const s = viewer.getState();
    for (const server of servers) {
      const current = s.servers[server.id] ?? dockedServer;
      const target = { ...(step.assetId === server.id ? step.pose ?? dockedServer : dockedServer) };
      if (!s.bezelAvailable[server.id]) target.bezelRemoved = current.bezelRemoved;
      if (serviceSignature(current) === serviceSignature(target)) continue;
      if (state.getState().mode === "executive") {
        if (serviceServerId !== server.id) {
          serviceServerId = server.id;
          s.selectServer(server.id);
          viewer.setState({ presentationPreparing: false });
          s.setCamera("focus", "front", 0, true);
          waited = 0;
          state.setState({ message: "Framing server service" });
          return false;
        }
        if (s.cameraSettledRevision !== s.cameraRevision) return false;
        // Keep the settled service envelope fixed while the existing actions run sequentially.
        if (!s.presentationPreparing) viewer.setState({ presentationPreparing: true });
      }
      s.selectServer(server.id);
      if (current.exploded && !target.exploded) s.exitExplodedView();
      else if (current.open && !target.open) s.closeServer();
      else if (current.extracted && !target.extracted) s.returnServer();
      else if (!current.bezelRemoved && target.bezelRemoved) s.removeBezel();
      else if (!current.extracted && target.extracted) s.extractServer();
      else if (!current.open && target.open) s.openServer();
      else if (!current.exploded && target.exploded) s.enterExplodedView();
      else if (current.bezelRemoved && !target.bezelRemoved) s.installBezel();
      if (serviceSignature(viewer.getState().servers[server.id] ?? dockedServer) !== serviceSignature(current)) waited = 0;
      return false;
    }
    return true;
  };
  const api = {
    state,
    mode(mode: PresentationMode) {
      if (!active() && ["executive", "detailed"].includes(mode)) state.setState({ mode, steps: [], notices: [], message: "", status: "idle" });
    },
    play(now = performance.now()) {
      if (active()) return;
      const s = viewer.getState();
      snapshot = { selectedAssetId: s.selectedAssetId, selectedServerId: s.selectedServerId, selectedComponentId: s.selectedComponentId, viewerMode: s.viewerMode, cameraMode: s.cameraMode, cameraSide: s.cameraSide, serverExtracted: s.serverExtracted, serverOpen: s.serverOpen, explodedView: s.explodedView, servers: s.servers, presentationRate: s.presentationRate };
      previous = now; elapsed = 0; waited = 0; reframe = false; stage = "prepare"; serviceServerId = undefined;
      viewer.setState({ presentationRate: state.getState().speed, presentationPreparing: true, presentationPaused: false });
      state.setState({ status: "loading", steps: [], notices: [], index: 0, elapsedMs: 0, message: "Waiting for models" });
    },
    pause(message = "Paused", refocus = false) {
      const status = state.getState().status;
      if (status === "paused") {
        reframe ||= refocus;
        state.setState({ message });
        return;
      }
      if (status !== "playing" && status !== "loading") return;
      pausedStatus = status; reframe = refocus;
      viewer.setState({ presentationPaused: true });
      state.setState({ status: "paused", message, elapsedMs: elapsed });
    },
    resume(now = performance.now()) {
      if (state.getState().status !== "paused") return;
      previous = now;
      viewer.setState({ presentationPaused: false });
      if (reframe && pausedStatus === "playing") { stage = "prepare"; waited = 0; serviceServerId = undefined; viewer.setState({ presentationPreparing: true }); }
      state.setState({ status: pausedStatus, message: "Resuming" });
    },
    speed(speed: number) {
      if (![1, 2, 4].includes(speed)) return;
      state.setState({ speed });
      if (active()) viewer.setState({ presentationRate: speed });
    },
    stop(restorePrevious = true) {
      if (!active()) return;
      if (restorePrevious) restore();
      else {
        // Manual picking must keep the currently open geometry selectable.
        viewer.setState(s => ({ presentationRate: snapshot?.presentationRate ?? 1, presentationPaused: false, presentationPreparing: false, cameraOrbitMs: 0, cameraServiceView: false, cameraRevision: s.cameraRevision + 1 }));
        snapshot = undefined;
      }
      state.setState({ status: "idle", message: restorePrevious ? "Stopped — previous viewer state restored" : "Stopped for manual inspection", elapsedMs: elapsed });
    },
    tick(now: number) {
      const dt = Math.max(0, now - previous); previous = now;
      const p = state.getState();
      if (p.status === "paused" || !active()) return;
      elapsed += dt; waited += dt;
      if (p.status === "loading") {
        const s = viewer.getState();
        if (equipment.some(a => !s.modelStatus[a.id] || s.modelStatus[a.id] === "loading") && waited < PRESENTATION_TIMING.loading) return;
        const loaded = Object.fromEntries(equipment.filter(a => s.modelStatus[a.id] === "ready").map(a => [a.id, s.componentIdsByServer[a.id] ?? []]));
        const sequence = buildPresentation(assets, rackId, loaded, p.mode, typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
        state.setState({ ...sequence, status: "playing", message: "Preparing view" });
        waited = 0; return;
      }
      const step = p.steps[p.index]!;
      if (waited > PRESENTATION_TIMING.settling + (stage === "camera" ? step.orbitMs ?? 0 : 0) && stage !== "dwell") {
        restore();
        state.setState({ status: "error", message: "Presentation stopped: the 3D view did not settle. Previous state restored.", elapsedMs: elapsed });
        return;
      }
      if (stage === "prepare") {
        if (!settled() || !prepareServers(step)) return;
        const s = viewer.getState();
        if (step.componentId && !s.componentIdsByServer[step.assetId]?.includes(step.componentId)) {
          state.setState({ notices: [...p.notices, `${step.componentId}: skipped — geometry no longer available.`] });
          next(); return;
        }
        s.selectAsset(step.assetId);
        if (step.componentId) s.selectComponent(step.componentId);
        viewer.setState({ presentationPreparing: false });
        s.setCamera(step.assetId === rackId ? "free" : "focus", step.side, step.orbitMs);
        stage = "camera"; waited = 0;
        state.setState({ message: "Moving camera" });
      } else if (stage === "camera") {
        const s = viewer.getState();
        if (!settled() || s.cameraSettledRevision !== s.cameraRevision) return;
        stage = "dwell"; remaining = step.componentId ? PRESENTATION_TIMING.component : PRESENTATION_TIMING.overview;
        state.setState({ message: "Inspecting" });
      } else {
        // Delayed ticks count toward real elapsed/timeout time, but never rush through steps.
        remaining -= Math.min(dt, 250) * p.speed;
        if (remaining <= 0) next();
      }
    },
    dispose() { api.stop(); },
  };
  return api;
}
