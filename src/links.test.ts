import { expect, test } from 'vitest';
import { attachmentDir, pastedName, resolveLink } from './links';

const paths = ['A/Física.md', 'B/img/foto.png', 'Inicio.md', 'X/Inicio.md'];
test('resolveLink', () => {
  expect(resolveLink('Física', paths)).toBe('A/Física.md');
  expect(resolveLink('foto.png', paths)).toBe('B/img/foto.png');
  expect(resolveLink('Inicio#Sección', paths)).toBe('Inicio.md');
  expect(resolveLink('nada', paths)).toBeNull();
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
