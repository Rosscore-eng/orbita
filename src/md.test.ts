import { expect, test } from 'vitest';
import { renderMarkdown } from './md';

const paths = ['A.md', 'B.md', 'img/f.png', 'Carpeta/R.md'];
const r = (md: string, fm: Record<string, unknown> | null = null) => renderMarkdown(md, { paths, fm });

test('wikilinks, resaltado y etiquetas; el código no se toca', () => {
  const h = r('[[A]] ==x== #tag [[nada]]\n\n```\n[[B]]\n```\n');
  expect(h).toContain('data-note="A.md"');
  expect(h).toContain('<mark>x</mark>');
  expect(h).toContain('data-tag="tag"');
  expect(h).toContain('is-unresolved');
  expect(h).not.toContain('data-note="B.md"');
  expect(h).toContain('[[B]]');
});

test('alias con \\| dentro de tablas e incrustados', () => {
  const h = r('| a |\n|---|\n| [[Carpeta/R\\|Acc]] |\n\n![[f.png|200]]');
  expect(h).toContain('data-note="Carpeta/R.md">Acc<');
  expect(h).toContain('<img class="embed-img" data-vault="img/f.png" alt="f.png" width="200">');
});

test('callouts plegables y fijos', () => {
  const h = r('> [!note]- Título\n> cuerpo [[A]]\n\nfuera\n\n> [!warning] Ojo\n> texto');
  expect(h).toMatch(/<details class="callout" data-callout="note" data-color="blue">(?!.*open)/);
  expect(h).toContain('data-note="A.md"');
  expect(h).toContain('<p>fuera</p>');
  expect(h).toContain('<div class="callout" data-callout="warning" data-color="orange">');
  expect(r('> [!tip]+ Abierto\n> x')).toContain(' open>');
});

test('dataview: bloques como aviso y =this.* desde las propiedades', () => {
  expect(r('```dataviewjs\nx\n```')).toContain('dv-block');
  const h = r('C`=this.ciclo` · `=this.link` · `=length(x)`', { ciclo: 5, link: '[[A|Alias]]' });
  expect(h).toContain('<span class="dv-inline">5</span>');
  expect(h).toContain('data-note="A.md">Alias<');
  expect(h).toContain('is-raw');
});

test('comentarios %% y enlaces externos', () => {
  const h = r('hola %%oculto%% [web](https://x.y)');
  expect(h).not.toContain('oculto');
  expect(h).toContain('target="_blank"');
});
