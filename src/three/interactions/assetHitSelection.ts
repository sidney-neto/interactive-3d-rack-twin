import type { Object3D } from "three";
import type { Asset } from "../../types/assets";
import type { createViewerStore } from "../../store/viewerStore";

export function selectAssetHit(
  hit: Object3D,
  assetId: string,
  catalog: ReadonlyMap<string, Asset>,
  store: ReturnType<typeof createViewerStore>,
): void {
  const parent = catalog.get(assetId);
  if (parent?.type === "switch") {
    // Rack-distance hits select/focus the enclosure before enabling tiny ports.
    store.getState().selectAsset(assetId);
    store.getState().setCamera("focus");
    return;
  }
  const mapped = hit.userData.logicalAssetId;
  const id =
    typeof mapped === "string" && catalog.has(mapped) ? mapped : assetId;
  const asset = catalog.get(id);
  if (asset?.type === "component") store.getState().selectServer(asset.parentId);
  store.getState().selectAsset(id);
}
