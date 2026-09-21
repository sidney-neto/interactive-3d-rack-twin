import type { AssetRepository } from "./repositories/AssetRepository";
import type { RackRepository } from "./repositories/RackRepository";
import type { TelemetryProvider } from "./providers/TelemetryProvider";
import { StaticAssetRepository } from "./repositories/StaticAssetRepository";
import { StaticRackRepository } from "./repositories/StaticRackRepository";
import { StaticTelemetryProvider } from "./providers/StaticTelemetryProvider";

export interface InfrastructureServices {
  assets: AssetRepository;
  racks: RackRepository;
  telemetry: TelemetryProvider;
}
export const services: InfrastructureServices = {
  assets: new StaticAssetRepository(),
  racks: new StaticRackRepository(),
  telemetry: new StaticTelemetryProvider(),
};
