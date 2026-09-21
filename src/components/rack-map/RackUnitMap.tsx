import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { isEquipment } from "../../types/assets";
import { rackRange, rackSpan } from "../../data/rackLayout";
import { Icon } from "../layout/Icon";

export function RackUnitMap() {
  const { rack, assets, catalog, store } = useInfrastructure();
  const selected = useViewerStore(
    (s) => s.selectedServerId ?? s.selectedAssetId,
  );
  const selectedAsset = catalog.get(selected ?? "");
  const selectedEquipment = selectedAsset?.type === "component" ? selectedAsset.parentId : selected;
  const equipment = assets
    .filter(isEquipment)
    .filter((a) => a.rackId === rack.id);
  const used = equipment.reduce((sum, a) => sum + a.rackPosition.heightU, 0);
  return (
    <aside className="rack-panel" aria-label="Rack unit navigation">
      <div className="panel-eyebrow">
        INFRASTRUCTURE <span>01</span>
      </div>
      <button
        className="rack-heading"
        onClick={() => {
          store.getState().selectAsset(rack.id);
          store.getState().setCamera("free");
        }}
      >
        <span className="rack-icon">
          <Icon name="rack" size={23} />
        </span>
        <span>
          <strong>{rack.name}</strong>
          <small>{rack.id}</small>
        </span>
        <Icon name="chevron" size={15} />
      </button>
      <div className="capacity">
        <div>
          <span>Rack occupancy</span>
          <strong>
            {used} <span>/ {rack.units} U</span>
          </strong>
        </div>
        <div className="capacity-track">
          <span style={{ width: `${(used / rack.units) * 100}%` }} />
        </div>
        <small>{rack.units - used} units available</small>
      </div>
      <div className="map-heading">
        <span>UNIT</span>
        <span>EQUIPMENT</span>
      </div>
      <div
        className="rack-map"
        style={{
          gridTemplateRows: `repeat(${rack.units}, minmax(var(--rack-unit-min, 0px), 1fr))`,
        }}
      >
        {Array.from({ length: rack.units }, (_, i) => {
          const unit = rack.units - i;
          return (
            <div className="unit-row" key={unit} style={{ gridRow: i + 1 }}>
              <span>U{String(unit).padStart(2, "0")}</span>
              <div />
            </div>
          );
        })}
        {equipment.map((asset) => {
          const { row, span } = rackSpan(asset.rackPosition, rack.units);
          return (
            <button
              key={asset.id}
              aria-label={`Select ${asset.id} ${asset.name}, ${rackRange(asset.rackPosition)}`}
              title={`${asset.name} · ${asset.id} · ${rackRange(asset.rackPosition)}`}
              aria-pressed={selectedEquipment === asset.id}
              className={`map-asset ${asset.type}`}
              style={{ gridRow: `${row} / span ${span}` }}
              onClick={() => {
                store.getState().selectAsset(asset.id);
                store.getState().setCamera("focus");
              }}
            >
              <span className="map-asset-name">
                <i className={`status-dot ${asset.status}`} />
                <span>{asset.name}</span>
              </span>
              <small className="map-asset-id">
                {asset.id}
                {span > 1 && <span> · {rackRange(asset.rackPosition)}</span>}
              </small>
            </button>
          );
        })}
      </div>
      <div className="map-legend">
        <span>
          <i className="legend-square" />
          Occupied
        </span>
        <span>
          <i className="legend-square free" />
          Available
        </span>
      </div>
      <div className="panel-footnote">
        <Icon name="info" size={14} />
        Select equipment to inspect
      </div>
    </aside>
  );
}
