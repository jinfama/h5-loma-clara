// panel.js — modelos de datos de panel (unidad × año). Módulo puro: sin DOM ni d3, para probarlo en Node contra
// linearmodels (js/visor4/analisis/pruebas/). Sigue las definiciones de linearmodels 7.1 (PanelOLS, PooledOLS,
// FirstDifferenceOLS, RandomEffects) con `debiased=True` y, en los errores agrupados, `group_debias=True`:
//   · MCO agrupado: Y = a + X·b.
//   · Efectos fijos de unidad (within): se resta a cada variable la media de su unidad y se suma la media general
//     (la constante es la media general); se absorben N − 1 efectos.
//   · Efectos fijos de año: lo mismo con la media de cada año (T − 1 efectos).
//   · Doble efecto fijo: proyecciones alternas (unidad, año) hasta que no cambian; (N − 1) + (T − 1) efectos.
//   · Primeras diferencias: cambio entre dos años seguidos del panel en la misma unidad, sin constante.
//   · Efectos aleatorios (Swamy-Arora, como linearmodels): σ²e del within, σ²u del between con la T armónica,
//     θi = 1 − √(σ²e / (Ti·σ²u + σ²e)), y MCO sobre y − θi·ȳi.
// Errores típicos: clásicos (s² con los grados de libertad que se llevan los efectos), robustos HC1 y agrupados por
// unidad: (X'X)⁻¹ Σg (Xg'eg)(Xg'eg)' (X'X)⁻¹ · G/(G−1) · (n−1)/(n−p−e), con e = los efectos absorbidos salvo que estén
// anidados en las unidades (efectos de unidad), como hace linearmodels.

import { invierte, pT, tCritico, pChi2 } from './estadistica.js';

export const MODELOS = [
  { id: 'mco', rotulo: 'MCO agrupado', corto: 'MCO' },
  { id: 'feu', rotulo: 'Efectos fijos de unidad', corto: 'EF unidad' },
  { id: 'fea', rotulo: 'Efectos fijos de año', corto: 'EF año' },
  { id: 'fe2', rotulo: 'Doble efecto fijo', corto: 'EF doble' },
  { id: 'pd', rotulo: 'Primeras diferencias', corto: 'Prim. dif.' },
  { id: 're', rotulo: 'Efectos aleatorios', corto: 'EA' },
];

// ---------------------------------------------------------------- panel: unidades, años y equilibrio
/** obs: [{u, t, y, x: [k]}]. equilibrado: deja solo las unidades con todos los años. */
export function armarPanel(obs, { equilibrado = false } = {}) {
  const anios = [...new Set(obs.map(o => o.t))].sort((a, b) => a - b);
  const porU = new Map();
  for (const o of obs) { if (!porU.has(o.u)) porU.set(o.u, []); porU.get(o.u).push(o); }
  let unidades = [...porU.keys()];
  if (equilibrado) unidades = unidades.filter(u => porU.get(u).length === anios.length);
  const dentro = new Set(unidades);
  const o2 = obs.filter(o => dentro.has(o.u)).sort((a, b) => (a.u < b.u ? -1 : a.u > b.u ? 1 : a.t - b.t));
  const anios2 = [...new Set(o2.map(o => o.t))].sort((a, b) => a - b);
  const Ti = unidades.map(u => o2.filter(o => o.u === u).length);
  const minT = Ti.length ? Math.min(...Ti) : 0, maxT = Ti.length ? Math.max(...Ti) : 0;
  return { obs: o2, unidades: unidades.sort(), anios: anios2, N: unidades.length, T: anios2.length, n: o2.length, equilibrado: minT === maxT && maxT === anios2.length, minT, maxT };
}

// ---------------------------------------------------------------- álgebra
const mediasPor = (v, g) => { const s = new Map(), c = new Map(); g.forEach((k, i) => { s.set(k, (s.get(k) || 0) + v[i]); c.set(k, (c.get(k) || 0) + 1); }); const m = new Map(); for (const [k, x] of s) m.set(k, x / c.get(k)); return m; };
const media = v => v.reduce((a, b) => a + b, 0) / v.length;
const demean = (v, g) => { const m = mediasPor(v, g); return v.map((x, i) => x - m.get(g[i])); };
/** Quita a la vez los efectos de unidad y de año (proyecciones alternas hasta que el cambio es despreciable). */
function demean2(v, gu, gt) {
  let r = v.slice();
  const escala = Math.max(1e-300, Math.sqrt(v.reduce((s, x) => s + x * x, 0)));
  for (let it = 0; it < 5000; it++) {
    const a = demean(r, gu), b = demean(a, gt);
    let d = 0; for (let i = 0; i < b.length; i++) d = Math.max(d, Math.abs(b[i] - r[i]));
    r = b;
    if (d <= 1e-14 * escala) break;
  }
  return r;
}
function mco(y, X) {
  const n = y.length, p = X[0] ? X[0].length : 0;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0)), Xty = new Array(p).fill(0);
  for (let i = 0; i < n; i++) { const f = X[i]; for (let a = 0; a < p; a++) { Xty[a] += f[a] * y[i]; for (let b = a; b < p; b++) XtX[a][b] += f[a] * f[b]; } }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  const inv = invierte(XtX);
  if (!inv) return null;
  const b = inv.map(f => f.reduce((s, v, j) => s + v * Xty[j], 0));
  const e = y.map((yi, i) => yi - X[i].reduce((s, v, j) => s + v * b[j], 0));
  return { b, e, inv, ssr: e.reduce((s, v) => s + v * v, 0) };
}
function covarianza(X, e, inv, { tipo, extra, extraCl, grupos }) {
  const n = X.length, p = inv.length;
  const sand = M => { const A = inv.map(f => M.map((_, j) => f.reduce((s, v, k) => s + v * M[k][j], 0))); return A.map(f => inv.map((_, j) => f.reduce((s, v, k) => s + v * inv[k][j], 0))); };
  if (tipo === 'cls') { const s2 = e.reduce((s, v) => s + v * v, 0) / (n - p - extra); return inv.map(f => f.map(v => v * s2)); }
  const M = Array.from({ length: p }, () => new Array(p).fill(0));
  if (tipo === 'hc1') {
    for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) M[a][b] += e[i] * e[i] * X[i][a] * X[i][b];
    return sand(M).map(f => f.map(v => v * n / (n - p - extra)));
  }
  // agrupados por unidad
  const S = new Map();
  for (let i = 0; i < n; i++) { const g = grupos[i]; if (!S.has(g)) S.set(g, new Array(p).fill(0)); const s = S.get(g); for (let a = 0; a < p; a++) s[a] += X[i][a] * e[i]; }
  for (const s of S.values()) for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) M[a][b] += s[a] * s[b];
  const G = S.size;
  return sand(M).map(f => f.map(v => v * G / (G - 1) * (n - 1) / (n - p - extraCl)));
}

// ---------------------------------------------------------------- R² al modo de linearmodels (datos sin transformar)
function r2s(P, params, conConst) {
  const { obs, k } = P;
  const fila = o => (conConst ? [1, ...o.x] : o.x.slice());
  const pred = f => f.reduce((s, v, j) => s + v * params[j], 0);
  const y = obs.map(o => o.y);
  // total
  const e = obs.map((o, i) => y[i] - pred(fila(o)));
  const ym = media(y);
  const r2o = 1 - e.reduce((s, v) => s + v * v, 0) / y.reduce((s, v) => s + (conConst ? (v - ym) ** 2 : v * v), 0);
  // entre (medias de cada unidad)
  const gu = obs.map(o => o.u);
  const my = mediasPor(y, gu), mx = Array.from({ length: k }, (_, j) => mediasPor(obs.map(o => o.x[j]), gu));
  const us = [...my.keys()];
  const yb = us.map(u => my.get(u)), eb = us.map((u, i) => yb[i] - pred(conConst ? [1, ...mx.map(m => m.get(u))] : mx.map(m => m.get(u))));
  const ybm = media(yb);
  const r2b = 1 - eb.reduce((s, v) => s + v * v, 0) / yb.reduce((s, v) => s + (conConst ? (v - ybm) ** 2 : v * v), 0);
  // dentro (sin la media de cada unidad; la constante desaparece)
  const yw = demean(y, gu), xw = Array.from({ length: k }, (_, j) => demean(obs.map(o => o.x[j]), gu));
  const sl = conConst ? params.slice(1) : params;
  const ew = yw.map((v, i) => v - xw.reduce((s, col, j) => s + col[i] * sl[j], 0));
  const r2w = 1 - ew.reduce((s, v) => s + v * v, 0) / yw.reduce((s, v) => s + v * v, 0);
  return { r2o, r2b, r2w };
}

// ---------------------------------------------------------------- estimación
/** P = armarPanel(...) con k = nº de X. Devuelve un objeto por modelo con b (constante primero si la hay), ee, t, p,
 *  ic, df, n, N, T, R² (dentro, entre, total), X absorbidas y efectos de año (respecto al primer año). */
export function estimar(P, modelo, { se = 'cl' } = {}) {
  const { obs } = P, k = obs[0] ? obs[0].x.length : 0;
  const Pk = { ...P, k };
  const gu = obs.map(o => o.u), gt = obs.map(o => o.t);
  const N = new Set(gu).size, T = new Set(gt).size;
  let y = obs.map(o => o.y), xs = Array.from({ length: k }, (_, j) => obs.map(o => o.x[j]));
  let conConst = true, extra = 0, extraCl = 0, grupos = gu, nObs = obs.length;
  const xsOrig = xs;
  if (modelo === 'feu' || modelo === 'fea' || modelo === 'fe2') {
    const tr = modelo === 'feu' ? v => demean(v, gu) : modelo === 'fea' ? v => demean(v, gt) : v => demean2(v, gu, gt);
    const yg = media(y);
    y = tr(y).map(v => v + yg);
    xs = xs.map(c => { const m = media(c); return tr(c).map(v => v + m); });
    extra = modelo === 'feu' ? N - 1 : modelo === 'fea' ? T - 1 : (N - 1) + (T - 1);
    extraCl = modelo === 'feu' ? 0 : extra;   // los efectos de unidad están anidados en los grupos (unidades)
  } else if (modelo === 'pd') {
    const ai = new Map([...new Set(gt)].sort((a, b) => a - b).map((t, i) => [t, i]));
    const yy = [], xx = xs.map(() => []), gg = [];
    for (let i = 1; i < obs.length; i++) {
      const a = obs[i - 1], b = obs[i];
      if (a.u === b.u && ai.get(b.t) === ai.get(a.t) + 1) { yy.push(b.y - a.y); b.x.forEach((v, j) => xx[j].push(v - a.x[j])); gg.push(b.u); }
    }
    y = yy; xs = xx; grupos = gg; conConst = false; nObs = yy.length;
  } else if (modelo === 're') {
    return efectosAleatorios(Pk, se);
  }
  // X que no varían tras quitar los efectos (las absorbe el modelo): fuera, y se dice
  const absorbidas = [];
  const usadas = [];
  xs.forEach((c, j) => {
    const m = media(c), v = c.reduce((s, x) => s + (x - m) ** 2, 0), v0 = xsOrig[j].reduce((s, x) => s + x * x, 0) || 1;
    if (modelo !== 'mco' && v <= 1e-16 * v0) absorbidas.push(j); else usadas.push(j);
  });
  const X = y.map((_, i) => [...(conConst ? [1] : []), ...usadas.map(j => xs[j][i])]);
  const p = X[0] ? X[0].length : 0;
  if (!nObs || nObs <= p + extra) return { modelo, error: 'Hacen falta más observaciones que coeficientes y efectos.' };
  const r = mco(y, X);
  if (!r) return { modelo, error: 'Hay X que dicen lo mismo (colinealidad perfecta).' };
  const V = covarianza(X, r.e, r.inv, { tipo: se, extra, extraCl, grupos });
  const df = nObs - p - extra;
  const out = salida(modelo, r.b, V, df, { conConst, usadas, k });
  Object.assign(out, { n: nObs, N: new Set(grupos).size, T: modelo === 'pd' ? T - 1 : T, absorbidas });
  // R²: los parámetros completos (con 0 en las absorbidas) sobre los datos sin transformar
  const full = [...(conConst ? [out.coef[0]] : []), ...Array.from({ length: k }, (_, j) => (usadas.includes(j) ? out.coef[(conConst ? 1 : 0) + usadas.indexOf(j)] : 0))];
  Object.assign(out, r2s(Pk, full, conConst));
  // efectos de año (respecto al primero), si el modelo los tiene
  if (modelo === 'fea' || modelo === 'fe2') out.efAnio = efectosAnio(Pk, full, modelo);
  return out;
}
function salida(modelo, b, V, df, { conConst, usadas, k }) {
  const tc = tCritico(df);
  const se = V.map((f, i) => Math.sqrt(f[i]));
  // coeficientes en el orden de siempre: constante (si hay) y X1..Xk (null si la X quedó absorbida)
  const pos = j => (usadas.includes(j) ? (conConst ? 1 : 0) + usadas.indexOf(j) : -1);
  const una = i => (i < 0 ? null : { b: b[i], se: se[i], t: b[i] / se[i], p: pT(b[i] / se[i], df), ic: [b[i] - tc * se[i], b[i] + tc * se[i]] });
  return { modelo, df, coef: b, V, constante: conConst ? una(0) : null, x: Array.from({ length: k }, (_, j) => una(pos(j))) };
}
function efectosAnio(P, full, modelo) {
  const { obs, k } = P;
  const r = obs.map(o => o.y - full[0] - o.x.reduce((s, v, j) => s + v * full[1 + j], 0));
  const gu = obs.map(o => o.u), gt = obs.map(o => o.t);
  let d;
  if (modelo === 'fea') d = mediasPor(r, gt);
  else {
    // r = αu + δt + e: proyecciones alternas
    let al = new Map(), de = new Map();
    for (let it = 0; it < 5000; it++) {
      const dn = mediasPor(r.map((v, i) => v - (al.get(gu[i]) || 0)), gt);
      const an = mediasPor(r.map((v, i) => v - (dn.get(gt[i]) || 0)), gu);
      let dd = 0; for (const [t, v] of dn) dd = Math.max(dd, Math.abs(v - (de.get(t) ?? Infinity)));
      de = dn; al = an;
      if (dd < 1e-12) break;
    }
    d = de;
  }
  const ts = [...d.keys()].sort((a, b) => a - b), d0 = d.get(ts[0]);
  void k;
  return ts.map(t => ({ t, v: d.get(t) - d0 }));
}
function efectosAleatorios(P, se) {
  const { obs, k } = P;
  const gu = obs.map(o => o.u), n = obs.length;
  const y = obs.map(o => o.y), xs = Array.from({ length: k }, (_, j) => obs.map(o => o.x[j]));
  const us = [...new Set(gu)], N = us.length;
  // within
  const yw = demean(y, gu), xw = xs.map(c => demean(c, gu));
  const yg = media(y), xg = xs.map(media);
  const Xw = yw.map((_, i) => [1, ...xw.map((c, j) => c[i] + xg[j])]);
  const rw = mco(yw.map(v => v + yg), Xw);
  if (!rw) return { modelo: 're', error: 'Colinealidad dentro de las unidades.' };
  const rankW = xw.filter(c => c.some(v => Math.abs(v) > 1e-12)).length;
  const s2e = rw.ssr / (n - N - rankW);
  // between
  const my = mediasPor(y, gu), mx = xs.map(c => mediasPor(c, gu));
  const yb = us.map(u => my.get(u)), Xb = us.map(u => [1, ...mx.map(m => m.get(u))]);
  const rb = mco(yb, Xb);
  if (!rb) return { modelo: 're', error: 'Colinealidad entre las medias de las unidades.' };
  const dfb = N - (k + 1);
  const Ti = new Map(); gu.forEach(u => Ti.set(u, (Ti.get(u) || 0) + 1));
  const tbar = N / us.reduce((s, u) => s + 1 / Ti.get(u), 0);
  const s2u = Math.max(0, rb.ssr / dfb - s2e / tbar);
  const theta = new Map(us.map(u => [u, 1 - Math.sqrt(s2e / (Ti.get(u) * s2u + s2e))]));
  const ys = y.map((v, i) => v - theta.get(gu[i]) * my.get(gu[i]));
  const X = obs.map((o, i) => { const th = theta.get(gu[i]); return [1 - th, ...o.x.map((v, j) => v - th * mx[j].get(gu[i]))]; });
  const r = mco(ys, X);
  if (!r) return { modelo: 're', error: 'Colinealidad.' };
  const V = covarianza(X, r.e, r.inv, { tipo: se, extra: 0, extraCl: 0, grupos: gu });
  const df = n - (k + 1);
  const out = salida('re', r.b, V, df, { conConst: true, usadas: Array.from({ length: k }, (_, j) => j), k });
  Object.assign(out, { n, N, T: new Set(obs.map(o => o.t)).size, absorbidas: [], sigma2e: s2e, sigma2u: s2u, rho: s2u / (s2u + s2e) });
  Object.assign(out, r2s(P, r.b, true));
  // para Hausman: la covarianza clásica
  out.Vclasica = covarianza(X, r.e, r.inv, { tipo: 'cls', extra: 0, extraCl: 0, grupos: gu });
  return out;
}

/** La nube que mide un modelo (Frisch-Waugh-Lovell): Y y la X número j tras quitar lo que el modelo descuenta (efectos
 *  de unidad, de año o los dos; en primeras diferencias, el cambio entre años seguidos) y lo que explican las demás X.
 *  La pendiente de esa nube (por el origen) es exactamente el coeficiente de la X en el modelo. No vale para efectos
 *  aleatorios (null), ni si la X queda absorbida. Devuelve {x, y, obs (la de cada punto), desde (año anterior, en pd)}. */
export function nubeDentro(P, modelo, j) {
  const { obs } = P, k = obs[0] ? obs[0].x.length : 0;
  if (modelo === 're' || j < 0 || j >= k) return null;
  const gu = obs.map(o => o.u), gt = obs.map(o => o.t);
  let y = obs.map(o => o.y), xs = Array.from({ length: k }, (_, q) => obs.map(o => o.x[q])), quien = obs, desde = null, conConst = true;
  const xsOrig = xs;
  if (modelo === 'feu' || modelo === 'fea' || modelo === 'fe2') {
    const tr = modelo === 'feu' ? v => demean(v, gu) : modelo === 'fea' ? v => demean(v, gt) : v => demean2(v, gu, gt);
    y = tr(y); xs = xs.map(tr);
  } else if (modelo === 'pd') {
    const ai = new Map([...new Set(gt)].sort((a, b) => a - b).map((t, i) => [t, i]));
    const yy = [], xx = xs.map(() => []), qq = [], dd = [];
    for (let i = 1; i < obs.length; i++) {
      const a = obs[i - 1], b = obs[i];
      if (a.u === b.u && ai.get(b.t) === ai.get(a.t) + 1) { yy.push(b.y - a.y); b.x.forEach((v, q) => xx[q].push(v - a.x[q])); qq.push(b); dd.push(a.t); }
    }
    y = yy; xs = xx; quien = qq; desde = dd; conConst = false;
  }
  const varia = (c, q) => { const m = media(c), v = c.reduce((s, x) => s + (x - m) ** 2, 0), v0 = xsOrig[q].reduce((s, x) => s + x * x, 0) || 1; return modelo === 'mco' || v > 1e-16 * v0; };
  if (!y.length || !varia(xs[j], j)) return null;
  const otras = xs.filter((c, q) => q !== j && varia(c, q));
  const Z = y.map((_, i) => [...(conConst ? [1] : []), ...otras.map(c => c[i])]);
  const quita = v => { if (!Z[0].length) return v.slice(); const r = mco(v, Z); return r ? r.e : null; };
  const ry = quita(y), rx = quita(xs[j]);
  if (!ry || !rx) return null;
  return { x: rx, y: ry, obs: quien, desde };
}

/** Hausman (efectos fijos de unidad frente a aleatorios) con las covarianzas clásicas de los dos. */
export function hausman(P, k) {
  const fe = estimar(P, 'feu', { se: 'cls' }), re = estimar(P, 're', { se: 'cls' });
  if (fe.error || re.error) return null;
  const idx = fe.x.map((c, j) => (c ? j : -1)).filter(j => j >= 0);
  if (!idx.length) return null;
  const d = idx.map(j => fe.x[j].b - re.x[j].b);
  // bloques de pendientes: en los dos modelos la constante va primero
  const posFE = j => 1 + fe.x.slice(0, j).filter(Boolean).length;
  const M = idx.map(a => idx.map(b => fe.V[posFE(a)][posFE(b)] - re.Vclasica[1 + a][1 + b]));
  const Mi = invierte(M);
  if (!Mi) return { H: NaN, gl: idx.length, p: NaN, valido: false };
  const H = d.reduce((s, da, a) => s + da * Mi[a].reduce((t, v, b) => t + v * d[b], 0), 0);
  void k;
  return { H, gl: idx.length, p: H >= 0 ? pChi2(H, idx.length) : NaN, valido: H >= 0 };
}
