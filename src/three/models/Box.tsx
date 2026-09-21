import { BoxGeometry } from "three";

const geometry = new BoxGeometry(1, 1, 1);
export type Vec3 = [number, number, number];
export function Box({
  size,
  position = [0, 0, 0],
  color = "#414851",
  metalness = 0.25,
  emissive = "#000000",
}: {
  size: Vec3;
  position?: Vec3;
  color?: string;
  metalness?: number;
  emissive?: string;
}) {
  return (
    <mesh
      geometry={geometry}
      position={position}
      scale={size}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={0.55}
        emissive={emissive}
      />
    </mesh>
  );
}
