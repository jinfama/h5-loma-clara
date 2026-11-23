// ganado.js — tema «Ganado»: Censo Ganadero de 1752 (por municipio y sumado por partido judicial de 1888)
// frente al Avance de la riqueza pecuaria de 1891 (por partido judicial de 1888).
// Datos: data/v2/series/ganado.json; partidos: data/v2/geo/partidos/1888.topo.json (pz = municipios de hoy).

import { RAMPAS, escalaLog, fmt } from '../escalas.js';
import { estadoPorReady, AVISO } from './base.js';
import { entero } from '../../atlas2/fmt.js';

const ESPECIES = {
  ovino: { etiqueta: 'Ovejas', c1752: ['ovino'], c1890: ['ovino:estante', 'ovino:sin_distinguir', 'ovino:trashumante'], dom: [1, 200] },
  caprino: { etiqueta: 'Cabras', c1752: ['caprino'], c1890: ['caprino'], dom: [1, 100] },
  porcino: { etiqueta: 'Cerdos', c1752: ['porcino'], c1890: ['porcino'], dom: [0.5, 50] },
  bovino: { etiqueta: 'Vacas y bueyes', c1752: ['bovino'], c1890: ['bovino'], dom: [0.2, 50] },
  caballerias: { etiqueta: 'Caballerías', c1752: ['caballar', 'mular', 'asnal'], c1890: ['caballar', 'mular', 'asnal'], dom: [0.2, 50] },
};

const T = {
  id: 'ganado',
  kicker: 'Timelapse 04 · Ganado',
  titulo: 'Ganado',
  subtitulo: 'Cabezas de ganado por municipio en 1752 frente a los partidos judiciales de 1891.',
  entradilla: 'Cabezas por km². El Censo Ganadero de 1752 se cuenta por municipio y también sumado por partido judicial, para compararlo con el Avance de 1891, que solo da partidos.',
  periodo: '1752 · 1891',
  acento: '#9a6334',
  rampa: RAMPAS.ganado,
  estado: estadoPorReady(['ganado'], 'data/v2/series/ganado.json', '1752 en revisión'),
  vistas: Object.entries(ESPECIES).map(([id, e]) => ({ id, etiqueta: e.etiqueta })),
  temporal: false,
  textoEstimado: 'estimado (repartido, imputado o derivado)',
};

let D, HA, NOMBRE, PJ, PJ_DE, IDX = {}, ESC = {};

T.cargar = async ({ cargar, geo }) => {
  const [d, pj] = await Promise.all([cargar('series/ganado.json'), cargar('geo/partidos/1888.topo.json')]);
  D = d;
  HA = new Map(); NOMBRE = new Map();
  for (const g of geo.objects.municipios.geometries) { HA.set(g.properties.c, g.properties.ha); NOMBRE.set(g.properties.c, g.properties.n); }
  PJ = new Map(); PJ_DE = new Map();
  for (const g of pj.objects.partidos.geometries) {
    const p = g.properties;
    PJ.set(p.id, { id: p.id, n: p.n, ha: p.ha, pz: p.pz });
    for (const c of p.pz || []) PJ_DE.set(c, p.id);
  }
  const N = D.g1752.niveles;
  IDX.mun = new Map(N.municipio.ids.map((c, j) => [c, j]));
  IDX.pj52 = new Map(N.partido_judicial_1888.ids.map((c, j) => [c, j]));
  IDX.pj90 = new Map(D.g1890.ids.map((c, j) => [c, j]));
  for (const [k, e] of Object.entries(ESPECIES)) {
    const s = escalaLog(e.dom[0], e.dom[1], RAMPAS.ganado);
    s.ticksRedondos = s.ticksRedondos.filter(v => [1, 10, 100].some(m => v === m) || v === e.dom[0] || v === e.dom[1]);
    ESC[k] = s;
  }
};

// valor 1752 (nivel municipio o partido): total con estimación si existe (Jaén), si no total
function v1752(nivel, j, esp) {
  const d = D.g1752.niveles[nivel].d;
  let s = null, est = false, inc = false, estados = [];
  for (const k of ESPECIES[esp].c1752) {
    const te = d.total_con_estimacion[k], t = d.total[k];
    let src = te && te.v[j] != null ? te : t;
    const v = src.v[j];
    if (v == null) continue;
    s = (s || 0) + v;
    if (src.e[j] === '1' || src.s[j] === 'c' || src.s[j] === 'd' || src.s[j] === 'g') est = true;
    if (src.f && src.f[j] && src.f[j] !== '0') inc = true;
    estados.push(src.s[j]);
  }
  return { v: s, est, inc, estados };
}

function v1890(j, esp) {
  let s = null, falta = false, nocuadra = false;
  for (const k of ESPECIES[esp].c1890) {
    const c = D.g1890.d[k]; if (!c) continue;
    const v = c.v[j];
    if (v == null) { if (c.s[j] === 'f' || c.s[j] === 'u') falta = true; continue; }
    s = (s || 0) + v;
    if (c.b && c.b[j] === '1') nocuadra = true;
  }
  return { v: s, est: false, falta, nocuadra };
}

T.preparar = (esp) => {
  T.fotogramas = [
    { clave: '1752-municipios', etiqueta: '1752', corto: '1752 municipios', nivel: 'mun', revision: true,
      avisos: [AVISO.revision, AVISO.accent('Por municipio de hoy')], fuentes: ['CENSO-GANADERO-1752'],
      nota: `${D.g1752.rotulo}. ${D.g1752.nota_estados}. Localizador: ${D.fuente_1752}.` },
    { clave: '1752-partidos', etiqueta: '1752', corto: '1752 partidos', nivel: 'pj52', revision: true,
      avisos: [AVISO.revision, AVISO.accent('Sumado por partido judicial de 1888')], fuentes: ['CENSO-GANADERO-1752'],
      nota: 'Las mismas cifras de 1752, sumadas por los partidos judiciales de 1888 para poder compararlas con 1891.' },
    { clave: '1891', etiqueta: '1891', corto: '1891 partidos', nivel: 'pj90',
      avisos: [AVISO.accent('Partidos de 1888: pertenencia en revisión')], fuentes: ['JCA-GANADERIA-1891'],
      nota: D.g1890.rotulo + (esp === 'ovino' ? '. El ovino suma estante, trashumante y sin distinguir donde la fuente los da.' : '') },
  ];
  T.frases = frases(esp);
};

function valorPara(f, c, esp) {
  if (f.nivel === 'mun') {
    const j = IDX.mun.get(c); if (j == null) return null;
    const r = v1752('municipio', j, esp);
    return r.v == null ? null : { ...r, dens: HA.get(c) ? r.v / (HA.get(c) / 100) : null, unidad: NOMBRE.get(c) };
  }
  const pid = PJ_DE.get(c); if (!pid) return null;
  const p = PJ.get(pid);
  const r = f.nivel === 'pj52' ? (IDX.pj52.has(pid) ? v1752('partido_judicial_1888', IDX.pj52.get(pid), esp) : { v: null })
    : (IDX.pj90.has(pid) ? v1890(IDX.pj90.get(pid), esp) : { v: null });
  return r.v == null ? null : { ...r, dens: p.ha ? r.v / (p.ha / 100) : null, unidad: `Partido de ${p.n}`, pid };
}

T.relleno = (i, esp) => {
  const f = T.fotogramas[i];
  // en los partidos, el valor se calcula una vez por partido
  const cache = new Map();
  return (c) => {
    const key = f.nivel === 'mun' ? c : PJ_DE.get(c);
    if (!cache.has(key)) cache.set(key, valorPara(f, c, esp));
    const r = cache.get(key);
    if (!r || r.dens == null) return { nd: true };
    return { color: ESC[esp](Math.max(r.dens, 1e-3)), est: r.est };
  };
};

T.grupos = (i) => {
  const f = T.fotogramas[i];
  return f && f.nivel !== 'mun' ? { clave: 'pj1888', fn: c => PJ_DE.get(c) || c } : null;
};

function total(f, esp) {
  let s = 0, n = 0, m = 0;
  if (f.nivel === 'mun') {
    m = D.g1752.niveles.municipio.ids.length;
    for (let j = 0; j < m; j++) { const r = v1752('municipio', j, esp); if (r.v != null) { s += r.v; n++; } }
  } else if (f.nivel === 'pj52') {
    m = D.g1752.niveles.partido_judicial_1888.ids.length;
    for (let j = 0; j < m; j++) { const r = v1752('partido_judicial_1888', j, esp); if (r.v != null) { s += r.v; n++; } }
  } else {
    m = D.g1890.ids.length;
    for (let j = 0; j < m; j++) { const r = v1890(j, esp); if (r.v != null) { s += r.v; n++; } }
  }
  return { s, n, m };
}

T.cifra = (i, esp) => {
  const f = T.fotogramas[i], t = total(f, esp), g = fmt.grande(t.s);
  const uds = f.nivel === 'mun' ? 'municipios' : 'partidos';
  return { valor: g.v, unidad: (g.u ? g.u + ' de ' : '') + 'cabezas', etiqueta: `${ESPECIES[esp].etiqueta.toLowerCase()} en ${entero(t.n)} ${uds} con dato (de ${entero(t.m)})` };
};

T.serie = () => null;
T.valor = (i, c, esp) => {
  const f = T.fotogramas[i];
  if (f.nivel !== 'mun') return null;
  const r = valorPara(f, c, esp || T._esp);
  return r && r.dens != null ? { v: r.dens, est: r.est } : null;
};
T.unidadDe = () => 'cabezas por km²';
T.escalaDe = (esp) => ESC[esp] || null;

T.leyenda = (i, esp) => ({
  tipo: 'continua', escala: ESC[esp], log: true, titulo: `${ESPECIES[esp].etiqueta} por km² · escala log.`,
  formato: v => v < 1 ? fmt.d1(v) : entero(v),
  nota: T.fotogramas[i].nivel === 'mun' ? null : 'Cada partido pinta todos sus municipios de hoy con la densidad del conjunto.',
});

T.detalle = (i, c, d) => {
  const f = T.fotogramas[i];
  const r = valorPara(f, c, T._esp || 'ovino');
  const nombre = NOMBRE.get(c) || d.n;
  if (!r) return { titulo: nombre, sub: f.corto, nd: true };
  const l = [`${entero(r.v)} cabezas`];
  if (r.inc) l.push('Cifra incompleta (falta el eclesiástico o parte de la fuente)');
  if (r.falta) l.push('La fuente no da una de las columnas sumadas: total incompleto');
  if (r.nocuadra) l.push('La fila impresa no cuadra con su total impreso (se publica lo impreso)');
  if (r.estados) { const tx = [...new Set(r.estados)].map(s => D.estados_celda[s]).filter(Boolean); if (r.est && tx.length) l.push(tx.join('; ')); }
  return { titulo: f.nivel === 'mun' ? nombre : r.unidad, sub: f.nivel === 'mun' ? f.corto : `${f.corto} · incluye ${nombre}`, valor: `${fmt.d1(r.dens)} por km²`, est: r.est, lineas: l };
};

const prep = T.preparar;
T.preparar = (esp) => { T._esp = esp; prep(esp); };

T.ritmo = () => 3400;
T.visor = (i, esp) => `visor.html#cat=agraria&ind=gan_${esp === 'caballerias' ? 'caballar' : esp}&view=map`;

function frases(esp) {
  const out = [];
  const et = ESPECIES[esp].etiqueta.toLowerCase();
  const tm = total(T.fotogramas[0], esp);
  out.push({ i: 0, texto: `1752: el Censo Ganadero da ${et} en ${entero(tm.n)} de los ${entero(tm.m)} municipios de hoy.` });
  // comparación justa: solo partidos con dato en los dos años
  let a = 0, b = 0, n = 0;
  for (const [pid, j52] of IDX.pj52) {
    const j90 = IDX.pj90.get(pid); if (j90 == null) continue;
    const r1 = v1752('partido_judicial_1888', j52, esp), r2 = v1890(j90, esp);
    if (r1.v == null || r2.v == null) continue;
    a += r1.v; b += r2.v; n++;
  }
  out.push({ i: 1, texto: `Sumado por partidos: ${fmt.grande(a).v} ${fmt.grande(a).u} cabezas en los ${entero(n)} partidos que tienen cifra en 1752 y en 1891.` });
  if (a) {
    const r = b / a;
    const txt = r >= 1.05 ? `hay ${fmt.d1(r)} veces las ${et} de 1752` : r <= 0.95 ? `hay un ${fmt.pct(1 - r)} menos de ${et} que en 1752` : `hay casi las mismas ${et} que en 1752`;
    out.push({ i: 2, texto: `1891: en esos mismos ${entero(n)} partidos ${txt}.` });
  }
  out.forEach((x, k) => { x.hasta = x.i; });
  return out;
}

export default T;
