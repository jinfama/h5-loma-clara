/* global d3 */
// escala.js — una escala de color por indicador, la misma en todas las vistas (VISOR3_API.md §5, ctx.escala).
// Rampas perceptualmente regulares (interpoladas en Lab) de js/timelapses/escalas.js, una por tema.

import { RAMPAS, DIVERGENTES, escalaLog, escalaLineal, escalaDiv, fmt } from '../timelapses/escalas.js';
import { entero, decimal } from '../atlas2/fmt.js';

const RAMPA_TEMA = {
  poblacion: RAMPAS.poblacion, usos_suelo: RAMPAS.olivar, tierra: RAMPAS.olivar, agraria: RAMPAS.cereal, agraria_1752: RAMPAS.cereal,
  cosechas: RAMPAS.cereal, cosechas1752: RAMPAS.cereal, fronteras: RAMPAS.regadio, ganado: RAMPAS.ganado, empleo: RAMPAS.trabajo, trabajo: RAMPAS.trabajo, geografia: RAMPAS.monte,
  clima: DIVERGENTES.temperatura,
};

// el visor puede dar su propia rampa por indicador (js/visor4/paleta.js): fn(ent) -> interpolador o null
let rampaPropia = null;
export function usarRampaDe(fn) { rampaPropia = fn; }

const tipoPedido = (e, ent) => e.tipo || (typeof ent.escala === 'string' ? ent.escala : null);
function cuantil(a, q) { if (!a.length) return null; return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))]; }
function redondo(x, arriba) {
  if (!(x > 0)) return x;
  const k = Math.floor(Math.log10(x)), b = 10 ** k;
  const ms = [1, 2, 5, 10];
  return arriba ? ms.map(m => m * b).find(v => v >= x * 0.999) : [...ms].reverse().map(m => m * b).find(v => v <= x * 1.001);
}

// ---------- clases (ronda v15, Juan: «todas las leyendas, mejor no continuas sino por categorías»)
// Método (docs/v2/VISOR3_API.md §5 bis): cortes «bonitos» sacados de los cuantiles de TODOS los valores del indicador en
// ese nivel (todo el timelapse: las clases son las mismas en todos los años y los colores se comparan en el tiempo).
// · Secuencial: 6 clases; los 5 cortes son los sextiles, redondeados a 1 · 1,2 · 1,5 · 2 · 2,5 · 3 · 4 · 5 · 6 · 7,5 · 8 × 10^k
//   o a un paso redondo de la dispersión (un quinceavo del rango 2-98 %), el que quede más cerca de la cifra.
//   Si más de un sexto de las cifras está en el mínimo (muchos ceros), los sextiles salen de las demás. Si al redondear
//   quedan menos de 4 cortes distintos, cortes iguales y redondos (d3.ticks) entre el 2 % y el 98 % de las cifras.
// · Divergente (anomalías, SPI): clases simétricas alrededor de 0: cortes ±b1, ±b2, ±b3 con b los cuantiles 30, 65 y
//   92 % de |v|, redondeados igual. La clase del centro (de −b1 a b1) va en el color neutro.
const MANT = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
export function bonito(x) {
  if (!x || !isFinite(x)) return x;
  const sg = Math.sign(x), a = Math.abs(x), b = 10 ** Math.floor(Math.log10(a)), m = a / b;
  const best = MANT.reduce((p, q) => (Math.abs(q - m) < Math.abs(p - m) ? q : p), 1);
  return sg * +(best * b).toPrecision(6);
}
// paso «redondo» (1, 2, 2,5 o 5 × 10^k) más cercano a x
function pasoRedondo(x) {
  if (!(x > 0)) return 0;
  const b = 10 ** Math.floor(Math.log10(x)), m = x / b;
  return [1, 2, 2.5, 5, 10].reduce((p, q) => (Math.abs(q - m) < Math.abs(p - m) ? q : p), 1) * b;
}
// redondeo de un corte: el más fino de dos, por su tamaño (bonito) o por la dispersión de las cifras (un quinceavo del
// rango entre el 2 % y el 98 %, en paso redondo): así 14,3 °C queda en 14,5 y no en 15, y 37 hab/km² en 40 y no en 0
function redondeaCorte(x, paso) {
  const r1 = bonito(x), r2 = paso ? +(Math.round(x / paso) * paso).toPrecision(8) : r1;
  return Math.abs(r2 - x) < Math.abs(r1 - x) ? r2 : r1;
}
function cortesSecuenciales(a) {
  if (a.length < 2 || a[0] === a[a.length - 1]) return [];
  const lo = a[0], hi = a[a.length - 1];
  const resto = a.filter(v => v > lo);
  const base = resto.length < a.length * 5 / 6 && resto.length >= 2 ? resto : a;
  const paso = pasoRedondo((cuantil(base, 0.98) - cuantil(base, 0.02)) / 15);
  let c = [...new Set([1, 2, 3, 4, 5].map(i => redondeaCorte(cuantil(base, i / 6), paso)))].filter(v => v > lo && v < hi).sort((x, y) => x - y);
  if (c.length < 4) {
    c = d3.ticks(cuantil(a, 0.02), cuantil(a, 0.98), 6).filter(v => v > lo && v < hi);
    if (c.length > 6) c = c.filter((_, i) => i % 2 === 1);
  }
  return c;
}
function cortesDivergentes(a) {
  const m = a.map(Math.abs).sort((x, y) => x - y);
  if (!m.length || !(m[m.length - 1] > 0)) return [];
  const paso = pasoRedondo((cuantil(m, 0.98) || m[m.length - 1]) / 12);
  let b = [...new Set([0.3, 0.65, 0.92].map(q => redondeaCorte(cuantil(m, q), paso)).filter(v => v > 0))].sort((x, y) => x - y);
  if (b.length < 3) b = d3.ticks(0, cuantil(m, 0.95) || m[m.length - 1], 3).filter(v => v > 0).slice(0, 3);
  return [...b.slice().reverse().map(v => -v), ...b];
}
// las clases con su color (muestras de la rampa) y su rótulo («10–25», «menos de 10», «500 o más»)
function clasesDe(cortes, tipo, rampa, formato) {
  const n = cortes.length + 1, out = [];
  for (let i = 0; i < n; i++) {
    const t = tipo === 'divergente' ? 0.5 + (n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0) * 0.46 : (n > 1 ? 0.14 + 0.86 * i / (n - 1) : 0.6);
    const desde = i ? cortes[i - 1] : null, hasta = i < n - 1 ? cortes[i] : null;
    const f = v => formato(v).replace(/^-/, '−');
    const neg = tipo === 'divergente' || (desde != null && desde < 0) || (hasta != null && hasta < 0);   // «−0,7 a −0,3», «0,3 a 0,7»
    const et = desde == null && hasta == null ? 'todas' : desde == null ? `menos de ${f(hasta)}` : hasta == null ? `${f(desde)} o más` : neg ? `${f(desde)} a ${f(hasta)}` : `${f(desde)}–${f(hasta)}`;
    out.push({ desde, hasta, color: d3.color(rampa(t)).formatHex(), etiqueta: et });
  }
  return out;
}

// clases fijas por indicador (ronda v16, despoblación): cortes, rótulos y colores dados
const CLASES_FIJAS = {
  // % respecto a su máximo: 0 (hoy en su máximo) a −80; rojo cuanto más pierde, el 0 neutro
  poblacion_perdida_max: { cortes: [-50, -25, -10, -1e-9], etiquetas: ['−50 o menos', '−50 a −25', '−25 a −10', '−10 a 0', '0: hoy en su máximo'], colores: ['#99000d', '#e2402f', '#f5866a', '#fcc7b0', '#eeece6'] },
  // año del censo de su máximo, por periodos, de antiguo a reciente
  poblacion_anio_max: { cortes: [1900, 1930, 1950, 1970, 2000], etiquetas: ['antes de 1900', '1900-1929', '1930-1949', '1950-1969', '1970-1999', '2000 o después'], colores: ['#0b3d5c', '#1f6f8b', '#3f9aa6', '#7cc3b4', '#bfe3c6', '#f0f7d8'] },
};
function escalaFija(ent, F, formato) {
  const cl = F.etiquetas.map((et, i) => ({ desde: i ? F.cortes[i - 1] : null, hasta: i < F.cortes.length ? F.cortes[i] : null, color: F.colores[i], etiqueta: et }));
  const claseDe = v => d3.bisectRight(F.cortes, v);
  const titulo = `${ent.rotulo}${ent.unidad ? ' · ' + ent.unidad : ''}`;
  const s = d3.scaleThreshold(F.cortes, F.colores);
  return { tipo: 'fija', log: false, porClases: true, cortes: F.cortes, clases: cl, claseDe, dominio: [F.cortes[0], F.cortes[F.cortes.length - 1]], ticks: F.cortes, formato,
    color: v => cl[claseDe(v)].color, escala: s, leyenda: () => ({ tipo: 'clases', clases: cl, claseDe, titulo, formato }) };
}

// ent: entrada del catálogo (usa ent.escala: 'log' | 'lineal' | 'divergente' | {tipo, rampa, dominio, centro});
// vals: todos los valores del indicador en ese nivel (para fijar el dominio sin que un extremo lo aplaste)
export function escalaDe(ent, vals = []) {
  const e = typeof ent.escala === 'string' ? { tipo: ent.escala } : (ent.escala || {});
  const a = vals.filter(v => v != null && isFinite(v)).sort((x, y) => x - y);
  let tipo = e.tipo || (ent.tema === 'clima' || (a.length && a[0] < 0) ? 'divergente' : (a.length && a[a.length - 1] / Math.max(a[0], 1e-9) > 200 && a[0] > 0 ? 'log' : 'lineal'));
  const lluvia = /prec|lluvia/.test(ent.id || '');
  const rampa = (rampaPropia && rampaPropia(ent, tipo))
    || (e.rampa && (RAMPAS[e.rampa] || DIVERGENTES[e.rampa]))
    || (ent.tema === 'clima' ? (tipoPedido(e, ent) === 'divergente' ? (lluvia ? DIVERGENTES.lluvia : DIVERGENTES.temperatura) : (lluvia ? RAMPAS.regadio : RAMPAS.labor)) : null)
    || RAMPA_TEMA[ent.tema] || RAMPAS.trabajo;
  const esPct = /%/.test(ent.unidad || '') || e.pct;
  const fraccion = esPct && a.length > 0 && Math.max(Math.abs(a[0]), Math.abs(a[a.length - 1])) <= 1.0001;
  const formato = ent.formatoPropio || (v => v == null ? '—' : esPct ? (fraccion ? fmt.pct(v) : (Math.abs(v) >= 10 || Number.isInteger(v) ? entero(v) : decimal(v)) + ' %') : Math.abs(v) >= 100 || Number.isInteger(v) ? entero(v) : Math.abs(v) >= 10 ? decimal(v) : fmt.d2(v));
  if (CLASES_FIJAS[ent.id]) return escalaFija(ent, CLASES_FIJAS[ent.id], /anio/.test(ent.id) ? (v => (v == null ? '—' : String(Math.round(v)))) : formato);
  let s;
  if (e.dominio) {
    const [lo, hi] = e.dominio;
    s = tipo === 'log' ? escalaLog(lo, hi, rampa) : tipo === 'divergente' ? escalaDiv(Math.max(Math.abs(lo), Math.abs(hi)), DIVERGENTES[e.rampa] || rampa) : escalaLineal(lo, hi, rampa);
  } else if (tipo === 'log') {
    const pos = a.filter(v => v > 0);
    s = escalaLog(redondo(cuantil(pos, 0.02) || 1, false), redondo(cuantil(pos, 0.98) || 10, true), rampa);
    // en la leyenda, solo potencias de diez si los 1-2-5 no caben
    if (s.ticksRedondos.length > 5) { const p10 = s.ticksRedondos.filter(v => Math.abs(Math.log10(v) % 1) < 1e-9); if (p10.length >= 2) s.ticksRedondos = p10; }
  } else if (tipo === 'divergente') {
    const lim = redondo(Math.max(Math.abs(cuantil(a, 0.02) || 1), Math.abs(cuantil(a, 0.98) || 1)), true);
    s = escalaDiv(lim, rampa === RAMPAS.trabajo ? DIVERGENTES.temperatura : rampa);
  } else {
    const lo = Math.min(0, cuantil(a, 0) ?? 0), hi = redondo(cuantil(a, 0.98) || 1, true);
    s = escalaLineal(lo, hi, rampa);
  }
  // leyenda legible: como mucho cinco marcas (si no, una sí y otra no, más la última)
  if (s.ticksRedondos && s.ticksRedondos.length > 5 && tipo !== 'log') { const d0 = s.domain(); s.ticksRedondos = d3.ticks(d0[0], d0[d0.length - 1], 3); }
  const dom = s.domain();
  // por clases (ronda v15): las mismas en todo el timelapse; sin cifras aún, la rampa continua de reserva
  const cortes = ent.cortesFijos || (a.length ? (tipo === 'divergente' ? cortesDivergentes(a) : cortesSecuenciales(a)) : null);
  if (cortes) {
    const cl = clasesDe(cortes, tipo, typeof rampa === 'function' ? rampa : (t => s(dom[0] + t * (dom[dom.length - 1] - dom[0]))), formato);
    // un mínimo imposible de rebasar (cambio: −100 %): fuera la clase que queda por debajo
    while (ent.minimo != null && cortes.length > 1 && cortes[0] <= ent.minimo) { cortes.shift(); cl.shift(); cl[0].desde = null; cl[0].etiqueta = `menos de ${formato(cortes[0]).replace(/^-/, '−')}`; }
    const claseDe = v => d3.bisectRight(cortes, v);
    const titulo = `${ent.rotulo}${ent.unidad ? ' · ' + ent.unidad : ''}`;
    return {
      tipo, log: false, porClases: true, cortes, clases: cl, claseDe, dominio: [dom[0], dom[dom.length - 1]], ticks: cortes, formato,
      color: v => cl[claseDe(v)].color,
      escala: s,
      leyenda: () => ({ tipo: 'clases', clases: cl, claseDe, titulo, formato, divergente: tipo === 'divergente' }),
    };
  }
  return {
    tipo, log: tipo === 'log', dominio: [dom[0], dom[dom.length - 1]], ticks: s.ticksRedondos, formato,
    color: v => s(tipo === 'log' ? Math.max(v, 1e-9) : v),
    escala: s,
    leyenda: () => ({ tipo: 'continua', escala: s, log: tipo === 'log', titulo: `${ent.rotulo}${ent.unidad ? ' · ' + ent.unidad : ''}${tipo === 'log' ? ' · escala log.' : ''}`, formato, ticks: s.ticksRedondos }),
  };
}

// envuelve una escala d3 ya hecha (la de un tema de timelapses) con la forma de ctx.escala
export function envuelveEscala(s, ent) {
  const dom = s.domain();
  const log = typeof s.base === 'function';
  const pct = /%/.test(ent.unidad || '');
  const formato = v => v == null ? '—' : pct ? fmt.pct(v) : Math.abs(v) >= 100 ? entero(v) : Math.abs(v) >= 10 ? decimal(v) : fmt.d2(v);
  return { tipo: log ? 'log' : dom.length === 3 ? 'divergente' : 'lineal', log, dominio: [dom[0], dom[dom.length - 1]], ticks: s.ticksRedondos, formato,
    color: v => s(log ? Math.max(v, 1e-9) : v), escala: s,
    leyenda: () => ({ tipo: 'continua', escala: s, log, titulo: `${ent.rotulo}${ent.unidad ? ' · ' + ent.unidad : ''}`, formato, ticks: s.ticksRedondos }) };
}

const cache = new Map();
// para ctx.escala(ind): la escala que está usando el mapa para ese indicador (o una por defecto si aún no hay datos)
export function registrarEscala(ind, esc) { cache.set(ind, esc); }
// siempre devuelve una escala (si el indicador aún no la registró, una por defecto de su tema)
export function escalaDeInd(ind, ent) { return cache.get(ind) || escalaDe(ent || { id: ind, rotulo: ind, tema: '' }, []); }

// ---------- indicadores categóricos (ronda v11: el ganador de cada elección)
// El catálogo trae `categorias`: lista [{id|codigo|valor|clave, rotulo|nombre|etiqueta, color}] o un objeto
// {codigo: {rotulo, color}} o {codigo: 'rótulo'}. Sin color, uno de una paleta sobria y distinguible (Okabe-Ito).
const CAT_RESERVA = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9', '#6b6b6b', '#8c6d31', '#5e3c99'];
export function esCategorico(ent) {
  if (!ent) return false;
  const e = typeof ent.escala === 'string' ? ent.escala : (ent.escala && ent.escala.tipo) || '';
  return ent.tipo === 'categorico' || ent.tipo === 'categorica' || e === 'categorica' || e === 'categorico' || ent.medida === 'categoria' || !!(ent.categorias && (Array.isArray(ent.categorias) ? ent.categorias.length : Object.keys(ent.categorias).length));
}
export function categoriasDe(ent) {
  const c = ent && ent.categorias;
  const lista = !c ? [] : Array.isArray(c) ? c : Object.entries(c).map(([k, v]) => (typeof v === 'object' && v ? { id: k, ...v } : { id: k, rotulo: String(v) }));
  const m = new Map();
  lista.forEach((x, i) => {
    const k = String(x.id ?? x.codigo ?? x.valor ?? x.clave ?? i);
    m.set(k, { k, rot: String(x.rotulo ?? x.nombre ?? x.etiqueta ?? k), color: x.color || CAT_RESERVA[i % CAT_RESERVA.length], nota: x.nota || '' });
  });
  return m;
}
// «escala» de un categórico: color y nombre de cada categoría; leyenda de categorías (sin dato va aparte)
export function escalaCategorica(ent) {
  const m = categoriasDe(ent), lista = [...m.values()];
  // la base da el índice de la categoría (0, 1…); si llega el id, también vale
  const de = v => (v == null ? null : (typeof v === 'number' && Number.isInteger(v) ? lista[v] : null) || m.get(String(v)) || null);
  return {
    tipo: 'categorica', categorica: true, log: false, dominio: null, ticks: [],
    color: v => { const c = de(v); return c ? c.color : '#bdbab3'; },
    formato: v => { if (v == null) return '—'; const c = de(v); return c ? c.rot : String(v); },
    categorias: m,
    leyenda: () => ({ tipo: 'categorias', titulo: ent.rotulo || '', items: [...m.values()].map(c => ({ color: c.color, etiqueta: c.rot })), nota: ent.nota_categorias || '' }),
  };
}
