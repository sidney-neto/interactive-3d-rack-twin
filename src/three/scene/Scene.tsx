import { useInfrastructure } from "../../data/infrastructureContext";
import { Rack44U } from "../models/Rack44U";
import { PowerSwitch } from "../models/PowerSwitch";
import { XE7745 } from "../models/XE7745";
import { CameraController } from "../camera/CameraController";
import { Lighting } from "./Lighting";
import { ComponentFocusProvider } from "../interactions/ComponentFocus";

export function Scene() {
  const { assets, rack } = useInfrastructure();
  return (
    <ComponentFocusProvider>
      <color attach="background" args={["#191e24"]} />
      <Lighting />
      <Rack44U />
      {assets
        .filter((asset) => !("rackId" in asset) || asset.rackId === rack.id)
        .map((asset) =>
          asset.type === "server" ? (
            <XE7745 key={asset.id} asset={asset} />
          ) : asset.type === "switch" ? (
            <PowerSwitch key={asset.id} asset={asset} />
          ) : null,
        )}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.003, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <shadowMaterial transparent opacity={0.22} />
      </mesh>
      <gridHelper
        args={[6, 30, "#303943", "#252d35"]}
        position={[0, -0.004, 0]}
        // Decorative lines must not occlude Html labels (line-ray tolerance is 1 m).
        raycast={() => {}}
      />
      <CameraController />
    </ComponentFocusProvider>
  );
}
