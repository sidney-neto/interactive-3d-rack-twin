import data from "../mock/rack.json";
import type { RackAsset } from "../../types/assets";
import type { RackRepository } from "./RackRepository";
import { readStatus } from "./readStatus";

export class StaticRackRepository implements RackRepository {
  async getRack(id: string): Promise<RackAsset | undefined> {
    return id === data.id
      ? { ...data, type: "rack", status: readStatus(data.status) }
      : undefined;
  }
}
