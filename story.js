// Scroll story: one FL5 Type R, one GSAP timeline scrubbed by scroll (Lenis lives in main.js).
// The timeline only tweens numbers in S; render() turns S into camera, kit parts and lights every frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);

// Car is 5.0 long on z (nose at -z, tail at +z), 1.4 tall. az = camera angle around it (-90 = left side, -180 = nose, 0 = tail).
const S = {
  az: -90, h: 0.55, dist: 8.2, tx: 0, ty: 0.6, tz: 0, fov: 28,
  split: 0.5,                       // stock | SOKU divider, 0..1 of screen width
  lip: 0, skirt: 0, diff: 0, wing: 0,   // kit parts: 0 = off the car, 1 = fitted
  dark: 0, tint: 0, lights: 0, tunnel: 0, drive: 0,
};

// Kit meshes in fl5.glb (Bobby.2024's model). The wing is fused into the black-trim mesh, so it is cut out by position.
const KIT = { lip: ['Object_40'], skirt: ['Object_39', 'Object_41'], diff: ['Object_42'] };
const OFFSET = { lip: [0, -0.05, -1.1], skirt: [0, 1.1, 0], diff: [0, -0.05, 1.1], wing: [0, 1.2, 0.2] };   // where each part flies in from

const canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (err) { document.documentElement.classList.add('no-gl'); $('#loader').textContent = ''; }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;


  const scene = new THREE.Scene();
  const bg = new THREE.Color('#0b0b0d');
  scene.background = bg;
  const camera = new THREE.PerspectiveCamera(S.fov, 1, 0.1, 200);

  // ---------- garage: SOKU logo walls, honeycomb LED ceiling, red neon, polished floor ----------
  const garage = new THREE.Group();
  scene.add(garage);
  const ROOM = 28, H = 7;
  const wallTex = new THREE.TextureLoader().load('img/soku-wall.webp');
  wallTex.colorSpace = THREE.SRGBColorSpace; wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set(3, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, emissiveMap: wallTex, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.85, side: THREE.BackSide });
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.9, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(ROOM, H, ROOM),
    [wallMat, wallMat, ceilMat, new THREE.MeshBasicMaterial({ visible: false }), wallMat, wallMat]);
  room.position.y = H / 2;
  garage.add(room);

  const floorMat = new THREE.MeshPhysicalMaterial({ color: '#26262a', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM), floorMat);
  floor.rotation.x = -Math.PI / 2;
  garage.add(floor);

  // Honeycomb ceiling: one instanced bar per unique hexagon edge. Colours above 1 = HDR, so they bloom and show in reflections.
  const hexMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(2.4), toneMapped: false });
  const R = 0.85, edges = new Map();
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) {
    const cx = R * 1.5 * q, cz = R * Math.sqrt(3) * (r + q / 2);
    if (Math.hypot(cx, cz) > 6.2) continue;
    for (let k = 0; k < 6; k++) {
      const a1 = Math.PI / 3 * k, a2 = a1 + Math.PI / 3;
      const p1 = [cx + R * Math.cos(a1), cz + R * Math.sin(a1)], p2 = [cx + R * Math.cos(a2), cz + R * Math.sin(a2)];
      edges.set(((p1[0] + p2[0]) * 50 | 0) + ',' + ((p1[1] + p2[1]) * 50 | 0), [p1, p2]);
    }
  }
  const hex = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 0.07), hexMat, edges.size);
  const mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  [...edges.values()].forEach(([p1, p2], n) => {
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 0.92;
    q4.setFromAxisAngle(up, -Math.atan2(p2[1] - p1[1], p2[0] - p1[0]));
    mtx.compose(new THREE.Vector3((p1[0] + p2[0]) / 2, H - 0.25, (p1[1] + p2[1]) / 2), q4, new THREE.Vector3(len, 1, 1));
    hex.setMatrixAt(n, mtx);
  });
  garage.add(hex);

  // Red neon: a skirting line round the room plus two vertical blades on each wall.
  const neonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff1f2a').multiplyScalar(2.2), toneMapped: false });
  const half = ROOM / 2 - 0.05;
  for (const [x, z, ry] of [[0, -half, 0], [0, half, 0], [-half, 0, Math.PI / 2], [half, 0, Math.PI / 2]]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(ROOM, 0.05, 0.05), neonMat);
    line.position.set(x, 0.35, z); line.rotation.y = ry; garage.add(line);
    for (const o of [-4, 4]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06), neonMat);
      blade.position.set(x + (ry ? 0 : o), 2.2, z + (ry ? o : 0)); garage.add(blade);
    }
  }

  // Reflections come from the garage itself: hex lights streak across the paint like a real detailing bay.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(scene, 0.02, 0.1, 100, { position: new THREE.Vector3(0, 1.2, 0) }).texture;
  scene.fog = new THREE.Fog(bg, 18, 48);
  // Fill light so the walls read as a room, not a void.
  const fill = new THREE.HemisphereLight('#ffffff', '#202024', 1.6);
  const key = new THREE.DirectionalLight('#ffffff', 2.2);       // the honeycomb, as one soft overhead light
  key.position.set(1, 8, 2);
  scene.add(fill, key);

  // Soft contact shadow from a radial gradient (the model ships without one).
  const sc = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), g = sc.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64); grad.addColorStop(0, 'rgba(0,0,0,.7)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003;
  scene.add(shadow);

  const paint = new THREE.MeshPhysicalMaterial({ color: '#a50f17', metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 });   // Rallye Red
  const carbon = new THREE.MeshPhysicalMaterial({ color: '#141416', metalness: 0.3, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08 });

  const car = new THREE.Group();
  scene.add(car);
  let ready = false, glass, headMat, tailMat;
  const parts = { lip: [], skirt: [], diff: [], wing: [] }, rims = [];

  // ---------- headlights ----------
  // Haze: an additive cone per lamp, bright at the lens, fading along the beam and toward its edges.
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ vT = clamp(-position.z / 12.0, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ float core = pow(abs(dot(vN, vV)), 2.0); float a = uI * pow(1.0 - vT, 2.2) * core * 0.16;
        gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * a, a); }`,
  });
  const coneGeo = new THREE.ConeGeometry(1.9, 12, 40, 1, true).translate(0, -6, 0).rotateX(Math.PI / 2);   // apex at origin, opening toward -z

  const heads = [-0.66, 0.66].map(x => {
    const s = new THREE.SpotLight('#eef2ff', 0, 0, 0.42, 0.65, 2);     // ~6000K LED, soft edge
    s.position.set(x, 0.8, -2.28); s.target.position.set(x * 1.4, -2.6, -16);   // dipped ~12°: the pool starts just past the bumper
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.copy(s.position); cone.lookAt(s.target.position); cone.rotateY(Math.PI);   // lookAt aims +z; the cone opens along -z
    car.add(s, s.target, cone);
    return s;
  });

  // Bloom for lenses, neon and LEDs.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.2, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Tunnel: walls, ceiling and light strips that stream past while "driving".
  const tunnel = new THREE.Group();
  const tunMat = new THREE.MeshStandardMaterial({ color: '#1a1b20', roughness: 0.8, transparent: true, opacity: 0 });
  for (const [x, y, w, hgt] of [[-4.2, 2, 0.2, 4], [4.2, 2, 0.2, 4], [0, 4.1, 8.6, 0.2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 160), tunMat); m.position.set(x, y, 0); tunnel.add(m);
  }
  const stripMat = new THREE.MeshBasicMaterial({ color: '#ff3b42', transparent: true, opacity: 0 });
  const strips = [];
  for (let i = 0; i < 26; i++) for (const x of [-3.2, 3.2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 2.6), stripMat);
    m.position.set(x, 3.95, 0); m.userData.i = i; strips.push(m); tunnel.add(m);
  }
  scene.add(tunnel);

  // Move the triangles of `mesh` whose world-space centroid passes `keep` into a new mesh (same parent, same transform).
  function carve(mesh, keep, material) {
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const pos = src.attributes.position, m = mesh.matrixWorld, a = new THREE.Vector3(), c = new THREE.Vector3();
    const inTri = [], outTri = [];
    for (let t = 0; t < pos.count; t += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(a.fromBufferAttribute(pos, t + k).applyMatrix4(m));
      (keep(c.multiplyScalar(1 / 3)) ? inTri : outTri).push(t);
    }
    const pick = tris => {
      const geo = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(src.attributes)) {
        const arr = new attr.array.constructor(tris.length * 3 * attr.itemSize);
        tris.forEach((t, i) => arr.set(attr.array.subarray(t * attr.itemSize, (t + 3) * attr.itemSize), i * 3 * attr.itemSize));
        geo.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize, attr.normalized));
      }
      return geo;
    };
    mesh.geometry = pick(outTri);
    const part = new THREE.Mesh(pick(inTri), material || mesh.material);
    part.position.copy(mesh.position); part.quaternion.copy(mesh.quaternion); part.scale.copy(mesh.scale);
    mesh.parent.add(part);
    return part;
  }

  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
  new GLTFLoader().setDRACOLoader(draco).load('assets/fl5.glb', gltf => {
    const m = gltf.scene;
    car.add(m);
    m.position.y = 0.05;               // tyres sit 5 cm below the model origin
    m.updateMatrixWorld(true);
    const meshes = [];
    m.traverse(o => { if (o.isMesh) meshes.push(o); });
    const base = name => meshes.filter(o => o.name.replace(/_\d+$/, '') === name);   // GLTFLoader suffixes duplicate names
    for (const o of meshes) {
      const n = o.material.name;
      if (/Paint_Material/.test(n)) o.material = paint;
      else if (/Window_Material/.test(n)) { glass ||= o.material.clone(); o.material = glass; }
      else if (/TNR_Rim/.test(n)) rims.push(o);
    }
    for (const [k, names] of Object.entries(KIT)) for (const nm of names) for (const o of base(nm)) { o.material = carbon; parts[k].push(o); }
    // Wing: black trim above the tail.
    const trim = base('Object_29')[0];
    if (trim) parts.wing.push(carve(trim, c => c.z > 1.55 && c.y > 1.02, carbon));
    // Headlamps: the front half of the lamp mesh gets its own emissive material (tail lamps stay red).
    const lamp = meshes.find(o => /LightA_Material/.test(o.material.name));
    if (lamp) {
      headMat = lamp.material.clone(); headMat.emissive = new THREE.Color('#e8eeff'); headMat.emissiveIntensity = 0;
      tailMat = lamp.material.clone(); tailMat.emissive = new THREE.Color('#ff1010'); tailMat.emissiveIntensity = 0;
      carve(lamp, c => c.z < -1.6, headMat); lamp.material = tailMat;
    }
    // Rims spin around their own centre.
    for (const r of rims) {
      r.geometry.computeBoundingBox();
      const c = r.geometry.boundingBox.getCenter(new THREE.Vector3());
      r.geometry.translate(-c.x, -c.y, -c.z); r.position.add(c);
    }
    for (const list of Object.values(parts)) for (const o of list) o.userData.rest = o.position.clone();
    ready = true;
    $('#loader').remove();
    ScrollTrigger.create({ trigger: '#story', start: 'top 80%', once: true, onEnter: intro });
  }, e => { if (e.total) $('#loadPct').textContent = Math.round(e.loaded / e.total * 100) + '%'; },
  () => { $('#loader').textContent = 'The 3D car could not load.'; });

  // ---------- render ----------
  const DEG = Math.PI / 180, target = new THREE.Vector3(), off = new THREE.Vector3(), inv = new THREE.Matrix4();
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe($('.stage'));
  const splitLine = $('#splitLine');

  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
  }
  addEventListener('resize', size); size();

  // Place each kit part at progress k (1 = fitted). Offsets are in world space, converted to the mesh's parent space.
  function fit(name, k) {
    const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
    for (const o of parts[name]) {
      o.visible = k > 0.001;
      inv.copy(o.parent.matrixWorld).invert().setPosition(0, 0, 0);
      off.fromArray(OFFSET[name]).multiplyScalar(1 - e).applyMatrix4(inv);
      o.position.copy(o.userData.rest).add(off);
    }
  }
  const allParts = k => { for (const n of Object.keys(parts)) fit(n, k); };
  const tuned = () => { for (const n of Object.keys(parts)) fit(n, S[n]); };

  function render() {
    if (!visible || !ready) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Portrait screens: widen the lens (not the distance) so the car fits and the camera stays inside the garage.
    const fitK = Math.min(3.4, Math.max(1, 1.5 / camera.aspect));
    const a = S.az * DEG;
    target.set(S.tx, S.ty, S.tz);
    camera.position.set(S.tx + Math.sin(a) * S.dist, S.ty + S.h, S.tz + Math.cos(a) * S.dist);
    camera.fov = 2 * Math.atan(Math.tan(S.fov * DEG / 2) * fitK) / DEG; camera.updateProjectionMatrix(); camera.lookAt(target);

    const lit = 1 - S.dark;                                   // garage lights: 1 = on, 0 = off
    hexMat.color.setScalar(2.4 * lit);
    scene.environmentIntensity = 0.14 + 0.86 * lit;
    fill.intensity = 1.6 * lit + 0.1;
    key.intensity = 2.2 * lit + 0.45 * S.dark;          // at night it stays on as a faint cool rim so the body reads
    key.color.set('#ffffff').lerp(new THREE.Color('#9fb4ff'), S.dark);
    wallMat.emissiveIntensity = 0.08 + 0.42 * lit;
    neonMat.color.set('#ff1f2a').multiplyScalar(2.2 * (1 - S.tunnel));
    garage.visible = S.tunnel < 0.6;
    if (glass) glass.color.set('#5a5e66').lerp(new THREE.Color('#15161a'), S.tint);
    if (headMat) headMat.emissiveIntensity = S.lights * 2.5;
    if (tailMat) tailMat.emissiveIntensity = S.lights * 2.5;
    heads.forEach(s => { s.intensity = S.lights * 600; });
    coneMat.uniforms.uI.value = S.lights;
    bloom.strength = 0.3 + 0.3 * S.dark;

    tunnel.visible = S.tunnel > 0.01;
    tunMat.opacity = S.tunnel; stripMat.opacity = S.tunnel;
    for (const m of strips) m.position.z = ((m.userData.i * 6 + S.drive * 40) % 156 + 156) % 156 - 78;
    rims.forEach(r => { r.rotation.x = S.drive * 60; });
    car.position.y = S.tunnel ? Math.sin(S.drive * 90) * 0.004 : 0;

    const sx = Math.round(w * S.split);
    splitLine.style.left = sx + 'px';
    if (S.split > 0.002 && S.split < 0.998) {               // two passes: stock left of the line, full kit right of it
      renderer.setScissorTest(true);
      allParts(0); car.updateMatrixWorld(true); renderer.setScissor(0, 0, sx, h); renderer.render(scene, camera);
      allParts(1); car.updateMatrixWorld(true); renderer.setScissor(sx, 0, w - sx, h); renderer.render(scene, camera);
      renderer.setScissorTest(false);
    } else {
      if (S.split <= 0.002) allParts(1); else tuned();
      composer.render();
    }
  }
  gsap.ticker.add(render);
}

// ---------- the scroll timeline ----------
const show = (tl, sel, at, dur = 0.3) => tl.fromTo(sel, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: dur, ease: 'power2.out' }, at);
const hide = (tl, sel, at, dur = 0.25) => tl.to(sel, { autoAlpha: 0, y: -30, duration: dur, ease: 'power2.in' }, at);
const cam = (tl, at, v, dur = 0.7) => tl.to(S, { ...v, duration: dur, ease: 'power2.inOut' }, at);

const tl = gsap.timeline({ defaults: { ease: 'none' },
  scrollTrigger: { trigger: '#story', start: 'top top', end: 'bottom bottom', scrub: reduce ? true : 0.8 } });
// 0 – 2  stock | SOKU: divider sweeps left (all SOKU), then right (all stock) so the build starts from stock
tl.to(S, { split: 0.03, duration: 0.9 }, 0.1)
  .to(S, { split: 1, duration: 0.9 }, 1.05)
  .to('#splitLine', { autoAlpha: 0, duration: 0.15 }, 1.9);
hide(tl, '.s-split', 1.75);
// 2 – 3.6  front lip
cam(tl, 2.0, { az: -138, h: 0.15, dist: 6.4, ty: 0.45 });
show(tl, '.s-lip', 2.25);
tl.to(S, { lip: 1, duration: 0.5 }, 2.7);
hide(tl, '.s-lip', 3.4);
// 3.6 – 5.2  side skirts
cam(tl, 3.6, { az: -92, h: 0.2, dist: 7.4, ty: 0.45 });
show(tl, '.s-skirt', 3.85);
tl.to(S, { skirt: 1, duration: 0.5 }, 4.3);
hide(tl, '.s-skirt', 5.0);
// 5.2 – 6.8  rear diffuser
cam(tl, 5.2, { az: 32, h: 0.3, dist: 7.8, ty: 0.4 });
show(tl, '.s-diff', 5.45);
tl.to(S, { diff: 1, duration: 0.5 }, 5.9);
hide(tl, '.s-diff', 6.6);
// 6.8 – 8.4  swan-neck wing
cam(tl, 6.8, { az: 42, h: 1.7, dist: 7.6, ty: 0.75 });
show(tl, '.s-wing', 7.05);
tl.to(S, { wing: 1, duration: 0.55 }, 7.45);
hide(tl, '.s-wing', 8.2);
// 8.4 – 9.2  the finished car
cam(tl, 8.4, { az: -145, h: 1.5, dist: 8.6, ty: 0.6 }, 0.6);
show(tl, '.s-built', 8.5);
hide(tl, '.s-built', 9.05);
// 9.2 – 10.2  studio goes dark, windows tint, headlights on
cam(tl, 9.2, { az: -128, h: 2.2, dist: 10.5, ty: 0.3, tz: -3 }, 0.6);
tl.to(S, { dark: 1, duration: 0.6 }, 9.3)
  .to(S, { tint: 1, duration: 0.5 }, 9.4)
  .to(S, { lights: 1, duration: 0.3, ease: 'power2.in' }, 9.75);
show(tl, '.s-night', 9.75);
hide(tl, '.s-night', 10.35);
// 10.4 – 12  into the tunnel, driving, then the call to action
tl.to(S, { tunnel: 1, duration: 0.5 }, 10.4)
  .to(S, { drive: 1, duration: 1.6 }, 10.4)
  .to(S, { h: 0.25, dist: 10, az: -200, tz: 0, duration: 1.4, ease: 'power1.inOut' }, 10.45);
tl.fromTo('.scrim', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 10.95);
show(tl, '.s-cta', 11.05, 0.4);
tl.to({}, { duration: 0.4 }, 11.6);     // hold the end frame

function intro() {
  if (reduce) return;
  gsap.from('.s-split .left', { x: -80, autoAlpha: 0, duration: 1, ease: 'power3.out' });
  gsap.from('.s-split .right', { x: 80, autoAlpha: 0, duration: 1, ease: 'power3.out' });
  gsap.from('#splitLine', { scaleY: 0, duration: 0.9, ease: 'power3.inOut', delay: 0.2 });
  gsap.from(S, { dist: 12, duration: 1.6, ease: 'power3.out' });
}
