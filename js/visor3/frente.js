// frente.js — «Frente a Andalucía» (ronda v23, Juan): cuánto está cada unidad por encima o por debajo de la cifra de
// Andalucía de ese año. Solo en indicadores de intensidad con cifra de Andalucía en la base; el Atlas nunca calcula una
// media de municipios para hacer de «Andalucía». Lo usan el proveedor (mapa, ficha breve), las vistas y el CSV.
// Medida: porcentajes, diferencia en puntos · temperatura, altitud, pH e índices, diferencia en su unidad · razones
// positivas (densidad, tamaño medio, kg/ha, mm…), % por encima o por debajo.

import { motivoFrenteMinimo } from './minimo1752.js';   // minimo1752

const es = (v, d = 1) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: d });
const CATEGORICO = e => !!(e && (e.categorias || e.tipo === 'categorico' || e.tipo === 'categorica' || e.medida === 'categoria'));
// lo que se calcula sobre el propio máximo de cada unidad, o un año: compararlo con Andalucía no dice nada
const NO_INTENSIDAD = /^poblacion_(perdida_max|anio_max)$/;
const U_INTENSIDAD = /%|°C|\bmm\b|km\/km|g\/kg|\bpH\b|[íi]ndice|^m$|^km$/i;

export function esIntensidad(ent) {
  if (!ent || ent.proveedor || ent.mensual || CATEGORICO(ent) || NO_INTENSIDAD.test(String(ent.id))) return false;
  if (ent.agregacion === 'cociente') return true;
  if (ent.agregacion === 'suma') return false;
  return U_INTENSIDAD.test(String(ent.unidad || ''));
}
// por qué no se ofrece, en llano ('' si el tipo de indicador vale)
export function motivoNoFrente(ent) {
  if (!ent) return 'Sin indicador.';
  if (CATEGORICO(ent)) return 'Es una categoría, no una cifra: no hay «por encima» ni «por debajo».';
  if (/^a[ñn]o\b/i.test(String(ent.unidad || ''))) return 'Es una fecha, no una cifra: no hay «por encima» ni «por debajo».';
  if (!esIntensidad(ent)) return 'Es una cantidad o un dato propio de cada unidad: compararlo con Andalucía no dice nada.';
  return '';
}
export const SIN_CIFRA_AND = 'Este indicador no tiene cifra de Andalucía en la base, y el Atlas no se la inventa.';

// La referencia de un año (decisión de la sesión dueña, 22-nov-2026). Una suma parcial se compara solo si le falta menos
// del 1 % de las unidades del nivel municipal (1842-1856: falta 1 de 785), y se dice cuántas faltan; con el 1 % o más
// (1591, 1752, 1787), o sin saber cuántas faltan, no se compara en ningún modo. Una cifra estimada se compara y se marca,
// salvo con «Solo observado», que promete solo cifras observadas: ahí la referencia también cuenta.
// c = corte de <ind>__andalucia.json. -> { v, f, est, falta: {n, m}|null, motivo } (v null: no se compara)
export const UMBRAL_FALTA = 0.01;
export const REF_NO_COMPLETA = 'ese año no hay cifra de Andalucía completa';
export const REF_ESTIMADA = 'la cifra de Andalucía de ese año es estimada';
export const REF_SIN_CIFRA = 'ese año no hay cifra de Andalucía';
export function refAndalucia(c, obs = false, minimo = null) {
  if (!c || c.v[0] == null || !isFinite(c.v[0])) return { v: null, f: '.', est: false, motivo: REF_SIN_CIFRA };
  const x = c.extra ? c.extra(0) : {}, f = String(c.f || '')[0] || '0', est = f === '1' || f === '4';
  { const t = minimo ? motivoFrenteMinimo(minimo.ind, minimo.anio) : ''; if (t) return { v: null, f, est, falta: null, motivo: t }; }   // minimo1752
  let falta = null;
  if (f === '5' || (x && x.parcial)) {
    const n = x && x.parcial ? +x.parcial.n : NaN, m = x && x.parcial ? +x.parcial.m : NaN;
    if (!(m > 0 && n >= 0 && n <= m && (m - n) / m < UMBRAL_FALTA)) return { v: null, f, est, falta: null, motivo: REF_NO_COMPLETA };
    if (m > n) falta = { n: m - n, m };
  }
  if (obs && est) return { v: null, f, est, falta, motivo: REF_ESTIMADA };
  return { v: c.v[0], f, est, falta, motivo: '' };
}
// Lo que hay que decir de la cifra de Andalucía que se compara: «estimada», «falta 1 de 785» o las dos
export function notaRef(r) {
  if (!r) return '';
  const p = [];
  if (r.est) p.push('estimada');
  if (r.falta && r.falta.n > 0) p.push(`falta ${r.falta.n} de ${r.falta.m}`);
  return p.join(', ');
}

export function medidaFrente(ent) {
  const u = String((ent && ent.unidad) || '');
  if (/%/.test(u)) return 'puntos';
  if (/°C|\bpH\b|[íi]ndice|^m$/i.test(u)) return 'dif';
  return 'razon';
}
// la diferencia de una cifra frente a la de Andalucía (null si no se puede: un vacío sigue siendo un vacío)
export function difFrente(ent, v, a) {
  if (v == null || a == null || !isFinite(v) || !isFinite(a)) return null;
  if (medidaFrente(ent) === 'razon') return a > 0 ? (v / a - 1) * 100 : null;
  return v - a;
}
const uDif = ent => { const u = String(ent.unidad || ''); return /[íi]ndice/i.test(u) ? '' : /pH/.test(u) ? ' de pH' : ` ${u}`; };
const dec = ent => (/[íi]ndice/i.test(String(ent.unidad || '')) ? 2 : 1);
// rótulo de un corte de la leyenda: «+25 %», «−5 puntos», «+0,5 °C»
export function formatoFrente(ent, x) {
  if (x == null) return '—';
  const m = medidaFrente(ent), s = x > 0 ? '+' : x < 0 ? '−' : '', n = es(Math.abs(x), m === 'razon' ? 0 : dec(ent));
  return m === 'razon' ? `${s}${n} %` : m === 'puntos' ? `${s}${n} puntos` : `${s}${n}${uDif(ent)}`;
}
// «31 % por debajo de Andalucía (96,8)»
export function textoFrente(ent, x, a, fmtA = v => es(v, 2)) {
  if (x == null) return 'Sin cifra para comparar con Andalucía';
  const m = medidaFrente(ent), d = m === 'razon' ? 0 : dec(ent), n = es(Math.abs(x), d);
  const ref = `Andalucía (${fmtA(a)})`;
  if (Number(Math.abs(x).toFixed(d)) === 0) return `Como ${ref}`;
  const cuanto = m === 'razon' ? `${n} %` : m === 'puntos' ? `${n} ${n === '1' ? 'punto' : 'puntos'}` : `${n}${uDif(ent)}`;
  return `${cuanto} por ${x > 0 ? 'encima' : 'debajo'} de ${ref}`;
}
// corte «bonito» de un valor, hacia el más cercano
function redondo(x) {
  const b = 10 ** Math.floor(Math.log10(x)), m = x / b;
  return +([1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].reduce((p, q) => (Math.abs(q - m) < Math.abs(p - m) ? q : p), 1) * b).toPrecision(6);
}
const cuantil = (a, q) => a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
// seis cortes simétricos (siete clases) alrededor de «como Andalucía», fijos para todo el periodo
export function cortesFrente(ent, vals) {
  const m = vals.filter(v => v != null && isFinite(v)).map(Math.abs).filter(v => v > 0).sort((x, y) => x - y);
  if (!m.length) return null;
  const razon = medidaFrente(ent) === 'razon';
  let b = [0.15, 0.5, 0.88].map(q => redondo(cuantil(m, q)));
  // «como Andalucía» es una franja estrecha: como mucho ±10 % en una razón y ±3 puntos en un porcentaje
  if (razon) b = [Math.min(b[0], 10), Math.min(b[1], 40), Math.min(b[2], 75)];   // tampoco se puede bajar más del 100 %
  else if (medidaFrente(ent) === 'puntos') b[0] = Math.min(b[0], 3);
  b = [...new Set(b)].sort((x, y) => x - y);
  if (b.length < 3) {
    const t = razon ? 75 : redondo(cuantil(m, 0.95));
    b = razon ? [10, 25, 50] : [t / 4, t / 2, t].map(v => +v.toPrecision(3));
  }
  return [...b.slice().reverse().map(v => -v), ...b];
}
