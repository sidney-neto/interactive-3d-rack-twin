import { Box3, Matrix4, Vector3, type Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildComponentRegistry } from "../interactions/componentRegistry";
import { mapModelHierarchy } from "../interactions/modelNodeMapper";
import { buildExplodedPoses, explodedCoverLift } from "./explodedView";

const noRaycast = () => {};

export function createModelInstance(
  source: Object3D,
  assetId: string,
  centerOrigin = false,
) {
  const object = clone(source);
  mapModelHierarchy(object, assetId);
  if (centerOrigin) {
    const bounds = new Box3().setFromObject(object);
    if (!bounds.isEmpty()) object.position.sub(bounds.getCenter(new Vector3()));
  }
  object.updateMatrixWorld(true);
  const componentRegistry = buildComponentRegistry(object, assetId);
  const explodedPoses = buildExplodedPoses(object);
  let cover: Object3D | undefined;
  let bezel: Object3D | undefined;
  object.traverse((node) => {
    if (node.userData.interactionRole === "cover" || node.name === "top_cover")
      cover ??= node;
    if (
      node.userData.interactionRole === "bezel" ||
      node.name === "front_bezel"
    )
      bezel ??= node;
  });
  const bezelRaycasts: Array<[Object3D, Object3D["raycast"]]> = [];
  bezel?.traverse((node) => {
    bezelRaycasts.push([node, node.raycast]);
    node.userData.logicalAssetId = assetId;
  });
  // Convert scene-up into the cover parent's coordinates (including glTF axis conversion).
  const inverse = new Matrix4()
    .copy(cover?.parent?.matrixWorld ?? object.matrixWorld)
    .invert();
  const liftDirection = new Vector3(0, 1, 0)
    .applyMatrix4(inverse)
    .sub(new Vector3().applyMatrix4(inverse));
  return {
    object,
    componentRegistry,
    explodedPoses,
    bezel,
    cover,
    rest: cover?.position.clone() ?? new Vector3(),
    liftDirection,
    target: new Vector3(),
    bezelRaycasts,
  };
}

export function setModelBezelRemoved(
  instance: ReturnType<typeof createModelInstance>,
  removed: boolean,
) {
  if (!instance.bezel) return;
  instance.bezel.visible = !removed;
  for (const [node, raycast] of instance.bezelRaycasts)
    node.raycast = removed ? noRaycast : raycast;
}

export function animateModelCover(
  instance: ReturnType<typeof createModelInstance>,
  lift: number,
  alpha: number,
  explodeFactor = 0,
) {
  if (!instance.cover) return;
  const coordinatedLift = explodedCoverLift(explodeFactor);
  instance.target
    .copy(instance.rest)
    .addScaledVector(instance.liftDirection, Math.max(lift, coordinatedLift));
  if (coordinatedLift > lift) instance.cover.position.copy(instance.target);
  else instance.cover.position.lerp(instance.target, alpha);
}
