import { expect, it } from "vitest";
import { createViewerStore, dockedServer } from "../src/store/viewerStore";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";

it("guards unavailable bezels and preserves independent removals through every server transition", async () => {
  const store = createViewerStore(
    await new StaticAssetRepository().listAssets(),
  );
  const action = store.getState();
  action.selectServer("SERVER-01");
  action.removeBezel();
  expect(store.getState().servers["SERVER-01"] ?? dockedServer).toMatchObject({
    bezelRemoved: false,
  });
  action.setBezelAvailable("SERVER-01", true);
  action.setBezelAvailable("SERVER-02", true);
  action.removeBezel();
  action.extractServer();
  action.openServer();
  action.selectComponent("SERVER-01.GPU-01");
  action.installBezel();
  expect(store.getState().selectedComponentId).toBe("SERVER-01.GPU-01");
  action.removeBezel();
  for (const transition of [
    action.extractServer,
    action.openServer,
    action.enterExplodedView,
    action.exitExplodedView,
    action.closeServer,
    action.returnServer,
  ]) {
    transition();
    expect(store.getState().servers["SERVER-01"]!.bezelRemoved).toBe(true);
  }
  action.selectServer("SERVER-02");
  expect(store.getState().servers["SERVER-02"] ?? dockedServer).toMatchObject({
    bezelRemoved: false,
  });
  action.removeBezel();
  action.installBezel();
  action.selectServer("SERVER-01");
  action.setCamera("free");
  expect(store.getState().servers["SERVER-01"]!.bezelRemoved).toBe(true);
  action.setBezelAvailable("SERVER-01", false);
  action.installBezel();
  expect(store.getState().servers["SERVER-01"]!.bezelRemoved).toBe(true);
  action.setBezelAvailable("SERVER-01", true);
  action.resetViewer();
  expect(store.getState().servers["SERVER-01"] ?? dockedServer).toMatchObject({
    bezelRemoved: false,
  });
  expect(store.getState().bezelAvailable["SERVER-01"]).toBe(true);
});
