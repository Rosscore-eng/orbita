export interface Entry { path: string; mtime: number }
export interface Vault {
  list(): Promise<Entry[]>;
  read(path: string): Promise<{ data: Blob; mtime: number }>;
  /** Con expectedMtime lanza Conflict si el archivo cambió desde que se leyó (p. ej. editado en Obsidian). Devuelve el nuevo mtime. */
  write(path: string, data: Blob | string, expectedMtime?: number): Promise<number>;
}
export class Conflict extends Error {}

const SKIP = new Set(['.obsidian', '.git', '.orbita', '.trash', 'node_modules', '.smart-env']);

/** Bóveda en una carpeta local (File System Access API: Chrome/Edge). */
export class LocalVault implements Vault {
  constructor(private root: FileSystemDirectoryHandle) {}

  async list(): Promise<Entry[]> {
    const out: Entry[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, h] of dir.entries()) {
        if (SKIP.has(name)) continue;
        if (h.kind === 'directory') await walk(h as FileSystemDirectoryHandle, prefix + name + '/');
        else out.push({ path: prefix + name, mtime: (await (h as FileSystemFileHandle).getFile()).lastModified });
      }
    };
    await walk(this.root, '');
    return out;
  }

  private async dir(parts: string[], create: boolean) {
    let d = this.root;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }

  async read(path: string) {
    const parts = path.split('/');
    const f = await (await (await this.dir(parts.slice(0, -1), false)).getFileHandle(parts.at(-1)!)).getFile();
    return { data: f as Blob, mtime: f.lastModified };
  }

  async write(path: string, data: Blob | string, expectedMtime?: number) {
    const parts = path.split('/');
    const dir = await this.dir(parts.slice(0, -1), true);
    let old: File | null = null;
    try { old = await (await dir.getFileHandle(parts.at(-1)!)).getFile(); } catch { /* archivo nuevo */ }
    if (old && expectedMtime !== undefined && old.lastModified !== expectedMtime)
      throw new Conflict(`${path} cambió fuera de Órbita; recárgalo antes de guardar.`);
    if (old) await this.backup(path, old); // red de seguridad: última versión previa
    const h = await dir.getFileHandle(parts.at(-1)!, { create: true });
    const w = await h.createWritable();
    await w.write(data);
    await w.close();
    return (await h.getFile()).lastModified;
  }

  private async backup(path: string, old: Blob) {
    try {
      const parts = ['.orbita', 'backup', ...path.split('/')];
      const h = await (await this.dir(parts.slice(0, -1), true)).getFileHandle(parts.at(-1)!, { create: true });
      const w = await h.createWritable();
      await w.write(old);
      await w.close();
    } catch { /* shortcut: si el respaldo falla se guarda igual; endurecer al añadir OneDrive */ }
  }
}

/** Bóveda de demostración en memoria: nada se guarda en disco. */
export class MemoryVault implements Vault {
  private files = new Map<string, { data: Blob; mtime: number }>();
  constructor(seed: Record<string, string>) { for (const [p, t] of Object.entries(seed)) this.files.set(p, { data: new Blob([t]), mtime: 1 }); }
  async list() { return [...this.files].map(([path, f]) => ({ path, mtime: f.mtime })); }
  async read(path: string) { const f = this.files.get(path); if (!f) throw new Error('No existe: ' + path); return f; }
  async write(path: string, data: Blob | string, expectedMtime?: number) {
    const old = this.files.get(path);
    if (old && expectedMtime !== undefined && old.mtime !== expectedMtime) throw new Conflict(`${path} cambió fuera de Órbita; recárgalo antes de guardar.`);
    const mtime = (old?.mtime ?? 0) + 1;
    this.files.set(path, { data: new Blob([data]), mtime });
    return mtime;
  }
}
