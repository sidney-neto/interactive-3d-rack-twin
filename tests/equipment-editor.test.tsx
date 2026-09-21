import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { InfrastructureProvider } from "../src/data/InfrastructureProvider";
import {
  useInfrastructure,
  useViewerStore,
} from "../src/data/infrastructureContext";
import { RackUnitMap } from "../src/components/rack-map/RackUnitMap";
import { InspectorPanel } from "../src/components/inspector/InspectorPanel";
import { rackPositionY } from "../src/data/rackLayout";
import { isEquipment } from "../src/types/assets";
import { services } from "../src/data/services";
import { StaticAssetRepository } from "../src/data/repositories/StaticAssetRepository";
import { useState } from "react";

function SnapshotProbe() {
  const [guardResult, setGuardResult] = useState("");
  const { catalog, rack, store, updateEquipment } = useInfrastructure();
  const state = useViewerStore((s) => s);
  const asset = catalog.get("SERVER-01");
  return (
    <>
      <output aria-label="Shared placement">
        {asset && isEquipment(asset)
          ? rackPositionY(asset.rackPosition, rack)
          : "missing"}
      </output>
      <output aria-label="Viewer state">
        {JSON.stringify({
          selected: state.selectedAssetId,
          camera: state.cameraMode,
          servers: state.servers,
        })}
      </output>
      <button
        onClick={() => {
          store.getState().selectServer("SERVER-02");
          store.getState().extractServer();
          store.getState().openServer();
          store.getState().selectServer("SERVER-01");
        }}
      >
        Prepare sibling
      </button>
      <button onClick={() => store.getState().extractServer()}>
        Extract during edit
      </button>
      <button
        onClick={() => store.getState().setBezelAvailable("SERVER-01", true)}
      >
        Report loaded bezel
      </button>
      <button
        onClick={() => store.getState().setBezelAvailable("SERVER-01", false)}
      >
        Report missing bezel
      </button>
      <button
        onClick={() => {
          void updateEquipment("SERVER-01", {
            name: "Invalid move",
            startU: 20,
          }).catch((error) => setGuardResult(error.message));
        }}
      >
        Attempt guarded move
      </button>
      <output aria-label="Guard result">{guardResult}</output>
    </>
  );
}

function setup(repository = new StaticAssetRepository()) {
  return render(
    <InfrastructureProvider services={{ ...services, assets: repository }}>
      <RackUnitMap />
      <InspectorPanel />
      <SnapshotProbe />
    </InfrastructureProvider>,
  );
}
async function editServer() {
  fireEvent.click(
    await screen.findByRole("button", { name: /select SERVER-01/i }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit equipment" }),
  );
}

it("saves into one shared snapshot while preserving selection, identities and sibling state", async () => {
  const view = setup();
  await editServer();
  fireEvent.click(screen.getByRole("button", { name: "Prepare sibling" }));
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "  Training node  " },
  });
  fireEvent.change(screen.getByLabelText("Starting rack unit"), {
    target: { value: "20" },
  });
  expect(screen.getByLabelText("Occupied rack units")).toHaveTextContent(
    "U20–U23",
  );
  expect(screen.getByLabelText("Equipment height")).toHaveValue("4U");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(
    await screen.findByRole("heading", { name: "Training node" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Edit equipment" }),
    ).toHaveFocus(),
  );
  expect(
    screen.getByRole("button", { name: /select SERVER-01.*Training node/i }),
  ).toHaveStyle({ gridRow: "22 / span 4" });
  expect(screen.getByLabelText("Shared placement")).toHaveTextContent(
    "1.03345",
  );
  expect(
    JSON.parse(screen.getByLabelText("Viewer state").textContent!),
  ).toEqual({
    selected: "SERVER-01",
    camera: "focus",
    servers: {
      "SERVER-02": {
        extracted: true,
        open: true,
        exploded: false,
        bezelRemoved: false,
      },
    },
  });
  view.unmount();
  setup();
  fireEvent.click(
    await screen.findByRole("button", {
      name: /select SERVER-01.*Training node/i,
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Training node" }),
  ).toBeInTheDocument();
});

it("rejects overlapping moves inline and cancels drafts without changing inventory", async () => {
  setup();
  await editServer();
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Uncommitted" },
  });
  fireEvent.change(screen.getByLabelText("Starting rack unit"), {
    target: { value: "35" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("SERVER-02");
  expect(
    screen.getByRole("heading", { name: "Dell PowerEdge XE7745 #1" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit equipment" }));
  expect(screen.getByLabelText("Display name")).toHaveValue(
    "Dell PowerEdge XE7745 #1",
  );
  expect(screen.getByLabelText("Starting rack unit")).toHaveValue(39);
  expect(localStorage.length).toBe(0);
});

it("blocks moves of extracted/open servers at the context boundary but permits renaming", async () => {
  setup();
  await editServer();
  fireEvent.click(screen.getByRole("button", { name: "Extract during edit" }));
  expect(screen.getByLabelText("Starting rack unit")).toBeDisabled();
  expect(
    screen.getByText(/Return this server to the rack and close it/i),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Attempt guarded move" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Guard result")).toHaveTextContent(
      /return.*rack/i,
    ),
  );
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Extracted node" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(
    await screen.findByRole("heading", { name: "Extracted node" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open server" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit equipment" }));
  expect(screen.getByLabelText("Starting rack unit")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Open node" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(
    await screen.findByRole("heading", { name: "Open node" }),
  ).toBeInTheDocument();
  expect(
    JSON.parse(screen.getByLabelText("Viewer state").textContent!).servers[
      "SERVER-01"
    ],
  ).toEqual({
    extracted: true,
    open: true,
    exploded: false,
    bezelRemoved: false,
  });
});

it.each([
  ["SERVER-01", "Dell PowerEdge XE7745 #1", 10],
  ["SWITCH-01", "Dell PowerSwitch S5232F-ON #1", 5],
] as const)(
  "keeps %s names synchronized through repeated position-only edits and reload",
  async (id, name, start) => {
    const view = setup();
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(`select ${id}`, "i"),
      }),
    );
    for (const unit of [start, start + 1]) {
      fireEvent.click(screen.getByRole("button", { name: "Edit equipment" }));
      expect(screen.getByLabelText("Display name")).toHaveValue(name);
      fireEvent.change(screen.getByLabelText("Starting rack unit"), {
        target: { value: String(unit) },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: new RegExp(`select ${id}`, "i") }),
      ).toHaveTextContent(name);
    }
    view.unmount();
    setup();
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(`select ${id}`, "i"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit equipment" }));
    expect(screen.getByLabelText("Display name")).toHaveValue(name);
    expect(screen.getByLabelText("Starting rack unit")).toHaveValue(start + 1);
  },
);

it("disables unavailable bezels and preserves removed state across equipment editing", async () => {
  setup();
  await editServer();
  expect(screen.getByRole("button", { name: "Remove bezel" })).toBeDisabled();
  expect(screen.getByText("Bezel: Unavailable")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Report loaded bezel" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove bezel" }));
  expect(screen.getByText("Bezel: Removed")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Bezel test" },
  });
  fireEvent.change(screen.getByLabelText("Starting rack unit"), {
    target: { value: "20" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(
    await screen.findByRole("heading", { name: "Bezel test" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Bezel: Removed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Install bezel" }));
  expect(screen.getByText("Bezel: Installed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Report missing bezel" }));
  expect(screen.getByRole("button", { name: "Remove bezel" })).toBeDisabled();
});

it("reports failed persistence without applying edits or closing the form", async () => {
  setup(
    new StaticAssetRepository(() => ({
      getItem: () => null,
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    })),
  );
  await editServer();
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Unsaved" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/not applied/i);
  expect(
    screen.getByRole("heading", { name: "Dell PowerEdge XE7745 #1" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Display name")).toHaveValue("Unsaved");
});

it("shows a load warning for invalid saved data without losing the default inspector", async () => {
  localStorage.setItem(
    "interactive-3d-rack-twin.equipment-overrides.v1",
    "corrupt saved edits",
  );
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /Saved equipment edits could not be loaded/,
  );
  expect(screen.getByRole("heading", { name: "Rack 44U" })).toBeInTheDocument();
});
