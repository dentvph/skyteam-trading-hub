// SkyTeam 3D scenes (three.js, MIT). Loads after the page, only when WebGL works.
// <div data-sky3d="hero"> : floating 3D candlestick ribbon with gold particles (behind the welcome screen)
// <div data-sky3d="terminal"> : rotating 3D "Smart Terminal" chart with liquidity target planes
// Pauses off-screen and in background tabs; one still frame for people who prefer reduced motion.
const holders = [...document.querySelectorAll('[data-sky3d]')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

// Deterministic random walk so the "chart" looks the same for everyone.
function candles(n, seed, drift) {
  let s = seed, p = 100;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = p, c = o + (rnd() - 0.5 + drift) * 3.2;
    const h = Math.max(o, c) + rnd() * 1.6, l = Math.min(o, c) - rnd() * 1.6;
    out.push({ o, h, l, c }); p = c;
  }
  return out;
}

async function start() {
  if (!holders.length || !webglOk()) return;
  const THREE = await import('/vendor/three.module.min.js');
  for (const el of holders) build(THREE, el, el.dataset.sky3d);
}

function build(THREE, el, kind) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'sky3d-canvas';
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060c18, kind === 'hero' ? 0.035 : 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0x8fb4ff, 0.55));
  const key = new THREE.DirectionalLight(0xffe2a8, kind === 'hero' ? 1.6 : 2.2); key.position.set(6, 10, 8); scene.add(key);
  const rim = new THREE.PointLight(0x3aa0ff, 30, 40); rim.position.set(-8, 4, -6); scene.add(rim);

  const GOLD = 0xf2c14e, TEAL = 0x26a69a, RED = 0xef5350;
  const group = new THREE.Group(); scene.add(group);
  const data = candles(kind === 'hero' ? 64 : 40, kind === 'hero' ? 7 : 21, kind === 'hero' ? 0.12 : 0.08);
  const min = Math.min(...data.map(d => d.l)), max = Math.max(...data.map(d => d.h));
  const scale = (kind === 'hero' ? 9 : 8) / (max - min), mid = (max + min) / 2;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mats = {
    up: new THREE.MeshStandardMaterial({ color: TEAL, emissive: TEAL, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.35 }),
    down: new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.3, metalness: 0.3, roughness: 0.4 }),
    wick: new THREE.MeshBasicMaterial({ color: 0xc9d6ea, transparent: true, opacity: 0.7 }),
  };
  const span = kind === 'hero' ? 30 : 17;
  const bw = kind === 'hero' ? 0.32 : 0.3;
  data.forEach((d, i) => {
    const x = (i / (data.length - 1) - 0.5) * span;
    const z = kind === 'hero' ? Math.sin(i / 7) * 3 : 0;
    const up = d.c >= d.o;
    const body = new THREE.Mesh(box, up ? mats.up : mats.down);
    const bh = Math.max(Math.abs(d.c - d.o) * scale, 0.08);
    body.scale.set(bw, bh, bw);
    body.position.set(x, ((d.o + d.c) / 2 - mid) * scale, z);
    const wick = new THREE.Mesh(box, mats.wick);
    wick.scale.set(0.05, (d.h - d.l) * scale, 0.05);
    wick.position.set(x, ((d.h + d.l) / 2 - mid) * scale, z);
    group.add(body, wick);
  });

  // Glowing grid floor
  const grid = new THREE.GridHelper(60, 60, 0x2a5a9a, 0x15304f);
  grid.position.y = kind === 'hero' ? -6 : -5.2; grid.material.transparent = true; grid.material.opacity = 0.45; scene.add(grid);

  // Liquidity "target" planes (buy side gold above, sell side red below) for the terminal scene
  if (kind === 'terminal') {
    // translucent "liquidity" bands facing the viewer, with a bright edge line
    for (const [y, col] of [[max, GOLD], [min, RED]]) {
      const yy = (y - mid) * scale + (col === GOLD ? 0.7 : -0.7);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(span + 3, 0.9), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set(0, yy, -0.6); group.add(m);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(span + 3, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: col }));
      edge.position.set(0, yy + (col === GOLD ? -0.45 : 0.45), -0.6); group.add(edge);
    }
  }

  // Gold dust
  const N = kind === 'hero' ? 900 : 400, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = (Math.random() - 0.3) * 24; pos[i * 3 + 2] = (Math.random() - 0.5) * 40; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: GOLD, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(dust);

  let w = 0, h = 0, visible = true, mx = 0, my = 0;
  function resize() {
    w = el.clientWidth || 1; h = el.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.position.set(0, kind === 'hero' ? 3 : 1.5, w < 700 ? (kind === 'hero' ? 30 : 22) : (kind === 'hero' ? 22 : 15));
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(el);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting && !reduced; if (visible) loop(); }, { threshold: 0.01 }).observe(el);
  window.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5; }, { passive: true });

  const clock = new THREE.Clock();
  let running = false;
  function frame() {
    const t = clock.getElapsedTime();
    group.rotation.y = (kind === 'hero' ? -0.35 : -0.2) + Math.sin(t * 0.12) * (kind === 'hero' ? 0.25 : 0.35) + mx * 0.35;
    group.rotation.x = 0.08 + my * 0.12;
    group.position.y = Math.sin(t * 0.5) * 0.25;
    dust.rotation.y = t * 0.015;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  function loop() {
    if (running) return;
    running = true;
    const tick = () => {
      if (!visible || document.hidden) { running = false; return; }
      frame(); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduced) loop(); });
  if (reduced) { frame(); visible = false; } else loop();
  el.classList.add('sky3d-on');
}

// Wait until the page is idle so the 3D never slows the first paint.
(window.requestIdleCallback || (f => setTimeout(f, 600)))(() => start().catch(() => {}));
