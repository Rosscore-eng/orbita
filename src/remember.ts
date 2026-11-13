// Guarda en IndexedDB el acceso a la carpeta de la bóveda para volver a abrirla con un clic.
const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open('orbita', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

export async function remember(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(value, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  } catch { /* sin IndexedDB (modo privado): simplemente no se recuerda */ }
}

export async function recall<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result as T | undefined); r.onerror = () => rej(r.error); });
  } catch { return undefined; }
}

export async function forget(key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(key); t.oncomplete = () => res(); t.onerror = () => res(); });
  } catch { /* nada que olvidar */ }
}
