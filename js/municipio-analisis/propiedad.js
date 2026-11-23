// propiedad.js — explotaciones y tenencia en los censos agrarios, de 1962 a 2009 en las dos columnas y sobre el mismo eje.
// La tenencia solo existe en los censos de 1982, 1989 y 1999: en 1962 y 2009 se dice «sin dato» y no se interpola.
import { valores, serie, celda, avisoDe, avisoLlano } from './datos.js';
import { d3, esc, decimal, entero, cifra, marca, MARCAS, tip, sinTip, alAncho, tramas } from './util.js';
import { lineasComparadas } from './comparada.js';
import { AVISO_1960 } from './panel.js';

const TEN = [
  { id: 'prop_tenencia_owned_pct', r: 'En propiedad', c: '#0f3b2c' },
  { id: 'prop_tenencia_leased_pct', r: 'En arrendamiento', c: '#d2a24c' },
  { id: 'prop_tenencia_sharecropped_pct', r: 'En aparcería', c: '#a3412a' },
  { id: 'prop_tenencia_other_pct', r: 'Otros regímenes', c: '#b9b5a8' },
];
const CENSOS_A = [1960, 1982, 1989, 1999, 2009];
const CON_TENENCIA = new Set([1982, 1989, 1999]);
export const rotAgr = a => (a === 1960 || a === 1962 ? '1962' : String(a));
// el fichero llama 1960 al censo agrario de 1962: en el eje va en su año real
const real = S => S.map(x => (x.a === 1960 ? { ...x, a: 1962, f: x.v == null ? x.f : '2' } : x));
const CUENTAS_DESDE = 1982;
const AVISO_PUNTO = { 1962: AVISO_1960 };

export async function prepararPropiedad(ctx) {
  const [tm, tA, tP, nE, ...ds] = await Promise.all([valores('prop_tamano_medio'), valores('prop_tamano_medio', 'andalucia'), valores('prop_tamano_medio', 'provincia'), valores('prop_explotaciones'), ...TEN.map(t => valores(t.id))]);
  const tapa = S => S.map(x => (ctx.ex.fuera(x.a) ? { ...x, v: null, f: '.' } : x));
  const tenencia = CENSOS_A.map(a => {
    const anio = a === 1960 ? 1962 : a;
    if (!CON_TENENCIA.has(a)) return { a: anio, partes: [], sinCenso: true };
    if (ctx.ex.fuera(a)) return { a: anio, partes: [], fuera: true };
    return { a: anio, partes: TEN.map((t, k) => ({ ...t, ...celda(ds[k], ctx.ine, a) })).filter(p => p.v != null && p.v > 0) };
  });
  return {
    tam: real(tapa(serie(tm, ctx.ine))), tamA: real(serie(tA, 'AND')), tamP: real(serie(tP, ctx.prov)), expl: real(tapa(serie(nE, ctx.ine))), tenencia,
    avisoTam: avisoLlano(tm, avisoDe(tm, ctx.ine, 2009)),
  };
}

export function textoPropiedad(D) {
  const con = D.tam.filter(x => x.v != null && x.a >= CUENTAS_DESDE), t = [];
  if (con.length) {
    const a = con[0], b = con[con.length - 1];
    t.push(`<p>Sus explotaciones medían de media ${cifra(`${decimal(a.v)} ha`, a.f)} en ${rotAgr(a.a)}${b !== a ? ` y ${cifra(`${decimal(b.v)} ha`, b.f)} en ${rotAgr(b.a)}` : ''}.</p>`);
  }
  const u = [...D.tenencia].reverse().find(x => x.partes.length);
  if (u) { const m = u.partes.reduce((p, q) => (q.v > p.v ? q : p)); t.push(`<p>En ${u.a} la parte mayor de su superficie agrícola estaba ${esc(m.r.toLowerCase())}: ${cifra(`${decimal(m.v)} %`, m.f)}.</p>`); }
  if (D.tam.concat(D.expl).some(x => x.a === 1962 && x.v != null)) t.push(`<p class="ma-aviso-b">Censo agrario de 1962, ${AVISO_1960}. Sus cifras se dibujan con el rombo ámbar, pero no entran en puestos, máximos, cambios ni resúmenes: las cuentas empiezan en 1982.</p>`);
  return t.join('') || '<p>Sin cifras de explotaciones para este municipio.</p>';
}

export function textoPropiedadComp(D) {
  const u = [...D.tam].reverse().find(x => x.v != null && x.a >= CUENTAS_DESDE);
  if (!u) return '<p>Sin cifras con las que compararlo.</p>';
  const A = D.tamA.find(x => x.a === u.a), P = D.tamP.find(x => x.a === u.a), t = [];
  if (A && A.v) t.push(`<p>En ${rotAgr(u.a)} su explotación media es <b class="ma-c">${decimal(u.v / A.v)} veces</b> la de Andalucía (${decimal(A.v)} ha${marca(A.f)})${P && P.v ? ` y ${decimal(u.v / P.v)} veces la de su provincia (${decimal(P.v)} ha${marca(P.f)})` : ''}.</p>`);
  return t.join('');
}

export function pintarPropiedad(caja, D, ctx) {
  const hay = D.tenencia.some(x => x.partes.length);
  caja.innerHTML = `<h3 class="ma-h3">Número de explotaciones</h3><div class="ma-graf ma-nexp"></div>
    <h3 class="ma-h3">Régimen de tenencia de la tierra</h3>${hay ? `<div class="ma-graf ma-ten"></div>
    <ul class="ma-ley ma-ley--color">${TEN.map(t => `<li><i style="background:${t.c}"></i><span>${t.r}</span></li>`).join('')}</ul>` : '<p class="ma-pie">Sin cifras de tenencia.</p>'}
    <p class="ma-pie">Censos agrarios de 1962 a 2009. La tenencia, en % de la superficie agrícola utilizada, solo existe en los censos de 1982, 1989 y 1999; en 1962 y 2009 no hay dato. La trama indica cifra estimada.${D.avisoTam ? ` ${esc(D.avisoTam)}` : ''}</p>`;
  lineasComparadas(caja.querySelector('.ma-nexp'), { unidad: 'explotaciones', rot: rotAgr, avisos: AVISO_PUNTO, series: [{ t: ctx.nombre, c: '#007a3d', w: 2.8, pts: D.expl }], dominio: [1962, 2009] });
  const g = caja.querySelector('.ma-ten');
  if (g) alAncho(g, W => columnas(g, D, W));
}

function columnas(g, D, W) {
  const H = 210, m = { t: 8, r: 26, b: 24, l: 42 };
  const x = d3.scaleLinear().domain([1962, 2009]).range([m.l + 12, W - m.r - 8]);
  const y = d3.scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
  const bw = Math.min(44, (x(1989) - x(1982)) * .8);
  g.innerHTML = '';
  const svg = d3.select(g).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Régimen de tenencia por censo agrario');
  const T = tramas(svg);
  [0, 50, 100].forEach(v => {
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('class', v === 0 ? 'ma-base' : 'ma-rej');
    svg.append('text').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('class', 'ma-eje-t').text(`${v}${v === 100 ? ' %' : ''}`);
  });
  for (const c of D.tenencia) {
    const X = x(c.a) - bw / 2;
    svg.append('text').attr('x', x(c.a)).attr('y', H - m.b + 17).attr('text-anchor', 'middle').attr('class', 'ma-eje-t').text(c.a);
    if (!c.partes.length) {
      svg.append('text').attr('x', x(c.a)).attr('y', y(0) - 7).attr('text-anchor', 'middle').attr('class', 'ma-sin').text(c.fuera ? 'no era municipio' : 'sin dato');
      continue;
    }
    let ac = 0;
    for (const p of c.partes) {
      const y1 = y(ac + p.v), h = y(ac) - y1, z = svg.append('g').on('pointermove', ev => tip(`<b>${c.a} · ${esc(p.r)}</b><br>${decimal(p.v)} % ${marca(p.f)} ${MARCAS[p.f] || ''}`, ev)).on('pointerleave', sinTip);
      z.append('rect').attr('x', X).attr('y', y1).attr('width', bw).attr('height', Math.max(.5, h)).attr('fill', p.c);
      if (p.f === '1' || p.f === '4') z.append('rect').attr('x', X).attr('y', y1).attr('width', bw).attr('height', Math.max(.5, h)).attr('fill', T.est);
      if (p.f === '2') z.append('rect').attr('x', X).attr('y', y1).attr('width', bw).attr('height', Math.max(.5, h)).attr('fill', T.rev);
      if (h > 15 && bw > 26) z.append('text').attr('x', X + bw / 2).attr('y', y1 + h / 2 + 4).attr('text-anchor', 'middle').attr('class', 'ma-en-barra').style('fill', ['#0f3b2c', '#a3412a'].includes(p.c) ? '#fff' : '#101010').text(entero(p.v));
      ac += p.v;
    }
  }
}

export function pintarPropiedadComp(el, D, ctx) {
  lineasComparadas(el, {
    unidad: 'ha', rot: rotAgr, dominio: [1962, 2009], avisos: AVISO_PUNTO,
    series: [{ t: ctx.nombre, c: '#007a3d', w: 2.8, pts: D.tam }, { t: 'Provincia', c: '#6b6b6b', pts: D.tamP }, { t: 'Andalucía', c: '#101010', pts: D.tamA }],
  });
}
