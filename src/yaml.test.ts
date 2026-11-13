import { expect, test } from 'vitest';
import { parseFrontmatter, parseYaml, propType } from './yaml';

test('parseYaml: escalares, listas, comillas y enlaces', () => {
  const fm = parseYaml([
    'tipo: panel', 'ciclo: 5', 'ok: true', 'fecha: 2026-11-13', 'link: "[[A|B]]"',
    'tags:', '  - a', '  - b/c', 'lista: [x, "y, z"]', 'vacio:', 'url: https://a.b/c', 'texto: hola  # comentario',
  ].join('\n'));
  expect(fm).toEqual({ tipo: 'panel', ciclo: 5, ok: true, fecha: '2026-11-13', link: '[[A|B]]', tags: ['a', 'b/c'], lista: ['x', 'y, z'], vacio: null, url: 'https://a.b/c', texto: 'hola' });
});

test('parseFrontmatter separa propiedades y cuerpo', () => {
  expect(parseFrontmatter('---\na: 1\n---\n# T\n')).toEqual({ fm: { a: 1 }, body: '# T\n' });
  expect(parseFrontmatter('# sin propiedades')).toEqual({ fm: null, body: '# sin propiedades' });
});

test('propType', () => {
  expect(propType('tags', ['a'])).toBe('tags');
  expect(propType('x', ['a'])).toBe('list');
  expect(propType('x', 5)).toBe('number');
  expect(propType('x', true)).toBe('checkbox');
  expect(propType('x', '2026-11-13')).toBe('date');
  expect(propType('x', 'hola')).toBe('text');
});
