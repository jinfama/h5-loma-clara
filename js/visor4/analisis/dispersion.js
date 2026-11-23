// dispersion.js — modo «Dispersión»: Y frente a X por unidad, recta MCO con banda del 95 %, Pearson y Spearman,
// tamaño por un tercer indicador, color por provincia y reproducción año a año (los puntos se mueven entre los años
// en que se pueden cruzar X e Y).

/* global d3 */
import * as X from './cruce.js';
import * as E from './estadistica.js';
import * as AN from './anios.js';
import * as EL from './escala.js';
import { filaLog, notaEjes, conLog, ConLog } from './ejes.js';
import { h, esc, num, sig, r2, pTxt, entero, valorTxt, corto, nombre, nombreMin, conUnidad, nombreProv, marcaTxt, seg, csv } from './comun.js';
import { INFO } from './ayuda.js';
import { botonIndicador } from './selector.js';

const D = { svg: null, frames: new Map(), clave: '', esc: null, W: 0, H: 0, sel: null };
const PREFIERE = ['empleo_pct_agricultura', 'usos_olivar_pct', 'poblacion_densidad', 'clima_prec', 'geo_altitud_mean', 'usos_labor_pct'];

export function yPorDefecto(S, x, nivel) {
  const ok = id => { const e = S.ctx.datos.indicador(id); return id !== x && X.analizable(e) && X.enNivel(e, nivel); };
  if (S.A.ay && ok(S.A.ay)) return S.A.ay;
  // sin elección: uno que comparta algún año con X (si no, el primero que haya)
  const ex = S.ctx.datos.indicador(x);
  const casa = id => ok(id) && X.compartenAnio(ex, S.ctx.datos.indicador(id), S.interp, S.ventana);
  const cat = S.ctx.datos.catalogoSinc();
  return PREFIERE.find(casa) || (cat.find(e => casa(e.id)) || {}).id || PREFIERE.find(ok) || (cat.find(e => ok(e.id)) || {}).id || '';
}
const esLogCat = ent => { const e = ent && (typeof ent.escala === 'string' ? ent.escala : ent.escala && ent.escala.tipo); return e === 'log'; };
/** Eje y cálculo de X e Y: lo elegido (`aej`, `atr`) o, si no, la escala del catálogo. */
const catalogo = S => [esLogCat(S.vars[0] && S.vars[0].ent), esLogCat(S.vars[1] && S.vars[1].ent)];
const estado = S => EL.estadoLog(S.A.aej, S.A.atr, catalogo(S));
/** Otra variable en X (0) o en Y (1): esa posición vuelve a su escala del catálogo. */
function eligeVar(S, j, id) {
  if (!id || id === (j ? S.A.ay : S.A.ax)) return;
  S.setA({ [j ? 'ay' : 'ax']: id, ...EL.alCambiarVariable(S.A.aej, S.A.atr, esLogCat(S.ctx.datos.indicador(id)), j) }, { historial: true });
}
const tr = (v, lg) => (lg ? Math.log10(v) : v);
/** Los puntos de un recorrido por los años, en trozos reales: sin unir los años que la base dice que no se unen. */
const trozosAnios = (S, pts) => { const cs = S.vars.map(v => AN.cortesDe(v.ent)); return AN.trozos(pts, [], { corta: (p, q) => AN.cruzaCorte(p.us, q.us, cs) }).filter(t => t.length > 1); };

/** Variables Y y X con su buscador y el botón de intercambiar; las usan dispersión, bivariante y tiempo. */
export function panelXY(S) {
  const nivel = S.nivelDatos(), x = S.A.ax, y = yPorDefecto(S, x, nivel);
  return { t: 'Variables', n: [
    h('div', { class: 'an-p-xy' },
      botonIndicador(S, { letra: 'Y', valor: y, nivel, excluir: [x], titulo: 'Variable Y (eje vertical)', clase: 'an-ind--y', alElegir: v => eligeVar(S, 1, v) }),
      S.controlAnio(y),
      botonIndicador(S, { letra: 'X', valor: x, nivel, excluir: [y], titulo: 'Variable X (eje horizontal)', clase: 'an-ind--x', alElegir: v => eligeVar(S, 0, v) }),
      S.controlAnio(x),
      h('button', { type: 'button', class: 'an-btn an-p-swap', title: 'Intercambiar X e Y', onclick: () => intercambia(S) }, '⇄ Intercambiar X e Y')),
  ] };
}
export function intercambia(S) { const x = S.A.ax, y = yPorDefecto(S, x, S.nivelDatos()); S.setA({ ax: y, ay: x, ...EL.alIntercambiar(S.A.aej, S.A.atr) }, { historial: true }); }
export const tituloXY = (S, conector = 'frente a', logs = [false, false]) => {
  const y = S.vars[1] && S.vars[1].ent, x = S.vars[0] && S.vars[0].ent;
  if (!x || !y) return null;
  // con años distintos, cada nombre con el suyo: «Rendimiento (1752) frente a precipitación (media 1961-1990)»
  const ny = ConLog(y, logs[1]), nx = conLog(x, logs[0]);   // si se calcula con el logaritmo, el título lo dice
  if (S.difAnios()) return { t: `${S.conAnio(1, ny)} ${conector} ${S.conAnio(0, nx)}`, s: `Y: ${conUnidad(y)} · X: ${conUnidad(x)}` };
  return { t: `${ny} ${conector} ${nx}${S.anio != null ? ', ' + S.anio : ''}`, s: `Y: ${conUnidad(y)} · X: ${conUnidad(x)}` };
};

export const dispersion = {
  reproducible: true,
  aniosPropios: true,
  plan(S) {
    const x = S.A.ax, y = yPorDefecto(S, x, S.nivelDatos());
    if (!y) return { error: 'No hay otro indicador con cifras por esta unidad territorial para cruzar.' };
    const z = S.A.az && S.A.az !== x && S.A.az !== y ? S.A.az : '';
    return { ids: [x, y], ancla: y, extra: z ? [z] : [] };
  },
  titulo(S) {
    const t = tituloXY(S, 'frente a', S.vars.length >= 2 ? estado(S).calculo : [false, false]);
    if (t && D.zVar && S.A.az) t.s += ` · tamaño: ${corto(D.zVar.ent)}`;
    return t;
  },
  panel(S) {
    return [
      panelXY(S),
      { t: 'Tamaño de las bolas', paso: 'aspecto', n: [botonIndicador(S, { valor: S.A.az, nivel: S.nivelDatos(), vacio: 'Ninguno: todas iguales', titulo: 'Un indicador para el área de cada bola (habitantes, por ejemplo)', alElegir: v => S.setA({ az: v }) }), S.A.az ? S.controlAnio(S.A.az) : null] },
      { t: 'Color', paso: 'aspecto', n: [seg('Color', [['prov', 'Por provincia'], ['no', 'Ninguno']], S.A.acol, v => S.setA({ acol: v }))] },
    ];
  },
  /** «Ejes y logaritmos»: para X y para Y, el eje (cómo se ve) y el cálculo (con qué se calcula). */
  ejes(S) {
    if (S.vars.length < 2) return [];
    const { ejes: e, calculo: c } = estado(S), cat = catalogo(S);
    const fila = (j, rol, info) => filaLog({ rol, nombre: corto(S.vars[j].ent), valores: S.valoresLog(S.vars[j]), eje: e[j], calculo: c[j], info, que: 'unidad', ques: 'unidades',
      alEje: on => S.setA(EL.cambiaEje(S.A.aej, S.A.atr, cat, j, on)), alCalculo: on => S.setA(EL.cambiaCalculo(S.A.aej, S.A.atr, cat, j, on)) });
    return [notaEjes(true), ...fila(1, 'Y', true), ...fila(0, 'X', false)];
  },
  resumenEjes(S) {
    if (S.vars.length < 2) return '';
    const { ejes: [ex, ey], calculo: [cx, cy] } = estado(S), con = [cy ? 'Y' : '', cx ? 'X' : ''].filter(Boolean);
    return `Eje Y ${ey ? 'log' : 'lineal'}, X ${ex ? 'log' : 'lineal'} · ${con.length ? `cálculo con log de ${con.join(' y ')}` : 'cálculo con las cifras'}`;
  },
  ajustes(S) {
    return [
      { t: 'Peso', n: [
        seg('Ponderar', [['', 'No'], ['pob', 'Pobl.', 'Por habitantes'], ['sup', 'Superf.', 'Por superficie oficial']], S.A.apond, v => S.setA({ apond: v }), { titulo: 'Sin ponderar, cada unidad pesa igual; ponderando, una unidad grande cuenta más en la recta y en r', info: INFO.ponderar }),
      ] },
      { t: 'Aspecto del gráfico', n: [
        seg('Ejes', [['f', 'Finos'], ['m', 'Marcados']], S.A.aeje, v => S.setA({ aeje: v })),
        seg('Rejilla', [['1', 'Sí'], ['0', 'No']], S.A.arej, v => S.setA({ arej: v })),
        seg('Etiquetas', [['1', 'Sí'], ['0', 'No']], S.A.arot, v => S.setA({ arot: v }), { titulo: 'Rotular las unidades que más se apartan de la recta (las elegidas, siempre)' }),
        seg('Recta', [['1', 'Con banda'], ['0', 'No']], S.A.arecta, v => S.setA({ arecta: v }), { titulo: 'Recta de mínimos cuadrados y su banda de confianza del 95 %' }),
        seg('Opacidad', [['100', '100 %'], ['80', '80 %'], ['55', '55 %'], ['30', '30 %']], S.A.aop, v => S.setA({ aop: v }), { titulo: 'Con muchas bolas encima unas de otras, menos opacidad deja ver la densidad' }),
      ] },
    ];
  },
  descargas(S) {
    return [
      h('button', { type: 'button', class: 'an-btn', onclick: () => exportarPares(S) }, 'CSV de pares'),
      h('button', { type: 'button', class: 'an-btn', onclick: () => exportarResultados(S) }, 'CSV de resultados'),
    ];
  },
  async pintar(S, cancelado) {
    await prepararFrames(S);
    if (cancelado()) return;
    const fr0 = D.frames.get(S.anio);
    if (!fr0 || S.sinUnidades(fr0.cr, fr0.f)) return;   // nunca en blanco: dice por qué y ofrece el arreglo
    construir(S);
    await dibujar(S, false);
  },
  async fotograma(S) {
    const fr = D.frames.get(S.anio);
    if (!fr || S.sinUnidades(fr.cr, fr.f)) return;   // un año sin unidades: se dice, no se deja en blanco
    if (!D.svg || !D.svg.node().isConnected) { S.enBlanco = false; construir(S); }
    await dibujar(S, !S.ctx.reduceMotion);
  },
  async redibujar(S) { if (!D.frames.size || !S.ui) return; construir(S); await dibujar(S, false); },
  seleccion(S) { dibujar(S, false); },
  destruir() { D.svg = null; D.frames.clear(); },
};

// ---------------------------------------------------------------- datos de cada año
async function prepararFrames(S) {
  const ctx = S.ctx, nivel = S.nivelDatos();
  const [cx, cy] = estado(S).calculo;   // el eje no entra en la clave: cambiarlo no recalcula nada
  const clave = JSON.stringify([S.vars.map(v => v.id), nivel, S.ventana, S.interp, S.opcionesFiltro(), cx, cy, S.A.apond, S.A.az, S.A.aanos]);
  if (clave !== D.clave) { D.frames.clear(); D.clave = clave; }
  // tamaño: preparado por index.js (S.extra) con su regla de año; sin regla, el año más cercano al del análisis
  const zVar = (S.extra || [])[0] || null;
  D.zVar = zVar;
  for (const a of S.anios) {
    if (D.frames.has(a)) continue;
    const cr = await X.cruzar(ctx, S.vars, nivel, a, S.ventana);
    if (!cr) continue;
    const pw = S.A.apond ? await X.pesos(ctx, S.A.apond, nivel, cr) : null;
    const f = X.filtrar(cr, { ...S.opcionesFiltro(), log: [cx, cy], pesos: pw ? pw.mapa : null });
    // tamaño: la cifra de Z de su año (el fijado, la media de su periodo o, si sigue, el más cercano al del análisis)
    let z = null;
    if (zVar) {
      const uz = X.anioUsado(zVar, a, Infinity);
      const cz = uz == null ? null : typeof uz === 'object' ? X.corteMedia(ctx, zVar, uz, nivel) : ctx.datos.corteDe(zVar.file, uz);
      z = { anio: uz == null ? null : X.etiquetaAnio(uz), mapa: new Map(), fuentes: cz && cz.fuentes };
      if (cz) cz.ids.forEach((id, k) => { if (cz.v[k] != null && cz.v[k] > 0) z.mapa.set(String(id), { v: +cz.v[k], f: (cz.f || '')[k] || '0' }); });
    }
    const xs = f.dentro.map(r => tr(r.vals[0].v, cx)), ys = f.dentro.map(r => tr(r.vals[1].v, cy)), w = pw ? f.dentro.map(r => r.w) : null;
    const m = E.mco(xs, ys, w);
    const pe = E.pearson(xs, ys, w), sp = f.dentro.length >= 3 ? E.spearman(xs, ys) : { rho: NaN, p: NaN };
    // residuos tipificados (para rotular a los que más se apartan)
    const res = m ? m.resid.map(e => e / m.s) : [];
    D.frames.set(a, { anio: a, cr, f, pw, z, m, pe, sp, res, ic: E.icFisher(pe.r, pe.n) });
  }
}

// ---------------------------------------------------------------- dibujo
/** Dominio ajustado a los datos que se ven. Lineal: del mínimo al máximo con un 5 % de margen y valores redondos (desde
 *  0 si el mínimo está cerca de 0). Log: de la potencia de 10 por debajo del mínimo a la de por encima del máximo; si
 *  eso deja más de la mitad del eje vacía, en pasos 1-2-5. */
export function dominioEje(vals, lg, pct = false) {
  const a = vals.filter(v => isFinite(v) && (!lg || v > 0));
  if (!a.length) return lg ? [1, 10] : [0, 1];
  let lo = Math.min(...a), hi = Math.max(...a);
  if (lg) {
    if (lo === hi) { lo /= 2; hi *= 2; }
    const dLo = 10 ** Math.floor(Math.log10(lo)), dHi = 10 ** Math.ceil(Math.log10(hi));
    const lleno = Math.log10(hi / lo) / Math.log10(dHi / dLo);
    if (lleno >= 0.5) return [dLo, dHi];
    const abajo = v => { const e = Math.floor(Math.log10(v)); for (const k of [5, 2, 1]) if (k * 10 ** e <= v * (1 + 1e-12)) return k * 10 ** e; return 10 ** e; };
    const arriba = v => { const e = Math.floor(Math.log10(v)); for (const k of [1, 2, 5, 10]) if (k * 10 ** e >= v * (1 - 1e-12)) return k * 10 ** e; return 10 ** (e + 1); };
    return [abajo(lo), arriba(hi)];
  }
  if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
  const pad = (hi - lo) * 0.05;
  let l2 = lo - pad, h2 = hi + pad;
  if (lo >= 0 && (lo <= 0.15 * hi || l2 < 0)) l2 = 0;
  const d = d3.scaleLinear().domain([l2, h2]).nice(6).domain();
  // un porcentaje que no pasa de 100 no se dibuja más allá de 100
  if (pct && hi <= 100 && d[1] > 100) d[1] = 100;
  return d;
}
/** Marcas del eje: en log, potencias de 10 (y 2 y 5 si hay pocas décadas). */
function marcas(s0, lg, n) {
  if (!lg) return s0.ticks(n);
  const [lo, hi] = s0.domain(), out = [];
  const pocas = Math.log10(hi / lo) < 2.5;
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const k of (pocas ? [1, 2, 5] : [1])) { const v = k * 10 ** e; if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v); }
  return out;
}

function construir(S) {
  const el = S.ui.graf;
  el.textContent = '';
  const W = Math.max(280, el.clientWidth), H = Math.max(240, el.clientHeight);
  D.W = W; D.H = H;
  const movil = W < 520;
  // márgenes: a la izquierda, la píldora vertical de Y y los números; abajo, los números y la píldora de X
  const m = { t: 16, r: movil ? 12 : 22, b: 64, l: movil ? 76 : 88 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const { ejes: [lx, ly], calculo: [cx, cy] } = estado(S);
  // el tamaño sí es el mismo en todos los años (para comparar bolas)
  const zs = [];
  for (const fr of D.frames.values()) if (fr.z) for (const r of fr.f.dentro) { const q = fr.z.mapa.get(r.id); if (q) zs.push(q.v); }
  const nivel = S.nivelDatos();
  const r0 = { provincia: 9, pj1888: 6 }[nivel] || 3.6;
  const rMax = { provincia: 34, pj1888: 18 }[nivel] || (movil ? 12 : 16);
  const sz = d3.scaleSqrt().domain([0, d3.max(zs) || 1]).range([0, rMax]);
  D.esc = { sz, r0, m, iw, ih, lx, ly, cx, cy, movil, sx: null, sy: null };
  const svg = d3.select(el).append('svg').attr('class', 'an-svg an-disp' + (S.A.aeje === 'm' ? ' is-marcado' : '')).attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H)
    .attr('role', 'img').attr('aria-label', `Dispersión: ${S.vars[1].ent.rotulo} frente a ${S.vars[0].ent.rotulo}`);
  D.svg = svg;
  const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`);
  D.g = g;
  // año de fondo, como en Gapminder
  D.marca = g.append('text').attr('class', 'an-fondo-anio').attr('x', iw - 6).attr('y', ih - 10).attr('text-anchor', 'end').style('font-size', Math.round(Math.min(120, ih * 0.26, iw * 0.2)) + 'px');
  D.gRejY = S.A.arej !== '0' ? g.append('g').attr('class', 'an-rej') : null;
  D.gRejX = S.A.arej !== '0' ? g.append('g').attr('class', 'an-rej').attr('transform', `translate(0,${ih})`) : null;
  D.gEjeX = g.append('g').attr('class', 'an-eje').attr('transform', `translate(0,${ih})`);
  D.gEjeY = g.append('g').attr('class', 'an-eje');
  // los rótulos de los ejes son selectores: X centrado bajo su eje; Y, en vertical a media altura de su eje
  const nivelD = S.nivelDatos(), xi = S.A.ax, yi = S.vars[1].id;
  const ejeY = botonIndicador(S, { letra: 'Y', valor: yi, nivel: nivelD, excluir: [xi], titulo: 'Pincha para cambiar la variable del eje vertical (Y)', clase: 'an-eje-sel an-eje-sel--y an-ind--y', sufijo: '', conUnidad: true, alElegir: v => eligeVar(S, 1, v) });
  const ejeX = botonIndicador(S, { letra: 'X', valor: xi, nivel: nivelD, excluir: [yi], titulo: 'Pincha para cambiar la variable del eje horizontal (X)', clase: 'an-eje-sel an-eje-sel--x', sufijo: '', conUnidad: true, alElegir: v => eligeVar(S, 0, v) });
  ejeY.style.left = '6px'; ejeY.style.top = `${m.t + ih / 2}px`; ejeY.style.maxHeight = `${Math.max(160, ih - 8)}px`;
  ejeX.style.left = `${m.l + iw / 2}px`; ejeX.style.bottom = '6px'; ejeX.style.maxWidth = `${Math.max(200, iw - 40)}px`;
  const cambio = h('button', { type: 'button', class: 'an-ctl an-swap', title: 'Intercambiar X e Y', 'aria-label': 'Intercambiar X e Y', onclick: () => intercambia(S) }, '⇄');
  cambio.style.left = '8px'; cambio.style.bottom = '8px';
  el.append(ejeY, ejeX, cambio);
  D.ejes = { y: ejeY, x: ejeX };
  D.gEstela = g.append('g').attr('class', 'an-estela');
  // la línea no sale del área del gráfico (con eje y cálculo distintos puede irse lejos)
  svg.append('clipPath').attr('id', 'an-disp-clip').append('rect').attr('width', iw).attr('height', ih);
  D.banda = g.append('path').attr('class', 'an-banda').attr('clip-path', 'url(#an-disp-clip)');
  D.recta = g.append('path').attr('class', 'an-recta').attr('clip-path', 'url(#an-disp-clip)');
  D.gPts = g.append('g').attr('class', 'an-pts');
  D.gRes = g.append('g').attr('class', 'an-pts-res').style('pointer-events', 'none');
  D.gRot = g.append('g').attr('class', 'an-rot').style('pointer-events', 'none');
  D.hov = g.append('circle').attr('class', 'an-hov').attr('r', 0);
  // interacción: el punto más cercano (Delaunay), con un radio de 24 px
  const capa = g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent');
  const cerca = ev => {
    const fr = D.frames.get(S.anio); if (!fr || !D.del) return null;
    const [px, py] = d3.pointer(ev, capa.node());
    const k = D.del.find(px, py);
    const p = D.pos[k];
    return p && Math.hypot(p.x - px, p.y - py) <= Math.max(24, p.r + 6) ? p : null;
  };
  capa.on('mousemove', ev => { const p = cerca(ev); if (!p) { D.hov.attr('r', 0); S.ctx.tooltip.ocultar(); return; } D.hov.attr('cx', p.x).attr('cy', p.y).attr('r', p.r + 3); S.ctx.tooltip.mostrar(ficha(S, p.fila, p.k), ev.clientX, ev.clientY); })
    .on('mouseleave', () => { D.hov.attr('r', 0); S.ctx.tooltip.ocultar(); })
    .on('click', ev => { const p = cerca(ev); if (!p) return; const sel = S.ctx.estado.sel; S.ctx.set({ sel: sel.includes(p.fila.id) ? sel.filter(x => x !== p.fila.id) : [...sel, p.fila.id] }); });
}

function ficha(S, r, k) {
  const fr = D.frames.get(S.anio);
  const v = S.vars;
  const linea = (ent, c, anio) => `<div class="an-tt-f"><span>${esc(corto(ent))} <small>${anio ?? 'fija'}</small></span><b>${esc(valorTxt(ent, c.v))}</b></div><div class="an-tt-m">${esc(marcaTxt(c.f))}${c.parcial ? ` · suma parcial${c.parcial.n != null ? `: ${c.parcial.n} de ${c.parcial.m}` : ''}` : ''}${c.res ? ' · ' + esc(c.res) : ''}</div>`;
  let html = `<strong>${esc(r.nombre)}</strong>${r.prov ? `<div class="an-tt-m">${esc(nombreProv(r.prov))}</div>` : ''}`;
  html += linea(v[1].ent, r.vals[1], v[1].fijo ? 'de hoy' : fr.cr.usados[1]) + linea(v[0].ent, r.vals[0], v[0].fijo ? 'de hoy' : fr.cr.usados[0]);
  if (fr.z) { const q = fr.z.mapa.get(r.id); html += `<div class="an-tt-f"><span>${esc(corto(D.zVar.ent))} <small>${fr.z.anio ?? ''}</small></span><b>${q ? esc(valorTxt(D.zVar.ent, q.v)) : 'sin dato'}</b></div>`; }
  if (fr.m && k != null && fr.res[k] != null) html += `<div class="an-tt-m">Se aparta de la recta ${num(Math.abs(fr.res[k]), 1)} desv. típicas ${fr.res[k] > 0 ? 'por encima' : 'por debajo'}</div>`;
  if (S.A.apond && r.w) html += `<div class="an-tt-m">Peso: ${esc(num(r.w))}</div>`;
  html += '<div class="an-tt-m">Clic: destacar o quitar (deja su estela al reproducir)</div>';
  return html;
}

async function dibujar(S, animar) {
  if (!D.svg || !S.ui) return;
  let fr = D.frames.get(S.anio);
  if (!fr) { await prepararFrames(S); fr = D.frames.get(S.anio); }
  if (!fr) return;
  const { sz, r0, iw, ih, lx, ly, cx, cy, movil } = D.esc;
  // en un eje logarítmico solo se puede dibujar lo mayor que cero; lo demás sigue en los cálculos, y se dice
  const seVe = r => (!lx || r.vals[0].v > 0) && (!ly || r.vals[1].v > 0);
  const visibles = fr.f.dentro.filter(seVe);
  fr.noDibujadas = fr.f.dentro.length - visibles.length;
  if (!visibles.length && fr.f.dentro.length) {
    S.vacio('En este eje logarítmico no se puede dibujar ninguna unidad: todas tienen cero o negativo.',
      h('div', { class: 'an-vacio__btns' }, h('button', { type: 'button', class: 'an-btn', onclick: () => { let q = { aej: S.A.aej, atr: S.A.atr }; const cat = catalogo(S); for (const j of [0, 1]) q = EL.cambiaEje(q.aej, q.atr, cat, j, false); S.setA(q); } }, 'Volver al eje lineal')));
    return;
  }
  // ejes ajustados a los datos de este año (con los filtros puestos)
  const esPct = j => /^%/.test(S.vars[j].ent.unidad || '');
  const sx = (lx ? d3.scaleLog() : d3.scaleLinear()).domain(dominioEje(visibles.map(r => r.vals[0].v), lx, esPct(0))).range([0, iw]);
  const sy = (ly ? d3.scaleLog() : d3.scaleLinear()).domain(dominioEje(visibles.map(r => r.vals[1].v), ly, esPct(1))).range([ih, 0]);
  const primera = !D.esc.sx;
  D.esc.sx = sx; D.esc.sy = sy;
  const dur = animar ? 650 : 0;
  const t = D.svg.transition().duration(dur).ease(d3.easeCubicInOut);
  const fundido = D.svg.transition('fundido').duration(animar || !primera ? 150 : 0);
  const tx = marcas(sx, lx, movil ? 4 : 7), ty = marcas(sy, ly, movil ? 4 : 6);
  const eje = (sel, ax) => (animar ? sel.transition(t) : sel).call(ax);
  if (D.gRejY) eje(D.gRejY, d3.axisLeft(sy).tickValues(ty).tickSize(-iw).tickFormat('')), D.gRejY.select('.domain').remove();
  if (D.gRejX) eje(D.gRejX, d3.axisBottom(sx).tickValues(tx).tickSize(-ih).tickFormat('')), D.gRejX.select('.domain').remove();
  eje(D.gEjeX, d3.axisBottom(sx).tickValues(tx).tickFormat(v => num(v)).tickSizeOuter(0));
  eje(D.gEjeY, d3.axisLeft(sy).tickValues(ty).tickFormat(v => num(v)).tickSizeOuter(0));
  D.marca.text(S.anio);
  // el año de cada eje sigue al fotograma (con ventana, el de cada indicador)
  if (D.ejes) [[D.ejes.x, 0, lx, cx], [D.ejes.y, 1, ly, cy]].forEach(([b, j, lg, cal]) => { let s = b.querySelector('.an-ind__a'); if (!s) { s = h('span', { class: 'an-ind__a' }); b.querySelector('.an-ind__v').before(s); } s.textContent = `${S.vars[j].fijo ? 'de hoy' : fr.cr.usados[j]}${lg && cal ? ' · log' : lg ? ' · eje log' : cal ? ' · cálculo log' : ''}`; });
  const sel = new Set(S.ctx.estado.sel.map(String));
  // puntos
  const datos = fr.f.dentro.map((r, k) => [r, k]).filter(([r]) => seVe(r)).map(([r, k]) => {
    const q = fr.z ? fr.z.mapa.get(r.id) : null;
    const rad = fr.z ? (q ? Math.max(2, sz(q.v)) : 2.5) : r0;
    return { id: r.id, fila: r, k, x: sx(r.vals[0].v), y: sy(r.vals[1].v), r: rad, sinZ: !!fr.z && !q };
  }).sort((a, b) => b.r - a.r);
  D.pos = datos; D.del = d3.Delaunay.from(datos, p => p.x, p => p.y);
  const sim = p => d3.symbol().type(p.fila.par ? d3.symbolSquare : d3.symbolCircle).size(Math.PI * p.r * p.r * (p.fila.par ? 0.8 : 1))();
  // color por provincia o ninguno (tinta); estimada = relleno muy claro y borde de su color; opacidad, la elegida
  const color = p => (S.A.acol === 'prov' ? X.COLOR_PROV[p.fila.prov] || '#6b6b6b' : '#3a3a3a');
  const op = Math.max(0.1, Math.min(1, (+S.A.aop || 80) / 100));
  // las que entran aparecen en su sitio (fundido de 150 ms, sin moverse); las que siguen se desplazan; las que salen se desvanecen
  const pts = D.gPts.selectAll('path').data(datos, p => p.id).join(
    en => en.append('path').attr('data-id', p => p.id).attr('transform', p => `translate(${p.x},${p.y})`).attr('opacity', 0).call(s => s.transition(fundido).attr('opacity', 1)),
    ac => ac.call(s => s.transition(t).attr('transform', p => `translate(${p.x},${p.y})`).attr('opacity', 1)),
    sa => sa.call(s => s.transition(fundido).attr('opacity', 0).remove()),
  );
  pts.attr('d', sim)
    .attr('fill', p => color(p))
    .attr('fill-opacity', p => (p.fila.est ? op * 0.22 : op))
    .attr('stroke', p => (sel.has(p.id) ? '#101010' : p.fila.est ? color(p) : '#ffffff'))
    .attr('stroke-width', p => (sel.has(p.id) ? 2.4 : p.fila.est ? 1.5 : 0.6))
    .attr('stroke-dasharray', p => (p.sinZ ? '2 1.5' : null));
  // anillo de puntos ocres: con reserva o en revisión (y aro de las destacadas)
  D.gRes.selectAll('circle').data(datos.filter(p => p.fila.res || sel.has(p.id)), p => p.id).join(
    en => en.append('circle').attr('cx', p => p.x).attr('cy', p => p.y).attr('opacity', 0).call(s => s.transition(fundido).attr('opacity', 1)),
    ac => ac.call(s => s.transition(t).attr('cx', p => p.x).attr('cy', p => p.y)),
    sa => sa.call(s => s.transition(fundido).attr('opacity', 0).remove()),
  ).attr('r', p => p.r + (sel.has(p.id) ? 4 : 2.4)).attr('fill', 'none')
    .attr('stroke', p => (sel.has(p.id) ? '#101010' : '#c27c0e')).attr('stroke-width', p => (sel.has(p.id) ? 1.6 : 1.3)).attr('stroke-dasharray', p => (sel.has(p.id) ? null : '1.6 1.6'));
  // recta y banda del modelo (calculado con la cifra o con su logaritmo), dibujadas en la escala de cada eje
  if (fr.m && S.A.arecta !== '0') {
    // se recorre el eje y, en cada punto, se pregunta al modelo: si eje y cálculo no van en la misma escala, sale curva
    const inv = (v, lg) => (lg ? 10 ** v : v);
    const x0 = d3.min(datos, p => p.x), x1 = d3.max(datos, p => p.x);
    const aY = v => (ly && !(v > 0) ? 3 * ih : Math.max(-2 * ih, Math.min(3 * ih, sy(v))));
    const pr = d3.range(0, 121).map(i => {
      const px = x0 + (x1 - x0) * i / 120, t0 = EL.transforma(sx.invert(px), cx);
      if (t0 == null) return null;
      const b = fr.m.banda(t0), fv = inv(b.f, cy);
      return ly && !(fv > 0) ? null : { x: px, f: aY(fv), lo: aY(inv(b.lo, cy)), hi: aY(inv(b.hi, cy)) };
    }).filter(p => p && isFinite(p.f) && isFinite(p.lo) && isFinite(p.hi));
    (animar ? D.recta.transition(t) : D.recta).attr('d', d3.line().x(p => p.x).y(p => p.f)(pr)).attr('opacity', 1);
    (animar ? D.banda.transition(t) : D.banda).attr('d', d3.area().x(p => p.x).y0(p => p.lo).y1(p => p.hi)(pr)).attr('opacity', 1);
  } else { D.recta.attr('opacity', 0); D.banda.attr('opacity', 0); }
  // estelas de las unidades destacadas (su recorrido por los años del análisis, en la escala de este año)
  const estelas = [...sel].map(id => ({ id, pts: S.anios.map(a => { const f2 = D.frames.get(a); const r = f2 && f2.f.dentro.find(q => q.id === id); return r && (!lx || r.vals[0].v > 0) && (!ly || r.vals[1].v > 0) ? { a, us: f2.cr.usados, x: sx(r.vals[0].v), y: sy(r.vals[1].v) } : null; }).filter(Boolean) })).filter(e => e.pts.length > 1);
  D.gEstela.selectAll('path').data(estelas, e => e.id).join('path').attr('d', e => { const lin = d3.line().x(p => p.x).y(p => p.y).curve(d3.curveCatmullRom); return trozosAnios(S, e.pts).map(t => lin(t)).join(''); });
  D.gEstela.selectAll('g').data(estelas, e => e.id).join('g').selectAll('circle').data(e => e.pts).join('circle').attr('cx', p => p.x).attr('cy', p => p.y).attr('r', 1.8);
  // rótulos: destacadas y, si se pide, las cinco que más se apartan de la recta
  let rot = datos.filter(p => sel.has(p.id));
  if (S.A.arot === '1' && fr.m && fr.f.dentro.length >= 15) {
    const top = fr.f.dentro.map((r, k) => ({ id: r.id, e: Math.abs(fr.res[k]) })).sort((a, b) => b.e - a.e).slice(0, movil ? 3 : 5).map(q => q.id);
    rot = rot.concat(datos.filter(p => top.includes(p.id) && !sel.has(p.id)));
  }
  // rótulos sin pisarse: a la derecha del punto, a la izquierda, encima o debajo; si no cabe, no se rotula
  const cajas = [], ancho = t0 => t0.length * 6.1 + 4, alto = 13;
  const choca = b => b.x0 < 0 || b.x1 > iw || b.y0 < -10 || b.y1 > ih || cajas.some(c => b.x0 < c.x1 && b.x1 > c.x0 && b.y0 < c.y1 && b.y1 > c.y0);
  const etiquetas = [];
  for (const p of rot.sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0))) {
    const txt = p.fila.nombre.length > 26 ? p.fila.nombre.slice(0, 25) + '…' : p.fila.nombre, w = ancho(txt);
    const ops = [[p.x + p.r + 4, p.y + 4, 'start'], [p.x - p.r - 4, p.y + 4, 'end'], [p.x - w / 2, p.y - p.r - 5, 'start'], [p.x - w / 2, p.y + p.r + 13, 'start']];
    for (let q = 0; q < ops.length; q++) {
      const [x0, y0, anc] = ops[q];
      const bx = anc === 'end' ? x0 - w : x0;
      const b = { x0: bx, x1: bx + w, y0: y0 - alto + 2, y1: y0 + 2 };
      if (!choca(b) || (sel.has(p.id) && q === ops.length - 1)) { cajas.push(b); etiquetas.push({ ...p, txt, lx: x0, ly: y0, anc }); break; }
    }
  }
  // halo blanco como texto aparte (no paint-order: así sale también en el PNG del visor)
  for (const [cl, halo] of [['an-halo', true], ['an-txt', false]]) {
    D.gRot.selectAll('text.' + cl).data(etiquetas, p => p.id).join(
      en => en.append('text').attr('x', p => p.lx).attr('y', p => p.ly).attr('opacity', 0).call(s => s.transition(fundido).attr('opacity', 1)),
      ac => ac.call(s => s.transition(t).attr('x', p => p.lx).attr('y', p => p.ly)),
      sa => sa.call(s => s.transition(fundido).attr('opacity', 0).remove()),
    ).attr('class', p => cl + (sel.has(p.id) ? ' is-sel' : '')).text(p => p.txt)
      .attr('stroke', halo ? '#ffffff' : null).attr('stroke-width', halo ? 3 : null).attr('stroke-linejoin', halo ? 'round' : null)
      .attr('text-anchor', p => p.anc);
  }
  resultados(S, fr);
  cuenta(S, fr);
}

// ---------------------------------------------------------------- resultados (panel de la derecha)
function lectura(S, fr) {
  const [lx, ly] = [D.esc.cx, D.esc.cy];   // lo que cuenta para leer la pendiente es el cálculo, no el eje
  const b = fr.m.b, ex = S.vars[0].ent, ey = S.vars[1].ent;
  // en minúscula solo la primera letra (no las siglas: SPI-12); sin unidad si es un índice sin dimensiones
  const min = t => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
  const nx = min(corto(ex)), ny = min(corto(ey));
  const sinU = u => (/^índice|adimensional/i.test(u || '') ? '' : (u || ''));
  const ux = sinU(ex.unidad), uy = sinU(ey.unidad);
  const pasoX = /^%/.test(ux) ? `cada punto más de ${nx}` : `cada ${ux || 'unidad'} más de ${nx}`;
  const cambio = (v, u) => `${v >= 0 ? 'sube' : 'baja'} ${sig(Math.abs(v), 2)}${u ? (/^%/.test(u) ? ' puntos' : ' ' + u) : ''}`;
  if (lx && ly) return `Con un 1 % más de ${nx}, ${ny} ${b >= 0 ? 'sube' : 'baja'} un ${sig(Math.abs(b), 2)} %, de media (elasticidad).`;
  if (!lx && ly) { const p = (10 ** b - 1) * 100; return `Por ${pasoX}, ${ny} ${p >= 0 ? 'sube' : 'baja'} un ${sig(Math.abs(p), 2)} %, de media.`; }
  if (lx && !ly) return `Con un 10 % más de ${nx}, ${ny} ${cambio(b * Math.log10(1.1), uy)}, de media.`;
  return `Por ${pasoX}, ${ny} ${cambio(b, uy)}, de media.`;
}
/** Si se calcula con logaritmos o el eje no va en la escala del cálculo, se dice. */
function avisoEscala(S, fr) {
  const { lx, ly, cx, cy } = D.esc, p = [];
  const con = [[1, cy], [0, cx]].filter(q => q[1]).map(q => nombreMin(S.vars[q[0]].ent));
  if (con.length) p.push(`Calculado con el logaritmo de ${con.join(' y ')}: r, la pendiente y p son de los logaritmos, no de las cifras.`);
  if (lx !== cx || ly !== cy) p.push('La línea se ve curva porque el eje y el cálculo no van en la misma escala.');
  if (fr.noDibujadas) p.push(`${entero(fr.noDibujadas)} ${fr.noDibujadas === 1 ? 'unidad con cero o negativo no se dibuja' : 'unidades con cero o negativo no se dibujan'} en el eje logarítmico, pero ${fr.noDibujadas === 1 ? 'sigue' : 'siguen'} en el cálculo.`);
  return p.join(' ');
}
function ecuacion(S, fr) {
  const lx = D.esc.cx, ly = D.esc.cy;
  const nx = lx ? 'log X' : 'X', ny = ly ? 'log Y' : 'Y';
  return `${ny} = ${sig(fr.m.a)} ${fr.m.b < 0 ? '−' : '+'} ${sig(Math.abs(fr.m.b))} · ${nx}`;
}
/** Lo que enseña el botón «Fuentes»: X, Y, el tamaño y el peso, cada uno con su año. */
function fuentesDe(S, fr) {
  const extra = [];
  if (fr.z) extra.push({ t: `Tamaño: ${corto(D.zVar.ent)}`, a: fr.z.anio ?? '', ids: fr.z.fuentes || D.zVar.ent.fuentes || [] });
  if (fr.pw) extra.push({ t: `Peso: ${fr.pw.texto}`, ids: fr.pw.fuentes || [], txt: 'superficie_ha de la base (IECA)' });
  return S.fuentesCruce(fr.cr, extra);
}
function resultados(S, fr) {
  S.ponFuentes(fuentesDe(S, fr));
  const el = S.ui.res;
  const n = fr.f.dentro.length;
  const avisoAnio = S.avisoAnios(fr.cr.usados) ? `<p class="an-nota an-nota--aviso">${esc(S.avisoAnios(fr.cr.usados))}</p>` : '';
  const avisoEsc = avisoEscala(S, fr) ? `<p class="an-nota an-nota--aviso">${esc(avisoEscala(S, fr))}</p>` : '';
  const fijoTxt = S.vars.some(v => v.fijo) ? `<p class="an-nota">${esc(corto(S.vars.find(v => v.fijo).ent))} es una cifra fija (un rasgo de hoy): se cruza igual con cualquier año.</p>` : '';
  const debil = n > 0 && n < 30 ? `<p class="an-nota an-nota--aviso">Solo ${n} unidades: los estadísticos son frágiles.</p>` : '';
  const term = fr.cr.cortesDistintos ? '<p class="an-nota an-nota--aviso">X e Y van por términos de cortes distintos: solo se cruzan las unidades que coinciden.</p>' : '';
  if (!fr.m || n < 3) {
    el.innerHTML = `<p class="an-nota an-nota--aviso">Con ${n} unidades no se puede calcular nada.</p>${avisoAnio}`;
    return;
  }
  const pond = S.A.apond ? `Ponderada por ${fr.pw.texto}.` : 'Sin ponderar: cada unidad pesa igual.';
  const marcas = `<ul class="an-ley">
      <li><i class="an-sw an-sw--obs"></i>observada o calculada</li><li><i class="an-sw an-sw--est"></i>estimada (X o Y)</li>
      ${fr.f.cuenta.par ? '<li><i class="an-sw an-sw--par"></i>suma parcial</li>' : ''}${fr.f.cuenta.res ? '<li><i class="an-sw an-sw--res"></i>con reserva o en revisión</li>' : ''}
      ${fr.z ? '<li><i class="an-sw an-sw--sinz"></i>sin cifra de tamaño</li>' : ''}</ul>
    ${S.A.acol === 'prov' ? `<ul class="an-ley an-ley--prov">${X.PROV.map(p => `<li><i class="an-sw" style="background:${X.COLOR_PROV[p]}"></i>${esc(nombreProv(p))}</li>`).join('')}</ul>` : ''}`;
  el.innerHTML = `
    <div class="an-r__big"><span class="an-r__n">${r2(fr.pe.r)}</span><span class="an-r__l">r de Pearson${S.A.apond ? ' ponderada' : ''}</span></div>
    <dl class="an-dl an-dl--clave">
      <dt>R²</dt><dd>${r2(fr.m.r2)}</dd>
      <dt>Pendiente</dt><dd>${sig(fr.m.b)}</dd>
      <dt>Unidades</dt><dd>${S.nTxt(n)}</dd>
    </dl>
    <p class="an-lectura">${esc(lectura(S, fr))} Es una asociación entre territorios, no un efecto.</p>
    ${avisoEsc}${avisoAnio}${fijoTxt}${debil}${term}
    ${fr.z ? `<p class="an-r__k">Tamaño: ${esc(corto(D.zVar.ent))} <small>${fr.z.anio ?? ''}</small></p><div class="an-tam">${leyendaTamano()}</div>` : ''}
    ${marcas}
    ${S.mas(`
      <dl class="an-dl">
        <dt>r: IC 95 %</dt><dd>${r2(fr.ic[0])} a ${r2(fr.ic[1])}</dd>
        <dt>r: p</dt><dd>${pTxt(fr.pe.p)}</dd>
        <dt>Spearman (ρ)</dt><dd>${r2(fr.sp.rho)} · p ${pTxt(fr.sp.p)}</dd>
        <dt>Pendiente: IC 95 %</dt><dd>${sig(fr.m.icB[0])} a ${sig(fr.m.icB[1])}</dd>
        <dt>Pendiente: p</dt><dd>${pTxt(fr.m.pB)}</dd>
      </dl>
      <p class="an-ec">${esc(ecuacion(S, fr))}</p>
      <p class="an-nota">R² = ${r2(fr.m.r2)}: el ${num(fr.m.r2 * 100, 0)} % de la variación de Y entre unidades va con la de X. ${esc(pond)}</p>
      <div class="an-rt" ${S.anios.length > 1 ? '' : 'hidden'}><p class="an-r__k">r en cada año <small>(banda: IC 95 %; clic para ir)</small></p><div class="an-rt__g"></div></div>`)}`;
  if (S.anios.length > 1) { const g = el.querySelector('.an-rt__g'); const det = el.querySelector('.an-mas'); if (det && det.open) rEnElTiempo(S, g); else if (det) det.addEventListener('toggle', () => { if (det.open && !g.firstChild) rEnElTiempo(S, g); }, { once: true }); }
}
/** Leyenda de tamaños: tres círculos con la misma escala de área que el gráfico. */
function leyendaTamano() {
  const sz = D.esc && D.esc.sz; if (!sz) return '';
  const max = sz.domain()[1];
  const red = v => { if (!(v > 0)) return 0; const p = 10 ** Math.floor(Math.log10(v)); return Math.round(v / p) * p; };
  const vals = [...new Set([red(max), red(max / 5), red(max / 25)])].filter(v => v > 0 && sz(v) >= 2);
  if (!vals.length) return '';
  const rs = vals.map(v => sz(v)), H = 2 * rs[0] + 20;
  let x = 2;
  const c = vals.map((v, i) => { const r = rs[i], ancho = Math.max(2 * r, num(v).length * 6.5) + 14, cx = x + ancho / 2; x += ancho; return `<circle cx="${cx}" cy="${2 * rs[0] - r + 2}" r="${r}" fill="none" stroke="#6b6b6b"/><text x="${cx}" y="${H - 2}" text-anchor="middle">${esc(num(v))}</text>`; }).join('');
  const W = Math.max(x, 60);
  return `<svg class="an-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Leyenda de tamaños">${c}</svg>`;
}

function rEnElTiempo(S, el) {
  const pts = S.anios.map(a => D.frames.get(a)).filter(f => f && f.pe && isFinite(f.pe.r) && f.pe.n >= 4).map(f => ({ a: f.anio, us: f.cr.usados, r: f.pe.r, lo: f.ic[0], hi: f.ic[1], n: f.pe.n }));
  if (pts.length < 2) { el.parentNode.hidden = true; return; }
  const W = Math.max(200, el.getBoundingClientRect().width || 240), H = 92, m = { t: 6, r: 8, b: 18, l: 26 };
  const x = d3.scaleLinear().domain(d3.extent(pts, p => p.a)).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([-1, 1]).range([H - m.b, m.t]);
  const svg = d3.select(el).append('svg').attr('class', 'an-svg an-mini').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'r de Pearson en cada año');
  svg.append('line').attr('class', 'an-cero').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([-1, 0, 1]).tickFormat(v => num(v)).tickSize(3));
  svg.append('g').attr('class', 'an-eje').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(x.domain()).tickFormat(d3.format('d')).tickSize(3));
  const partes = trozosAnios(S, pts), banda = d3.area().x(p => x(p.a)).y0(p => y(p.lo)).y1(p => y(p.hi)), linea = d3.line().x(p => x(p.a)).y(p => y(p.r));
  svg.append('path').attr('class', 'an-banda').attr('d', partes.map(t => banda(t)).join(''));
  svg.append('path').attr('class', 'an-recta an-recta--fina').attr('d', partes.map(t => linea(t)).join(''));
  svg.selectAll('circle').data(pts).join('circle').attr('cx', p => x(p.a)).attr('cy', p => y(p.r)).attr('r', p => (p.a === S.anio ? 4 : 2)).attr('class', p => (p.a === S.anio ? 'is-on' : null))
    .style('cursor', 'pointer').on('click', (ev, p) => { S.para(); S.irAAnio(p.a); dibujar(S, !S.ctx.reduceMotion); })
    .append('title').text(p => `${p.a}: r = ${r2(p.r)} (n = ${p.n})`);
}

function cuenta(S, fr) {
  const pw = fr.pw && S.A.apond ? ` · ponderado por ${fr.pw.texto}` : '';
  S.pintaCuenta(fr.f.cuenta, S.vars, { extra: pw.replace(/^ · /, '') });
}

// ---------------------------------------------------------------- CSV
function exportarPares(S) {
  const fr = D.frames.get(S.anio); if (!fr) return;
  const v = S.vars;
  const fu = j => (fr.cr.fuentes[j] || []).map(i => S.ctx.fuentes.nombreFuente(i)).join('; ');
  const cab = ['id', 'unidad', 'provincia'];
  v.forEach((x, j) => cab.push(`${j ? 'y' : 'x'}_indicador`, `${j ? 'y' : 'x'}_valor`, `${j ? 'y' : 'x'}_calculo`, `${j ? 'y' : 'x'}_valor_en_calculo`, `${j ? 'y' : 'x'}_unidad`, `${j ? 'y' : 'x'}_anio`, `${j ? 'y' : 'x'}_marca`, `${j ? 'y' : 'x'}_reserva_o_suma_parcial`, `${j ? 'y' : 'x'}_fuente_original`));
  if (fr.z) cab.push('tamano_indicador', 'tamano_valor', 'tamano_anio');
  cab.push('peso', 'entra', 'motivo_si_no_entra', 'se_dibuja', 'ajustado_recta', 'residuo');
  const dentro = new Map(fr.f.dentro.map((r, k) => [r.id, k]));
  const fo = S.opcionesFiltro();
  const filas = [cab];
  for (const r of fr.cr.filas) {
    const f = [r.id, r.nombre, nombreProv(r.prov)];
    r.vals.forEach((c, j) => f.push(v[j].id, c.v, [D.esc.cx, D.esc.cy][j] ? 'log10' : 'cifra', EL.transforma(c.v, [D.esc.cx, D.esc.cy][j]) ?? '', v[j].ent.unidad || '', v[j].fijo ? 'fija' : fr.cr.usados[j], marcaTxt(c.f), [c.res, c.parcial ? `suma parcial${c.parcial.n != null ? ` ${c.parcial.n} de ${c.parcial.m}` : ''}` : ''].filter(Boolean).join('; '), fu(j)));
    if (fr.z) { const q = fr.z.mapa.get(r.id); f.push(D.zVar.id, q ? q.v : '', fr.z.anio ?? ''); }
    const k = dentro.get(r.id);
    let motivo = '';
    if (k == null) {
      if (r.vals.some(c => c.v == null)) motivo = 'sin dato';
      else if (fo.est && r.vals.some(c => X.esEst(c.f))) motivo = 'estimada (excluidas)';
      else if (fo.par && r.vals.some(c => c.f === '5' || c.parcial)) motivo = 'suma parcial (excluidas)';
      else if (fo.res && r.vals.some(c => c.f === '2')) motivo = 'con reserva o en revisión (excluidas)';
      else if (r.vals.some((c, j) => [D.esc.cx, D.esc.cy][j] && !(c.v > 0))) motivo = 'cero o negativo: no tiene logaritmo';
      else motivo = 'sin peso';
    }
    const peso = S.A.apond && fr.pw ? fr.pw.mapa.get(r.id) ?? '' : 1;
    const aj = k != null && fr.m ? fr.m.a + fr.m.b * tr(r.vals[0].v, D.esc.cx) : '';
    f.push(peso, k != null ? 'sí' : 'no', motivo, k != null && (!D.esc.lx || r.vals[0].v > 0) && (!D.esc.ly || r.vals[1].v > 0) ? 'sí' : 'no', aj, k != null && fr.m ? fr.m.resid[k] : '');
    filas.push(f);
  }
  if (S.avisoAnios(fr.cr.usados)) filas.push([`# ${S.avisoAnios(fr.cr.usados)}`]);
  if (avisoEscala(S, fr)) filas.push([`# ${avisoEscala(S, fr)}`]);
  csv(`analisis_pares__${v[1].id}__frente_a__${v[0].id}__${S.nivelDatos()}__${S.anio}.csv`, filas);
}
function exportarResultados(S) {
  const fr = D.frames.get(S.anio); if (!fr) return;
  const v = S.vars, cu = fr.f.cuenta, fo = S.opcionesFiltro();
  const filas = [['clave', 'valor']];
  const p = (k, val) => filas.push([k, val]);
  p('analisis', 'dispersión y recta de mínimos cuadrados');
  p('y', `${v[1].ent.rotulo} (${v[1].id})`); p('x', `${v[0].ent.rotulo} (${v[0].id})`);
  p('nivel', S.nivelDatos()); p('anio_x', v[0].fijo ? 'fija' : fr.cr.usados[0]); p('anio_y', v[1].fijo ? 'fija' : fr.cr.usados[1]); p('ventana_anios', S.ventana);
  p('eje_x', D.esc.lx ? 'logarítmico' : 'lineal'); p('eje_y', D.esc.ly ? 'logarítmico' : 'lineal');
  p('calculo_x', D.esc.cx ? 'log10 de la cifra' : 'la cifra'); p('calculo_y', D.esc.cy ? 'log10 de la cifra' : 'la cifra');
  p('sin_dibujar_en_eje_log', fr.noDibujadas || 0);
  if (avisoEscala(S, fr)) p('aviso_escala', avisoEscala(S, fr));
  p('estimadas', fo.est ? 'excluidas' : 'incluidas'); p('sumas_parciales', fo.par ? 'excluidas' : 'incluidas'); p('reserva_o_revision', fo.res ? 'excluidas' : 'incluidas');
  p('anios_interpolados', S.interp ? 'sí' : 'no'); p('ponderacion', S.A.apond ? fr.pw.texto : 'ninguna');
  p('unidades_total', cu.total); p('unidades_dentro', cu.n); p('sin_dato', cu.sinDatoAlguna); p('con_estimada', cu.est); p('suma_parcial', cu.par); p('con_reserva', cu.res); p('cero_o_negativo_en_log', cu.noPositivas); p('sin_peso', cu.sinPeso);
  if (fr.m) {
    p('pearson_r', fr.pe.r); p('pearson_p', fr.pe.p); p('pearson_ic95_inf', fr.ic[0]); p('pearson_ic95_sup', fr.ic[1]); p('spearman_rho', fr.sp.rho); p('spearman_p', fr.sp.p);
    p('mco_constante', fr.m.a); p('mco_constante_ee', fr.m.seA); p('mco_pendiente', fr.m.b); p('mco_pendiente_ee', fr.m.seB); p('mco_pendiente_ic95_inf', fr.m.icB[0]); p('mco_pendiente_ic95_sup', fr.m.icB[1]); p('mco_pendiente_p', fr.m.pB); p('r2', fr.m.r2); p('grados_libertad', fr.m.gl);
  }
  v.forEach((x, j) => p(`fuente_original_${j ? 'y' : 'x'}`, (fr.cr.fuentes[j] || []).map(i => S.ctx.fuentes.nombreFuente(i)).join('; ')));
  if (S.avisoAnios(fr.cr.usados)) p('aviso_anios', S.avisoAnios(fr.cr.usados));
  if (fr.z) p('tamano_anio', fr.z.anio ?? '');
  p('aviso', 'Correlación no es causalidad; los datos agregados por territorio no dicen nada de las personas (falacia ecológica); unidades de distinto tamaño pesan igual salvo que se pondere. El visor no estima cifras.');
  csv(`analisis_resultados__${v[1].id}__frente_a__${v[0].id}__${S.nivelDatos()}__${S.anio}.csv`, filas);
}
