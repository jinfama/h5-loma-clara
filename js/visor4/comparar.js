// comparar.js — «Comparar» (rondas v20 y v21, Juan: «que sea siempre de tu mismo indicador… título en las dos gráficas o
// mapas»). El área central se parte en dos paneles SIMÉTRICOS del MISMO indicador; nunca iguales:
// · Mapa: cada panel con su año. La izquierda es la vista de siempre (la mueve la línea temporal); la derecha, este módulo.
//   Mismas clases y colores (calculados sobre los dos años), zoom y desplazamiento a la par, el mismo municipio resaltado.
// · Líneas: la vista dibuja ella misma los dos paneles, cada uno con su periodo y sus series (js/visor3/vistas/lineas.js).
// Los dos usan la misma cabecera (`cabeceraPar`): indicador · lo que distingue al panel, con Fuente e Info.
// Estado en la URL: cmp=<año> en mapas; cmp=<desde-hasta> (periodo del panel derecho) en Líneas; cmp=auto, recién entrado.
// Un enlace antiguo cmp=<indicador>:<año> se abre ignorando el indicador.

import { MapaCanvas } from '../timelapses/mapa.js';
import { M } from '../visor3/motor.js';
import { estado, setEstado } from '../visor3/estado.js';
import * as datos from '../visor3/datos.js';
import { cargar } from '../atlas2/data.js';
import { esc } from '../atlas2/fmt.js';
import { pintaLeyenda4 } from './leyenda.js';
import { dibujarGrises } from './grises.js';
import { hayEstados, dibujaBordes } from './limites.js';

let H = null, panel = null, parA = null, parB = null, mapa2 = null, geoBase = null, token = 0;
let provEsc = null, repAntes = null, clavePinta = '', iB = -1, dentro = false;
const VISTAS_CMP = ['mapa', 'lineas'];
const INSETS = { top: 10, right: 10, bottom: 10, left: 10 };

export const activoCmp = () => !!estado.cmp && VISTAS_CMP.includes(estado.vista) && !estado.modo;
// cmp=<indicador>:<año> (enlaces de la v20) → <año>; sin año, «auto»
export function limpiaCmp(t) {
  const s = String(t || ''); if (!s) return '';
  const k = s.lastIndexOf(':');
  return k < 0 ? s : (s.slice(k + 1) || 'auto');
}
const esAnio = t => /^\d{4}$/.test(String(t || '')) || /^\d{4}[-_.][^\d]/.test(String(t || ''));

/* h = { on, emit, tooltip, mapa, rotNivel, emitTam, plegarOpc, fuenteHTML(anios), infoHTML(), tituloLeyenda(spec), irAnio(clave) } */
export function montarComparar(h) {
  H = h;
  panel = document.getElementById('v4-cmp'); parA = document.getElementById('v4-par-a');
  if (!panel || !parA) return;
  panel.innerHTML = `<div class="v4-par__h" id="v4-par-b"></div>
    <div class="v4-cmp__escena"><canvas class="v4-cmp__canvas" role="img" aria-label="Mapa del panel derecho"></canvas><div class="m4-zoom v4-cmp__zoom" role="group" aria-label="Ampliar los dos mapas"></div><p class="v4-cmp__vacio" hidden></p></div>
    <div class="v4-cmp__leyw"><div class="v4-cmp__ley l4 l4--bajo"></div></div>`;
  parB = panel.querySelector('#v4-par-b');
  H.on('cambio', ({ claves }) => {
    if (claves.has('vista') && estado.cmp && estado.cmp !== 'auto') { setEstado({ cmp: 'auto' }); return; }
    if (claves.has('ind') && estado.cmp && estado.vista === 'lineas' && estado.cmp !== 'auto') { setEstado({ cmp: 'auto' }); return; }
    if (['cmp', 'vista', 'modo', 'sel', 'obs', 'interp', 'cmb', 'ver', 'capas', 'var'].some(k => claves.has(k))) actualiza({ forzar: true });
  });
  H.on('anio', e => {
    if (!activoCmp() || estado.vista !== 'mapa' || M.ind !== estado.ind) return;
    // la izquierda llega al año de la derecha: se cambian el sitio, para que nunca sean iguales
    const fA = M.F[e.i], fP = e.prev != null ? M.F[e.prev] : null;
    if (fA && String(fA.clave) === String(estado.cmp) && fP && e.prev !== e.i) { setEstado({ cmp: String(fP.clave) }); return; }
    actualiza();
  });
  H.on('play', () => { if (activoCmp()) actualiza({ forzar: true }); });
  H.on('pausa', () => { if (activoCmp()) actualiza({ forzar: true }); });
  H.on('hover', x => {
    if (!mapa2 || !activoCmp() || estado.vista !== 'mapa') return;
    const v = x ? String(x.id) : null;
    if (mapa2.highlight !== v) { mapa2.highlight = v; mapa2.draw(); }
  });
  const centro = document.querySelector('.v4-centro');
  if (centro && 'ResizeObserver' in window) new ResizeObserver(apila).observe(centro);
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.v4-par__cab')) cierraPops(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cierraPops(); });
  actualiza({ forzar: true });
}

// lado a lado si cabe; uno encima del otro si el hueco central es estrecho
function apila() {
  const c = document.querySelector('.v4-centro'); if (!c) return;
  document.body.classList.toggle('v4-cmp--apilado', c.clientWidth < 760);
}
function cierraPops() { document.querySelectorAll('.v4-par__pop:not([hidden])').forEach(p => { p.hidden = true; }); document.querySelectorAll('.v4-par__b[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false')); }

// ---------------------------------------------------------------- la cabecera de cada panel (mapas y líneas)
/* o = { lado: 'a'|'b', titulo, detalle, sub, anios: [desde, hasta], anio: { opciones: [{v, t, no}], valor, cambia(v) } | null } */
export function cabeceraPar(el, o) {
  if (!el) return;
  if (!el.__par) {
    el.__par = {};
    el.innerHTML = `<div class="v4-par__cab">
      <div class="v4-par__txt"><h3 class="v4-par__t"><span class="v4-par__ind"></span> <b class="v4-par__det"></b></h3><p class="v4-par__s"></p></div>
      <div class="v4-par__ctl">
        <span class="v4-par__anio" role="group" aria-label="Año de este panel" hidden><button type="button" data-paso="-1" aria-label="Año anterior">‹</button><select aria-label="Año"></select><button type="button" data-paso="1" aria-label="Año siguiente">›</button></span>
        <button type="button" class="v4-par__b" data-pop="fuente" aria-expanded="false" title="La fuente original de este panel">Fuente</button>
        <button type="button" class="v4-par__b" data-pop="info" aria-expanded="false" title="Qué mide el indicador y cómo leer sus marcas">Info</button>
      </div>
      <div class="v4-par__pop v4-fi__pop" role="dialog" hidden></div>
    </div>`;
    const pop = el.querySelector('.v4-par__pop');
    el.addEventListener('click', e => {
      if (e.target.closest('[data-pop-x]')) { cierraPops(); return; }
      const b = e.target.closest('[data-pop]');
      if (b) {
        const abierto = b.getAttribute('aria-expanded') === 'true';
        cierraPops();
        if (abierto) return;
        const x = '<button type="button" class="v4-fi__x" data-pop-x aria-label="Cerrar">✕</button>';
        pop.innerHTML = x + (b.dataset.pop === 'fuente' ? H.fuenteHTML(el.__par.o.anios || []) : H.infoHTML());
        pop.hidden = false; b.setAttribute('aria-expanded', 'true');
        return;
      }
      const p = e.target.closest('[data-paso]');
      if (p && el.__par.o.anio) {
        const s = el.querySelector('.v4-par__anio select');
        let k = s.selectedIndex + +p.dataset.paso;
        while (k >= 0 && k < s.options.length && s.options[k].disabled) k += +p.dataset.paso;
        if (k >= 0 && k < s.options.length) el.__par.o.anio.cambia(s.options[k].value);
      }
    });
    el.querySelector('.v4-par__anio select').addEventListener('change', e => { if (el.__par.o.anio) el.__par.o.anio.cambia(e.target.value); });
  }
  el.__par.o = o;
  el.dataset.lado = o.lado || '';
  el.querySelector('.v4-par__ind').textContent = o.titulo || '';
  el.querySelector('.v4-par__det').textContent = o.detalle ? `· ${o.detalle}` : '';
  el.querySelector('.v4-par__s').textContent = o.sub || '';
  el.querySelector('.v4-par__s').classList.toggle('con-min', !!o.conMin);   // minimo1752
  const ca = el.querySelector('.v4-par__anio');
  ca.hidden = !o.anio;
  if (o.anio) {
    const s = ca.querySelector('select');
    const html = o.anio.opciones.map(x => `<option value="${esc(String(x.v))}"${String(x.v) === String(o.anio.valor) ? ' selected' : ''}${x.no ? ' disabled' : ''}>${esc(x.t)}</option>`).join('');
    if (s.__html !== html) { s.innerHTML = html; s.__html = html; }
    s.value = String(o.anio.valor);
  }
}

// ---------------------------------------------------------------- entrar, salir y pintar
function salirEscala() {
  if (provEsc && provEsc.escalaComun && provEsc.escalaComun(M.nivel, null) && H.mapa) H.mapa.refrescar();
  provEsc = null;
}
export async function actualiza({ forzar = false } = {}) {
  if (!panel) return;
  const enMapa = estado.vista === 'mapa';
  const on0 = activoCmp() && !(enMapa && M.F.length > 0 && M.F.length < 2);
  const antes = dentro;
  dentro = on0;
  document.body.classList.toggle('v4-cmp', on0);
  document.body.classList.toggle('v4-cmp--lineas', on0 && !enMapa);
  document.body.classList.toggle('v4-cmp--mapa', on0 && enMapa);
  panel.hidden = !(on0 && enMapa);
  parA.hidden = !(on0 && enMapa);
  if (on0 && !antes && H.plegarOpc) { const c = document.querySelector('.v4-centro'); if (c && c.clientWidth < 760) H.plegarOpc(); }
  if (antes !== on0 && H.emitTam) H.emitTam();
  // la representación: en Comparar, coropletas en los dos; al salir, la de antes
  if (on0 && enMapa && estado.rep) { repAntes = estado.rep; setEstado({ rep: '' }); return; }
  if (!on0) {
    if (H.mapa) H.mapa.alVista = null;
    salirEscala(); clavePinta = '';
    if (antes && repAntes) { const r = repAntes; repAntes = null; if (enMapa) setEstado({ rep: r }); }
    return;
  }
  apila();
  if (!enMapa) { salirEscala(); clavePinta = ''; return; }
  if (!M.F.length || M.ind !== estado.ind) return;
  const mi = ++token;
  try { await pintaMapa(mi, forzar || antes !== on0); } catch (e) { console.error(e); if (mi === token) vacio('No se ha podido dibujar este panel.'); }
}

function vacio(t) {
  const v = panel.querySelector('.v4-cmp__vacio'); v.textContent = t; v.hidden = !t;
  if (t) panel.querySelector('.v4-cmp__ley').innerHTML = '';
}
function presencia(arr) {
  const p = { est: false, est4: false, calc: false, obs: false, parcial: false, nd: false, sn: false, res: false, oculto: false, ia: false, nodecl: false, sinmedir: false };
  for (const r of arr) {
    if (!r) continue;
    if (r.ia) p.ia = true;
    if (r.nodecl) { p.nodecl = true; continue; }
    if (r.sinmedir) { p.sinmedir = true; continue; }
    if (r.res) p.res = true;
    if (r.oculto) p.oculto = true; else if (r.sn) p.sn = true; else if (r.nd) p.nd = true;
    else { if (r.parcial) p.parcial = true; if (r.est) p.est = true; else if (r.est4) p.est4 = true; }
  }
  return p;
}
function idxDerecha(F, iA) {
  const c = estado.cmp;
  let k = F.findIndex(f => String(f.clave) === String(c));   // también las claves de los indicadores por épocas
  if (k < 0 && esAnio(c)) {
    { const y = +String(c).slice(0, 4); let bd = Infinity; F.forEach((f, j) => { const d = Math.abs((+f.anio || 0) - y); if (d < bd) { bd = d; k = j; } }); }
  }
  if (k < 0) k = 0;                                   // por defecto, el primero con cifra
  if (k === iA) k = iA === 0 ? F.length - 1 : 0;      // nunca el mismo año en los dos
  return k;
}
const subDe = (P, i, niv) => {
  const c = P.cifra ? P.cifra(i, niv) : null; if (!c) return '';
  return c.valor === '' || c.valor == null ? 'Andalucía: sin dato' : `Andalucía: ${c.valor}${c.unidad ? ' ' + c.unidad : ''}${c.parcial ? ' (suma parcial)' : ''}${c.minimo ? ` · ${c.minimo}` : ''}`;
};
function creaMapa2() {
  const cv = panel.querySelector('.v4-cmp__canvas');
  mapa2 = new MapaCanvas(cv, {
    onHover: (d, x, y) => {
      const P = M.prov, det = P && P.detalle ? P.detalle(iB, d.c, d, M.nivel) : null;
      if (det) H.tooltip.mostrar(`<strong>${esc(det.titulo || d.n || d.c)}</strong>${det.sub ? `<div class="a2-tt-meta">${esc(det.sub)}</div>` : ''}<div>${esc(det.nd ? 'sin dato' : det.valor || '')}</div>${(det.lineas || []).slice(0, 3).map(l => `<div class="a2-tt-meta">${esc(l)}</div>`).join('')}`, x, y);
      if (H.mapa) H.mapa.resaltaHover(d.c);
    },
    onLeave: () => { H.tooltip.ocultar(); if (H.mapa) H.mapa.resaltaHover(null); },
    onClick: (d, ev) => { if (d && !d.sonda) H.emit('pinchar', { nivel: M.nivel, id: d.c, nombre: d.n, anio: estado.anio, mod: !!(ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) }); },
  });
  mapa2.modo4 = true; mapa2.mover = true; mapa2.calidad = false;
  mapa2.setGeo(geoBase);
  mapa2.setInsets({ ...INSETS });
  // las capas y los grises del panel derecho se dibujan con SU año (las fechadas leen M.i)
  const conAnio = fn => (...a) => { const m = M.i; M.i = iB; try { fn(...a); } catch (e) { console.error(e); } finally { M.i = m; } };
  const capa = H.mapa.capaRegistrada && H.mapa.capaRegistrada('capas4');
  if (capa) mapa2.capaEncima('capas4', conAnio(capa));
  mapa2.capaEncima('grises', conAnio((cx, path, proj, feats) => dibujarGrises(cx, path, proj, feats, mapa2.highlight)));
  // zoom y desplazamiento, a la par en los dos mapas
  let eco = false;
  mapa2.onVista = v => { zoomUI(); if (eco || !H.mapa) return; eco = true; H.mapa.ponVista(v); eco = false; };
  H.mapa.alVista = v => { if (eco || !mapa2 || !activoCmp()) return; eco = true; mapa2._gesto({ ...v }, { ya: true }); eco = false; };
  const z = panel.querySelector('.v4-cmp__zoom'), z0 = document.querySelector('#v4-escena .m4-zoom');
  if (z0) z.innerHTML = z0.innerHTML;
  z.addEventListener('click', e => {
    const b = e.target.closest('[data-z]'); if (!b) return;
    const cx = mapa2.w / 2, cy = mapa2.h / 2;
    if (b.dataset.z === 'encuadrar') mapa2.encuadra(); else mapa2.zoomPor(b.dataset.z === 'mas' ? 1.6 : 1 / 1.6, cx, cy, { ya: true });
  });
}
function zoomUI() {
  if (!mapa2) return;
  const k = (mapa2.vista || {}).k || 1, z = panel.querySelector('.v4-cmp__zoom');
  const q = s => z.querySelector(`[data-z="${s}"]`);
  if (q('encuadrar')) q('encuadrar').disabled = !mapa2.ampliado;
  if (q('menos')) q('menos').disabled = k <= 1.001;
  if (q('mas')) q('mas').disabled = k >= 15.99;
}
async function pintaMapa(mi, forzar) {
  const P = M.prov, F = M.F, niv = M.nivel, iA = M.i;
  const k = idxDerecha(F, iA);
  // deja escrito en el enlace el año real del panel derecho
  if (String(estado.cmp) !== String(F[k].clave)) { setEstado({ cmp: String(F[k].clave) }); return; }
  iB = k;
  if (P.prepararGeo) await P.prepararGeo(niv, iB);
  if (!geoBase) geoBase = await cargar('geo/municipios.topo.json');
  if (mi !== token || M.prov !== P) return;
  vacio('');
  if (!mapa2) creaMapa2();
  if (!H.mapa.alVista) { const izq = H.mapa.lienzoMapa(); if (izq) { let eco = false; mapa2.onVista = v => { zoomUI(); if (eco) return; eco = true; H.mapa.ponVista(v); eco = false; }; H.mapa.alVista = v => { if (eco || !activoCmp()) return; eco = true; mapa2._gesto({ ...v }, { ya: true }); eco = false; }; } }
  // mismas clases y colores: sobre los dos años; mientras se reproduce, las de todo el periodo, para que no bailen
  if (provEsc && provEsc !== P && provEsc.escalaComun) provEsc.escalaComun(niv, null);
  provEsc = P;
  let cambioEsc = false;
  if (P.escalaComun) cambioEsc = P.escalaComun(niv, M.playing ? null : [F[iA].clave, F[iB].clave]);
  if (cambioEsc) H.mapa.refrescar();
  // las dos cabeceras: mismo formato, mismo sitio
  const tit = document.getElementById('v4-titulo-h').textContent || '';
  const op = (otro) => F.map((f, j) => ({ v: f.clave, t: f.etiqueta, no: j === otro }));
  const k52 = P.cifra ? F.findIndex((f, k) => !!(P.cifra(k, niv) || {}).minimo) : -1, conMin = k52 >= 0 ? subDe(P, k52, niv) : '';   // minimo1752
  cabeceraPar(parA, { lado: 'a', conMin, titulo: tit, detalle: F[iA].etiqueta, sub: subDe(P, iA, niv), anios: [+F[iA].anio], anio: { opciones: op(iB), valor: F[iA].clave, cambia: v => H.irAnio(v) } });
  cabeceraPar(parB, { lado: 'b', conMin, titulo: tit, detalle: F[iB].etiqueta, sub: subDe(P, iB, niv), anios: [+F[iB].anio], anio: { opciones: op(iA), valor: F[iB].clave, cambia: v => setEstado({ cmp: String(v) }) } });
  { // minimo1752: los dos paneles reservan el mismo alto, el del texto de 1752, para que el mapa no se mueva al cambiar de fecha
    const q = [parA, parB].map(x => x && x.querySelector('.v4-par__s')).filter(Boolean);
    q.forEach(x => { x.style.minHeight = ''; });
    if (conMin) {
      const alto = Math.max(...q.map(x => { const t = x.textContent; x.textContent = conMin; const h = x.getBoundingClientRect().height; x.textContent = t; return h; }));
      q.forEach(x => { x.style.minHeight = `${Math.ceil(alto)}px`; });
    }
  }
  const clave = `${M.ind}|${niv}|${iB}|${estado.cmb}|${estado.ver}|${estado.obs}|${estado.interp}|${(estado.capas || []).join()}|${(estado.sel || []).join()}|${estado.var}`;
  if (!forzar && !cambioEsc && clave === clavePinta) return;
  clavePinta = clave;
  // el panel derecho
  const capa = P.capaDe ? P.capaDe(iB, niv) : null;
  mapa2.usaCapa(capa);
  const topoT = capa && capa.objeto === 'terminos' && hayEstados(capa.topo) ? capa.topo : null;
  mapa2.bordes = topoT ? (cx, proj, color) => dibujaBordes(cx, proj, topoT, { color, ancho: 0.5, alfa: color === '#dcd8cd' ? 1 : 0.9 }) : null;
  const g = P.grupos ? P.grupos(iB, niv) : null;
  mapa2.setGroups(g ? g.fn : null);
  const a = new Set(estado.capas || []);
  mapa2.sinProv = a.has('sinprov'); mapa2.limMun = a.has('lim_mun');
  mapa2.setSeleccion((estado.sel || []).filter(x => x && x !== '-'));
  if (Math.abs((mapa2.insets || {}).top - INSETS.top) > 1) mapa2.setInsets({ ...INSETS });
  const fn = P.relleno(iB, niv);
  const arr = mapa2.feats.map(d => fn(d.c, d) || { nd: true });
  mapa2.setFills(arr);
  const izq = H.mapa.lienzoMapa();
  if (izq && izq.vista) mapa2._gesto({ ...izq.vista }, { ya: true });
  zoomUI();
  // su leyenda, con el mismo título y las mismas notas que la izquierda
  const spec = P.leyenda ? P.leyenda(iB, niv) : null;
  const pres = presencia(arr);
  if (spec && spec.tipo === 'clases' && spec.claseDe) { pres.cuentas = spec.clases.map(() => 0); for (const r of arr) if (r && r.v != null && !r.nd && !r.oculto && isFinite(r.v)) pres.cuentas[spec.claseDe(r.v)]++; }
  const ley = panel.querySelector('.v4-cmp__ley');
  pintaLeyenda4(ley, spec, pres, { titulo: H.tituloLeyenda(spec), ancho: 300 });
  const lim = document.querySelector('#v4-leyenda .l4-limites');
  if (lim && topoT) ley.appendChild(lim.cloneNode(true));
}

// ---------------------------------------------------------------- PNG: los dos paneles, con su título dentro
function panelesPNG() {
  if (estado.vista === 'mapa') {
    return [
      { h: parA, lienzo: document.querySelector('#v4-escena canvas.m4-canvas'), ley: document.getElementById('v4-leyenda') },
      { h: parB, lienzo: panel.querySelector('.v4-cmp__canvas'), ley: panel.querySelector('.v4-cmp__ley') },
    ];
  }
  return [...document.querySelectorAll('#v4-escena .v4-par')].map(el => ({ h: el.querySelector('.v4-par__h'), svg: el.querySelector('svg.vv-svg'), ley: el }));
}
function itemsLeyenda(el) {
  const pn = [...el.querySelectorAll('[data-png-color]')];
  if (pn.length) return pn.map(x => ({ color: x.dataset.pngColor, t: (x.dataset.pngNombre || x.textContent || '').trim(), off: x.hasAttribute('data-png-off') }));
  return [...el.querySelectorAll('.l4-clases li, .l4-cats li')].map(li => { const i = li.querySelector('i'); const t = li.querySelector('.l4-clases__t'); return { color: i ? getComputedStyle(i).backgroundColor : '#999', t: ((t || li).textContent || '').trim() }; });
}
export const parActivo = () => dentro && panelesPNG().length === 2;
export async function imagenPar({ svgAImagen, baja, tok, aviso }) {
  const ps = panelesPNG();
  const dpr = 2, gap = 16, m = 20, cabH = 62, pie = 44;
  const dim = p => { const r = (p.lienzo || p.svg).getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const cw = Math.round(Math.max(...ps.map(p => dim(p).w))), ch = Math.round(Math.max(...ps.map(p => dim(p).h)));
  const W = m * 2 + cw * 2 + gap;
  const cal = document.createElement('canvas').getContext('2d');
  const sans = '"Instrument Sans", system-ui, sans-serif', serif = '"Syne", "Arial Black", sans-serif';
  cal.font = `500 12px ${sans}`;
  const filas = p => { let x = 0, n = 1; for (const it of itemsLeyenda(p.ley)) { const w = cal.measureText(it.t).width + 34; if (x + w > cw) { n++; x = 0; } x += w; } return n; };
  const leyH = Math.max(...ps.map(filas)) * 20 + 8;
  const Hh = m + cabH + ch + leyH + pie;
  const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = Hh * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const tinta = tok('--v4-tinta') || '#101010', t3 = tok('--v4-tinta-3') || '#6d736d';
  g.fillStyle = tok('--v4-papel') || '#fff'; g.fillRect(0, 0, W, Hh);
  const corta = (t, w) => { let s = t; while (s.length > 6 && g.measureText(s).width > w) s = s.slice(0, -2); return s === t ? s : s + '…'; };
  for (let k = 0; k < 2; k++) {
    const p = ps[k], x0 = m + k * (cw + gap);
    const ind = p.h.querySelector('.v4-par__ind').textContent, det = p.h.querySelector('.v4-par__det').textContent, sub = p.h.querySelector('.v4-par__s').textContent;
    g.fillStyle = tinta;
    const tt = `${ind} ${det}`;   // el título entero: la letra baja hasta que quepa
    let px = 19; g.font = `800 ${px}px ${serif}`;
    while (px > 11 && g.measureText(tt).width > cw - 4) { px -= 1; g.font = `800 ${px}px ${serif}`; }
    if (g.measureText(tt).width > cw - 4) g.font = `700 13px ${sans}`;
    g.fillText(corta(tt, cw - 4), x0, m + 22);
    g.fillStyle = t3; g.font = `400 12px ${sans}`;
    g.fillText(corta(sub, cw), x0, m + 42);
    const d = dim(p), ox = x0 + (cw - d.w) / 2, oy = m + cabH;
    if (p.lienzo) g.drawImage(p.lienzo, ox, oy, d.w, d.h);
    else { try { const { img } = await svgAImagen(p.svg); g.drawImage(img, ox, oy, d.w, d.h); } catch (e) { console.error(e); } }
    let lx = x0, ly = oy + ch + 16;
    g.font = `500 12px ${sans}`;
    for (const it of itemsLeyenda(p.ley)) {
      const w = g.measureText(it.t).width + 34;
      if (lx + w > x0 + cw) { lx = x0; ly += 20; }
      g.globalAlpha = it.off ? 0.35 : 1;
      g.fillStyle = it.color; g.fillRect(lx, ly - 10, 12, 12);
      g.fillStyle = tinta; g.fillText(it.t, lx + 17, ly);
      g.globalAlpha = 1;
      lx += w;
    }
  }
  g.fillStyle = tok('--v4-linea') || '#d8d2c4'; g.fillRect(0, Hh - pie, W, 1);
  g.fillStyle = t3; g.font = `400 11px ${sans}`;
  const fu = [...new Set([...document.querySelectorAll('#v4-fuente .v4-fu__n')].map(x => x.textContent))].join(' · ');
  g.fillText(corta(`Fuente original: ${fu || 'sin identificar'}`, W - 2 * m), m, Hh - pie + 17);
  g.fillText(corta(`Atlas Histórico de Andalucía · ${location.href.split('#')[0]}`, W - 2 * m), m, Hh - pie + 33);
  const ent = datos.indicador(estado.ind);
  cv.toBlob(b => { if (b) { baja(b, `${ent ? ent.id : 'visor'}__${estado.nivel}__comparar.png`); aviso('Imagen PNG lista.'); } }, 'image/png');
}
