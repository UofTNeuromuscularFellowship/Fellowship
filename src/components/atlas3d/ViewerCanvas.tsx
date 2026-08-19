// ---------------------------------------------------------------------------
// 3D Atlas viewer canvas.
//
// PHASE 0: this mounts a real WebGL scene with orbit controls but no anatomy —
// the point is to prove the rendering stack, the code-splitting and the device
// performance story before any model assets exist. Phase 1 replaces the
// placeholder group with the loaded region GLB.
//
// Everything in this file (and its three.js imports) must stay inside the
// lazily-loaded /atlas-3d chunk so the main portal bundle is unaffected.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { CameraPose } from '../../data/atlas3d'

/**
 * Applies a region's framing when it changes. R3F only reads the Canvas
 * `camera` prop on mount, so without this, switching regions would keep the
 * previous region's viewpoint.
 */
function CameraRig({ pose, controls }: { pose: CameraPose; controls: React.RefObject<OrbitControlsImpl> }) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    camera.position.set(...pose.position)
    camera.updateProjectionMatrix()
    if (controls.current) {
      controls.current.target.set(...pose.target)
      controls.current.update()
    }
    invalidate() // frameloop is "demand" — ask for a redraw explicitly
  }, [pose, camera, controls, invalidate])

  return null
}

/**
 * Stand-in for the region model. Deliberately abstract: it is a scale and
 * orientation reference, not anatomy, so nobody can mistake it for a
 * clinical view.
 */
function PlaceholderBody() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.5, 8, 24]} />
        <meshStandardMaterial color="#B9C6D4" roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <capsuleGeometry args={[0.121, 0.5, 4, 16]} />
        <meshBasicMaterial color="#0E7C86" wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

export function ViewerCanvas({ camera }: { camera: CameraPose }) {
  const controls = useRef<OrbitControlsImpl>(null)

  return (
    <Canvas
      // Clipping planes (Phase 2 cross-sections) require this flag on the
      // renderer, so it is set from the start.
      gl={{ localClippingEnabled: true, antialias: true }}
      dpr={[1, 2]}
      camera={{ position: camera.position, fov: 45, near: 0.01, far: 100 }}
      // Only redraw when something changes — meaningful battery saving on
      // phones for a scene the user is often just looking at.
      frameloop="demand"
    >
      <color attach="background" args={['#F7F8FA']} />
      <hemisphereLight intensity={0.7} groundColor="#E2E6EC" />
      <directionalLight position={[2, 4, 3]} intensity={1.1} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />

      <Suspense fallback={null}>
        <PlaceholderBody />
      </Suspense>

      <Grid
        args={[4, 4]}
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#E2E6EC"
        sectionSize={0.5}
        sectionThickness={1}
        sectionColor="#C7D0DB"
        fadeDistance={6}
        infiniteGrid
        position={[0, -0.001, 0]}
      />

      <CameraRig pose={camera} controls={controls} />

      <OrbitControls
        ref={controls}
        makeDefault
        target={camera.target}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.15}
        maxDistance={4}
        // Keyboard orbit/zoom for users who can't use a pointer.
        keyPanSpeed={12}
      />
    </Canvas>
  )
}

export default ViewerCanvas
