/**
 * ThreeLoginBackground.jsx — Executive "Mission Control" Edition
 *
 * Major fixes for a Senior/Professional aesthetic:
 *   · EXTREMELY slow, majestic physics (framerate independent using Clock.getDelta).
 *   · 1px crisp orbital lines replacing chunky torus geometries to look like a high-end HUD.
 *   · Minimalist glowing satellite nodes replacing clunky boxes (no more "dropped in" / parachuted look).
 *   · Subtle additive blending on glows for professional data-viz feel.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Generate an exact orbital plane rotation
function orbitalQuaternion(inclination, raan) {
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  q1.setFromAxisAngle(new THREE.Vector3(0, 1, 0), raan);
  q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), inclination);
  return q1.multiply(q2);
}

export default function ThreeLoginBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    
    // Tilted camera for an epic but calm perspective
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    camera.position.set(0, 8, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Group to hold the entire planetary system so we can offset it
    // We offset it so it centers in the right panel area
    const systemGroup = new THREE.Group();
    systemGroup.position.set(1.5, 0, 0);
    scene.add(systemGroup);

    // ── 1. BACKGROUND STARS ─────────────────────────────────────────
    const STARS = 2000;
    const sPos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 80 + Math.random() * 60; // distant sphere
        sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        sPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        sPos[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    const starPoints = new THREE.Points(
        starGeo, 
        new THREE.PointsMaterial({ size: 0.12, color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    scene.add(starPoints);

    // ── 2. PLANETARY CORE ───────────────────────────────────────────
    const EARTH_RADIUS = 2.0;

    // Deep dark core
    const coreMesh = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x02050A }) // nearly black
    );
    systemGroup.add(coreMesh);

    // High-tech wireframe grid wrapping the core
    const gridMesh = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS + 0.02, 32, 24),
        new THREE.MeshBasicMaterial({
            color: 0x1A56FF,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending
        })
    );
    systemGroup.add(gridMesh);

    // Subtle atmospheric haze
    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS + 0.6, 32, 32),
        new THREE.MeshBasicMaterial({
            color: 0x1A56FF,
            transparent: true,
            opacity: 0.05,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        })
    );
    systemGroup.add(atmosphere);

    // ── 3. ORBITS AND SATELLITES ────────────────────────────────────
    
    // Abstracted clean data
    const orbitalParams = [
        // inc: tilt, raan: rotation of the tilt, speed: radians per sec (VERY slow, 0.15 is ~42 secs per orbit)
        { r: 3.4, inc: Math.PI * 0.45, raan: 0.0, speed: -0.15, opacity: 0.60, count: 2 },
        { r: 4.8, inc: Math.PI * 0.25, raan: 1.2, speed: 0.10,  opacity: 0.40, count: 1 },
        { r: 6.5, inc: Math.PI * 0.60, raan: 2.8, speed: -0.07, opacity: 0.25, count: 2 },
        { r: 8.5, inc: Math.PI * 0.15, raan: 4.0, speed: 0.04,  opacity: 0.15, count: 1 },
    ];

    const satellites = [];

    // Create a 128-point circle geometry for crisp 1px lines
    const orbitPathGeometry = new THREE.BufferGeometry();
    const orbitPts = [];
    for (let c = 0; c <= 128; c++) {
        const theta = (c / 128) * Math.PI * 2;
        orbitPts.push(new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta))); // base radius 1
    }
    orbitPathGeometry.setFromPoints(orbitPts);

    orbitalParams.forEach((orb) => {
        const q = orbitalQuaternion(orb.inc, orb.raan);

        // Crisp 1px orbit line (High-end HUD style)
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x1A56FF,
            transparent: true,
            opacity: orb.opacity,
            blending: THREE.AdditiveBlending
        });
        const ring = new THREE.LineLoop(orbitPathGeometry, lineMat);
        ring.scale.set(orb.r, orb.r, orb.r); // scale to exact orbit radius
        ring.quaternion.copy(q);
        systemGroup.add(ring);

        // Minimalist data-node "Satellites"
        for(let s = 0; s < orb.count; s++) {
            const satGroup = new THREE.Group();
            
            // Bright solid core
            const glowCore = new THREE.Mesh(
                new THREE.SphereGeometry(0.06, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            
            // Translucent glowing aura
            const glowAura = new THREE.Mesh(
                new THREE.SphereGeometry(0.20, 16, 16),
                new THREE.MeshBasicMaterial({ 
                    color: 0x4a88ff, 
                    transparent: true, 
                    opacity: 0.6,
                    blending: THREE.AdditiveBlending
                })
            );
            
            satGroup.add(glowCore, glowAura);
            systemGroup.add(satGroup);

            satellites.push({
                mesh: satGroup,
                r: orb.r,
                q: q,
                angle: (s / orb.count) * Math.PI * 2 + Math.random(),
                speed: orb.speed // majestic real-time seconds
            });
        }
    });

    // ── MOUSE PARALLAX ──────────────────────────────────────────────
    let mouseX = 0, mouseY = 0;
    const onMouse = (e) => {
        if (!mount) return;
        const rect = mount.getBoundingClientRect();
        mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouse);

    const onResize = () => {
        if (!mount) return;
        width = mount.clientWidth || window.innerWidth;
        height = mount.clientHeight || window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    // ── RENDER LOOP ─────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let animId;
    const workingVec = new THREE.Vector3();

    const animate = () => {
        animId = requestAnimationFrame(animate);
        const delta = Math.min(clock.getDelta(), 0.1); // cap delta for tab-switching

        // Entire system precesses VERY slowly like real cosmos
        systemGroup.rotation.y += 0.02 * delta;
        starPoints.rotation.y += 0.005 * delta;

        // Update satellite positions perfectly along their orbital planes
        satellites.forEach(sat => {
            sat.angle += sat.speed * delta;
            
            // Calculate base position in XZ plane
            workingVec.set(
                Math.cos(sat.angle) * sat.r,
                0,
                Math.sin(sat.angle) * sat.r
            );

            // Apply the exact orbital tilt to snap perfectly onto the crisp line
            workingVec.applyQuaternion(sat.q);
            sat.mesh.position.copy(workingVec);
        });

        // Cinematic, smooth, stable camera parallax
        const targetCamX = 0 + mouseX * 2.0;
        const targetCamY = 8 - mouseY * 1.5;
        camera.position.x += (targetCamX - camera.position.x) * 0.015;
        camera.position.y += (targetCamY - camera.position.y) * 0.015;
        camera.lookAt(systemGroup.position); // Always focus on the center of the planet

        renderer.render(scene, camera);
    };

    animate();

    return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("mousemove", onMouse);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (mount.contains(renderer.domElement)) {
            mount.removeChild(renderer.domElement);
        }
    };
  }, []);

  return (
    <div ref={mountRef} style={{
      position: "absolute", inset: 0, zIndex: 0,
      pointerEvents: "none", overflow: "hidden"
    }} />
  );
}
