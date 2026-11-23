/* Atlas v2 · carga de data/v2 con caché.
   Uso:
     import { cargar, listo, esperarA } from './js/atlas2/data.js';
     const conteo = await cargar('fronteras/conteo.json');
     const ready = await listo();            // READY.json, siempre fresco
     await esperarA(['geo'], { cada: 20000, alEsperar: r => ... });
   Las rutas son relativas a data/v2/. Nunca se escribe nada. */

const BASE = new URL('../../data/v2/', import.meta.url);
const cache = new Map();

export function rutaDatos(path) {
  return new URL(path, BASE).href;
}

/* Carga un JSON una sola vez por página (las llamadas repetidas comparten la promesa).
   Si falla, se borra de la caché para poder reintentar. */
export function cargar(path, { fresco = false } = {}) {
  if (!fresco && cache.has(path)) return cache.get(path);
  const p = fetch(rutaDatos(path), { cache: fresco ? 'no-store' : 'default' })
    .then(r => {
      // regla 15: la ruta, solo en la consola; el público lee un texto llano
      if (!r.ok) { console.warn('[datos] no se pudo cargar', path, r.status); throw new Error(`no se pudo leer un fichero de datos (${r.status})`); }
      return r.json();
    })
    .catch(err => { cache.delete(path); throw err; });
  cache.set(path, p);
  return p;
}

/* Igual que cargar, pero devuelve null en vez de lanzar si el fichero no existe. */
export async function cargarSiHay(path) {
  try { return await cargar(path); } catch (e) { return null; }
}

/* READY.json: { geo: true, poblacion: true, ... }. Si no existe, {}. */
export async function listo() {
  try {
    const r = await fetch(rutaDatos('READY.json'), { cache: 'no-store' });
    if (!r.ok) return {};
    return await r.json();
  } catch (e) { return {}; }
}

/* Espera (sin bloquear) a que READY.json marque todas las claves pedidas.
   alEsperar(ready) se llama en cada intento fallido, para pintar un aviso. */
export async function esperarA(claves, { cada = 20000, alEsperar = null } = {}) {
  for (;;) {
    const r = await listo();
    if (claves.every(k => r[k])) return r;
    if (alEsperar) alEsperar(r);
    await new Promise(res => setTimeout(res, cada));
  }
}

/* MANIFEST.json, para enseñar la fecha y la huella corta de la versión de datos. */
export async function version() {
  const m = await cargarSiHay('MANIFEST.json');
  if (!m) return null;
  const fecha = m.generado || m.generated || m.fecha || null;
  const huella = m.huella || m.sha256 || m.hash || null;
  return { fecha, huella: huella ? String(huella).slice(0, 8) : null, raw: m };
}
