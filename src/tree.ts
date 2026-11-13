import { colorFor, icon, ICONIC_COLORS, type FileColors, type IconicCfg } from './icons';

export interface TNode { name: string; path: string; dir: boolean; children: TNode[] }
const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/** Árbol de carpetas a partir de rutas planas; carpetas primero y orden natural, como Obsidian. Omite archivos y carpetas ocultos. */
export function buildTree(paths: string[]): TNode {
  const root: TNode = { name: '', path: '', dir: true, children: [] };
  const dirs = new Map<string, TNode>([['', root]]);
  const dirOf = (p: string): TNode => {
    const d = dirs.get(p);
    if (d) return d;
    const i = p.lastIndexOf('/');
    const node: TNode = { name: p.slice(i + 1), path: p, dir: true, children: [] };
    dirOf(i < 0 ? '' : p.slice(0, i)).children.push(node);
    dirs.set(p, node);
    return node;
  };
  for (const p of paths) {
    if (p.startsWith('.') || p.includes('/.')) continue;
    const i = p.lastIndexOf('/');
    dirOf(i < 0 ? '' : p.slice(0, i)).children.push({ name: p.slice(i + 1), path: p, dir: false, children: [] });
  }
  const sort = (n: TNode) => { n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || coll.compare(a.name, b.name)); for (const c of n.children) if (c.dir) sort(c); };
  sort(root);
  return root;
}

export interface TreeOpts {
  expanded: Set<string>; current: string | null; iconic: IconicCfg; colors: FileColors;
  onOpen: (path: string) => void; onToggle: (path: string) => void;
}

export function fileRow(path: string, o: Pick<TreeOpts, 'iconic' | 'colors'>, showFolder = false): HTMLElement {
  const r = document.createElement('div');
  r.className = 'tree-row';
  r.title = path;
  const name = path.slice(path.lastIndexOf('/') + 1);
  const ic = o.iconic.fileIcons[path];
  const i = document.createElement('span');
  i.className = 'tree-icon';
  i.append(icon(ic?.icon, 'file'));
  if (ic?.color) i.style.color = ICONIC_COLORS[ic.color] ?? ic.color;
  const fc = colorFor(path, o.colors);
  if (fc) { r.classList.add('has-color'); r.style.setProperty('--fc', fc); if (o.colors.background) r.classList.add('has-bg'); }
  const label = document.createElement('span');
  label.className = 'tree-name';
  label.textContent = name.replace(/\.md$/, '');
  if (!name.endsWith('.md') && name.includes('.')) {
    const ext = document.createElement('span');
    ext.className = 'tree-ext';
    ext.textContent = name.slice(name.lastIndexOf('.') + 1).toUpperCase();
    label.append(ext);
  }
  r.append(i, label);
  if (showFolder && path.includes('/')) {
    const f = document.createElement('span');
    f.className = 'tree-folder';
    f.textContent = path.slice(0, path.lastIndexOf('/'));
    r.append(f);
  }
  return r;
}

export function renderTree(root: TNode, o: TreeOpts): DocumentFragment {
  const frag = document.createDocumentFragment();
  const item = (n: TNode): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'tree-item ' + (n.dir ? 'is-folder' : 'is-file') + (n.path === o.current ? ' is-active' : '');
    let row: HTMLElement;
    if (n.dir) {
      const open = o.expanded.has(n.path);
      row = document.createElement('div');
      row.className = 'tree-row';
      row.title = n.path;
      const ch = document.createElement('span');
      ch.className = 'tree-chevron' + (open ? ' is-open' : '');
      ch.append(icon('chevron-right', 'chevron-right', 14));
      const ic = o.iconic.fileIcons[n.path];
      const i = document.createElement('span');
      i.className = 'tree-icon';
      i.append(icon(ic?.icon ?? (open ? 'folder-open' : 'folder'), 'folder'));
      if (ic?.color) i.style.color = ICONIC_COLORS[ic.color] ?? ic.color;
      const fc = colorFor(n.path, o.colors);
      if (fc) { row.classList.add('has-color'); row.style.setProperty('--fc', fc); if (o.colors.background) row.classList.add('has-bg'); }
      const label = document.createElement('span');
      label.className = 'tree-name';
      label.textContent = n.name;
      row.append(ch, i, label);
      row.onclick = () => o.onToggle(n.path);
      el.append(row);
      if (open) {
        const kids = document.createElement('div');
        kids.className = 'tree-children';
        for (const c of n.children) kids.append(item(c));
        el.append(kids);
      }
    } else {
      row = fileRow(n.path, o);
      row.onclick = () => o.onOpen(n.path);
      el.append(row);
    }
    return el;
  };
  for (const c of root.children) frag.append(item(c));
  return frag;
}
