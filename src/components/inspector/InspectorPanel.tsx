import { useState, type ReactNode } from "react";
import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { rackRange } from "../../data/rackLayout";
import {
  isEquipment,
  canSelectComponent,
  type Asset,
  type ComponentAsset,
  type ServerAsset,
} from "../../types/assets";
import { useTelemetry } from "../../hooks/useTelemetry";
import { ServerActions } from "./ServerActions";
import { Icon } from "../layout/Icon";
import { EquipmentEditor } from "./EquipmentEditor";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="spec-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function ServerSpecs({ asset, tab }: { asset: ServerAsset; tab: string }) {
  const memoryGB = asset.memory.quantity * asset.memory.capacityPerDimmGB;
  const rawStorageTB = asset.storage.ssd.quantity * asset.storage.ssd.capacityTB;
  return (
    <>
      {(tab === "Overview" || tab === "Hardware") && (
        <section className="inspector-section">
          <h3>COMPUTE & MEMORY</h3>
          <dl>
            <Field label="Graphics accelerators">
              <strong>
                {asset.gpu.quantity} × {asset.gpu.model}
              </strong>
              <small>{asset.gpu.memoryGB} GB per GPU</small>
            </Field>
            <Field label="Processors">
              <strong>{asset.cpu.model}</strong>
              <small>
                {asset.cpu.quantity} CPUs · {asset.cpu.coresPerCpu} cores /{" "}
                {asset.cpu.threadsPerCpu} threads each
              </small>
            </Field>
            <Field label="System memory">
              <strong>
                {memoryGB} GB (≈{memoryGB / 1024} TB) {asset.memory.generation}
              </strong>
              <small>
                {asset.memory.quantity} × {asset.memory.capacityPerDimmGB} GB ·{" "}
                {asset.memory.speed}
              </small>
            </Field>
            {asset.gpu.interconnect && (
              <Field label="GPU interconnect">
                <strong>
                  {asset.gpu.interconnect.topology} {asset.gpu.interconnect.type}
                </strong>
                <small>Slots {asset.gpu.interconnect.slots.join(", ")}</small>
              </Field>
            )}
          </dl>
        </section>
      )}
      {(tab === "Overview" || tab === "Storage") && (
        <section className="inspector-section">
          <h3>STORAGE</h3>
          <dl>
            <Field label="Boot storage · BOSS">
              <strong>
                {asset.storage.boss.quantity} × {asset.storage.boss.capacityGB}{" "}
                GB
              </strong>
              <small>{asset.storage.boss.type} · INTERNAL</small>
            </Field>
            <Field label="Front storage">
              <strong>{rawStorageTB} TB raw</strong>
              <small>
                {asset.storage.ssd.quantity} × {asset.storage.ssd.capacityTB} TB
                SSD · FRONT
              </small>
            </Field>
          </dl>
        </section>
      )}
      {(tab === "Overview" || tab === "Network") && (
        <section className="inspector-section">
          <h3>NETWORK</h3>
          <div className="network-pair">
            <div>
              <strong>
                {asset.network.interfaces25G} × 25 <small>Gbps</small>
              </strong>
              <span>Ethernet interfaces</span>
            </div>
            <div>
              <strong>
                {asset.network.interfaces100G} × 100 <small>Gbps</small>
              </strong>
              <span>Ethernet interfaces</span>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
function ComponentSpecs({ asset }: { asset: ComponentAsset }) {
  const specifications = asset.specifications;
  if (!specifications) return null;
  return (
    <section className="inspector-section">
      <h3>SPECIFICATIONS</h3>
      <dl className="compact-fields">
        {specifications.physicalSlot !== undefined && (
          <Field label="Physical slot">{specifications.physicalSlot}</Field>
        )}
        {specifications.memoryGB !== undefined && (
          <Field label="Memory">{specifications.memoryGB} GB</Field>
        )}
        {(specifications.capacityGB !== undefined ||
          specifications.capacityTB !== undefined) && (
          <Field label="Capacity">
            {specifications.capacityGB ?? specifications.capacityTB}{" "}
            {specifications.capacityGB !== undefined ? "GB" : "TB"}
          </Field>
        )}
        {(specifications.speed || specifications.speedGbps !== undefined) && (
          <Field label="Speed">
            {specifications.speed ?? `${specifications.speedGbps} Gbps`}
          </Field>
        )}
        {specifications.cores !== undefined &&
          specifications.threads !== undefined && (
            <Field label="Cores / threads">
              {specifications.cores} / {specifications.threads}
            </Field>
          )}
        {specifications.location && (
          <Field label="Location">{specifications.location.toUpperCase()}</Field>
        )}
      </dl>
    </section>
  );
}
function AssetDetails({ asset }: { asset: Asset }) {
  const [tab, setTab] = useState("Overview");
  const { rack, assets, catalog, store } = useInfrastructure();
  const switchComponent = asset.type === "component" && catalog.get(asset.parentId)?.type === "switch";
  const parentLabel = switchComponent ? "switch" : "server";
  const open = useViewerStore((s) => s.serverOpen);
  const componentModelAvailable = useViewerStore((s) =>
    asset.type === "component"
      ? !!s.componentIdsByServer[asset.parentId]?.includes(asset.id)
      : false,
  );
  const telemetry = useTelemetry(asset.id);
  const equipment = assets.filter(isEquipment);
  const occupied = equipment.reduce(
    (sum, a) => sum + a.rackPosition.heightU,
    0,
  );
  const components =
    (asset.type === "server" || asset.type === "switch")
      ? assets.filter((a) => canSelectComponent(a, open) && a.parentId === asset.id)
      : [];
  return (
    <>
      <div className="asset-identity">
        <div className={`asset-avatar ${asset.type}`}>
          <Icon name={asset.type === "component" ? "chip" : "rack"} size={30} />
        </div>
        <div className="asset-id">{asset.id}</div>
        <h2>{asset.name}</h2>
        <p>
          {asset.type === "server"
            ? `${asset.rackPosition.heightU}U Rack Server`
            : asset.type === "switch"
              ? `${asset.rackPosition.heightU}U Network Switch`
              : asset.type === "component"
                ? asset.assetType
                : "Infrastructure enclosure"}
        </p>
        <span className="status-badge">
          <i className={`status-dot ${asset.status}`} />
          {asset.status}
          <span>· static inventory</span>
        </span>
      </div>
      <div className="inspector-tabs" aria-label="Asset information sections">
        {(asset.type === "server"
          ? ["Overview", "Hardware", "Network", "Storage"]
          : ["Overview"]
        ).map((label) => (
          <button
            key={label}
            aria-pressed={tab === label}
            onClick={() => setTab(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="inspector-scroll">
        {isEquipment(asset) && <EquipmentEditor asset={asset} />}
        <section className="inspector-section">
          <h3>ASSET DETAILS</h3>
          <dl className="compact-fields">
            <Field label="Manufacturer">{asset.manufacturer}</Field>
            <Field label="Model">{asset.model}</Field>
            {isEquipment(asset) && (
              <Field label="Rack position">
                <span className="position-tag">
                  {rackRange(asset.rackPosition)}
                </span>
                <span className="muted"> {asset.rackPosition.heightU}U</span>
              </Field>
            )}
            {asset.type === "component" && (
              <>
                <Field label={switchComponent ? "Switch" : "Server"}>{asset.parentId}</Field>
                <Field label={asset.assetType === "cpu" ? "Socket" : "Slot"}>
                  {asset.slot}
                </Field>
              </>
            )}
          </dl>
        </section>
        {asset.type === "server" && <ServerSpecs asset={asset} tab={tab} />}
        {asset.type === "switch" && (
          <section className="inspector-section">
            <h3>PHYSICAL SWITCH HARDWARE</h3>
            <dl>
              <Field label="Ports">
                <strong>
                  {asset.ports.quantity} × {asset.ports.speedGbps} Gbps
                </strong>
                <small>{asset.ports.connector} · physical cages</small>
              </Field>
              <Field label="Role">{asset.role}</Field>
              <Field label="Additional ports">{asset.additionalPorts.quantity} × {asset.additionalPorts.connector} · {asset.additionalPorts.speedGbps} GbE</Field>
              <Field label="Power">{asset.powerSupplies} × PSU</Field>
              <Field label="Cooling">{asset.fanModules} × fan modules</Field>
              <Field label="Airflow">{asset.airflowMode}</Field>
              <Field label="Management">{asset.management}</Field>
              <Field label="Dimensions (W × D × H)">{[asset.geometry.width, asset.geometry.depth, asset.geometry.height ?? 0].map(v => Number((v * 1000).toFixed(2))).join(" × ")} mm</Field>
            </dl>
          </section>
        )}
        {asset.type === "component" && (
          <>
            <ComponentSpecs asset={asset} />
            {asset.details && (
              <section className="inspector-section">
                <h3>TECHNICAL INFORMATION</h3>
                <dl>{Object.entries(asset.details).map(([label, value]) => (
                  <Field key={label} label={label}>{value}</Field>
                ))}</dl>
              </section>
            )}
            <section className="inspector-section">
              <h3>COMPONENT</h3>
              <p>{asset.description}</p>
              {asset.references?.map(({ title, url }) => (
                <p key={url}><a href={url} target="_blank" rel="noreferrer">{title}</a></p>
              ))}
              {!componentModelAvailable && (
                <p>Component model unavailable · focusing parent {parentLabel}</p>
              )}
              <button
                className="text-button"
                onClick={() => store.getState().setCamera("focus")}
              >
                Focus component
              </button>
              <button
                className="text-button"
                onClick={() => store.getState().selectAsset(asset.parentId)}
              >
                ← Back to {parentLabel}
              </button>
            </section>
          </>
        )}
        {asset.type === "rack" && (
          <>
            <section className="inspector-section">
              <h3>RACK SUMMARY</h3>
              <div className="rack-summary">
                <div>
                  <strong>{rack.units}</strong>
                  <span>Total units</span>
                </div>
                <div>
                  <strong>{equipment.length}</strong>
                  <span>Installed assets</span>
                </div>
                <div>
                  <strong>{rack.units - occupied}</strong>
                  <span>Available units</span>
                </div>
              </div>
              <p className="subtle-copy">{rack.location}</p>
            </section>
            <section className="inspector-section">
              <h3>INSTALLED EQUIPMENT</h3>
              <div className="inventory-list">
                {equipment.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      store.getState().selectAsset(a.id);
                      store.getState().setCamera("focus");
                    }}
                  >
                    <Icon name="rack" size={17} />
                    <span>
                      <strong>{a.name}</strong>
                      <small>{a.id}</small>
                    </span>
                    <Icon name="chevron" size={14} />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {(asset.type === "server" || asset.type === "switch") && components.length > 0 && (
          <section className="inspector-section">
            <h3>
              COMPONENT INVENTORY <span>{components.length}</span>
            </h3>
            <div className="component-list">
              {components.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    store.getState().selectComponent(a.id);
                    store.getState().setCamera("focus");
                  }}
                >
                  <Icon name="chip" size={14} />
                  <span>{a.name}</span>
                  <Icon name="chevron" size={12} />
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="telemetry-note">
          <Icon name="info" size={16} />
          <div>
            <strong>
              {telemetry?.snapshot?.available
                ? "Telemetry connected"
                : "Static infrastructure data"}
            </strong>
            <p>
              {telemetry?.error ??
                (telemetry?.snapshot?.available
                  ? "Provider data available; measurement UI is outside this MVP."
                  : "Live telemetry is not connected. Values represent the configured inventory.")}
            </p>
          </div>
        </div>
      </div>
      {(asset.type === "server" || asset.type === "component" && !switchComponent) && (
        <ServerActions />
      )}
    </>
  );
}
export function InspectorPanel() {
  const { catalog, rack, store, loadWarning } = useInfrastructure();
  const selectedId = useViewerStore((s) => s.selectedAssetId);
  const asset = catalog.get(selectedId ?? rack.id) ?? rack;
  return (
    <aside
      id="asset-inspector"
      tabIndex={-1}
      className="inspector-panel"
      aria-label="Asset inspector"
    >
      <div className="panel-eyebrow">
        ASSET INSPECTOR
        {selectedId && (
          <button
            aria-label="Clear selection"
            className="icon-button"
            onClick={() => store.getState().clearSelection()}
          >
            <Icon name="close" size={15} />
          </button>
        )}
      </div>
      {loadWarning && (
        <p className="inventory-warning" role="alert">
          {loadWarning}
        </p>
      )}
      <AssetDetails key={asset.id} asset={asset} />
    </aside>
  );
}
