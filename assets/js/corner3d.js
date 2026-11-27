/* FST09e front corner, rendered from the team STEP file.
   data-mode="scroll": the project page, scroll drives the explode, balloons + parts list.
   data-mode="hero":   the home page, explodes once when loaded.
   The 2.5D layered image underneath stays as placeholder and fallback. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

document.querySelectorAll('[data-corner3d]').forEach(host =>
  init(host).catch(err => {
    console.warn('3D view unavailable:', err);
    host.dispatchEvent(new CustomEvent('corner3d:fail', { bubbles: true }));
  }));

// part materials, matched to the original SolidWorks render
const MATERIALS = {
  disc:      { color: 0x8d9195, metalness: 0.9,  roughness: 0.5 },
  caliper:   { color: 0xe9e8e4, metalness: 0.0,  roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 },
  pad:       { color: 0x6a1712, metalness: 0.0,  roughness: 0.75 },
  darksteel: { color: 0x3b3e42, metalness: 0.8,  roughness: 0.5 },
  alu:       { color: 0xd3d6da, metalness: 1.0,  roughness: 0.27 },
  upright:   { color: 0x5b6067, metalness: 0.85, roughness: 0.36 },
  rubber:    { color: 0x1c1c1e, metalness: 0.0,  roughness: 0.85 },
  shell:     { color: 0xeae8e3, metalness: 0.0,  roughness: 0.48, clearcoat: 0.15 },
  fastener:  { color: 0x2c2d30, metalness: 0.75, roughness: 0.42 },
  steel:     { color: 0xa3a7ac, metalness: 1.0,  roughness: 0.33 },
};

// explode vectors in mm, local frame: +X = inboard along the wheel axis
const EXPLODE = {
  hub: [-330, 0, 0], disc: [-250, 0, 0], caliper: [-120, 15, -110], bear_out: [-175, 0, 0],
  trans: [-100, 0, 0], upright: [0, 0, 0], bear_in: [60, 0, 0], flange: [130, 0, 0], motor: [250, 0, 0],
};
const BALLOONS = [
  [1, 'hub', [-55, 38, 48]], [2, 'disc', [0, -75, 50]], [3, 'caliper', [0, 30, -20]], [4, 'trans', [-10, 52, 0]],
  [5, 'bear_out', [0, 50, 22]], [6, 'upright', [0, -60, 50]], [7, 'flange', [0, -62, 40]], [8, 'motor', [40, 60, 30]],
];

const ease = q => q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

async function init(host) {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no WebGL');

  const mode = host.dataset.mode || 'scroll';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(24, 16 / 10, 10, 6000);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a958b, 0.35));

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(host.dataset.corner3d);

  const groups = {};
  const root = new THREE.Group();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const nm = o.name.includes('__') ? o.name : (o.parent && o.parent.name) || '';
    const [g, mat] = nm.split('__');
    if (!EXPLODE[g]) return;
    if (!groups[g]) { groups[g] = new THREE.Group(); groups[g].name = g; root.add(groups[g]); }
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    const m = new THREE.Mesh(o.geometry, new THREE.MeshPhysicalMaterial({
      ...(MATERIALS[mat] || MATERIALS.steel), side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true;
    m.applyMatrix4(o.matrixWorld);
    groups[g].add(m);
  });
  scene.add(root);

  const anchors = {};
  for (const g in groups) anchors[g] = new THREE.Box3().setFromObject(groups[g]).getCenter(new THREE.Vector3());
  const setExplode = t => { for (const g in groups) groups[g].position.set(...EXPLODE[g].map(v => v * t)); };

  // shadow catcher under the assembly
  const boxAt = t => { setExplode(t); root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(root); };
  const boxes = [boxAt(0), boxAt(1)]; setExplode(0);
  const floorY = Math.min(boxes[0].min.y, boxes[1].min.y) - 6;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.14 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = floorY; ground.receiveShadow = true;
  scene.add(ground);
  const all = boxes[0].clone().union(boxes[1]);
  const mid = all.getCenter(new THREE.Vector3());
  key.position.copy(mid).add(new THREE.Vector3(-260, 900, 320));
  key.target.position.copy(mid);
  const sc = key.shadow.camera; const span = all.getSize(new THREE.Vector3()).length() * 0.7;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 100; sc.far = 3000; sc.updateProjectionMatrix();

  // framing: distance so the box fills the view, for the assembled and exploded states
  const dir = new THREE.Vector3(-0.62, 0.36, 0.70).normalize();
  const frames = [{}, {}];
  const fill = mode === 'hero' ? 0.9 : 0.9;
  // sample real vertices per group so framing follows the parts, not their bounding box
  const samples = {};
  for (const g in groups) {
    const pts = [];
    groups[g].children.forEach(m => {
      const pos = m.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 400));
      const v3 = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += step) pts.push(v3.fromBufferAttribute(pos, i).applyMatrix4(m.matrix).clone());
    });
    samples[g] = pts;
  }
  function fit() {
    [0, 1].forEach(i => {
      const pts = [];
      for (const g in samples) { const off = new THREE.Vector3(...EXPLODE[g].map(x => x * i)); samples[g].forEach(p => pts.push(p.clone().add(off))); }
      const c = boxes[i].getCenter(new THREE.Vector3());
      let d = boxes[i].getSize(new THREE.Vector3()).length() * 1.6;
      const right = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Vector3();
      for (let it = 0; it < 8; it++) {
        camera.position.copy(c).addScaledVector(dir, d); camera.lookAt(c); camera.updateMatrixWorld();
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of pts) { q.copy(p).project(camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
        // re-centre on screen, then scale distance to fill
        const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d, hw = hh * camera.aspect;
        right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
        c.addScaledVector(right, (x0 + x1) / 2 * hw).addScaledVector(up, (y0 + y1) / 2 * hh);
        d *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / fill;
      }
      frames[i] = { c, d };
    });
  }

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = THREE.MathUtils.degToRad(25); controls.maxPolarAngle = THREE.MathUtils.degToRad(100);
  controls.enabled = fine;
  const userDir = dir.clone();
  let dragging = false;
  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('end', () => { dragging = false; });
  controls.addEventListener('change', () => { if (dragging) userDir.copy(camera.position).sub(controls.target).normalize(); });

  // balloons (project page only)
  const layer = document.createElement('div'); layer.className = 'balloons3d';
  const balloonEls = mode === 'scroll' ? BALLOONS.map(([n, g, off]) => {
    const el = document.createElement('span');
    el.className = 'balloon' + (n === 1 || n === 6 ? ' mine' : '');
    el.textContent = n; el.setAttribute('aria-hidden', 'true');
    layer.appendChild(el);
    return { el, g, off: new THREE.Vector3(...off) };
  }) : [];

  const stage = host.querySelector('.stage3d');
  stage.append(canvas, layer);

  let t = reduce ? 1 : 0, shown = t, focus = null, az = 0, portrait = false;
  const center = new THREE.Vector3(), v = new THREE.Vector3();

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 30 : 24;
    portrait = !fine && w / h < 1.05;  // portrait touch screens: explode runs top to bottom
    if (portrait) camera.up.set(0.88, 0.3, -0.36).normalize(); else camera.up.set(0, 1, 0);
    ground.visible = !portrait;
    camera.updateProjectionMatrix();
    fit();
  }

  function render() {
    if (!frames[0].c) return;
    shown += (t - shown) * (reduce ? 1 : 0.16);
    setExplode(shown);
    center.lerpVectors(frames[0].c, frames[1].c, shown);
    const dist = frames[0].d + (frames[1].d - frames[0].d) * shown;
    const d = fine ? userDir : dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), az);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(d, dist);
    if (fine) controls.update(); else camera.lookAt(center);
    renderer.render(scene, camera);
    const w = stage.clientWidth, h = stage.clientHeight;
    const vis = clamp((shown - 0.65) / 0.3, 0, 1);
    for (const b of balloonEls) {
      v.copy(anchors[b.g]).add(b.off).add(groups[b.g].position).project(camera);
      b.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)`;
      b.el.style.opacity = (focus && focus !== b.g ? 0.2 : 1) * vis;
    }
  }

  // render only while on screen
  let visible = true, raf = 0;
  const loop = () => { raf = 0; render(); if (visible) raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); })
    .observe(stage);

  if (mode === 'scroll') {
    const track = host.closest('.explode-track');
    const sticky = host.closest('.explode-sticky');
    const onScroll = () => {
      if (reduce || !track) return;
      const r = track.getBoundingClientRect(), s = sticky.getBoundingClientRect();
      const span = r.height - s.height;
      const p = span > 0 ? clamp((s.top - r.top) / span, 0, 1) : 1;
      t = ease(Math.min(1, p / 0.8));
      if (!fine) az = THREE.MathUtils.degToRad(-12 + 24 * p);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const setFocus = g => {
      focus = g;
      for (const k in groups) groups[k].children.forEach(o => {
        const on = !g || g === k;
        o.material.transparent = !on; o.material.opacity = on ? 1 : 0.12; o.material.depthWrite = on;
        o.castShadow = on; o.material.needsUpdate = true;
      });
    };
    document.querySelectorAll('.parts [data-for3d]').forEach(row => {
      const g = row.dataset.for3d;
      row.addEventListener('mouseenter', () => setFocus(g)); row.addEventListener('mouseleave', () => setFocus(null));
      row.addEventListener('focusin', () => setFocus(g)); row.addEventListener('focusout', () => setFocus(null));
    });
  } else if (!reduce) {
    // hero: hold assembled for a beat, then explode once
    shown = t = 0;
    setTimeout(() => {
      const start = performance.now(), dur = 1900;
      const step = now => { const p = clamp((now - start) / dur, 0, 1); t = ease(p); shown = t; if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, 700);
  }

  new ResizeObserver(resize).observe(stage);
  resize();
  render();
  // swap the 2.5D placeholder out once the first frame is drawn
  requestAnimationFrame(() => {
    host.classList.add('is-3d');
    host.dispatchEvent(new CustomEvent('corner3d:ready', { bubbles: true }));
    if (!raf) raf = requestAnimationFrame(loop);
  });
}
