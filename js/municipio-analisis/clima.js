// clima.js — franjas de temperatura y barras de lluvia, de 1916 a 2020. Las medias son de periodos completos.
import { valores, serie } from './datos.js';
import { d3, esc, decimal, entero, cifra, marca, MARCAS, tip, sinTip, alAncho, ejeAnios } from './util.js';
import { lineasComparadas } from './comparada.js';

export async function prepararClima(ctx) {
  const [tm, ta, pr, pa] = await Promise.all(['clima_tmed', 'clima_tmed_anom', 'clima_prec', 'clima_prec_anom'].map(i => valores(i)));
  const S = [tm, ta, pr, pa].map(d => serie(d, ctx.ine));
  const filas = S[0].map((x, k) => ({ a: x.a, t: x.v, f: x.f, ta: S[1][k].v, p: S[2][k].v, fp: S[2][k].f, pa: S[3][k].v }));
  const media = (cl, a0, a1) => { const xs = filas.filter(d => d.a >= a0 && d.a <= a1); return xs.length === a1 - a0 + 1 && xs.every(d => d[cl] != null) ? d3.mean(xs, d => d[cl]) : null; };
  return { filas, t6190: media('t', 1961, 1990), t9120: media('t', 1991, 2020), p6190: media('p', 1961, 1990), p9120: media('p', 1991, 2020) };
}

export function textoClima(C) {
  const con = C.filas.filter(d => d.t != null);
  if (!con.length) return '<p>No hay serie climática para este municipio.</p>';
  const t = [];
  if (C.t6190 != null && C.t9120 != null) {
    const d = C.t9120 - C.t6190;
    t.push(`<p>Su temperatura media fue de ${cifra(`${decimal(C.t9120)} °C`, '3')} en 1991-2020, ${decimal(Math.abs(d))} °C ${d >= 0 ? 'más' : 'menos'} que en 1961-1990 (${cifra(`${decimal(C.t6190)} °C`, '3')}).</p>`);
  }
  if (C.p6190 != null && C.p9120 != null) {
    const d = (C.p9120 / C.p6190 - 1) * 100;
    t.push(`<p>Llovieron de media ${cifra(`${entero(C.p9120)} mm`, '3')} al año en 1991-2020, un ${decimal(Math.abs(d))} % ${d >= 0 ? 'más' : 'menos'} que en 1961-1990.</p>`);
  }
  const cal = con.reduce((a, b) => (b.t > a.t ? b : a)), lp = C.filas.filter(d => d.p != null);
  if (lp.length) {
    const sec = lp.reduce((a, b) => (b.p < a.p ? b : a)), hum = lp.reduce((a, b) => (b.p > a.p ? b : a));
    t.push(`<p>Año más cálido de la serie: ${cal.a}. Más seco: ${sec.a} (${cifra(`${entero(sec.p)} mm`, sec.fp)}). Más lluvioso: ${hum.a} (${cifra(`${entero(hum.p)} mm`, hum.fp)}).</p>`);
  }
  return t.join('');
}

const colT = d3.scaleDiverging([-1.6, 0, 1.6], t => d3.interpolateRdBu(1 - t)).clamp(true);

export function pintarClima(caja, C) {
  if (!C.filas.some(d => d.ta != null)) { caja.innerHTML = '<p class="ma-pie">Sin serie climática.</p>'; return; }
  caja.innerHTML = `<h3 class="ma-h3">Temperatura: cada franja es un año</h3><div class="ma-graf ma-franjas"></div>
    <h3 class="ma-h3">Precipitación: diferencia con su media de 1961-1990</h3><div class="ma-graf ma-lluvia"></div>
    <p class="ma-pie">Azul, más frío que su media de 1961-1990; rojo, más cálido. Serie de 1916 a 2020 de las rejillas MOTEDAS y MOPREDAS. Cifra de la rejilla para este término, no de una estación suya. ${marca('3')} ${MARCAS[3]}: medias del periodo.</p>`;
  const f = caja.querySelector('.ma-franjas'), l = caja.querySelector('.ma-lluvia');
  alAncho(f, w => franjas(f, C, w));
  alAncho(l, w => lluvia(l, C, w));
}

function franjas(g, C, W) {
  const H = 96, b = 18, xs = C.filas;
  const x = d3.scaleBand().domain(xs.map(d => d.a)).range([0, W]);
  g.innerHTML = '';
  const svg = d3.select(g).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Franjas de temperatura por año');
  xs.forEach(d => { if (d.ta != null) svg.append('rect').attr('x', x(d.a)).attr('y', 0).attr('width', x.bandwidth() + .5).attr('height', H - b).attr('fill', colT(d.ta)); });
  ejeAnios(svg, a => x(a) + x.bandwidth() / 2, H - 4, W, { dominio: [xs[0].a, C.filas[C.filas.length - 1].a] });
  svg.append('rect').attr('width', W).attr('height', H - b).attr('fill', 'transparent').on('pointermove', ev => {
    const k = Math.floor(d3.pointer(ev)[0] / x.step()), d = xs[Math.max(0, Math.min(xs.length - 1, k))];
    tip(d.t != null ? `<b>${d.a}</b> · ${decimal(d.t)} °C<br>${d.ta >= 0 ? '+' : ''}${decimal(d.ta)} °C sobre 1961-1990` : `<b>${d.a}</b> · sin dato`, ev);
  }).on('pointerleave', sinTip);
}

function lluvia(g, C, W) {
  const H = 130, m = { t: 6, b: 18 }, xs = C.filas.filter(d => d.pa != null);
  if (!xs.length) { g.innerHTML = ''; return; }
  const x = d3.scaleBand().domain(C.filas.map(d => d.a)).range([0, W]).paddingInner(.14);
  const tope = Math.max(60, d3.max(xs, d => Math.abs(d.pa)) || 60);
  const y = d3.scaleLinear().domain([-tope, tope]).range([H - m.b, m.t]);
  g.innerHTML = '';
  const svg = d3.select(g).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Precipitación respecto a 1961-1990');
  xs.forEach(d => svg.append('rect').attr('x', x(d.a)).attr('y', y(Math.max(0, d.pa))).attr('width', x.bandwidth()).attr('height', Math.max(.5, Math.abs(y(d.pa) - y(0)))).attr('fill', d.pa >= 0 ? '#2a5a85' : '#a87316'));
  svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).attr('class', 'ma-base');
  ejeAnios(svg, a => x(a) + x.bandwidth() / 2, H - 4, W, { dominio: [xs[0].a, C.filas[C.filas.length - 1].a] });
  svg.append('text').attr('x', 2).attr('y', y(tope) + 11).attr('class', 'ma-eje-t').text(`+${entero(tope)} %`);
  svg.append('text').attr('x', 2).attr('y', y(-tope) - 3).attr('class', 'ma-eje-t').text(`−${entero(tope)} %`);
  svg.append('rect').attr('width', W).attr('height', H - m.b).attr('fill', 'transparent').on('pointermove', ev => {
    const k = Math.floor(d3.pointer(ev)[0] / x.step()), d = C.filas[Math.max(0, Math.min(C.filas.length - 1, k))];
    tip(d.p != null ? `<b>${d.a}</b> · ${entero(d.p)} mm<br>${d.pa >= 0 ? '+' : ''}${decimal(d.pa)} % sobre 1961-1990` : `<b>${d.a}</b> · sin dato`, ev);
  }).on('pointerleave', sinTip);
}
export { esc };

// ---------------------------------------------------------------- su clima frente a Andalucía y su provincia
export async function prepararClimaComp(ctx, C) {
  const [tA, tP, pA, pP] = await Promise.all([valores('clima_tmed', 'andalucia'), valores('clima_tmed', 'provincia'), valores('clima_prec', 'andalucia'), valores('clima_prec', 'provincia')]);
  const media = (d, id, a0, a1) => { const xs = serie(d, id).filter(x => x.a >= a0 && x.a <= a1); return xs.length === a1 - a0 + 1 && xs.every(x => x.v != null) ? d3.mean(xs, x => x.v) : null; };
  const f = (T, P_, id) => ({ t0: media(T, id, 1961, 1990), t1: media(T, id, 1991, 2020), p0: media(P_, id, 1961, 1990), p1: media(P_, id, 1991, 2020) });
  return {
    m: { t0: C.t6190, t1: C.t9120, p0: C.p6190, p1: C.p9120 }, A: f(tA, pA, 'AND'), P: f(tP, pP, ctx.prov),
    serT: { m: C.filas.map(x => ({ a: x.a, v: x.t, f: x.f })), A: serie(tA, 'AND'), P: serie(tP, ctx.prov) },
    serP: { m: C.filas.map(x => ({ a: x.a, v: x.p, f: x.fp })), A: serie(pA, 'AND'), P: serie(pP, ctx.prov) },
  };
}

const cam = (x, y) => (x != null && y != null ? y - x : null);
const camP = (x, y) => (x > 0 && y != null ? (y / x - 1) * 100 : null);
const signo = (v, n = decimal) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${n(Math.abs(v))}`);

export function textoClimaComp(D) {
  const dm = cam(D.m.t0, D.m.t1), da = cam(D.A.t0, D.A.t1), t = [];
  if (D.m.t1 != null && D.A.t1 != null) {
    const d = D.m.t1 - D.A.t1;
    t.push(`<p>En 1991-2020 es <b class="ma-c">${decimal(Math.abs(d))} °C ${d >= 0 ? 'más cálido' : 'más fresco'}</b> que Andalucía (${decimal(D.A.t1)} °C).</p>`);
  }
  if (dm != null && da != null) t.push(`<p>Desde 1961-1990 su temperatura ha cambiado ${signo(dm)} °C; la de Andalucía, ${signo(da)} °C.</p>`);
  if (D.m.p1 != null && D.A.p1 != null) t.push(`<p>Recibe ${entero(Math.abs(D.m.p1 - D.A.p1))} mm al año ${D.m.p1 >= D.A.p1 ? 'más' : 'menos'} que Andalucía.</p>`);
  return t.join('') || '<p>Sin cifras con las que compararlo.</p>';
}

export function pintarClimaComp(caja, D, ctx) {
  const fila = (n, x) => `<tr><th scope="row">${esc(n)}</th><td>${x.t1 == null ? '—' : `${decimal(x.t1)} °C`}</td><td>${signo(cam(x.t0, x.t1))} °C</td><td>${x.p1 == null ? '—' : `${entero(x.p1)} mm`}</td><td>${signo(camP(x.p0, x.p1))}\u00a0%</td></tr>`;
  caja.innerHTML = `<h3 class="ma-h3">Temperatura media, año a año (°C)</h3><div class="ma-graf ma-clt"></div>
    <h3 class="ma-h3">Precipitación, año a año (mm)</h3><div class="ma-graf ma-clp"></div>
    <div class="ma-tabla-w"><table class="ma-tabla ma-tabla--clima"><thead><tr><th scope="col"></th><th scope="col">Temperatura 1991-2020</th><th scope="col">Cambio desde 1961-1990</th><th scope="col">Lluvia 1991-2020</th><th scope="col">Cambio desde 1961-1990</th></tr></thead><tbody>
    ${fila(ctx.nombre, D.m)}${fila(`Provincia de ${ctx.provNombre}`, D.P)}${fila('Andalucía', D.A)}</tbody></table></div>
    <p class="ma-pie">Todos los años de 1916 a 2020, de la serie de rejilla de cada ámbito. La tabla, medias de periodos completos.</p>`;
  const serie3 = S => [{ t: ctx.nombre, c: '#007a3d', w: 2.2, pts: S.m }, { t: 'Provincia', c: '#9a9a94', pts: S.P }, { t: 'Andalucía', c: '#101010', pts: S.A }];
  lineasComparadas(caja.querySelector('.ma-clt'), { unidad: '°C', sinPuntos: true, cero: false, series: serie3(D.serT) });
  lineasComparadas(caja.querySelector('.ma-clp'), { unidad: 'mm', sinPuntos: true, series: serie3(D.serP) });
}
