import type { AssetStatus } from "../../types/assets";

export function readStatus(status: string): AssetStatus {
  if (status === "online" || status === "offline" || status === "unknown")
    return status;
  throw new Error(`Invalid asset status: ${status}`);
}
