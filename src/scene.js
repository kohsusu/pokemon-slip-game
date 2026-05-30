import * as THREE from 'three';

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 80, 200);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 12, 16);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(30, 80, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);
  scene.add(sun.target);   // must be in scene for target.position updates to take effect

  // Clouds — InstancedMesh: 20 clouds → 1 draw call (was 20 individual BoxGeometry meshes)
  const _cloudCount = 20;
  const _cloudGeo   = new THREE.BoxGeometry(1, 1, 1);   // unit cube; scale baked into matrices
  const _cloudMat   = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const cloudMesh   = new THREE.InstancedMesh(_cloudGeo, _cloudMat, _cloudCount);
  cloudMesh.castShadow    = false;
  cloudMesh.receiveShadow = false;
  const _cm = new THREE.Matrix4();
  for (let i = 0; i < _cloudCount; i++) {
    _cm.makeScale(
      8  + Math.random() * 12,
      3  + Math.random() * 3,
      6  + Math.random() * 6,
    );
    _cm.setPosition(
      (Math.random() - 0.5) * 160,
      25 + Math.random() * 20,
      -20 - Math.random() * 100,
    );
    cloudMesh.setMatrixAt(i, _cm);
  }
  cloudMesh.instanceMatrix.needsUpdate = true;
  scene.add(cloudMesh);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, sun };
}
