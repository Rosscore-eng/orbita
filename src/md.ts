import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { resolveLink } from './links';
import type { Fm } from './yaml';

const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
export const IMG = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
export const PDF = /\.pdf$/i;

/** Tipos de callout de Obsidian: icono y color. */
export const CALLOUTS: Record<string, { icon: string; color: string }> = (() => {
  const c = (icon: string, color: string, ...names: string[]) => Object.fromEntries(names.map(n => [n, { icon, color }]));
  return {
    ...c('pencil', 'blue', 'note'), ...c('clipboard-list', 'cyan', 'abstract', 'summary', 'tldr'), ...c('info', 'blue', 'info'),
    ...c('circle-check', 'blue', 'todo'), ...c('flame', 'cyan', 'tip', 'hint', 'important'), ...c('check', 'green', 'success', 'check', 'done'),
    ...c('circle-help', 'yellow', 'question', 'help', 'faq'), ...c('triangle-alert', 'orange', 'warning', 'caution', 'attention'),
    ...c('x', 'red', 'failure', 'fail', 'missing'), ...c('zap', 'red', 'danger', 'error'), ...c('bug', 'red', 'bug'),
    ...c('list', 'purple', 'example'), ...c('quote', 'gray', 'quote', 'cite'),
  };
})();

export interface Ctx { paths: string[]; fm: Fm | null }
let ctx: Ctx = { paths: [], fm: null };

function wikilink(target: string, alias: string | undefined, embed: boolean): string {
  const p = resolveLink(target, ctx.paths);
  const label = esc(alias ?? target);
  if (!p) return `<a href="#" class="internal-link is-unresolved" data-target="${esc(target)}">${label}</a>`;
  if (embed) {
    if (IMG.test(p)) return `<img class="embed-img" data-vault="${esc(p)}" alt="${esc(target)}"${/^\d+$/.test(alias ?? '') ? ` width="${alias}"` : ''}>`;
    if (PDF.test(p)) { const h = /#(.+)$/.exec(target)?.[1]; return `<iframe class="embed-pdf" data-vault="${esc(p)}"${h ? ` data-hash="${esc(h)}"` : ''}></iframe>`; }
    if (p.endsWith('.md')) return `<div class="embed-note" data-embed="${esc(p)}"><div class="embed-title"><a href="#" class="internal-link" data-note="${esc(p)}">${label}</a></div></div>`;
  }
  return `<a href="#" class="internal-link" data-note="${esc(p)}">${label}</a>`;
}

const inline = (md: string) => marked.parseInline(md, { async: false }) as string;

marked.use(markedKatex({ throwOnError: false, output: 'html' }), {
  gfm: true,
  extensions: [
    {
      name: 'wikilink', level: 'inline', start: src => src.match(/!?\[\[/)?.index,
      tokenizer(src) { const m = /^(!?)\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/.exec(src); if (m) return { type: 'wikilink', raw: m[0], embed: !!m[1], target: m[2], alias: m[3] }; },
      renderer: k => wikilink(k.target, k.alias, k.embed),
    },
    {
      name: 'highlight', level: 'inline', start: src => src.indexOf('=='),
      tokenizer(src) { const m = /^==([^=\n]+)==/.exec(src); if (m) return { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) }; },
      renderer(k) { return `<mark>${this.parser.parseInline(k.tokens ?? [])}</mark>`; },
    },
    {
      name: 'tag', level: 'inline', start(src) { const m = /(^|[\s(])#[^\s#\d]/.exec(src); return m ? m.index + m[1].length : undefined; },
      tokenizer(src) { const m = /^#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/u.exec(src); if (m) return { type: 'tag', raw: m[0], text: m[1] }; },
      renderer: k => `<a href="#" class="tag" data-tag="${esc(k.text)}">#${esc(k.text)}</a>`,
    },
    {
      name: 'callout', level: 'block',
      tokenizer(src) {
        const m = /^> *\[!([\w-]+)\]([-+]?)[ \t]*([^\n]*)(?:\n|$)((?:>[^\n]*(?:\n|$))*)/.exec(src);
        if (!m) return;
        const title = m[3].trim();
        return { type: 'callout', raw: m[0], kind: m[1].toLowerCase(), fold: m[2], title, titleTokens: this.lexer.inlineTokens(title), tokens: this.lexer.blockTokens(m[4].replace(/^> ?/gm, '')) };
      },
      renderer(k) {
        const spec = CALLOUTS[k.kind] ?? CALLOUTS.note;
        const title = k.title ? this.parser.parseInline(k.titleTokens) : esc(k.kind[0].toUpperCase() + k.kind.slice(1));
        const head = `<span class="callout-icon" data-icon="${spec.icon}"></span><span class="callout-title-inner">${title}</span>`;
        const content = `<div class="callout-content">${this.parser.parse(k.tokens ?? [])}</div>`;
        if (!k.fold) return `<div class="callout" data-callout="${k.kind}" data-color="${spec.color}"><div class="callout-title">${head}</div>${content}</div>`;
        return `<details class="callout" data-callout="${k.kind}" data-color="${spec.color}"${k.fold === '+' ? ' open' : ''}><summary class="callout-title">${head}<span class="callout-fold" data-icon="chevron-down"></span></summary>${content}</details>`;
      },
    },
  ],
  renderer: {
    code({ text, lang }) {
      if (/^dataview(js)?$/i.test(lang ?? '')) return `<div class="dv-block"><span class="callout-icon" data-icon="database"></span><span>Consulta Dataview: se calcula solo en Obsidian</span></div>`;
      return false;
    },
    codespan({ text }) {
      if (!text.startsWith('=')) return false;
      const m = /^=this\.([\w.-]+)$/.exec(text);
      if (m && ctx.fm) { const v = ctx.fm[m[1]]; if (v !== undefined && v !== null) return `<span class="dv-inline">${inline(Array.isArray(v) ? v.join(', ') : String(v))}</span>`; }
      if (/^=date\(today\)$/.test(text)) return `<span class="dv-inline">${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>`;
      return `<code class="dv-inline is-raw" title="Expresión Dataview: se calcula solo en Obsidian">${esc(text)}</code>`;
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return `<a href="${esc(href)}" class="external-link" target="_blank" rel="noopener"${title ? ` title="${esc(title)}"` : ''}>${label}</a>`;
      const p = resolveLink(safeDecode(href), ctx.paths);
      return p ? `<a href="#" class="internal-link" data-note="${esc(p)}">${label}</a>` : `<a href="#" class="internal-link is-unresolved">${label}</a>`;
    },
    image({ href, text }) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
      const p = resolveLink(safeDecode(href), ctx.paths);
      return p ? `<img class="embed-img" data-vault="${esc(p)}" alt="${esc(text)}">` : false;
    },
  },
});

function safeDecode(s: string) { try { return decodeURI(s); } catch { return s; } }

/** Markdown de Obsidian → HTML (sin sanear: el llamador pasa el resultado por DOMPurify). */
export function renderMarkdown(body: string, c: Ctx): string {
  ctx = c;
  return marked.parse(body.replace(/%%[\s\S]*?%%/g, ''), { async: false }) as string;
}
