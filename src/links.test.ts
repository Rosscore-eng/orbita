import { expect, test } from 'vitest';
import { attachmentDir, extractLinks, pastedName, resolveLink } from './links';

const paths = ['A/Física.md', 'B/img/foto.png', 'Inicio.md', 'X/Inicio.md', 'C/Guía.md', 'D/sub/Guía.md'];
test('resolveLink', () => {
  expect(resolveLink('Física', paths)).toBe('A/Física.md');
  expect(resolveLink('física', paths)).toBe('A/Física.md'); // sin distinguir mayúsculas
  expect(resolveLink('foto.png', paths)).toBe('B/img/foto.png');
  expect(resolveLink('Inicio#Sección', paths)).toBe('Inicio.md');
  expect(resolveLink('Guía', paths)).toBe('C/Guía.md'); // ambiguo: ruta más corta
  expect(resolveLink('sub/Guía', paths)).toBe('D/sub/Guía.md'); // con carpeta: sufijo de ruta
  expect(resolveLink('D/sub/Guía.md', paths)).toBe('D/sub/Guía.md');
  expect(resolveLink('nada', paths)).toBeNull();
});
test('resolveLink ve rutas añadidas después', () => {
  const p = ['a.md'];
  expect(resolveLink('b', p)).toBeNull();
  p.push('b.md');
  expect(resolveLink('b', p)).toBe('b.md');
});
test('extractLinks ignora código y comentarios', () => {
  expect(extractLinks('ver [[A]] y ![[B.png|200]] [[C#h|alias]]\n```\n[[no]]\n```\n`[[tampoco]]` %%[[ni]]%%')).toEqual(['A', 'B.png', 'C']);
});
test('attachmentDir', () => {
  expect(attachmentDir(undefined, 'a/b.md')).toBe('');
  expect(attachmentDir('./', 'a/b.md')).toBe('a');
  expect(attachmentDir('./img', 'a/b.md')).toBe('a/img');
  expect(attachmentDir('Adjuntos/', 'a/b.md')).toBe('Adjuntos');
});
test('pastedName', () => {
  expect(pastedName(new Date(2026, 10, 13, 9, 5, 7))).toBe('Pasted image 20261113090507.png');
});
