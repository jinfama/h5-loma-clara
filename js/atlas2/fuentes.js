/* Atlas v2 · catálogo de fuentes (data/v2/fuentes.json).
   Esquema: { id: { titulo, original, localizador_tipo, nota } }.
   Regla: se enseña la FUENTE ORIGINAL (campo `original`), nunca «extraído por».
   Uso:
     import { cargarFuentes, nombreFuente, citaHTML } from './js/atlas2/fuentes.js';
     await cargarFuentes();
     el.innerHTML = citaHTML('ine_alteraciones', 'p. 34'); */

import { cargarSiHay } from './data.js';
import { esc, limpiaRutas } from './fmt.js';

let catalogo = {};
let promesa = null;

export function cargarFuentes() {
  if (!promesa) promesa = cargarSiHay('fuentes.json').then(c => {
    catalogo = c || {};
    for (const f of Object.values(catalogo)) if (f && typeof f === 'object') for (const k of ['nota', 'notas', 'aviso']) if (typeof f[k] === 'string') f[k] = limpiaRutas(f[k]);
    return catalogo;
  });
  return promesa;
}

/* id de la fuente cuyo `original` o `titulo` es exactamente ese texto (p. ej. el campo `fuente` de conteo.json). */
export function buscarFuente(texto) {
  if (!texto) return null;
  if (catalogo[texto]) return texto;
  for (const [id, f] of Object.entries(catalogo)) if (f.original === texto || f.titulo === texto) return id;
  return null;
}

export function fuente(id) {
  return (id && catalogo[id]) || null;
}

/* Texto corto de la fuente original. Si el id no está en el catálogo se enseña el id tal cual
   (así se ve el hueco en vez de inventar un título). */
export function nombreFuente(id) {
  const f = fuente(id);
  if (!f) return id ? String(id) : 'fuente sin identificar';
  return f.original || f.titulo || String(id);
}

/* Nombre corto de la fuente (campo `titulo`, que también es la fuente original, sin la signatura de archivo). */
export function tituloFuente(id) {
  const f = fuente(id);
  if (!f) return id ? String(id) : 'fuente sin identificar';
  return f.titulo || f.original || String(id);
}

/* Cita HTML: «Fuente original (localizador)», con el título completo en title= y la nota debajo si la hay. */
export function citaHTML(id, localizador, { conNota = false } = {}) {
  const f = fuente(id);
  const nombre = esc(nombreFuente(id));
  const loc = localizador ? ` <span class="a2-mono">(${esc(localizador)})</span>` : '';
  const title = f && f.titulo && f.titulo !== f.original ? ` title="${esc(f.titulo)}"` : '';
  const nota = conNota && f && f.nota ? `<br><small>${esc(f.nota)}</small>` : '';
  return `<span class="a2-cita"${title}>${nombre}${loc}</span>${nota}`;
}
