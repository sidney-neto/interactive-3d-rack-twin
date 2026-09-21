import { useInfrastructure } from "../../data/infrastructureContext";
import { AssetSelection } from "../interactions/AssetSelection";
import { Box } from "./Box";
import { ModelAsset } from "./ModelAsset";

export function Rack44U() {
  const { rack } = useInfrastructure();
  const { width, height, depth, unitHeight, baseHeight } = rack.geometry;
  return (
    <group position={[0, height / 2, 0]}>
      <AssetSelection
        assetId={rack.id}
        size={[width + 0.015, height, depth + 0.015]}
      >
        <ModelAsset url={rack.geometry.modelUrl} assetId={rack.id}>
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => (
              <Box
                key={`${x}-${z}`}
                size={[0.044, height, 0.05]}
                position={[x * (width / 2 - 0.024), 0, z * (depth / 2 - 0.026)]}
                color="#333b44"
              />
            )),
          )}
          {[-1, 1].flatMap((y) =>
            [-1, 1].map((z) => (
              <Box
                key={`${y}-${z}`}
                size={[width, 0.065, 0.055]}
                position={[
                  0,
                  y * (height / 2 - 0.033),
                  z * (depth / 2 - 0.028),
                ]}
                color="#3f4853"
              />
            )),
          )}
          {[-1, 1].flatMap((y) =>
            [-1, 1].map((x) => (
              <Box
                key={`${y}-${x}`}
                size={[0.05, 0.065, depth]}
                position={[
                  x * (width / 2 - 0.025),
                  y * (height / 2 - 0.033),
                  0,
                ]}
                color="#3c444e"
              />
            )),
          )}
          <Box
            size={[width, 0.018, depth]}
            position={[0, height / 2 - 0.043, 0]}
            color="#3a424c"
          />
          <Box
            size={[width - 0.025, 0.05, depth - 0.025]}
            position={[0, -height / 2 + 0.044, 0]}
            color="#343c47"
          />
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => (
              <Box
                key={`rail${x}-${z}`}
                size={[0.028, rack.units * unitHeight, 0.02]}
                position={[
                  x * (width / 2 - 0.052),
                  baseHeight + (rack.units * unitHeight) / 2 - height / 2,
                  z * (depth / 2 - 0.09),
                ]}
                color="#555d67"
              />
            )),
          )}
          {Array.from({ length: rack.units }, (_, i) =>
            [-1, 1].flatMap((x) =>
              [-1, 1].map((z) => (
                <Box
                  key={`tick${i}-${x}-${z}`}
                  size={[0.01, 0.009, 0.003]}
                  position={[
                    x * (width / 2 - 0.052),
                    baseHeight + (i + 0.5) * unitHeight - height / 2,
                    z * (depth / 2 - 0.077),
                  ]}
                  color={i % 5 === 4 ? "#9aa6b4" : "#1c232b"}
                />
              )),
            ),
          )}
        </ModelAsset>
      </AssetSelection>
    </group>
  );
}
