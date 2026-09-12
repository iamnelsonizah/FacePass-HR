"use client";

import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";

export default function ThreeBiometricMedallion() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [interactiveNotice, setInteractiveNotice] = useState<string>("Move cursor to tilt 3D medallion · Click to pulse scan");
  const [scanPulseCount, setScanPulseCount] = useState<number>(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 340;
    const height = container.clientHeight || 340;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 18;

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 3. Colors from Moroccan Palette
    const CLAY = 0xb45c37;
    const ZELLIGE = 0x2c6b5e;
    const INK = 0x21252b;
    const SIGNAL = 0x3f8a4c;

    // 4. Main 3D Pivot Group
    const pivotGroup = new THREE.Group();
    scene.add(pivotGroup);

    // 5. Outer Moroccan 8-Point Star Geometry (Clay)
    const starShape = new THREE.Shape();
    const pointsCount = 8;
    const outerRadius = 5.8;
    const innerRadius = 4.1;

    for (let i = 0; i < pointsCount * 2; i++) {
      const angle = (i * Math.PI) / pointsCount;
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();

    const starPoints = starShape.getPoints(64);
    const starGeom = new THREE.BufferGeometry().setFromPoints(starPoints);
    const starMat = new THREE.LineBasicMaterial({
      color: CLAY,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    const outerStar = new THREE.LineLoop(starGeom, starMat);
    pivotGroup.add(outerStar);

    // 6. Secondary Rotated Octagram (Subtle Clay Shadow)
    const starGeom2 = starGeom.clone();
    starGeom2.rotateZ(Math.PI / 8);
    const starMat2 = new THREE.LineBasicMaterial({
      color: CLAY,
      transparent: true,
      opacity: 0.35,
    });
    const outerStar2 = new THREE.LineLoop(starGeom2, starMat2);
    pivotGroup.add(outerStar2);

    // 7. Middle Zellige Emerald Dashed Orbit Ring
    const ringCurve = new THREE.EllipseCurve(0, 0, 4.4, 4.4, 0, 2 * Math.PI, false, 0);
    const ringPoints = ringCurve.getPoints(72);
    const ringGeom = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineDashedMaterial({
      color: ZELLIGE,
      dashSize: 0.5,
      gapSize: 0.25,
      transparent: true,
      opacity: 0.9,
    });
    const middleRing = new THREE.LineLoop(ringGeom, ringMat);
    middleRing.computeLineDistances();
    pivotGroup.add(middleRing);

    // 8. 3D Facial Landmark Wireframe (512D ArcFace Node Lattice)
    // Curated 3D spatial points approximating human facial topography
    const facialLandmarkPositions: [number, number, number][] = [
      // Forehead / Brow
      [-1.5, 2.2, 0.4], [-0.7, 2.5, 0.8], [0, 2.6, 0.9], [0.7, 2.5, 0.8], [1.5, 2.2, 0.4],
      // Left Eye orbit
      [-1.4, 1.4, 0.7], [-0.8, 1.6, 0.9], [-0.3, 1.4, 0.8], [-0.8, 1.2, 0.7],
      // Right Eye orbit
      [0.3, 1.4, 0.8], [0.8, 1.6, 0.9], [1.4, 1.4, 0.7], [0.8, 1.2, 0.7],
      // Nose Bridge & Tip
      [0, 1.8, 1.0], [0, 0.9, 1.3], [0, 0.1, 1.6], [-0.4, -0.1, 1.2], [0.4, -0.1, 1.2],
      // Cheeks
      [-2.1, 0.4, 0.3], [2.1, 0.4, 0.3], [-1.8, -0.6, 0.5], [1.8, -0.6, 0.5],
      // Mouth / Lips
      [-0.9, -0.8, 1.0], [-0.4, -0.7, 1.3], [0, -0.7, 1.4], [0.4, -0.7, 1.3], [0.9, -0.8, 1.0],
      [-0.5, -1.1, 1.2], [0, -1.2, 1.3], [0.5, -1.1, 1.2],
      // Jawline / Chin
      [-2.0, -1.0, 0.1], [-1.4, -1.9, 0.4], [-0.7, -2.4, 0.8], [0, -2.6, 1.0], [0.7, -2.4, 0.8], [1.4, -1.9, 0.4], [2.0, -1.0, 0.1],
    ];

    const faceVerts = new Float32Array(facialLandmarkPositions.flat());
    const faceGeom = new THREE.BufferGeometry();
    faceGeom.setAttribute("position", new THREE.BufferAttribute(faceVerts, 3));

    // Particle nodes for landmarks
    const faceMat = new THREE.PointsMaterial({
      color: INK,
      size: 0.18,
      transparent: true,
      opacity: 0.85,
    });
    const facePoints = new THREE.Points(faceGeom, faceMat);
    pivotGroup.add(facePoints);

    // Connecting Triangulation Lines for Face Mesh
    const lineIndices = [
      // Brow
      0, 1, 1, 2, 2, 3, 3, 4,
      // Left eye
      5, 6, 6, 7, 7, 8, 8, 5,
      // Right eye
      9, 10, 10, 11, 11, 12, 12, 9,
      // Nose
      2, 13, 13, 14, 14, 15, 15, 16, 15, 17, 16, 14, 17, 14,
      // Mouth
      22, 23, 23, 24, 24, 25, 25, 26, 26, 29, 29, 28, 28, 27, 27, 22,
      // Jaw
      30, 31, 31, 32, 32, 33, 33, 34, 34, 35, 35, 36,
      // Nose to mouth & cheek connections
      15, 24, 16, 22, 17, 26, 18, 5, 19, 11, 20, 22, 21, 26, 28, 33,
    ];

    const meshLineGeom = new THREE.BufferGeometry();
    meshLineGeom.setAttribute("position", new THREE.BufferAttribute(faceVerts, 3));
    meshLineGeom.setIndex(lineIndices);

    const meshLineMat = new THREE.LineBasicMaterial({
      color: ZELLIGE,
      transparent: true,
      opacity: 0.45,
    });
    const faceWireframe = new THREE.LineSegments(meshLineGeom, meshLineMat);
    pivotGroup.add(faceWireframe);

    // 9. Precision Optical Reticle Corners
    const reticleGroup = new THREE.Group();
    const cornerSize = 0.75;
    const cornerRadius = 3.2;

    const createCorner = (cx: number, cy: number, flipX: number, flipY: number) => {
      const cGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, cy - flipY * cornerSize, 0),
        new THREE.Vector3(cx, cy, 0),
        new THREE.Vector3(cx - flipX * cornerSize, cy, 0),
      ]);
      return new THREE.Line(
        cGeom,
        new THREE.LineBasicMaterial({ color: INK, linewidth: 2, transparent: true, opacity: 0.9 })
      );
    };

    reticleGroup.add(createCorner(-cornerRadius, cornerRadius, -1, 1));
    reticleGroup.add(createCorner(cornerRadius, cornerRadius, 1, 1));
    reticleGroup.add(createCorner(-cornerRadius, -cornerRadius, -1, -1));
    reticleGroup.add(createCorner(cornerRadius, -cornerRadius, 1, -1));
    pivotGroup.add(reticleGroup);

    // 10. Horizontal Biometric Laser Scan Beam
    const laserPoints = [new THREE.Vector3(-3.2, 0, 1.4), new THREE.Vector3(3.2, 0, 1.4)];
    const laserGeom = new THREE.BufferGeometry().setFromPoints(laserPoints);
    const laserMat = new THREE.LineBasicMaterial({
      color: SIGNAL,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    const laserBeam = new THREE.Line(laserGeom, laserMat);
    pivotGroup.add(laserBeam);

    // 11. Mouse Movement Interaction Tracking
    let targetRotX = 0;
    let targetRotY = 0;
    let isHovered = false;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      targetRotY = x * 0.55;
      targetRotX = -y * 0.45;
    };

    const handleMouseEnter = () => {
      isHovered = true;
      setInteractiveNotice("Active Tracking · ArcFace 512D Lock-On");
    };

    const handleMouseLeave = () => {
      isHovered = false;
      targetRotX = 0;
      targetRotY = 0;
      setInteractiveNotice("Move cursor to tilt 3D medallion · Click to pulse scan");
    };

    const handleClick = () => {
      setScanPulseCount((c) => c + 1);
      // Brief visual flash
      laserMat.opacity = 1.0;
      faceMat.color.setHex(SIGNAL);
      setTimeout(() => {
        laserMat.opacity = 0.85;
        faceMat.color.setHex(INK);
      }, 350);
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);
    container.addEventListener("click", handleClick);

    // 12. Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();

      // Smooth gyroscopic rotation
      outerStar.rotation.z = elapsedTime * 0.15;
      outerStar2.rotation.z = -elapsedTime * 0.1;
      middleRing.rotation.z = elapsedTime * 0.25;

      // Laser scan sweep vertically back and forth
      laserBeam.position.y = Math.sin(elapsedTime * 2.2) * 2.3;

      // Gentle breathing pulse for facial points
      const scaleBreath = 1 + Math.sin(elapsedTime * 1.8) * 0.025;
      facePoints.scale.set(scaleBreath, scaleBreath, scaleBreath);

      // Interpolate smooth cursor tilt
      pivotGroup.rotation.x += (targetRotX - pivotGroup.rotation.x) * 0.08;
      pivotGroup.rotation.y += (targetRotY - pivotGroup.rotation.y) * 0.08;

      if (!isHovered) {
        pivotGroup.rotation.y += Math.sin(elapsedTime * 0.8) * 0.002;
        pivotGroup.rotation.x += Math.cos(elapsedTime * 0.6) * 0.002;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 13. Window Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("click", handleClick);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      renderer.dispose();
      starGeom.dispose();
      starGeom2.dispose();
      ringGeom.dispose();
      faceGeom.dispose();
      meshLineGeom.dispose();
      laserGeom.dispose();
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center select-none group">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        className="w-[290px] h-[290px] sm:w-[330px] sm:h-[330px] cursor-pointer relative z-10 transition-transform duration-300 group-hover:scale-[1.02]"
        title="Interactive 3D ArcFace Medallion — Drag or hover to rotate in 3D"
      />

      {/* Interactive Micro-badge */}
      <div className="mt-2 text-center pointer-events-none">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--paper,#f3ede0)] border border-[var(--line,rgba(33,37,43,0.14))] rounded-[2px] text-[10px] font-mono text-[var(--ash,#6d6355)] shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3f8a4c] animate-ping" />
          <span>{interactiveNotice}</span>
          {scanPulseCount > 0 && (
            <span className="ml-1 text-[var(--clay,#b45c37)] font-bold">
              · Scanned #{scanPulseCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
