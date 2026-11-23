// anios.js — el año (o el periodo) de cada variable del análisis. Puro: sin DOM ni datos, para poder probarlo.
// Encargo de Juan (21-nov-2026): «Si quiero comparar rendimiento de trigo en 1752 con precipitación y no hay dato de
// ese año, o con tamaño de explotación de otro año, que lo permita, ¿no?».
//
// Cada variable lleva una regla (clave `aanos` de la URL: «id:a1752,id2:m1961-1990»):
//   sin regla  → sigue al año del análisis: si las variables sin regla tienen años en común, el común (como siempre,
//                con la ventana); si no, la de referencia (Y) marca el año y las demás van a su año más cercano;
//   a<año>     → año fijo (candado);
//   m<d>-<h>   → media de un periodo: por unidad, la media de los años con cifra, solo si tiene al menos el 80 % de
//                los años del periodo.
// Las cifras «de hoy» (geografía) valen para cualquier año, como siempre.

/** El año de la lista más cercano a t dentro de la ventana (el mismo si está; a igual distancia, el anterior). */
export function masCercano(lista, t, ventana) {
  let mejor = null, d0 = Infinity;
  for (const a of lista) { const d = Math.abs(a - t); if (d < d0 || (d === d0 && a < mejor)) { d0 = d; mejor = a; } }
  return mejor != null && d0 <= ventana ? mejor : null;
}

/** Años en que todas las variables tienen cifra (en ese año o, con ventana, a esa distancia como mucho); si dos años dan
 *  la misma combinación de años usados, queda el primero. Las variables fijas («de hoy») no cuentan. */
export function aniosComunes(vars, ventana) {
  const mov = vars.filter(v => !v.fijo);
  if (!mov.length) return vars.length ? [vars[0].usables[vars[0].usables.length - 1]] : [];
  const cand = [...new Set(mov.flatMap(v => v.usables))].sort((a, b) => a - b);
  const vistos = new Set(), out = [];
  for (const t of cand) {
    const us = mov.map(v => masCercano(v.usables, t, ventana));
    if (us.some(u => u == null)) continue;
    const k = us.join(',');
    if (vistos.has(k)) continue;
    vistos.add(k); out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------- reglas (URL)
/** «id:a1752,id2:m1961-1990» → Map id → {tipo:'a', anio} | {tipo:'m', d, h}. Lo que no se entiende, fuera. */
export function leerReglas(txt) {
  const m = new Map();
  for (const par of String(txt || '').split(',')) {
    const i = par.lastIndexOf(':');
    if (i < 1) continue;
    const id = par.slice(0, i), r = par.slice(i + 1);
    let q;
    if ((q = /^a(\d{4})$/.exec(r))) m.set(id, { tipo: 'a', anio: +q[1] });
    else if ((q = /^m(\d{4})-(\d{4})$/.exec(r))) { const d = Math.min(+q[1], +q[2]), h = Math.max(+q[1], +q[2]); m.set(id, { tipo: 'm', d, h }); }
  }
  return m;
}
export function textoReglas(m) {
  return [...m].map(([id, r]) => `${id}:${r.tipo === 'a' ? 'a' + r.anio : `m${r.d}-${r.h}`}`).join(',');
}
/** Años de la variable dentro del periodo. */
export const aniosDelPeriodo = (v, r) => v.usables.filter(a => a >= r.d && a <= r.h);

// ---------------------------------------------------------------- plan de años
/**
 * vars: [{id, usables (ordenados), fijo, regla}] (regla null = sigue al año). ancla: id de la variable de referencia (Y).
 * Devuelve {modo, anios, ancla, ventanaDe}: modo «comun» (años comunes de las que siguen, con la ventana), «cerca» (sin
 * años comunes: los de la ancla, y las demás a su año más cercano, sin límite) o «fijo» (ninguna sigue al año: un solo
 * año de referencia). ventanaDe: id → ventana que usa cada variable que sigue.
 */
export function planAnios(vars, { ventana = 0, ancla = null } = {}) {
  const siguen = vars.filter(v => !v.fijo && !v.regla);
  if (!siguen.length) {
    const ref = vars.find(v => v.id === ancla && v.regla) || vars.find(v => v.regla && v.regla.tipo === 'a') || vars.find(v => v.regla) || vars[0];
    const t = !ref ? null : ref.regla ? (ref.regla.tipo === 'a' ? ref.regla.anio : ref.regla.h) : ref.usables[ref.usables.length - 1];
    return { modo: 'fijo', anios: t == null ? [] : [t], ancla: null, ventanaDe: new Map() };
  }
  const com = aniosComunes(siguen, ventana);
  const a = siguen.find(v => v.id === ancla) || siguen[0];
  if (com.length) return { modo: 'comun', anios: com, ancla: a.id, ventanaDe: new Map(siguen.map(v => [v.id, ventana])) };
  return { modo: 'cerca', anios: a.usables.slice(), ancla: a.id, ventanaDe: new Map(siguen.map(v => [v.id, v.id === a.id ? 0 : Infinity])) };
}

/** Lo que usa la variable en el año t: un año (número) o un periodo ({tipo:'m', d, h}); null si no hay. */
export function anioUsado(v, t, ventana) {
  if (v.fijo) return v.usables[v.usables.length - 1];
  const r = v.regla;
  if (r && r.tipo === 'a') return masCercano(v.usables, r.anio, Infinity);
  if (r && r.tipo === 'm') return aniosDelPeriodo(v, r).length ? r : null;
  return t == null ? null : masCercano(v.usables, t, ventana);
}
export const etiquetaAnio = u => (u == null ? '—' : typeof u === 'object' ? `media ${u.d}-${u.h}` : String(u));

/** «Comparas cifras de años distintos (…): …» si las variables que cambian con el tiempo no usan todas lo mismo. */
export function avisoAnios(vars, usados, nombre = v => v.id) {
  const mov = vars.map((v, j) => [v, usados[j]]).filter(([v]) => !v.fijo);
  const etq = [...new Set(mov.map(([, u]) => etiquetaAnio(u)))];
  if (etq.length < 2) return '';
  return `Comparas cifras de años distintos (${mov.map(([v, u]) => `${nombre(v)}: ${etiquetaAnio(u)}`).join('; ')}): la relación es entre territorios, no en el tiempo.`;
}

// ---------------------------------------------------------------- media de un periodo
/** Marca de la media según las de sus años: con reserva si alguna la tiene; suma parcial si alguna lo es; estimada si
 *  todas lo son; parcialmente estimada si alguna; si no, «calculada de originales» (3). */
export function marcaMedia(fs) {
  if (fs.includes('2')) return '2';
  if (fs.includes('5')) return '5';
  const est = fs.filter(f => f === '1' || f === '4').length;
  if (est && est === fs.length && fs.every(f => f === '1')) return '1';
  if (est) return '4';
  return '3';
}
/**
 * porAnio: [{anio, celdas: Map id → {v, f}}], uno por año del periodo con cifras de la variable (m = su número).
 * Devuelve Map id → {v (media o null), f, n (años con cifra), m, anios}: solo hay media si n ≥ minimo · m.
 */
export function mediaPeriodo(porAnio, { minimo = 0.8 } = {}) {
  const m = porAnio.length, acc = new Map();
  for (const { anio, celdas } of porAnio) {
    for (const [id, c] of celdas) {
      if (c == null || c.v == null || !isFinite(c.v)) continue;
      if (!acc.has(id)) acc.set(id, { s: 0, n: 0, fs: [], anios: [] });
      const q = acc.get(id); q.s += +c.v; q.n++; q.fs.push(String(c.f ?? '0')); q.anios.push(anio);
    }
  }
  const out = new Map();
  for (const [id, q] of acc) {
    const ok = m > 0 && q.n >= minimo * m - 1e-9;
    out.set(id, { v: ok ? q.s / q.n : null, f: ok ? marcaMedia(q.fs) : '.', n: q.n, m, anios: q.anios });
  }
  return out;
}

// ---------------------------------------------------------------- cortes de una serie
// `anios_sin_unir`: entre esos dos años la línea no se une, pero los dos años valen.
// `sin_interpolar_tramos`: además cambia la fuente, y ningún cambio, diferencia, efecto fijo ni desfase puede cruzarlo.
/** Pares [desde, hasta] válidos de un campo del catálogo (si falta o viene mal, ninguno). */
export function paresAnios(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter(q => Array.isArray(q) && q.length === 2 && q.every(a => a !== null && a !== '' && isFinite(a))).map(([a, b]) => [Math.min(+a, +b), Math.max(+a, +b)]);
}
/** Los dos campos de un indicador: donde su línea no debe unirse. */
export const cortesDe = ent => [...paresAnios(ent && ent.anios_sin_unir), ...paresAnios(ent && ent.sin_interpolar_tramos)];
/** Los tramos que ningún cambio puede cruzar, de todos los indicadores. */
export function tramosDe(ents) {
  const vistos = new Map();
  for (const e of ents) for (const q of paresAnios(e && e.sin_interpolar_tramos)) vistos.set(q.join('-'), q);
  return [...vistos.values()].sort((a, b) => a[0] - b[0]);
}
/** ¿El paso de p a q (años) pasa por dentro del tramo [c, d]? */
const cruza = (p, q, [c, d]) => Math.min(p, q) < d && Math.max(p, q) > c;
/** Parte una serie ordenada en trozos reales: por cada corte y por cada salto mayor que `salto`. No pierde ningún punto. */
export function trozos(pts, cortes = [], { salto = Infinity, anio = p => p.a, corta = null } = {}) {
  const out = [];
  let t = [];
  pts.forEach((p, i) => {
    if (i && (anio(p) - anio(pts[i - 1]) > salto || cortes.some(c => cruza(anio(pts[i - 1]), anio(p), c)) || (corta && corta(pts[i - 1], p)))) { out.push(t); t = []; }
    t.push(p);
  });
  if (t.length) out.push(t);
  return out;
}
/** Entre dos fotogramas, ¿alguna variable pasa por un corte suyo? usosA/usosB: el año que usa cada una (lo que cuenta es
 *  ese, no el del análisis: con «el más cercano» puede saltar de 2007 a 2020); un año fijo o una media no se mueven. */
export function cruzaCorte(usosA, usosB, cortesPorVar) {
  return cortesPorVar.some((cs, j) => typeof usosA[j] === 'number' && typeof usosB[j] === 'number' && usosA[j] !== usosB[j] && cs.some(c => cruza(usosA[j], usosB[j], c)));
}
/**
 * De los años, los que se pueden comparar entre sí sin cruzar ningún tramo: el trozo más largo de los anteriores al último
 * corte (para usos del suelo, hasta 2007) o, si ahí no hay dos años, el más largo que haya.
 * Devuelve {anios, fuera (los que se quedan sin comparar), limites [lo, hi]: hasta dónde puede llegar cada serie}.
 */
export function aniosSinCruzar(anios, tramos = []) {
  const lista = [...new Set(anios.map(Number))].sort((a, b) => a - b);
  const pares = paresAnios(tramos);
  if (!pares.length) return { anios: lista, fuera: [], limites: [-Infinity, Infinity] };
  const partes = trozos(lista, pares, { anio: a => a });
  const ultimo = Math.max(...pares.map(q => q[0]));
  const conDos = partes.filter(t => t.length >= 2), antes = conDos.filter(t => t[t.length - 1] <= ultimo);
  const grupo = antes.length ? antes : conDos.length ? conDos : partes;
  const elegida = grupo.reduce((m, t) => (t.length > m.length ? t : m), grupo[0] || []);
  if (!elegida.length) return { anios: [], fuera: [], limites: [-Infinity, Infinity] };
  const a0 = elegida[0], a1 = elegida[elegida.length - 1];
  const lo = Math.max(-Infinity, ...pares.filter(q => q[1] <= a0).map(q => q[1])), hi = Math.min(Infinity, ...pares.filter(q => q[0] >= a1).map(q => q[0]));
  const dentro = new Set(elegida);
  return { anios: elegida, fuera: lista.filter(a => !dentro.has(a)), limites: [lo, hi] };
}
/** «2020 no entra: ahí cambia la fuente y el cambio no mediría uso del suelo.» o ''. */
export function avisoCorte(fuera, ents) {
  if (!fuera.length) return '';
  const afectados = ents.filter(e => paresAnios(e && e.sin_interpolar_tramos).length);
  const que = afectados.length && afectados.every(e => /^usos_/.test(e.id)) ? 'uso del suelo' : 'lo mismo';
  const quien = fuera.length <= 3 ? fuera.join(', ') : `${fuera[0]}-${fuera[fuera.length - 1]}`;
  return `${quien} no ${fuera.length === 1 ? 'entra' : 'entran'}: ahí cambia la fuente y el cambio no mediría ${que}.`;
}
