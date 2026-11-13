import { expect, test } from 'vitest';
import { Conflict, MemoryVault } from './vault';

test('write detecta conflicto si la versión leída ya no es la actual', async () => {
  const v = new MemoryVault({ 'a.md': 'uno' });
  const { mtime } = await v.read('a.md');
  const m2 = await v.write('a.md', 'dos', mtime);
  await expect(v.write('a.md', 'tres', mtime)).rejects.toBeInstanceOf(Conflict);
  expect(await (await v.read('a.md')).data.text()).toBe('dos');
  await v.write('a.md', 'tres', m2);
  expect(await (await v.read('a.md')).data.text()).toBe('tres');
});
