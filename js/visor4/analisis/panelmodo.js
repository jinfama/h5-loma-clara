// panelmodo.js — modo «Panel»: Y frente a X1…Xk con unidades y años a la vez (MCO agrupado, efectos fijos de unidad,
// de año y dobles, primeras diferencias y efectos aleatorios con el contraste de Hausman). Estimación en panel.js,
// comprobada contra linearmodels (docs/v2/ANALISIS_PRUEBAS.md §5.6).

/* global d3 */
import * as X from './cruce.js';
import * as PN from './panel.js';
import * as AN from './anios.js';
import { seccionLog, resumenLog, avisoLog, conLog, ConLog } from './ejes.js';
import { h, esc, num, sig, r2, pTxt, entero, corto, nombre, nombreMin, seg, csv, botonI, cajaUtil } from './comun.js';
import { INFO } from './ayuda.js';
import { botonIndicador } from './selector.js';
import { yPorDefecto } from './dispersion.js';

const MAXX = 4;
const PM = { ultimo: null };
const lista = s => (s ? s.split(',').filter(Boolean) : []);
const estrellas = p => (p < 0.01 ? '***' : p < 0.05 ? '**' : p < 0.1 ? '*' : '');
const COLM = { mco: '#6b6b6b', feu: '#2a5cda', fea: '#c8ad2f', fe2: '#101010', pd: '#db640e', re: '#9d6fe3' };

function spec(S) {
  const nivel = S.nivelDatos(), x1 = S.A.ax;
  const ok = id => { const e = S.ctx.datos.indicador(id); return X.analizable(e) && X.enNivel(e, nivel); };
  const y = yPorDefecto(S, x1, nivel);
  const xs = [x1, ...lista(S.A.arx).filter(id => ok(id) && id !== y && id !== x1)].slice(0, MAXX);
  return { y, xs, logs: new Set(lista(S.A.alg)) };
}
const nombreVar = (S, id, logs) => { const e = S.ctx.datos.indicador(id); return logs.has(id) ? `log ${corto(e)}` : corto(e); };
/** Años en que todas las variables (que cambian con el tiempo) tienen cifra. */
function aniosComunes(S) {
  const mov = S.vars.filter(v => !v.fijo);
  if (!mov.length) return [];
  return mov[0].usables.filter(a => mov.every(v => v.usables.includes(a)));
}
/** Los años del panel: los comunes, a un solo lado de cualquier cambio de fuente (`sin_interpolar_tramos`), entre desde y hasta. */
function rango(S) {
  const ents = S.vars.filter(v => !v.fijo).map(v => v.ent);
  const corte = AN.aniosSinCruzar(aniosComunes(S), AN.tramosDe(ents));
  const todos = corte.anios, aviso = AN.avisoCorte(corte.fuera, ents);
  if (!todos.length) return { todos, anios: [], aviso };
  const a0 = todos[0], a1 = todos[todos.length - 1], vale = q => (q >= a0 && q <= a1 ? q : null);
  const d = vale(+S.A.apd) ?? a0, hh = vale(+S.A.aph) ?? a1;
  return { todos, anios: todos.filter(a => a >= Math.min(d, hh) && a <= Math.max(d, hh)), aviso };
}

/** Qué modelo se lee (frase, cifra grande, nube): lo mismo que pinchar su columna de la tabla. */
function selModelo(S) {
  const v = S.A.apm || 'fe2';
  const sel = h('select', { class: 'an-select', 'aria-label': 'Modelo que se lee' }, ...PN.MODELOS.map(m => h('option', { value: m.id, selected: m.id === v || null }, m.rotulo || m.corto)));
  sel.value = v;
  sel.addEventListener('change', () => S.setA({ apm: sel.value }));
  return h('div', { class: 'an-p-fila' }, sel, botonI(INFO.modelo, 'Efectos fijos'));
}

export const panelModo = {
  plan(S) {
    if (S.nivelDatos() === 'termino') return { error: 'En municipio histórico las unidades cambian de un corte a otro y no se pueden seguir en el tiempo: para un panel, elige municipio actual, partido judicial o provincia.' };
    const s = spec(S);
    return s.y ? { ids: [...s.xs, s.y], ancla: s.y, tiempo: false } : { error: 'No hay indicador Y con cifras por esta unidad territorial.' };
  },
  titulo(S) {
    const s = spec(S), ey = S.ctx.datos.indicador(s.y);
    const r = S.vars.length ? rango(S).anios : [];
    return ey ? { t: `Panel: ${ConLog(ey, s.logs.has(s.y))} frente a ${s.xs.map(id => conLog(S.ctx.datos.indicador(id), s.logs.has(id))).join(', ')}${r.length ? `, ${r[0]}-${r[r.length - 1]}` : ''}`, s: `Y: ${corto(ey)} · X: ${s.xs.map(id => corto(S.ctx.datos.indicador(id))).join(', ')}` } : null;
  },
  ejesTitulo: 'Logaritmos',
  ejes(S) { const s = spec(S), anios = rango(S).anios; return seccionLog(S, { ...s, valores: v => S.valoresLog(v, { anios }), que: 'cifra', ques: 'cifras', extra: 'Aquí no hay un eje con la cifra de cada variable: el logaritmo cambia el modelo.' }); },
  resumenEjes(S) { return resumenLog(S, spec(S)); },
  panel(S) {
    const s = spec(S), x1 = S.A.ax, nivel = S.nivelDatos();
    const filas = s.xs.map(id => {
      const e = S.ctx.datos.indicador(id);
      return h('li', { class: 'an-p-li' }, h('span', { class: 'an-p-li__n' }, corto(e)),
        s.xs.length > 1 ? h('button', { type: 'button', class: 'an-p-li__x', 'aria-label': 'Quitar ' + corto(e), title: 'Quitar', onclick: () => (id === x1 ? S.setA({ ax: s.xs.find(q => q !== x1), arx: s.xs.filter(q => q !== x1).slice(1).join(',') }) : S.setA({ arx: s.xs.filter(q => q !== id && q !== x1).join(',') })) }, '×') : null);
    });
    return [
      { t: 'Lo que se explica (Y)', n: [h('div', { class: 'an-p-fila' }, botonIndicador(S, { letra: 'Y', valor: s.y, nivel, excluir: s.xs, titulo: 'Lo que se explica', clase: 'an-ind--y', alElegir: v => S.setA({ ay: v }, { historial: true }) }))] },
      { t: 'Con qué (X, de 1 a 4)', n: [h('ul', { class: 'an-p-lista' }, ...filas),
        s.xs.length < MAXX ? botonIndicador(S, { valor: '', nivel, vacio: 'Añadir X…', excluir: [...s.xs, s.y], titulo: 'Añadir variable explicativa', alElegir: v => { if (v) S.setA({ arx: [...s.xs.filter(q => q !== x1), v].join(',') }); } }) : null] },
      { t: 'Modelo que se lee', paso: 'modelo', n: [selModelo(S)] },
    ];
  },
  unidadTitulo: 'Años del panel',
  resumenModelo(S) { const m = PN.MODELOS.find(q => q.id === (S.A.apm || 'fe2')) || PN.MODELOS[3]; return `${m.rotulo} · errores ${S.A.ase === 'hc1' ? 'robustos' : S.A.ase === 'cls' ? 'clásicos' : 'agrupados'}`; },
  resumenUnidad(S) { const r = S.vars.length ? rango(S).anios : []; return r.length ? `${r[0]}-${r[r.length - 1]}${S.A.aequ === '0' ? ', todas las unidades' : ', equilibrado'}` : ''; },
  /** Desde y hasta, entre los años que comparten todas las variables. */
  unidad(S) {
    const { todos, anios } = rango(S);
    if (!todos.length) return [h('p', { class: 'an-p-nota' }, 'Las variables no comparten ningún año con cifra.')];
    const sel = (v, clave, aria) => { const s0 = h('select', { class: 'an-select an-p-anio', 'aria-label': aria }); for (const a of todos) s0.append(h('option', { value: a, selected: a === v || null }, String(a))); s0.value = String(v); s0.addEventListener('change', () => S.setA({ [clave]: s0.value })); return s0; };
    return [h('div', { class: 'an-p-fila' }, h('span', { class: 'an-p-nota' }, 'desde'), sel(anios[0], 'apd', 'Desde'), h('span', { class: 'an-p-nota' }, 'hasta'), sel(anios[anios.length - 1], 'aph', 'Hasta')),
      h('p', { class: 'an-p-nota' }, `${anios.length} de ${todos.length} años con cifra en todas las variables${S.interp ? ' (con los interpolados)' : ''}.`)];
  },
  ajustes(S) {
    return [{ t: 'Panel', n: [
      seg('Unidades', [['1', 'Equilibrado'], ['0', 'Todas']], S.A.aequ, v => S.setA({ aequ: v }), { titulo: 'Equilibrado: solo las unidades con cifra en todos los años; Todas: también las que tienen huecos', info: INFO.equilibrado }),
      seg('Errores', [['cl', 'Agrupados'], ['hc1', 'Robustos'], ['cls', 'Clásicos']], S.A.ase, v => S.setA({ ase: v }), { titulo: 'Agrupados por unidad (por defecto): admiten que los años de una misma unidad se parezcan; robustos (HC1): solo heterocedasticidad; clásicos: ni lo uno ni lo otro', info: INFO.errores }),
    ] }];
  },
  descargas: S => [h('button', { type: 'button', class: 'an-btn', onclick: () => exportarTabla(S) }, 'CSV de la tabla'), h('button', { type: 'button', class: 'an-btn', onclick: () => exportarPanel(S) }, 'CSV del panel usado')],
  async pintar(S, cancelado) {
    const s = spec(S), nivel = S.nivelDatos();
    const ids = S.vars.map(v => v.id), iy = ids.length - 1, k = ids.length - 1;
    const logArr = ids.map(id => s.logs.has(id));
    const { anios, aviso, todos } = rango(S);
    if (anios.length < 2) {
      const b = [];
      if (!S.interp) b.push(h('button', { type: 'button', class: 'an-btn', onclick: () => S.setA({ ainterp: '1' }) }, 'Incluir los años interpolados'));
      b.push(h('button', { type: 'button', class: 'an-btn' + (b.length ? ' an-btn--sec' : ''), onclick: () => S.setA({ am: 'reg' }, { historial: true }) }, 'Comparar entre territorios, con años distintos (Regresión)'));
      const ys = S.vars.map(v => `${corto(v.ent)}: ${v.fijo ? 'cifra fija' : !v.usables.length ? '—' : v.usables.length === 1 ? v.usables[0] : `${v.usables[0]}-${v.usables[v.usables.length - 1]}`}`).join('; ');
      S.vacio(aviso && todos.length < 2 ? `${aviso} A un lado de ese cambio no quedan dos años en común, y un panel los necesita.` : anios.length ? 'Para un panel hacen falta al menos dos años: amplía «desde» y «hasta».' : `Un panel sigue a las mismas unidades en los mismos años, y estas variables no comparten ninguno con cifra (${ys}). Para relacionarlas entre territorios, cada una con su año, usa la regresión.`, h('div', { class: 'an-vacio__btns' }, b));
      return;
    }
    const obs = [], cuentas = [];
    for (const t of anios) {
      const cr = await X.cruzar(S.ctx, S.vars, nivel, t, 0);
      if (cancelado()) return;
      if (!cr) continue;
      const f = X.filtrar(cr, { ...S.opcionesFiltro(), log: logArr });
      cuentas.push({ t, cu: f.cuenta, cr });
      const tf = (v, j) => (logArr[j] ? Math.log10(v) : v);
      for (const r of f.dentro) obs.push({ u: r.id, t, y: tf(r.vals[iy].v, iy), x: r.vals.slice(0, k).map((c, j) => tf(c.v, j)), nombre: r.nombre, est: r.est });
    }
    const P = PN.armarPanel(obs, { equilibrado: S.A.aequ !== '0' });
    if (P.N < 3 || P.T < 2) { S.vacio(`Quedan ${P.N} unidades en ${P.T} años: no hay panel que estimar. Prueba «Unidades: Todas» en Ajustes, otros años o menos filtros.`); return; }
    const se = S.A.ase || 'cl';
    const R = {};
    for (const m of PN.MODELOS) R[m.id] = PN.estimar(P, m.id, { se });
    const hz = PN.hausman(P);
    const noPos = cuentas.reduce((q, c) => q + c.cu.noPositivas, 0);   // observaciones con cero o negativo en una variable en log
    PM.ultimo = { s, P, R, hz, anios, cuentas, logArr, ids, se, aviso, noPos };
    dibuja(S);
    resultados(S);
    const n0 = obs.length, est = obs.filter(o => o.est).length;
    const cfil = S.textoFiltro();
    S.ui.cuenta.innerHTML = `<b>Panel: ${entero(P.N)} unidades × ${entero(P.T)} años = ${entero(P.n)} observaciones</b> (${P.equilibrado ? 'equilibrado' : `no equilibrado: de ${P.minT} a ${P.maxT} años por unidad`}${S.A.aequ !== '0' && n0 > P.n ? `; ${entero(n0 - P.n)} observaciones fuera por no tener todos los años` : ''})${cfil ? ` · filtrado: ${esc(cfil)}` : ''} · <span class="an-m an-m--est"></span>${entero(est)} observaciones con alguna cifra estimada (dentro)`;
  },
  redibujar(S) { if (PM.ultimo) dibuja(S); },
  destruir() { PM.ultimo = null; },
};

// ---------------------------------------------------------------- tabla al modo de un artículo + gráficos
function modeloLeido(S) { const m = S.A.apm || 'fe2'; return PM.ultimo && PM.ultimo.R[m] && !PM.ultimo.R[m].error ? m : 'fe2'; }
function dibuja(S) {
  const { s, R, hz } = PM.ultimo;
  const graf = S.ui.graf;
  graf.textContent = '';
  const k = s.xs.length, leido = modeloLeido(S);
  const ms = PN.MODELOS;
  const celda = (m, j) => { const r = R[m.id]; if (r.error) return ['—', '']; const c = j < 0 ? r.constante : r.x[j]; return c ? [`${sig(c.b)}${estrellas(c.p)}`, `(${sig(c.se)})`] : ['absorbida', '']; };
  const th = m => h('th', { scope: 'col', class: m.id === leido ? 'is-leido' : null }, h('button', { type: 'button', 'aria-pressed': String(m.id === leido), title: 'Leer este modelo (frase, gráficos)', onclick: () => S.setA({ apm: m.id }) }, m.corto));
  const filas = [];
  s.xs.forEach((id, j) => {
    filas.push(h('tr', { class: 'an-pt-b' }, h('th', { scope: 'row' }, nombreVar(S, id, s.logs)), ...ms.map(m => h('td', { class: m.id === leido ? 'is-leido' : null }, celda(m, j)[0]))));
    filas.push(h('tr', { class: 'an-pt-se' }, h('th', {}), ...ms.map(m => h('td', { class: m.id === leido ? 'is-leido' : null }, celda(m, j)[1]))));
  });
  filas.push(h('tr', { class: 'an-pt-b an-pt-const' }, h('th', { scope: 'row' }, 'Constante'), ...ms.map(m => h('td', { class: m.id === leido ? 'is-leido' : null }, celda(m, -1)[0]))));
  filas.push(h('tr', { class: 'an-pt-se' }, h('th', {}), ...ms.map(m => h('td', { class: m.id === leido ? 'is-leido' : null }, celda(m, -1)[1]))));
  const pie = (rot, f) => h('tr', { class: 'an-pt-pie' }, h('th', { scope: 'row' }, rot), ...ms.map(m => h('td', { class: m.id === leido ? 'is-leido' : null }, R[m.id].error ? '—' : f(R[m.id], m))));
  filas.push(pie('Observaciones', r => entero(r.n)), pie('Unidades', r => entero(r.N)), pie('Años', r => entero(r.T)),
    pie('R² dentro', r => r2(r.r2w)), pie('R² entre', r => r2(r.r2b)), pie('R² total', r => r2(r.r2o)),
    pie('EF de unidad', (r, m) => (m.id === 'feu' || m.id === 'fe2' ? 'sí' : m.id === 'pd' ? 'por diferencias' : '—')),
    pie('EF de año', (r, m) => (m.id === 'fea' || m.id === 'fe2' ? 'sí' : '—')),
    pie('Hausman (p)', (r, m) => (m.id === 're' && hz && hz.valido ? pTxt(hz.p) : '')));
  const tabla = h('table', { class: 'an-tabla an-ptabla' },
    h('caption', {}, `${nombreVar(S, s.y, s.logs)} · errores típicos ${S.A.ase === 'hc1' ? 'robustos (HC1)' : S.A.ase === 'cls' ? 'clásicos' : 'agrupados por unidad'} entre paréntesis · *** p < 0,01 · ** p < 0,05 · * p < 0,1 · pincha un modelo para leerlo`),
    h('thead', {}, h('tr', {}, h('th', {}), ...ms.map(th))), h('tbody', {}, ...filas));
  const bosque = h('div', { class: 'an-pg an-pg--coef' }), anio = h('div', { class: 'an-pg an-pg--anio' }), nube = h('div', { class: 'an-pg an-pg--nube' });
  const tablaBox = h('div', { class: 'an-reg__tabla' }, tabla);
  const raiz = h('div', { class: 'an-pan' }, tablaBox, h('div', { class: 'an-pan__fila' }, bosque, anio), nube);
  graf.append(raiz);
  // rejilla que llena el alto: tabla; coeficientes | años; y, si sobra alto, la nube que mide el modelo, a lo ancho
  const app = graf.closest('.an-app'), movil = (app ? app.clientWidth : graf.clientWidth) <= 760;
  if (!movil) {
    const altoTabla = Math.ceil(tablaBox.scrollHeight + 1), resto = graf.clientHeight - altoTabla;
    const fila2 = Math.max(250, 60 + k * (PN.MODELOS.length * 17 + 34));
    nube.hidden = resto - fila2 < 300;
    raiz.style.gridTemplateRows = nube.hidden ? `${altoTabla}px minmax(260px, 1fr)` : `${altoTabla}px ${fila2}px minmax(0, 1fr)`;   // si no cabe, se desplaza
  }
  dibujaBosque(S, bosque, k);
  dibujaAnios(S, anio);
  if (!nube.hidden) dibujaNube(S, nube);
}

const QUITA = { mco: 'sin quitar nada', feu: 'quitado lo propio de cada unidad', fea: 'quitado lo común de cada año', fe2: 'quitado lo propio de cada unidad y lo común de cada año' };
/** Texto SVG en varias líneas que no pasan de «ancho»; devuelve cuántas. */
function envuelve(svg, txt, ancho, y0, alto = 13) {
  const t = svg.append('text').attr('class', 'an-mini-c').attr('x', 8).attr('y', y0);
  let linea = [], n = 0, ts = t.append('tspan').attr('x', 8).attr('dy', 0);
  for (const w of txt.split(' ')) {
    linea.push(w); ts.text(linea.join(' '));
    if (ts.node().getComputedTextLength() > ancho && linea.length > 1) {
      linea.pop(); ts.text(linea.join(' ')); linea = [w]; n++;
      ts = t.append('tspan').attr('x', 8).attr('dy', alto).text(w);
    }
  }
  return n + 1;
}
/** Recorta un texto SVG con «…» si no cabe. */
function recorta(t, ancho) {
  const n0 = t.node(), txt = t.text();
  if (!n0.getComputedTextLength || n0.getComputedTextLength() <= ancho) return;
  let n = txt.length;
  while (n > 8 && n0.getComputedTextLength() > ancho) { n--; t.text(txt.slice(0, n) + '…'); }
  t.append('title').text(txt);
}
/** La nube que mide el modelo leído (Frisch-Waugh-Lovell, panel.js): su pendiente es el coeficiente de la primera X. */
function dibujaNube(S, el) {
  const { s, P, R } = PM.ultimo;
  let m = modeloLeido(S);
  const deRe = m === 're';
  if (deRe) m = 'fe2';
  const c = R[m] && !R[m].error ? R[m].x[0] : null, nb = c ? PN.nubeDentro(P, m, 0) : null;
  const nx = nombreVar(S, s.xs[0], s.logs), ny = nombreVar(S, s.y, s.logs), mc = PN.MODELOS.find(q => q.id === m).corto;
  if (!nb) { el.append(h('p', { class: 'an-nota' }, `${nx}: el modelo ${mc} la absorbe (no cambia como hace falta), así que no hay nube que enseñar.`)); return; }
  const caja = cajaUtil(el), W = Math.max(260, caja.w), H = Math.max(220, caja.h || 286);
  const svg = d3.select(el).append('svg').attr('class', 'an-svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', `La nube que mide el modelo ${mc}`);
  // las tres observaciones que más tiran de la recta: su peso en la pendiente es x² / Σx² (b = Σ peso · y/x)
  const sx = nb.x.reduce((a, v) => a + v * v, 0) || 1;
  const tiran = nb.x.map((v, i) => [i, (v * v) / sx]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(d => d[1] > 0.02);
  const k = s.xs.length;
  const sub = (m === 'pd' ? 'Cada punto, el cambio de una unidad entre dos años seguidos' : `Cada punto, una unidad en un año, ${QUITA[m]}`) + (k > 1 ? ' y lo que explican las demás X' : '') + (deRe ? ' (efectos aleatorios no tiene una nube así: esta es la del EF doble)' : '')
    + `. La pendiente de la recta es el coeficiente (${sig(c.b)})${tiran.length ? `; con nombre, ${tiran.length === 1 ? 'la observación que más pesa' : `las ${tiran.length} que más pesan`} en ella (${tiran.map(d => `${num(d[1] * 100, 0)} %`).join(', ')})` : ''}.`;
  const tt = svg.append('text').attr('class', 'an-mini-t').attr('x', 8).attr('y', 14).text(`La nube que mide el modelo (${mc}): ${ny} frente a ${nx}`);
  recorta(tt, W - 16);
  const lineas = envuelve(svg, sub, W - 16, 28);
  const mg = { t: 28 + lineas * 13 + 20, r: 16, b: 34, l: 60 };
  const x = d3.scaleLinear().domain(d3.extent(nb.x)).nice().range([mg.l, W - mg.r]);
  const y = d3.scaleLinear().domain(d3.extent(nb.y)).nice().range([H - mg.b, mg.t]);
  svg.append('g').attr('class', 'an-rej').attr('transform', `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - mg.l - mg.r)).tickFormat('')).call(g => g.select('.domain').remove());
  if (y.domain()[0] < 0 && y.domain()[1] > 0) svg.append('line').attr('class', 'an-cero').attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', y(0)).attr('y2', y(0));
  if (x.domain()[0] < 0 && x.domain()[1] > 0) svg.append('line').attr('class', 'an-cero').attr('x1', x(0)).attr('x2', x(0)).attr('y1', mg.t).attr('y2', H - mg.b);
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(v => sig(v, 2)).tickSizeOuter(0));
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(0,${H - mg.b})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 110))).tickFormat(v => sig(v, 2)).tickSizeOuter(0));
  svg.append('text').attr('class', 'an-mini-c').attr('x', W - mg.r).attr('y', H - 4).attr('text-anchor', 'end').text(`${nx} →`);
  svg.append('text').attr('class', 'an-mini-c').attr('x', mg.l + 4).attr('y', mg.t - 4).text(`↑ ${ny}`);
  const n = nb.x.length, r0 = n > 3000 ? 1.6 : n > 800 ? 2.2 : 3;
  svg.append('g').selectAll('circle').data(nb.x).join('circle').attr('cx', v => x(v)).attr('cy', (v, i) => y(nb.y[i])).attr('r', r0).attr('fill', '#4a4a4a').attr('fill-opacity', n > 3000 ? 0.28 : 0.45);
  const clip = 'an-nube-clip';
  svg.append('clipPath').attr('id', clip).append('rect').attr('x', mg.l).attr('y', mg.t).attr('width', W - mg.l - mg.r).attr('height', H - mg.t - mg.b);
  const [x0, x1] = x.domain();
  svg.append('line').attr('clip-path', `url(#${clip})`).attr('x1', x(x0)).attr('x2', x(x1)).attr('y1', y(c.b * x0)).attr('y2', y(c.b * x1)).attr('stroke', '#101010').attr('stroke-width', 2);
  // con nombre y año, las que más tiran de la recta; si dos rótulos chocan, se prueba debajo y si no, se deja sin rótulo
  const gr = svg.append('g').attr('class', 'an-rot').style('pointer-events', 'none');
  const cajas = [];
  tiran.forEach(([i]) => {
    const o = nb.obs[i], px = x(nb.x[i]), py = y(nb.y[i]), der = px > (mg.l + W - mg.r) / 2;
    const txt = `${o.nombre || o.u}, ${nb.desde ? `${nb.desde[i]}-${o.t}` : o.t}`;
    for (const dy of [-5, 13]) {
      const par = ['an-halo', 'an-txt'].map(cl => gr.append('text').attr('class', cl).attr('x', der ? px - 6 : px + 6).attr('y', py + dy).attr('text-anchor', der ? 'end' : 'start').style('font-size', '11px')
        .attr('stroke', cl === 'an-halo' ? '#ffffff' : null).attr('stroke-width', cl === 'an-halo' ? 3 : null).attr('stroke-linejoin', cl === 'an-halo' ? 'round' : null).text(txt));
      const b = par[1].node().getBBox();
      if (!cajas.some(q => b.x < q.x + q.width && q.x < b.x + b.width && b.y < q.y + q.height && q.y < b.y + b.height)) { cajas.push(b); break; }
      par.forEach(t => t.remove());
    }
  });
  // al pasar: la unidad y el año más cercanos
  const pts = nb.x.map((v, i) => [x(v), y(nb.y[i])]);
  const del = d3.Delaunay.from(pts);
  const aro = svg.append('circle').attr('r', 5).attr('fill', 'none').attr('stroke', '#d23c2f').attr('stroke-width', 2).style('display', 'none');
  const ux = (S.ctx.datos.indicador(s.xs[0]) || {}).unidad || '', uy = (S.ctx.datos.indicador(s.y) || {}).unidad || '';
  svg.append('rect').attr('x', mg.l).attr('y', mg.t).attr('width', W - mg.l - mg.r).attr('height', H - mg.t - mg.b).attr('fill', 'transparent')
    .on('pointermove', ev => {
      const [px, py] = d3.pointer(ev), i = del.find(px, py);
      if (i == null || Math.hypot(pts[i][0] - px, pts[i][1] - py) > 24) { aro.style('display', 'none'); S.ctx.tooltip.ocultar(); return; }
      aro.style('display', null).attr('cx', pts[i][0]).attr('cy', pts[i][1]);
      const o = nb.obs[i];
      S.ctx.tooltip.mostrar(`<strong>${esc(o.nombre || o.u)}</strong><div class="an-tt-m">${nb.desde ? `de ${nb.desde[i]} a ${o.t}` : o.t}</div>`
        + `<div class="an-tt-f"><span>${esc(nx)}</span><b>${esc(sig(nb.x[i], 3))}${s.logs.has(s.xs[0]) ? '' : ' ' + esc(ux)}</b></div>`
        + `<div class="an-tt-f"><span>${esc(ny)}</span><b>${esc(sig(nb.y[i], 3))}${s.logs.has(s.y) ? '' : ' ' + esc(uy)}</b></div>`
        + `<div class="an-tt-m">${m === 'pd' ? 'cambios entre los dos años' : 'diferencias respecto a lo que el modelo descuenta'}</div>`, ev.clientX, ev.clientY);
    })
    .on('pointerleave', () => { aro.style('display', 'none'); S.ctx.tooltip.ocultar(); });
}

/** Coeficientes con su IC 95 % de cada X en los seis modelos (uno por fila; el leído, en negro). */
function dibujaBosque(S, el, k) {
  const { s, R } = PM.ultimo, leido = modeloLeido(S);
  const caja = cajaUtil(el), W = Math.max(240, caja.w || 320), filaH = 17, bloque = PN.MODELOS.length * filaH + 34;
  const H = Math.max(160, caja.h || 0, 40 + k * bloque);
  const svg = d3.select(el).append('svg').attr('class', 'an-svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Coeficientes de cada modelo con su intervalo del 95 %');
  svg.append('text').attr('class', 'an-mini-t').attr('x', 8).attr('y', 14).text('Coeficientes e intervalos del 95 %, por modelo');
  const m = { l: 92, r: 24 };
  const altoB = (H - 28) / k;
  s.xs.forEach((id, j) => {
    const g = svg.append('g').attr('transform', `translate(0,${24 + j * altoB})`);
    const vals = PN.MODELOS.map(mo => R[mo.id]).filter(r => !r.error && r.x[j]).flatMap(r => r.x[j].ic);
    if (!vals.length) { g.append('text').attr('class', 'an-mini-c').attr('x', 8).attr('y', 16).text(`${nombreVar(S, id, s.logs)}: absorbida en todos`); return; }
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), pad = (hi - lo) * 0.06 || 1;
    const x = d3.scaleLinear().domain([lo - pad, hi + pad]).range([m.l, W - m.r]).nice();
    g.append('text').attr('class', 'an-mz-f').attr('x', 8).attr('y', 12).text(nombreVar(S, id, s.logs));
    const y0 = 22, fh = Math.max(10, Math.min(32, (altoB - 40) / PN.MODELOS.length));   // las filas crecen con el alto
    g.append('line').attr('class', 'an-cero').attr('x1', x(0)).attr('x2', x(0)).attr('y1', y0 - 4).attr('y2', y0 + PN.MODELOS.length * fh);
    PN.MODELOS.forEach((mo, q) => {
      const r = R[mo.id], c = r.error ? null : r.x[j], cy = y0 + q * fh + fh / 2;
      g.append('text').attr('class', 'an-mini-c').attr('x', m.l - 6).attr('y', cy + 3).attr('text-anchor', 'end').style('font-weight', mo.id === leido ? 700 : 400).text(mo.corto);
      if (!c) { g.append('text').attr('class', 'an-mini-c').attr('x', m.l + 4).attr('y', cy + 3).text(r.error ? 'sin estimar' : 'absorbida (no cambia en el tiempo)'); return; }
      g.append('line').attr('x1', x(c.ic[0])).attr('x2', x(c.ic[1])).attr('y1', cy).attr('y2', cy).attr('stroke', mo.id === leido ? '#101010' : COLM[mo.id]).attr('stroke-width', mo.id === leido ? 2.2 : 1.4);
      g.append('rect').attr('x', x(c.b) - 4).attr('y', cy - 4).attr('width', 8).attr('height', 8).attr('fill', mo.id === leido ? '#101010' : COLM[mo.id]);
    });
    g.append('g').attr('class', 'an-eje').attr('transform', `translate(0,${y0 + PN.MODELOS.length * fh + 2})`).call(d3.axisBottom(x).ticks(W < 420 ? 3 : 5).tickFormat(v => sig(v, 2)).tickSize(3));
  });
}

/** Lo común de cada año (efectos fijos de año respecto al primero), del modelo leído si los tiene o del doble. */
function dibujaAnios(S, el) {
  const { R, s } = PM.ultimo, leido = modeloLeido(S);
  const m = R[leido] && R[leido].efAnio ? leido : 'fe2';
  const ef = R[m] && R[m].efAnio;
  const caja = cajaUtil(el), W = Math.max(240, caja.w || 320), H = Math.max(160, caja.h || 220);
  if (!ef || ef.length < 2) { el.append(h('p', { class: 'an-nota' }, 'Sin efectos de año que enseñar.')); return; }
  const mg = { t: 34, r: 16, b: 28, l: 52 };
  const x = d3.scaleLinear().domain(d3.extent(ef, e => e.t)).range([mg.l, W - mg.r]);
  const y = d3.scaleLinear().domain(d3.extent([0, ...ef.map(e => e.v)])).range([H - mg.b, mg.t]).nice();
  const svg = d3.select(el).append('svg').attr('class', 'an-svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Efectos fijos de año');
  svg.append('text').attr('class', 'an-mini-t').attr('x', 8).attr('y', 14).text(`Lo común de cada año, respecto a ${ef[0].t} (${PN.MODELOS.find(q => q.id === m).corto})`);
  svg.append('text').attr('class', 'an-mini-c').attr('x', 8).attr('y', 27).text(`en ${(S.ctx.datos.indicador(s.y) || {}).unidad || 'unidades de Y'}${s.logs.has(s.y) ? ' (log)' : ''}, descontadas las X${m === 'fe2' ? ' y cada unidad' : ''}`);
  svg.append('g').attr('class', 'an-rej').attr('transform', `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - mg.l - mg.r)).tickFormat('')).call(g => g.select('.domain').remove());
  svg.append('line').attr('class', 'an-cero').attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', y(0)).attr('y2', y(0));
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(${mg.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(v => sig(v, 2)).tickSizeOuter(0));
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(0,${H - mg.b})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.min(ef.length, Math.floor((W - 70) / 60)))).tickFormat(d3.format('d')).tickSizeOuter(0));
  const linea = d3.line().x(e => x(e.t)).y(e => y(e.v));   // sin unir los años que la base dice que no se unen
  svg.append('path').attr('class', 'an-serie').attr('stroke', '#101010').attr('d', AN.trozos(ef, S.vars.flatMap(v => AN.cortesDe(v.ent)), { anio: e => e.t }).filter(q => q.length > 1).map(q => linea(q)).join(''));
  svg.append('g').selectAll('circle').data(ef).join('circle').attr('cx', e => x(e.t)).attr('cy', e => y(e.v)).attr('r', 3).attr('fill', '#101010')
    .append('title').text(e => `${e.t}: ${sig(e.v)}`);
}

// ---------------------------------------------------------------- resultados (panel derecho)
function frase(S, m, c, ex, ey) {
  const nx = nombreMin(ex), ny = nombreMin(ey), ux = /^%/.test(ex.unidad || '') ? 'punto' : (ex.unidad || 'unidad'), uy = /^%/.test(ey.unidad || '') ? 'puntos' : (ey.unidad || '');
  const lx = PM.ultimo.logArr[0], ly = PM.ultimo.logArr[PM.ultimo.logArr.length - 1];
  const sube = `${c.b >= 0 ? 'sube' : 'baja'} ${sig(Math.abs(c.b), 2)}${ly ? ' (en log)' : uy ? ' ' + uy : ''}`;
  const cuando = `cuando ${nx} sube ${lx ? '1 (en log)' : `1 ${ux}`}`;
  const u = (S.nivelDatos() === 'municipio' ? 'municipio' : S.nivelDatos() === 'provincia' ? 'provincia' : 'partido');
  return {
    mco: `Entre todas las observaciones (cada ${u} en cada año), ${cuando}, ${ny} ${sube} de media.`,
    feu: `Dentro de un mismo ${u}, ${cuando} a lo largo del tiempo, ${ny} ${sube} de media.`,
    fea: `En un mismo año, entre ${u}s, ${cuando}, ${ny} ${sube} de media (descontado lo común de cada año).`,
    fe2: `Dentro de un mismo ${u}, ${cuando}, ${ny} ${sube} de media, descontado lo común de cada año.`,
    pd: `Cuando ${nx} cambia ${lx ? '1 (en log)' : `1 ${ux}`} de un año del panel al siguiente en un ${u}, ${ny} ${c.b >= 0 ? 'cambia en el mismo sentido' : 'cambia en sentido contrario'} ${sig(Math.abs(c.b), 2)}${ly ? ' (en log)' : uy ? ' ' + uy : ''} de media.`,
    re: `Mezclando lo de dentro de cada ${u} y lo de entre ${u}s (efectos aleatorios), ${cuando}, ${ny} ${sube} de media.`,
  }[m];
}
function resultados(S) {
  const { s, R, hz, P } = PM.ultimo, leido = modeloLeido(S), r = R[leido];
  const ey = S.ctx.datos.indicador(s.y), ex = S.ctx.datos.indicador(s.xs[0]);
  const c = r.error ? null : r.x[0];
  const avisos = [];
  if (PM.ultimo.aviso) avisos.push(PM.ultimo.aviso);
  if (avisoLog(S, s)) avisos.push(avisoLog(S, s));
  if (PM.ultimo.noPos) avisos.push(`${entero(PM.ultimo.noPos)} ${PM.ultimo.noPos === 1 ? 'observación' : 'observaciones'} con cero o negativo fuera: no tienen logaritmo y no se les suma nada.`);
  const absorb = [...new Set(['feu', 'fe2', 'pd'].flatMap(m => (R[m].absorbidas || []).map(j => s.xs[j])))];
  if (absorb.length) avisos.push(`${absorb.map(id => corto(S.ctx.datos.indicador(id))).join(', ')} no cambia en el tiempo: los efectos fijos de unidad y las diferencias la absorben (sale «absorbida»).`);
  if (hz && hz.valido) avisos.push(hz.p < 0.05 ? `Hausman p ${pTxt(hz.p)}: los efectos aleatorios no casan con los fijos; fíate más de los fijos.` : `Hausman p ${pTxt(hz.p)}: no hay diferencia clara entre efectos fijos y aleatorios.`);
  if (P.N < 30) avisos.push(`Solo ${P.N} unidades: con errores agrupados por unidad, pocas unidades dan errores poco fiables.`);
  if (S.interp) avisos.push('Con años interpolados, parte de las cifras sale de una recta entre dos datos de fuente: dentro de cada unidad, su variación es inventada por la interpolación y los efectos fijos la toman como si fuera real. Mejor sin interpolados (Ajustes).');
  S.ui.res.innerHTML = `
    <p class="an-r__k">${esc(PN.MODELOS.find(q => q.id === leido).rotulo)}</p>
    ${c ? `<div class="an-r__big"><span class="an-r__n${sig(c.b, 3).length > 6 ? ' is-largo' : ''}">${sig(c.b, 3)}</span><span class="an-r__l">coeficiente de ${esc(corto(ex))}${estrellas(c.p)}</span></div>
    <dl class="an-dl an-dl--clave"><dt>Error típico</dt><dd>${sig(c.se)}</dd><dt>p</dt><dd>${pTxt(c.p)}</dd><dt>Unidades × años</dt><dd>${entero(r.N)} × ${entero(r.T)}</dd></dl>
    <p class="an-lectura">${esc(frase(S, leido, c, ex, ey))} Es una asociación, no un efecto causal; y con datos por territorio no dice nada de las personas (falacia ecológica).</p>` : `<p class="an-nota an-nota--aviso">${esc(r.error || 'La primera X queda absorbida en este modelo: elige otro en la tabla.')}</p>`}
    ${avisos.map(a => `<p class="an-nota an-nota--aviso">${esc(a)}</p>`).join('')}
    ${S.mas(`<p class="an-nota">MCO agrupado: todas las observaciones juntas. Efectos fijos de unidad: compara cada unidad consigo misma en el tiempo (quita lo que la hace distinta de las demás y no cambia). Efectos de año: quita lo común a todas en cada año (la tendencia general). Doble: las dos cosas. Primeras diferencias: cambio de un año del panel al siguiente. Efectos aleatorios: supone que lo propio de cada unidad no tiene que ver con las X; el contraste de Hausman lo pone a prueba.</p>
      <p class="an-nota">Errores típicos ${S.A.ase === 'hc1' ? 'robustos (HC1)' : S.A.ase === 'cls' ? 'clásicos' : 'agrupados por unidad (corrección G/(G−1)·(n−1)/(n−k))'}; p con la t de los grados de libertad que quedan. Cálculo comprobado contra linearmodels.</p>`)}`;
  S.ponFuentes(S.vars.map(v => ({ t: corto(v.ent), ids: v.ent.fuentes || [] })));
}

// ---------------------------------------------------------------- CSV
function exportarTabla(S) {
  const u = PM.ultimo; if (!u) return;
  const { s, R, hz } = u;
  const ms = PN.MODELOS;
  const filas = [['variable', 'medida', ...ms.map(m => m.id)]];
  s.xs.forEach((id, j) => {
    for (const [med, f] of [['coeficiente', c => c.b], ['error_tipico', c => c.se], ['t', c => c.t], ['p', c => c.p], ['ic95_inf', c => c.ic[0]], ['ic95_sup', c => c.ic[1]]]) filas.push([`${id}${s.logs.has(id) ? ' (log10)' : ''}`, med, ...ms.map(m => (R[m.id].error || !R[m.id].x[j] ? '' : f(R[m.id].x[j])))]);
  });
  for (const [med, f] of [['coeficiente', c => c.b], ['error_tipico', c => c.se], ['p', c => c.p]]) filas.push(['constante', med, ...ms.map(m => (R[m.id].error || !R[m.id].constante ? '' : f(R[m.id].constante)))]);
  for (const [k0, f] of [['observaciones', r => r.n], ['unidades', r => r.N], ['anios', r => r.T], ['r2_dentro', r => r.r2w], ['r2_entre', r => r.r2b], ['r2_total', r => r.r2o], ['grados_libertad', r => r.df]]) filas.push([k0, '', ...ms.map(m => (R[m.id].error ? '' : f(R[m.id])))]);
  filas.push([]); filas.push(['y', `${s.y}${s.logs.has(s.y) ? ' (log10)' : ''}`]); filas.push(['nivel', S.nivelDatos()]); filas.push(['anios', u.anios.join(' ')]); if (u.aviso) filas.push(['aviso_cambio_de_fuente', u.aviso]); filas.push(['calculo', [s.y, ...s.xs].map(id => `${id}: ${s.logs.has(id) ? 'log10 de la cifra' : 'la cifra'}`).join('; ')]); filas.push(['observaciones_fuera_por_cero_o_negativo', u.noPos]);
  filas.push(['errores_tipicos', S.A.ase === 'hc1' ? 'robustos HC1' : S.A.ase === 'cls' ? 'clásicos' : 'agrupados por unidad']); filas.push(['equilibrado', u.P.equilibrado ? 'sí' : 'no']);
  if (hz) { filas.push(['hausman_H', hz.H]); filas.push(['hausman_p', hz.p]); }
  if (R.re && !R.re.error) { filas.push(['ea_sigma2_e', R.re.sigma2e]); filas.push(['ea_sigma2_u', R.re.sigma2u]); }
  const tx = S.textoFiltro(); if (tx) filas.push(['filtro', tx]);
  S.vars.forEach(v => filas.push([`fuente_original_${v.id}`, (v.ent.fuentes || []).map(i => S.ctx.fuentes.nombreFuente(i)).join('; ')]));
  csv(`analisis_panel_tabla__${s.y}__${S.nivelDatos()}.csv`, filas);
}
function exportarPanel(S) {
  const u = PM.ultimo; if (!u) return;
  const filas = [['u', 'nombre', 't', 'y', ...u.s.xs.map((_, j) => 'x' + (j + 1)), 'alguna_estimada']];
  for (const o of u.P.obs) filas.push([o.u, o.nombre, o.t, o.y, ...o.x, o.est ? 'sí' : 'no']);
  filas.push([]); filas.push(['# y', `${u.s.y}${u.s.logs.has(u.s.y) ? ' (log10)' : ''}`]);
  u.s.xs.forEach((id, j) => filas.push([`# x${j + 1}`, `${id}${u.s.logs.has(id) ? ' (log10)' : ''}`]));
  if (u.aviso) filas.push([`# ${u.aviso}`]);
  csv(`analisis_panel_datos__${u.s.y}__${S.nivelDatos()}.csv`, filas);
}
