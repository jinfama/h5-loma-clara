// moran.js — modo «Autocorrelación espacial»: I de Moran global con prueba por permutaciones y mapa LISA de
// agrupamientos (alto-alto, bajo-bajo, alto entre bajos, bajo entre altos). Vecindad: recintos que comparten un tramo
// de límite en el TopoJSON del nivel (topojson.neighbors), pesos estandarizados por filas.

/* global d3 */
import * as X from './cruce.js';
import * as E from './estadistica.js';
import { h, esc, num, pTxt, entero, valorTxt, corto, nombre, nombreProv, marcaTxt, seg, csv } from './comun.js';
import { INFO } from './ayuda.js';
import { botonIndicador } from './selector.js';
import { pintarMapa } from './mapa.js';

export const LISA = {
  AA: { color: '#d7191c', txt: 'alto-alto', largo: 'alto rodeado de altos' },
  BB: { color: '#2c7bb6', txt: 'bajo-bajo', largo: 'bajo rodeado de bajos' },
  AB: { color: '#fdae61', txt: 'alto-bajo', largo: 'alto rodeado de bajos' },
  BA: { color: '#abd9e9', txt: 'bajo-alto', largo: 'bajo rodeado de altos' },
  ns: { color: '#ecebe6', txt: 'no significativo', largo: 'sin agrupamiento claro' },
};
const PERM = 999, SEMILLA = 20261120;
const MO = { cache: new Map(), mapa: null, ultimo: null };

/** Moran y LISA de una lista de filas (las que entran) sobre la vecindad del nivel. Con caché. */
export function calcula(cr, dentro, valor, clave) {
  if (clave && MO.cache.has(clave)) return MO.cache.get(clave);
  const vecMap = X.vecinos(cr.uni);
  const ids = dentro.map(r => r.id), pos = new Map(ids.map((id, i) => [id, i]));
  const vecinos = ids.map(id => (vecMap.get(id) || []).filter(j => pos.has(j)).map(j => pos.get(j)));
  const sg = E.subgrafo(vecinos, () => true);
  const filas = sg.orden.map(i => dentro[i]);
  const x = filas.map(valor);
  const out = { filas, sinVecinos: sg.sinVecinos.map(i => dentro[i]), vec: sg.vec, n: x.length };
  if (x.length >= 4) { out.m = E.moran(x, sg.vec, { perm: PERM, semilla: SEMILLA }); if (!out.m.error) out.l = E.lisa(x, sg.vec, { perm: PERM, semilla: SEMILLA }); }
  if (clave) { MO.cache.set(clave, out); if (MO.cache.size > 30) MO.cache.delete(MO.cache.keys().next().value); }
  return out;
}
export function umbral(A, ps) { return A.aalfa === 'fdr' ? E.umbralFDR(ps, 0.05) : A.aalfa === '1' ? 0.01 : 0.05; }
const umbralTxt = A => (A.aalfa === 'fdr' ? 'tasa de falsos descubrimientos del 5 % (Benjamini-Hochberg)' : A.aalfa === '1' ? 'p < 0,01' : 'p < 0,05');

export const moranModo = {
  reproducible: true,
  plan(S) { return { ids: [S.A.ax] }; },
  titulo(S) { const e = S.vars[0] && S.vars[0].ent; return e ? { t: `${nombre(e)}: ¿se parecen las vecinas?${S.anio != null ? ' ' + S.anio : ''}`, s: `Indicador: ${corto(e)}${e.unidad && !/\(/.test(corto(e)) ? ' (' + e.unidad + ')' : ''}` } : null; },
  panel(S) {
    return [{ t: 'Variable', n: [botonIndicador(S, { letra: 'X', valor: S.A.ax, nivel: S.nivelDatos(), titulo: 'Indicador', alElegir: v => S.irAInd(v) }),
      h('p', { class: 'an-p-nota' }, 'Vecinas: las unidades que comparten un tramo de límite.')] }];
  },
  ajustes(S) {
    return [{ t: 'Moran', n: [seg('Umbral', [['5', 'p < 0,05'], ['1', 'p < 0,01'], ['fdr', 'FDR 5 %']], S.A.aalfa, v => S.setA({ aalfa: v }), { titulo: 'Con cientos de pruebas a la vez, alguna sale «significativa» por azar: la corrección FDR lo controla', info: INFO.umbral })] }];
  },
  descargas: S => [h('button', { type: 'button', class: 'an-btn', onclick: () => exportar(S) }, 'CSV de unidades'), h('button', { type: 'button', class: 'an-btn', onclick: () => exportarRes(S) }, 'CSV de resultados')],
  async pintar(S, cancelado) {
    const cr = await X.cruzar(S.ctx, S.vars, S.nivelDatos(), S.anio, S.ventana);
    if (cancelado()) return;
    if (!cr) { S.vacio('No hay cifras para este año.'); return; }
    const f = X.filtrar(cr, S.opcionesFiltro());
    const clave = JSON.stringify([S.vars[0].id, S.nivelDatos(), S.anio, S.opcionesFiltro()]);
    const R = calcula(cr, f.dentro, r => r.vals[0].v, clave);
    if (cancelado()) return;
    MO.ultimo = { cr, f, R };
    const graf = S.ui.graf;
    graf.textContent = '';
    const caja = h('div', { class: 'an-mapa-caja' });
    graf.append(caja);
    if (!R.m || R.m.error) { S.vacio(R.m ? R.m.error : `Hacen falta al menos cuatro unidades con vecinas (hay ${R.n}).`); return; }
    const u = umbral(S.A, R.l.p);
    const cat = new Map(R.filas.map((r, i) => [r.id, R.l.p[i] <= u ? R.l.cuad[i] : 'ns']));
    MO.cat = cat; MO.u = u;
    const islas = new Set(R.sinVecinos.map(r => r.id));
    const dentro = new Map(f.dentro.map(r => [r.id, r]));
    const todas = new Map(cr.filas.map(r => [r.id, r]));
    const relleno = id => {
      const r = todas.get(id);
      if (!r || r.vals[0].v == null) return null;
      if (!dentro.has(id)) return { color: '#f4f4f2', titulo: `${r.nombre}: fuera por el filtro o por los ajustes` };
      if (islas.has(id)) return { color: '#ffffff', titulo: `${r.nombre}: sin vecinas con dato, no entra` };
      const c = cat.get(id);
      return { color: LISA[c].color, trama: r.res ? 'res' : r.est ? 'est' : null, titulo: `${r.nombre}: ${LISA[c].largo}` };
    };
    const pos = new Map(R.filas.map((r, i) => [r.id, i]));
    MO.relleno = relleno;
    MO.mapa = await pintarMapa(caja, cr.uni, {
      relleno, sel: S.ctx.estado.sel, etiqueta: `Agrupamientos LISA de ${S.vars[0].ent.rotulo}, ${S.anio}`,
      alPasar: (id, ev) => {
        const r = todas.get(id); if (!r) return;
        const i = pos.get(id);
        let html = `<strong>${esc(r.nombre)}</strong>${r.prov ? `<div class="an-tt-m">${esc(nombreProv(r.prov))}</div>` : ''}<div class="an-tt-f"><span>${esc(corto(S.vars[0].ent))}</span><b>${esc(valorTxt(S.vars[0].ent, r.vals[0].v))}</b></div><div class="an-tt-m">${esc(marcaTxt(r.vals[0].f))}${r.vals[0].res ? ' · ' + esc(r.vals[0].res) : ''}</div>`;
        if (i != null) html += `<div class="an-tt-m">${esc(LISA[cat.get(id)].largo)} · p ${pTxt(R.l.p[i])} · ${R.vec[i].length} vecinas</div>`;
        else if (islas.has(id)) html += '<div class="an-tt-m">Sin vecinas con dato: no entra</div>';
        S.ctx.tooltip.mostrar(html, ev.clientX, ev.clientY);
      },
      alSalir: () => S.ctx.tooltip.ocultar(),
      alPinchar: id => { const sel = S.ctx.estado.sel; S.ctx.set({ sel: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] }); },
    });
    resultados(S, R, u, cat);
    S.pintaCuenta(f.cuenta, S.vars, { extra: R.sinVecinos.length ? `${entero(R.sinVecinos.length)} sin vecinas con dato (no entran en Moran)` : '' });
  },
  seleccion(S) { if (MO.mapa) MO.mapa.repintar(MO.relleno, S.ctx.estado.sel); },
  destruir() { MO.mapa = null; MO.ultimo = null; },
};

function resultados(S, R, u, cat) {
  const el = S.ui.res, m = R.m;
  const cuenta = { AA: 0, BB: 0, AB: 0, BA: 0, ns: 0 };
  for (const c of cat.values()) cuenta[c]++;
  const sig = R.n - cuenta.ns;
  const esperados = S.A.aalfa === 'fdr' ? null : Math.round(R.n * (S.A.aalfa === '1' ? 0.01 : 0.05));
  const signo = m.I > m.EI ? 'las unidades se parecen a sus vecinas más de lo que daría el azar' : 'las unidades se diferencian de sus vecinas más de lo que daría el azar';
  el.innerHTML = `
    <div class="an-r__big"><span class="an-r__n">${num(m.I, 2)}</span><span class="an-r__l">I de Moran</span></div>
    <dl class="an-dl an-dl--clave"><dt>p (999 permutaciones)</dt><dd>${pTxt(m.pSim)}</dd><dt>Unidades</dt><dd>${S.nTxt(R.n)}</dd></dl>
    ${S.textoFiltro() ? '<p class="an-nota an-nota--aviso">Con el filtro, cada unidad solo cuenta con sus vecinas que quedan dentro: las del borde pierden vecinas y los pesos se recalculan sobre las que quedan.</p>' : ''}
    <p class="an-lectura">${m.pSim < 0.05 ? `Con p ${pTxt(m.pSim)}, ${signo}.` : 'No se distingue de lo que daría el azar.'} Sin ningún agrupamiento, I valdría ${num(m.EI, 3)}.</p>
    <p class="an-r__k">Agrupamientos locales · ${esc(umbralTxt(S.A))}</p>
    <ul class="an-ley an-ley--lisa">${['AA', 'BB', 'AB', 'BA', 'ns'].map(k => `<li><i class="an-sw" style="background:${LISA[k].color}"></i><span><b>${LISA[k].txt}: ${entero(cuenta[k])}</b>${k === 'ns' ? '' : `<small>${LISA[k].largo}</small>`}</span></li>`).join('')}
      <li><i class="an-sw an-sw--t-nd"></i>sin dato</li>${R.sinVecinos.length ? '<li><i class="an-sw" style="background:#fff;border:1px solid #bbb"></i>sin vecinas con dato</li>' : ''}</ul>
    <p class="an-nota${esperados != null && sig <= esperados * 1.5 ? ' an-nota--aviso' : ''}">${esperados != null ? `Ojo: con ${entero(R.n)} pruebas a la vez, unas ${entero(esperados)} saldrían «significativas» por puro azar (hay ${entero(sig)}). Para controlarlo, umbral «FDR 5 %» en Ajustes.` : `Umbral corregido por FDR: p ≤ ${pTxt(u)}.`}</p>
    ${S.mas(`<dl class="an-dl">
      <dt>z (permutaciones)</dt><dd>${num(m.zSim, 2)}</dd>
      <dt>p (normal)</dt><dd>${pTxt(m.pRand)}</dd>
      <dt>Vecinas por unidad</dt><dd>${num(R.vec.reduce((s, v) => s + v.length, 0) / R.n, 1)} de media</dd>
    </dl>
    <div class="an-mini-g" data-g="hist"></div>
    <div class="an-mini-g" data-g="disp"></div>
    <p class="an-nota">Vecindad: recintos que comparten un tramo de límite (el TopoJSON simplificado del Atlas). Pesos iguales para todas las vecinas de cada unidad. Permutaciones con semilla fija: el resultado se repite.</p>`)}`;
  S.ponFuentes(S.fuentesCruce(MO.ultimo.cr));
  const det = el.querySelector('.an-mas');
  const minis = () => { const hg = el.querySelector('[data-g="hist"]'); if (hg && !hg.firstChild) { histograma(hg, m); dispersionMoran(S, el.querySelector('[data-g="disp"]'), R, cat); } };
  if (det && det.open) minis(); else if (det) det.addEventListener('toggle', () => { if (det.open) minis(); });
}

function histograma(el, m) {
  const W = Math.max(200, el.getBoundingClientRect().width || 240), H = 86, mg = { t: 16, r: 8, b: 18, l: 8 };
  const ext = d3.extent([...m.sims, m.I]);
  const x = d3.scaleLinear().domain(ext).nice().range([mg.l, W - mg.r]);
  const bins = d3.bin().domain(x.domain()).thresholds(30)(m.sims);
  const y = d3.scaleLinear().domain([0, d3.max(bins, b => b.length)]).range([H - mg.b, mg.t]);
  const svg = d3.select(el).append('svg').attr('class', 'an-svg an-mini').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Reparto de I con las cifras barajadas al azar');
  svg.append('text').attr('class', 'an-mini-t').attr('x', mg.l).attr('y', 10).text('I al barajar las cifras (gris) y la real');
  svg.selectAll('rect').data(bins).join('rect').attr('x', b => x(b.x0) + 0.5).attr('width', b => Math.max(0.5, x(b.x1) - x(b.x0) - 1)).attr('y', b => y(b.length)).attr('height', b => y(0) - y(b.length)).attr('fill', '#bdbdb8');
  svg.append('line').attr('class', 'an-obs').attr('x1', x(m.I)).attr('x2', x(m.I)).attr('y1', mg.t - 2).attr('y2', H - mg.b);
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(0,${H - mg.b})`).call(d3.axisBottom(x).ticks(4).tickFormat(v => num(v, 2)).tickSize(3));
}

function dispersionMoran(S, el, R, cat) {
  const W = Math.max(200, el.getBoundingClientRect().width || 240), H = Math.min(240, W), mg = { t: 18, r: 8, b: 28, l: 30 };
  const sd = Math.sqrt(R.m.z.reduce((s, v) => s + v * v, 0) / R.n);
  const zs = R.m.z.map(v => v / sd), lags = R.m.lag.map(v => v / sd);
  const lim = Math.max(2, d3.max(zs, Math.abs), d3.max(lags, Math.abs)) * 1.05;
  const x = d3.scaleLinear().domain([-lim, lim]).range([mg.l, W - mg.r]), y = d3.scaleLinear().domain([-lim, lim]).range([H - mg.b, mg.t]);
  const svg = d3.select(el).append('svg').attr('class', 'an-svg an-mini').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Diagrama de Moran');
  svg.append('text').attr('class', 'an-mini-t').attr('x', 0).attr('y', 10).text('Cada unidad frente a sus vecinas');
  svg.append('line').attr('class', 'an-cero').attr('x1', x(0)).attr('x2', x(0)).attr('y1', mg.t).attr('y2', H - mg.b);
  svg.append('line').attr('class', 'an-cero').attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', y(0)).attr('y2', y(0));
  svg.append('g').selectAll('circle').data(R.filas).join('circle').attr('cx', (r, i) => x(zs[i])).attr('cy', (r, i) => y(lags[i])).attr('r', 2.2)
    .attr('fill', r => LISA[cat.get(r.id)].color).attr('stroke', r => (cat.get(r.id) === 'ns' ? '#bdbdb8' : 'none')).attr('stroke-width', 0.6)
    .on('mousemove', (ev, r) => S.ctx.tooltip.mostrar(`<strong>${esc(r.nombre)}</strong><div class="an-tt-m">${esc(LISA[cat.get(r.id)].largo)}</div>`, ev.clientX, ev.clientY))
    .on('mouseleave', () => S.ctx.tooltip.ocultar());
  // la pendiente de la recta es la I de Moran
  svg.append('line').attr('class', 'an-recta').attr('x1', x(-lim)).attr('y1', y(-lim * R.m.I)).attr('x2', x(lim)).attr('y2', y(lim * R.m.I));
  svg.append('text').attr('class', 'an-mini-c').attr('x', W - mg.r - 2).attr('y', mg.t + 10).attr('text-anchor', 'end').text('alto-alto');
  svg.append('text').attr('class', 'an-mini-c').attr('x', mg.l + 2).attr('y', H - mg.b - 4).text('bajo-bajo');
  svg.append('text').attr('class', 'an-mini-c').attr('x', W - mg.r - 2).attr('y', H - 4).attr('text-anchor', 'end').text('la unidad →');
  svg.append('text').attr('class', 'an-mini-c').attr('transform', `translate(10,${H - mg.b}) rotate(-90)`).text('sus vecinas →');
}

function exportar(S) {
  const u = MO.ultimo; if (!u) return;
  const R = u.R, pos = new Map(R.filas.map((r, i) => [r.id, i])), islas = new Set(R.sinVecinos.map(r => r.id)), dentro = new Set(u.f.dentro.map(r => r.id));
  const un = umbral(S.A, R.l ? R.l.p : []);
  const fu = (u.cr.fuentes[0] || []).map(i => S.ctx.fuentes.nombreFuente(i)).join('; ');
  const filas = [['id', 'unidad', 'provincia', 'indicador', 'valor', 'anio', 'marca', 'reserva', 'entra', 'n_vecinas', 'media_vecinas', 'I_local', 'p_permutacion', 'cuadrante', 'agrupamiento_significativo', 'fuente_original']];
  for (const r of u.cr.filas) {
    const i = pos.get(r.id);
    filas.push([r.id, r.nombre, nombreProv(r.prov), S.vars[0].id, r.vals[0].v, u.cr.usados[0], marcaTxt(r.vals[0].f), r.vals[0].res || '',
      i != null ? 'sí' : islas.has(r.id) ? 'no: sin vecinas con dato' : dentro.has(r.id) ? 'no' : r.vals[0].v == null ? 'no: sin dato' : 'no: fuera por los filtros',
      i != null ? R.vec[i].length : '', i != null ? R.m.lag[i] + R.filas.reduce((s, q) => s + q.vals[0].v, 0) / R.n : '', i != null && R.l ? R.l.Ii[i] : '', i != null && R.l ? R.l.p[i] : '',
      i != null && R.l ? LISA[R.l.cuad[i]].txt : '', i != null && R.l ? (R.l.p[i] <= un ? LISA[R.l.cuad[i]].txt : 'no') : '', fu]);
  }
  csv(`analisis_lisa__${S.vars[0].id}__${S.nivelDatos()}__${S.anio}.csv`, filas);
}
function exportarRes(S) {
  const u = MO.ultimo; if (!u || !u.R.m) return;
  const m = u.R.m, fo = S.opcionesFiltro();
  const filas = [['clave', 'valor'], ['analisis', 'I de Moran global y LISA'], ['indicador', `${S.vars[0].ent.rotulo} (${S.vars[0].id})`], ['nivel', S.nivelDatos()], ['anio', u.cr.usados[0]],
    ['vecindad', 'contigüidad por tramo de límite compartido (topojson.neighbors), pesos estandarizados por filas'],
    ['estimadas', fo.est ? 'excluidas' : 'incluidas'], ['sumas_parciales', fo.par ? 'excluidas' : 'incluidas'], ['reserva_o_revision', fo.res ? 'excluidas' : 'incluidas'],
    ['unidades', u.R.n], ['sin_vecinas_con_dato', u.R.sinVecinos.length], ['I', m.I], ['E_I', m.EI], ['var_I_normal', m.VIn], ['var_I_aleatorizacion', m.VIr], ['z_aleatorizacion', m.zRand], ['p_aleatorizacion', m.pRand],
    ['permutaciones', m.perm], ['semilla', SEMILLA], ['p_permutacion', m.pSim], ['z_permutacion', m.zSim], ['umbral_lisa', umbralTxt(S.A)],
    ['fuente_original', (u.cr.fuentes[0] || []).map(i => S.ctx.fuentes.nombreFuente(i)).join('; ')]];
  csv(`analisis_moran__${S.vars[0].id}__${S.nivelDatos()}__${S.anio}.csv`, filas);
}
