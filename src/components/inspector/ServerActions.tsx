import {
  useInfrastructure,
  useViewerStore,
} from "../../data/infrastructureContext";
import { useExplodedViewAvailability } from "../../hooks/useExplodedViewAvailability";
import { Icon } from "../layout/Icon";

export function ServerActions() {
  const { store } = useInfrastructure();
  const extracted = useViewerStore((s) => s.serverExtracted);
  const open = useViewerStore((s) => s.serverOpen);
  const exploded = useViewerStore((s) => s.explodedView);
  const { bezelAvailable, bezelRemoved, canEnter, reason } =
    useExplodedViewAvailability();
  const actions = store.getState();
  return (
    <div className="server-actions">
      <span role="status">
        Bezel:{" "}
        {bezelAvailable
          ? bezelRemoved
            ? "Removed"
            : "Installed"
          : "Unavailable"}
      </span>
      <button
        disabled={!bezelAvailable || (bezelRemoved && exploded)}
        aria-describedby={
          !bezelAvailable
            ? "bezel-unavailable"
            : bezelRemoved && exploded
              ? "bezel-exploded"
              : undefined
        }
        onClick={() =>
          bezelRemoved ? actions.installBezel() : actions.removeBezel()
        }
      >
        {bezelRemoved && bezelAvailable ? "Install bezel" : "Remove bezel"}
      </button>
      {!bezelAvailable && (
        <small id="bezel-unavailable">
          The loaded model has no removable bezel, or is still loading.
        </small>
      )}
      {bezelAvailable && bezelRemoved && exploded && (
        <small id="bezel-exploded">
          Exit exploded view before installing the bezel.
        </small>
      )}
      <button
        className="primary-button"
        onClick={() => {
          if (!extracted) actions.extractServer();
          else if (!open) actions.openServer();
          else actions.closeServer();
          actions.setCamera("focus");
        }}
      >
        <Icon name={open ? "close" : "layers"} size={16} />
        {!extracted ? "Extract server" : !open ? "Open server" : "Close server"}
        <Icon name="arrow" size={15} />
      </button>
      {open && (
        <>
          <button
            disabled={!exploded && !canEnter}
            aria-describedby={
              !exploded && reason
                ? "explosion-unavailable"
                : undefined
            }
            onClick={() => {
              if (exploded) actions.exitExplodedView();
              else if (canEnter) actions.enterExplodedView();
              actions.setCamera("focus");
            }}
          >
            <Icon name="layers" size={15} />
            {exploded ? "Exit exploded view" : "Exploded view"}
          </button>
          {!exploded && reason && (
            <small id="explosion-unavailable">{reason}</small>
          )}
        </>
      )}
      {extracted && (
        <button
          onClick={() => {
            actions.returnServer();
            actions.setCamera("free");
          }}
        >
          Return to rack
        </button>
      )}
      <small>Simplified visualization · conceptual interaction</small>
    </div>
  );
}
