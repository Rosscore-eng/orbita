// Índice nombre → rutas, cacheado por lista de rutas (se reconstruye si la lista crece).
const cache = new WeakMap<string[], { n: number; byName: Map<string, string[]> }>();
function byName(paths: string[]) {
  const c = cache.get(paths);
  if (c && c.n === paths.length) return c.byName;
  const map = new Map<string, string[]>();
  const add = (k: string, p: string) => { const a = map.get(k); a ? a.push(p) : map.set(k, [p]); };
  for (const p of paths) {
    const name = p.slice(p.lastIndexOf('/') + 1).toLowerCase();
    add(name, p);
    if (name.endsWith('.md')) add(name.slice(0, -3), p);
  }
  cache.set(paths, { n: paths.length, byName: map });
  return map;
}

/** Resuelve [[enlace]] como Obsidian: por nombre (sin distinguir mayúsculas), con o sin extensión; con carpeta, por sufijo de ruta; si hay varios, el de ruta más corta. */
export function resolveLink(target: string, paths: string[]): string | null {
  const t = target.split(/[#^]/)[0].trim().replace(/^\/+|\/+$/g, '');
  if (!t) return null;
  const lower = t.toLowerCase();
  const cands = byName(paths).get(lower.slice(lower.lastIndexOf('/') + 1)) ?? [];
  const ok = lower.includes('/')
    ? cands.filter(p => { const l = p.toLowerCase(); return l === lower || l === lower + '.md' || l.endsWith('/' + lower) || l.endsWith('/' + lower + '.md'); })
    : cands;
  return ok.length ? ok.reduce((a, b) => (b.length < a.length ? b : a)) : null;
}

/** Destinos de [[enlaces]] y ![[incrustados]] de una nota, ignorando bloques de código y comentarios %%. */
export function extractLinks(md: string): string[] {
  const clean = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '').replace(/%%[\s\S]*?%%/g, '');
  return [...clean.matchAll(/\[\[([^\]|#^\n]+)/g)].map(m => m[1].trim()).filter(Boolean);
}

/** Carpeta de adjuntos según .obsidian/app.json: "" = raíz, "./x" = relativa a la nota, otra = desde la raíz. */
export function attachmentDir(setting: string | undefined, notePath: string): string {
  const dir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : '';
  if (!setting || setting === '/') return '';
  if (setting === './') return dir;
  if (setting.startsWith('./')) return [dir, setting.slice(2)].filter(Boolean).join('/');
  return setting.replace(/^\/+|\/+$/g, '');
}

/** Mismo nombre que usa Obsidian: "Pasted image YYYYMMDDHHmmss.png". */
export function pastedName(d: Date, ext = 'png'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Pasted image ${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}
