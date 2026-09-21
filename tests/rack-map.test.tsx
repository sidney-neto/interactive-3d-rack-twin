import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { InfrastructureProvider } from "../src/data/InfrastructureProvider";
import { RackUnitMap } from "../src/components/rack-map/RackUnitMap";
import { InspectorPanel } from "../src/components/inspector/InspectorPanel";
import { useViewerStore } from "../src/data/infrastructureContext";

function CameraRequest() {
  const camera = useViewerStore((s) => s.cameraMode);
  return <output aria-label="Camera request">{camera}</output>;
}

it("renders each spanning server once and synchronizes map selection, inspector and focus", async () => {
  render(
    <InfrastructureProvider>
      <RackUnitMap />
      <InspectorPanel />
      <CameraRequest />
    </InfrastructureProvider>,
  );
  const first = await screen.findByRole("button", {
    name: /select SERVER-01/i,
  });
  expect(
    screen.getAllByRole("button", { name: /select SERVER-01/i }),
  ).toHaveLength(1);
  expect(first).toHaveStyle({ gridRow: "3 / span 4" });
  fireEvent.click(first);
  await waitFor(() => expect(first).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByLabelText("Camera request")).toHaveTextContent("focus");
  expect(
    screen.getByRole("heading", { name: "Dell PowerEdge XE7745 #1" }),
  ).toBeInTheDocument();
  expect(screen.getByText("AMD EPYC 9555")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /select SWITCH-02/i }));
  expect(first).toHaveAttribute("aria-pressed", "false");
  expect(
    screen.getByRole("heading", { name: "Dell PowerSwitch S5232F-ON #2" }),
  ).toBeInTheDocument();
});
