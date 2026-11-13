import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import { Conflict, LocalVault, MemoryVault, type Vault } from './vault';
import { attachmentDir, extractLinks, pastedName, resolveLink } from './links';
import { parseFrontmatter, propType, type Fm, type PropType } from './yaml';
import { IMG, PDF, renderMarkdown } from './md';
import { colorFor, fileColorMap, icon, setIcon, type FileColors, type IconicCfg } from './icons';
import { buildTree, fileRow, renderTree, type TNode } from './tree';
import { blackHole } from './bh';
import { forget, recall, remember } from './remember';
import type { GraphHandle } from './graph';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/, '');
const PURIFY = { ADD_TAGS: ['iframe'], ADD_ATTR: ['target', 'open', 'allow'] };

// ---------- estado ----------
let vault: Vault, vaultName = '';
let paths: string[] = [];
let tree: TNode;
const expanded = new Set<string>();
let cur: { path: string; mtime: number } | null = null;
let editing = false, dirty = false, loading = false, timer: number | undefined;
let iconic: IconicCfg = { fileIcons: {} };
let colors: FileColors = fileColorMap({});
let appJson: { attachmentFolderPath?: string } = {};
const links = new Map<string, Set<string>>(), backlinks = new Map<string, Set<string>>();
let indexDone = false, indexing: Promise<void> = Promise.resolve();
let graph: GraphHandle | null = null;
let urls: string[] = [];

const bh = blackHole($<HTMLCanvasElement>('bh'));

// ---------- editor ----------
const view = new EditorView({
  parent: $('editor'),
  extensions: [basicSetup, markdown(), EditorView.lineWrapping,
    syntaxHighlighting(HighlightStyle.define([
      { tag: t.heading, color: '#7ee787', fontWeight: '700' },
      { tag: [t.link, t.url], color: '#58a6ff' },
      { tag: t.emphasis, fontStyle: 'italic' }, { tag: t.strong, fontWeight: '700' },
      { tag: [t.monospace, t.processingInstruction, t.meta], color: '#8b949e' },
      { tag: t.quote, color: '#8b949e' },
    ])),
    EditorView.theme({
      '&': { color: '#e6edf3', backgroundColor: 'transparent', fontSize: '16px', height: '100%' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6', padding: '20px 40px 80px' },
      '.cm-content': { caretColor: '#58a6ff' },
      '.cm-cursor': { borderLeftColor: '#58a6ff' },
      '.cm-activeLine': { backgroundColor: 'rgba(110,118,129,.08)' },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgba(88,166,255,.3)' },
    }, { dark: true }),
    EditorView.updateListener.of(u => { if (u.docChanged && !loading) { dirty = true; status('sin guardar…'); clearTimeout(timer); timer = window.setTimeout(save, 800); } }),
    EditorView.domEventHandlers({ paste: e => { const f = [...(e.clipboardData?.files ?? [])].find(x => x.type.startsWith('image/')); if (!f) return false; e.preventDefault(); pasteImage(f); return true; } })],
});

function status(s: string, error = false) { const el = $('status'); el.textContent = s; el.classList.toggle('is-error', error); }
function hint(s: string) { $('hint').textContent = s; }
function url(b: Blob) { const u = URL.createObjectURL(b); urls.push(u); return u; }
function revokeUrls() { for (const u of urls) URL.revokeObjectURL(u); urls = []; }

async function save() {
  clearTimeout(timer);
  if (!cur || !dirty) return;
  try { cur.mtime = await vault.write(cur.path, view.state.doc.toString(), cur.mtime); dirty = false; status('guardado ✓'); }
  catch (e) { status(e instanceof Conflict ? '⚠ ' + e.message : 'error al guardar: ' + e, true); }
}

async function pasteImage(f: File) {
  if (!cur) return;
  const dir = attachmentDir(appJson.attachmentFolderPath, cur.path);
  const name = pastedName(new Date(), f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png');
  const path = (dir ? dir + '/' : '') + name;
  try { await vault.write(path, f); } catch (e) { status('no se pudo guardar la imagen: ' + e, true); return; }
  paths.push(path);
  view.dispatch(view.state.replaceSelection(`![[${name}]]`));
}

// ---------- apertura ----------
async function start(v: Vault, name: string) {
  vault = v; vaultName = name;
  document.body.classList.add('open');
  $('app').hidden = false;
  bh.pause();
  $('vault-name').textContent = name;
  $('count').textContent = 'leyendo bóveda…';
  try { paths = (await v.list(n => { if (n % 100 === 0) $('count').textContent = `leyendo bóveda… ${n}`; })).map(e => e.path); }
  catch (e) { closeVault(); hint('No se pudo leer la carpeta: ' + e); return; }
  const skipped = (v as { skipped?: string[] }).skipped ?? [];
  await loadConfig();
  try { for (const p of JSON.parse(localStorage.getItem('orbita:expanded:' + name) ?? '[]') as string[]) expanded.add(p); } catch { /* sin estado guardado */ }
  tree = buildTree(paths);
  drawTree();
  $('count').textContent = `${paths.length} archivos` + (skipped.length ? ` · ${skipped.length} carpetas omitidas` : '');
  if (skipped.length) console.warn('Órbita omitió carpetas ilegibles:', skipped);
  showView('empty');
  indexing = buildIndex();
}

async function loadConfig() {
  const json = async (p: string) => { try { return JSON.parse(await (await vault.read(p)).data.text()); } catch { return null; } };
  appJson = (await json('.obsidian/app.json')) ?? {};
  const ic = await json('.obsidian/plugins/iconic/data.json');
  if (ic?.fileIcons) iconic = ic;
  const fc = await json('.obsidian/plugins/obsidian-file-color/data.json');
  if (fc) colors = fileColorMap(fc);
}

function closeVault() { location.reload(); }

/** Lee todas las notas para conocer enlaces salientes y entrantes (grafo y "enlaces entrantes"). */
async function buildIndex() {
  const notes = paths.filter(p => p.endsWith('.md'));
  const total = notes.length;
  let done = 0;
  const worker = async () => {
    for (let p = notes.shift(); p; p = notes.shift()) {
      try {
        const set = new Set<string>();
        for (const tg of extractLinks(await (await vault.read(p)).data.text())) { const r = resolveLink(tg, paths); if (r && r !== p) set.add(r); }
        links.set(p, set);
        for (const r of set) { let b = backlinks.get(r); if (!b) backlinks.set(r, (b = new Set())); b.add(p); }
      } catch { /* nota ilegible: sin enlaces */ }
      if (++done % 40 === 0) $('st-left').textContent = `indexando enlaces ${done}/${total}`;
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  indexDone = true;
  $('st-left').textContent = `${total} notas · ${[...links.values()].reduce((n, s) => n + s.size, 0)} enlaces`;
  if (cur) fillBacklinks(cur.path);
}

// ---------- árbol ----------
function persistExpanded() { try { localStorage.setItem('orbita:expanded:' + vaultName, JSON.stringify([...expanded])); } catch { /* sin almacenamiento */ } }

function drawTree() {
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase();
  const box = $('tree');
  box.replaceChildren();
  if (q) {
    const hits = paths.filter(p => !p.startsWith('.') && !p.includes('/.') && base(p).toLowerCase().includes(q)).slice(0, 300);
    if (!hits.length) { const e = document.createElement('div'); e.className = 'tree-empty'; e.textContent = 'Sin resultados'; box.append(e); return; }
    for (const p of hits) { const r = fileRow(p, { iconic, colors }, true); r.onclick = () => openNote(p); if (p === cur?.path) r.parentElement?.classList.add('is-active'); box.append(r); }
    return;
  }
  box.append(renderTree(tree, { expanded, current: cur?.path ?? null, iconic, colors, onOpen: p => openNote(p), onToggle: p => { expanded.has(p) ? expanded.delete(p) : expanded.add(p); persistExpanded(); drawTree(); } }));
}

function revealInTree(path: string) {
  let p = path;
  while (p.includes('/')) { p = p.slice(0, p.lastIndexOf('/')); expanded.add(p); }
  persistExpanded();
  drawTree();
  $('tree').querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

function setCrumbs(path: string | null, label?: string) {
  const nav = $('crumbs');
  nav.replaceChildren();
  const parts = label ? [label] : path ? path.split('/') : [];
  parts.forEach((s, i) => {
    if (i) { const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '/'; nav.append(sep); }
    const el = document.createElement('span');
    if (i === parts.length - 1) { el.className = 'last'; el.textContent = s.replace(/\.md$/, ''); } else el.textContent = s;
    nav.append(el);
  });
}

// ---------- vistas ----------
type View = 'empty' | 'note' | 'graph';
let currentView: View = 'empty';
function showView(v: View) {
  currentView = v;
  $('empty').hidden = v !== 'empty';
  $('graph').hidden = v !== 'graph';
  $('editor').hidden = v !== 'note' || !editing;
  $('preview').hidden = v !== 'note' || editing;
  $('mode').hidden = v !== 'note';
  $('rb-graph').classList.toggle('is-active', v === 'graph');
  if (v === 'graph') setCrumbs(null, 'Grafo de la bóveda');
  if (v === 'empty') { setCrumbs(null); status(''); }
}

async function openNote(path: string, mode: 'preview' | 'edit' = 'preview') {
  await save();
  if (dirty) return; // no se pudo guardar: no se abandona la nota
  let data: Blob, mtime: number;
  try { ({ data, mtime } = await vault.read(path)); } catch (e) { status('no se pudo abrir: ' + e, true); return; }
  cur = { path, mtime };
  editing = false;
  showView('note');
  setCrumbs(path);
  revealInTree(path);
  status('');
  revokeUrls();
  const pv = $('preview');
  const notice = (txt: string) => { const d = document.createElement('div'); d.className = 'dv-block'; d.textContent = txt; return d; };
  if (IMG.test(path)) { const img = new Image(); img.className = 'img-full'; img.src = url(data); pv.replaceChildren(title(path), img); $('mode').hidden = true; return; }
  if (PDF.test(path)) { const f = document.createElement('iframe'); f.className = 'pdf-full'; f.src = url(data); pv.replaceChildren(f); $('mode').hidden = true; return; }
  if (!path.endsWith('.md')) {
    const a = document.createElement('a'); a.href = url(data); a.download = path.slice(path.lastIndexOf('/') + 1); a.textContent = 'Descargar ' + a.download; a.className = 'internal-link';
    pv.replaceChildren(title(path), notice('Órbita no abre este tipo de archivo; ábrelo en Obsidian.'), a); $('mode').hidden = true; return;
  }
  const text = await data.text();
  loading = true;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  loading = false;
  dirty = false;
  if (/\.excalidraw\.md$/.test(path) || /^---[\s\S]{0,400}excalidraw-plugin/.test(text)) {
    pv.replaceChildren(title(path), notice('Dibujo de Excalidraw: la integración está pendiente. Puedes editar el texto con Ctrl+E.'));
    setMode(mode === 'edit');
    return;
  }
  setMode(mode === 'edit');
}

function title(path: string) { const h = document.createElement('div'); h.className = 'note-title'; h.textContent = base(path); return h; }

function setMode(edit: boolean) {
  editing = edit;
  $('editor').hidden = !edit;
  $('preview').hidden = edit;
  const b = $('mode');
  b.hidden = false;
  b.title = edit ? 'Vista de lectura (Ctrl+E)' : 'Editar (Ctrl+E)';
  b.setAttribute('aria-label', b.title);
  setIcon(b, edit ? 'book-open' : 'pencil');
  if (edit) view.focus(); else void renderPreview();
}

async function renderPreview() {
  if (!cur) return;
  const path = cur.path, text = view.state.doc.toString();
  const { fm, body } = parseFrontmatter(text);
  const pv = $('preview');
  pv.replaceChildren(title(path));
  if (fm && Object.keys(fm).length) pv.append(renderProps(fm));
  const art = document.createElement('div');
  art.className = 'md';
  art.innerHTML = DOMPurify.sanitize(renderMarkdown(body, { paths, fm }), PURIFY);
  pv.append(art);
  hydrate(art, 0);
  const bl = document.createElement('div');
  bl.className = 'backlinks';
  bl.id = 'backlinks';
  pv.append(bl);
  fillBacklinks(path);
  pv.scrollTop = 0;
  const words = body.split(/\s+/).filter(Boolean).length;
  $('st-right').textContent = `${words} palabras`;
}

/** Completa lo que el HTML saneado no puede llevar: iconos, imágenes y PDF de la bóveda, notas incrustadas. */
function hydrate(root: HTMLElement, depth: number) {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach(s => s.replaceChildren(icon(s.dataset.icon, 'info', 18)));
  root.querySelectorAll<HTMLImageElement>('img[data-vault]').forEach(img => vault.read(img.dataset.vault!).then(r => { img.src = url(r.data); }).catch(() => { img.alt = 'No se encontró ' + img.dataset.vault; }));
  root.querySelectorAll<HTMLIFrameElement>('iframe[data-vault]').forEach(f => vault.read(f.dataset.vault!).then(r => { f.src = url(r.data) + (f.dataset.hash ? '#' + f.dataset.hash : ''); }).catch(() => f.remove()));
  if (depth >= 1) return;
  root.querySelectorAll<HTMLElement>('.embed-note[data-embed]').forEach(async d => {
    try {
      const { fm, body } = parseFrontmatter(await (await vault.read(d.dataset.embed!)).data.text());
      const inner = document.createElement('div');
      inner.className = 'md';
      inner.innerHTML = DOMPurify.sanitize(renderMarkdown(body, { paths, fm }), PURIFY);
      d.append(inner);
      hydrate(inner, depth + 1);
    } catch { /* la nota incrustada no se pudo leer: queda el enlace */ }
  });
}

const PROP_ICONS: Record<PropType, string> = { text: 'text', number: 'binary', checkbox: 'square-check', date: 'calendar', datetime: 'clock', list: 'list', tags: 'tags', aliases: 'forward', object: 'braces' };

function renderProps(fm: Fm): HTMLElement {
  const box = document.createElement('div');
  box.className = 'props';
  const head = document.createElement('div');
  head.className = 'props-head';
  head.textContent = 'Propiedades';
  box.append(head);
  for (const [k, v] of Object.entries(fm)) {
    const type = propType(k, v);
    const row = document.createElement('div');
    row.className = 'prop';
    const ic = document.createElement('span');
    ic.className = 'prop-icon';
    ic.append(icon(PROP_ICONS[type], 'text', 16));
    const key = document.createElement('span');
    key.className = 'prop-key';
    key.textContent = k;
    key.title = k;
    const val = document.createElement('span');
    val.className = 'prop-value prop-' + type;
    if (type === 'checkbox') { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!v; c.disabled = true; val.append(c); }
    else if (Array.isArray(v)) for (const x of v) { const pill = document.createElement('span'); pill.className = 'pill'; pill.append(inlineValue(String(x), type === 'tags')); val.append(pill); }
    else if (type === 'object') val.textContent = JSON.stringify(v);
    else if (v === null) val.textContent = '';
    else val.append(inlineValue(String(v)));
    row.append(ic, key, val);
    box.append(row);
  }
  return box;
}

function inlineValue(s: string, tag = false): Node {
  if (tag) { const a = document.createElement('a'); a.href = '#'; a.className = 'tag'; a.dataset.tag = s.replace(/^#/, ''); a.textContent = '#' + a.dataset.tag; return a; }
  const m = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/.exec(s.trim());
  if (m) {
    const p = resolveLink(m[1], paths);
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'internal-link' + (p ? '' : ' is-unresolved');
    a.textContent = m[2] ?? m[1];
    if (p) a.dataset.note = p;
    return a;
  }
  if (/^https?:\/\//.test(s)) { const a = document.createElement('a'); a.href = s; a.target = '_blank'; a.rel = 'noopener'; a.className = 'external-link'; a.textContent = s; return a; }
  return document.createTextNode(s);
}

function fillBacklinks(path: string) {
  const box = document.getElementById('backlinks');
  if (!box) return;
  const set = backlinks.get(path);
  box.replaceChildren();
  const h = document.createElement('div');
  h.className = 'backlinks-head';
  h.textContent = indexDone ? `Enlaces entrantes · ${set?.size ?? 0}` : 'Enlaces entrantes · indexando…';
  box.append(h);
  for (const p of [...(set ?? [])].sort()) { const a = document.createElement('a'); a.href = '#'; a.className = 'internal-link'; a.dataset.note = p; a.textContent = p.replace(/\.md$/, ''); a.title = p; box.append(a); }
}

async function newNote() {
  await save();
  if (dirty) return;
  const dir = cur?.path.includes('/') ? cur.path.slice(0, cur.path.lastIndexOf('/') + 1) : '';
  let name = 'Sin título', n = 1;
  while (paths.includes(`${dir}${name}.md`)) name = `Sin título ${++n}`;
  const path = `${dir}${name}.md`;
  try { await vault.write(path, ''); } catch (e) { status('no se pudo crear la nota: ' + e, true); return; }
  paths.push(path);
  tree = buildTree(paths);
  await openNote(path, 'edit');
}

// ---------- grafo 3D ----------
async function showGraph() {
  if (currentView === 'graph') { showView(cur ? 'note' : 'empty'); return; }
  await save();
  showView('graph');
  if (!graph) {
    $('graph-msg').textContent = indexDone ? 'preparando el grafo…' : 'leyendo los enlaces de todas las notas…';
    await indexing;
    const { createGraph } = await import('./graph');
    const notes = new Set(paths.filter(p => p.endsWith('.md') && !p.startsWith('.') && !p.includes('/.')));
    const deg = new Map<string, number>();
    const ls: { source: string; target: string }[] = [];
    for (const [a, set] of links) for (const b of set) {
      if (!notes.has(a) || !notes.has(b)) continue;
      ls.push({ source: a, target: b });
      deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1);
    }
    const nodes = [...notes].map(p => ({ id: p, name: base(p), group: p.includes('/') ? p.slice(0, p.indexOf('/')) : '/', val: 1 + (deg.get(p) ?? 0) }));
    graph = createGraph($('graph-canvas'), nodes, ls, { onOpen: p => openNote(p), colorOf: g => colors.map.get(g) });
    $('graph-count').textContent = `${nodes.length} notas · ${ls.length} enlaces`;
    $('graph-msg').textContent = '';
    const q = $<HTMLInputElement>('graph-q'), hits = $('graph-hits');
    const showHits = () => {
      hits.replaceChildren();
      for (const n of graph!.find(q.value)) {
        const b = document.createElement('button');
        b.textContent = n.name;
        const s = document.createElement('small'); s.textContent = n.group === '/' ? '' : n.group; b.append(s);
        b.onclick = () => { graph!.flyTo(n.id); hits.replaceChildren(); q.value = n.name; };
        hits.append(b);
      }
    };
    q.oninput = showHits;
    q.onkeydown = e => { if (e.key === 'Enter') { const n = graph!.find(q.value)[0]; if (n) { graph!.flyTo(n.id); hits.replaceChildren(); } } if (e.key === 'Escape') { q.value = ''; hits.replaceChildren(); } };
  }
  graph.resize();
  graph.focus(cur?.path ?? null);
}

// ---------- eventos ----------
$('preview').addEventListener('click', e => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
  if (!a || a.classList.contains('external-link') || a.download) return;
  e.preventDefault();
  if (a.dataset.note) openNote(a.dataset.note);
  else if (a.dataset.tag) { $<HTMLInputElement>('q').value = ''; status('etiqueta #' + a.dataset.tag); }
  else if (a.classList.contains('is-unresolved')) status('esa nota todavía no existe');
});
$('mode').onclick = () => setMode(!editing);
$('q').oninput = drawTree;
$('collapse-all').onclick = () => { expanded.clear(); persistExpanded(); drawTree(); };
$('rb-files').onclick = () => document.body.classList.toggle('side-hidden');
$('rb-search').onclick = () => { document.body.classList.remove('side-hidden'); $('q').focus(); };
$('rb-graph').onclick = () => void showGraph();
$('rb-new').onclick = () => void newNote();
$('rb-close').onclick = () => { void save().then(closeVault); };
for (const [id, name] of [['rb-files', 'files'], ['rb-search', 'search'], ['rb-graph', 'waypoints'], ['rb-new', 'file-plus'], ['rb-close', 'log-out'], ['collapse-all', 'chevrons-down-up']] as const) setIcon($(id), name, id === 'collapse-all' ? 16 : 20);

addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === 's') { e.preventDefault(); void save(); }
  if (e.key === 'e' && cur && currentView === 'note') { e.preventDefault(); setMode(!editing); }
});
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); void save(); } });

// ---------- portada ----------
const pickFolder = async () => {
  if (!('showDirectoryPicker' in window)) { hint('Este navegador no puede abrir carpetas locales. Usa Chrome o Edge en un ordenador; el acceso por OneDrive está en camino.'); return; }
  try {
    const h: FileSystemDirectoryHandle = await (window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
    await remember('vault', h);
    await start(new LocalVault(h), h.name);
  } catch (e) { if ((e as Error).name !== 'AbortError') hint(String(e)); }
};
$('open').onclick = pickFolder;
$('demo').onclick = () => start(new MemoryVault(DEMO), 'Demostración').then(() => openNote('Bienvenida.md'));

void (async () => {
  const h = await recall<FileSystemDirectoryHandle>('vault');
  if (!h) return;
  const b = $('reopen');
  b.hidden = false;
  b.textContent = `abrir ${h.name}`;
  $('open').textContent = 'otra carpeta';
  $('open').classList.replace('primary', 'secondary');
  b.onclick = async () => {
    try {
      const perm = h as unknown as { queryPermission(o: object): Promise<string>; requestPermission(o: object): Promise<string> };
      let p = await perm.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted') p = await perm.requestPermission({ mode: 'readwrite' });
      if (p === 'granted') await start(new LocalVault(h), h.name);
      else hint('Sin permiso para esa carpeta. Elige "otra carpeta".');
    } catch (e) { await forget('vault'); hint('La carpeta ya no está disponible: ' + (e as Error).message); }
  };
})();

const DEMO: Record<string, string> = {
  'Bienvenida.md': `---
tipo: panel
ciclo: 5
revisado: true
fecha: 2026-11-13
tags:
  - demo
  - física/mecánica
enlace: "[[Física/Agujero negro|Agujero negro]]"
---
# Bienvenida a Órbita

Esto es una **demostración**: nada se guarda. Enlace a [[Agujero negro]], texto ==resaltado==, etiqueta #demo y una ecuación:

$$
r_s = \\frac{2GM}{c^2}
$$

En línea: $E = mc^2$. El ciclo actual es \`=this.ciclo\` y hoy es \`=date(today)\`.

> [!note]- Cómo funciona
> Todo lo que edites aquí se escribe en los archivos de tu bóveda. Obsidian lo verá al abrirla.

> [!tip] Consejo
> Pulsa **Ctrl+E** para alternar entre lectura y edición.

| Contexto | Nota |
| --- | --- |
| Física | [[Agujero negro]] |
| Tareas | - [x] leer · - [ ] resumir |

\`\`\`dataviewjs
dv.view("panel")
\`\`\`

\`\`\`
los [[enlaces]] dentro de código no se tocan
\`\`\`
`,
  'Física/Agujero negro.md': '# Agujero negro\n\nRegión de la que ni la luz escapa. Vuelve a [[Bienvenida]] o mira [[Física/Horizonte de sucesos]].\n\n> [!warning] Ojo\n> El horizonte está en $r = r_s$.\n',
  'Física/Horizonte de sucesos.md': '# Horizonte de sucesos\n\nFrontera del [[Agujero negro]]. Ver también [[Bienvenida]].\n',
  'Diario/2026-11-13.md': '# 13 de noviembre\n\nProbé [[Bienvenida|Órbita]] y el [[Agujero negro]].\n',
};
