import type { RackAsset } from "../../types/assets";

export interface RackRepository {
  getRack(id: string): Promise<RackAsset | undefined>;
}
