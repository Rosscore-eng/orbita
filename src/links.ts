/** Resuelve [[nombre]] como Obsidian: por nombre de archivo (con o sin extensión), si no por sufijo de ruta. */
export function resolveLink(target: string, paths: string[]): string | null {
  const t = target.split('#')[0].trim().replace(/^\/+/, '');
  if (!t) return null;
  const hasExt = /\.[A-Za-z0-9]+$/.test(t);
  const want = hasExt ? [t] : [t, t + '.md'];
  for (const w of want) {
    const hit = paths.find(p => p === w) ?? paths.find(p => p.endsWith('/' + w));
    if (hit) return hit;
  }
  return null;
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
