/* Atlas v2 · leyendas e insignias comunes (devuelven HTML).
   import { leyenda, rampa, insignia, INSIGNIAS } from './js/atlas2/leyenda.js'; */

import { esc } from './fmt.js';

/* items: [{ texto, color, clase }]; clase opcional: 'a2-trama-estimado', 'a2-trama-sindato',
   'a2-swatch--dot', 'a2-swatch--line', 'a2-swatch--dash'. */
export function leyenda(items, { etiqueta = 'Leyenda' } = {}) {
  return `<ul class="a2-legend" aria-label="${esc(etiqueta)}">${items.map(i =>
    `<li class="a2-legend__item"><span class="a2-swatch ${i.clase || ''}" style="${i.color ? `background-color:${i.color};` : ''}${i.estilo || ''}" aria-hidden="true"></span>${esc(i.texto)}</li>`
  ).join('')}</ul>`;
}

/* Rampa secuencial: colores (lista) y etiquetas (lista de la misma longitud o +1 para bordes). */
export function rampa(colores, etiquetas = [], { etiqueta = 'Escala' } = {}) {
  return `<div aria-label="${esc(etiqueta)}"><div class="a2-legend-ramp">${colores.map(c => `<span style="background:${c}"></span>`).join('')}</div>` +
    (etiquetas.length ? `<div class="a2-legend-ramp__labels">${etiquetas.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : '') + '</div>';
}

/* Textos fijos de las insignias que se repiten en todas las páginas. */
export const INSIGNIAS = {
  // geometría histórica aceptada (AND-LIM-09 A, 20-nov-2026): se rotula con la nota de la base; si volviera una reserva de tema «geometria», manda su rótulo
  candidata: 'Geometría reconstruida uniendo recintos de hoy: no es el límite histórico observado',
  revision: 'Construido con las decisiones firmadas; pendiente de la aceptación de conjunto del responsable de la base',
  revision_corta: 'Pendiente de aceptación de conjunto',
  candidata_corta: 'Geometría reconstruida con recintos de hoy',
  supuesto: 'Límites supuestos',
  estimado: 'Estimado',
};

// el rótulo de la geometría histórica sale de la reserva de tema «geometria» de reservas.json (si cambia, cambia aquí)
import('./data.js').then(m => m.cargarSiHay('reservas.json')).then(r => {
  const lista = Array.isArray(r) ? r : (r && (r.reservas || r.items)) || [];
  const g = lista.find(x => x && x.tema === 'geometria' && x.rotulo);
  if (g) { INSIGNIAS.candidata = g.rotulo; INSIGNIAS.candidata_corta = 'Geometría histórica, pendiente de aceptación'; }
}).catch(() => {});

/* tipo: candidata | revision | supuesto | estimado | accent. Texto corto (mapas estrechos): insignia('revision', INSIGNIAS.revision_corta). */
export function insignia(tipo, texto = INSIGNIAS[tipo] || tipo, { title = '' } = {}) {
  return `<span class="a2-badge a2-badge--${tipo}"${title ? ` title="${esc(title)}"` : ''}>${esc(texto)}</span>`;
}
