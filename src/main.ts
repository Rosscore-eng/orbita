import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import { Conflict, LocalVault, MemoryVault, type Vault } from './vault';
import { attachmentDir, pastedName, resolveLink } from './links';
import { blackHole } from './bh';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const IMG = /\.(png|jpe?g|gif|webp|svg)$/i;
const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

let vault: Vault, paths: string[] = [], cur: { path: string; mtime: number } | null = null;
let timer: number | undefined, loading = false;

blackHole($<HTMLCanvasElement>('bh'));

// [[enlaces]], ![[incrustados]] y ==resaltado== como extensiones de marked: así no tocan los bloques de código
marked.use(markedKatex({ throwOnError: false, output: 'html' }), { extensions: [{
  name: 'wikilink', level: 'inline',
  start: (src: string) => src.match(/!?\[\[/)?.index,
  tokenizer(src: string) {
    const m = /^(!?)\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/.exec(src);
    if (m) return { type: 'wikilink', raw: m[0], embed: !!m[1], target: m[2], alias: m[3] };
  },
  renderer(k: any) {
    const p = resolveLink(k.target, paths), label = esc(k.alias ?? k.target);
    if (!p) return `<span class="missing">${label}</span>`;
    if (k.embed && IMG.test(p)) return `<img data-vault="${esc(p)}" alt="${esc(k.target)}"${/^\d+$/.test(k.alias ?? '') ? ` width="${k.alias}"` : ''}>`;
    return `<a href="#" data-note="${esc(p)}">${label}</a>`;
  },
}, {
  name: 'highlight', level: 'inline',
  start: (src: string) => src.indexOf('=='),
  tokenizer(src: string) { const m = /^==([^=\n]+)==/.exec(src); if (m) return { type: 'highlight', raw: m[0], text: m[1] }; },
  renderer: (k: any) => `<mark>${esc(k.text)}</mark>`,
}] });

const view = new EditorView({
  parent: $('editor'),
  extensions: [basicSetup, markdown(), EditorView.lineWrapping,
    syntaxHighlighting(HighlightStyle.define([
      { tag: t.heading, color: '#f3d9a4', fontWeight: '700' },
      { tag: [t.link, t.url], color: '#e9b872' },
      { tag: t.emphasis, fontStyle: 'italic' }, { tag: t.strong, fontWeight: '700' },
      { tag: [t.monospace, t.processingInstruction, t.meta], color: '#9a8f7c' },
      { tag: t.quote, color: '#b9ad98' },
    ])),
    EditorView.theme({
      '&': { color: 'var(--fg)', backgroundColor: 'transparent', fontSize: '17px' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.65' },
      '.cm-content': { caretColor: 'var(--acc)', padding: '16px 0' },
      '.cm-cursor': { borderLeftColor: 'var(--acc)' },
      '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--mut)', border: 'none', fontFamily: 'var(--tt)', fontSize: '13px' },
      '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(255,235,200,.05)' },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgba(233,184,114,.28)' },
    }, { dark: true }),
    EditorView.updateListener.of(u => { if (u.docChanged && !loading) { dirty = true; status('sin guardar…'); clearTimeout(timer); timer = window.setTimeout(save, 800); } }),
    EditorView.domEventHandlers({ paste: (e) => { const f = [...(e.clipboardData?.files ?? [])].find(x => x.type.startsWith('image/')); if (!f) return false; e.preventDefault(); pasteImage(f); return true; } })],
});

function status(s: string) { $('status').textContent = s; }

let dirty = false;
async function save() {
  clearTimeout(timer);
  if (!cur || !dirty) return;
  try { cur.mtime = await vault.write(cur.path, view.state.doc.toString(), cur.mtime); dirty = false; status('guardado ✓'); }
  catch (e) { status(e instanceof Conflict ? '⚠ ' + e.message : 'error al guardar: ' + e); }
}

async function pasteImage(f: File) {
  if (!cur) return;
  let setting: string | undefined;
  try { setting = JSON.parse(await (await vault.read('.obsidian/app.json')).data.text()).attachmentFolderPath; } catch { /* sin configuración: raíz */ }
  const dir = attachmentDir(setting, cur.path);
  const name = pastedName(new Date(), f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png');
  const path = (dir ? dir + '/' : '') + name;
  await vault.write(path, f);
  paths.push(path);
  view.dispatch(view.state.replaceSelection(`![[${name}]]`));
}

async function openNote(path: string) {
  await save(); // no perder lo pendiente de la nota anterior
  if (dirty) return; // el guardado falló: no se cambia de nota para no perder el texto
  const { data, mtime } = await vault.read(path);
  const text = await data.text();
  if (/\.excalidraw(\.md)?$/.test(path) || /^---[\s\S]{0,400}excalidraw-plugin/.test(text)) return status('excalidraw: pendiente de integrar');
  loading = true;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  loading = false;
  cur = { path, mtime };
  $('title').textContent = path.replace(/\.md$/, '');
  $('mode').hidden = false;
  status('');
  showEditor();
}

function renderTree() {
  const q = $<HTMLInputElement>('q').value.toLowerCase();
  const ul = $('tree'); ul.replaceChildren();
  for (const p of paths.filter(p => p.endsWith('.md') && p.toLowerCase().includes(q)).sort().slice(0, 500)) {
    const b = document.createElement('button'); b.textContent = p.replace(/\.md$/, ''); b.onclick = () => openNote(p);
    const li = document.createElement('li'); li.append(b); ul.append(li);
  }
}

function showEditor() { $('preview').hidden = true; $('editor').hidden = false; $('mode').textContent = 'vista previa'; }
async function showPreview() {
  await save();
  const el = $('preview');
  el.innerHTML = DOMPurify.sanitize(await marked.parse(view.state.doc.toString())); // shortcut: sin callouts ni frontmatter, ver NEXT.md
  for (const img of el.querySelectorAll<HTMLImageElement>('img[data-vault]'))
    vault.read(img.dataset.vault!).then(r => { img.src = URL.createObjectURL(r.data); });
  $('editor').hidden = true; el.hidden = false; $('mode').textContent = 'editar';
}

async function start(v: Vault) {
  vault = v;
  paths = (await v.list()).map(e => e.path);
  document.body.classList.add('open');
  renderTree();
  status(`${paths.length} archivos`);
}

$('preview').addEventListener('click', e => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-note]');
  if (a) { e.preventDefault(); if (a.dataset.note!.endsWith('.md')) openNote(a.dataset.note!); }
});
$('mode').onclick = () => ($('preview').hidden ? showPreview() : showEditor());
$('q').oninput = renderTree;
$('open').onclick = async () => {
  if (!('showDirectoryPicker' in window))
    return void ($('hint').textContent = 'Este navegador no puede abrir carpetas locales. Usa Chrome o Edge en un ordenador; el acceso por OneDrive está en camino.');
  try { await start(new LocalVault(await (window as any).showDirectoryPicker({ mode: 'readwrite' }))); }
  catch (e) { if ((e as Error).name !== 'AbortError') $('hint').textContent = String(e); }
};
$('demo').onclick = () => start(new MemoryVault({
  'Bienvenida.md': '# Bienvenida a Órbita\n\nEsto es una **demostración**: nada se guarda.\n\nEnlace a [[Agujero negro]], texto ==resaltado== y una ecuación:\n\n$$\nr_s = \\frac{2GM}{c^2}\n$$\n\nEn línea: $E = mc^2$.\n\n```\nlos [[enlaces]] dentro de código no se tocan\n```\n',
  'Física/Agujero negro.md': '# Agujero negro\n\nRegión de la que ni la luz escapa. Vuelve a [[Bienvenida]].\n\n> El horizonte está en $r = r_s$.\n',
})).then(() => openNote('Bienvenida.md'));
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });
