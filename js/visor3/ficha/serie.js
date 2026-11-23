// serie.js — mini serie de una unidad para la ficha: línea con lo estimado en discontinua, huecos donde no hay dato
// (nunca cero) y el año activo marcado. SVG con d3 (global).

import { esc } from '../../atlas2/fmt.js';
import { catalogoSinc, notaTramo } from '../datos.js';

/* puntos: [{anio, v, est, res}] (anio numérico o texto; si alguno no es número, el eje es por posición) */
export function miniSerie(puntos, { actual = null, formato = v => String(v), unidad = '', ancho = 320, alto = 96, sinUnir = null, tramos = null } = {}) {
  const d3 = window.d3;
  // años sin unir (catálogo: anios_sin_unir, p. ej. [[1591, 1752]]) y tramos donde cambia la fuente: la línea se corta y
  // los puntos que quedan sueltos se ven. El eje, siempre a escala real (ronda v27)
  const SU = (sinUnir || []).filter(z => Array.isArray(z) && z.length === 2).map(z => [+z[0], +z[1]]);
  const TR = (tramos || []).filter(z => Array.isArray(z) && z.length === 2).map(z => [+z[0], +z[1]]);
  if ((SU.length || TR.length) && puntos.every(p => typeof p.anio === 'number')) {
    const q = []; let prev = null;
    for (const p of puntos) {
      if (prev && prev.v != null && p.v != null && SU.some(([a, b]) => prev.anio <= a && p.anio >= b)) q.push({ anio: (prev.anio + p.anio) / 2, v: null });
      q.push(p); if (p.v != null) prev = p;
    }
    puntos = q;
  }
  const P = puntos.filter(p => p.v != null && isFinite(p.v));
  if (P.length < 2) return '';
  const numerico = puntos.every(p => typeof p.anio === 'number' && isFinite(p.anio));
  const M = { t: 14, r: 8, b: 18, l: 8 };
  const ext0 = numerico ? d3.extent(puntos, p => p.anio) : null;
  // donde cambia la fuente (catálogo: sin_interpolar_tramos) se dice por qué se corta
  const entT = tramos ? catalogoSinc().find(e => e.sin_interpolar_tramos === tramos) : null;   // su texto propio, si lo tiene
  const avisoFuente = numerico ? TR.filter(([a, b]) => ext0[0] <= a && ext0[1] >= b).map(([a, b]) => `<p class="v3fi-s-ley">${esc(notaTramo(entT || {}, a, b))}.</p>`).join('') : '';
  const xs = numerico ? d3.scaleLinear(ext0, [M.l, ancho - M.r])
    : d3.scalePoint(puntos.map(p => String(p.anio)), [M.l, ancho - M.r]);
  const X = p => (numerico ? xs(p.anio) : xs(String(p.anio)));
  const [lo, hi] = d3.extent(P, p => p.v);
  const ys = d3.scaleLinear([Math.min(0, lo) === 0 && lo >= 0 && lo / (hi || 1) < 0.25 ? 0 : lo, hi], [alto - M.b, M.t]).nice();
  const def = p => p.v != null && isFinite(p.v);
  const linea = d3.line().x(X).y(p => ys(p.v)).defined(def);
  // tramo observado: solo puntos observados; tramo completo (discontinuo) debajo, para que se vea lo estimado
  const obs = d3.line().x(X).y(p => ys(p.v)).defined(p => def(p) && !p.est && !p.res);
  const hayEst = puntos.some(p => def(p) && (p.est || p.res));
  const cur = puntos.find(p => String(p.anio) === String(actual));
  const sueltos = puntos.filter((p, k) => def(p) && !(puntos[k - 1] && def(puntos[k - 1])) && !(puntos[k + 1] && def(puntos[k + 1])));
  // línea seguida con marca: el año en que cambia lo que incluye la serie
  const marcasT = numerico ? TR.filter(([a, b]) => !SU.some(([u, v]) => u === a && v === b) && b >= ext0[0] && b <= ext0[1]) : [];
  const first = P[0], last = P[P.length - 1];
  const imax = P.reduce((a, p) => (p.v > a.v ? p : a), P[0]);
  const txt = (p, anchor, dy) => `<text x="${X(p).toFixed(1)}" y="${(ys(p.v) + dy).toFixed(1)}" text-anchor="${anchor}" class="v3fi-s-val">${esc(formato(p.v))}</text>`;
  return `<svg viewBox="0 0 ${ancho} ${alto}" class="v3fi-serie" role="img" aria-label="Serie de la unidad: de ${esc(formato(first.v))} en ${esc(first.anio)} a ${esc(formato(last.v))} en ${esc(last.anio)}${unidad ? ' ' + esc(unidad) : ''}">
    ${hayEst && linea(puntos) ? `<path d="${linea(puntos)}" class="v3fi-s-est"/>` : ''}
    ${obs(puntos) ? `<path d="${obs(puntos)}" class="v3fi-s-obs"/>` : ''}
    ${marcasT.map(([a, b]) => `<path d="M${(X({ anio: b }) - 3).toFixed(1)},${M.t - 9}h6l-3,5z" class="v3fi-s-eje"><title>${esc(notaTramo(entT || {}, a, b))}</title></path>`).join('')}
    ${sueltos.map(p => { const par = p.f === '5' || !!p.parcial; return `<circle cx="${X(p).toFixed(1)}" cy="${ys(p.v).toFixed(1)}" r="3.2" class="v3fi-s-ais" fill="${par ? '#fff' : 'currentColor'}" stroke="currentColor" stroke-width="${par ? 1.3 : 0}"${par ? ' stroke-dasharray="2 1.5"' : ''}><title>${esc(String(p.anio))}: ${esc(formato(p.v))}${par ? ' · suma parcial' : p.est ? ' · estimado' : ''}</title></circle>`; }).join('')}
    ${hayEst ? puntos.filter(p => def(p) && !p.est && !p.res).map(p => `<rect x="${(X(p) - 2).toFixed(1)}" y="${(ys(p.v) - 2).toFixed(1)}" width="4" height="4" class="v3fi-s-fuente"/>`).join('') : ''}
    ${cur && def(cur) ? `<line x1="${X(cur).toFixed(1)}" x2="${X(cur).toFixed(1)}" y1="${M.t - 6}" y2="${alto - M.b}" class="v3fi-s-cur"/><circle cx="${X(cur).toFixed(1)}" cy="${ys(cur.v).toFixed(1)}" r="3.6" class="v3fi-s-dot"/>` : ''}
    ${txt(first, 'start', -6)}${imax !== first && imax !== last && X(imax) - X(first) > 70 && X(last) - X(imax) > 70 ? txt(imax, 'middle', -6) : ''}${txt(last, 'end', -6)}
    <text x="${M.l}" y="${alto - 4}" class="v3fi-s-eje">${esc(first.anio)}</text>
    <text x="${ancho - M.r}" y="${alto - 4}" text-anchor="end" class="v3fi-s-eje">${esc(last.anio)}</text>
  </svg>${avisoFuente}${hayEst ? '<p class="v3fi-s-ley"><span class="v3fi-s-pt"></span>año con cifra de fuente <span class="v3fi-s-sw v3fi-s-sw--est"></span>interpolado o estimado · los huecos son años sin dato</p>' : '<p class="v3fi-s-ley">Los huecos son años sin dato (no son cero).</p>'}`;
}

/* «1.234,5 hab/km²» → 1234.5 (formato es-ES de los proveedores) */
export function numeroDe(texto) {
  if (texto == null) return null;
  if (typeof texto === 'number') return texto;
  const m = /-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/.exec(String(texto));
  if (!m) return null;
  const v = +m[0].replace(/\./g, '').replace(',', '.');
  return isFinite(v) ? v : null;
}
