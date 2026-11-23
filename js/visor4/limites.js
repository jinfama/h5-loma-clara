// limites.js — estado del límite de cada término de la fecha (AND-LIM-02, apartado 6; ronda v9).
// Cada polígono de geo/terminos/<corte> trae `estado_limite` y `motivo_estado`. Se pinta por BORDE: un borde entre dos
// términos toma el estado menos seguro de los dos (exacto < aproximado < supuesto); los grises (sin municipio en la
// fecha) no cuentan, y su borde lo pone el vecino.
//   exacto_por_union → continuo · aproximado → discontinuo · supuesto, documentado_en_texto y no_cuadra → punteado
//   («límite supuesto: término de hoy agrupado») · sin_municipio_en_la_fecha → gris (relleno).
// También da el bloque «Término de la fecha» de la ficha (estado y su motivo, intendencia, partido, provincia, cambios
// posteriores y deslindes), solo con lo que traigan los datos.

/* global d3, topojson */
import { esc } from '../atlas2/fmt.js';

// nombres de las propiedades: abreviados en el topojson (su `leyenda` los explica); los textos largos van en listas del
// propio fichero (`motivos_estado`, `cambios_posteriores`, `partidos_judiciales`) y la propiedad trae el índice
const campo = (p, ...k) => { for (const x of k) if (p && p[x] != null && p[x] !== '') return p[x]; return null; };
const deLista = (topo, lista, v) => (v == null ? null : typeof v === 'number' && topo && Array.isArray(topo[lista]) ? topo[lista][v] ?? null : v);
export const estadoDe = p => campo(p, 'estado_limite', 'el');
export const motivoDe = (p, topo) => deLista(topo, 'motivos_estado', campo(p, 'motivo_estado', 'me'));
const PROV = { '04': 'Almería', 11: 'Cádiz', 14: 'Córdoba', 18: 'Granada', 21: 'Huelva', 23: 'Jaén', 29: 'Málaga', 41: 'Sevilla' };
const INTEND = { GRA: 'Granada', SEV: 'Sevilla', JAE: 'Jaén', COR: 'Córdoba' };
const provLlana = v => String(v).split(/[^0-9]+/).filter(Boolean).map(c => PROV[c.padStart(2, '0')] || c).join(' y ');
const intendLlana = v => { const m = /^INT-([A-Z]+)$/.exec(String(v)); return m ? `de ${INTEND[m[1]] || m[1]}` : String(v); };
const partidoLlano = (v, anio) => String(v).split(' / ').map(x => x.replace(/^AND-PJ\S+\s+/, '')).join(' y ') + (anio ? ` (partidos de ${anio})` : '');

export const CLASES_LIMITE = [
  { k: 'exacto', rot: 'límite exacto (unión de recintos de hoy)', dash: [], estados: ['exacto_por_union', 'exacto', 'oficial'] },
  { k: 'aprox', rot: 'límite aproximado', dash: [4, 2.6], estados: ['aproximado'] },
  { k: 'supuesto', rot: 'límite supuesto: término de hoy agrupado', dash: [0.6, 2.4], cap: 'round', estados: ['supuesto', 'documentado_en_texto', 'no_cuadra'] },
];
const ORDEN = { exacto: 0, aprox: 1, supuesto: 2 };
export function claseDe(estado) {
  if (!estado || estado === 'sin_municipio_en_la_fecha') return null;
  const c = CLASES_LIMITE.find(x => x.estados.includes(estado));
  return c ? c.k : 'aprox';   // un estado nuevo que no se conoce: discontinuo, nunca continuo
}
const ESTADO_LLANO = {
  oficial: 'oficial (el término de hoy)', exacto_por_union: 'exacto: unión de recintos de hoy', exacto: 'exacto', aproximado: 'aproximado',
  supuesto: 'supuesto: término de hoy agrupado', documentado_en_texto: 'supuesto: documentado en texto, sin línea',
  no_cuadra: 'supuesto: la línea de la fuente no cuadra con los recintos de hoy', sin_municipio_en_la_fecha: 'sin municipio en la fecha',
};
export const estadoLlano = e => ESTADO_LLANO[e] || String(e || '').replace(/_/g, ' ');

// ¿trae estados esta geometría?
export function hayEstados(topo, objeto = 'terminos') {
  const o = topo && topo.objects && topo.objects[objeto];
  return !!(o && o.geometries.some(g => estadoDe(g.properties)));
}

// mallas por clase (una vez por topojson)
const MALLAS = new WeakMap();
export function mallasPorClase(topo, objeto = 'terminos') {
  if (MALLAS.has(topo)) return MALLAS.get(topo);
  const obj = topo.objects[objeto];
  const out = {};
  for (const c of CLASES_LIMITE) {
    out[c.k] = topojson.mesh(topo, obj, (a, b) => {
      const ka = claseDe(estadoDe(a.properties)), kb = claseDe(estadoDe(b.properties));
      const k = ka == null ? kb : kb == null ? ka : (ORDEN[ka] >= ORDEN[kb] ? ka : kb);
      return (k || 'exacto') === c.k;
    });
  }
  MALLAS.set(topo, out);
  return out;
}

// dibuja los bordes por estado con un color, un ancho y una opacidad
const P2 = new WeakMap();
export function dibujaBordes(ctx, proj, topo, { color = '#ffffff', ancho = 0.5, alfa = 0.95, objeto = 'terminos' } = {}) {
  const m = mallasPorClase(topo, objeto);
  const k = proj.scale() + '|' + proj.translate().join(',');
  let c = P2.get(m);
  if (!c || c.k !== k) { const gp = d3.geoPath(proj); c = { k, p: Object.fromEntries(Object.entries(m).map(([x, g]) => { const q = new Path2D(); gp.context(q)(g); return [x, q]; })) }; P2.set(m, c); }
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = alfa; ctx.lineJoin = 'round';
  for (const cl of CLASES_LIMITE) {
    ctx.setLineDash(cl.dash.map(v => v * Math.max(1, ancho / 0.7)));
    ctx.lineCap = cl.cap || 'butt';
    ctx.lineWidth = cl.k === 'supuesto' ? ancho * 1.25 : ancho;
    ctx.stroke(c.p[cl.k]);
  }
  ctx.restore();
}

// clases que hay de verdad en un corte (la leyenda solo enseña esas)
const PRESENTES = new WeakMap();
export function clasesPresentes(topo, objeto = 'terminos') {
  if (PRESENTES.has(topo)) return PRESENTES.get(topo);
  const set = new Set();
  for (const g of (topo.objects[objeto] || { geometries: [] }).geometries) { const k = claseDe(estadoDe(g.properties)); if (k) set.add(k); }
  PRESENTES.set(topo, set);
  return set;
}
// muestras para la leyenda (SVG pequeño, mismo dibujo)
export function leyendaLimites(color = '#262626', presentes = null) {
  return CLASES_LIMITE.filter(c => !presentes || presentes.has(c.k)).map(c => `<li><svg class="c4-sw" width="30" height="10" aria-hidden="true"><line x1="2" y1="5" x2="28" y2="5" stroke="${color}" stroke-width="${c.k === 'supuesto' ? 1.5 : 1.2}"${c.dash.length ? ` stroke-dasharray="${c.dash.map(v => v * 1.4).join(' ')}"` : ''}${c.cap ? ` stroke-linecap="${c.cap}"` : ''}/></svg>${esc(c.rot)}</li>`).join('');
}

// bloque de la ficha del término: solo lo que traen los datos (topo: el topojson del corte, con sus listas)
export function bloqueTermino(p, etiquetaFecha = '', topo = null) {
  if (!p) return '';
  const filas = [];
  const est = estadoDe(p), mot = motivoDe(p, topo);
  if (est) filas.push(['Límite', estadoLlano(est)]);
  if (mot) filas.push(['Por qué', String(mot).charAt(0).toUpperCase() + String(mot).slice(1)]);
  const rn = campo(p, 'reino', 'rn'), rnd = campo(p, 'reino_deducido', 'rnd');
  if (rn) filas.push(['Reino', `${String(rn).replace(/^reino de /i, '')} (leído en 1591)`]);
  else if (rnd) filas.push(['Reino', `${String(rnd).replace(/^reino de /i, '')}: ${String(campo(p, 'rnm', 'rndm', 'marca_reino') || 'deducido de la intendencia de 1752').replace(/_/g, ' ')}; sin línea en 1591`]);
  const it = campo(p, 'intendencia', 'it');
  if (it) filas.push(['Intendencia', intendLlana(it)]);
  const pj = deLista(topo, 'partidos_judiciales', campo(p, 'partido_judicial', 'pj'));
  if (pj) filas.push(['Partido judicial', partidoLlano(pj, campo(p, 'partido_judicial_de', 'pjd'))]);
  const pv = campo(p, 'provincia', 'pv');
  if (pv) filas.push(['Provincia', provLlana(pv)]);
  const cp = deLista(topo, 'cambios_posteriores', campo(p, 'cambios_posteriores', 'cp'));
  const cambios = cp == null ? [] : (Array.isArray(cp) ? cp : String(cp).split(/;\s+/)).map(String).filter(Boolean);
  filas.push(['Cambios posteriores', cambios.length ? null : 'ninguno que toque sus líneas']);
  const dn = campo(p, 'deslindes_posteriores_n', 'dn');
  if (dn != null) { const dm = campo(p, 'deslinde_mas_reciente', 'dm'); filas.push(['Deslindes posteriores', `${dn}${dm ? ` (el más reciente, ${dm})` : ''}`]); }
  return `<div class="l9-ficha"><p class="v3fi-k">Término ${esc(etiquetaFecha)}</p><table class="r4-tabla">${filas.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v == null ? `<ul class="l9-cambios">${cambios.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : esc(v)}</td></tr>`).join('')}</table></div>`;
}
