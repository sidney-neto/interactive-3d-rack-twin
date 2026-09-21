import { createStore } from "zustand/vanilla";
import { canSelectComponent, type Asset } from "../types/assets";
import type {
  CameraMode,
  ServerViewState,
  ViewerMode,
  ViewerPhase,
} from "../types/viewer";

export const dockedServer: ServerViewState = {
  bezelRemoved: false,
  extracted: false,
  open: false,
  exploded: false,
};
export const serviceSignature = (s: ServerViewState) => `${s.bezelRemoved}:${s.extracted}:${s.open}:${s.exploded}`;
export type ViewerSnapshot = Pick<ViewerStore, "selectedAssetId" | "selectedServerId" | "selectedComponentId" | "viewerMode" | "cameraMode" | "cameraSide" | "serverExtracted" | "serverOpen" | "explodedView" | "servers" | "presentationRate">;
export interface ViewerStore {
  cameraSide: "front" | "rear" | null;
  cameraSettledRevision: number;
  cameraOrbitMs: number;
  cameraServiceView: boolean;
  presentationPaused: boolean;
  presentationRate: number;
  presentationPreparing: boolean;
  modelStatus: Record<string, "loading" | "ready" | "unavailable">;
  motion: Record<string, { target: string; settled: boolean }>;
  reportModel: (id: string, status: "loading" | "ready" | "unavailable") => void;
  reportMotion: (key: string, target: string, settled: boolean) => void;
  restoreView: (snapshot: ViewerSnapshot) => void;
  selectedAssetId: string | null;
  selectedServerId: string | null;
  selectedComponentId: string | null;
  viewerMode: ViewerMode;
  cameraMode: CameraMode;
  cameraRevision: number;
  serverExtracted: boolean;
  serverOpen: boolean;
  explodedView: boolean;
  servers: Record<string, ServerViewState>;
  bezelAvailable: Record<string, boolean>;
  componentIdsByServer: Record<string, readonly string[]>;
  setBezelAvailable: (id: string, available: boolean) => void;
  setComponentIds: (serverId: string, ids: readonly string[]) => void;
  removeBezel: () => void;
  installBezel: () => void;
  selectAsset: (id: string) => void;
  selectServer: (id: string) => void;
  clearSelection: () => void;
  extractServer: () => void;
  returnServer: () => void;
  openServer: () => void;
  closeServer: () => void;
  selectComponent: (id: string) => void;
  enterExplodedView: () => void;
  exitExplodedView: () => void;
  resetViewer: () => void;
  setCamera: (mode: CameraMode, side?: "front" | "rear", orbitMs?: number, serviceView?: boolean) => void;
}
const emptySelection = {
  selectedAssetId: null,
  selectedServerId: null,
  selectedComponentId: null,
  viewerMode: "rack" as const,
  serverExtracted: false,
  serverOpen: false,
  explodedView: false,
};
function activeState(id: string, state: ServerViewState) {
  return {
    selectedAssetId: id,
    selectedServerId: id,
    selectedComponentId: null,
    serverExtracted: state.extracted,
    serverOpen: state.open,
    explodedView: state.exploded,
    viewerMode: state.exploded ? ("exploded" as const) : ("server" as const),
  };
}
export function createViewerStore(assets: readonly Asset[]) {
  const catalog = new Map(
    assets.map((asset) => [
      asset.id,
      {
        type: asset.type,
        parentId: asset.type === "component" ? asset.parentId : null,
        external: canSelectComponent(asset, false),
      },
    ]),
  );
  return createStore<ViewerStore>((set, get) => {
    const updateServer = (changes: Partial<ServerViewState>) => {
      const { selectedServerId, servers } = get();
      if (!selectedServerId) return;
      const next = {
        ...dockedServer,
        ...servers[selectedServerId],
        ...changes,
      };
      set({
        ...activeState(selectedServerId, next),
        servers: { ...servers, [selectedServerId]: next },
      });
    };
    const setBezelRemoved = (bezelRemoved: boolean) => {
      const {
        selectedServerId: id,
        bezelAvailable,
        explodedView,
        servers,
      } = get();
      if (!id || !bezelAvailable[id] || (!bezelRemoved && explodedView))
        return;
      set({
        servers: {
          ...servers,
          [id]: { ...dockedServer, ...servers[id], bezelRemoved },
        },
      });
    };
    return {
      ...emptySelection,
      cameraSide: null,
      cameraSettledRevision: -1,
      cameraOrbitMs: 0,
      cameraServiceView: false,
      presentationPaused: false,
      presentationRate: 1,
      presentationPreparing: false,
      modelStatus: {},
      motion: {},
      reportModel: (id, status) => {
        if (get().modelStatus[id] !== status)
          set(s => ({ modelStatus: { ...s.modelStatus, [id]: status } }));
      },
      reportMotion: (key, target, settled) => {
        const previous = get().motion[key];
        if (previous?.target !== target || previous.settled !== settled)
          set(s => ({ motion: { ...s.motion, [key]: { target, settled } } }));
      },
      restoreView: (snapshot) => set(s => ({ ...snapshot, cameraOrbitMs: 0, cameraServiceView: false, presentationPaused: false, presentationPreparing: false, cameraRevision: s.cameraRevision + 1 })),
      cameraMode: "free",
      cameraRevision: 0,
      servers: {},
      bezelAvailable: {},
      componentIdsByServer: {},
      setBezelAvailable: (id, available) => {
        if (
          catalog.get(id)?.type !== "server" ||
          get().bezelAvailable[id] === available
        )
          return;
        set((state) => ({
          bezelAvailable: { ...state.bezelAvailable, [id]: available },
        }));
      },
      setComponentIds: (serverId, ids) => {
        if (!["server", "switch"].includes(catalog.get(serverId)?.type ?? "")) return;
        const valid = [...new Set(ids)].filter((id) => {
          const asset = catalog.get(id);
          return asset?.type === "component" && asset.parentId === serverId;
        });
        const current = get().componentIdsByServer[serverId];
        if (
          (!current && valid.length === 0) ||
          (current?.length === valid.length &&
            current.every((id, index) => id === valid[index]))
        )
          return;
        set((state) => {
          const componentIdsByServer = { ...state.componentIdsByServer };
          if (valid.length) componentIdsByServer[serverId] = valid;
          else delete componentIdsByServer[serverId];
          return { componentIdsByServer };
        });
      },
      removeBezel: () => setBezelRemoved(true),
      installBezel: () => setBezelRemoved(false),
      selectAsset: (id) => {
        const asset = catalog.get(id);
        if (!asset) return;
        if (asset.type === "component") return get().selectComponent(id);
        if (asset.type === "server") return get().selectServer(id);
        set({ ...emptySelection, selectedAssetId: id });
      },
      selectServer: (id) => {
        if (catalog.get(id)?.type !== "server") return;
        set(activeState(id, get().servers[id] ?? dockedServer));
      },
      clearSelection: () => set(emptySelection),
      extractServer: () => {
        if (get().selectedServerId && !get().serverExtracted)
          updateServer({ extracted: true });
      },
      returnServer: () =>
        updateServer({ extracted: false, open: false, exploded: false }),
      openServer: () => {
        if (get().serverExtracted && !get().serverOpen)
          updateServer({ extracted: true, open: true, exploded: false });
      },
      closeServer: () => {
        if (get().serverOpen)
          updateServer({ extracted: true, open: false, exploded: false });
      },
      selectComponent: (id) => {
        const asset = catalog.get(id);
        if (
          asset?.type !== "component" ||
          (asset.parentId !== get().selectedServerId &&
            !(catalog.get(asset.parentId ?? "")?.type === "switch" &&
              asset.parentId === (catalog.get(get().selectedAssetId ?? "")?.parentId ?? get().selectedAssetId))) ||
          (!get().serverOpen && !asset.external)
        )
          return;
        set({
          selectedAssetId: id,
          selectedComponentId: id,
          viewerMode: "component",
        });
      },
      enterExplodedView: () => {
        const { bezelAvailable, selectedServerId, serverOpen, servers } = get();
        if (
          serverOpen &&
          selectedServerId &&
          (!bezelAvailable[selectedServerId] ||
            servers[selectedServerId]?.bezelRemoved)
        )
          updateServer({ extracted: true, open: true, exploded: true });
      },
      exitExplodedView: () => {
        if (get().explodedView)
          updateServer({ extracted: true, open: true, exploded: false });
      },
      resetViewer: () =>
        set((state) => ({
          ...emptySelection,
          servers: {},
          cameraMode: "free",
          cameraSide: null,
          cameraOrbitMs: 0,
          cameraServiceView: false,
          presentationPaused: false,
          cameraRevision: state.cameraRevision + 1,
        })),
      setCamera: (cameraMode, side, orbitMs = 0, cameraServiceView = false) =>
        set((state) => ({
          cameraMode,
          cameraSide: side ?? null,
          cameraServiceView,
          cameraOrbitMs: Number.isFinite(orbitMs) ? Math.max(0, orbitMs) : 0,
          cameraRevision: state.cameraRevision + 1,
        })),
    };
  });
}
export function getViewerState(state: ViewerStore): ViewerPhase {
  if (state.selectedComponentId) return "COMPONENT_SELECTED";
  if (state.explodedView) return "EXPLODED_VIEW";
  if (state.serverOpen) return "SERVER_OPEN";
  if (state.serverExtracted) return "SERVER_EXTRACTED";
  if (state.selectedServerId) return "SERVER_SELECTED";
  return "RACK_VIEW";
}
