/* Piezas comunes de las vistas no cartográficas (Líneas, Tabla, Ranking, Franjas, Climograma, Distribución).
   Solo hablan con el armazón a través de `ctx` (docs/v2/VISOR3_API.md) y con js/atlas2/. */
import { esc, entero, decimal, pct, normaliza } from '../../atlas2/fmt.js';
import { esCategorico, escalaCategorica } from '../escala.js';
import { esVarianteNoElegida, variantesDe, varianteElegida, estadoUnidad, interpolaAtlas, tramoAtlas, corteDe, tramosSinInterp, cruzaTramo, notaTramo, conNotaTramo, aniosSinRanking, anioClasificable, REVISION_ANIO } from '../datos.js';
import { esIntensidad, difFrente, formatoFrente, textoFrente, medidaFrente, refAndalucia, notaRef } from '../frente.js';

export { esc, entero, decimal, pct, normaliza, difFrente, formatoFrente, textoFrente, medidaFrente, notaRef, tramosSinInterp, cruzaTramo, aniosSinRanking, anioClasificable, REVISION_ANIO };

export const PROV = { '04': 'Almería', '11': 'Cádiz', '14': 'Córdoba', '18': 'Granada', '21': 'Huelva', '23': 'Jaén', '29': 'Málaga', '41': 'Sevilla' };

/* Paleta cualitativa para distinguir unidades (legible en tema claro y oscuro). */
export const PALETA = ['#3b82c4', '#e4572e', '#2fa59a', '#d9a21b', '#9a7ad1', '#b07a45', '#e06c9f', '#6aa82a', '#2b9fd1', '#8d949b'];
export const color = (i) => PALETA[i % PALETA.length];

export const ESTADOS = { '0': 'observado', '3': 'calculado de originales', '1': 'estimado', '4': 'parcialmente estimado', '5': 'suma parcial', '2': 'con reserva o en revisión', '.': 'sin dato', I: 'interpolación del Atlas, no es un dato' };
/* «Todo interpolado» (estado.interp, ronda v19): el texto y el trazo de lo que interpola el Atlas (no es un dato) */
export const TXT_INTERP = 'interpolación del Atlas, no es un dato';
export const TRAZO_INTERP = { dash: '2 3', opacidad: 0.55 };
/* ¿Se interpola este fichero? (no con «Solo observado» ni en categorías) */
export const conInterp = (ctx, M) => !!(ctx && ctx.estado.interp && !ctx.estado.obs && M && M.file && !M.file.__sinInterp);
/* Muestra del trazo interpolado (para la nota de una vista) */
export function muestraInterp(conTexto = true) {
  return `<span class="vv-lt vv-lt-interp"><svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" stroke-width="2" stroke-dasharray="${TRAZO_INTERP.dash}" stroke-opacity="${TRAZO_INTERP.opacidad}"/></svg>${conTexto ? ' ' + TXT_INTERP : ''}</span>`;
}
export const esEstimado = f => f === '1' || f === '4';

/* ¿Escala logarítmica? La pide el usuario (estado.esc: 'log' | 'lin'); si no, la del catálogo. */
export function esLog(ctx, ind) {
  const e = ctx.estado;
  if (e.esc === 'log') return true;
  if (e.esc === 'lin') return false;
  if (e.log) return true;
  const cat = ind && (typeof ind.escala === 'string' ? ind.escala : ind.escala && ind.escala.tipo);
  return cat === 'log';
}

/* Hueco de las opciones de la vista: la barra derecha del visor v4 (ctx.opciones) o, si no hay, la barra de la vista. */
export function hostOpciones(ctx, local) {
  return (ctx && ctx.opciones) || local;
}

/* ---- CSS propio (los módulos traen el suyo; usa los tokens --a2-*) ------------------------------------ */
let cssPuesto = false;
export function cssUnaVez() {
  if (cssPuesto) return;
  cssPuesto = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('./vistas.css', import.meta.url).href;
  document.head.appendChild(l);
}

/* Elemento HTML con atributos e hijos (texto o nodos). */
export function h(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

/* ---- Unidades de un nivel: nombre, provincia y partido ------------------------------------------------ */
const UNI = {};
const PARTIDO_DE = {};

function provDe(props, id, nivel) {
  if (nivel === 'provincia') return id;
  if (nivel === 'andalucia') return null;
  if (props.p) return String(props.p).slice(0, 2);
  if (props.pv) return String(props.pv).slice(0, 2);
  const pz = props.pz && props.pz[0];
  if (pz) return String(pz).slice(0, 2);
  if (/^\d{5}$/.test(id)) return id.slice(0, 2);
  return null;
}

/* -> Map id -> {id, nombre, prov, ine} del nivel (la geometría solo se pide una vez). */
export async function unidades(ctx, nivel, anio) {
  const clave = nivel === 'termino' ? nivel + '@' + anio : nivel;   // los términos cambian con el año; el resto, no
  if (UNI[clave]) return UNI[clave];
  const g = await ctx.niveles.geometria(nivel, anio);
  const m = new Map();
  for (const [id, p] of g.props) {
    let nombre = p.n || p.nombre || p.name || String(id);
    if (nivel === 'comarca_agraria') nombre = String(nombre).replace(/^CA-/, '');
    const pz = (p.pz && p.pz[0]) || (/^\d{5}$/.test(String(id)) ? String(id) : null);
    m.set(String(id), { id: String(id), nombre, prov: provDe(p, String(id), nivel), ine: pz, props: p });
  }
  UNI[clave] = m;
  return m;
}

/* Partido judicial (de 1888 por defecto) de cada unidad de un nivel: Map id -> {id, nombre}, o null si el nivel no se agrupa por partido.
   Sale de data/v2/visor/pertenencia.json: municipio -> `municipio[pj]`; unidad estable de un corte -> `unidad_a_partido[pj][corte]`
   (índice en `niveles[pj].ids`: el partido que reúne más municipios de la unidad). */
const PARTIDOS = {};
export async function partidoDe(ctx, nivel, pj = 'pj1888') {
  const clave = nivel + '|' + pj;
  if (clave in PARTIDOS) return PARTIDOS[clave];
  const p = await ctx.datos.pertenencia();
  let m = null;
  if (p && p.niveles && p.niveles[pj]) {
    const { ids, nombres } = p.niveles[pj];
    const de = (idx) => (idx == null || idx < 0 ? null : { id: String(ids[idx]), nombre: nombres[idx] });
    m = new Map();
    if (nivel === 'municipio') {
      const arr = p.municipio && p.municipio[pj];
      if (arr) p.ine.forEach((ine, k) => { const idx = ids.indexOf(arr[k]); if (idx >= 0) m.set(String(ine), de(idx)); });
    } else if (/^ue\d{4}$/.test(nivel)) {
      const corte = nivel.slice(2);
      const us = p.unidades_por_corte && p.unidades_por_corte[corte];
      const ap = p.unidad_a_partido && p.unidad_a_partido[pj] && p.unidad_a_partido[pj][corte];
      if (us && ap) us.forEach((u, k) => m.set(String(u), de(ap[k])));
      const mult = (p.unidad_a_partido_multiples && p.unidad_a_partido_multiples[pj] && p.unidad_a_partido_multiples[pj][corte]) || [];
      m.multiples = new Set(mult.map(k => String(us[k])));
    } else m = null;
  }
  PARTIDOS[clave] = m && m.size ? m : null;
  return PARTIDOS[clave];
}

export function nombreProv(p) { return PROV[p] || 'Sin provincia'; }

/* ---- Valores -------------------------------------------------------------------------------------------- */
const MAT = {};

/* -> {file, anios, ids, idx: Map id -> k} del indicador y nivel; null si ese nivel no existe para el indicador. */
export async function matriz(ctx, ind, nivel) {
  const key = ind + '__' + nivel;
  if (key in MAT) return MAT[key];
  try {
    const file = await ctx.datos.valores(ind, nivel);
    if (!file || !file.ids || !file.v) throw new Error('sin datos');
    const idx = new Map(file.ids.map((id, k) => [String(id), k]));
    MAT[key] = { file, anios: file.anios, ids: file.ids.map(String), idx };
  } catch (e) {
    MAT[key] = null;
  }
  return MAT[key];
}

/* Serie de una unidad: [{anio, v, f}] con f = '0' | '1' | '2' | '.'. `obs` oculta lo estimado (queda como hueco).
   `interp` (y sin `obs`): añade, año a año, la interpolación LINEAL del Atlas entre dos años con cifra de la unidad
   (interpolaAtlas de datos.js, f = 'I', con su `tramo`); nunca fuera del primer y del último año con cifra. */
export function serieDe(M, id, { obs = false, interp = false } = {}) {
  const pts = serieBase(M, id, { obs });
  return interp && !obs && M.file && !M.file.__sinInterp ? conAtlas(M, id, pts) : pts;
}
const SIN_INTERP_MOT = /^(nd|ns|n)$/;   // vacíos con motivo propio: no se interpolan (como en datos.js)
function conAtlas(M, id, pts) {
  const con = pts.filter(p => p.v != null && isFinite(+p.anio));
  if (con.length < 2) return pts;
  const y0 = +con[0].anio, y1 = +con[con.length - 1].anio;
  if (!(y1 - y0 > 1)) return pts;
  const porAnio = new Map(pts.map(p => [+p.anio, p]));
  const k = M.idx.get(String(id));
  if (!M._mot) M._mot = new Map((M.file.mot || []).map(([a, b, c]) => [a + ',' + b, c]));
  const nuevos = [];
  for (let y = Math.floor(y0) + 1; y < y1; y++) {
    const p = porAnio.get(y);
    if (p && p.v != null) continue;
    if (p && p.iy != null && SIN_INTERP_MOT.test(String(M._mot.get(p.iy + ',' + k) || ''))) continue;
    const v = interpolaAtlas(M.file, id, y);
    if (v == null) continue;
    const q = { anio: y, v, f: 'I', parcial: null, tramo: tramoAtlas(M.file, id, y) };
    if (p) Object.assign(p, q); else nuevos.push(q);
  }
  return nuevos.length ? [...pts, ...nuevos].sort((a, b) => +a.anio - +b.anio) : pts;
}
function serieBase(M, id, { obs = false } = {}) {
  const k = M.idx.get(String(id));
  if (k == null) return [];
  // suma parcial (file.parcial = [[iy, iid, con_dato, total]]): la cifra no es el total de la unidad
  if (M._parcF !== M.file) { M._parcF = M.file; M._parc = new Map(); for (const x of (M.file && M.file.parcial) || []) M._parc.set(x[0] + '|' + x[1], [x[2], x[3]]); }
  return M.anios.map((a, i) => {
    // un año con dos convocatorias (2019): solo la elegida, con el año a secas
    if (esVarianteNoElegida(M.file, a)) return null;
    // 2019: si la elegida es la otra convocatoria (abril), su cifra
    const vs = variantesDe(M.file, a), el = vs && varianteElegida(vs);
    let v = el && el.datos && el.datos.v ? el.datos.v[k] : M.file.v[i][k];
    let f = ((el && el.datos && el.datos.f) || M.file.f[i] || '')[k] || (v == null ? '.' : '0');
    if (v == null) f = '.';
    if (obs && (f === '1' || f === '4')) { v = null; f = '.'; }
    const base = /^(\d{4})[-_.].+$/.exec(String(a));
    return { anio: base ? +base[1] : a, v, f, parcial: v != null ? (M._parc.get(i + '|' + k) || null) : null, iy: i };
  }).filter(Boolean);
}

export function ultimoValor(M, id) {
  const k = M.idx.get(String(id));
  if (k == null) return null;
  const sin = aniosSinRanking(M.file);   // un año en revisión no sirve para elegir «los que más»
  for (let i = M.anios.length - 1; i >= 0; i--) { if (sin.has(+M.anios[i])) continue; const v = M.file.v[i][k]; if (v != null) return v; }
  return null;
}

/* Las n unidades con mayor último valor (sin Andalucía si hay más niveles). */
export function mayores(M, n, filtro) {
  const lista = [];
  for (const id of M.ids) {
    if (filtro && !filtro(id)) continue;
    const v = ultimoValor(M, id);
    if (v != null) lista.push([id, v]);
  }
  lista.sort((a, b) => b[1] - a[1]);
  return lista.slice(0, n).map(x => x[0]);
}

/* ---- Formatos y textos ----------------------------------------------------------------------------------- */
export function txtValor(ind, v) {
  if (v != null && esCategorico(ind)) return escalaCategorica(ind).formato(v);   // el nombre de la categoría
  if (v == null || Number.isNaN(+v)) return '—';
  const u = (ind && ind.unidad) || '';
  if (u === '%') return pct(v);
  if (u === '°C') return decimal(v) + ' °C';
  if (Math.abs(v) < 10 && v % 1 !== 0) return decimal(v) + (u && u !== 'personas' ? ' ' + u : '');
  return entero(v) + (u && u !== 'personas' ? ' ' + u : '');
}

/* Fuente ORIGINAL de lo que se pinta (por año si el fichero la da). Nunca «extraído por». */
export function fuenteTxt(ctx, ind, M, anio) {
  let ids = null;
  const fa = M && M.file && M.file.fuentes_anio && M.file.fuentes_anio[String(anio)];
  if (fa) ids = Array.isArray(fa) ? fa : [fa];
  else if (ind && ind.fuentes) ids = Array.isArray(ind.fuentes) ? ind.fuentes : [ind.fuentes];
  if (!ids || !ids.length) return 'fuente sin identificar';
  return ids.map(i => ctx.fuentes.nombreFuente(i)).join('; ');
}

/* Marca de una cifra para el recuadro flotante: «estimado», «suma parcial (3 de 5 con dato)»…; '' si es observada. */
export function marcaDe(p, { corta = false } = {}) {
  if (!p) return '';
  const out = [];
  if (p.f === 'I' && corta) return 'interpolado';
  if (p.f === 'I') return p.tramo ? `interpolación del Atlas entre ${p.tramo[0]} y ${p.tramo[1]}, no es un dato` : TXT_INTERP;
  if (p.f && p.f !== '0' && p.f !== '.' && ESTADOS[p.f] && !(p.f === '5' && p.parcial)) out.push(ESTADOS[p.f]);
  if (p.parcial) out.push(`suma parcial (${entero(p.parcial[0])} de ${entero(p.parcial[1])} con dato)`);
  return out.join(' · ');
}

/* Recuadro flotante (ronda v16, Juan: «la info flotante es gigante: que solo dé datos»): el año y, por serie, su valor y
   su marca. Nada de fuentes: la fuente está en el botón «Fuente», arriba. */
export function tipTitulo(t) { return `<strong class="vv-tt-t">${esc(String(t))}</strong>`; }
/* Con varias series, una sola línea dice qué es lo interpolado (las filas llevan solo «interpolado»). */
export function tipNotaInterp(tramos) {
  const t = (tramos || []).filter(Boolean), k = new Set(t.map(x => x.join('-')));
  return `<div class="vv-tt-nota">${t.length && k.size === 1 ? `Interpolado: ${esc(TXT_INTERP)} (entre ${t[0][0]} y ${t[0][1]})` : `Interpolado: ${esc(TXT_INTERP)}`}</div>`;
}
export function tipFila({ color = null, nombre = '', valor = '', marca = '', foco = false, sub = false } = {}) {
  return `<div class="vv-tt-fila${foco ? ' is-foco' : ''}${sub ? ' is-sub' : ''}"><span class="vv-tt-n">${color ? `<i style="background:${color}"></i>` : ''}${esc(nombre)}</span>` +
    `<span class="vv-tt-v">${esc(valor)}${marca ? `<small> · ${esc(marca)}</small>` : ''}</span></div>`;
}

/* ---- Series apagadas (ronda v16, Juan: «si pincho provincia o municipio, que se active o desactive») -----------------
   Pinchar el nombre o la línea de una serie la apaga (gris claro, nombre tachado) o la vuelve a encender; no sale de la
   selección. Lo comparten Líneas, Franjas y Ranking (y quien quiera leerlo): `seriesApagadas` es un Set con el id de cada
   unidad apagada, en texto. Cada cambio avisa a los suscritos (alCambiarApagadas) y lanza en `document` el evento
   «vv-apagadas» con {detail: {ids}}. Una unidad que sale de la selección vuelve a estar encendida; un cambio de nivel las
   enciende todas (los ids son de cada nivel). */
export const seriesApagadas = new Set();
const OYENTES_AP = new Set();
const PODA = { nivel: null, sel: null, foco: null };
export const estaApagada = (id) => seriesApagadas.has(String(id));
function lanzaApagadas(avisar) {
  const ids = [...seriesApagadas];
  if (avisar) for (const fn of [...OYENTES_AP]) { try { fn(ids); } catch (e) { console.error(e); } }
  document.dispatchEvent(new CustomEvent('vv-apagadas', { detail: { ids } }));
}
/* Apaga o enciende (sin `apagar`, alterna). `teclado`: tras repintar, el foco vuelve a ese rótulo. */
export function alternaSerie(id, { apagar = null, teclado = false } = {}) {
  const k = String(id), ya = seriesApagadas.has(k), quiere = apagar == null ? !ya : !!apagar;
  PODA.foco = teclado ? k : null;
  if (quiere !== ya) { if (quiere) seriesApagadas.add(k); else seriesApagadas.delete(k); lanzaApagadas(true); }
  return quiere;
}
export function alCambiarApagadas(fn) { OYENTES_AP.add(fn); return () => OYENTES_AP.delete(fn); }
/* Sustituye todas las apagadas (enlace, botones «Todas» y «Ninguna»). Devuelve si ha cambiado algo. */
export function ponApagadas(ids, { avisar = false } = {}) {
  const nuevo = new Set((ids || []).map(String));
  if (nuevo.size === seriesApagadas.size && [...nuevo].every(x => seriesApagadas.has(x))) return false;
  seriesApagadas.clear();
  for (const x of nuevo) seriesApagadas.add(x);
  PODA.foco = null;
  lanzaApagadas(avisar);
  return true;
}
/* Al pintar una vista: enciende lo que ha salido de la selección y todo si cambia el nivel (no repinta: ya se está pintando). */
export function podaApagadas(nivel, sel) {
  const ahora = new Set((sel || []).map(String).filter(x => x !== '-'));
  let cambia = false;
  if (PODA.nivel != null && PODA.nivel !== nivel) { if (seriesApagadas.size) { seriesApagadas.clear(); cambia = true; } }
  else if (PODA.sel) for (const id of PODA.sel) if (!ahora.has(id) && seriesApagadas.delete(id)) cambia = true;
  PODA.nivel = nivel; PODA.sel = ahora;
  if (cambia) lanzaApagadas(false);
}
/* De una lista de series, las encendidas (si todas están apagadas, todas: algo hay que medir). */
export function encendidas(series, idDe = s => s.id) {
  const on = series.filter(s => !estaApagada(idDe(s)));
  return on.length ? on : series;
}
/* Un rótulo (SVG o HTML, selección d3) que enciende y apaga su serie: botón accesible (rol, tabindex, Intro o espacio) que
   resalta la serie al pasar el puntero o al llegar con el tabulador. `foco(id | null)` resalta. */
export function pinchable(sel, { id, nombre, foco = null }) {
  const k = String(id), off = estaApagada(k);
  sel.attr('role', 'button').attr('tabindex', 0).attr('data-serie', k).attr('aria-pressed', String(!off))
    .attr('aria-label', `${nombre}: ${off ? 'apagada' : 'encendida'}. Pulsa para ${off ? 'encenderla' : 'apagarla'}.`)
    .classed('vv-pinchable', true).classed('is-apagada', off)
    .on('click', (ev) => { ev.stopPropagation(); alternaSerie(k); })
    .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternaSerie(k, { teclado: true }); } })
    .on('mouseenter focus', () => { if (foco) foco(k); })
    .on('mouseleave blur', () => { if (foco) foco(null); });
  return sel;
}
/* Tras repintar por una pulsación de teclado, el foco vuelve al rótulo de esa serie. */
export function recuperaFoco(raiz) {
  if (!PODA.foco || !raiz) return;
  const k = PODA.foco; PODA.foco = null;
  const el = [...raiz.querySelectorAll('[data-serie][tabindex]')].find(n => n.getAttribute('data-serie') === k);
  if (el) el.focus({ preventScroll: true });
}
/* Resalta una serie (data-serie) y atenúa las demás dentro de `raiz` (la clase la pone vistas.css). */
export function resalta(raiz, id) {
  if (!raiz) return;
  raiz.classList.toggle('vv-con-foco', id != null);
  for (const n of raiz.querySelectorAll('[data-serie]')) n.classList.toggle('is-foco', id != null && n.getAttribute('data-serie') === String(id));
}

/* ---- Indicadores por épocas (ronda v22): catálogo con `etiquetas_anio` y `sin_interpolar` ------------------------------
   El número del año es solo una clave interna: nunca se enseña. Siempre la etiqueta y, en los ejes, las épocas a igual
   distancia (por posición, no por año). Con `sin_interpolar`, cada cifra es un marcador, sin línea entre épocas. */
export const conEpocas = (ind) => !!(ind && ind.etiquetas_anio && Object.keys(ind.etiquetas_anio).length);
// marcadores sueltos solo con épocas; `sin_interpolar` sin etiquetas (diseminado) es una línea normal, cortada en anios_sin_unir
/* Pares de anios_sin_unir: ahí la línea se corta (el eje sigue a escala). */
export function sinUnirDe(ind) {
  return ((ind && ind.anios_sin_unir) || []).filter(z => Array.isArray(z) && z.length === 2).map(z => [+z[0], +z[1]]);
}
/* Tramos sin interpolar en los que la línea sigue (no están en anios_sin_unir): llevan una marca discreta y su texto. */
export function tramosSeguidos(ind) {
  const su = sinUnirDe(ind);
  return tramosSinInterp(ind).filter(([a, b]) => !su.some(([p, q]) => p === a && q === b));
}
export const notasSeguidas = ind => tramosSeguidos(ind).map(([a, b]) => notaTramo(ind, a, b));
/* Dibuja, detrás de las líneas, la franja de cada tramo donde cambia la fuente, con su rótulo. */
export function marcaTramos(g, ind, x, ih) {
  const dom = x.domain(), rg = x.range(), d0 = dom[0], d1 = dom[dom.length - 1], iw = rg[rg.length - 1];
  for (const [a, b] of tramosSinInterp(ind)) {
    if (b <= d0 || a >= d1) continue;
    if (tramosSeguidos(ind).some(([p, q]) => p === a && q === b)) {   // línea seguida: solo una marca en el año en que cambia
      if (b < d0 || b > d1) continue;
      const X = x(b), gm = g.insert('g', ':first-child').attr('class', 'vv-marca-tramo');
      gm.append('title').text(notaTramo(ind, a, b));
      gm.append('line').attr('x1', X).attr('x2', X).attr('y1', 0).attr('y2', ih);
      gm.append('path').attr('d', `M${X - 4},-7h8l-4,6z`);
      continue;
    }
    const x0 = x(Math.max(a, d0)), x1 = x(Math.min(b, d1)), ANCHO = 96;
    const gb = g.insert('g', ':first-child').attr('class', 'vv-cambia-fuente');
    gb.append('title').text(notaTramo(ind, a, b));
    gb.append('rect').attr('x', x0).attr('y', 0).attr('width', Math.max(1, x1 - x0)).attr('height', ih);
    if (conNotaTramo(ind, a, b)) {   // un texto propio del tramo: dentro de la franja, en las líneas que quepan
      const pal = notaTramo(ind, a, b).split(' '), max = Math.max(9, Math.floor((x1 - x0 - 8) / 5.7)), ls = [];
      for (const w of pal) { const u = ls[ls.length - 1]; if (u && (u + ' ' + w).length <= max) ls[ls.length - 1] = u + ' ' + w; else ls.push(w); }
      if (x1 - x0 >= 70 && ls.length <= 6) { const t = gb.append('text').attr('class', 'vv-nota-salto').attr('y', 16); ls.forEach((l, k) => t.append('tspan').attr('x', x0 + 5).attr('dy', k ? 13 : 0).text(l)); }
      else if (iw >= 200) gb.append('text').attr('class', 'vv-nota-salto').attr('x', Math.max(ANCHO / 2, Math.min(iw - ANCHO / 2, (x0 + x1) / 2))).attr('y', -5).attr('text-anchor', 'middle').text('otra fuente');
      continue;
    }
    // el rótulo, encima del gráfico para que ninguna línea lo pise; en un panel estrecho, solo la franja y su título
    if (iw >= 200) gb.append('text').attr('class', 'vv-nota-salto').attr('x', Math.max(ANCHO / 2, Math.min(iw - ANCHO / 2, (x0 + x1) / 2))).attr('y', -5).attr('text-anchor', 'middle').text('cambia la fuente');
  }
}
export const sinTramos = (ind) => !!(ind && ind.sin_interpolar && conEpocas(ind));
export function etiquetaAnio(ind, a) {
  if (!conEpocas(ind)) return String(a);
  const t = ind.etiquetas_anio;
  return t[String(a)] ?? t[String(+a)] ?? 'época sin nombre';
}
/* «1968–1995» o, por épocas, «Época romana – 2023». */
export function periodoTxt(ind, a, b) {
  if (String(a) === String(b)) return etiquetaAnio(ind, a);
  return conEpocas(ind) ? `${etiquetaAnio(ind, a)} – ${etiquetaAnio(ind, b)}` : `${a}–${b}`;
}
/* Escala de un eje por posición: cada clave en el centro de su tramo, todos iguales (admite años intermedios y invert). */
export function escalaEpocas(claves, x0, ancho) {
  const k = [...claves].map(Number).sort((p, q) => p - q), n = k.length;
  if (n < 2) { const c = x0 + ancho / 2, a = n ? k[0] : 0; return d3.scaleLinear().domain([a, a + 1]).range([c, c + 1]); }
  const paso = ancho / n;
  return d3.scaleLinear().domain(k).range(k.map((_, i) => x0 + paso * (i + 0.5)));
}
let MEDIDOR = null;
function anchoTexto(t, fs) {
  if (!MEDIDOR) MEDIDOR = document.createElement('canvas').getContext('2d');
  const fam = getComputedStyle(document.documentElement).getPropertyValue('--v4-sans').trim() || getComputedStyle(document.body).fontFamily || 'sans-serif';
  MEDIDOR.font = `500 ${fs}px ${fam}`;
  return MEDIDOR.measureText(t).width;
}
function acortaTexto(t, ancho, fs) {
  if (anchoTexto(t, fs) <= ancho) return t;
  let n = t.length;
  while (n > 1 && anchoTexto(t.slice(0, n).trimEnd() + '…', fs) > ancho) n--;
  return t.slice(0, n).trimEnd() + '…';
}
/* Parte una etiqueta en líneas que quepan en `ancho`; lo que no cabe en `max` líneas se acorta con «…». */
export function partirEtiqueta(txt, ancho, { fs = 11.5, max = 3 } = {}) {
  const lineas = [];
  let cur = '';
  for (const w of String(txt).split(/\s+/).filter(Boolean)) {
    const prueba = cur ? `${cur} ${w}` : w;
    if (!cur || anchoTexto(prueba, fs) <= ancho) cur = prueba; else { lineas.push(cur); cur = w; }
  }
  if (cur) lineas.push(cur);
  const out = lineas.slice(0, max);
  if (lineas.length > max) out[max - 1] = lineas.slice(max - 1).join(' ');
  return out.map(l => acortaTexto(l, ancho, fs));
}
/* Las etiquetas de un eje por épocas, ya partidas: {lineas: Map clave -> [texto], n, alto}. */
export function rotulosEpocas(ind, claves, anchoTotal, { max = 3, fs = 11.5 } = {}) {
  const disp = Math.max(30, anchoTotal / Math.max(1, claves.length) - 8);
  const lineas = new Map();
  let n = 1;
  for (const a of claves) { const l = partirEtiqueta(etiquetaAnio(ind, a), disp, { fs, max }); lineas.set(a, l); n = Math.max(n, l.length); }
  return { lineas, n, alto: Math.ceil(10 + n * (fs + 2.5)) };
}
/* Pone las líneas de una etiqueta en un <text> SVG. */
export function textoEnLineas(sel, lineas, { x = 0 } = {}) {
  lineas.forEach((l, i) => sel.append('tspan').attr('x', x).attr('dy', i ? '1.2em' : 0).text(i < lineas.length - 1 ? l + ' ' : l));
  return sel;
}
/* Eje horizontal por épocas: una marca y su etiqueta (entera en el texto emergente) en el centro de cada tramo. */
export function ejeEpocas(g, { rot, x, y0, ind, x0, x1 }) {
  const e = g.append('g').attr('class', 'vv-eje vv-eje-epocas').attr('transform', `translate(0,${y0})`);
  e.append('line').attr('x1', x0).attr('x2', x1);
  for (const [a, lineas] of rot.lineas) {
    const t = e.append('g').attr('class', 'tick').attr('transform', `translate(${x(a)},0)`);
    t.append('line').attr('y2', 5);
    textoEnLineas(t.append('text').attr('y', 17).attr('text-anchor', 'middle'), lineas);
    t.append('title').text(etiquetaAnio(ind, a));
  }
  return e;
}

/* ---- «Frente a Andalucía» (ronda v23, estado.ver = 'and') ---------------------------------------------------------------
   La referencia es SOLO la cifra de Andalucía de ese año en <ind>__andalucia.json; nunca una media de municipios. Si ese año
   no la hay, la unidad queda sin dato. Los cálculos y los textos son los de js/visor3/frente.js. */
export const verFrente = (ctx) => !!(ctx && ctx.estado.ver === 'and' && !ctx.estado.interp && !ctx.estado.cmb);
/* -> {ent, celda(anio) -> {v, f, est} | null, aDe(anio) -> cifra | null, motivo(anio)}, o null si este indicador no se compara. */
export async function frenteDe(ctx, ent) {
  if (!verFrente(ctx) || !esIntensidad(ent)) return null;
  let d = null;
  try { d = await ctx.datos.valores(ent.id, 'andalucia'); } catch (err) { d = null; }
  if (!d || !d.ids || !d.ids.length) return null;
  const memo = new Map(), obs = !!ctx.estado.obs;
  const refDe = (anio) => {
    const k = String(anio);
    if (!memo.has(k)) memo.set(k, refAndalucia(corteDe(d, anio), obs, { ind: ent.id, anio }));
    return memo.get(k);
  };
  // null si ese año no se compara (suma parcial; o estimada, con «Solo observado»); el porqué, en motivo(anio)
  const celda = (anio) => { const r = refDe(anio); return r.v == null ? null : r; };
  return { ent, celda, aDe: (a) => { const c = celda(a); return c ? c.v : null; }, motivo: (a) => refDe(a).motivo };
}
/* El color de una diferencia: las clases simétricas que trae ctx.escala en este modo; mientras no estén, encima o debajo. */
export function colorFrente(ctx, ent, x) {
  const e = ctx.escala(ent.id);
  if (e && e.porClases && e.clases.some(c => /como Andalucía/.test(c.etiqueta || ''))) return e.color(x);
  return x > 0 ? '#b5523c' : x < 0 ? '#3c78a8' : '#d9d6cf';
}
/* Rótulo del eje: en qué se mide la diferencia. */
export function ejeFrente(ent) {
  const m = medidaFrente(ent), u = String(ent.unidad || '');
  return `Frente a Andalucía (${m === 'razon' ? '%' : m === 'puntos' ? 'puntos' : /[íi]ndice/i.test(u) ? 'índice' : u})`;
}
/* Una frase con la medida: «% por encima o por debajo», «diferencia en puntos», «diferencia en °C». */
export function medidaTxt(ent) {
  const m = medidaFrente(ent), u = String(ent.unidad || '');
  return m === 'razon' ? '% por encima o por debajo' : m === 'puntos' ? 'diferencia en puntos' : `diferencia en ${/[íi]ndice/i.test(u) ? 'el índice' : u}`;
}
export function tipFrente(t) { return `<div class="vv-tt-frente">${esc(t)}</div>`; }

export function leyendaTrazos(interp = false) {
  const sw = (dash, w = 26) => `<svg width="${w}" height="8" aria-hidden="true"><line x1="1" y1="4" x2="${w - 1}" y2="4" stroke="currentColor" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>`;
  return `<span class="vv-lt">${sw('')} observado</span><span class="vv-lt">${sw('5 3')} estimado</span>` +
    `<span class="vv-lt">${sw('1.5 3')} con reserva o en revisión</span>${interp ? muestraInterp() : ''}<span class="vv-lt vv-lt-hueco">sin dato = hueco, no cero</span>`;
}

/* ---- Selector de unidades: buscador + chips --------------------------------------------------------------- */
export function selectorUnidades(ctx, { max = 12, etiqueta = 'Añadir unidad…' } = {}) {
  const caja = h('div', { class: 'vv-sel' });
  const chips = h('div', { class: 'vv-chips', 'aria-live': 'polite' });
  const entrada = h('input', { class: 'a2-input vv-buscar', type: 'search', placeholder: etiqueta, 'aria-label': etiqueta, autocomplete: 'off' });
  const lista = h('ul', { class: 'vv-sug', role: 'listbox', hidden: true });
  caja.append(entrada, lista, chips);
  let unis = new Map();

  const pintaChips = () => {
    chips.textContent = '';
    ctx.estado.sel.forEach((id, i) => {
      const u = unis.get(String(id));
      chips.append(h('button', { class: 'vv-chip', type: 'button', style: `--c:${color(i)}`, title: 'Quitar de la selección', 'aria-label': 'Quitar ' + (u ? u.nombre : id),
        onclick: () => ctx.set({ sel: ctx.estado.sel.filter(x => x !== id) }) }, h('i'), u ? u.nombre : id, h('b', { 'aria-hidden': 'true' }, '×')));
    });
    if (ctx.estado.sel.length) chips.append(h('button', { class: 'vv-chip vv-chip-limpiar', type: 'button', onclick: () => ctx.set({ sel: [] }) }, 'Quitar todas'));
  };
  const buscar = () => {
    const q = normaliza(entrada.value);
    lista.textContent = '';
    if (!q) { lista.hidden = true; return; }
    const res = [];
    for (const u of unis.values()) {
      if (ctx.estado.sel.includes(u.id)) continue;
      if (normaliza(u.nombre).includes(q) || u.id.toLowerCase().includes(q)) res.push(u);
      if (res.length >= 40) break;
    }
    res.sort((a, b) => (normaliza(a.nombre).startsWith(q) ? 0 : 1) - (normaliza(b.nombre).startsWith(q) ? 0 : 1) || a.nombre.localeCompare(b.nombre, 'es'));
    for (const u of res.slice(0, 8)) {
      lista.append(h('li', { role: 'option' }, h('button', { type: 'button', onclick: () => {
        if (ctx.estado.sel.length >= max) return;
        ctx.set({ sel: [...ctx.estado.sel, u.id] }); entrada.value = ''; lista.hidden = true; entrada.focus();
      } }, u.nombre, h('small', {}, u.prov ? ' · ' + nombreProv(u.prov) : ''))));
    }
    lista.hidden = !res.length;
    if (!res.length) { lista.append(h('li', { class: 'vv-sug-vacio' }, 'Ninguna unidad con ese nombre en este nivel')); lista.hidden = false; }
  };
  entrada.addEventListener('input', buscar);
  entrada.addEventListener('keydown', e => { if (e.key === 'Escape') { lista.hidden = true; entrada.value = ''; } if (e.key === 'Enter') { const b = lista.querySelector('button'); if (b) b.click(); } });
  document.addEventListener('click', e => { if (!caja.contains(e.target)) lista.hidden = true; });

  return { el: caja, async refrescar(nivel, anio) { unis = await unidades(ctx, nivel, anio); pintaChips(); buscar(); }, pintaChips, unis: () => unis };
}

/* Grupo de botones excluyentes (la clase .a2-seg del diseño común). */
export function seg(etiqueta, opciones, valor, alCambiar) {
  const g = h('div', { class: 'a2-seg vv-seg', role: 'group', 'aria-label': etiqueta });
  for (const [v, txt, title] of opciones) {
    g.append(h('button', { type: 'button', 'aria-pressed': String(v === valor), title: title || null, onclick: () => alCambiar(v) }, txt));
  }
  return h('label', { class: 'vv-ctl' }, h('span', {}, etiqueta), g);
}

/* Años del eje: redondos según el ancho y, SIEMPRE, el primero y el último (Juan, 20-nov-2026). Si un año redondo se
   pisaría con un extremo, se quita el redondo, nunca el extremo. */
export function marcasAnio(dom, ancho) {
  const a = Math.round(dom[0]), b = Math.round(dom[dom.length - 1]);
  if (a === b) return [a];
  const n = Math.max(2, Math.floor(ancho / 70));
  const paso = [1, 2, 5, 10, 20, 25, 50, 100].find(p => (b - a) / p <= n) || 100;
  const px = v => (v - a) / (b - a) * ancho, hueco = 46;   // los extremos van anclados hacia dentro: más sitio
  const out = [];
  for (let y = Math.ceil(a / paso) * paso; y <= b; y += paso) if (y !== a && y !== b && px(y) - px(a) >= hueco && px(b) - px(y) >= hueco) out.push(y);
  return [a, ...out, b];
}

/* El primer y el último año del eje, anclados hacia dentro (no se cortan en el borde del gráfico). */
export function anclaExtremos(gEje) {
  const ts = gEje.selectAll('.tick text').nodes();
  if (ts.length > 1) { ts[0].setAttribute('text-anchor', 'start'); ts[ts.length - 1].setAttribute('text-anchor', 'end'); }
  return gEje;
}

/* Alto que tapan los botones flotantes del visor v4 («Fuente», «Info», arriba a la derecha) sobre un gráfico que empieza
   en `el`: su margen de arriba debe ser al menos este. 0 si no hay botones o no lo tapan. */
export function altoBotones(el) {
  const fi = document.getElementById('v4-fi');
  if (!fi || !fi.offsetParent || !el) return 0;
  const rf = fi.getBoundingClientRect(), rc = el.getBoundingClientRect();
  if (rf.bottom <= rc.top || rf.top >= rc.top + 80 || rf.left >= rc.right || rf.right <= rc.left) return 0;
  return Math.ceil(rf.bottom - rc.top) + 6;
}

/* Un rótulo SVG que no cabe: baja el cuerpo de letra (hasta `min`) y, si aún no cabe, lo recorta con puntos suspensivos. */
export function cabeTexto(nodo, ancho, min = 10) {
  if (!nodo || !nodo.getComputedTextLength) return;
  let t = parseFloat(getComputedStyle(nodo).fontSize) || 13;
  let guarda = 10;
  while (nodo.getComputedTextLength() > ancho && t > min && guarda--) { t -= 1; nodo.style.fontSize = t + 'px'; }
  const txt = nodo.textContent;
  let n = txt.length;
  while (nodo.getComputedTextLength() > ancho && n > 4) { n -= 1; nodo.textContent = txt.slice(0, n) + '…'; }
}

/* Texto del motivo de un vacío (`mot`: [[iy, iid, código]]) o de una marca 2 (`res` + `reservas`) en un valores de nivel fijo. */
export function motivoDe(M, iy, k, f) {
  const file = M.file;
  if (f === '.' || f == null) {
    if (!M._mot) { M._mot = new Map((file.mot || []).map(([a, b, c]) => [a + ',' + b, c])); }
    const c = M._mot.get(iy + ',' + k);
    return c ? ((file.motivos || {})[c] || c) : '';
  }
  if (f === '2') {
    if (!M._res) { M._res = new Map((file.res || []).map(([a, b, j]) => [a + ',' + b, j])); }
    const j = M._res.get(iy + ',' + k);
    if (j != null && file.reservas && file.reservas[j]) return file.reservas[j].rotulo || file.reservas[j].ficha || 'con reserva';
    return estadoUnidad(file.nivel, (file.ids || [])[k]) || 'en revisión';
  }
  return '';
}
