/* Vista Franjas: una fila por unidad y una franja por año, coloreada por el valor (o por la anomalía respecto a la media de la unidad).
   Estimado con rayado, sin dato en gris cruzado: un hueco no se pinta como el color más bajo.
   Ronda v16: las filas llenan el alto disponible (hasta un máximo), la leyenda va por clases (las mismas del mapa, de
   ctx.escala), grande y pegada a las franjas, con cuántas franjas caen en cada clase; pinchar el nombre de una fila la
   apaga o la enciende (comun.js) y pasar el puntero la resalta. */
import { registrarVista } from '../registro.js';
import * as K from './comun.js';
import { escalaDe } from '../escala.js';
import { aniosAtlas } from '../datos.js';

const { h } = K;
const S = { ctx: null, ui: null, ro: null, t: null, seq: 0, modo: null, offAp: null, anom: new Map() };
const ALTO_MIN = 16, ALTO_MAX = 180;   // alto de cada fila: crece con la pantalla hasta un máximo razonable

registrarVista({
  id: 'franjas',
  rotulo: 'Franjas',
  orden: 50,
  usaAnio: false,
  nivelPreferido: 'nativo',
  // la leyenda (clases, estimado y sin dato) va pegada a las franjas: abajo no hace falta otra
  leyenda: false,
  admite(ind, nivel) {
    if (ind && ind.mensual) return 'Este indicador son normales mensuales: míralo en el Climograma.';
    if (nivel === 'termino') return 'Las franjas necesitan una unidad fija: elige unidades estables, municipios, partidos o provincias.';
    if (ind && K.conEpocas(ind) && (ind.anios || []).length < 2) return 'Una sola época: las franjas no dicen nada. Usa Tabla o Ranking.';
    if (ind && ind.anios && ind.anios.length < 8 && !K.conEpocas(ind)) return 'Pocos años (' + ind.anios.length + '): las franjas no dicen nada. Usa Tabla o Ranking.';
    return true;
  },
  mount(el, ctx) {
    K.cssUnaVez();
    S.ctx = ctx;
    el.textContent = '';
    const selector = K.selectorUnidades(ctx, { max: 24, etiqueta: 'Añadir unidad…' });
    const ctl = ctx.opciones || h('div', { style: 'display:contents' });
    const bar = h('div', { class: 'vv-bar' }, selector.el, ...(ctx.opciones ? [] : [ctl]));
    const nota = h('div', { class: 'vv-nota' });
    const cuerpo = h('div', { class: 'vv-cuerpo', style: 'padding:8px clamp(8px,2vw,24px) 0;overflow-x:hidden' });
    const pie = h('div', { class: 'vv-pie' });
    el.append(h('div', { class: 'vv vv-franjas' }, bar, nota, cuerpo, pie));
    S.ui = { bar, nota, cuerpo, pie, selector, ctl };
    S.ro = new ResizeObserver(() => { clearTimeout(S.t); S.t = setTimeout(pintar, 80); });
    S.ro.observe(cuerpo);
    ctx.on('tema', () => pintar());
    if (S.offAp) S.offAp();
    S.offAp = K.alCambiarApagadas(() => pintar());
    return pintar();
  },
  update(ctx, claves) { if (!claves || ['ind', 'nivel', 'sel', 'obs', 'interp'].some(k => claves.has(k))) pintar(); },
  destroy() { if (S.offAp) { S.offAp(); S.offAp = null; } if (S.ro) S.ro.disconnect(); clearTimeout(S.t); S.seq++; S.ctx = null; S.ui = null; },
});

/* Clases de una escala de ctx.escala (o de escalaDe): [{color, etiqueta}], claseDe(v) y color(v). Los categóricos, por categoría. */
function clasesDe(esc) {
  if (esc && esc.porClases && esc.clases && esc.claseDe) return { clases: esc.clases, claseDe: esc.claseDe, color: v => esc.color(v) };
  if (esc && esc.categorias && esc.categorias.size) {
    const l = [...esc.categorias.values()];
    return { clases: l.map(c => ({ color: c.color, etiqueta: c.rot })), claseDe: v => l.findIndex(c => c.color === esc.color(v)), color: v => esc.color(v) };
  }
  return null;
}

/* Anomalías (valor − media de la unidad) de TODAS las unidades del nivel: las clases no cambian al elegir o apagar unidades. */
function anomaliasDe(M, obs) {
  const clave = M.file && M.file.ids ? `${M.ids.length}|${M.anios.length}|${obs ? 1 : 0}` : null;
  const prev = S.anom.get(M);
  if (prev && prev.clave === clave) return prev.vals;
  const nA = M.anios.length, out = [];
  for (let k = 0; k < M.ids.length; k++) {
    let s = 0, n = 0;
    const vs = [];
    for (let i = 0; i < nA; i++) {
      const v = M.file.v[i][k], f = (M.file.f[i] || '')[k];
      if (v == null || !isFinite(v) || (obs && (f === '1' || f === '4'))) continue;
      vs.push(v); s += v; n++;
    }
    if (n) { const med = s / n; for (const v of vs) out.push(v - med); }
  }
  S.anom.set(M, { clave, vals: out });
  return out;
}

/* Gris claro para una fila apagada (conserva un poco la claridad del color, según el tema). */
function grisDe(c, oscuro) {
  const l = d3.lab(c).l;
  return d3.lab((oscuro ? 34 : 86) + (l - 60) * 0.1, 0, 0).formatHex();
}

async function pintar() {
  const ctx = S.ctx;
  if (!ctx || !S.ui) return;
  const mi = ++S.seq;
  const e = ctx.estado;
  const ind = ctx.datos.indicador(e.ind);
  const M = await K.matriz(ctx, e.ind, e.nivel);
  if (mi !== S.seq || !S.ui) return;
  const cuerpo = S.ui.cuerpo;
  if (!ind || !M) { cuerpo.replaceChildren(h('p', { class: 'vv-vacio' }, 'Este indicador no tiene datos a este nivel.')); S.ui.pie.textContent = ''; return; }
  const unis = await K.unidades(ctx, e.nivel, M.anios[M.anios.length - 1]);
  await S.ui.selector.refrescar(e.nivel, M.anios[M.anios.length - 1]);
  if (mi !== S.seq || !S.ui) return;
  const validas = e.sel.filter(id => M.idx.has(String(id)));
  if (validas.length !== e.sel.length) { ctx.set({ sel: validas }); return; }
  K.podaApagadas(e.nivel, e.sel);
  const pocas = ['provincia', 'andalucia'].includes(e.nivel);
  const ids = validas.length ? validas : (pocas ? M.ids.slice(0, 12) : K.mayores(M, 12));
  // un indicador que ya es una anomalía (escala divergente) se ve por su valor; los demás de clima, por su anomalía
  const yaAnom = ind.escala === 'divergente' || /_anom$/.test(ind.id || '');
  const anomalia = yaAnom ? false : S.modo != null ? S.modo : (!yaAnom && (ind.unidad === '°C' || ind.unidad === 'mm'));
  // si ya es una anomalía, no hay nada que elegir
  if (yaAnom) S.ui.ctl.replaceChildren();
  else S.ui.ctl.replaceChildren(K.seg('Color', [[false, 'Valor'], [true, 'Anomalía', 'Diferencia con la media de cada unidad']], anomalia, v => { S.modo = v; pintar(); }));
  const obs = !!e.obs;
  // «Todo interpolado» (estado.interp): una franja por año, con la interpolación del Atlas entre dos años con cifra de
  // la unidad (más clara); fuera de su primer y su último año con cifra, sin dato (no se extrapola)
  const interp = K.conInterp(ctx, M);
  const anios = interp ? aniosAtlas(M.file) : M.anios;
  const series = ids.map(id => ({ id: String(id), nombre: (unis.get(String(id)) || {}).nombre || String(id), pts: K.serieDe(M, id, { obs, interp }) }));
  if (interp) for (const s of series) { const pa = new Map(s.pts.map(p => [+p.anio, p])); s.pts = anios.map(y => pa.get(y) || { anio: y, v: null, f: '.' }); }
  const off = s => K.estaApagada(s.id);
  S.ui.nota.textContent = '';
  if (!validas.length && !pocas) S.ui.nota.append(h('span', {}, 'Sin selección: se enseñan las 12 unidades de mayor valor en el último año. Busca otras para elegirlas.'));
  S.ui.pie.textContent = '';
  if (!series.some(s => s.pts.some(p => p.v != null))) { cuerpo.replaceChildren(h('p', { class: 'vv-vacio' }, 'Sin datos en estas unidades.')); return; }

  // color por clases: las del mapa (ctx.escala); en «Anomalía», clases simétricas de las anomalías de todo el nivel
  const media = new Map(series.map(s => [s.id, d3.mean(s.pts.filter(p => p.v != null && p.f !== 'I'), p => p.v)]));
  const u = ind.unidad && ind.unidad !== 'índice (adimensional)' ? ind.unidad : '';
  let C, titulo;
  if (anomalia) {
    C = clasesDe(escalaDe({ ...ind, escala: 'divergente' }, anomaliasDe(M, obs)));
    titulo = `Diferencia con la media de cada unidad${u ? ' (' + u + ')' : ''}`;
  } else {
    C = clasesDe(ctx.escala(e.ind));
    if (!C) {   // el mapa aún no ha registrado la suya: las mismas clases, con el mismo método, de todas las cifras del nivel
      const vals = [];
      for (const fila of M.file.v) for (const v of fila) if (v != null && isFinite(v)) vals.push(v);
      C = clasesDe(escalaDe(ind, vals));
    }
    titulo = `${ind.rotulo}${u ? ' (' + u + ')' : ''}`;
  }
  if (!C) { cuerpo.replaceChildren(h('p', { class: 'vv-vacio' }, 'No hay escala de color para este indicador.')); return; }
  const valorColor = (v, id) => (anomalia ? v - media.get(id) : v);
  const fondo = d3.color(getComputedStyle(cuerpo.closest('.vv') || document.body).backgroundColor);
  const oscuro = !!(fondo && fondo.opacity > 0 && d3.lab(fondo).l < 50);

  // cuántas franjas caen en cada clase (solo las filas encendidas) y qué marcas hay
  const cuentas = C.clases.map(() => 0);
  let hayEst = false, hayRes = false, hayNd = false, nInterp = 0;
  for (const s of series) {
    if (off(s)) continue;
    for (const p of s.pts) {
      if (p.v == null) { hayNd = true; continue; }
      if (p.f === 'I') { nInterp++; continue; }   // la interpolación no cuenta en las clases: no es un dato
      const k = C.claseDe(valorColor(p.v, s.id));
      if (k >= 0 && k < cuentas.length) cuentas[k]++;
      if (p.f === '1') hayEst = true; else if (p.f === '2') hayRes = true;
    }
  }

  const cs0 = getComputedStyle(cuerpo);
  const W = cuerpo.clientWidth - parseFloat(cs0.paddingLeft) - parseFloat(cs0.paddingRight);
  const Hh = cuerpo.clientHeight - parseFloat(cs0.paddingTop) - parseFloat(cs0.paddingBottom);
  cuerpo.textContent = '';
  const estrecho = W < 520;
  const m = { t: 4, r: 8, b: 26, l: estrecho ? 90 : 170 };
  // los botones flotantes del visor («Fuente», «Info»), arriba a la derecha, no deben tapar la primera fila
  m.t = Math.max(m.t, K.altoBotones(cuerpo) - parseFloat(cs0.paddingTop));
  const iw = Math.max(60, W - m.l - m.r);
  // por épocas (ronda v22): una franja por época, con su etiqueta debajo (nunca la clave numérica)
  const ep = K.conEpocas(ind);
  const rotE = ep ? K.rotulosEpocas(ind, anios, iw) : null;
  if (ep) m.b = Math.max(m.b, rotE.alto + 4);

  // leyenda primero, para medir su alto: las filas se reparten lo que queda
  const ul = h('ul', { class: 'vv-clases', role: 'list' });
  C.clases.forEach((c, i) => ul.append(h('li', { class: cuentas[i] ? null : 'is-vacia', title: `${c.etiqueta}: ${K.entero(cuentas[i])} ${cuentas[i] === 1 ? 'franja' : 'franjas'}` },
    h('i', { style: `background:${c.color}` }), h('span', {}, c.etiqueta), h('small', {}, K.entero(cuentas[i])))));
  if (hayEst) ul.append(h('li', { class: 'vv-clases-extra' }, h('i', { class: 'vv-sw-est' }), 'estimado'));
  if (hayRes) ul.append(h('li', { class: 'vv-clases-extra' }, h('i', { class: 'vv-sw-res' }), 'con reserva o en revisión'));
  if (nInterp) ul.append(h('li', { class: 'vv-clases-extra', title: `${K.entero(nInterp)} franjas interpoladas por el Atlas entre dos años con cifra` }, h('i', { class: 'vv-sw-interp' }), K.TXT_INTERP, h('small', {}, K.entero(nInterp))));
  if (hayNd) ul.append(h('li', { class: 'vv-clases-extra' }, h('i', { class: 'vv-sw-nd' }), 'sin dato (no es cero)'));
  const ley = h('div', { class: 'vv-fr-ley', style: `margin-left:${estrecho ? 0 : m.l}px` },
    h('p', { class: 'vv-fr-ley-t' }, titulo), ul,
    h('span', { class: 'vv-fr-nota' }, 'La cifra: cuántas franjas hay en cada clase. Pincha un nombre para apagar o encender su fila.'));
  cuerpo.append(ley);
  const hL = ley.offsetHeight;
  const alto = Math.max(ALTO_MIN, Math.min(ALTO_MAX, Math.floor((Hh - hL - m.t - m.b - 6) / series.length)));
  const ih = alto * series.length;

  const svg = d3.select(cuerpo).insert('svg', '.vv-fr-ley').attr('class', 'vv-svg').attr('width', Math.max(60, W - 2)).attr('height', ih + m.t + m.b)
    .style('height', (ih + m.t + m.b) + 'px').attr('role', 'img').attr('aria-label', 'Franjas de ' + ind.rotulo);
  const raiz = svg.node();
  let focoId = null;
  const foco = (id) => { if (id === focoId) return; focoId = id; K.resalta(raiz, id); };
  const defs = svg.append('defs');
  defs.append('pattern').attr('id', 'vvf-est').attr('width', 5).attr('height', 5).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)').append('line').attr('y2', 5).attr('stroke', 'var(--a2-ink)').attr('stroke-opacity', .45).attr('stroke-width', 1.2);
  defs.append('pattern').attr('id', 'vvf-res').attr('width', 5).attr('height', 5).attr('patternUnits', 'userSpaceOnUse').append('circle').attr('cx', 2.5).attr('cy', 2.5).attr('r', 1).attr('fill', 'var(--a2-ochre)');
  const pn = defs.append('pattern').attr('id', 'vvf-nd').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse');
  pn.append('rect').attr('width', 6).attr('height', 6).attr('fill', 'var(--a2-nodata)');
  pn.append('path').attr('d', 'M0,0L6,6M6,0L0,6').attr('stroke', 'var(--a2-nodata-line)').attr('stroke-width', .8);
  const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);
  const x = d3.scaleBand().domain(anios).range([0, iw]).paddingInner(0);
  const xl = d3.scaleLinear().domain([+anios[0], +anios[anios.length - 1]]).range([x.bandwidth() / 2, iw - x.bandwidth() / 2]);
  const largo = estrecho ? 12 : 24;
  const fs = alto >= 40 ? 13.5 : alto >= 24 ? 12.5 : 11.5;
  series.forEach((s, r) => {
    const apagada = off(s);
    const gf = g.append('g').attr('class', 'vv-fila').attr('data-serie', s.id);
    for (const p of s.pts) {
      const cx = x(p.anio), w = Math.max(1, x.bandwidth());
      if (cx == null) continue;
      if (p.v == null) { gf.append('rect').attr('x', cx).attr('y', r * alto).attr('width', w).attr('height', alto - 1).attr('fill', 'url(#vvf-nd)').attr('opacity', apagada ? 0.5 : null); continue; }
      const c = C.color(valorColor(p.v, s.id));
      gf.append('rect').attr('x', cx).attr('y', r * alto).attr('width', w).attr('height', alto - 1).attr('fill', apagada ? grisDe(c, oscuro) : c)
        .attr('fill-opacity', p.f === 'I' ? 0.42 : null);   // interpolación del Atlas: más clara
      if (apagada) continue;
      if (p.f === '1') gf.append('rect').attr('x', cx).attr('y', r * alto).attr('width', w).attr('height', alto - 1).attr('fill', 'url(#vvf-est)').style('pointer-events', 'none');
      else if (p.f === '2') gf.append('rect').attr('x', cx).attr('y', r * alto).attr('width', w).attr('height', alto - 1).attr('fill', 'url(#vvf-res)').style('pointer-events', 'none');
    }
    const nom = s.nombre.length > largo ? s.nombre.slice(0, largo - 1) + '…' : s.nombre;
    const t = K.pinchable(g.append('text').attr('class', 'vv-fila-rot').attr('x', -8).attr('y', r * alto + alto / 2).attr('dy', '0.35em').attr('text-anchor', 'end').style('font-size', fs + 'px').text(nom),
      { id: s.id, nombre: s.nombre, foco });
    t.append('title').text(apagada ? `${s.nombre}: apagada. Pincha para encenderla.` : `${s.nombre}: pincha para apagarla (sigue elegida).`);
  });
  if (ep) K.ejeEpocas(g, { rot: rotE, x: a => x(a) + x.bandwidth() / 2, y0: ih + 4, ind, x0: 0, x1: iw });
  else K.anclaExtremos(g.append('g').attr('class', 'vv-eje').attr('transform', `translate(0,${ih + 4})`).call(d3.axisBottom(xl).tickValues(K.marcasAnio(xl.domain(), iw)).tickFormat(d3.format('d')).tickSizeOuter(0)));
  // pasar el puntero: la fila se resalta; el recuadro, solo con el año, el valor y su marca
  g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent').on('mousemove', function (ev) {
    const [mx, my] = d3.pointer(ev, this);
    const r = Math.min(series.length - 1, Math.max(0, Math.floor(my / alto)));
    const s = series[r];
    foco(s.id);
    const cxA = v => (ep ? x(v) + x.bandwidth() / 2 : xl(+v));
    const a = anios.reduce((b, v) => Math.abs(cxA(v) - mx) < Math.abs(cxA(b) - mx) ? v : b, anios[0]);
    const p = s.pts.find(q => q.anio === a);
    let valor = 'sin dato (no es cero)', marca = '', color = null;
    if (p && p.v != null) {
      valor = K.txtValor(ind, p.v);
      if (anomalia) { const d = p.v - media.get(s.id); valor += ` (${d >= 0 ? '+' : '−'}${K.decimal(Math.abs(d))} frente a su media)`; }
      marca = K.marcaDe(p);
      color = off(s) ? null : C.color(valorColor(p.v, s.id));
    }
    ctx.tooltip.mostrar(K.tipTitulo(K.etiquetaAnio(ind, a)) + K.tipFila({ color, nombre: s.nombre, valor, marca }), ev.clientX, ev.clientY);
  }).on('mouseleave', () => { foco(null); ctx.tooltip.ocultar(); });
  K.recuperaFoco(cuerpo);
}
