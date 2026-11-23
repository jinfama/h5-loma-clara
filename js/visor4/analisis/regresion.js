// regresion.js — modo «Regresión múltiple»: Y frente a 1-4 X por mínimos cuadrados (ponderados si se pide), con
// coeficientes, errores típicos, IC 95 %, coeficientes tipificados, R² ajustado, VIF y el mapa de residuos con su
// I de Moran (si los residuos se agrupan en el espacio, los errores típicos de MCO se quedan cortos).

/* global d3 */
import * as X from './cruce.js';
import * as E from './estadistica.js';
import { h, esc, num, sig, r2, pTxt, entero, valorTxt, corto, nombreProv, seg, csv, cajaUtil } from './comun.js';
import { INFO } from './ayuda.js';
import * as EL from './escala.js';
import { seccionLog, resumenLog, avisoLog, conLog, ConLog } from './ejes.js';
import { botonIndicador } from './selector.js';
import { pintarMapa, aspectoMapa } from './mapa.js';
import { yPorDefecto } from './dispersion.js';
import { calcula } from './moran.js';

const MAXX = 4;
const EXTRA = ['geo_altitud_mean', 'poblacion_densidad', 'empleo_pct_agricultura', 'usos_olivar_pct', 'clima_prec', 'usos_labor_pct', 'geo_dist_costa_punto_interior_km'];
const RG = { ultimo: null, mapa: null };

function spec(S) {
  const x1 = S.A.ax, nivel = S.nivelDatos();
  const ok = id => { const e = S.ctx.datos.indicador(id); return X.analizable(e) && X.enNivel(e, nivel); };
  const y = yPorDefecto(S, x1, nivel);
  let xs = S.A.arx ? S.A.arx.split(',').filter(id => ok(id) && id !== y) : [];
  if (!xs.length) {
    const e1 = S.ctx.datos.indicador(x1), ey = S.ctx.datos.indicador(y);
    const casa = id => ok(id) && X.compartenAnio(e1, S.ctx.datos.indicador(id), S.interp, S.ventana) && X.compartenAnio(ey, S.ctx.datos.indicador(id), S.interp, S.ventana);
    xs = [EXTRA.find(id => id !== x1 && id !== y && casa(id)) || EXTRA.find(id => id !== x1 && id !== y && ok(id))].filter(Boolean);
  }
  xs = [x1, ...xs.filter(id => id !== x1)].slice(0, MAXX);
  const logs = new Set((S.A.alg || '').split(',').filter(Boolean));
  return { y, xs, logs };
}
const nombreVar = (S, id, logs) => { const e = S.ctx.datos.indicador(id); return logs.has(id) ? `log ${corto(e)}` : corto(e); };

export const regresion = {
  aniosPropios: true,
  plan(S) { const s = spec(S); return s.y ? { ids: [...s.xs, s.y], ancla: s.y } : { error: 'No hay indicador Y con cifras por esta unidad territorial.' }; },
  titulo(S) {
    const s = spec(S), ey = S.ctx.datos.indicador(s.y);
    if (!ey) return null;
    const sub = `Y: ${corto(ey)} · X: ${s.xs.map(id => corto(S.ctx.datos.indicador(id))).join(', ')}`;
    const ny = ConLog(ey, s.logs.has(s.y)), nLog = s.xs.filter(id => s.logs.has(id)).length, enLog = nLog ? ` (${nLog === s.xs.length ? 'todas' : nLog} en log)` : '';
    // con años distintos, cada una con el suyo: «Rendimiento (1752) frente a explotaciones de 50 ha o más (1960)»
    if (S.difAnios() && S.vars.length === s.xs.length + 1) {
      const us = S.etiquetas(), k = s.xs.length;
      return { t: k === 1 ? `${S.conAnio(1, ny, us)} frente a ${S.conAnio(0, conLog(S.ctx.datos.indicador(s.xs[0]), s.logs.has(s.xs[0])), us)}` : `${S.conAnio(k, ny, us)} frente a ${k} variables${enLog} (${us.slice(0, k).join(', ')})`, s: sub };
    }
    if (s.xs.length === 1) return { t: `${ny} frente a ${conLog(S.ctx.datos.indicador(s.xs[0]), s.logs.has(s.xs[0]))}${S.anio != null ? ', ' + S.anio : ''}`, s: sub };
    return { t: `${ny} frente a ${s.xs.length} variables${enLog}${S.anio != null ? ', ' + S.anio : ''}`, s: sub };
  },
  ejesTitulo: 'Logaritmos',
  ejes(S) { const s = spec(S); return seccionLog(S, { ...s, valores: v => S.valoresLog(v), que: 'unidad', ques: 'unidades', extra: 'Aquí no hay un eje con la cifra de cada variable: el logaritmo cambia el modelo.' }); },
  resumenEjes(S) { return resumenLog(S, spec(S)); },
  panel(S) {
    const s = spec(S), x1 = S.A.ax, nivel = S.nivelDatos();
    const filas = s.xs.map(id => {
      const e = S.ctx.datos.indicador(id);
      return h('li', { class: 'an-p-li' }, h('span', { class: 'an-p-li__n' }, corto(e)),
        s.xs.length > 1 ? h('button', { type: 'button', class: 'an-p-li__x', 'aria-label': 'Quitar ' + corto(e), title: 'Quitar', onclick: () => (id === x1 ? S.setA({ ax: s.xs.find(q => q !== x1), arx: s.xs.filter(q => q !== x1).slice(1).join(',') }) : S.setA({ arx: s.xs.filter(q => q !== id && q !== x1).join(',') })) }, '×') : null,
        S.controlAnio(id));
    });
    return [
      { t: 'Lo que se explica (Y)', n: [h('div', { class: 'an-p-fila' }, botonIndicador(S, { letra: 'Y', valor: s.y, nivel, excluir: s.xs, titulo: 'Lo que se explica', clase: 'an-ind--y', alElegir: v => S.setA({ ay: v }, { historial: true }) })), S.controlAnio(s.y)] },
      { t: 'Con qué (X, de 1 a 4)', n: [h('ul', { class: 'an-p-lista' }, ...filas),
        s.xs.length < MAXX ? botonIndicador(S, { valor: '', nivel, vacio: 'Añadir X…', excluir: [...s.xs, s.y], titulo: 'Añadir variable explicativa', alElegir: v => { if (v) S.setA({ arx: [...s.xs.filter(q => q !== x1), v].join(',') }); } }) : null] },
    ];
  },
  ajustes(S) { return [{ t: 'Regresión', n: [seg('Ponderar', [['', 'No'], ['pob', 'Pobl.', 'Por habitantes'], ['sup', 'Superf.', 'Por superficie oficial']], S.A.apond, v => S.setA({ apond: v }), { titulo: 'Sin ponderar, cada unidad pesa igual', info: INFO.ponderar })] }]; },
  descargas: S => [h('button', { type: 'button', class: 'an-btn', onclick: () => exportarFilas(S) }, 'CSV de unidades'), h('button', { type: 'button', class: 'an-btn', onclick: () => exportarRes(S) }, 'CSV de coeficientes')],
  async pintar(S, cancelado) {
    const s = spec(S), nivel = S.nivelDatos();
    const cr = await X.cruzar(S.ctx, S.vars, nivel, S.anio, S.ventana);
    if (cancelado()) return;
    if (!cr) { S.sinUnidades(null, null); return; }
    const ids = S.vars.map(v => v.id);
    const logArr = ids.map(id => s.logs.has(id));
    const pw = S.A.apond ? await X.pesos(S.ctx, S.A.apond, nivel, cr) : null;
    const f = X.filtrar(cr, { ...S.opcionesFiltro(), log: logArr, pesos: pw ? pw.mapa : null });
    if (S.sinUnidades(cr, f, s.xs.length + 2)) return;
    const t = (v, j) => (logArr[j] ? Math.log10(v) : v);
    const iy = ids.length - 1;
    const y = f.dentro.map(r => t(r.vals[iy].v, iy));
    const xs = s.xs.map((_, j) => f.dentro.map(r => t(r.vals[j].v, j)));
    const w = pw ? f.dentro.map(r => r.w) : null;
    const k = xs.length;
    const res = f.dentro.length > k + 1 ? E.mcoMultiple(y, xs, w) : { error: `Hacen falta más de ${k + 1} unidades (hay ${f.dentro.length}).` };
    let mres = null;
    if (!res.error && nivel !== 'provincia') {
      const clave = JSON.stringify(['res', ids, [...s.logs], nivel, S.anio, S.opcionesFiltro(), S.A.apond]);
      const R = calcula(cr, f.dentro.map((r, i) => ({ ...r, _e: res.resid[i] })), r => r._e, clave);
      mres = R.m && !R.m.error ? R : null;
    }
    RG.ultimo = { s, cr, f, res, pw, mres, logArr };
    if (res.error) { S.vacio(res.error); S.pintaCuenta(f.cuenta, S.vars); return; }
    dibuja(S);
    resultados(S);
    S.pintaCuenta(f.cuenta, S.vars, { extra: pw ? `ponderado por ${pw.texto}` : '' });
  },
  redibujar(S) { if (RG.ultimo && !RG.ultimo.res.error) dibuja(S); },
  seleccion(S) { if (RG.mapa) RG.mapa.repintar(RG.relleno, S.ctx.estado.sel); },
  destruir() { RG.mapa = null; RG.ultimo = null; },
};

// residuos en 7 clases divergentes y simétricas alrededor de 0 (en desviaciones típicas del error)
export const CLASES_RES = [
  { hasta: -2, color: '#8e2f1f', txt: '2 o más por debajo' },
  { hasta: -1, color: '#c4644c', txt: 'de 1 a 2 por debajo' },
  { hasta: -0.5, color: '#e6b3a5', txt: 'de 0,5 a 1 por debajo' },
  { hasta: 0.5, color: '#ecebe6', txt: 'cerca del modelo (±0,5)' },
  { hasta: 1, color: '#a9c3dd', txt: 'de 0,5 a 1 por encima' },
  { hasta: 2, color: '#5a8bbd', txt: 'de 1 a 2 por encima' },
  { hasta: Infinity, color: '#1f4f86', txt: '2 o más por encima' },
];
export const claseRes = e => CLASES_RES.findIndex((c, i) => (i === 0 ? e <= c.hasta : i === CLASES_RES.length - 1 ? e > CLASES_RES[i - 1].hasta : e > CLASES_RES[i - 1].hasta && e <= c.hasta));

async function dibuja(S) {
  const { s, cr, f, res } = RG.ultimo;
  const graf = S.ui.graf;
  graf.textContent = '';
  const nombres = ['Constante', ...s.xs.map(id => nombreVar(S, id, s.logs))];
  const fila = (j) => h('tr', { class: j === 0 ? 'is-const' : null },
    h('th', { scope: 'row' }, nombres[j]),
    h('td', {}, sig(res.coef[j])), h('td', {}, sig(res.se[j])), h('td', {}, num(res.t[j], 2)),
    h('td', { class: res.p[j] < 0.05 ? 'is-sig' : null }, pTxt(res.p[j])),
    h('td', { class: 'an-ic' }, `${sig(res.ic[j][0])} a ${sig(res.ic[j][1])}`),
    h('td', {}, j ? num(res.beta[j - 1], 2) : ''),
    h('td', { class: j && res.vif && res.vif[j - 1] > 5 ? 'is-aviso' : null }, j && res.vif ? num(res.vif[j - 1], 1) : ''));
  const tabla = h('table', { class: 'an-tabla' },
    h('caption', {}, `${nombreVar(S, s.y, s.logs)} · ${S.anio} · ${entero(res.n)} unidades`),
    h('thead', {}, h('tr', {}, ...['', 'Coeficiente', 'Error típico', 't', 'p', 'IC 95 %', 'β tipificado', 'VIF'].map(x => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, ...nombres.map((_, j) => fila(j))));
  // rejilla que llena el alto: tabla arriba; debajo, coeficientes | mapa (con su leyenda pegada); si sobra alto,
  // una tercera fila con los residuos frente a lo que da el modelo
  const tablaBox = h('div', { class: 'an-reg__tabla' }, tabla);
  const beta = h('div', { class: 'an-reg__beta' });
  const ley = h('div', { class: 'an-reg__ley' });
  const caja = h('div', { class: 'an-reg__caja' });
  const mapa = h('div', { class: 'an-reg__mapa' }, ley, caja);
  const disp = h('div', { class: 'an-reg__disp' });
  const raiz = h('div', { class: 'an-reg' }, tablaBox, h('div', { class: 'an-reg__fila' }, beta, mapa), disp);
  graf.append(raiz);
  const app = graf.closest('.an-app'), movil = (app ? app.clientWidth : graf.clientWidth) <= 760;   // igual que la regla de la hoja de estilo
  const H = graf.clientHeight, W = graf.clientWidth;
  const altoTabla = Math.ceil(tablaBox.scrollHeight + 1);   // la tabla entera (con su borde), mida lo que mida la rejilla
  if (!movil) {
    const anchoMapa = Math.max(240, W * 0.6 - 8);
    const natural = anchoMapa * (await aspectoMapa()) + 64;       // el mapa a su ancho, más su leyenda
    const resto = H - altoTabla;
    const fila2 = Math.max(240, Math.min(resto, natural));
    const sobra = resto - fila2;
    raiz.style.gridTemplateRows = sobra >= 200 ? `${altoTabla}px ${fila2}px minmax(0, 1fr)` : `${altoTabla}px minmax(250px, 1fr)`;   // nunca por debajo de 250: antes, desplazar
    disp.hidden = sobra < 200;
  } else disp.hidden = false;
  dibujaBeta(S, beta, nombres.slice(1), res);
  // mapa de residuos tipificados, por clases
  const sd = res.s;
  const pos = new Map(f.dentro.map((r, i) => [r.id, i]));
  const todas = new Map(cr.filas.map(r => [r.id, r]));
  const cuenta = CLASES_RES.map(() => 0);
  f.dentro.forEach((r, i) => { cuenta[claseRes(res.resid[i] / sd)]++; });
  RG.relleno = id => {
    const i = pos.get(id), r = todas.get(id);
    if (i == null) return r && r.vals.every(v => v.v != null) ? { color: '#f4f4f2', titulo: `${r.nombre}: fuera` } : null;
    const e = res.resid[i] / sd;
    return { color: CLASES_RES[claseRes(e)].color, trama: r.res ? 'res' : r.est ? 'est' : null, titulo: `${r.nombre}: residuo ${num(e, 2)} desv.` };
  };
  if (mapa.clientWidth >= 560 || movil) {
    ley.replaceChildren(h('p', { class: 'an-reg__ley-t' }, 'Residuo: Y real frente a lo que da el modelo, en desviaciones típicas'),
      h('ul', { class: 'an-ley an-ley--res' }, ...CLASES_RES.map((c, q) => h('li', {}, h('i', { class: 'an-sw', style: `background:${c.color}` }), `${c.txt} `, h('small', {}, `(${entero(cuenta[q])})`)))));
  } else {
    // estrecho: las mismas siete clases en una tira, con cuántas unidades caen en cada una y sus cortes debajo
    const cortes = ['−2', '−1', '−0,5', '0,5', '1', '2'];
    ley.replaceChildren(h('p', { class: 'an-reg__ley-t', title: 'Residuo: Y real frente a lo que da el modelo, en desviaciones típicas' }, 'Residuo, en desviaciones típicas (unidades en cada clase)'),
      h('div', { class: 'an-pasos' }, ...CLASES_RES.map((c, q) => h('span', { class: 'an-pasos__c' + (q === 0 || q === CLASES_RES.length - 1 ? ' is-osc' : ''), style: `background:${c.color}`, title: `${c.txt}: ${entero(cuenta[q])}` }, entero(cuenta[q])))),
      h('div', { class: 'an-pasos__m' }, ...cortes.map((t, q) => h('span', { style: `left:${((q + 1) / CLASES_RES.length) * 100}%` }, t))),
      h('div', { class: 'an-pasos__ext' }, h('span', {}, '← Y real por debajo del modelo'), h('span', {}, 'por encima →')));
  }
  RG.mapa = await pintarMapa(caja, cr.uni, {
    relleno: RG.relleno, sel: S.ctx.estado.sel, etiqueta: 'Mapa de residuos de la regresión',
    alPasar: (id, ev) => {
      const r = todas.get(id), i = pos.get(id); if (!r) return;
      let html = `<strong>${esc(r.nombre)}</strong>${r.prov ? `<div class="an-tt-m">${esc(nombreProv(r.prov))}</div>` : ''}`;
      S.vars.forEach((v, j) => { html += `<div class="an-tt-f"><span>${esc(corto(v.ent))}</span><b>${esc(valorTxt(v.ent, r.vals[j].v))}</b></div>`; });
      if (i != null) html += `<div class="an-tt-m">El modelo da ${esc(num(res.fitted[i]))}${s.logs.has(s.y) ? ' (en log)' : ''}; residuo ${num(res.resid[i] / sd, 2)} desv. típicas (${res.resid[i] > 0 ? 'más' : 'menos'} de lo esperado)</div>`;
      S.ctx.tooltip.mostrar(html, ev.clientX, ev.clientY);
    },
    alSalir: () => S.ctx.tooltip.ocultar(),
    alPinchar: id => { const sel = S.ctx.estado.sel; S.ctx.set({ sel: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] }); },
  });
  if (!disp.hidden) dibujaResiduos(S, disp, res, sd, f);
}

/** Residuos frente a lo que da el modelo: si se abren en abanico, los errores no son iguales en todas partes. */
function dibujaResiduos(S, el, res, sd, f) {
  const W = Math.max(260, el.clientWidth - 22), H = Math.max(180, (el.clientHeight || 232) - 12), m = { t: 42, r: 16, b: 34, l: 52 };
  const x = d3.scaleLinear().domain(d3.extent(res.fitted)).nice().range([m.l, W - m.r]);
  const es = res.resid.map(e => e / sd), lim = Math.max(3, d3.max(es, Math.abs));
  const y = d3.scaleLinear().domain([-lim, lim]).range([H - m.b, m.t]).nice();
  const svg = d3.select(el).append('svg').attr('class', 'an-svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Residuos frente a lo que da el modelo');
  svg.append('text').attr('class', 'an-mini-t').attr('x', 8).attr('y', 14).text('Residuos frente a lo que da el modelo');
  svg.append('text').attr('class', 'an-mini-c').attr('x', 8).attr('y', 26).text(W < 560 ? 'en abanico: el error no es igual en todas partes' : 'si se abren en abanico, el error no es igual en todas partes (mira los errores robustos)');
  svg.append('g').attr('class', 'an-rej').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat('')).call(g => g.select('.domain').remove());
  svg.append('line').attr('class', 'an-cero').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(v => num(v)).tickSizeOuter(0));
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(v => sig(v, 3)).tickSizeOuter(0));
  svg.append('text').attr('class', 'an-mini-c').attr('x', W - m.r).attr('y', H - 4).attr('text-anchor', 'end').text('lo que da el modelo →');
  svg.append('g').selectAll('circle').data(es).join('circle').attr('cx', (e, i) => x(res.fitted[i])).attr('cy', e => y(e)).attr('r', 2.4)
    .attr('fill', e => CLASES_RES[claseRes(e)].color).attr('stroke', '#6b6b6b').attr('stroke-width', 0.4)
    .append('title').text((e, i) => `${f.dentro[i].nombre}: ${num(e, 2)} desv.`);
}

function dibujaBeta(S, el, nombres, res) {
  const caja = cajaUtil(el), W = Math.max(220, caja.w || 300), k = nombres.length;
  const H = Math.max(150, caja.h || 0, 80 + k * 48);   // la caja sin su relleno: así no se corta ni el eje ni su rótulo
  const estrecho = W < 330;
  const m = { t: 52, r: 18, b: 46, l: 12 };
  const fila = (H - m.t - m.b) / k;
  const lim = Math.max(0.2, d3.max(res.icBeta.flat().map(Math.abs)) || 1) * 1.08;
  const x = d3.scaleLinear().domain([-lim, lim]).range([m.l, W - m.r]).nice();
  const svg = d3.select(el).append('svg').attr('class', 'an-svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Coeficientes tipificados con su intervalo del 95 %');
  svg.append('text').attr('class', 'an-mini-t').attr('x', m.l).attr('y', 14).text('Cuánto pesa cada X');
  svg.append('text').attr('class', 'an-mini-c').attr('x', m.l).attr('y', 28).text(estrecho ? 'punto: β tipificado; raya: IC del 95 %;' : 'punto: β tipificado; raya: su intervalo del 95 %;');
  svg.append('text').attr('class', 'an-mini-c').attr('x', m.l).attr('y', 40).text('en negro, si p < 0,05');
  svg.append('g').attr('class', 'an-rej').attr('transform', `translate(0,${m.t})`).call(d3.axisBottom(x).ticks(6).tickSize(H - m.t - m.b).tickFormat('')).call(g => g.select('.domain').remove());
  svg.append('line').attr('class', 'an-cero').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b);
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(v => num(v, 1)).tickSize(4));
  svg.append('text').attr('class', 'an-mini-c').attr('x', (m.l + W - m.r) / 2).attr('y', H - 10).attr('text-anchor', 'middle').text(estrecho ? 'desv. típicas de Y por desv. típica de X' : 'cambio de Y, en desv. típicas, por desv. típica de X');
  nombres.forEach((nm, j) => {
    const y0 = m.t + j * fila, cy = y0 + Math.min(fila * 0.62, 34);
    const t = svg.append('text').attr('class', 'an-mz-f').attr('x', m.l).attr('y', y0 + 14).text(nm);
    const n0 = t.node(); if (n0.getComputedTextLength) { let n = nm.length; while (n0.getComputedTextLength() > W - m.l - m.r && n > 6) { n--; t.text(nm.slice(0, n) + '…'); } }
    const sig0 = res.p[j + 1] < 0.05;
    svg.append('line').attr('x1', x(res.icBeta[j][0])).attr('x2', x(res.icBeta[j][1])).attr('y1', cy).attr('y2', cy).attr('stroke', sig0 ? '#101010' : '#8a8a8a').attr('stroke-width', 3);
    svg.append('rect').attr('x', x(res.beta[j]) - 6).attr('y', cy - 6).attr('width', 12).attr('height', 12).attr('class', sig0 ? 'an-b-sig' : 'an-b-ns');
    svg.append('text').attr('class', 'an-mini-c').attr('x', x(res.beta[j])).attr('y', cy - 10).attr('text-anchor', 'middle').text(num(res.beta[j], 2));
  });
}

function resultados(S) {
  const { s, cr, res, pw, mres, f } = RG.ultimo;
  const k = s.xs.length, n = res.n;
  const vifMax = res.vif ? Math.max(...res.vif) : 1;
  const avisos = [];
  if (n < 10 * (k + 1)) avisos.push(`Pocas unidades para ${k + 1} coeficientes (${n}; conviene al menos diez por coeficiente).`);
  if (vifMax > 5) avisos.push(`Hay variables explicativas muy parecidas entre sí (VIF ${num(vifMax, 1)}): sus coeficientes por separado son poco fiables.`);
  if (mres && mres.m.pSim < 0.05 && mres.m.I > 0) avisos.push(`Los residuos se agrupan en el espacio (I de Moran ${num(mres.m.I, 2)}, p ${pTxt(mres.m.pSim)}): los errores típicos de MCO son demasiado optimistas y falta algo con geografía en el modelo.`);
  if (avisoLog(S, s)) avisos.push(avisoLog(S, s));
  if (S.avisoAnios(cr.usados)) avisos.push(S.avisoAnios(cr.usados));
  else if (cr.usados.some((a, j) => !S.vars[j].fijo && a !== S.anio)) avisos.push(`Años distintos: ${S.vars.map((v, j) => `${corto(v.ent)} ${v.fijo ? 'fija' : cr.usados[j]}`).join(' · ')}.`);
  S.ui.res.innerHTML = `
    <div class="an-r__big"><span class="an-r__n">${r2(res.r2aj)}</span><span class="an-r__l">R² ajustado</span></div>
    <dl class="an-dl an-dl--clave"><dt>R²</dt><dd>${r2(res.r2)}</dd><dt>Unidades</dt><dd>${S.nTxt(n)}</dd></dl>
    <p class="an-lectura">Cada coeficiente (tabla) dice cuánto cambia Y, de media, con una unidad más de esa X dejando las demás quietas. Describe cómo van juntas las cifras entre territorios; no explica causas.</p>
    ${avisos.map(a => `<p class="an-nota an-nota--aviso">${esc(a)}</p>`).join('')}
    ${S.mas(`<dl class="an-dl">
      <dt>F</dt><dd>${num(res.F, 2)} · p ${pTxt(res.pF)}</dd>
      <dt>Error típico</dt><dd>${sig(res.s)}</dd>
      <dt>Residuos: I de Moran</dt><dd>${mres ? `${num(mres.m.I, 3)} · p ${pTxt(mres.m.pSim)}` : '—'}</dd>
    </dl>
    <p class="an-nota">${pw ? esc('Ponderada por ' + pw.texto + '.') : 'Sin ponderar: cada unidad pesa igual.'} Con log, los coeficientes van en logaritmos. β tipificado: el coeficiente en desviaciones típicas, para comparar entre X.</p>`)}`;
  S.ponFuentes(S.fuentesCruce(cr, pw ? [{ t: `Peso: ${pw.texto}`, ids: pw.fuentes || [], txt: 'superficie_ha de la base (IECA)' }] : []));
  void f;
}

function exportarFilas(S) {
  const u = RG.ultimo; if (!u) return;
  const ids = S.vars.map(v => v.id);
  const pos = new Map(u.f.dentro.map((r, i) => [r.id, i]));
  const cab = ['id', 'unidad', 'provincia', ...ids.flatMap(id => [`${id}__valor`, `${id}__calculo`, `${id}__valor_en_calculo`, `${id}__anio`, `${id}__marca`]), 'peso', 'entra', 'ajustado', 'residuo'];
  const filas = [cab];
  for (const r of u.cr.filas) {
    const i = pos.get(r.id);
    filas.push([r.id, r.nombre, nombreProv(r.prov), ...r.vals.flatMap((c, j) => [c.v, u.logArr[j] ? 'log10' : 'cifra', EL.transforma(c.v, u.logArr[j]) ?? '', S.vars[j].fijo ? 'fija' : u.cr.usados[j], c.f]), i != null ? (u.pw ? r.w ?? u.pw.mapa.get(r.id) : 1) : '', i != null ? 'sí' : 'no', i != null && !u.res.error ? u.res.fitted[i] : '', i != null && !u.res.error ? u.res.resid[i] : '']);
  }
  filas.push([]);
  S.vars.forEach((v, j) => filas.push([`# fuente original ${v.id}`, (u.cr.fuentes[j] || []).map(q => S.ctx.fuentes.nombreFuente(q)).join('; ')]));
  if (S.avisoAnios(u.cr.usados)) filas.push([`# ${S.avisoAnios(u.cr.usados)}`]);
  csv(`analisis_regresion_unidades__${u.s.y}__${S.nivelDatos()}__${S.anio}.csv`, filas);
}
function exportarRes(S) {
  const u = RG.ultimo; if (!u || u.res.error) return;
  const { s, res } = u;
  const filas = [['variable', 'logaritmo', 'coeficiente', 'error_tipico', 't', 'p', 'ic95_inf', 'ic95_sup', 'beta_tipificado', 'vif']];
  filas.push(['constante', '', res.coef[0], res.se[0], res.t[0], res.p[0], res.ic[0][0], res.ic[0][1], '', '']);
  s.xs.forEach((id, j) => filas.push([id, s.logs.has(id) ? 'log10' : 'no', res.coef[j + 1], res.se[j + 1], res.t[j + 1], res.p[j + 1], res.ic[j + 1][0], res.ic[j + 1][1], res.beta[j], res.vif ? res.vif[j] : '']));
  filas.push([]);
  for (const [k, v] of [['y', `${s.y}${s.logs.has(s.y) ? ' (log10)' : ''}`], ['nivel', S.nivelDatos()], ['anio', S.anio], ['n', res.n], ['r2', res.r2], ['r2_ajustado', res.r2aj], ['F', res.F], ['p_F', res.pF], ['error_tipico_regresion', res.s], ['ponderacion', u.pw ? u.pw.texto : 'ninguna'], ['moran_residuos_I', u.mres ? u.mres.m.I : ''], ['moran_residuos_p', u.mres ? u.mres.m.pSim : '']]) filas.push([k, v]);
  S.vars.forEach((v, j) => filas.push([`fuente_original_${v.id}`, (u.cr.fuentes[j] || []).map(q => S.ctx.fuentes.nombreFuente(q)).join('; ')]));
  S.vars.forEach((v, j) => filas.push([`anio_${v.id}`, v.fijo ? 'fija' : u.cr.usados[j]]));
  if (S.avisoAnios(u.cr.usados)) filas.push(['aviso_anios', S.avisoAnios(u.cr.usados)]);
  csv(`analisis_regresion_coeficientes__${s.y}__${S.nivelDatos()}__${S.anio}.csv`, filas);
}
