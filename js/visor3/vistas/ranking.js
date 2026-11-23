/* Vista Ranking: cómo cambia el puesto de cada unidad a lo largo del tiempo (gráfico de puestos) y, con pocos cortes, barras del año activo.
   Se enseñan las N mayores del último dato más las unidades elegidas; el trazo discontinuo es lo estimado y el hueco, la falta de dato. */
import { registrarVista } from '../registro.js';
import * as K from './comun.js';
import { aniosAtlas, corteDe, tramoAtlas } from '../datos.js';
import { tipMinimo, rotuloMinimo } from '../minimo1752.js';   // minimo1752

const { h, esc } = K;
const S = { ctx: null, ui: null, ro: null, seq: 0, t: null, n: 12 };

registrarVista({
  id: 'ranking',
  rotulo: 'Ranking',
  orden: 40,
  usaAnio: true,
  nivelPreferido: 'nativo',
  admite(ind, nivel) {
    if (nivel === 'andalucia') return 'Andalucía es una sola unidad: no hay ranking.';
    if (nivel === 'termino') return 'Los términos cambian con el año: para el ranking elige un nivel de unidades fijas.';
    if (ind && ind.mensual) return 'Este indicador son normales mensuales: míralo en el Climograma.';
    return true;
  },
  mount(el, ctx) {
    K.cssUnaVez();
    S.ctx = ctx;
    el.textContent = '';
    const selector = K.selectorUnidades(ctx, { max: 12, etiqueta: 'Resaltar unidad…' });
    const n = K.seg('Se enseñan', [[8, '8'], [12, '12'], [20, '20'], [30, '30']], S.n, v => { S.n = v; pintar(); });
    S.ctlN = n;
    const bar = h('div', { class: 'vv-bar' }, selector.el);
    K.hostOpciones(ctx, bar).append(n);
    const nota = h('div', { class: 'vv-nota' });
    const cuerpo = h('div', { class: 'vv-cuerpo', style: 'padding:0' });
    const pie = h('div', { class: 'vv-pie' });
    el.append(h('div', { class: 'vv vv-ranking vv-tiempo' }, bar, nota, cuerpo, pie));
    S.ui = { bar, nota, cuerpo, pie, selector, n };
    S.ro = new ResizeObserver(() => { clearTimeout(S.t); S.t = setTimeout(pintar, 80); });
    S.ro.observe(cuerpo);
    ctx.on('tema', () => pintar());
    // la línea temporal cambia el año sin pasar por update: la guía y las barras la siguen
    ctx.on('anio', () => { if (!S.rafAnio) S.rafAnio = requestAnimationFrame(() => { S.rafAnio = 0; pintar(); }); });
    if (S.offAp) S.offAp();
    S.offAp = K.alCambiarApagadas(() => pintar());   // series apagadas (comun.js): en gris, como en Líneas y Franjas
    return pintar();
  },
  update(ctx, claves) { if (!claves || ['ind', 'nivel', 'anio', 'sel', 'obs', 'interp', 'ver'].some(k => claves.has(k))) pintar(); },
  destroy() { cancelAnimationFrame(S.rafAnio); S.rafAnio = 0; if (S.offAp) { S.offAp(); S.offAp = null; } if (S.ro) S.ro.disconnect(); clearTimeout(S.t); S.seq++; S.ctx = null; S.ui = null; },
});

/* Años y cifras del ranking: los de la base o, con «Todo interpolado» (estado.interp), uno a uno con la interpolación
   del Atlas (corteDe de datos.js: celdas con f = 'I'; en un nivel fijo, los ids del corte son los del fichero). */
function tablaAnios(ctx, M) {
  if (K.conInterp(ctx, M)) {
    const ys = aniosAtlas(M.file);
    if (ys.length > M.anios.length) {
      const cs = ys.map(y => corteDe(M.file, y));
      const fDe = c => (!c ? '' : typeof c.f === 'string' ? c.f : (c.f || []).join(''));
      return { anios: ys, interp: true, v: i => (cs[i] && cs[i].v) || [], f: i => fDe(cs[i]) };
    }
  }
  return { anios: M.anios, interp: false, v: i => M.file.v[i] || [], f: i => M.file.f[i] || '' };
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
  if (!ind || !M) { cuerpo.replaceChildren(h('p', { class: 'vv-vacio' }, 'Este indicador no tiene datos a este nivel.')); return; }
  const unis = await K.unidades(ctx, e.nivel, M.anios[M.anios.length - 1]);
  if (S.ctlN) {   // «Se enseñan»: nada de opciones sin efecto
    const nU = M.ids.length, bs = [...S.ctlN.querySelectorAll('button')];
    S.ctlN.style.display = nU <= 8 ? 'none' : '';
    bs.forEach((b, i) => { b.hidden = i > 0 && +bs[i - 1].textContent >= nU; });
  }
  await S.ui.selector.refrescar(e.nivel, M.anios[M.anios.length - 1]);
  if (mi !== S.seq || !S.ui) return;
  const obs = !!e.obs;
  K.podaApagadas(e.nivel, e.sel);
  // los años que no se clasifican (sin_ranking_anios): la vista dice por qué y ofrece el siguiente; tampoco entran en la evolución del puesto
  const sinR = K.aniosSinRanking(ind);
  if (sinR.size && sinR.has(+e.anio)) {
    const prox = K.anioClasificable(M.anios, e.anio, sinR);
    S.ui.cuerpo.replaceChildren(h('div', { class: 'vv-vacio vv-sinrank' }, h('p', {}, `${e.anio}: ${ind.sin_ranking_nota || K.REVISION_ANIO}. Ese año no se clasifica.`),
      prox != null ? h('button', { class: 'a2-btn', type: 'button', onclick: () => ctx.set({ anio: prox }, { historial: true }) }, `Ver ${prox}`) : ''));
    return;
  }
  const T0 = tablaAnios(ctx, M), iT = T0.anios.map((a, i) => i).filter(i => !sinR.has(+T0.anios[i]));
  const T = sinR.size ? { ...T0, anios: iT.map(i => T0.anios[i]), v: i => T0.v(iT[i]), f: i => T0.f(iT[i]) } : T0;
  const nU = M.ids.length, nA = T.anios.length;
  // puesto de cada unidad en cada año
  const puesto = Array.from({ length: nA }, () => new Map());
  const val = (i, k) => { const v = T.v(i)[k]; const f = T.f(i)[k]; return v != null && !(obs && (f === '1' || f === '4')) ? v : null; };
  const fr = await K.frenteDe(ctx, ind);
  if (mi !== S.seq || !S.ui) return;
  if (fr) {
    S.ui.nota.textContent = '';
    barrasFrente(ctx, cuerpo, ind, M, unis, e, fr, cuerpo.clientWidth, cuerpo.clientHeight, val, T);
    S.ui.pie.innerHTML = ctx.opciones ? '' : K.leyendaTrazos(false);
    return;
  }
  for (let i = 0; i < nA; i++) {
    const lista = [];
    for (let k = 0; k < nU; k++) { const v = val(i, k); if (v != null) lista.push([k, v]); }
    lista.sort((a, b) => b[1] - a[1]);
    lista.forEach(([k], r) => puesto[i].set(k, r + 1));
  }
  // unidades que se enseñan: las N mayores del último año con dato + las elegidas
  const ult = [...Array(nA).keys()].reverse().find(i => puesto[i].size > 0);
  if (ult == null) { cuerpo.replaceChildren(h('p', { class: 'vv-vacio' }, 'Sin datos' + (obs ? ' observados' : '') + '.')); return; }
  const top = [...puesto[ult].entries()].sort((a, b) => a[1] - b[1]).slice(0, S.n).map(x => x[0]);
  const selK = e.sel.map(id => M.idx.get(String(id))).filter(k => k != null);
  const ks = [...new Set([...selK, ...top])];
  // sin selección, las diez primeras llevan color (un haz gris no se lee); con selección, solo las elegidas
  const colorDe = new Map((selK.length ? selK : top.slice(0, 10)).map((k, i) => [k, K.color(i)]));
  S.conSel = selK.length > 0;
  const gris = 'var(--a2-ink-3)';
  const W = cuerpo.clientWidth, H = cuerpo.clientHeight;
  S.ui.nota.textContent = '';
  for (const t of K.notasSeguidas(ind)) S.ui.nota.append(h('span', {}, `${t}.`));
  if (T.interp) S.ui.nota.append(h('span', { html: K.muestraInterp() + ': año a año entre dos años con cifra de cada unidad; los puestos de esos años salen de ella.' }));
  if (nA <= 2 || K.sinTramos(ind)) {   // sin_interpolar: las barras de la época activa, sin unir épocas con líneas
    // pocos cortes: barras del año activo
    barras(ctx, cuerpo, ind, M, unis, e, ks, colorDe, W, H, val, nA, T);
  } else {
    bump(ctx, cuerpo, ind, M, unis, e, ks, colorDe, gris, puesto, W, H, val, T);
  }
  // pie: sin la fuente (botón «Fuente», arriba); la leyenda de trazos la pone el visor v4 abajo, si no, va aquí
  S.ui.pie.innerHTML = ctx.opciones ? '' : K.leyendaTrazos(T.interp);
  K.recuperaFoco(cuerpo);
}

function bump(ctx, cuerpo, ind, M, unis, e, ks, colorDe, gris, puesto, W, H, val, T) {
  cuerpo.textContent = '';
  const m = { t: 30, r: W < 520 ? 90 : 170, b: 30, l: 34 };
  m.t = Math.max(m.t, K.altoBotones(cuerpo));   // que «Fuente» e «Info» no tapen el rótulo del primer puesto
  const iw = Math.max(60, W - m.l - m.r);
  const A = T.anios, nA = A.length, ep = K.conEpocas(ind);
  const rotE = ep ? K.rotulosEpocas(ind, A.map(Number), iw) : null;
  if (ep) m.b = Math.max(m.b, rotE.alto + 6);
  const ih = Math.max(60, H - m.t - m.b);
  const maxR = Math.min(Math.max(...ks.map(k => Math.max(...puesto.map(p => p.get(k) || 0)))), 60);
  // años sin unir (catálogo): el puesto no se une con línea a través de ellos; una cifra suelta lleva su marcador.
  // El tiempo, siempre a escala real (ronda v27)
  const SU = K.sinUnirDe(ind);
  const salta = (a0, b0) => SU.some(([p0, p1]) => +a0 <= p0 && +b0 >= p1);
  const xl = ep ? K.escalaEpocas(A, 0, iw) : d3.scaleLinear().domain([+A[0], +A[nA - 1]]).range([0, iw]);
  const y = d3.scaleLinear().domain([1, Math.max(maxR, 2)]).range([0, ih]);
  const svg = d3.select(cuerpo).append('svg').attr('class', 'vv-svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Puestos de ' + ind.rotulo);
  const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);
  g.append('g').attr('class', 'vv-rej').selectAll('line').data(d3.range(1, maxR + 1, maxR > 25 ? 5 : maxR > 12 ? 2 : 1)).join('line').attr('x1', 0).attr('x2', iw).attr('y1', d => y(d)).attr('y2', d => y(d));
  g.append('g').attr('class', 'vv-num').selectAll('text').data(d3.range(1, maxR + 1, maxR > 25 ? 5 : maxR > 12 ? 2 : 1)).join('text').attr('x', -8).attr('y', d => y(d) + 4).attr('text-anchor', 'end').text(d => d);
  if (ep) K.ejeEpocas(g, { rot: rotE, x: xl, y0: ih + 6, ind, x0: 0, x1: iw });
  else K.anclaExtremos(g.append('g').attr('class', 'vv-eje').attr('transform', `translate(0,${ih + 6})`).call(d3.axisBottom(xl).tickValues(K.marcasAnio(xl.domain(), iw)).tickFormat(d3.format('d')).tickSizeOuter(0)));
  if (!ep) K.marcaTramos(g, ind, xl, ih);
  svg.append('text').attr('x', m.l).attr('y', 18).attr('class', 'vv-tit').text('Puesto por ' + ind.rotulo.toLowerCase() + ' (1 = mayor)' + rotuloMinimo(ind.id, e.nivel, A, ks.map(k => M.ids[k])));
  const px = a => xl(a);
  const linea = d3.line().x(d => px(d.anio)).y(d => y(d.r));
  const fin = [];
  const raiz = svg.node();
  let focoId = null;
  const foco = (id) => { if (id === focoId) return; focoId = id; K.resalta(raiz, id); };
  const GRIS_OFF = 'var(--a2-line-2, #b6bcb8)';
  const elegida = id => e.sel.map(String).includes(String(id));
  const apagada = id => elegida(id) && K.estaApagada(id);
  // las apagadas y las grises, debajo; las de color, encima
  const orden = [...ks].sort((p, q) => (colorDe.has(p) && !apagada(M.ids[p]) ? 1 : 0) - (colorDe.has(q) && !apagada(M.ids[q]) ? 1 : 0));
  for (const k of orden) {
    const id = M.ids[k];
    const off = apagada(id);
    const col = off ? GRIS_OFF : colorDe.get(k) || gris;
    const dest = colorDe.has(k) && !off;
    const pts = A.map((a, i) => ({ anio: a, r: puesto[i].get(k) || null, f: T.f(i)[k], v: val(i, k) })).map(p => p.r > maxR ? { ...p, r: null } : p);
    let cur = null; const runs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a.r == null || b.r == null || salta(a.anio, b.anio)) { cur = null; continue; }
      const est = a.f === 'I' || b.f === 'I' ? 'i' : a.f === '1' || b.f === '1' ? 'd' : (a.f === '2' || b.f === '2' ? 'r' : (a.f === '4' || b.f === '4' || a.f === '5' || b.f === '5' ? 'p' : 's'));
      if (!cur || cur.est !== est) { cur = { est, pts: [a] }; runs.push(cur); }
      cur.pts.push(b);
    }
    const gs = g.append('g').attr('class', 'vv-serie').attr('data-serie', String(id));
    for (const r of runs) gs.append('path').attr('class', 'vv-linea').datum(r.pts).attr('d', linea).attr('stroke', col).attr('stroke-width', dest ? (S.conSel ? 3 : 2) : off ? 1.4 : 1.2).attr('stroke-opacity', dest || off ? 1 : 0.45)
      .attr('stroke-dasharray', r.est === 'i' ? K.TRAZO_INTERP.dash : r.est === 'd' ? '6 4' : r.est === 'p' ? '10 3' : r.est === 'r' ? '1.5 4' : null)
      .attr('stroke-opacity', r.est === 'i' ? (dest || off ? 1 : 0.45) * K.TRAZO_INTERP.opacidad : dest || off ? 1 : 0.45);
    const conLinea = new Set(runs.flatMap(r => r.pts.map(q => q.anio)));
    for (const q of pts) {
      if (q.r == null || conLinea.has(q.anio)) continue;
      const hueco = q.f !== '0' && q.f !== '3';
      gs.append('circle').attr('class', 'vv-aislado').attr('cx', px(q.anio)).attr('cy', y(q.r)).attr('r', 3.2).attr('fill', hueco ? 'var(--a2-surface, #fff)' : col).attr('stroke', col).attr('stroke-width', hueco ? 1.4 : 0).attr('fill-opacity', 1).attr('stroke-opacity', dest || off ? 1 : 0.6);
    }
    const ult = [...pts].reverse().find(p => p.r != null);
    if (ult) fin.push({ k, id, y: y(ult.r), col, dest, off, r: ult.r });
  }
  fin.sort((a, b) => a.y - b.y);
  for (let i = 1; i < fin.length; i++) if (fin[i].y - fin[i - 1].y < 12) fin[i].y = fin[i - 1].y + 12;
  // pinchar una unidad elegida la apaga o la enciende (sigue elegida); una que no lo está, la añade a la selección
  const pincha = (id) => { if (elegida(id)) K.alternaSerie(id); else ctx.set({ sel: [...e.sel, id] }); };
  for (const f of fin) {
    const nombre = (unis.get(f.id) || {}).nombre || f.id;
    const it = g.append('g').attr('class', 'vv-rot');
    if (elegida(f.id)) K.pinchable(it, { id: f.id, nombre, foco });
    else {
      it.attr('role', 'button').attr('tabindex', 0).attr('data-serie', String(f.id)).classed('vv-pinchable', true).attr('aria-label', `Resaltar ${nombre}: añadirla a la selección`)
        .on('click', (ev) => { ev.stopPropagation(); pincha(f.id); })
        .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pincha(f.id); } })
        .on('mouseenter focus', () => foco(String(f.id))).on('mouseleave blur', () => foco(null));
    }
    it.append('title').text(elegida(f.id) ? (f.off ? `${nombre}: apagada. Pincha para encenderla.` : `${nombre}: pincha para apagarla (sigue elegida).`) : `${nombre}: pincha para resaltarla.`);
    it.append('text').attr('x', iw + 8).attr('y', f.y + 4).style('fill', f.dest ? f.col : f.off ? null : 'var(--a2-ink-2)').style('font-weight', f.dest ? 700 : null)
      .text(`${f.r}. ${nombre.slice(0, 22)}`);
  }
  // marca del año activo; al pasar el puntero, la línea más cercana se resalta y el recuadro da el puesto, el valor y su marca
  const a0 = isFinite(+e.anio) && e.anio != null && e.anio !== '' ? +e.anio : +A[nA - 1];
  g.append('line').attr('class', 'vv-guia').attr('x1', px(a0)).attr('x2', px(a0)).attr('y1', 0).attr('y2', ih);
  // en el año activo, un punto por unidad: hueco y discontinuo si su valor es la interpolación del Atlas
  const ia = A.findIndex(a => +a === a0);
  if (ia >= 0) for (const k of ks) {
    const r = puesto[ia].get(k), fk = T.f(ia)[k];
    if (r == null || r > maxR || apagada(M.ids[k])) continue;
    const col = colorDe.get(k) || gris, interpolado = fk === 'I';
    g.append('circle').attr('cx', px(a0)).attr('cy', y(r)).attr('r', interpolado ? 3.6 : 3).style('pointer-events', 'none')
      .attr('fill', interpolado ? 'var(--a2-surface, #fff)' : col).attr('stroke', col).attr('stroke-width', interpolado ? 1.4 : 0).attr('stroke-dasharray', interpolado ? '2 1.6' : null);
  }
  const guia = g.append('line').attr('class', 'vv-guia').attr('y1', 0).attr('y2', ih).style('display', 'none').style('opacity', .5);
  const anioDe = (mx) => A.reduce((b, v) => Math.abs(px(v) - mx) < Math.abs(px(b) - mx) ? v : b, A[0]);
  const cercana = (i, my) => {
    let mejor = null, d = 9;
    for (const k of ks) { const r = puesto[i].get(k); if (r == null || r > maxR) continue; const dy = Math.abs(y(r) - my); if (dy < d) { d = dy; mejor = k; } }
    return mejor;
  };
  g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent').on('mousemove', function (ev) {
    const [mx, my] = d3.pointer(ev, this);
    const a = anioDe(mx);
    const i = A.indexOf(a);
    const kc = cercana(i, my);
    foco(kc != null ? String(M.ids[kc]) : null);
    this.style.cursor = kc != null ? 'pointer' : 'default';
    guia.style('display', null).attr('x1', px(a)).attr('x2', px(a));
    const quien = ks.filter(k => !apagada(M.ids[k])).map(k => ({ k, r: puesto[i].get(k) })).filter(q => q.r != null).sort((p, q) => p.r - q.r).slice(0, 14);
    let html = K.tipTitulo(K.etiquetaAnio(ind, a));
    const tramos = [];
    for (const q of quien) {
      const f = T.f(i)[q.k];
      if (f === 'I') tramos.push(tramoAtlas(M.file, M.ids[q.k], a));
      html += K.tipFila({ color: colorDe.get(q.k) || null, nombre: `${q.r}. ${(unis.get(M.ids[q.k]) || {}).nombre || M.ids[q.k]}`, valor: K.txtValor(ind, val(i, q.k)), marca: K.marcaDe({ f }, { corta: true }), foco: q.k === kc });
      html += tipMinimo(ind.id, e.nivel, a, M.ids[q.k]);   // minimo1752
    }
    if (tramos.length) html += K.tipNotaInterp(tramos);
    ctx.tooltip.mostrar(html, ev.clientX, ev.clientY);
  }).on('mouseleave', () => { guia.style('display', 'none'); foco(null); ctx.tooltip.ocultar(); })
    .on('click', function (ev) {
      const [mx, my] = d3.pointer(ev, this);
      const kc = cercana(A.indexOf(anioDe(mx)), my);
      if (kc != null) { ctx.tooltip.ocultar(); pincha(M.ids[kc]); }
    });
}

/* «Frente a Andalucía»: barras del año activo a un lado y otro del cero, que es la cifra de Andalucía de ese año. Restar la
   misma cifra a todas no cambia el orden, así que un gráfico de puestos no diría nada nuevo. */
function barrasFrente(ctx, cuerpo, ind, M, unis, e, fr, W, H, val, T) {
  cuerpo.textContent = '';
  const A = T.anios;
  let i = A.findIndex(a => String(a) === String(e.anio));
  if (i < 0) i = A.length - 1;
  const etq = K.etiquetaAnio(ind, A[i]), cA = fr.celda(A[i]), nota = S.ui.nota;
  if (!cA) { cuerpo.append(h('p', { class: 'vv-vacio' }, `${etq}: ${fr.motivo(A[i])}. No se compara; un hueco no es un cero.`)); return; }
  const fmtA = v => K.txtValor(ind, v);
  const todas = M.ids.map((id, k) => ({ k, id, v: val(i, k), f: T.f(i)[k] })).filter(r => r.v != null)
    .map(r => ({ ...r, x: K.difFrente(ind, r.v, cA.v) })).filter(r => r.x != null).sort((a, b) => b.x - a.x);
  if (!todas.length) { cuerpo.append(h('p', { class: 'vv-vacio' }, `Sin cifras para comparar en ${etq}.`)); return; }
  // con muchas unidades: las que más se apartan por arriba y por abajo, y las elegidas
  const sel = new Set(e.sel.map(String));
  let filas = todas;
  if (todas.length > S.n) {
    const arriba = Math.ceil(S.n / 2), abajo = S.n - arriba;
    const quedan = new Set([...todas.slice(0, arriba), ...todas.slice(todas.length - abajo)].map(r => r.id));
    for (const id of sel) quedan.add(id);
    filas = todas.filter(r => quedan.has(r.id));
    nota.append(h('span', {}, `Se enseñan las ${arriba} más por encima y las ${abajo} más por debajo de ${K.entero(todas.length)} unidades${sel.size ? ', y las elegidas' : ''}.`));
  }
  nota.append(h('span', {}, `Frente a Andalucía (${K.medidaTxt(ind)}): el 0 es su cifra de ${etq}, ${fmtA(cA.v)}${K.notaRef(cA) ? ` (${K.notaRef(cA)})` : ''}.`));
  const m = { t: Math.max(52, K.altoBotones(cuerpo)), r: W < 520 ? 70 : 96, b: 26, l: W < 520 ? 92 : 170 };
  const iw = Math.max(80, W - m.l - m.r), ih = Math.max(60, H - m.t - m.b);
  const lo = Math.min(0, d3.min(filas, r => r.x)), hi = Math.max(0, d3.max(filas, r => r.x));
  const x = d3.scaleLinear().domain([lo, hi || 1]).nice().range([lo < 0 ? (W < 520 ? 58 : 80) : 0, iw]);
  const y = d3.scaleBand().domain(filas.map(r => r.id)).range([0, ih]).padding(.2);
  const svg = d3.select(cuerpo).append('svg').attr('class', 'vv-svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `${ind.rotulo} frente a Andalucía, ${etq}`);
  svg.append('text').attr('x', m.l).attr('y', 20).attr('class', 'vv-tit').text(`${ind.rotulo} frente a Andalucía · ${etq}`);
  const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);
  const marcas = x.ticks(Math.max(3, Math.floor(iw / 120)));
  g.append('g').attr('class', 'vv-rej').selectAll('line').data(marcas).join('line').attr('x1', d => x(d)).attr('x2', d => x(d)).attr('y1', 0).attr('y2', ih);
  g.append('g').attr('class', 'vv-eje vv-num').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(marcas).tickFormat(v => K.formatoFrente(ind, v)).tickSizeOuter(0));
  const defs = svg.append('defs');
  defs.append('pattern').attr('id', 'vv-est-fr').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)').append('line').attr('y2', 6).attr('stroke', 'var(--a2-est-line)').attr('stroke-width', 1.4);
  const x0 = x(0);
  for (const r of filas) {
    const off = sel.has(String(r.id)) && K.estaApagada(r.id);
    const nombre = (unis.get(r.id) || {}).nombre || r.id;
    const bx = Math.min(x0, x(r.x)), bw = Math.max(1, Math.abs(x(r.x) - x0)), by = y(r.id), bh = y.bandwidth();
    const texto = K.textoFrente(ind, r.x, cA.v, fmtA) + (K.notaRef(cA) ? ` · cifra de Andalucía: ${K.notaRef(cA)}` : '');
    g.append('rect').attr('class', 'vv-bar-fr').attr('data-id', r.id).attr('x', bx).attr('y', by).attr('width', bw).attr('height', bh).attr('fill', off ? 'var(--a2-line-2, #b6bcb8)' : K.colorFrente(ctx, ind, r.x))
      .on('mousemove', ev => ctx.tooltip.mostrar(K.tipTitulo(etq) + K.tipFila({ nombre, valor: fmtA(r.v), marca: K.marcaDe({ f: r.f }) }) + K.tipFrente(texto), ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.tooltip.ocultar());
    if (r.f === '1') g.append('rect').attr('x', bx).attr('y', by).attr('width', bw).attr('height', bh).attr('fill', 'url(#vv-est-fr)').style('pointer-events', 'none');
    g.append('text').attr('x', -8).attr('y', by + bh / 2 + 4).attr('text-anchor', 'end').style('font-weight', sel.has(String(r.id)) ? 700 : null).text(nombre.slice(0, W < 520 ? 14 : 24));
    const fuera = r.x < 0;
    g.append('text').attr('class', 'vv-num vv-val-fr').attr('x', x(r.x) + (fuera ? -6 : 6)).attr('y', by + bh / 2 + 4).attr('text-anchor', fuera ? 'end' : 'start').text(K.formatoFrente(ind, r.x));
  }
  // el cero: la cifra de Andalucía de ese año, rotulada
  g.append('line').attr('class', 'vv-cero').attr('x1', x0).attr('x2', x0).attr('y1', -6).attr('y2', ih);
  const izq = x0 > iw * 0.6;
  g.append('text').attr('class', 'vv-cero-t').attr('x', x0 + (izq ? -5 : 5)).attr('y', -8).attr('text-anchor', izq ? 'end' : 'start').text(`Como Andalucía (${fmtA(cA.v)})`);
}

function barras(ctx, cuerpo, ind, M, unis, e, ks, colorDe, W, H, val, nA, T) {
  cuerpo.textContent = '';
  const A = T.anios;
  const i = Math.max(0, A.findIndex(a => String(a) === String(e.anio)) >= 0 ? A.findIndex(a => String(a) === String(e.anio)) : nA - 1);
  const filas = ks.map(k => ({ k, v: val(i, k), f: T.f(i)[k], id: M.ids[k] })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
  for (const r of filas) if (r.f === 'I') r.tramo = tramoAtlas(M.file, r.id, A[i]);
  const m = { t: 34, r: W < 520 ? 74 : 90, b: 24, l: W < 520 ? 96 : 170 };
  const iw = Math.max(60, W - m.l - m.r), ih = Math.max(60, H - m.t - m.b);
  const svg = d3.select(cuerpo).append('svg').attr('class', 'vv-svg').attr('viewBox', `0 0 ${W} ${H}`);
  svg.append('text').attr('x', m.l).attr('y', 20).attr('class', 'vv-tit').text(`${ind.rotulo} · ${K.etiquetaAnio(ind, A[i])}${rotuloMinimo(ind.id, e.nivel, [A[i]], filas.map(r => r.id))}`);
  const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);
  const x = d3.scaleLinear().domain([0, d3.max(filas, r => r.v) || 1]).range([0, iw]).nice();
  const y = d3.scaleBand().domain(filas.map(r => r.id)).range([0, ih]).padding(.2);
  g.append('g').attr('class', 'vv-eje vv-num').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5).tickFormat(v => K.entero(v)).tickSizeOuter(0));
  const defs = svg.append('defs');
  defs.append('pattern').attr('id', 'vv-est').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)').append('line').attr('y2', 6).attr('stroke', 'var(--a2-est-line)').attr('stroke-width', 1.4);
  for (const r of filas) {
    const off = e.sel.map(String).includes(String(r.id)) && K.estaApagada(r.id);
    const col = off ? 'var(--a2-line-2, #b6bcb8)' : colorDe.get(r.k) || 'var(--a2-blue)';
    g.append('rect').attr('x', 0).attr('y', y(r.id)).attr('height', y.bandwidth()).attr('width', Math.max(1, x(r.v))).attr('fill', col)
      .attr('fill-opacity', r.f === 'I' ? 0.45 : null)
      .on('mousemove', ev => ctx.tooltip.mostrar(K.tipTitulo(K.etiquetaAnio(ind, A[i])) + K.tipFila({ nombre: (unis.get(r.id) || {}).nombre || r.id, valor: K.txtValor(ind, r.v), marca: K.marcaDe(r) }) + tipMinimo(ind.id, e.nivel, A[i], r.id), ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.tooltip.ocultar());
    if (r.f === '1') g.append('rect').attr('x', 0).attr('y', y(r.id)).attr('height', y.bandwidth()).attr('width', Math.max(1, x(r.v))).attr('fill', 'url(#vv-est)').style('pointer-events', 'none');
    g.append('text').attr('x', -8).attr('y', y(r.id) + y.bandwidth() / 2 + 4).attr('text-anchor', 'end').text(((unis.get(r.id) || {}).nombre || r.id).slice(0, W < 520 ? 14 : 24));
    g.append('text').attr('x', x(r.v) + 6).attr('y', y(r.id) + y.bandwidth() / 2 + 4).attr('class', 'vv-num').text(K.txtValor(ind, r.v).replace(' cabezas', ''));
  }
}
