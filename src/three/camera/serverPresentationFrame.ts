import { Box3, MathUtils, Vector3, type Object3D } from "three";
import type { RackAsset, ServerAsset } from "../../types/assets";
import { rackPositionY, rackPositionZ } from "../../data/rackLayout";
import { explodeOffset, XE7745_EXPLODED_COVER_LIFT } from "../models/explodedView";

const ELEVATION = MathUtils.degToRad(8);
const SERVICE_YAW = MathUtils.degToRad(22);
const MARGIN = 1.1;

/** Fixed framing for a full yaw revolution or the complete existing service travel. */
export function serverPresentationFrame(root: Object3D | undefined, asset: ServerAsset, rack: RackAsset, aspect: number, service: boolean) {
  const { width, depth } = asset.geometry;
  const height = asset.geometry.height ?? asset.rackPosition.heightU * rack.geometry.unitHeight - 0.006;
  const position = new Vector3(0, rackPositionY(asset.rackPosition, rack), rackPositionZ(asset, rack));
  const box = new Box3().setFromCenterAndSize(position, new Vector3(width, height, depth));
  root?.updateWorldMatrix(true, true);
  const world = root ? new Box3().setFromObject(root) : undefined;
  if (service) {
    const minOffset = new Vector3(), maxOffset = new Vector3();
    // Read the existing offsets, including nested parts; do not change the servicing poses.
    root?.traverse(node => {
      const offset = new Vector3();
      for (let parent: Object3D | null = node; parent && parent !== root.parent; parent = parent.parent)
        offset.add(new Vector3(...explodeOffset(parent.name, 1)));
      minOffset.min(offset); maxOffset.max(offset);
    });
    maxOffset.y = Math.max(maxOffset.y, XE7745_EXPLODED_COVER_LIFT, height * 2.2);
    maxOffset.z += depth * 0.9; // Existing XE7745 extraction travel.
    box.min.add(minOffset); box.max.add(maxOffset);
    if (world && !world.isEmpty()) box.union(world);
  } else if (world && !world.isEmpty()) box.copy(world);

  const half = box.getSize(new Vector3()).multiplyScalar(0.5);
  const center = box.getCenter(new Vector3());
  // Bias the service target toward the chassis so its front clears the bottom toolbar.
  if (service) center.y = box.min.y + half.y * 0.6;
  const vertical = Math.tan(MathUtils.degToRad(38) / 2);
  const horizontal = vertical * aspect;
  const sin = Math.sin(ELEVATION), cos = Math.cos(ELEVATION);
  const azimuthAngle = service ? SERVICE_YAW : 0;
  let distance = 0;
  if (service) {
    // Project the service envelope into the diagonal camera's right/up/depth axes.
    const yawSin = Math.sin(azimuthAngle), yawCos = Math.cos(azimuthAngle);
    for (const x of [-half.x, half.x]) for (const y of [box.min.y - center.y, box.max.y - center.y]) for (const z of [-half.z, half.z]) {
      const forward = x * yawSin + z * yawCos;
      const right = x * yawCos - z * yawSin;
      const towardCamera = y * sin + forward * cos;
      distance = Math.max(distance, towardCamera + Math.abs(right) / horizontal, towardCamera + Math.abs(y * cos - forward * sin) / vertical);
    }
  } else {
    // A yaw-invariant cylinder fits the long side as well as the narrow front.
    const radius = Math.hypot(half.x, half.z);
    distance = Math.max(
      radius / Math.sin(Math.atan(horizontal)) + half.y * sin,
      radius * (cos + sin / vertical) + half.y * (sin + cos / vertical),
    );
  }
  return { center, distance: Math.max(0.65, distance * MARGIN), polarAngle: Math.PI / 2 - ELEVATION, azimuthAngle };
}
