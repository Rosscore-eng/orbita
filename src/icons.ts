import { createElement, icons, type IconNode } from 'lucide';

const all = icons as Record<string, IconNode>;
const pascal = (s: string) => s.split(/[-_ ]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
const EMOJI = /^\p{Extended_Pictographic}/u;

/** Icono de Lucide por nombre ("lucide-house" o "house") o un emoji; si no existe, `fallback`. */
export function icon(name: string | undefined, fallback = 'file', size = 16): Element {
  if (name && EMOJI.test(name)) {
    const s = document.createElement('span');
    s.className = 'emoji-icon';
    s.textContent = name;
    return s;
  }
  const node = all[pascal((name ?? fallback).replace(/^lucide-/, ''))] ?? all[pascal(fallback)] ?? all.Circle;
  const el = createElement(node, { width: size, height: size });
  el.setAttribute('class', 'icon');
  return el;
}

export function setIcon(el: Element, name: string, size = 18) { el.replaceChildren(icon(name, 'circle', size)); }

/** Configuración del plugin Iconic: icono (y color) por carpeta o archivo. */
export interface IconicCfg { fileIcons: Record<string, { icon?: string; color?: string }> }
export const ICONIC_COLORS: Record<string, string> = { red: '#f47067', orange: '#ffa657', yellow: '#d29922', green: '#7ee787', cyan: '#a5d6ff', blue: '#6cb6ff', purple: '#d2a8ff', pink: '#f778ba', gray: '#8b949e' };

export interface FileColors { map: Map<string, string>; cascade: boolean; background: boolean }

/** Plugin File Color: ruta → color; con cascada, los hijos heredan el color de la carpeta. */
export function fileColorMap(data: { palette?: { id: string; value: string }[]; fileColors?: { path: string; color: string }[]; cascadeColors?: boolean; colorBackground?: boolean }): FileColors {
  const pal = new Map((data.palette ?? []).map(p => [p.id, p.value]));
  const map = new Map<string, string>();
  for (const f of data.fileColors ?? []) { const c = pal.get(f.color); if (c) map.set(f.path, c); }
  return { map, cascade: data.cascadeColors !== false, background: data.colorBackground !== false };
}

export function colorFor(path: string, fc: FileColors): string | undefined {
  const own = fc.map.get(path);
  if (own || !fc.cascade) return own;
  let p = path;
  while (p.includes('/')) { p = p.slice(0, p.lastIndexOf('/')); const c = fc.map.get(p); if (c) return c; }
  return undefined;
}
