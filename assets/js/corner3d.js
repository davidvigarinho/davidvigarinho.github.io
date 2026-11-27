/* FST09e front corner: real 3D exploded view from the team STEP file.
   Replaces the 2.5D layers when WebGL is available. Scroll drives the explode
   (assembled -> exploded); drag rotates on devices with a fine pointer. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const host = document.querySelector('[data-corner3d]');
if (host) init(host).catch(err => { console.warn('3D view unavailable:', err); });

async function init(host) {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const css = getComputedStyle(document.documentElement);
  const col = n => new THREE.Color(css.getPropertyValue(n).trim());

  // explode vectors in mm, local frame: +X = inboard along the wheel axis
  const EXPLODE = {
    hub: [-330, 0, 0], disc: [-250, 0, 0], caliper: [-120, 15, -110], bear_out: [-175, 0, 0],
    trans: [-100, 0, 0], upright: [0, 0, 0], bear_in: [60, 0, 0], flange: [130, 0, 0], motor: [250, 0, 0],
  };
  // balloon item -> group, plus an offset from the group anchor (mm) so it sits on the part
  const BALLOONS = [
    [1, 'hub', [-55, 38, 48]], [2, 'disc', [0, -75, 50]], [3, 'caliper', [0, 30, -20]], [4, 'trans', [-10, 52, 0]],
    [5, 'bear_out', [0, 50, 22]], [6, 'upright', [0, -60, 50]], [7, 'flange', [0, -62, 40]], [8, 'motor', [40, 60, 30]],
  ];
  const GROUP_OF = Object.fromEntries(BALLOONS.map(([n, g]) => [n, g]));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 16 / 10, 10, 6000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8a80, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(600, 300, -500); scene.add(rim);

  const surf = { roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const matOther = new THREE.MeshStandardMaterial({ color: 0xcfcbc2, ...surf });
  const matMine = new THREE.MeshStandardMaterial({ color: col('--red'), ...surf, roughness: 0.5 });
  const EDGE_OP = 0.42;
  const matEdge = new THREE.LineBasicMaterial({ color: col('--ink'), transparent: true, opacity: EDGE_OP });

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(host.dataset.corner3d);

  const groups = {};
  const root = new THREE.Group();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!(o.isMesh || o.isLine || o.isLineSegments)) return;
    const nm = o.name.includes('__') ? o.name : (o.parent && o.parent.name) || '';
    const [g, kind] = nm.split('__');
    if (!EXPLODE[g]) return;
    if (!groups[g]) { groups[g] = new THREE.Group(); groups[g].name = g; root.add(groups[g]); }
    let obj;
    if (o.isMesh) {
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      obj = new THREE.Mesh(o.geometry, kind === 'mine' ? matMine.clone() : matOther.clone());
    } else {
      obj = new THREE.LineSegments(o.geometry, matEdge.clone());
      obj.renderOrder = 2;
    }
    obj.applyMatrix4(o.matrixWorld);
    groups[g].add(obj);
  });
  scene.add(root);

  // frame the exploded assembly
  const fitBox = () => {
    const saved = Object.keys(groups).map(g => groups[g].position.clone());
    setExplode(0);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    Object.keys(groups).forEach((g, i) => groups[g].position.copy(saved[i]));
    return box;
  };

  const anchors = {};
  for (const g in groups) {
    const box = new THREE.Box3().setFromObject(groups[g]);
    anchors[g] = box.getCenter(new THREE.Vector3());
  }

  function setExplode(t) { // t: 0 assembled, 1 exploded
    for (const g in groups) groups[g].position.set(...EXPLODE[g].map(v => v * t));
  }

  const dir = new THREE.Vector3(-0.62, 0.36, 0.70).normalize();
  function boxAt(t) { setExplode(t); root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(root); }
  const boxes = [boxAt(0), boxAt(1)]; setExplode(0);
  const frames = [{}, {}];
  function fit() { // distance so that the box fills ~86% of the view, per state
    boxes.forEach((bx, i) => {
      const c = bx.getCenter(new THREE.Vector3());
      const pts = [];
      for (let k = 0; k < 8; k++) pts.push(new THREE.Vector3(k & 1 ? bx.max.x : bx.min.x, k & 2 ? bx.max.y : bx.min.y, k & 4 ? bx.max.z : bx.min.z));
      let d = bx.getSize(new THREE.Vector3()).length() * 1.6;
      for (let it = 0; it < 6; it++) {
        camera.position.copy(c).addScaledVector(dir, d); camera.lookAt(c); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        const m = Math.max(...pts.map(p => { const q = p.clone().project(camera); return Math.max(Math.abs(q.x), Math.abs(q.y)); }));
        d *= m / 0.93;
      }
      frames[i] = { c, d };
    });
  }
  const center = new THREE.Vector3();
  let baseDist = 1;
  const controls = new OrbitControls(camera, canvas);
  key.position.set(-500, 700, 400);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = THREE.MathUtils.degToRad(25); controls.maxPolarAngle = THREE.MathUtils.degToRad(115);
  controls.enabled = fine;
  const offset = new THREE.Vector3(); // user rotation, kept as a direction
  let az = 0, userDir = dir.clone();
  controls.addEventListener('change', () => { userDir.copy(camera.position).sub(controls.target).normalize(); });

  // balloons
  const layer = document.createElement('div'); layer.className = 'balloons3d';
  const balloonEls = BALLOONS.map(([n, g, off]) => {
    const el = document.createElement('span');
    el.className = 'balloon' + (n === 1 || n === 6 ? ' mine' : '');
    el.dataset.layer = g; el.textContent = n; el.setAttribute('aria-hidden', 'true');
    layer.appendChild(el);
    return { el, g, off: new THREE.Vector3(...off) };
  });

  // swap in
  const stage = host.querySelector('.stage3d');
  stage.append(canvas, layer);
  host.classList.add('is-3d');

  let t = reduce ? 1 : 0, shown = 0, focus = null;
  const v = new THREE.Vector3();

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the assembly framed on narrow screens
    camera.fov = w / h < 1.2 ? 30 : 24;
    // portrait touch screens: run the explode axis top to bottom
    if (!fine && w / h < 1.05) camera.up.set(0.88, 0.3, -0.36).normalize(); else camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    fit();
  }

  function frame() {
    shown += (t - shown) * (reduce ? 1 : 0.18);
    setExplode(shown);
    center.lerpVectors(frames[0].c, frames[1].c, shown);
    baseDist = frames[0].d + (frames[1].d - frames[0].d) * shown;
    const d = fine ? userDir : dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), az);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(d, baseDist);
    if (fine) controls.update(); else camera.lookAt(center);
    renderer.render(scene, camera);
    const w = stage.clientWidth, h = stage.clientHeight;
    const vis = Math.max(0, Math.min(1, (shown - 0.65) / 0.3));
    for (const b of balloonEls) {
      v.copy(anchors[b.g]).add(b.off).add(groups[b.g].position).project(camera);
      b.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)`;
      b.el.style.opacity = (focus && focus !== b.g ? 0.2 : 1) * vis;
    }
    requestAnimationFrame(frame);
  }

  // scroll -> explode
  const track = host.closest('.explode-track');
  const onScroll = () => {
    if (reduce || !track) return;
    const r = track.getBoundingClientRect();
    const span = r.height - innerHeight;
    const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 1;
    const q = Math.min(1, p / 0.75);
    t = q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
    if (!fine) az = THREE.MathUtils.degToRad(-12 + 24 * p); // touch: slow orbit with scroll
  };
  addEventListener('scroll', onScroll, { passive: true });

  // parts list highlight
  const setFocus = g => {
    focus = g;
    for (const k in groups) groups[k].children.forEach(o => {
      const on = !g || g === k;
      if (o.isLineSegments) o.material.opacity = on ? EDGE_OP : 0.05;
      else { o.material.transparent = !on; o.material.opacity = on ? 1 : 0.12; o.material.depthWrite = on; o.material.needsUpdate = true; }
    });
  };
  document.querySelectorAll('.parts [data-for3d]').forEach(row => {
    const g = row.dataset.for3d;
    row.addEventListener('mouseenter', () => setFocus(g)); row.addEventListener('mouseleave', () => setFocus(null));
    row.addEventListener('focusin', () => setFocus(g)); row.addEventListener('focusout', () => setFocus(null));
  });

  new ResizeObserver(resize).observe(stage);
  resize(); onScroll(); frame();
  window.__corner3d = { groups, setExplode: x => { t = x; }, GROUP_OF };
}
