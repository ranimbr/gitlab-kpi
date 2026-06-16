/**
 * components/three/ThreeHeroNetwork.jsx — Enterprise Edition (v2)
 *
 * Design philosophy: "Less is more" — premium enterprise aesthetic.
 *
 * Changes from v1:
 *   · Monochrome blue (#1A56FF) — no rainbow colors, single brand palette
 *   · Fewer, smaller nodes (35 instead of 80, half the size)
 *   · Very subtle edges — low opacity, short connection threshold
 *   · Camera orbit is extremely slow — elegant, not distracting
 *   · Overall scene opacity reduced — content is king, bg is decoration
 *   · Fine particle field replaces colored spheres as the visual base
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeHeroNetwork() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;

    // ── Scene, Camera, Renderer ────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 200);
    camera.position.set(0, 3.5, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap for perf
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // ── Brand color (monochrome — Telnet HQ blue only) ─────────────
    const BRAND = new THREE.Color(0x1a56ff);

    // ── Fine particle field (background texture only) ──────────────
    const STAR_COUNT = 400;
    const starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 70;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 35;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 50 - 5;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMesh = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        size: 0.06,
        color: 0xffffff,
        transparent: true,
        opacity: 0.18, // very faint stars — premium look
      })
    );
    scene.add(starMesh);

    // ── Network Nodes — small, monochrome, elegant ─────────────────
    const NODE_COUNT = 38;
    const SPREAD = 10;
    const nodeData = [];
    const nodeGeo = new THREE.SphereGeometry(0.055, 8, 6); // small

    for (let i = 0; i < NODE_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: BRAND.clone(),
        transparent: true,
        opacity: 0.55 + Math.random() * 0.35, // subtle variation
      });
      const mesh = new THREE.Mesh(nodeGeo, mat);

      // Disc-like spread with variance
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.pow(Math.random(), 0.6) * SPREAD;
      mesh.position.set(
        Math.cos(angle) * rad,
        (Math.random() - 0.5) * 4,
        Math.sin(angle) * rad
      );

      scene.add(mesh);
      nodeData.push({
        mesh,
        baseY: mesh.position.y,
        driftFreq: 0.25 + Math.random() * 0.3,
        driftAmp: 0.12 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        pulseFreq: 0.5 + Math.random() * 0.7,
      });
    }

    // ── Edge system — minimal lines, barely-there ──────────────────
    const MAX_EDGES = 120;
    const edgePos = new Float32Array(MAX_EDGES * 2 * 3);
    const edgeGeo = new THREE.BufferGeometry();
    const edgePosBuf = new THREE.BufferAttribute(edgePos, 3);
    edgePosBuf.setUsage(THREE.DynamicDrawUsage);
    edgeGeo.setAttribute("position", edgePosBuf);

    const edgeMesh = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({
        color: 0x1a56ff,
        transparent: true,
        opacity: 0.12, // very subtle — elegant, not busy
      })
    );
    scene.add(edgeMesh);

    // ── Camera orbit state ─────────────────────────────────────────
    let cameraAngle = 0;
    let mouseX = 0, mouseY = 0;
    let targetX = 0, targetY = 3.5;

    const onMouse = (e) => {
      // Minimal parallax — 10% of original. Barely moves.
      mouseX = (e.clientX / window.innerWidth - 0.5) * 0.8;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 0.5;
    };
    window.addEventListener("mousemove", onMouse);

    const onResize = () => {
      const nw = mount.clientWidth || window.innerWidth;
      const nh = mount.clientHeight || window.innerHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    // ── Animation Loop ─────────────────────────────────────────────
    const clock = new THREE.Clock();
    const CONN_DIST = 2.6;  // shorter = fewer edges = cleaner
    const tmpVec = new THREE.Vector3();
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Very slow camera orbit + micro parallax
      cameraAngle += 0.00025; // 3× slower than v1 — stately
      targetX = Math.sin(cameraAngle) * 16 + mouseX * 0.8;
      targetY = 3.5 + mouseY * -0.6;
      const targetZ = Math.cos(cameraAngle) * 16;

      camera.position.x += (targetX - camera.position.x) * 0.015;
      camera.position.z += (targetZ - camera.position.z) * 0.015;
      camera.position.y += (targetY - camera.position.y) * 0.015;
      camera.lookAt(0, 0, 0);

      // Gentle node drift — breathing, not dancing
      nodeData.forEach((n) => {
        n.mesh.position.y =
          n.baseY + Math.sin(t * n.driftFreq + n.phase) * n.driftAmp;
        // Subtle opacity pulse
        n.mesh.material.opacity =
          0.35 + Math.sin(t * n.pulseFreq + n.phase) * 0.2;
      });

      // Rebuild edges
      let edgeIdx = 0;
      for (let i = 0; i < nodeData.length && edgeIdx < MAX_EDGES; i++) {
        const pa = nodeData[i].mesh.position;
        for (let j = i + 1; j < nodeData.length && edgeIdx < MAX_EDGES; j++) {
          const pb = nodeData[j].mesh.position;
          tmpVec.subVectors(pa, pb);
          if (tmpVec.length() < CONN_DIST) {
            const base = edgeIdx * 2 * 3;
            edgePos[base] = pa.x; edgePos[base + 1] = pa.y; edgePos[base + 2] = pa.z;
            edgePos[base + 3] = pb.x; edgePos[base + 4] = pb.y; edgePos[base + 5] = pb.z;
            edgeIdx++;
          }
        }
      }
      edgePosBuf.needsUpdate = true;
      edgeGeo.setDrawRange(0, edgeIdx * 2);

      // Almost imperceptible star drift
      starMesh.rotation.y = t * 0.003;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        // Global opacity cap — content always wins
        opacity: 0.7,
      }}
    />
  );
}
