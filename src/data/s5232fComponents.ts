import type { ComponentAsset, SwitchAsset } from "../types/assets";

/** Physical identities only; future providers may map child interfaces without new meshes. */
export function s5232fComponents(asset: SwitchAsset): ComponentAsset[] {
  const component = (slot: string, name: string, assetType: string,
    specifications: ComponentAsset["specifications"], details: ComponentAsset["details"] = {}): ComponentAsset => ({
    id: `${asset.id}.${slot}`, parentId: asset.id, slot, name, type: "component",
    manufacturer: asset.manufacturer, model: asset.model, status: "unknown", assetType,
    description: "Physical component · live telemetry is not connected.",
    specifications, details,
  });
  const ports = (quantity: number, prefix: string, connector: string, speedGbps: number) =>
    Array.from({ length: quantity }, (_, i) => component(
      `${prefix}-${String(i + 1).padStart(2, "0")}`,
      `${prefix === "PORT" ? "Port" : "SFP+ Port"} ${i + 1}`, "network-port",
      { speedGbps, location: "I/O_SIDE" }, { "Physical interface": connector },
    ));
  return [
    ...ports(asset.ports.quantity, "PORT", asset.ports.connector, asset.ports.speedGbps),
    ...ports(asset.additionalPorts.quantity, "SFPPLUS", asset.additionalPorts.connector, asset.additionalPorts.speedGbps),
    ...Array.from({ length: asset.powerSupplies }, (_, i) => component(
      `PSU-0${i + 1}`, `Power Supply ${i + 1}`, "power-supply", { location: "PSU_SIDE" },
      { Type: "Hot-swappable PSU", "Visual representation": "Simplified AC exterior" },
    )),
    ...Array.from({ length: asset.fanModules }, (_, i) => component(
      `FAN-0${i + 1}`, `Fan Module ${i + 1}`, "fan-module", { location: "PSU_SIDE" },
      { Airflow: asset.airflowMode },
    )),
    component("MGMT", "Out-of-Band Management", "management-port", { speed: "10/100/1000 Base-T", location: "PSU_SIDE" },
      { "Physical interface": "RJ45 Ethernet", Role: "Out-of-band management" }),
    component("CONSOLE-RJ45", "RJ45 Console", "console-port", { location: "PSU_SIDE" }, { "Physical interface": "RJ45 serial console" }),
    component("CONSOLE-MICROUSB", "MicroUSB-B Console", "console-port", { location: "PSU_SIDE" }, { "Physical interface": "MicroUSB-B" }),
    component("USB-A", "USB Type-A", "usb-port", { location: "PSU_SIDE" }, { "Physical interface": "USB-A" }),
  ];
}
