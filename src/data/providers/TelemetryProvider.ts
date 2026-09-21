export interface TelemetrySnapshot {
  assetId: string;
  source: "static" | "live";
  available: boolean;
  measurements: Readonly<
    Record<string, { value: number; unit: string; observedAt: string }>
  >;
}
export interface TelemetryProvider {
  getTelemetry(assetId: string): Promise<TelemetrySnapshot>;
}
