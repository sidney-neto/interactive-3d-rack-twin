export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#b8cce5", "#30343b", 1.6]} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={3}
        shadow-camera-bottom={-2}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-3, 2, -3]} intensity={2} color="#91afd4" />
    </>
  );
}
