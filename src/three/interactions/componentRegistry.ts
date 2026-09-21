import type { Object3D } from "three";

const inventoryComponent =
  /^(GPU-0[1-4]|CPU-[AB]|DIMM-[AB](?:0[1-9]|1[0-2])|NIC-(?:25G-0[12]|100G-0[1-4])|BOSS(?:-M2-0[12])?|SSD-0[1-8]|PSU-0[1-8]|NVLINK-01|PORT-(?:0[1-9]|[12]\d|3[0-2])|SFPPLUS-0[12]|FAN-0[1-4]|MGMT|CONSOLE-RJ45|CONSOLE-MICROUSB|USB-A)$/;

export function buildComponentRegistry(
  root: Object3D,
  instanceId: string,
): Map<string, Object3D> {
  const registry = new Map<string, Object3D>();
  const prefix = `${instanceId}.`;
  root.traverse((node) => {
    const id = node.userData.logicalAssetId;
    if (
      node.userData.selectable === true &&
      typeof id === "string" &&
      id.startsWith(prefix) &&
      inventoryComponent.test(id.slice(prefix.length))
    )
      registry.set(id, registry.get(id) ?? node);
  });
  return registry;
}

export function resolveComponentRoot(
  hit: Object3D,
  registry: ReadonlyMap<string, Object3D>,
): Object3D | undefined {
  for (let node: Object3D | null = hit; node; node = node.parent) {
    const id = node.userData.logicalAssetId;
    if (typeof id === "string") {
      const root = registry.get(id);
      if (root) return root;
    }
  }
}
