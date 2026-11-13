import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export interface GNode { id: string; name: string; group: string; val: number; x?: number; y?: number; z?: number }
export interface GLink { source: string | GNode; target: string | GNode }
export interface GraphHandle { focus(path: string | null): void; flyTo(id: string): void; find(q: string): GNode[]; resize(): void; destroy(): void }

const PALETTE = ['#58a6ff', '#7ee787', '#d2a8ff', '#ffa657', '#f778ba', '#ff7b72', '#a5d6ff', '#e3b341', '#56d4dd', '#f0883e', '#8ddb8c', '#ffb3d9'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const idOf = (x: string | GNode) => (typeof x === 'string' ? x : x.id);
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

/** Grafo 3D de la bóveda: nodos por nota, color por carpeta raíz, tamaño por enlaces; brillo, estrellas y rotación lenta. */
export function createGraph(el: HTMLElement, nodes: GNode[], links: GLink[], o: { onOpen(path: string): void; colorOf?: (group: string) => string | undefined }): GraphHandle {
  const groupColor = new Map<string, string>();
  const colorOf = (g: string) => { let c = groupColor.get(g); if (!c) { c = o.colorOf?.(g) ?? PALETTE[hash(g) % PALETTE.length]; groupColor.set(g, c); } return c; };
  const neighbors = new Map<string, Set<string>>();
  const adj = (a: string, b: string) => { let s = neighbors.get(a); if (!s) neighbors.set(a, (s = new Set())); s.add(b); };
  for (const l of links) { adj(idOf(l.source), idOf(l.target)); adj(idOf(l.target), idOf(l.source)); }

  const vals = nodes.map(n => n.val).sort((a, b) => b - a);
  const labelMin = Math.max(3, vals[Math.min(70, vals.length - 1)] ?? 3); // etiqueta fija solo para los ~70 nodos más enlazados

  let pinned: GNode | null = null;
  let hi: { node: GNode; set: Set<string> } | null = null;
  const hiLink = (l: GLink) => !!hi && (idOf(l.source) === hi.node.id || idOf(l.target) === hi.node.id);

  const Ctor = ForceGraph3D as unknown as new (el: HTMLElement, o?: { controlType: 'orbit' }) => ForceGraph3DInstance<GNode, GLink>;
  const Graph = new Ctor(el, { controlType: 'orbit' })
    .backgroundColor('#03040a')
    .showNavInfo(false)
    .nodeRelSize(3)
    .nodeOpacity(1)
    .nodeResolution(14)
    .nodeVal(n => n.val)
    .nodeLabel(n => `<div class="graph-tip">${esc(n.name)}<small>${esc(n.group === '/' ? 'raíz' : n.group)} · ${(neighbors.get(n.id)?.size ?? 0)} enlaces</small></div>`)
    .nodeColor(n => (!hi ? colorOf(n.group) : n === hi.node ? '#ffffff' : hi.set.has(n.id) ? colorOf(n.group) : rgba(colorOf(n.group), 0.1)))
    .nodeThreeObjectExtend(true)
    .nodeThreeObject(n => {
      if (n.val < labelMin) return undefined as unknown as THREE.Object3D;
      const s = new SpriteText(n.name, 3.4, '#e6edf3');
      s.fontFace = 'Segoe UI, system-ui, sans-serif';
      s.fontWeight = '600';
      s.material.depthWrite = false;
      s.position.y = Math.cbrt(n.val) * 3 + 4;
      return s;
    })
    .linkColor(l => (!hi ? 'rgba(130,150,200,0.22)' : hiLink(l) ? '#c9d7ff' : 'rgba(80,90,120,0.04)'))
    .linkOpacity(1)
    .linkWidth(l => (hiLink(l) ? 0.9 : 0))
    .linkDirectionalParticles(l => (hiLink(l) ? 2 : 0))
    .linkDirectionalParticleWidth(1.8)
    .linkDirectionalParticleSpeed(0.006)
    .onNodeHover(n => { el.style.cursor = n ? 'pointer' : ''; apply(n ?? pinned); })
    .onNodeClick(n => o.onOpen(n.id))
    .onBackgroundClick(() => { pinned = null; apply(null); })
    .warmupTicks(60)
    .cooldownTicks(300)
    .graphData({ nodes, links });

  (el as HTMLElement & { __graph?: unknown }).__graph = Graph; // para depurar desde la consola
  Graph.d3Force('charge')?.strength(-55);
  (Graph.d3Force('link') as { distance?: (d: number) => unknown } | undefined)?.distance?.(28);

  function apply(n: GNode | null) {
    hi = n ? { node: n, set: new Set([n.id, ...(neighbors.get(n.id) ?? [])]) } : null;
    Graph.nodeColor(Graph.nodeColor()).linkColor(Graph.linkColor()).linkWidth(Graph.linkWidth()).linkDirectionalParticles(Graph.linkDirectionalParticles());
  }

  // Brillo (bloom), estrellas y niebla de profundidad.
  // umbral > 0: brillan los nodos, no las estrellas ni los enlaces tenues
  const bloom = new UnrealBloomPass(new THREE.Vector2(el.clientWidth || 800, el.clientHeight || 600), 1.1, 0.5, 0.25);
  Graph.postProcessingComposer().addPass(bloom);
  const N = 2600, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 900 + Math.random() * 1800, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph);
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  Graph.scene().add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x9fb0ff, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0.35, depthWrite: false, fog: false })));
  Graph.scene().fog = new THREE.FogExp2(0x03040a, 0.0007);

  const controls = Graph.controls() as unknown as { autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean; dampingFactor: number; addEventListener(t: string, f: () => void): void };
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  let fitted = false;
  const fit = () => { if (fitted) return; fitted = true; if (pinned && nodes.length > 60) flyTo(pinned.id); else Graph.zoomToFit(1200, 60); };
  Graph.onEngineStop(fit);
  setTimeout(fit, 3500); // respaldo: en pestañas en segundo plano el motor no avisa cuando termina

  const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (w && h) { Graph.width(w).height(h); bloom.setSize(w, h); } };
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  const byId = new Map(nodes.map(n => [n.id, n]));
  function flyTo(id: string) {
    const n = byId.get(id);
    if (!n || n.x === undefined) return;
    const x = n.x, y = n.y ?? 0, z = n.z ?? 0;
    const k = 1 + 110 / (Math.hypot(x, y, z) || 1);
    controls.autoRotate = false;
    Graph.cameraPosition({ x: x * k, y: y * k, z: z * k }, { x, y, z }, 1400);
    pinned = n;
    apply(n);
  }

  return {
    focus(path) { const n = path ? byId.get(path) ?? null : null; pinned = n; apply(n); if (n && fitted) flyTo(n.id); },
    flyTo,
    find(q) { const s = q.trim().toLowerCase(); return s ? nodes.filter(n => n.name.toLowerCase().includes(s)).sort((a, b) => b.val - a.val).slice(0, 8) : []; },
    resize,
    destroy() { ro.disconnect(); Graph._destructor(); },
  };
}
