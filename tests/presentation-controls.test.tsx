import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PresentationControls } from "../src/components/layout/PresentationControls";
import { InfrastructureContext, type Infrastructure } from "../src/data/infrastructureContext";
import { services } from "../src/data/services";
import { createViewerStore } from "../src/store/viewerStore";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("supports controls, tab/manual interruption, keyboard input and StrictMode cleanup", async () => {
  const assets = await services.assets.listAssets();
  const rack = (await services.racks.getRack("RACK-01"))!;
  const store = createViewerStore(assets);
  store.getState().selectAsset("SWITCH-02");
  const context: Infrastructure = { assets, rack, store, catalog: new Map(assets.map(a => [a.id, a])), services, loadWarning: null, updateEquipment: async () => {} };
  vi.useFakeTimers();
  const result = render(<StrictMode><InfrastructureContext.Provider value={context}>
    <PresentationControls /><canvas data-testid="canvas" onClick={() => { store.getState().selectAsset("SWITCH-01"); store.getState().setCamera("focus"); }} />
    <input aria-label="Equipment name" />
    <button onClick={() => store.getState().selectAsset("SERVER-01")}>Manual selection</button>
  </InfrastructureContext.Provider></StrictMode>);
  expect(screen.getByRole("combobox", { name: "Presentation mode" })).toHaveValue("executive");
  fireEvent.change(screen.getByRole("combobox", { name: "Presentation mode" }), { target: { value: "detailed" } });
  expect(screen.getByRole("combobox", { name: "Presentation mode" })).toHaveValue("detailed");
  fireEvent.click(screen.getByRole("button", { name: /Play presentation/ }));
  expect(screen.getByRole("combobox", { name: "Presentation mode" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Pause/ })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Presentation speed" }), { target: { value: "4" } });
  expect(store.getState().presentationRate).toBe(4);
  fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
  act(() => { vi.advanceTimersByTime(20_000); });
  expect(screen.getByRole("button", { name: /Resume/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
  fireEvent.pointerDown(screen.getByTestId("canvas"));
  expect(screen.getByText("Paused for manual inspection")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(screen.getByText("Paused while tab is hidden")).toBeInTheDocument();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  expect(screen.getByRole("button", { name: /Resume/ })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(screen.getByRole("button", { name: /Resume/ })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(store.getState().selectedAssetId).toBe("SWITCH-02");
  fireEvent.click(screen.getByRole("button", { name: /Play presentation/ }));
  fireEvent.pointerDown(screen.getByTestId("canvas"), { clientX: 10, clientY: 10 });
  fireEvent.click(screen.getByTestId("canvas"), { clientX: 10, clientY: 10 });
  expect(screen.getByRole("button", { name: /Play presentation/ })).toBeInTheDocument();
  expect(store.getState()).toMatchObject({ selectedAssetId: "SWITCH-01", presentationPaused: false, cameraMode: "focus" });
  fireEvent.click(screen.getByRole("button", { name: /Play presentation/ }));
  const manual = screen.getByRole("button", { name: "Manual selection" });
  fireEvent.pointerDown(manual); fireEvent.click(manual);
  expect(store.getState().selectedAssetId).toBe("SERVER-01");
  expect(screen.getByRole("button", { name: /Play presentation/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Play presentation/ }));
  result.unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(store.getState()).toMatchObject({ selectedAssetId: "SERVER-01", presentationRate: 1, presentationPreparing: false });
  const revision = store.getState().cameraRevision;
  fireEvent.keyDown(document, { key: "Escape" });
  expect(store.getState().cameraRevision).toBe(revision);
});
