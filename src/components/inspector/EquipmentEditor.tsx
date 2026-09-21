import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { rackRange } from "../../data/rackLayout";
import type { RackEquipment } from "../../types/assets";

export function EquipmentEditor({ asset }: { asset: RackEquipment }) {
  const { rack, updateEquipment } = useInfrastructure();
  const locked = useViewerStore((s) => {
    const state = s.servers[asset.id];
    return (
      asset.type === "server" &&
      !!(state?.extracted || state?.open || state?.exploded)
    );
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(asset.name);
  const [start, setStart] = useState(String(asset.rackPosition.startU));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (saved && !busy) editButton.current?.focus();
  }, [saved, busy]);
  const position = locked
    ? asset.rackPosition.startU
    : start.trim()
      ? Number(start)
      : NaN;
  const maxStart = rack.units - asset.rackPosition.heightU + 1;
  const validPosition =
    Number.isInteger(position) && position >= 1 && position <= maxStart;
  const prefix = `equipment-${asset.id}`;
  const restriction =
    "Return this server to the rack and close it before changing its rack position. You can still rename it.";

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateEquipment(asset.id, { name, startU: position });
      setEditing(false);
      setSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save equipment changes.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="equipment-editor">
      <button
        ref={editButton}
        className="edit-equipment-button"
        aria-expanded={editing}
        aria-controls={`${prefix}-form`}
        disabled={busy}
        onClick={() => {
          setName(asset.name);
          setStart(String(asset.rackPosition.startU));
          setError(null);
          setSaved(false);
          setEditing(true);
        }}
      >
        Edit equipment
      </button>
      {saved && (
        <p className="save-confirmation" role="status">
          Equipment changes saved.
        </p>
      )}
      {editing && (
        <form
          id={`${prefix}-form`}
          onSubmit={save}
          noValidate
          aria-label={`Edit ${asset.id}`}
          aria-busy={busy}
        >
          <label htmlFor={`${prefix}-name`}>Display name</label>
          <input
            id={`${prefix}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={busy}
            autoFocus
            aria-invalid={!!error}
            aria-describedby={error ? `${prefix}-error` : undefined}
          />
          <label htmlFor={`${prefix}-start`}>Starting rack unit</label>
          <input
            id={`${prefix}-start`}
            type="number"
            min={1}
            max={maxStart}
            step={1}
            value={locked ? asset.rackPosition.startU : start}
            onChange={(event) => setStart(event.target.value)}
            required
            disabled={busy || locked}
            aria-invalid={!!error}
            aria-describedby={`${prefix}-range${locked ? ` ${prefix}-restriction` : ""}${error ? ` ${prefix}-error` : ""}`}
          />
          {locked && (
            <p id={`${prefix}-restriction`} className="edit-help">
              {restriction}
            </p>
          )}
          <label htmlFor={`${prefix}-height`}>Equipment height</label>
          <input
            id={`${prefix}-height`}
            value={`${asset.rackPosition.heightU}U`}
            readOnly
          />
          <div className="edit-range" id={`${prefix}-range`}>
            <span>Occupied rack units</span>
            <output aria-label="Occupied rack units">
              {validPosition
                ? rackRange({
                    startU: position,
                    heightU: asset.rackPosition.heightU,
                  })
                : `Enter a whole unit from U1 to U${maxStart}`}
            </output>
          </div>
          {error && (
            <p id={`${prefix}-error`} className="edit-error" role="alert">
              {error}
            </p>
          )}
          <div className="edit-actions">
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
                editButton.current?.focus();
              }}
            >
              Cancel
            </button>
          </div>
          <p className="edit-help">Saved in this browser only.</p>
        </form>
      )}
    </section>
  );
}
