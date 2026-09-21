import { Matrix4, Quaternion, Vector3, type Object3D } from "three";

export const XE7745_EXPLODED_COVER_LIFT = 0.95;

type ExplodeStage = "bridge" | "gpu" | "linear";

interface ExplodeSpec {
  offset: readonly [number, number, number];
  stage: ExplodeStage;
}

export interface ExplodedPose {
  node: Object3D;
  restPosition: Vector3;
  restQuaternion: Quaternion;
  restScale: Vector3;
  localOffset: Vector3;
  stage: ExplodeStage;
}

export interface ExplodableModelInstance {
  explodedPoses: readonly ExplodedPose[];
}

export function normalizeExplodeFactor(factor: number): number {
  return Number.isNaN(factor) ? 0 : Math.max(0, Math.min(1, factor));
}

export function nextExplodeFactor(
  current: number,
  target: number,
  elapsedSeconds: number,
): number {
  const from = normalizeExplodeFactor(current);
  const to = normalizeExplodeFactor(target);
  const step = Math.max(0, elapsedSeconds) / 0.9;
  return to < from ? Math.max(to, from - step) : Math.min(to, from + step);
}

const ease = (factor: number) => factor * factor * (3 - 2 * factor);

function progress(stage: ExplodeStage, factor: number): number {
  const clamped = normalizeExplodeFactor(factor);
  return ease(
    stage === "bridge"
      ? normalizeExplodeFactor(clamped / 0.2)
      : stage === "gpu"
        ? normalizeExplodeFactor((clamped - 0.2) / 0.8)
        : clamped,
  );
}

export function explodedCoverLift(factor: number): number {
  return XE7745_EXPLODED_COVER_LIFT * progress("bridge", factor);
}

function explodeSpec(name: string): ExplodeSpec | undefined {
  if (/^gpu_(?:(?:mount|empty_slot)_)?0[1-4]$/.test(name))
    return { offset: [0, 0.3, 0], stage: "gpu" };
  if (/^dimm_[ab](0[1-9]|1[0-2])$/.test(name))
    return { offset: [0, 0.72, 0], stage: "bridge" };
  const match = /^fan_module_(\d{2})$/.exec(name);
  if (match) {
    const index = Number(match[1]);
    return {
      // Model front is +Z. Lower fans keep their assembled two-row grid.
      offset: index <= 12 ? [0, 0, 0.22] : [0, 0.63, 0],
      stage: index <= 12 ? "linear" : "bridge",
    };
  }
  if (/^front_drive_(\d{2})$/.test(name))
    return { offset: [0, 0, 0.18], stage: "linear" };
  if (/^rear_psu_0[1-8]$/.test(name))
    return { offset: [0, 0, -0.16], stage: "linear" };
  // BOSS M.2 devices keep their local pose and travel with the controller.

  switch (name) {
    case "nvlink_bridge_4way":
      return { offset: [0, 0.34, 0], stage: "bridge" };
    case "upper_tray":
      return { offset: [0, 0.6, 0], stage: "bridge" };
    case "system_board":
      return { offset: [0, 0.63, 0], stage: "bridge" };
    case "cpu_a":
    case "cpu_b":
      return { offset: [0, 0.67, 0], stage: "bridge" };
    case "cpu_a_heatsink":
    case "cpu_b_heatsink":
      return { offset: [0, 0.1, 0], stage: "bridge" };
    case "boss_n1":
      // The existing BOSS face is recessed 0.4 mm behind the SSD carrier faces.
      return { offset: [0, 0, 0.1804], stage: "linear" };
    case "front_storage_backplane":
      return { offset: [0, 0, 0], stage: "linear" };
    case "nic_25g_adapter":
    case "nic_100g_adapter_01":
    case "nic_100g_adapter_02":
      return { offset: [0, 0, -0.18], stage: "linear" };
  }
}

export function explodeOffset(
  name: string,
  factor: number,
): [number, number, number] {
  const spec = explodeSpec(name);
  if (!spec) return [0, 0, 0];
  const amount = progress(spec.stage, factor);
  if (amount === 0) return [0, 0, 0];
  return [
    spec.offset[0] * amount,
    spec.offset[1] * amount,
    spec.offset[2] * amount,
  ];
}

export function buildExplodedPoses(modelRoot: Object3D): ExplodedPose[] {
  modelRoot.updateMatrixWorld(true);
  const poses: ExplodedPose[] = [];
  const inverse = new Matrix4();
  const modelOrigin = new Vector3().applyMatrix4(modelRoot.matrixWorld);
  const modelPoint = new Vector3();
  const localOrigin = new Vector3();
  const localPoint = new Vector3();
  modelRoot.traverse((node) => {
    const spec = explodeSpec(node.name);
    if (!spec || !node.parent) return;
    inverse.copy(node.parent.matrixWorld).invert();
    localOrigin.copy(modelOrigin).applyMatrix4(inverse);
    modelPoint
      .set(...spec.offset)
      .applyMatrix4(modelRoot.matrixWorld)
      .applyMatrix4(inverse);
    localPoint.copy(modelPoint).sub(localOrigin);
    poses.push({
      node,
      restPosition: node.position.clone(),
      restQuaternion: node.quaternion.clone(),
      restScale: node.scale.clone(),
      localOffset: localPoint.clone(),
      stage: spec.stage,
    });
  });
  return poses;
}

export function setExplodeFactor(
  instance: ExplodableModelInstance,
  factor: number,
): void {
  const bridgeProgress = progress("bridge", factor);
  const gpuProgress = progress("gpu", factor);
  const linearProgress = progress("linear", factor);
  for (const pose of instance.explodedPoses) {
    const amount =
      pose.stage === "bridge"
        ? bridgeProgress
        : pose.stage === "gpu"
          ? gpuProgress
          : linearProgress;
    pose.node.position
      .copy(pose.restPosition)
      .addScaledVector(pose.localOffset, amount);
    pose.node.quaternion.copy(pose.restQuaternion);
    pose.node.scale.copy(pose.restScale);
  }
}
