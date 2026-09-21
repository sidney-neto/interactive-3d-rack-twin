import type { Object3D } from "three";

export interface ModelNodeMetadata {
  assetType?: unknown;
  assetSlot?: unknown;
  slot?: unknown;
  assetModel?: unknown;
  selectable?: unknown;
  explodable?: unknown;
}

export function mapModelNode(
  instanceId: string,
  nodeName: string,
  metadata: ModelNodeMetadata = {},
): string | null {
  if (metadata.selectable === false) return null;
  // Exact physical roots only; descendants inherit their nearest logical parent.
  const switchSlot = nodeName.replace(/^qsfp28_/, "PORT-").replace(/^sfpplus_/, "SFPPLUS-")
    .replace(/^fan_module_/, "FAN-").replace(/^psu_/, "PSU-");
  const management: Record<string, string> = { mgmt_rj45: "MGMT", console_rj45: "CONSOLE-RJ45", console_microusb: "CONSOLE-MICROUSB", usb_type_a: "USB-A" };
  if (instanceId.startsWith("SWITCH-")) {
    const candidate = typeof metadata.slot === "string" ? metadata.slot : management[nodeName] ?? switchSlot;
    if (/^(PORT-(?:0[1-9]|[12]\d|3[0-2])|SFPPLUS-0[12]|PSU-0[12]|FAN-0[1-4]|MGMT|CONSOLE-RJ45|CONSOLE-MICROUSB|USB-A)$/.test(candidate))
      return `${instanceId}.${candidate}`;
    return instanceId;
  }
  const slot =
    typeof metadata.assetSlot === "string"
      ? metadata.assetSlot
      : typeof metadata.slot === "string"
        ? metadata.slot
        : nodeName
            .replace(/^(front|rear)_/, "")
            .toUpperCase()
            .replaceAll("_", "-");
  const normalizedSlot =
    slot === "BOSS-N1" ? "BOSS" : slot === "NVLINK-BRIDGE-4WAY" ? "NVLINK-01" : slot.replace(/^DRIVE-/, "SSD-");
  if (
    /^(GPU-\d{2}|CPU-[AB]|DIMM-[AB]\d{2}|NIC-(25G|100G)-\d{2}|BOSS(?:-M2-\d{2})?|SSD-\d{2}|PSU-\d{2}|NVLINK-01)$/.test(
      normalizedSlot,
    )
  ) {
    return `${instanceId}.${normalizedSlot}`;
  }
  return instanceId;
}

export function mapModelHierarchy(root: Object3D, instanceId: string): void {
  const visit = (node: Object3D, inherited: string | null) => {
    const mapped = mapModelNode(instanceId, node.name, node.userData);
    const excluded =
      node.userData.selectable === false ||
      (inherited === null && node.userData.selectable !== true);
    const logicalAssetId = excluded
      ? null
      : mapped !== instanceId
        ? mapped
        : (inherited ?? instanceId);
    node.userData = {
      ...node.userData,
      logicalAssetId,
    };
    node.children.forEach((child) => visit(child, logicalAssetId));
  };
  visit(root, instanceId);
}
