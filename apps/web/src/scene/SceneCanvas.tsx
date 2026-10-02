import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { SunMesh } from "./SunMesh.tsx";
import { PlanetBodies } from "./PlanetBodies.tsx";
import { OrbitLines } from "./OrbitLines.tsx";
import { L1Probe } from "./L1Probe.tsx";
import { CameraRig } from "./CameraRig.tsx";
import { SunEarthLine } from "./SunEarthLine.tsx";

/**
 * The Sun → Earth scene (UF1). Loaded lazily, so pages without it never download three.js.
 * Units are AU; positions come from lib/ephemeris.ts at the server time, read per frame.
 */
export default function SceneCanvas() {
  const hidden = usePageHidden();
  return (
    <Canvas
      className="scene-canvas"
      frameloop={hidden ? "never" : "always"}
      dpr={[1, 2]}
      camera={{ position: [0, 1.25, 1.75], fov: 45, near: 1e-5, far: 200 }}
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
    >
      <color attach="background" args={["#05070c"]} />
      <Stars radius={60} depth={30} count={2500} factor={3} saturation={0} fade speed={0} />
      <ambientLight intensity={0.22} />
      <pointLight position={[0, 0, 0]} intensity={2.2} decay={0} />
      <SunMesh />
      <OrbitLines />
      <PlanetBodies />
      <SunEarthLine />
      <L1Probe />
      <CameraRig />
    </Canvas>
  );
}

/** No frames while the tab is hidden (browsers mostly do this already; this makes it certain). */
function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return hidden;
}
