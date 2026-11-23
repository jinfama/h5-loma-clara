// filtro.js — qué filas entran en el análisis. Módulo puro (sin DOM ni d3): lo prueban js/visor4/analisis/pruebas/.
// Dos cosas distintas, y las dos se cuentan a la vista:
//  · el FILTRO de quien mira (provincias, partido judicial, «solo estas»): las de fuera no forman parte del análisis;
//  · las cifras que no entran dentro del filtro: sin dato, estimadas / parciales / con reserva si se excluyen, cero o
//    negativo en una escala logarítmica, sin peso.

export const esEst = f => f === '1' || f === '4';

/** Predicado del filtro de unidades, o null si no filtra nada.
 *  provs: provincias que entran (vacío o null = todas); pj: id de partido judicial ('' = todos) y pjDe(id) → partido;
 *  solo: ids que entran (vacío o null = todas). */
export function predicadoFiltro({ provs = null, pj = '', pjDe = null, solo = null } = {}) {
  const P = provs && provs.length ? new Set(provs.map(String)) : null;
  const U = solo && solo.length ? new Set(solo.map(String)) : null;
  if (!P && !pj && !U) return null;
  return r => (!P || P.has(String(r.prov))) && (!pj || (!!pjDe && pjDe(r.id) === pj)) && (!U || U.has(String(r.id)));
}

/** Decide qué filas entran. opts: {unidad: predicado del filtro; est, par, res: excluir…; log: [bool por variable];
 *  pesos: Map|null}. Devuelve {dentro, cuenta}: cuenta.total = unidades dentro del filtro, cuenta.filtro = las de fuera,
 *  y por qué faltan las demás. */
export function filtrar(cr, opts = {}) {
  const nv = cr.filas[0] ? cr.filas[0].vals.length : 0;
  const cu = { total: 0, filtro: 0, estPor: new Array(nv).fill(0), sinDato: new Array(nv).fill(0), sinDatoAlguna: 0, est: 0, par: 0, res: 0, noPositivas: 0, sinPeso: 0, fueraEst: 0, fueraPar: 0, fueraRes: 0, n: 0 };
  const dentro = [];
  for (const r of cr.filas) {
    if (opts.unidad && !opts.unidad(r)) { cu.filtro++; continue; }
    cu.total++;
    let falta = false;
    r.vals.forEach((c, j) => { if (c.v == null || !isFinite(c.v)) { cu.sinDato[j]++; falta = true; } });
    if (falta) { cu.sinDatoAlguna++; continue; }
    const est = r.vals.some(c => esEst(c.f)), par = r.vals.some(c => c.f === '5' || !!c.parcial), res = r.vals.some(c => c.f === '2');
    if (est) cu.est++; if (par) cu.par++; if (res) cu.res++;
    r.vals.forEach((c, j) => { if (esEst(c.f)) cu.estPor[j]++; });
    if (est && opts.est) { cu.fueraEst++; continue; }
    if (par && opts.par) { cu.fueraPar++; continue; }
    if (res && opts.res) { cu.fueraRes++; continue; }
    if (opts.log && r.vals.some((c, j) => opts.log[j] && !(c.v > 0))) { cu.noPositivas++; continue; }
    if (opts.pesos) { const w = opts.pesos.get(r.id); if (!(w > 0)) { cu.sinPeso++; continue; } }
    dentro.push({ ...r, est, par, res, w: opts.pesos ? opts.pesos.get(r.id) : 1 });
  }
  cu.n = dentro.length;
  return { dentro, cuenta: cu };
}
