import { useEffect, useState } from "react";
import { useInfrastructure } from "../data/infrastructureContext";
import type { TelemetrySnapshot } from "../data/providers/TelemetryProvider";

export function useTelemetry(assetId: string) {
  const { services } = useInfrastructure();
  const [result, setResult] = useState<{
    id: string;
    snapshot?: TelemetrySnapshot;
    error?: string;
  }>();
  useEffect(() => {
    let cancelled = false;
    services.telemetry
      .getTelemetry(assetId)
      .then((snapshot) => {
        if (!cancelled) setResult({ id: assetId, snapshot });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ id: assetId, error: "Telemetry unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, services]);
  return result?.id === assetId ? result : undefined;
}
