import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { InfrastructureProvider } from "../src/data/InfrastructureProvider";
import {
  useInfrastructure,
  useViewerStore,
} from "../src/data/infrastructureContext";
import { InspectorPanel } from "../src/components/inspector/InspectorPanel";
import { ViewModes } from "../src/components/layout/ViewModes";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";
import { createViewerStore } from "../src/store/viewerStore";

function Controls() {
  const { assets, store } = useInfrastructure();
  const state = useViewerStore((s) => s);
  const [beforeFocus, setBeforeFocus] = useState(0);
  return (
    <>
      <button onClick={() => store.getState().selectServer("SERVER-01")}>Select server</button>
      <button onClick={() => store.getState().setBezelAvailable("SERVER-01", true)}>
        Report bezel
      </button>
      <button
        onClick={() =>
          store.getState().setComponentIds(
            "SERVER-01",
            assets
              .filter(
                (asset) =>
                  asset.type === "component" && asset.parentId === "SERVER-01",
              )
              .map((asset) => asset.id),
          )
        }
      >
        Report internals
      </button>
      <button
        onClick={() =>
          store
            .getState()
            .setComponentIds("SERVER-01", ["SERVER-01.SSD-01"])
        }
      >
        Report partial internals
      </button>
      <button onClick={() => setBeforeFocus(store.getState().cameraRevision)}>
        Record camera
      </button>
      <output aria-label="Viewer state">
        {JSON.stringify({
          extracted: state.serverExtracted,
          open: state.serverOpen,
          exploded: state.explodedView,
          bezelRemoved:
            state.servers[state.selectedServerId ?? ""]?.bezelRemoved ?? false,
          cameraRevision: state.cameraRevision,
          beforeFocus,
        })}
      </output>
    </>
  );
}

function setup() {
  return render(
    <InfrastructureProvider>
      <ViewModes />
      <InspectorPanel />
      <Controls />
    </InfrastructureProvider>,
  );
}

function viewerState() {
  return JSON.parse(screen.getByLabelText("Viewer state").textContent!);
}

it("guards bezel installation and exploded entry in the central store", async () => {
  const store = createViewerStore(
    await new StaticAssetRepository().listAssets(),
  );
  const actions = store.getState();
  actions.selectServer("SERVER-01");
  actions.setBezelAvailable("SERVER-01", true);
  actions.extractServer();
  actions.openServer();
  actions.enterExplodedView();
  expect(store.getState().explodedView).toBe(false);

  actions.removeBezel();
  actions.selectComponent("SERVER-01.GPU-01");
  actions.enterExplodedView();
  expect(store.getState()).toMatchObject({
    selectedAssetId: "SERVER-01",
    selectedComponentId: null,
    explodedView: true,
  });
  actions.installBezel();
  expect(store.getState().servers["SERVER-01"]!.bezelRemoved).toBe(true);
  actions.setCamera("free");
  expect(store.getState().explodedView).toBe(true);

  actions.selectServer("SERVER-02");
  actions.extractServer();
  actions.openServer();
  expect(store.getState().explodedView).toBe(false);
  actions.selectServer("SERVER-01");
  expect(store.getState()).toMatchObject({
    serverOpen: true,
    serverExtracted: true,
    explodedView: true,
  });
  actions.exitExplodedView();
  actions.resetViewer();
  expect(store.getState()).toMatchObject({
    selectedAssetId: null,
    selectedServerId: null,
    selectedComponentId: null,
    explodedView: false,
    servers: {},
  });
});

it("does not open through disabled toolbar or Inspector explosion actions", async () => {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Select server" }));
  await screen.findByRole("heading", { name: "Dell PowerEdge XE7745 #1" });
  fireEvent.click(screen.getByRole("button", { name: "Report bezel" }));
  fireEvent.click(screen.getByRole("button", { name: "Report internals" }));

  const toolbar = screen.getByRole("navigation", { name: "Viewer modes" });
  const toolbarExplosion = within(toolbar).getByRole("button", {
    name: "Exploded View",
  });
  await waitFor(() => {
    expect(toolbarExplosion).toBeDisabled();
    expect(toolbarExplosion).toHaveAttribute(
      "title",
      "Remove the bezel before entering exploded view.",
    );
    expect(toolbarExplosion).toHaveAccessibleDescription(
      "Remove the bezel before entering exploded view.",
    );
  });
  expect(
    within(toolbar).getByText(
      "Remove the bezel before entering exploded view.",
    ),
  ).toBeVisible();
  fireEvent.keyDown(toolbarExplosion, { key: "Enter" });
  fireEvent.click(toolbarExplosion);
  expect(viewerState()).toMatchObject({ extracted: false, open: false });

  const inspector = screen.getByRole("complementary", {
    name: "Asset inspector",
  });
  fireEvent.click(within(inspector).getByRole("button", { name: "Extract server" }));
  fireEvent.click(within(inspector).getByRole("button", { name: "Open server" }));
  const inspectorExplosion = within(inspector).getByRole("button", {
    name: "Exploded view",
  });
  expect(inspectorExplosion).toBeDisabled();
  expect(inspectorExplosion).toHaveAccessibleDescription(
    "Remove the bezel before entering exploded view.",
  );
  expect(
    within(inspector).getByText(
      "Remove the bezel before entering exploded view.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(inspectorExplosion);
  expect(viewerState()).toMatchObject({ open: true, exploded: false });

  fireEvent.click(within(inspector).getByRole("button", { name: "Remove bezel" }));
  fireEvent.click(inspectorExplosion);
  expect(viewerState()).toMatchObject({ exploded: true, bezelRemoved: true });
  const install = within(inspector).getByRole("button", { name: "Install bezel" });
  expect(install).toBeDisabled();
  expect(
    within(inspector).getByText(
      "Exit exploded view before installing the bezel.",
    ),
  ).toBeInTheDocument();
});

it("keeps inventory useful and explains old-model component focus fallback", async () => {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Select server" }));
  await screen.findByRole("heading", { name: "Dell PowerEdge XE7745 #1" });
  fireEvent.click(
    screen.getByRole("button", { name: "Report partial internals" }),
  );
  const oldModelExplosion = within(
    screen.getByRole("navigation", { name: "Viewer modes" }),
  ).getByRole("button", { name: "Exploded View" });
  await waitFor(() => {
    expect(oldModelExplosion).toBeDisabled();
    expect(oldModelExplosion).toHaveAttribute(
      "title",
      "Exploded component model is unavailable or still loading.",
    );
    expect(oldModelExplosion).toHaveAccessibleDescription(
      "Exploded component model is unavailable or still loading.",
    );
  });
  expect(
    within(
      screen.getByRole("navigation", { name: "Viewer modes" }),
    ).getByText("Exploded component model is unavailable or still loading."),
  ).toBeVisible();
  const inspector = screen.getByRole("complementary", {
    name: "Asset inspector",
  });
  fireEvent.click(within(inspector).getByRole("button", { name: "Extract server" }));
  fireEvent.click(within(inspector).getByRole("button", { name: "Open server" }));
  fireEvent.click(within(inspector).getByRole("button", { name: "GPU-01" }));

  expect(within(inspector).getByText("NVIDIA H200")).toBeInTheDocument();
  expect(within(inspector).getByText("SERVER-01")).toBeInTheDocument();
  expect(
    within(inspector).getByRole("heading", { name: "GPU-01" }),
  ).toBeInTheDocument();
  expect(within(inspector).getByText("141 GB")).toBeInTheDocument();
  expect(within(inspector).getByText("21")).toBeInTheDocument();
  expect(
    within(inspector).getByText(
      "Component model unavailable · focusing parent server",
    ),
  ).toBeInTheDocument();
  expect(
    within(inspector).getByRole("button", { name: /Back to server/ }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Record camera" }));
  fireEvent.click(
    within(inspector).getByRole("button", { name: "Focus component" }),
  );
  expect(viewerState().cameraRevision).toBeGreaterThan(viewerState().beforeFocus);
});

it("renders structured server totals and component fields", async () => {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Select server" }));
  await screen.findByRole("heading", { name: "Dell PowerEdge XE7745 #1" });
  const inspector = screen.getByRole("complementary", {
    name: "Asset inspector",
  });
  expect(within(inspector).getByText(/1536 GB.*1\.5 TB/)).toBeInTheDocument();
  expect(within(inspector).getByText("25.6 TB raw")).toBeInTheDocument();
  expect(within(inspector).getByText(/2 × 960 GB/)).toBeInTheDocument();
  expect(within(inspector).getByText("4-way NVLink")).toBeInTheDocument();

  fireEvent.click(within(inspector).getByRole("button", { name: "Extract server" }));
  fireEvent.click(within(inspector).getByRole("button", { name: "Open server" }));
  fireEvent.click(within(inspector).getByRole("button", { name: "DIMM-A01" }));
  expect(within(inspector).getByText("64 GB")).toBeInTheDocument();
  expect(within(inspector).getByText("6400 MT/s")).toBeInTheDocument();
  fireEvent.click(within(inspector).getByRole("button", { name: /Back to server/ }));

  fireEvent.click(within(inspector).getByRole("button", { name: "CPU-A" }));
  expect(within(inspector).getByText("64 / 128")).toBeInTheDocument();
  expect(within(inspector).getByText("Socket")).toBeInTheDocument();
});
