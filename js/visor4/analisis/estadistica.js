// estadistica.js — estadística de la vista «Análisis» (docs/v2/ANALISIS_PRUEBAS.md).
// Módulo puro: sin DOM ni d3, para poder probarlo en Node (js/visor4/analisis/pruebas.mjs) contra numpy, statsmodels
// y esda. Nada aquí estima cifras nuevas: solo resume las que llegan.

// ---------------------------------------------------------------- distribuciones (t y F) por la beta incompleta
function lgamma(x) {
  // Lanczos (g = 7, n = 9)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betacf(x, a, b) {
  const MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
/** Beta incompleta regularizada I_x(a, b). */
export function betaInc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(x, a, b) / a : 1 - bt * betacf(1 - x, b, a) / b;
}
/** p bilateral de una t de Student con gl grados de libertad. */
export function pT(t, gl) {
  if (!isFinite(t)) return 0;
  if (!(gl > 0)) return NaN;
  return betaInc(gl / (gl + t * t), gl / 2, 0.5);
}
/** Cuantil bilateral: el t tal que P(|T| > t) = alfa (1,96 para gl grandes y alfa = 0,05). */
export function tCritico(gl, alfa = 0.05) {
  if (!(gl > 0)) return NaN;
  let lo = 0, hi = 1e4;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (pT(m, gl) > alfa) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** Gamma incompleta regularizada superior Q(a, x) (Numerical Recipes: serie o fracción continua). */
function gammaQ(a, x) {
  if (x <= 0) return 1;
  const gln = lgamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 3e-16) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, hh = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; hh *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * hh;
}
/** p de una ji cuadrado con k grados de libertad (cola superior). */
export function pChi2(x, k) { return x > 0 && k > 0 ? gammaQ(k / 2, x / 2) : 1; }
/** p de una F(d1, d2) (cola superior). */
export function pF(F, d1, d2) {
  if (!(F > 0)) return 1;
  return betaInc(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
}

// ---------------------------------------------------------------- descriptivos
const suma = a => { let s = 0; for (const v of a) s += v; return s; };
export function media(a, w = null) {
  if (!w) return suma(a) / a.length;
  let s = 0, W = 0;
  for (let i = 0; i < a.length; i++) { s += w[i] * a[i]; W += w[i]; }
  return s / W;
}
/** Rangos con empates promediados (1 = el menor), como scipy.stats.rankdata. */
export function rangos(a) {
  const idx = a.map((v, i) => i).sort((i, j) => a[i] - a[j]);
  const r = new Array(a.length);
  for (let k = 0; k < idx.length;) {
    let m = k;
    while (m + 1 < idx.length && a[idx[m + 1]] === a[idx[k]]) m++;
    const rr = (k + m) / 2 + 1;
    for (let q = k; q <= m; q++) r[idx[q]] = rr;
    k = m + 1;
  }
  return r;
}
/** Cuantil de tipo 7 (el de R y numpy por defecto) de una lista ya ordenada. */
export function cuantil(ord, p) {
  if (!ord.length) return NaN;
  const h = (ord.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return ord[lo] + (h - lo) * (ord[hi] - ord[lo]);
}
/** Cortes de terciles (dos valores) de una lista. */
export function terciles(a) {
  const o = [...a].sort((x, y) => x - y);
  return [cuantil(o, 1 / 3), cuantil(o, 2 / 3)];
}

// ---------------------------------------------------------------- correlación
/** Pearson (ponderado si se da w): {r, n, t, p}. La p sale de la t con n − 2 grados de libertad. */
export function pearson(x, y, w = null) {
  const n = x.length;
  if (n < 3) return { r: NaN, n, t: NaN, p: NaN };
  const xm = media(x, w), ym = media(y, w);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1, dx = x[i] - xm, dy = y[i] - ym;
    sxx += wi * dx * dx; syy += wi * dy * dy; sxy += wi * dx * dy;
  }
  const r = sxx > 0 && syy > 0 ? Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy))) : NaN;
  const gl = n - 2;
  const t = Math.abs(r) < 1 ? r * Math.sqrt(gl / (1 - r * r)) : (r > 0 ? Infinity : -Infinity);
  return { r, n, t, p: isNaN(r) ? NaN : pT(t, gl) };
}
/** Spearman: Pearson sobre los rangos (sin ponderar), con la misma aproximación t que scipy. */
export function spearman(x, y) {
  const c = pearson(rangos(x), rangos(y));
  return { rho: c.r, n: c.n, t: c.t, p: c.p };
}
/** Intervalo del 95 % de r por la transformación z de Fisher. */
export function icFisher(r, n, z = 1.959963984540054) {
  if (!(n > 3) || !isFinite(r) || Math.abs(r) >= 1) return [NaN, NaN];
  const f = Math.atanh(r), s = 1 / Math.sqrt(n - 3);
  return [Math.tanh(f - z * s), Math.tanh(f + z * s)];
}

// ---------------------------------------------------------------- regresión simple (MCO o MCP)
/** Y = a + b·X por mínimos cuadrados (ponderados si se da w; el resultado no cambia si se multiplican todos los pesos). */
export function mco(x, y, w = null) {
  const n = x.length;
  if (n < 3) return null;
  let W = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { const wi = w ? w[i] : 1; W += wi; sx += wi * x[i]; sy += wi * y[i]; }
  const xm = sx / W, ym = sy / W;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1, dx = x[i] - xm, dy = y[i] - ym;
    sxx += wi * dx * dx; sxy += wi * dx * dy; syy += wi * dy * dy;
  }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx, a = ym - b * xm;
  let ssr = 0;
  const resid = new Array(n);
  for (let i = 0; i < n; i++) { const e = y[i] - a - b * x[i]; resid[i] = e; ssr += (w ? w[i] : 1) * e * e; }
  const gl = n - 2, s2 = ssr / gl;
  const seB = Math.sqrt(s2 / sxx), seA = Math.sqrt(s2 * (1 / W + xm * xm / sxx));
  const tc = tCritico(gl);
  const tB = b / seB;
  return {
    n, gl, a, b, seA, seB, tB, pB: pT(tB, gl), tA: a / seA, pA: pT(a / seA, gl),
    icB: [b - tc * seB, b + tc * seB], icA: [a - tc * seA, a + tc * seA], tc,
    r2: syy > 0 ? 1 - ssr / syy : NaN, s: Math.sqrt(s2), xm, ym, sxx, W, resid,
    /** recta y banda de confianza del 95 % de la media en x0 */
    banda(x0) { const f = a + b * x0, se = Math.sqrt(s2 * (1 / W + (x0 - xm) * (x0 - xm) / sxx)); return { f, lo: f - tc * se, hi: f + tc * se }; },
  };
}

// ---------------------------------------------------------------- regresión múltiple
/** Inversa por Gauss-Jordan con pivote; null si la matriz es singular. */
export function invierte(A) {
  const n = A.length, M = A.map((f, i) => [...f, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const escala = Math.max(...A.map((f, i) => Math.abs(f[i]))) || 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-11 * escala) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map(f => f.slice(n));
}
/** Y = b0 + b1·X1 + … + bk·Xk (MCO, o MCP con w). xs = [[valores de X1], [X2], …]. */
export function mcoMultiple(y, xs, w = null, { vif = true } = {}) {
  const n = y.length, k = xs.length, p = k + 1;
  if (n <= p) return { error: `Hacen falta más unidades que coeficientes (hay ${n} y ${p} coeficientes).` };
  // centrar mejora la condición numérica; la constante se recupera después
  const wv = i => (w ? w[i] : 1);
  let W = 0; for (let i = 0; i < n; i++) W += wv(i);
  const mx = xs.map(x => { let s = 0; for (let i = 0; i < n; i++) s += wv(i) * x[i]; return s / W; });
  let my = 0; for (let i = 0; i < n; i++) my += wv(i) * y[i]; my /= W;
  const fila = i => [1, ...xs.map((x, j) => x[i] - mx[j])];
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0)), Xty = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const f = fila(i), wi = wv(i);
    for (let a = 0; a < p; a++) { Xty[a] += wi * f[a] * y[i]; for (let b = a; b < p; b++) XtX[a][b] += wi * f[a] * f[b]; }
  }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  const inv = invierte(XtX);
  if (!inv) return { error: 'Dos o más variables explicativas dicen lo mismo (colinealidad perfecta): quita alguna.' };
  const bc = inv.map(f => f.reduce((s, v, j) => s + v * Xty[j], 0));
  const fitted = new Array(n), resid = new Array(n);
  let ssr = 0, tss = 0;
  for (let i = 0; i < n; i++) {
    const f = fila(i);
    let yh = 0; for (let a = 0; a < p; a++) yh += bc[a] * f[a];
    fitted[i] = yh; resid[i] = y[i] - yh;
    ssr += wv(i) * resid[i] * resid[i]; tss += wv(i) * (y[i] - my) * (y[i] - my);
  }
  const gl = n - p, s2 = ssr / gl, tc = tCritico(gl);
  // varianza de la constante sin centrar: a = b0c − Σ bj·mxj
  const coef = [bc[0] - bc.slice(1).reduce((s, b, j) => s + b * mx[j], 0), ...bc.slice(1)];
  const g = [1, ...mx.map(m => -m)];
  let va = 0; for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) va += g[a] * inv[a][b] * g[b];
  const se = [Math.sqrt(s2 * va), ...bc.slice(1).map((_, j) => Math.sqrt(s2 * inv[j + 1][j + 1]))];
  const t = coef.map((b, j) => b / se[j]);
  const r2 = 1 - ssr / tss, r2aj = 1 - (1 - r2) * (n - 1) / gl;
  const F = ((tss - ssr) / k) / (ssr / gl);
  // coeficientes tipificados (en desviaciones típicas, con los mismos pesos)
  const sd = v => { let m = 0; for (let i = 0; i < n; i++) m += wv(i) * v[i]; m /= W; let s = 0; for (let i = 0; i < n; i++) s += wv(i) * (v[i] - m) ** 2; return Math.sqrt(s / W); };
  const sdy = sd(y);
  const beta = coef.slice(1).map((b, j) => b * sd(xs[j]) / sdy);
  const out = {
    n, k, gl, coef, se, t, p: t.map(v => pT(v, gl)), ic: coef.map((b, j) => [b - tc * se[j], b + tc * se[j]]), tc,
    r2, r2aj, F, pF: pF(F, k, gl), s: Math.sqrt(s2), beta, icBeta: beta.map((b, j) => [(coef[j + 1] - tc * se[j + 1]) * sd(xs[j]) / sdy, (coef[j + 1] + tc * se[j + 1]) * sd(xs[j]) / sdy]),
    fitted, resid,
  };
  // VIF de cada X (sin ponderar, como statsmodels): 1 / (1 − R² de X frente a las demás)
  if (vif && k > 1) out.vif = xs.map((x, j) => { const r = mcoMultiple(x, xs.filter((_, q) => q !== j), null, { vif: false }); return r.error ? Infinity : 1 / (1 - r.r2); });
  else if (vif) out.vif = [1];
  return out;
}

// ---------------------------------------------------------------- azar con semilla (para que el resultado se repita)
export function azar(semilla = 20261120) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- autocorrelación espacial
/** Quita de la vecindad las unidades sin dato y las que se quedan sin vecinos.
 *  vecinos: lista de listas de índices (sobre todas las unidades); conDato(i) → bool.
 *  Devuelve {orden: [índices originales que entran], vec: listas con índices NUEVOS, sinVecinos: [índices originales]}. */
export function subgrafo(vecinos, conDato) {
  const dentro = vecinos.map((_, i) => conDato(i));
  const sinVecinos = [];
  const orden = [];
  for (let i = 0; i < vecinos.length; i++) {
    if (!dentro[i]) continue;
    if (vecinos[i].some(j => dentro[j])) orden.push(i); else sinVecinos.push(i);
  }
  // quitar las islas no deja a nadie sin vecinos: una isla no era vecina de nadie con dato
  const nuevo = new Map(orden.map((i, k) => [i, k]));
  const vec = orden.map(i => vecinos[i].filter(j => nuevo.has(j)).map(j => nuevo.get(j)));
  return { orden, vec, sinVecinos };
}
const lagFila = (vec, z, i) => { const v = vec[i]; let s = 0; for (const j of v) s += z[j]; return s / v.length; };

/** I de Moran global con pesos de contigüidad estandarizados por filas, su esperanza y varianza (normalidad y
 *  aleatorización, Cliff y Ord) y la prueba por permutaciones (p «plegada», como esda: (mayores + 1) / (perm + 1)). */
export function moran(x, vec, { perm = 999, semilla = 20261120 } = {}) {
  const n = x.length;
  const m = media(x);
  const z = x.map(v => v - m);
  let den = 0, m4 = 0;
  for (const v of z) { den += v * v; m4 += v ** 4; }
  if (!(den > 0)) return { n, error: 'Todas las unidades tienen la misma cifra: no hay variación que medir.' };
  const I0 = zz => { let s = 0; for (let i = 0; i < n; i++) s += zz[i] * lagFila(vec, zz, i); return s / den; };
  const I = I0(z);
  // momentos: S0 = n (filas que suman 1); S1 = ½ ΣΣ (wij + wji)²; S2 = Σ (wi· + w·i)²
  const S0 = n;
  const wDe = vec.map(v => 1 / v.length);
  const col = new Array(n).fill(0);
  const par = new Map();
  for (let i = 0; i < n; i++) for (const j of vec[i]) { col[j] += wDe[i]; const k = i < j ? i + ',' + j : j + ',' + i; par.set(k, (par.get(k) || 0) + wDe[i]); }
  // ½ ΣiΣj (wij + wji)² cuenta cada par en los dos sentidos: es la suma, una vez por par, de (wij + wji)²
  let S1 = 0; for (const v of par.values()) S1 += v * v;
  let S2 = 0; for (let i = 0; i < n; i++) S2 += (1 + col[i]) ** 2;
  const EI = -1 / (n - 1);
  const VIn = (n * n * S1 - n * S2 + 3 * S0 * S0) / ((n * n - 1) * S0 * S0) - EI * EI;
  const b2 = n * m4 / (den * den);
  const VIr = (n * ((n * n - 3 * n + 3) * S1 - n * S2 + 3 * S0 * S0) - b2 * ((n * n - n) * S1 - 2 * n * S2 + 6 * S0 * S0)) / ((n - 1) * (n - 2) * (n - 3) * S0 * S0) - EI * EI;
  // permutaciones
  const rnd = azar(semilla);
  const zp = z.slice();
  const sims = new Float64Array(perm);
  for (let r = 0; r < perm; r++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = zp[i]; zp[i] = zp[j]; zp[j] = t; }
    sims[r] = I0(zp);
  }
  // p plegada: la cola más corta, contando los empates en las dos (con tolerancia de redondeo)
  const tol = 1e-9 * Math.max(1e-12, Math.abs(I));
  let ge = 0, le = 0; for (const s of sims) { if (s >= I - tol) ge++; if (s <= I + tol) le++; }
  const mayores = Math.min(ge, le);
  const mS = media(sims), sdS = Math.sqrt(sims.reduce((s, v) => s + (v - mS) ** 2, 0) / (perm - 1));
  return {
    n, I, EI, VIn, VIr, zNorm: (I - EI) / Math.sqrt(VIn), zRand: (I - EI) / Math.sqrt(VIr), pNorm: pNormal2((I - EI) / Math.sqrt(VIn)), pRand: pNormal2((I - EI) / Math.sqrt(VIr)),
    perm, pSim: (mayores + 1) / (perm + 1), sims, mediaSim: mS, sdSim: sdS, zSim: (I - mS) / sdS, z, lag: z.map((_, i) => lagFila(vec, z, i)), S1, S2,
  };
}
function erfc(x) {
  // Numerical Recipes (error < 1,2e-7)
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** p bilateral de una normal tipificada. */
export const pNormal2 = z => (isFinite(z) ? erfc(Math.abs(z) / Math.SQRT2) : 0);

/** Moran local (LISA, Anselin 1995, con la normalización de esda: Ii = (n − 1)·zi·lagi / Σz²), cuadrante y p por
 *  permutación condicionada (para cada unidad se fija su cifra y se sortean sus k vecinos entre las demás). */
export function lisa(x, vec, { perm = 999, semilla = 20261120 } = {}) {
  const n = x.length;
  const m = media(x);
  const z = x.map(v => v - m);
  let den = 0; for (const v of z) den += v * v;
  const lag = z.map((_, i) => lagFila(vec, z, i));
  const Ii = z.map((v, i) => (n - 1) * v * lag[i] / den);
  const cuad = z.map((v, i) => (v > 0 ? (lag[i] > 0 ? 'AA' : 'AB') : (lag[i] > 0 ? 'BA' : 'BB')));   // A alto, B bajo: unidad + vecinos
  const rnd = azar(semilla);
  const p = new Float64Array(n);
  const otros = new Int32Array(n - 1);
  for (let i = 0; i < n; i++) {
    const k = vec[i].length;
    let q = 0; for (let j = 0; j < n; j++) if (j !== i) otros[q++] = j;
    // empates (muchas unidades con la misma cifra, p. ej. 0 % de olivar): se cuentan en las dos colas, con una
    // tolerancia de redondeo; si no, una unidad rodeada de su misma cifra saldría «significativa» por error
    const tol = 1e-9 * Math.max(1e-12, Math.abs(Ii[i]));
    let ge = 0, le = 0;
    for (let r = 0; r < perm; r++) {
      // k primeros de un barajado parcial de las demás unidades
      let s = 0;
      for (let a = 0; a < k; a++) {
        const b = a + Math.floor(rnd() * (n - 1 - a));
        const t = otros[a]; otros[a] = otros[b]; otros[b] = t;
        s += z[otros[a]];
      }
      const Ip = (n - 1) * z[i] * (s / k) / den;
      if (Ip >= Ii[i] - tol) ge++;
      if (Ip <= Ii[i] + tol) le++;
    }
    p[i] = (Math.min(ge, le) + 1) / (perm + 1);
  }
  return { n, z, lag, Ii, cuad, p, perm };
}
/** Umbral de Benjamini-Hochberg: la mayor p(k) con p(k) ≤ k/m·q (0 si ninguna). */
export function umbralFDR(ps, q = 0.05) {
  const o = [...ps].sort((a, b) => a - b), m = o.length;
  let u = 0;
  for (let k = 0; k < m; k++) if (o[k] <= (k + 1) / m * q) u = o[k];
  return u;
}

// ---------------------------------------------------------------- en el tiempo
/** Correlación cruzada de dos series {año: valor}: para cada desfase L, r de X(t) con Y(t + L) en los años en que
 *  existen las dos. Con `dif`, sobre las diferencias por año entre datos consecutivos de cada serie. */
export function correlacionCruzada(sx, sy, lags, { dif = false } = {}) {
  const prep = s => {
    const a = [...s.entries()].filter(([, v]) => v != null && isFinite(v)).sort((p, q) => p[0] - q[0]);
    if (!dif) return new Map(a);
    const out = new Map();
    for (let i = 1; i < a.length; i++) out.set(a[i][0], (a[i][1] - a[i - 1][1]) / (a[i][0] - a[i - 1][0]));
    return out;
  };
  const X = prep(sx), Y = prep(sy);
  return lags.map(L => {
    const xs = [], ys = [], anios = [];
    for (const [t, v] of X) if (Y.has(t + L)) { xs.push(v); ys.push(Y.get(t + L)); anios.push(t); }
    const c = pearson(xs, ys);
    return { L, r: c.r, n: c.n, p: c.p, banda: c.n > 3 ? 1.959963984540054 / Math.sqrt(c.n) : NaN, anios };
  });
}
