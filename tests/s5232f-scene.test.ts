import { isValidElement } from "react";
import { expect, it, vi } from "vitest";
import { Scene } from "../src/three/scene/Scene";
import { PowerSwitch } from "../src/three/models/PowerSwitch";
import { XE7745 } from "../src/three/models/XE7745";
import { Rack44U } from "../src/three/models/Rack44U";

const data = vi.hoisted(() => {
  const assets = [
    { id: "SERVER-01", type: "server", rackId: "RACK-01" },
    { id: "SERVER-02", type: "server", rackId: "RACK-01" },
    { id: "SWITCH-01", type: "switch", rackId: "RACK-01" },
    { id: "SWITCH-02", type: "switch", rackId: "RACK-01" },
    { id: "OTHER-SWITCH", type: "switch", rackId: "RACK-02" },
    { id: "SWITCH-01.PORT-17", type: "component", parentId: "SWITCH-01" },
    { id: "SWITCH-01.PSU-01", type: "component", parentId: "SWITCH-01" },
    { id: "SWITCH-02.PORT-17", type: "component", parentId: "SWITCH-02" },
    { id: "SWITCH-02.FAN-04", type: "component", parentId: "SWITCH-02" },
  ];
  return { assets, state: { selectedAssetId: null as string | null, cameraMode: "free" } };
});
vi.mock("../src/data/infrastructureContext", () => ({
  useInfrastructure: () => ({ rack: { id: "RACK-01" }, assets: data.assets, catalog: new Map(data.assets.map(a => [a.id, a])) }),
  useViewerStore: (select: (state: typeof data.state) => unknown) => select(data.state),
}));

it.each(["focus", "front", "rear", "free"])("keeps the complete current rack mounted in %s mode for equipment and component selection", (cameraMode) => {
  const equipment = () => Scene().props.children.flat().filter(isValidElement)
    .filter((e: { type: unknown }) => [PowerSwitch, XE7745, Rack44U].includes(e.type as typeof PowerSwitch))
    .map((e: { props: { asset?: { id: string } } }) => e.props.asset?.id ?? "RACK-01");
  for (const selectedAssetId of [null, "SERVER-01", "SERVER-02", "SWITCH-01", "SWITCH-02",
    "SWITCH-01.PORT-17", "SWITCH-01.PSU-01", "SWITCH-02.PORT-17", "SWITCH-02.FAN-04"]) {
    data.state = { selectedAssetId, cameraMode };
    expect(equipment()).toEqual(["RACK-01", "SERVER-01", "SERVER-02", "SWITCH-01", "SWITCH-02"]);
  }
});
