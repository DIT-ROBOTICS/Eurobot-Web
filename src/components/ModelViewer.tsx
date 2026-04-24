import React, { useRef, useState, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-theme-accent text-xl p-4 text-center">
          Unable to load 3D model
        </div>
      );
    }

    return this.props.children;
  }
}

// Loading indicator
function LoadingIndicator() {
  return (
    <div className="text-[#e0e0e0] text-xl text-center">
      Loading model...
    </div>
  );
}

// 3D model component
function Model({ url }: { url: string }) {
  const gltf = useGLTF(url, true);
  const { scene } = gltf;
  
  // Apply default material settings to ensure visibility
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material) {
          // Ensure all materials are visible from both sides
          child.material.side = THREE.DoubleSide;
          // Ensure reasonable defaults for material properties
          child.material.needsUpdate = true;
          // Add default color if none exists
          if (!child.material.color) {
            child.material.color = new THREE.Color(0xcccccc);
          }
        }
      }
    });
    
    // Center the model
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.x = -center.x;
    scene.position.y = -center.y;
    scene.position.z = -center.z;
    
  }, [scene]);
  
  return <primitive object={scene} scale={1.5} />;
}

// Camera controller
function CameraController() {
  const { camera, gl } = useThree();
  
  useEffect(() => {
    // Set default camera position
    camera.position.set(3, 3, 3);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  
  return (
    <OrbitControls 
      args={[camera, gl.domElement]} 
      enableDamping={true}
      dampingFactor={0.1} 
      rotateSpeed={0.5}
      minDistance={2}
      maxDistance={10}
    />
  );
}

export default function ModelViewer({ modelPath }: { modelPath: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use low resolution rendering settings to improve performance
  return (
    <div className="w-full h-[400px] bg-[#141414] rounded-lg shadow-inner overflow-hidden">
      <ErrorBoundary>
        <Suspense fallback={<LoadingIndicator />}>
          <Canvas 
            camera={{ position: [3, 3, 3], fov: 45 }}
            gl={{ 
              antialias: false,
              alpha: true,
              powerPreference: 'low-power'
            }}
            dpr={[0.8, 1.2]} // Lower pixel ratio to improve performance
            shadows={false}  // Disable shadows for better performance
          >
            <color attach="background" args={['#141414']} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 5, 5]} intensity={0.8} />
            <CameraController />
            <Model url={modelPath} />
          </Canvas>
        </Suspense>
      </ErrorBoundary>
      
      {error && (
        <div className="absolute inset-0 bg-[#141414] bg-opacity-80 flex items-center justify-center">
          <div className="text-theme-accent text-xl p-4 text-center">
            {error}
          </div>
        </div>
      )}
      
      <div className="absolute bottom-2 right-2 text-[#666666] text-xs">
        Use mouse to rotate, scroll to zoom
      </div>
    </div>
  );
} 