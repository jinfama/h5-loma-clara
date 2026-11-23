// comparada.js — su historia comparada: población frente al municipio típico, puesto en cada censo y crecimiento por
// tramos frente a Andalucía y su provincia. Se compara solo entre censos con cifra observada del municipio; los tramos en
// que Andalucía o la provincia llevan parte estimada se marcan. Y la frase de arriba: qué tiene de particular.
import { CENSOS, ACEPTADA } from './datos.js';
import { cargarCensos } from './censos.js';
import { d3, esc, entero, decimal, cifra, marca, MARCAS, formaD, esHueca, esFirme, trazoDe, traza, tip, sinTip, alAncho, tramas, ejeAnios } from './util.js';
import { curvaInd } from './poblacion.js';

const VERDE = '#007a3d', GRIS = '#6b6b6b', ALMAGRE = '#a3412a';
const TERMINO = new Set(['segregacion', 'division', 'incorporacion', 'fusion', 'transferencia_parcial', 'segregacion_temporal', 'restitucion', 'nueva_fundacion']);
const peor = (...fs) => ['2', '1', '4', '5', '3', '0'].find(m => fs.includes(m)) || '.';
const ritmo = (v0, v1, n) => (v0 > 0 && v1 > 0 ? (Math.pow(v1 / v0, 1 / n) - 1) * 100 : null);

// cifras de cada censo, ordenadas: solo observadas y de quien era municipio en esa fecha
const memoCenso = new Map();
function censoOrdenado(Cz, a) {
  if (!memoCenso.has(a)) {
    const xs = [];
    for (const fila of Cz.tabla.values()) { const c = fila.get(a); if (c.tipo === 'propio' || c.tipo === 'termino') xs.push(c.v); }
    xs.sort(d3.ascending);
    memoCenso.set(a, { ord: xs, n: xs.length, med: d3.quantileSorted(xs, .5) });
  }
  return memoCenso.get(a);
}

export async function prepararComparada(ctx, Pb) {
  const Cz = await cargarCensos(ctx.municipios);
  const puestos = CENSOS.map(a => {
    const q = Pb.cen.find(x => x.a === a), C = censoOrdenado(Cz, a);
    if (!q) return { a, v: null, f: '.', n: C.n, med: C.med };
    const sobre = C.n - d3.bisectRight(C.ord, q.v);
    return { a, v: q.v, f: q.f, puesto: sobre + 1, n: C.n, med: C.med, veces: q.v / C.med };
  });
  // tramos entre censos observados seguidos del municipio, desde 1877 (1857 y 1860 cuentan población de hecho)
  const obs = Pb.cen.filter(x => x.a >= 1877), tramos = [];
  const de = (S, a) => S.find(x => x.a === a) || {};
  for (let i = 1; i < obs.length; i++) {
    const p = obs[i - 1], q = obs[i];
    if (ctx.ex.huecos.some(h => h.desde <= q.a && h.hasta >= p.a)) continue;
    const n = q.a - p.a, A0 = de(Pb.andS, p.a), A1 = de(Pb.andS, q.a), P0 = de(Pb.provS, p.a), P1 = de(Pb.provS, q.a);
    const cambio = ((ctx.hist && ctx.hist.rel) || []).some(r => ACEPTADA.has(r.e) && TERMINO.has(r.t) && r.d != null && +r.d < q.a && +r.h > p.a) || p.tipo !== q.tipo;
    tramos.push({
      a0: p.a, a1: q.a, r: ritmo(p.v, q.v, n), rA: ritmo(A0.v, A1.v, n), rP: ritmo(P0.v, P1.v, n),
      fA: peor(A0.f, A1.f), fP: peor(P0.f, P1.f), cambio, termino: p.tipo === 'termino' || q.tipo === 'termino', salto: CENSOS.indexOf(q.a) !== CENSOS.indexOf(p.a) + 1,
    });
  }
  const conA = tramos.filter(t => t.rA != null), mas = conA.filter(t => t.r > t.rA).length;
  const conP = tramos.filter(t => t.rP != null), masP = conP.filter(t => t.r > t.rP).length;
  const ini = obs.find(x => x.a === 1900) || obs[0] || null, fin = obs[obs.length - 1] || null;
  let total = null;
  if (ini && fin && ini.a !== fin.a) {
    const A0 = de(Pb.andS, ini.a), A1 = de(Pb.andS, fin.a), P0 = de(Pb.provS, ini.a), P1 = de(Pb.provS, fin.a);
    total = { a0: ini.a, a1: fin.a, m: fin.v / ini.v, A: A0.v && A1.v ? A1.v / A0.v : null, P: P0.v && P1.v ? P1.v / P0.v : null, fA: peor(A0.f, A1.f), fP: peor(P0.f, P1.f) };
  }
  return { puestos, tramos, mas, nA: conA.length, masP, nP: conP.length, total, ult: [...puestos].reverse().find(x => x.puesto) || null, pri: puestos.find(x => x.puesto) || null };
}

export const fraseTipico = q => (q.veces >= 1
  ? `${decimal(q.veces)} veces la población del municipio típico`
  : `el ${q.veces < .1 ? decimal(q.veces * 100) : entero(q.veces * 100)} % de la población del municipio típico`);

export function textoPobComp(C) {
  const t = [];
  if (C.ult) t.push(`<p>En ${C.ult.a} tiene <b class="ma-c">${fraseTipico(C.ult)}</b> (la mediana de los municipios, ${entero(C.ult.med)} habitantes). Es el <b class="ma-c">${entero(C.ult.puesto)}.º</b> de ${entero(C.ult.n)}${C.pri && C.pri.a !== C.ult.a ? `; en ${C.pri.a} era el ${entero(C.pri.puesto)}.º de ${entero(C.pri.n)}` : ''}.</p>`);
  if (C.total && C.total.A != null) t.push(`<p>De ${C.total.a0} a ${C.total.a1} ${C.total.m > C.total.A ? 'creció más' : 'creció menos'} que Andalucía: ×${decimal(C.total.m)} frente a ×${decimal(C.total.A)}${marca(C.total.fA)}${C.total.P != null ? ` (su provincia, ×${decimal(C.total.P)}${marca(C.total.fP)})` : ''}.</p>`);
  if (C.nA) t.push(`<p>Creció más que Andalucía en <b class="ma-c">${C.mas} de ${C.nA}</b> tramos entre censos, y más que su provincia en ${C.masP} de ${C.nP}.</p>`);
  return t.join('') || '<p>No hay censos observados con los que compararlo.</p>';
}

export function pintarPobComp(caja, C, Pb, ctx) {
  let modo = 'cre', ancho = 0;
  caja.innerHTML = `<div class="ma-conmuta" role="group" aria-label="Qué comparación se ve">
      <button type="button" data-v="cre" aria-pressed="true">Ritmo por tramos</button><button type="button" data-v="pue" aria-pressed="false">Su puesto</button><button type="button" data-v="ind" aria-pressed="false">Índice</button>
    </div><div class="ma-graf ma-pcomp"></div><p class="ma-pie ma-pcomp-pie"></p>`;
  const g = caja.querySelector('.ma-pcomp'), pie = caja.querySelector('.ma-pcomp-pie');
  const PIES = {
    cre: 'Crecimiento medio anual entre dos censos con cifra observada del municipio, desde 1877. Columna: el municipio. Raya negra: Andalucía; gris: su provincia; discontinua si esa cifra lleva parte estimada. Un triángulo avisa de que su término cambió en ese tramo.',
    pue: 'Su puesto entre los municipios con cifra observada en cada censo (1.º, el más poblado), en escala logarítmica. El número de municipios cambia de un censo a otro. No se une donde no hay cifra observada.',
    ind: `Solo años de censo${Pb.base ? `, ${Pb.base.a} = 100` : ''}, en escala logarítmica. Línea discontinua: cifra estimada o con parte estimada.`,
  };
  const pinta = w => {
    ancho = w;
    if (modo === 'cre') ritmos(g, C, w); else if (modo === 'pue') puestos(g, C, ctx, w); else curvaInd(g, Pb, ctx, w);
    pie.textContent = PIES[modo];
  };
  caja.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => {
    modo = b.dataset.v;
    caja.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    pinta(ancho || g.clientWidth);
  }));
  alAncho(g, pinta);
}

function ritmos(g, C, W) {
  g.innerHTML = '';
  if (!C.tramos.length) { g.innerHTML = '<p class="ma-pie">No hay dos censos seguidos con cifra observada desde 1877.</p>'; return; }
  const H = Math.max(280, Math.min(400, W * .56)), m = { t: 12, r: 16, b: 30, l: 42 };
  const vals = C.tramos.flatMap(t => [t.r, t.rA, t.rP]).filter(v => v != null);
  const y = d3.scaleLinear().domain([Math.min(-.5, d3.min(vals)), Math.max(.5, d3.max(vals))]).nice().range([H - m.b, m.t]);
  const x = d3.scaleLinear().domain([C.tramos[0].a0, C.tramos[C.tramos.length - 1].a1]).range([m.l, W - m.r]);
  const svg = d3.select(g).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Crecimiento anual por tramos, frente a Andalucía y su provincia');
  y.ticks(6).forEach(v => {
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('class', v === 0 ? 'ma-base' : 'ma-rej');
    svg.append('text').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('class', 'ma-eje-t').text(`${v > 0 ? '+' : v < 0 ? '−' : ''}${decimal(Math.abs(v))}`);
  });
  ejeAnios(svg, x, H - m.b + 17, W, { dominio: [C.tramos[0].a0, C.tramos[C.tramos.length - 1].a1] });
  for (const t of C.tramos) {
    const a = x(t.a0) + 1, b = x(t.a1) - 1, w = Math.max(1, b - a), g1 = svg.append('g');
    g1.append('rect').attr('x', a).attr('y', Math.min(y(0), y(t.r))).attr('width', w).attr('height', Math.max(.8, Math.abs(y(t.r) - y(0)))).attr('fill', VERDE);
    const raya = (v, f, col) => { if (v == null) return; const l = g1.append('line').attr('x1', a).attr('x2', b).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', col).attr('stroke-width', 2); if (!esFirme(f)) l.attr('stroke-dasharray', w < 14 ? '2 1.5' : trazoDe(f)); };
    raya(t.rP, t.fP, '#9a9a94');
    raya(t.rA, t.fA, '#101010');
    if (t.cambio) g1.append('path').attr('d', `M${(a + b) / 2 - 3.5},${H - m.b + 2}h7l-3.5,-5Z`).attr('fill', ALMAGRE);
    g1.append('rect').attr('x', a).attr('y', m.t).attr('width', w).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', ev => tip(`<b>${t.a0}-${t.a1}</b>${t.salto ? ' (entre medias, censos sin cifra observada)' : ''}<br>Municipio: ${s(t.r)} al año<br>Andalucía: ${t.rA == null ? 'sin cifra' : `${s(t.rA)} ${marca(t.fA)}`}<br>Provincia: ${t.rP == null ? 'sin cifra' : `${s(t.rP)} ${marca(t.fP)}`}${t.termino ? '<br>Con el censo de su término de entonces.' : ''}${t.cambio ? '<br>Su término cambió en este tramo.' : ''}`, ev))
      .on('pointerleave', sinTip);
  }
}
const s = v => `${v >= 0 ? '+' : '−'}${decimal(Math.abs(v))} %`;

function puestos(g, C, ctx, W) {
  g.innerHTML = '';
  const pts = C.puestos.map(p => ({ a: p.a, v: p.puesto || null, f: p.puesto ? '0' : '.', p }));
  const con = pts.filter(d => d.v != null);
  if (!con.length) { g.innerHTML = '<p class="ma-pie">No tiene puesto en ningún censo con cifra observada.</p>'; return; }
  const H = Math.max(280, Math.min(400, W * .56)), m = { t: 16, r: W < 480 ? 44 : 56, b: 28, l: 46 };
  const nMax = d3.max(C.puestos, p => p.n);
  const y = d3.scaleLog().domain([1, nMax]).range([m.t, H - m.b]);
  const x = d3.scaleLinear().domain([1857, 2021]).range([m.l, W - m.r]);
  const svg = d3.select(g).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', `Puesto de ${ctx.nombre} entre los municipios en cada censo`);
  [1, 3, 10, 30, 100, 300, 700].filter(v => v <= nMax).forEach(v => {
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('class', 'ma-rej');
    svg.append('text').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('class', 'ma-eje-t').text(`${v}.º`);
  });
  ejeAnios(svg, x, H - m.b + 17, W, { dominio: [1857, 2021] });
  traza(svg.append('g'), pts, x, y, VERDE, 2.6);
  con.forEach(d => svg.append('circle').attr('cx', x(d.a)).attr('cy', y(d.v)).attr('r', 3.6).attr('fill', VERDE)
    .on('pointermove', ev => tip(`<b>Censo de ${d.a}</b><br>${entero(d.v)}.º de ${entero(d.p.n)}<br>${entero(d.p.v)} habitantes; mediana de los municipios, ${entero(d.p.med)}`, ev)).on('pointerleave', sinTip));
  const u = con[con.length - 1];
  svg.append('text').attr('x', x(u.a) + 7).attr('y', y(u.v) + 4).attr('class', 'ma-eti-fin').style('fill', VERDE).style('font-weight', 700).text(`${entero(u.v)}.º`);
}

// ---------------------------------------------------------------- líneas de un indicador frente a Andalucía y su provincia
export function lineasComparadas(el, { series, rot = a => a, unidad = '', cero = true, sinPuntos = false, dominio = null, compacto = false, avisos = null }) {
  alAncho(el, W => {
    el.innerHTML = '';
    const anios = [...new Set(series.flatMap(S => S.pts.filter(p => p.v != null).map(p => p.a)))].sort(d3.ascending);
    if (!anios.length) { el.innerHTML = '<p class="ma-pie">Sin cifras.</p>'; return; }
    const H = compacto ? 152 : Math.max(200, Math.min(280, W * .42)), m = { t: 10, r: compacto ? 82 : W < 480 ? 78 : 104, b: 24, l: 38 };
    const vals = series.flatMap(S => S.pts.map(p => p.v)).filter(v => v != null);
    const y = d3.scaleLinear().domain([cero ? 0 : d3.min(vals), d3.max(vals) * 1.06 || 1]).nice().range([H - m.b, m.t]);
    const dom = dominio || d3.extent(anios);
    const x = dom[1] > dom[0] ? d3.scaleLinear().domain(dom).range([m.l + 4, W - m.r]) : () => (m.l + W - m.r) / 2;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Serie del municipio frente a Andalucía y su provincia');
    y.ticks(4).forEach(v => {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('class', v === 0 ? 'ma-base' : 'ma-rej');
      svg.append('text').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('class', 'ma-eje-t').text(entero(v));
    });
    // eje de años a escala real: fechas redondas si son muchas; si son pocas, las suyas
    if (dom[1] > dom[0]) ejeAnios(svg, x, H - m.b + 17, W, { dominio: dom, fechas: anios.length <= 9 ? anios : null, rot, minPx: 32 });
    else svg.append('text').attr('x', x(dom[0])).attr('y', H - m.b + 17).attr('text-anchor', 'middle').attr('class', 'ma-eje-t').text(rot(dom[0]));
    for (const S of [...series].reverse()) {
      const pts = S.pts.filter(p => anios.includes(p.a));
      traza(svg.append('g'), pts, x, y, S.c, S.w || 1.7);
      if (!sinPuntos) pts.filter(p => p.v != null).forEach(p => {
        const col = p.f === '2' ? '#b9770e' : S.c;
        svg.append('path').attr('d', formaD(p.f, x(p.a), y(p.v), S.w > 2 ? 3.6 : 2.6)).attr('fill', esHueca(p.f) ? '#fff' : col).attr('stroke', col).attr('stroke-width', 1.2)
          .on('pointermove', ev => tip(`<b>${esc(S.t)} · ${rot(p.a)}</b><br>${decimal(p.v)}${unidad ? ` ${esc(unidad)}` : ''} ${marca(p.f)} ${MARCAS[p.f] || ''}${avisos && avisos[p.a] ? `<br>${esc(avisos[p.a])}` : ''}`, ev)).on('pointerleave', sinTip);
      });
    }
    if (avisos) for (const a of Object.keys(avisos).map(Number)) if (anios.includes(a)) svg.append('text').attr('x', x(a) + 7).attr('y', m.t + 3).attr('class', 'ma-eti-rev').text(`${rot(a)}: en revisión`);
    const fin = series.map(S => { const u = [...S.pts].reverse().find(p => p.v != null); return u ? { t: S.t, c: S.c, Y: y(u.v), X: x(u.a), w: S.w } : null; }).filter(Boolean).sort((a, b) => a.Y - b.Y);
    for (let i = 1; i < fin.length; i++) if (fin[i].Y - fin[i - 1].Y < 13) fin[i].Y = fin[i - 1].Y + 13;
    for (let i = fin.length - 1; i >= 0; i--) fin[i].Y = Math.min(fin[i].Y, H - m.b - 3 - (fin.length - 1 - i) * 13);
    fin.forEach(e => {
      const max = compacto || W < 480 ? 11 : 14, t = e.t.length > max ? `${e.t.slice(0, max - 1)}…` : e.t;
      svg.append('text').attr('x', e.X + 6).attr('y', e.Y + 4).attr('class', 'ma-eti-fin').style('fill', e.c).style('font-weight', e.w > 2 ? 700 : 500).text(t).append('title').text(e.t);
    });
  });
}
export { tramas, cifra, GRIS };

// ---------------------------------------------------------------- qué tiene de particular (dos o tres frases, solo cifras)
export function fraseParticular(ctx, { comp, lq, voto, dis }) {
  const f = [];
  if (comp && comp.ult) {
    let x = `${esc(ctx.nombre)} tiene ${fraseTipico(comp.ult)} (${entero(comp.ult.puesto)}.º de ${entero(comp.ult.n)} en ${comp.ult.a})`;
    if (comp.total && comp.total.A != null) x += ` y desde ${comp.total.a0} ha crecido ${comp.total.m > comp.total.A ? 'más' : 'menos'} que Andalucía: ×${decimal(comp.total.m)} frente a ×${decimal(comp.total.A)}`;
    f.push(`${x}.`);
  }
  if (lq) f.push(`${lq.frase}`);
  if (dis && (dis.pos.pct >= 90 || dis.pos.pct <= 10)) f.push(`En ${dis.a}, el ${decimal(dis.v)} % de su población vive en diseminado: el ${entero(dis.pos.puesto)}.º de ${entero(dis.pos.n)} municipios.`);
  else if (voto) f.push(voto);
  return f.slice(0, 3).join(' ');
}
