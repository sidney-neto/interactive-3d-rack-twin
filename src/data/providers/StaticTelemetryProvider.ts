import type { TelemetryProvider, TelemetrySnapshot } from "./TelemetryProvider";

export class StaticTelemetryProvider implements TelemetryProvider {
  async getTelemetry(assetId: string): Promise<TelemetrySnapshot> {
    return { assetId, source: "static", available: false, measurements: {} };
  }
}
