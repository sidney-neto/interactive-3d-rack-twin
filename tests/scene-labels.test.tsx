import { GridHelper, Raycaster, Spherical, Vector3 } from "three";
import { applyProps } from "@react-three/fiber";
import { isValidElement } from "react";
import { expect, it, vi } from "vitest";
import { Scene } from "../src/three/scene/Scene";

// Only replace the context boundary; exercise the actual scene's grid configuration
// and Three.js raycasting without requiring a WebGL renderer.
vi.mock("../src/data/infrastructureContext", () => ({
  useInfrastructure: () => ({ rack: { id: "RACK-01" }, assets: [], catalog: new Map() }),
  useViewerStore: vi.fn(),
}));

it.each([
  ["server", 0.58895, -0.059262, 0, 0.469, 1.844098],
  ["switch", 0.300025, 0, 0.1598, 0.468, 1.2],
])(
  "does not let the decorative floor hide a moved %s label",
  (_, y, dy, x, z, distance) => {
    const children = Scene().props.children;
    const element = children.find(
      (child: unknown) => isValidElement(child) && child.type === "gridHelper",
    );
    const grid = new GridHelper(...element.props.args);
    applyProps(grid, element.props);
    grid.updateMatrixWorld(true);
    const camera = new Vector3()
      .setFromSpherical(new Spherical(distance, 1.02, 0.55))
      .add(new Vector3(0, y, 0));
    const label = new Vector3(x, y + dy, z);
    const ray = new Raycaster(
      camera,
      label.clone().sub(camera).normalize(),
      0,
      camera.distanceTo(label),
    );
    expect(ray.intersectObject(grid)).toHaveLength(0);
    grid.geometry.dispose();
    (grid.material as import("three").Material).dispose();
  },
);
