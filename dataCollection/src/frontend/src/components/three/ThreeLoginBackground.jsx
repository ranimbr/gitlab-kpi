/**
 * ThreeLoginBackground.jsx — TELNET HOLDING · "AeroSpace Sovereign v16" Ultimate Tech Globe
 *
 * Design philosophy: Enterprise-grade aerospace and satellite technology visualization.
 * Crafted by a Senior UI/UX Specialist & Senior 3D Frontend Engineer.
 *
 * Visual signature in v16:
 *  - Fixed Continent Contrast: Set base color to pure white (0xffffff) upon texture load
 *    to preserve the original high-contrast satellite details and crisp continent outlines.
 *  - Matte-Satin Tech Finish: Switched to a non-reflective MeshStandardMaterial (roughness: 0.85,
 *    metalness: 0.15) to completely eliminate glossy spots, neon billiard reflections, and circular highlights.
 *  - Professional Space Lighting:
 *      * Sun Light: Soft white-cyan (0xd0e8ff, intensity: 3.5) for natural, volumetric day/night shading.
 *      * Ambient Light: Deep navy (0x0b1b3a, intensity: 3.0) for rich, cohesive dark shadows.
 *      * Silhouette Rim Light: Soft blue (0x0055ff, intensity: 2.5) to define the dark side curvature.
 *  - Silhouette Atmospheric Halo: Hugs the planet (R * 1.04) with an edge-only Fresnel cyan glow.
 *  - Maintained the transparent background, orbits, and scaled-up (2.0x) titanium CubeSats.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeLoginBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let W = mount.clientWidth  || window.innerWidth;
    let H = mount.clientHeight || window.innerHeight;

    /* ─── 1. WebGL Renderer Setup ────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0); // Transparent background to let original CSS gradient shine through
    mount.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 500);
    camera.position.set(0, 2.5, 18.5);

    /* Globe group — shifted right to provide perfect breathing space for the login panel */
    const globe = new THREE.Group();
    globe.position.set(1.5, -0.2, 0);
    scene.add(globe);

    const R = 3.6; // Perfect scale for the screen estate

    /* ─── 2. Clean Studio Space Lighting ─────────────────────────── */
    // Deep navy ambient fill for cohesive cosmic shadows
    const ambientLight = new THREE.AmbientLight(0x0b1b3a, 3.0);
    scene.add(ambientLight);

    // Primary Sun Light (soft white-cyan for realistic day/night delineation)
    const sunLight = new THREE.DirectionalLight(0xd0e8ff, 3.5);
    sunLight.position.set(12, 6, 12);
    scene.add(sunLight);

    // Soft backlight to outline the silhouette of the dark hemisphere
    const backLight = new THREE.DirectionalLight(0x0055ff, 2.5);
    backLight.position.set(-12, -4, -10);
    scene.add(backLight);

    /* ─── 3. Elegant Starfield ───────────────────────────────────── */
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dist = 70 + Math.random() * 50;
      starPositions[i * 3]     = dist * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = dist * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    /* ─── 4. Premium Satellite Earth Globe (High Contrast) ───────── */
    // Non-reflective standard material for a soft, matte-satin technical finish
    const earthMat = new THREE.MeshStandardMaterial({
      color: 0x0a1f44, // Elegant dark slate blue fallback color
      roughness: 0.85,  // High roughness diffuses all shiny highlights
      metalness: 0.15,  // Balanced tech satin feel
      transparent: false,
    });

    const earthSphere = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 64),
      earthMat
    );
    globe.add(earthSphere);

    // Load professional dark-mode satellite Earth texture from stable unpkg CDN
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");
    textureLoader.load(
      "https://unpkg.com/three-globe/example/img/earth-dark.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        earthMat.map = texture;
        // CRITICAL UI/UX FIX: Set color to pure white to let the high-contrast
        // texture details, continents, and oceans render with absolute clarity!
        earthMat.color.setHex(0xffffff);
        earthMat.needsUpdate = true;
      },
      undefined,
      (error) => {
        console.warn("CDN Earth texture load failed, gracefully falling back to corporate shading.", error);
      }
    );

    /* ─── 5. Volumetric Silhouette-Only Atmospheric Halo ───────── */
    // Precision Fresnel shader that glows ONLY at the outer silhouette, leaving the center completely clear.
    // Hugs the planet surface perfectly at R * 1.04 for a crisp, high-tech definition.
    const haloVert = `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    const haloFrag = `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        // Razor-sharp peak at the exact silhouette edge, completely dark in the center
        float intensity = pow(1.0 - abs(dot(normal, viewDir)), 2.2);
        gl_FragColor = vec4(0.0, 0.55, 1.0, 1.0) * intensity * 0.45;
      }
    `;
    const haloMesh = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.04, 48, 48),
      new THREE.ShaderMaterial({
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      })
    );
    globe.add(haloMesh);

    /* ─── 6. Challenge One CubeSats & Precise Orbital Rings ─────── */
    function buildCubeSat(color) {
      const satGroup = new THREE.Group();

      // Main Titanium chassis
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.13),
        new THREE.MeshStandardMaterial({
          color: 0x141a29,
          metalness: 0.95,
          roughness: 0.10,
        })
      );
      satGroup.add(body);

      // Sleek Solar Panels
      [-0.13, 0.13].forEach((panelOffset) => {
        const wingGroup = new THREE.Group();
        const solarCell = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.002, 0.08),
          new THREE.MeshStandardMaterial({
            color: 0x081e4a,
            metalness: 0.85,
            roughness: 0.12,
          })
        );
        const wingFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.004, 0.085),
          new THREE.MeshStandardMaterial({
            color: 0x90a2b5,
            metalness: 0.95,
            roughness: 0.15,
          })
        );
        wingFrame.position.y = -0.001;
        wingGroup.add(solarCell);
        wingGroup.add(wingFrame);
        wingGroup.position.x = panelOffset;
        satGroup.add(wingGroup);
      });

      // Tiny cyan telemetry thruster glow
      const thruster = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 8, 8),
        new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
        })
      );
      thruster.position.z = -0.075;
      satGroup.add(thruster);

      return satGroup;
    }

    const orbits = [];
    const ORBIT_CFG = [
      { r: R * 1.35, inc: 0.35 * Math.PI, raan: 0.5, color: 0x0077ff, speed: 0.22 },
      { r: R * 1.62, inc: -0.25 * Math.PI, raan: 2.2, color: 0x0055dd, speed: -0.16 },
    ];
    const PARTICLE_COUNT = 90;

    ORBIT_CFG.forEach((cfg) => {
      // Rotation quaternion for the inclined orbit
      const q = new THREE.Quaternion().multiplyQuaternions(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cfg.raan),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), cfg.inc)
      );

      // Elegant, thin ghost orbit track
      const orbitTrack = new THREE.Mesh(
        new THREE.TorusGeometry(cfg.r, 0.003, 4, 150),
        new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: 0.14,
        })
      );
      orbitTrack.quaternion.copy(q);
      globe.add(orbitTrack);

      // Flowing telemetry orbit particles
      const pGeo = new THREE.BufferGeometry();
      const pArr = new Float32Array(PARTICLE_COUNT * 3);
      pGeo.setAttribute("position", new THREE.BufferAttribute(pArr, 3));
      const pMesh = new THREE.Points(
        pGeo,
        new THREE.PointsMaterial({
          size: 0.035,
          color: cfg.color,
          transparent: true,
          opacity: 0.70,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      globe.add(pMesh);

      // Miniature Challenge One CubeSat (scaled up by 2.0x for beautiful visibility)
      const sat = buildCubeSat(cfg.color);
      sat.scale.setScalar(2.0);
      globe.add(sat);

      orbits.push({
        q,
        r: cfg.r,
        speed: cfg.speed,
        angle: Math.random() * Math.PI * 2,
        sat,
        pMesh,
        pArr,
      });
    });

    /* ─── 7. Interactive Mouse Parallax ─────────────────────────── */
    let mx = 0, my = 0;
    const onMouseMove = (e) => {
      const rc = mount.getBoundingClientRect();
      mx = ((e.clientX - rc.left) / rc.width  - 0.5) * 2;
      my = ((e.clientY - rc.top)  / rc.height - 0.5) * 2;
    };

    const onResize = () => {
      W = mount.clientWidth  || window.innerWidth;
      H = mount.clientHeight || window.innerHeight;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize",    onResize);

    /* ─── 8. Immersive Animation Loop ───────────────────────────── */
    const clock = new THREE.Clock();
    const vecHolder = new THREE.Vector3();
    let raf;

    (function tick() {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t  = clock.getElapsedTime();

      // Earth rotation speed (0.075) for dynamic visible movement
      globe.rotation.y = t * 0.075;

      // Almost imperceptible background star drift
      stars.rotation.y = t * 0.0004;

      // Inclined orbit CubeSats & particle streams
      orbits.forEach((orb) => {
        orb.angle += orb.speed * dt;

        // Position CubeSat
        vecHolder.set(Math.cos(orb.angle) * orb.r, 0, Math.sin(orb.angle) * orb.r).applyQuaternion(orb.q);
        orb.sat.position.copy(vecHolder);
        orb.sat.rotation.y = orb.angle + Math.PI / 2;

        // Animate particles flowing along the track
        const positions = orb.pMesh.geometry.attributes.position;
        const direction = orb.speed > 0 ? 1.0 : -1.0;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const alpha = (i / PARTICLE_COUNT) * Math.PI * 2 + t * 0.10 * direction;
          vecHolder.set(Math.cos(alpha) * orb.r, 0, Math.sin(alpha) * orb.r).applyQuaternion(orb.q);
          orb.pArr[i * 3]     = vecHolder.x;
          orb.pArr[i * 3 + 1] = vecHolder.y;
          orb.pArr[i * 3 + 2] = vecHolder.z;
        }
        positions.needsUpdate = true;
      });

      // Subtle, high-end camera parallax
      const targetCamX = mx * 0.8 + Math.sin(t * 0.1) * 0.20;
      const targetCamY = 2.5 - my * 0.5 + Math.cos(t * 0.08) * 0.15;
      camera.position.x += (targetCamX - camera.position.x) * 0.03;
      camera.position.y += (targetCamY - camera.position.y) * 0.03;
      camera.lookAt(globe.position);

      renderer.render(scene, camera);
    })();

    /* ─── 9. Cleanup ────────────────────────────────────────────── */
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize",    onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    />
  );
}
