# Órbita — estado y pendientes

Web estática independiente (Vite + TS + CodeMirror), publicada con `npm run deploy` (rama `gh-pages`).
Regla: **todo cambio se escribe en los archivos de la bóveda**; nada de copias paralelas.

Hecho: carpeta local (`LocalVault`, Chrome/Edge), demostración en memoria (`MemoryVault`), editor, vista previa con
wikilinks / imágenes / KaTeX / `==resaltado==` (extensiones de marked, no tocan bloques de código), pegar imágenes,
guardado con detección de conflicto, tema agujero negro (`src/bh.ts`, WebGL) con tipografía Computer Modern.
Probado en navegador solo con la demostración; **nunca con una bóveda real**.

## Bloqueantes para usarla en la universidad
1. **Conector OneDrive** (`src/onedrive.ts`, implementa `Vault`). Microsoft Graph desde el navegador con MSAL.js (PKCE, sin servidor).
   - Pendiente de Roseli: registrar la app en Azure (Entra ID → App registrations → "SPA", redirect = URL publicada, permisos delegados `Files.ReadWrite`, `User.Read`). Decidir cuenta personal o UTP (la UTP puede bloquear consentimiento).
   - Listar: `/me/drive/root:/Ross_camino_al_MIT:/children` recursivo o `delta`; son ~3500 archivos, no listar a ciegas en cada apertura.
   - Escribir: `PUT .../content` hasta 4 MB; mayores con upload session. Conflictos con cabecera `If-Match: <eTag>`.
2. **Cambiar la interfaz `Vault`**: `expectedMtime: number` → `expectedVersion: string` (mtime en local, eTag en OneDrive). Ajustar `LocalVault`, `MemoryVault`, `main.ts`.
3. **PC compartido**: no persistir tokens (sessionStorage), botón "Cerrar sesión y borrar caché". Nada en localStorage.

## Funciones que el usuario pidió
4. **Excalidraw**: `@excalidraw/excalidraw` (React). Leer/guardar `.excalidraw.md` del plugin de Obsidian (bloque `compressed-json` con lz-string). Al guardar, reescribir solo el bloque del dibujo y conservar el resto del archivo byte a byte.
5. Plugins viables: callouts (`> [!note]`), frontmatter/tags. Mini-Dataview/TaskNotes/Full Calendar después, como lectura de frontmatter.

## Fallos y huecos conocidos
- Sin crear/renombrar/borrar notas ni carpetas; el árbol es una lista plana limitada a 500.
- Si una nota cambia en Obsidian mientras se edita aquí, solo avisa al guardar; no hay fusión.
- `LocalVault` sin tests (requiere simular `FileSystemDirectoryHandle`); el contrato de conflicto sí se prueba con `MemoryVault`.
- Carpeta local: solo Chrome/Edge de escritorio. En móvil, Firefox y Safari solo funciona la demostración hasta que exista el conector OneDrive.
- El fondo WebGL va a media resolución y 30 fps; sin medir en PCs lentos. Respeta `prefers-reduced-motion` (un solo fotograma).
- Servidor MCP (Claude/ChatGPT): no empezado. Hacerlo al final, con aprobación explícita de cada escritura.
