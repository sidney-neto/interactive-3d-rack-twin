import { Box3, MathUtils, Vector3, type Object3D } from "three";

const bounds = new Box3();
const size = new Vector3();

export function componentFrame(
  root: Object3D,
  aspect: number,
  verticalFov: number,
  minimumDistance = 0.65,
): { center: Vector3; distance: number; polarAngle: number } | undefined {
  root.updateWorldMatrix(true, true);
  bounds.setFromObject(root);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new Vector3());
  bounds.getSize(size);
  if (
    !center.toArray().every(Number.isFinite) ||
    !size.toArray().every(Number.isFinite)
  )
    return;
  const verticalTangent = Math.tan(MathUtils.degToRad(verticalFov) / 2);
  if (!(verticalTangent > 0) || !(aspect > 0)) return;
  const verticalFit = size.y / (2 * verticalTangent);
  const horizontalFit = size.x / (2 * verticalTangent * aspect);
  const boundingRadius = size.length() / 2;
  return {
    center,
    distance: Math.max(
      minimumDistance,
      (Math.max(verticalFit, horizontalFit) + boundingRadius) * 1.15,
    ),
    polarAngle: 1.35,
  };
}
