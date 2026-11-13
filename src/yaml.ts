/** YAML mínimo para las propiedades (frontmatter) que escribe Obsidian: escalares, listas y mapas de un nivel. */
export type Fm = Record<string, unknown>;

export function parseFrontmatter(src: string): { fm: Fm | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { fm: null, body: src };
  return { fm: parseYaml(m[1]), body: src.slice(m[0].length) };
}

export function parseYaml(text: string): Fm {
  const fm: Fm = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([^\s#][^:]*?):(?:\s+(.*)|\s*$)/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1].trim();
    const rest = (kv[2] ?? '').trim();
    if (rest === '' || rest === '|' || rest === '>') {
      const items: string[] = [], block: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (/^\s*$/.test(l)) continue;
        if (!/^\s/.test(l)) break; // siguiente clave de primer nivel
        const li = /^\s*-\s*(.*)$/.exec(l);
        if (li) items.push(li[1]); else block.push(l.trim());
      }
      i = j - 1;
      if (items.length) fm[key] = items.map(scalar);
      else if (rest) fm[key] = block.join(rest === '|' ? '\n' : ' ').trim();
      else if (block.length) fm[key] = Object.fromEntries(block.map(l => { const p = l.indexOf(':'); return p < 0 ? [l, null] : [l.slice(0, p).trim(), scalar(l.slice(p + 1))]; }));
      else fm[key] = null;
    } else if (rest.startsWith('[') && rest.endsWith(']')) fm[key] = splitInline(rest.slice(1, -1)).map(scalar);
    else fm[key] = scalar(rest);
  }
  return fm;
}

function splitInline(s: string): string[] {
  const out: string[] = [];
  let cur = '', q = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = ''; }
    else if (ch === '"' || ch === "'") { q = ch; cur += ch; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

function scalar(v: string): unknown {
  v = v.trim();
  if (v === '' || v === '~' || v === 'null') return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1).replace(/\\"/g, '"');
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v.replace(/\s+#.*$/, ''); // comentario YAML al final de línea
}

export type PropType = 'text' | 'number' | 'checkbox' | 'date' | 'datetime' | 'list' | 'tags' | 'aliases' | 'object';

/** Tipo de propiedad como lo muestra Obsidian (icono y formato). */
export function propType(key: string, v: unknown): PropType {
  if (key === 'tags' || key === 'tag') return 'tags';
  if (key === 'aliases' || key === 'alias') return 'aliases';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'boolean') return 'checkbox';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'datetime';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
    return 'text';
  }
  return v && typeof v === 'object' ? 'object' : 'text';
}
