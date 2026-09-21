import { Html } from "@react-three/drei";
import { useInfrastructure } from "../../data/infrastructureContext";
import { rackPositionY, rackPositionZ } from "../../data/rackLayout";
import type { SwitchAsset } from "../../types/assets";
import { AssetSelection } from "../interactions/AssetSelection";
import { Box } from "./Box";
import { ModelAsset } from "./ModelAsset";

export function PowerSwitch({ asset }: { asset: SwitchAsset }) {
  const { rack } = useInfrastructure();
  const { width, depth } = asset.geometry;
  const height = asset.geometry.height ?? asset.rackPosition.heightU * rack.geometry.unitHeight - 0.005;
  const z = rackPositionZ(asset, rack);
  return (
    <group position={[0, rackPositionY(asset.rackPosition, rack), z]}>
      <AssetSelection
        assetId={asset.id}
        size={[0.482, height + 0.003, depth + 0.01]}
      >
        <ModelAsset url={asset.geometry.modelUrl} assetId={asset.id} centerOrigin>
          <Box size={[width, height, depth]} color="#444e5b" />
          <Box
            size={[width, height * 0.9, 0.013]}
            position={[0, 0, depth / 2]}
            color="#202a35"
          />
          {Array.from({ length: 8 }, (_, i) => (
            <Box
              key={i}
              size={[0.031, height * 0.45, 0.004]}
              position={[
                -width * 0.38 + i * width * 0.082,
                0,
                depth / 2 + 0.008,
              ]}
              color="#10161d"
            />
          ))}
          <Box
            size={[0.005, 0.005, 0.004]}
            position={[width * 0.43, 0, depth / 2 + 0.009]}
            color="#81afa6"
          />
          <Box
            size={[width * 0.75, height * 0.5, 0.003]}
            position={[0, 0, -depth / 2 - 0.001]}
            color="#222b33"
          />
          <Html
            position={[width * 0.34, 0, depth / 2 + 0.013]}
            transform
            distanceFactor={0.28}
            occlude
            style={{ pointerEvents: "none" }}
          >
            <span className="model-id" title={asset.name}>
              <strong>{asset.name}</strong>
              <small>{asset.id}</small>
            </span>
          </Html>
        </ModelAsset>
      </AssetSelection>
    </group>
  );
}
