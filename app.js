import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ==========================================================================
// GLOBALS & STATE
// ==========================================================================
let scene, camera, renderer, controls;
let bottleBack, bottleFront, cap, labelBack, labelFront;
let neck, handleMesh;
let frontGroup; // Group containing front panel and front label for easy animation
let layersGroup, particlesGroup, wormsGroup;
let ambientLight, dirLight1, dirLight2, spotLight;

// Clipping planes for jerrycan cutaway
const localPlaneBack = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.0);
const localPlaneFront = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.0);
const clipPlaneBack = new THREE.Plane();
const clipPlaneFront = new THREE.Plane();

// State management
const state = {
  cutawayProgress: 0, // 0 = closed, 1 = fully open
  isCutawayOpen: false,
  activeLayer: null,  // 0 to 9, or null for none
  autoRotate: true,
  wormsActive: true,
  materialPreset: 'matte',
  lightingPreset: 'studio',
  wormsData: []       // Stores curve and mesh refs for wiggling
};

// UI Elements
const ui = {
  loaderScreen: document.getElementById('loading-screen'),
  progressBar: document.getElementById('progress-bar'),
  progressText: document.getElementById('progress-text'),
  btnEnter: document.getElementById('btn-enter'),
  toggleCutawayBtn: document.getElementById('toggle-cutaway'),
  cutawaySlider: document.getElementById('cutaway-slider'),
  cutawayVal: document.getElementById('cutaway-val'),
  layerItems: document.querySelectorAll('.layer-item'),
  cameraPresets: document.querySelectorAll('.btn-camera'),
  toggleRotationBtn: document.getElementById('toggle-rotation'),
  toggleWormsBtn: document.getElementById('toggle-worms'),
  materialBtns: document.querySelectorAll('.btn-material'),
  lightBtns: document.querySelectorAll('.btn-light'),
  tabs: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  toggleUiBtn: document.getElementById('toggle-ui')
};

// ==========================================================================
// TEXTURE GENERATORS (Procedural Canvas Textures)
// ==========================================================================

// 1. Procedural Noise Normal Map for HDPE Matte/Glossy Plastic
function generateHDPETexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(256, 256);
  
  for (let i = 0; i < imgData.data.length; i += 4) {
    // High-frequency noise for plastic roughness
    const nx = (Math.random() - 0.5) * 15;
    const ny = (Math.random() - 0.5) * 15;
    const nz = 255;
    
    // Normalize normal vector
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    imgData.data[i]     = Math.floor(((nx / len) + 1) * 127.5);
    imgData.data[i + 1] = Math.floor(((ny / len) + 1) * 127.5);
    imgData.data[i + 2] = Math.floor(((nz / len) + 1) * 127.5);
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 12);
  return texture;
}

// 2. Procedural Organic Textures with normal maps for each layer
function createOrganicTexture(layerIdx) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext('2d');
  
  // Layer-specific color themes
  const themes = [
    // Layer 0: Humus (deep dark black/brown)
    ['#180f0a', '#100a06', '#080503'],
    // Layer 1: Compost Húmedo (dark brown with mycelium fragments)
    ['#2c1a11', '#1f120c', '#3a2419'],
    // Layer 2: Virutas (light tan sawdust)
    ['#d7ccc8', '#bcaaa4', '#efe5fd'],
    // Layer 3: Ramitas/Astillas (woody browns)
    ['#8d6e63', '#6d4c41', '#5d4037'],
    // Layer 4: Recortes de Césped (decaying greens/yellows)
    ['#4caf50', '#689f38', '#8bc34a', '#afb42b'],
    // Layer 5: Cáscaras Huevo (white, cream specks)
    ['#f5f5f5', '#e0e0e0', '#d7ccc8'],
    // Layer 6: Posos de Café (dark uniform granular brown)
    ['#3e2723', '#271714', '#1e0f0d'],
    // Layer 7: Cáscaras de Frutas (orange, yellow, brown spots)
    ['#ff9800', '#ffb74d', '#ff5722', '#a1887f'],
    // Layer 8: Restos Vegetales (mixed organic greens, purples, oranges)
    ['#388e3c', '#d32f2f', '#fbc02d', '#7b1fa2'],
    // Layer 9: Hojas Secas (crisp autumn browns, ambers)
    ['#a1887f', '#8d6e63', '#bcaaa4', '#e0f2f1']
  ];
  
  const colors = themes[layerIdx];
  
  // Draw base texture
  for (let x = 0; x < 512; x += 4) {
    for (let y = 0; y < 512; y += 4) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 4, 4);
      
      // Calculate height for bump map based on color index/intensity
      const r = parseInt(c.slice(1,3), 16) || 0;
      const heightVal = Math.floor(r * 0.8 + Math.random() * 50);
      bCtx.fillStyle = `rgb(${heightVal}, ${heightVal}, ${heightVal})`;
      bCtx.fillRect(x, y, 4, 4);
    }
  }
  
  // Post-process color texture (adds details/organic variance)
  if (layerIdx === 1) {
    // Add white mycelium thread drawings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 25; k++) {
      ctx.beginPath();
      let sx = Math.random() * 512;
      let sy = Math.random() * 512;
      ctx.moveTo(sx, sy);
      for (let j = 0; j < 5; j++) {
        sx += (Math.random() - 0.5) * 40;
        sy += (Math.random() - 0.5) * 40;
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
  }
  
  if (layerIdx === 5) {
    // Eggshell: Draw sharp angular shard contours
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 30; k++) {
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath();
      const sx = Math.random() * 512;
      const sy = Math.random() * 512;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.random()*20, sy + Math.random()*20);
      ctx.lineTo(sx - Math.random()*20, sy + Math.random()*20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Create Three.js textures
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  
  return { map, bumpMap };
}

// ==========================================================================
// MATH HELPERS FOR BOTTLE PROFILE
// ==========================================================================
function getBottleRadiusAtHeight(y) {
  // y ranges from -4.0 to 4.2
  if (y > 3.2) return 0.78; // Neck
  if (y > 2.8) {
    // Shoulder transition
    const t = (y - 2.8) / 0.4;
    return THREE.MathUtils.lerp(1.6, 0.78, t);
  }
  // Body: waist at y=0, wider at top and bottom
  if (y >= 0) {
    const t = y / 2.8;
    return 1.6 - 0.15 * Math.sin(t * Math.PI / 2); // ergonomic indent
  } else {
    const t = -y / 3.8;
    // Taper near base
    return 1.6 - 0.25 * (1 - Math.cos(t * Math.PI / 2));
  }
}

// ==========================================================================
// SHADER & MATERIAL SPECIFICATIONS
// ==========================================================================
let hdpeNormalMap;
const bottleMaterials = {};

function initMaterials(labelTexture) {
  hdpeNormalMap = generateHDPETexture();
  
  // 1. Bottle/Drum materials (vivid cobalt blue HDPE)
  bottleMaterials.matte = new THREE.MeshPhysicalMaterial({
    color: 0x0d47a1,
    roughness: 0.55,
    metalness: 0.1,
    normalMap: hdpeNormalMap,
    normalScale: new THREE.Vector2(0.08, 0.08),
    clearcoat: 0.2,
    clearcoatRoughness: 0.6,
    side: THREE.DoubleSide
  });

  bottleMaterials.glossy = new THREE.MeshPhysicalMaterial({
    color: 0x1976d2,
    roughness: 0.12,
    metalness: 0.12,
    normalMap: hdpeNormalMap,
    normalScale: new THREE.Vector2(0.03, 0.03),
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    side: THREE.DoubleSide
  });

  bottleMaterials.green = new THREE.MeshPhysicalMaterial({
    color: 0x00c853, /* Vivid Green */
    roughness: 0.25,
    metalness: 0.05,
    transmission: 0.6,
    thickness: 0.25,
    ior: 1.45,
    transparent: true,
    side: THREE.DoubleSide
  });

  bottleMaterials.amber = new THREE.MeshPhysicalMaterial({
    color: 0xff6d00, /* Vivid Orange/Amber */
    roughness: 0.2,
    metalness: 0.05,
    transmission: 0.85,
    thickness: 0.4,
    ior: 1.52,
    transparent: true,
    side: THREE.DoubleSide
  });

  // Cap material (matte black drum lid)
  bottleMaterials.cap = new THREE.MeshPhysicalMaterial({
    color: 0x111111,
    roughness: 0.55,
    metalness: 0.1,
    clearcoat: 0.1,
    side: THREE.DoubleSide
  });

  // Label material
  labelTexture.wrapS = THREE.RepeatWrapping;
  labelTexture.wrapT = THREE.ClampToEdgeWrapping;
  
  bottleMaterials.label = new THREE.MeshPhysicalMaterial({
    map: labelTexture,
    roughness: 0.7,
    metalness: 0.05,
    bumpMap: hdpeNormalMap,
    bumpScale: 0.01,
    side: THREE.DoubleSide
  });

  // Assign clipping planes to bottle materials (for back half by default)
  bottleMaterials.matte.clippingPlanes = [clipPlaneBack];
  bottleMaterials.glossy.clippingPlanes = [clipPlaneBack];
  bottleMaterials.green.clippingPlanes = [clipPlaneBack];
  bottleMaterials.amber.clippingPlanes = [clipPlaneBack];
}

// ==========================================================================
// 3D MODEL BUILDERS
// ==========================================================================

function buildBottle() {
  const points = [];
  const segments = 64;
  const profileSteps = 80;
  
  // Define profile curve for plastic drum with outward rolling hoops (anillos de rodadura)
  for (let i = 0; i <= profileSteps; i++) {
    const y = -2.1 + (i / profileSteps) * 4.2;
    let r = 1.15; // Base radius for the drum
    
    // Base curve
    if (y < -1.95) {
      const t = (y + 2.1) / 0.15;
      r = THREE.MathUtils.lerp(0.95, 1.15, t);
    }
    // Shoulder curve
    else if (y > 1.95) {
      const t = (2.1 - y) / 0.15;
      r = THREE.MathUtils.lerp(0.95, 1.15, t);
    }
    // Outward Projecting Ribs/Hoops
    // Hoop 1 (Bottom half)
    else if (y > -0.95 && y < -0.55) {
      const t = Math.abs(y - (-0.75)) / 0.2;
      r = THREE.MathUtils.lerp(1.24, 1.15, Math.min(t, 1));
    }
    // Hoop 2 (Top half)
    else if (y > 0.55 && y < 0.95) {
      const t = Math.abs(y - 0.75) / 0.2;
      r = THREE.MathUtils.lerp(1.24, 1.15, Math.min(t, 1));
    }
    
    points.push(new THREE.Vector2(r, y));
  }
  
  const geomBody = new THREE.LatheGeometry(points, segments);

  // 2. Back Shell (uses clipPlaneBack)
  bottleBack = new THREE.Mesh(geomBody, bottleMaterials.matte);
  bottleBack.castShadow = true;
  bottleBack.receiveShadow = true;
  bottleBack.material.clippingPlanes = [clipPlaneBack];
  scene.add(bottleBack);

  // 3. Front Shell (Cutaway panel - uses clipPlaneFront and cloned material)
  bottleFront = new THREE.Mesh(geomBody, bottleMaterials.matte.clone());
  bottleFront.castShadow = true;
  bottleFront.receiveShadow = true;
  bottleFront.material.clippingPlanes = [clipPlaneFront];

  // Group for the sliding cutaway assembly
  frontGroup = new THREE.Group();
  frontGroup.add(bottleFront);
  scene.add(frontGroup);

  // 4. Central Large Spout / Neck (centered on top at x = 0)
  neck = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 32), bottleMaterials.cap);
  neck.position.set(0, 2.1, 0);
  neck.castShadow = true;
  neck.receiveShadow = true;
  scene.add(neck);

  // 5. Large Black screw cap (sits on top of the spout at x = 0)
  cap = new THREE.Group();
  const capBaseGeom = new THREE.CylinderGeometry(0.46, 0.46, 0.22, 32);
  const capBase = new THREE.Mesh(capBaseGeom, bottleMaterials.cap);
  capBase.castShadow = true;
  cap.add(capBase);

  // Add vertical ridges/ribs to the black lid
  const ribCount = 30;
  const ribGeom = new THREE.BoxGeometry(0.015, 0.2, 0.015);
  for (let i = 0; i < ribCount; i++) {
    const rib = new THREE.Mesh(ribGeom, bottleMaterials.cap);
    const angle = (i / ribCount) * Math.PI * 2;
    rib.position.set(Math.cos(angle) * 0.47, 0, Math.sin(angle) * 0.47);
    rib.rotation.y = -angle;
    rib.castShadow = true;
    cap.add(rib);
  }
  cap.position.set(0, 2.2, 0);
  scene.add(cap);

  // 6. Dual Side Handles (two black loop handles on left and right shoulder)
  // Left Handle
  const leftHandlePoints = [];
  leftHandlePoints.push(new THREE.Vector3(-1.08, 1.8, 0));
  leftHandlePoints.push(new THREE.Vector3(-1.26, 1.65, 0));
  leftHandlePoints.push(new THREE.Vector3(-1.08, 1.5, 0));
  const leftHandleCurve = new THREE.CatmullRomCurve3(leftHandlePoints);
  const leftHandleGeom = new THREE.TubeGeometry(leftHandleCurve, 10, 0.07, 12, false);
  const leftHandle = new THREE.Mesh(leftHandleGeom, bottleMaterials.cap);
  leftHandle.castShadow = true;
  leftHandle.receiveShadow = true;
  scene.add(leftHandle);

  // Right Handle
  const rightHandlePoints = [];
  rightHandlePoints.push(new THREE.Vector3(1.08, 1.8, 0));
  rightHandlePoints.push(new THREE.Vector3(1.26, 1.65, 0));
  rightHandlePoints.push(new THREE.Vector3(1.08, 1.5, 0));
  const rightHandleCurve = new THREE.CatmullRomCurve3(rightHandlePoints);
  const rightHandleGeom = new THREE.TubeGeometry(rightHandleCurve, 10, 0.07, 12, false);
  const rightHandle = new THREE.Mesh(rightHandleGeom, bottleMaterials.cap);
  rightHandle.castShadow = true;
  rightHandle.receiveShadow = true;
  scene.add(rightHandle);
  
  // Save references for update rotations in render loop
  handleMesh = new THREE.Group();
  handleMesh.add(leftHandle);
  handleMesh.add(rightHandle);
  scene.add(handleMesh);

  // 7. Labels (placed inside the recessed channel of the drum body)
  // Back Label
  const labelGeomBack = new THREE.CylinderGeometry(1.155, 1.155, 1.4, 64, 1, true, -Math.PI / 2, Math.PI);
  adjustLabelUVs(labelGeomBack, true);
  labelBack = new THREE.Mesh(labelGeomBack, bottleMaterials.label);
  labelBack.receiveShadow = true;
  scene.add(labelBack);
  
  // Front Label
  const labelGeomFront = new THREE.CylinderGeometry(1.155, 1.155, 1.4, 64, 1, true, Math.PI / 2, Math.PI);
  adjustLabelUVs(labelGeomFront, false);
  labelFront = new THREE.Mesh(labelGeomFront, bottleMaterials.label);
  labelFront.castShadow = true;
  frontGroup.add(labelFront);
}

// Maps the texture maps specifically to fit the curved wrap-around
function adjustLabelUVs(geometry, isBack) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i);
    let v = uv.getY(i);
    
    // Scale and shift horizontal coords
    if (isBack) {
      u = u * 0.5 + 0.5;
    } else {
      u = u * 0.5;
    }
    uv.setXY(i, u, v);
  }
  geometry.attributes.uv.needsUpdate = true;
}

// ==========================================================================
// ORGANIC INTERNAL COMPOST LAYERS
// ==========================================================================
const compostLayers = [];

function buildOrganicLayers() {
  layersGroup = new THREE.Group();
  particlesGroup = new THREE.Group();
  wormsGroup = new THREE.Group();
  scene.add(layersGroup);
  scene.add(particlesGroup);
  scene.add(wormsGroup);
  
  // Custom helper to create rounded rectangle extrusion for a layer
  function createLayerGeometry(width, depth, height, radius) {
    const shape = new THREE.Shape();
    // Draw 2D shape in XY plane
    const w = width - radius * 2;
    const h = depth - radius * 2;
    const r = radius;
    shape.moveTo(-w/2, -h/2 - r);
    shape.lineTo(w/2, -h/2 - r);
    shape.quadraticCurveTo(w/2 + r, -h/2 - r, w/2 + r, -h/2);
    shape.lineTo(w/2 + r, h/2);
    shape.quadraticCurveTo(w/2 + r, h/2 + r, w/2, h/2 + r);
    shape.lineTo(-w/2, h/2 + r);
    shape.quadraticCurveTo(-w/2 - r, h/2 + r, -w/2 - r, h/2);
    shape.lineTo(-w/2 - r, -h/2);
    shape.quadraticCurveTo(-w/2 - r, -h/2 - r, -w/2, -h/2 - r);

    const extrudeSettings = {
      steps: 1,
      depth: height,
      bevelEnabled: false // no bevel for flush layering
    };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center();
    // Rotate so extrusion direction is Y (vertical)
    geom.rotateX(-Math.PI / 2);
    return geom;
  }

  const layerHeight = 3.8 / 10; // 3.8 total height (from -1.9 to 1.9)
  
  for (let i = 0; i < 10; i++) {
    const yMin = -1.9 + i * layerHeight;
    const yMax = yMin + layerHeight;
    const yCenter = yMin + (layerHeight / 2);
    
    // Drum inner cavity: cylinder layer
    const layerGeom = new THREE.CylinderGeometry(1.08, 1.08, layerHeight, 32);
    
    const textures = createOrganicTexture(i);
    const layerMat = new THREE.MeshStandardMaterial({
      map: textures.map,
      bumpMap: textures.bumpMap,
      bumpScale: 0.06,
      roughness: 0.9,
      transparent: true,
      opacity: 0.95
    });
    
    const layerMesh = new THREE.Mesh(layerGeom, layerMat);
    layerMesh.position.y = yCenter;
    layerMesh.receiveShadow = true;
    
    // Custom data linking to UI index
    layerMesh.userData = { layerIndex: i, originalOpacity: 0.95 };
    
    layersGroup.add(layerMesh);
    compostLayers.push(layerMesh);
    
    // Populate layer with scattered details
    scatterLayerParticles(i, yMin, yMax);
  }
}

// Scatters customized 3D meshes on the front face of each layer
function scatterLayerParticles(layerIdx, yMin, yMax) {
  const pCount = [35, 45, 30, 25, 45, 80, 20, 25, 30, 35][layerIdx];
  
  for (let k = 0; k < pCount; k++) {
    // Scatter in polar coords for cylinder (front hemisphere Z > 0)
    const theta = Math.random() * Math.PI; // front side (0 to 180 degrees)
    const radFactor = 0.2 + Math.random() * 0.75;
    const r = 1.08 * radFactor;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = yMin + Math.random() * (yMax - yMin);
    
    let geom, mat, mesh;
    
    switch (layerIdx) {
      case 9: // Hojas Secas: dry curved planes
        geom = new THREE.PlaneGeometry(0.18, 0.25);
        // Curve the leaf geometry slightly
        const pos = geom.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i);
          pos.setZ(i, Math.sin(vx * 10) * 0.03);
        }
        geom.computeVertexNormals();
        
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.08 + Math.random() * 0.05, 0.4, 0.2 + Math.random() * 0.2),
          roughness: 0.95,
          side: THREE.DoubleSide
        });
        mesh = new THREE.Mesh(geom, mat);
        break;
        
      case 8: // Restos Vegetales: mixed chunky scraps
        const rColor = [0xe64a19, 0x43a047, 0x8e24aa, 0xfdd835][Math.floor(Math.random() * 4)];
        if (Math.random() > 0.5) {
          geom = new THREE.BoxGeometry(0.08 + Math.random()*0.1, 0.05, 0.08);
        } else {
          geom = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8);
        }
        mat = new THREE.MeshStandardMaterial({ color: rColor, roughness: 0.8 });
        mesh = new THREE.Mesh(geom, mat);
        break;
        
      case 7: // Cáscaras Frutas: orange/yellow ribbons
        geom = new THREE.BoxGeometry(0.22, 0.04, 0.02);
        mat = new THREE.MeshStandardMaterial({
          color: Math.random() > 0.4 ? 0xffb74d : 0xe65100,
          roughness: 0.7
        });
        mesh = new THREE.Mesh(geom, mat);
        break;
        
      case 6: // Coffee grounds: Tiny spheres
        geom = new THREE.SphereGeometry(0.03, 4, 4);
        mat = new THREE.MeshStandardMaterial({ color: 0x271714, roughness: 0.9 });
        mesh = new THREE.Mesh(geom, mat);
        break;
        
      case 5: // Eggshells: jagged white shard meshes
        geom = new THREE.BufferGeometry();
        // Generate random triangle shard
        const vertices = new Float32Array([
          0, 0, 0,
          (Math.random() - 0.5) * 0.15, 0.08 + Math.random()*0.1, (Math.random() - 0.5) * 0.15,
          0.08 + Math.random()*0.1, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15
        ]);
        geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.computeVertexNormals();
        mat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8, side: THREE.DoubleSide });
        mesh = new THREE.Mesh(geom, mat);
        break;
        
      case 4: // Grass clippings: green ribbons
        geom = new THREE.BoxGeometry(0.02, 0.15 + Math.random()*0.1, 0.01);
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.25 + Math.random()*0.1, 0.7, 0.3 + Math.random()*0.1),
          roughness: 0.9
        });
        mesh = new THREE.Mesh(geom, mat);
        break;
        
      case 3: // Twigs: small brown cylinders
        geom = new THREE.CylinderGeometry(0.02, 0.02, 0.2 + Math.random()*0.2, 6);
        mat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.95 });
        mesh = new THREE.Mesh(geom, mat);
        break;
        
      case 2: // Wood chips: flat rectangular tan blocks
        geom = new THREE.BoxGeometry(0.12, 0.08, 0.03);
        mat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.9 });
        mesh = new THREE.Mesh(geom, mat);
        break;
        
      case 1: // Compost: small brown chunks and mycelium lines
        geom = new THREE.SphereGeometry(0.04 + Math.random()*0.05, 5, 5);
        mat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.95 });
        mesh = new THREE.Mesh(geom, mat);
        
        // Add random root/mycelium branching (only occasionally)
        if (k % 5 === 0) {
          createMyceliumFiber(x, y, z);
        }
        break;
        
      case 0: // Humus: tiny dark beads
        geom = new THREE.SphereGeometry(0.03 + Math.random()*0.04, 5, 5);
        mat = new THREE.MeshStandardMaterial({ color: 0x150d0a, roughness: 0.9 });
        mesh = new THREE.Mesh(geom, mat);
        
        // Add a wiggling earthworm in the bottom layer humus
        if (k === 0) {
          createEarthworm(x, y, z);
        }
        break;
    }
    
    if (mesh) {
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { layerIndex: layerIdx };
      particlesGroup.add(mesh);
    }
  }
}

// Spawns fine glowing mycelium fibers
function createMyceliumFiber(x, y, z) {
  const linePoints = [];
  let cx = x, cy = y, cz = z;
  linePoints.push(new THREE.Vector3(cx, cy, cz));
  
  for (let i = 0; i < 4; i++) {
    cx += (Math.random() - 0.5) * 0.18;
    cy += (Math.random() - 0.5) * 0.12;
    cz += (Math.random() - 0.5) * 0.18;
    linePoints.push(new THREE.Vector3(cx, cy, cz));
  }
  
  const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6
  });
  const line = new THREE.Line(lineGeom, lineMat);
  line.userData = { layerIndex: 1 };
  particlesGroup.add(line);
}

// Spawns a Tube-based worm mesh with dynamic curve animation
function createEarthworm(x, y, z) {
  const points = [];
  const segments = 5;
  const radius = 0.035;
  
  // Create a wavy vertical path curve
  for (let i = 0; i < segments; i++) {
    points.push(new THREE.Vector3(
      x + Math.sin(i) * 0.08,
      y + (i / segments) * 0.4 - 0.2,
      z + Math.cos(i) * 0.04
    ));
  }
  
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeom = new THREE.TubeGeometry(curve, 20, radius, 8, false);
  const wormMat = new THREE.MeshPhysicalMaterial({
    color: 0xd88880,
    roughness: 0.35,
    metalness: 0.1,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2
  });
  
  const wormMesh = new THREE.Mesh(tubeGeom, wormMat);
  wormMesh.castShadow = true;
  wormsGroup.add(wormMesh);
  
  // Save details for wiggle calculation in the animation loop
  state.wormsData.push({
    mesh: wormMesh,
    basePoints: points.map(p => p.clone()),
    curve: curve,
    radius: radius,
    speed: 1.5 + Math.random() * 2,
    offset: Math.random() * Math.PI * 2
  });
}

// Animates the worms' wiggling curves in real-time
function animateWorms(time) {
  if (!state.wormsActive) return;
  
  state.wormsData.forEach((w) => {
    const updatedPoints = w.basePoints.map((bp, idx) => {
      const p = bp.clone();
      // Apply sine wave perturbation based on index and current time
      const wave = Math.sin(time * w.speed + idx * 1.2 + w.offset) * 0.03;
      p.x += wave;
      p.z += wave;
      return p;
    });
    
    // Reconstruct worm tube geometry dynamically
    w.curve.points = updatedPoints;
    w.mesh.geometry.dispose();
    w.mesh.geometry = new THREE.TubeGeometry(w.curve, 20, w.radius, 8, false);
  });
}

// Highlights specific layers by dimming all others
function updateLayerHighlighting() {
  const isLayerActive = state.activeLayer !== null;
  
  // Process organic layer slices
  compostLayers.forEach((mesh) => {
    const layerIdx = mesh.userData.layerIndex;
    
    if (isLayerActive) {
      if (layerIdx === state.activeLayer) {
        mesh.material.opacity = 0.98;
        mesh.material.emissive = new THREE.Color(0x388e3c);
        mesh.material.emissiveIntensity = 0.25;
      } else {
        mesh.material.opacity = 0.15;
        mesh.material.emissive = new THREE.Color(0x000000);
        mesh.material.emissiveIntensity = 0;
      }
    } else {
      // Restore standard opacity
      mesh.material.opacity = mesh.userData.originalOpacity;
      mesh.material.emissive = new THREE.Color(0x000000);
      mesh.material.emissiveIntensity = 0;
    }
    mesh.material.needsUpdate = true;
  });
  
  // Dim scattered particles & details that do not belong to the highlighted layer
  particlesGroup.children.forEach((child) => {
    const layerIdx = child.userData.layerIndex;
    if (isLayerActive) {
      if (layerIdx === state.activeLayer) {
        if (child.material) child.material.opacity = 1.0;
      } else {
        if (child.material) child.material.opacity = 0.08;
      }
    } else {
      if (child.material) child.material.opacity = 1.0;
    }
  });

  // Highlight/dim worms (only active on layer 0 - Humus)
  wormsGroup.children.forEach((worm) => {
    if (isLayerActive) {
      if (state.activeLayer === 0) {
        worm.material.opacity = 1.0;
        worm.material.transparent = false;
      } else {
        worm.material.opacity = 0.08;
        worm.material.transparent = true;
      }
    } else {
      worm.material.opacity = 1.0;
      worm.material.transparent = false;
    }
    worm.material.needsUpdate = true;
  });
}

// ==========================================================================
// ENVIRONMENT, LIGHTING, AND CAMERA
// ==========================================================================

function setupLights() {
  ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);
  
  // Studio Rim Key Light (Front Right)
  dirLight1 = new THREE.DirectionalLight(0xfff8eb, 1.2);
  dirLight1.position.set(5, 6, 5);
  dirLight1.castShadow = true;
  dirLight1.shadow.mapSize.width = 2048;
  dirLight1.shadow.mapSize.height = 2048;
  dirLight1.shadow.bias = -0.001;
  scene.add(dirLight1);
  
  // Fill Light (Back Left)
  dirLight2 = new THREE.DirectionalLight(0xe8f5e9, 0.6);
  dirLight2.position.set(-5, 3, -5);
  scene.add(dirLight2);
  
  // Spotlight on bottom for dramatic presentation
  spotLight = new THREE.SpotLight(0xffffff, 4.0, 15, Math.PI/4, 0.5, 1);
  spotLight.position.set(0, 8, 2);
  spotLight.target.position.set(0, 0, 0);
  spotLight.castShadow = true;
  spotLight.visible = false; // Enabled only in dynamic/dramatic modes
  scene.add(spotLight);
}

// Updates lighting based on dropdown selections
function updateLightingSetup(preset) {
  state.lightingPreset = preset;
  
  if (preset === 'studio') {
    ambientLight.color.setHex(0xffffff);
    ambientLight.intensity = 0.45;
    
    dirLight1.visible = true;
    dirLight1.position.set(5, 6, 5);
    dirLight1.intensity = 1.5;
    dirLight1.color.setHex(0xfffdf6);
    
    dirLight2.visible = true;
    dirLight2.position.set(-5, 3, -5);
    dirLight2.intensity = 0.6;
    dirLight2.color.setHex(0xd0e8d0);
    
    spotLight.visible = false;
    scene.background = null;
  } 
  else if (preset === 'greenhouse') {
    ambientLight.color.setHex(0xdcedc8);
    ambientLight.intensity = 0.8;
    
    dirLight1.visible = true;
    dirLight1.position.set(4, 8, 2);
    dirLight1.intensity = 1.6;
    dirLight1.color.setHex(0xfff9c4);
    
    dirLight2.visible = true;
    dirLight2.position.set(-4, 2, -3);
    dirLight2.intensity = 0.4;
    dirLight2.color.setHex(0xc8e6c9);
    
    spotLight.visible = false;
  } 
  else if (preset === 'dramatic') {
    ambientLight.color.setHex(0xffffff);
    ambientLight.intensity = 0.12;
    
    dirLight1.visible = true;
    dirLight1.position.set(3, 4, 3);
    dirLight1.intensity = 0.8;
    dirLight1.color.setHex(0xffffff);
    
    dirLight2.visible = false;
    
    spotLight.visible = true;
    spotLight.intensity = 12.0;
  }
}

// Translates camera to specific coordinates smoothly
function animateCameraTo(targetCoords, targetLookAt) {
  gsap.to(camera.position, {
    x: targetCoords.x,
    y: targetCoords.y,
    z: targetCoords.z,
    duration: 1.5,
    ease: 'power2.out',
    onUpdate: () => {
      camera.lookAt(targetLookAt);
    }
  });
  
  gsap.to(controls.target, {
    x: targetLookAt.x,
    y: targetLookAt.y,
    z: targetLookAt.z,
    duration: 1.5,
    ease: 'power2.out'
  });
}

// ==========================================================================
// ANIMATIONS & CUTAWAY CONTROL
// ==========================================================================
function updateCutawayAnimation() {
  // Animate Z slider (slide forward)
  frontGroup.position.z = state.cutawayProgress * 1.5;
  // Animate Y slide (slide downwards slightly)
  frontGroup.position.y = -state.cutawayProgress * 0.8;
  // Rotate slightly to make a cool display angle
  frontGroup.rotation.y = state.cutawayProgress * 0.35;
  
  // Fade out bottle and label materials on the front panel
  const op = 1.0 - (state.cutawayProgress * 0.95);
  
  bottleFront.material.opacity = op;
  bottleFront.material.transparent = true;
  
  labelFront.material.opacity = op;
  labelFront.material.transparent = true;
}

function setCutawayState(open, speed = 1.2) {
  state.isCutawayOpen = open;
  
  if (open) {
    ui.toggleCutawayBtn.classList.add('active');
    ui.toggleCutawayBtn.querySelector('.btn-text').innerText = 'Ocultar Composición';
  } else {
    ui.toggleCutawayBtn.classList.remove('active');
    ui.toggleCutawayBtn.querySelector('.btn-text').innerText = 'Ver Composición';
    // Clear active layers when cutaway closes
    if (state.activeLayer !== null) {
      deactivateAllLayers();
    }
  }
  
  gsap.to(state, {
    cutawayProgress: open ? 1 : 0,
    duration: speed,
    ease: 'power2.inOut',
    onUpdate: () => {
      updateCutawayAnimation();
      ui.cutawaySlider.value = state.cutawayProgress;
      ui.cutawayVal.innerText = `${Math.round(state.cutawayProgress * 100)}%`;
    }
  });
}

function deactivateAllLayers() {
  state.activeLayer = null;
  ui.layerItems.forEach(item => item.classList.remove('active'));
  updateLayerHighlighting();
  
  // Return camera back to standard preset
  triggerCameraPreset('front');
}

function triggerCameraPreset(preset) {
  state.activePreset = preset;
  ui.cameraPresets.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === preset);
  });
  
  switch (preset) {
    case 'front':
      animateCameraTo(new THREE.Vector3(0, 0, 7.5), new THREE.Vector3(0, 0, 0));
      break;
    case 'detail':
      animateCameraTo(new THREE.Vector3(1.8, -1.2, 3.2), new THREE.Vector3(0, -1.5, 0));
      break;
    case 'top':
      animateCameraTo(new THREE.Vector3(0, 8.5, 0.1), new THREE.Vector3(0, 3.5, 0));
      break;
    case 'inside':
      // Open cutaway automatically if zooming inside
      if (!state.isCutawayOpen) {
        setCutawayState(true);
      }
      animateCameraTo(new THREE.Vector3(0, 0, 3.8), new THREE.Vector3(0, 0, 0));
      break;
  }
}

// ==========================================================================
// INITIALIZATION & BINDINGS
// ==========================================================================

function init() {
  // 1. Scene
  scene = new THREE.Scene();
  
  // 2. Camera
  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7.5);
  
  // 3. Renderer
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  
  // 4. Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 3.0;
  controls.maxDistance = 15.0;
  controls.maxPolarAngle = Math.PI / 2 + 0.1; // lock looking from under floor
  controls.target.set(0, 0, 0);

  // 5. Setup lighting
  setupLights();
  
  // 6. Loading assets (Label image)
  const loadingManager = new THREE.LoadingManager();
  
  loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const progress = Math.round((itemsLoaded / itemsTotal) * 100);
    ui.progressBar.style.width = `${progress}%`;
    ui.progressText.innerText = `${progress}%`;
  };
  
  loadingManager.onLoad = () => {
    // Reveal enter button
    ui.progressBar.style.width = '100%';
    ui.progressText.innerText = '100%';
    ui.btnEnter.classList.remove('disabled');
    ui.btnEnter.removeAttribute('disabled');
  };
  
  const textureLoader = new THREE.TextureLoader(loadingManager);
  
  // Load AI label or fallback to procedural if failed
  textureLoader.load(
    'assets/images/label.png',
    (loadedTexture) => {
      buildSceneWithLabel(loadedTexture);
    },
    undefined,
    () => {
      console.warn("Failed to load label.png. Building fallback procedural label...");
      const canvasLabel = document.createElement('canvas');
      canvasLabel.width = 512;
      canvasLabel.height = 512;
      const ctx = canvasLabel.getContext('2d');
      // Simple green/brown gradient print representation
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#1b5e20');
      grad.addColorStop(0.5, '#4caf50');
      grad.addColorStop(1, '#3e2723');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px Outfit';
      ctx.textAlign = 'center';
      ctx.fillText('FERTILIZANTE', 256, 200);
      ctx.fillText('ORGÁNICO', 256, 250);
      ctx.font = '20px Jakarta Sans';
      ctx.fillText('Natural • Biodegradable', 256, 300);
      
      const proceduralTexture = new THREE.CanvasTexture(canvasLabel);
      buildSceneWithLabel(proceduralTexture);
    }
  );
  
  // Window resizing
  window.addEventListener('resize', onWindowResize);
}

function buildSceneWithLabel(labelTex) {
  initMaterials(labelTex);
  buildBottle();
  buildOrganicLayers();
  
  // Animate entrance loading
  animateEntrance();
}

function animateEntrance() {
  gsap.from(camera.position, {
    x: 0,
    y: 5,
    z: 12,
    duration: 2.5,
    ease: 'power3.out'
  });
  
  gsap.from(controls.target, {
    y: -3,
    duration: 2.5,
    ease: 'power3.out'
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================================================
// UI EVENT BINDINGS
// ==========================================================================
function setupUIBindings() {
  
  // Enter visualizer
  ui.btnEnter.addEventListener('click', () => {
    gsap.to(ui.loaderScreen, {
      opacity: 0,
      duration: 1.0,
      onComplete: () => {
        ui.loaderScreen.style.display = 'none';
        state.autoRotate = true;
      }
    });
  });

  // Cutaway actions
  ui.toggleCutawayBtn.addEventListener('click', () => {
    setCutawayState(!state.isCutawayOpen);
  });
  
  ui.cutawaySlider.addEventListener('input', (e) => {
    state.cutawayProgress = parseFloat(e.target.value);
    state.isCutawayOpen = state.cutawayProgress > 0.05;
    
    if (state.isCutawayOpen) {
      ui.toggleCutawayBtn.classList.add('active');
      ui.toggleCutawayBtn.querySelector('.btn-text').innerText = 'Ocultar Composición';
    } else {
      ui.toggleCutawayBtn.classList.remove('active');
      ui.toggleCutawayBtn.querySelector('.btn-text').innerText = 'Ver Composición';
    }
    
    updateCutawayAnimation();
    ui.cutawayVal.innerText = `${Math.round(state.cutawayProgress * 100)}%`;
  });

  // Camera preset buttons
  ui.cameraPresets.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const preset = e.target.dataset.preset;
      triggerCameraPreset(preset);
    });
  });

  // Rotation toggle
  ui.toggleRotationBtn.addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    ui.toggleRotationBtn.classList.toggle('active', state.autoRotate);
  });

  // Worm animation toggle
  ui.toggleWormsBtn.addEventListener('click', () => {
    state.wormsActive = !state.wormsActive;
    ui.toggleWormsBtn.classList.toggle('active', state.wormsActive);
  });

  // Organic layer items click
  ui.layerItems.forEach((item) => {
    item.addEventListener('click', () => {
      const layerIdx = parseInt(item.dataset.layer);
      
      // If clicking already active layer, toggle back off
      if (state.activeLayer === layerIdx) {
        deactivateAllLayers();
        return;
      }
      
      // Auto open composition cutaway if it's closed
      if (!state.isCutawayOpen) {
        setCutawayState(true);
      }
      
      state.activeLayer = layerIdx;
      
      // Toggle class in HTML panel
      ui.layerItems.forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      
      // Scroll list to active element
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      // Highlight layer and dim others
      updateLayerHighlighting();
      
      // Focus camera on layer center Y
      const layerHeight = 6.6 / 10;
      const yCenter = -3.8 + layerIdx * layerHeight + (layerHeight / 2);
      
      // Place camera in detailed view focusing on layer height
      animateCameraTo(new THREE.Vector3(2.2, yCenter, 2.5), new THREE.Vector3(0, yCenter, 0));
    });
  });

  // Dashboard Tab Selectors
  ui.tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      const targetTab = e.target.dataset.tab;
      
      ui.tabs.forEach(t => t.classList.remove('active'));
      ui.tabContents.forEach(c => c.classList.remove('active'));
      
      e.target.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });

  // Bottle Material change options
  ui.materialBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const matName = e.target.dataset.mat;
      state.materialPreset = matName;
      
      ui.materialBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      const newMat = bottleMaterials[matName];
      
      // Retain opacity configuration
      const op = 1.0 - (state.cutawayProgress * 0.95);
      newMat.opacity = op;
      newMat.transparent = (matName === 'green' || matName === 'amber' || state.cutawayProgress > 0.05);
      
      bottleBack.material = newMat;
      bottleBack.material.clippingPlanes = [clipPlaneBack];
      
      bottleFront.material = newMat.clone();
      bottleFront.material.clippingPlanes = [clipPlaneFront];
      
      if (neck) neck.material = newMat;
      if (handleMesh) {
        handleMesh.children.forEach(child => {
          child.material = newMat;
        });
      }
    });
  });

  // Lighting preset options
  ui.lightBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const lightName = e.target.dataset.light;
      
      ui.lightBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      updateLightingSetup(lightName);
    });
  });

  // Toggle UI Panel Visibility (Focus Mode)
  if (ui.toggleUiBtn) {
    ui.toggleUiBtn.addEventListener('click', () => {
      const panel = document.querySelector('.quick-controls');
      panel.classList.toggle('collapsed');
      
      if (panel.classList.contains('collapsed')) {
        ui.toggleUiBtn.setAttribute('title', 'Mostrar opciones');
      } else {
        ui.toggleUiBtn.setAttribute('title', 'Ocultar opciones');
      }
    });
  }
}

// ==========================================================================
// ANIMATION LOOP
// ==========================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  
  if (!bottleBack || !frontGroup) return;
  
  const elapsedTime = clock.getElapsedTime();
  
  // 1. Auto-rotation of bottle assembly (when not inspecting closely or dragging)
  if (state.autoRotate && !controls.state === -1) {
    const rotSpeed = 0.08;
    // Rotate all bottle and layer elements uniformly
    bottleBack.rotation.y = elapsedTime * rotSpeed;
    if (neck) neck.rotation.y = elapsedTime * rotSpeed;
    if (handleMesh) handleMesh.rotation.y = elapsedTime * rotSpeed;
    cap.rotation.y = elapsedTime * rotSpeed;
    labelBack.rotation.y = elapsedTime * rotSpeed;
    layersGroup.rotation.y = elapsedTime * rotSpeed;
    particlesGroup.rotation.y = elapsedTime * rotSpeed;
    wormsGroup.rotation.y = elapsedTime * rotSpeed;
    
    // Front group rotates as well, plus its offset slide rotation
    frontGroup.rotation.y = (elapsedTime * rotSpeed) + (state.cutawayProgress * 0.35);
  } else {
    // If autoRotate is disabled, synchronize rotation coordinates (controls override)
    // To ensure frontGroup and backGroup align perfectly when user manually drags
    const currentRot = bottleBack.rotation.y;
    if (neck) neck.rotation.y = currentRot;
    if (handleMesh) handleMesh.rotation.y = currentRot;
    cap.rotation.y = currentRot;
    labelBack.rotation.y = currentRot;
    layersGroup.rotation.y = currentRot;
    particlesGroup.rotation.y = currentRot;
    wormsGroup.rotation.y = currentRot;
    frontGroup.rotation.y = currentRot + (state.cutawayProgress * 0.35);
  }

  // 2. Wiggle worms
  animateWorms(elapsedTime);

  // 3. Update clipping planes to follow the bottle's rotation & position
  bottleBack.updateMatrixWorld();
  bottleFront.updateMatrixWorld();
  clipPlaneBack.copy(localPlaneBack).applyMatrix4(bottleBack.matrixWorld);
  clipPlaneFront.copy(localPlaneFront).applyMatrix4(bottleFront.matrixWorld);

  // 4. Update Controls and Render
  controls.update();
  renderer.render(scene, camera);
}

// Start
init();
setupUIBindings();
animate();
