/* fronteras.html · timelapse de términos municipales + ficha de cada municipio.
   Datos: data/v2 (geo/municipios.topo.json, geo/terminos/<corte>.topo.json, geo/nucleos.json,
   fronteras/conteo.json, fronteras/historia.json, fuentes.json). Esquema: docs/v2/DATOS.md. */

import { montarNav } from '../atlas2/nav.js';
import { cargarSiHay, version } from '../atlas2/data.js';
import { cargarFuentes, tituloFuente, fuente } from '../atlas2/fuentes.js';
import { MapaCanvas, trama, crearTooltip, capaRelieve } from '../atlas2/mapa.js';
import { token, alCambiarTema, reduceMotion, esc, entero, normaliza } from '../atlas2/fmt.js';
import { leyenda, rampa, insignia } from '../atlas2/leyenda.js';
import { cargarConteo, cargarHoy, cargarCorte, cargarNucleos, cargarHistoria, etiquetaFecha } from './datos.js';
import { pintarConteo, pintarEnsenada, ESTADOS_LIMITE_1752, estadoLimite } from './graficos.js';
import { abrirFicha, cerrarFicha } from './ficha.js';

montarNav('fronteras');

const $ = s => document.querySelector(s);
const PRE1842 = c => c === '1752' || c === '1787';
const PASO_MS = 1600;
const FUNDIDO_MS = 520;

/* ---------- estado ---------- */
const S = {
  cortes: [], i: 0, playing: false, cambios: true,
  sel: null,         // INE de hoy seleccionado
  hover: null,       // rasgo bajo el puntero
  hoy: null, conteo: [], nucleos: new Map(), historia: new Map(),
  actual: null, previo: null,  // datos de corte
  timer: null, modoLimite: false, relieve: null, verRelieve: true,
};
const tooltip = crearTooltip();
let mapa = null;
let colores = {};

/* ---------- arranque ---------- */
boot().catch(err => {
  console.warn(err);
  const msg = $('#mapa-msg');
  msg.hidden = false;
  msg.textContent = 'Los mapas de términos aún no están en data/v2. Vuelve a cargar dentro de un rato.';
});

async function boot() {
  leerColores();
  const params = new URLSearchParams(location.search);
  // solo se pide lo que el agente de datos ya ha publicado (MANIFEST.json), para no llenar la consola de 404
  const manifest = await cargarSiHay('MANIFEST.json');
  const fich = (manifest && (manifest.ficheros || manifest.files)) || {};
  S.hay = ruta => Object.prototype.hasOwnProperty.call(fich, ruta);
  const [hoy, conteo] = await Promise.all([
    cargarHoy(),
    S.hay('fronteras/conteo.json') ? cargarConteo().catch(() => []) : [],
    S.hay('fuentes.json') ? cargarFuentes() : null,
  ]);
  S.hoy = hoy;
  S.conteo = conteo;
  S.cortes = conteo.length ? conteo.map(r => r.corte) : cortesDelManifiesto(manifest);
  if (!S.cortes.length) throw new Error('sin cortes');
  // solo los cortes que tienen geometría publicada
  const conGeo = cortesDelManifiesto(manifest);
  if (conGeo.length) S.cortes = S.cortes.filter(c => conGeo.includes(c));

  const pedido = params.get('corte');
  S.i = Math.max(0, S.cortes.indexOf(pedido));
  if (pedido == null) S.i = S.cortes.indexOf('1752') >= 0 ? S.cortes.indexOf('1752') : 0;

  mapa = new MapaCanvas($('#mapa'), {
    encaje: hoy.encaje,
    alPasar: onHover,
    alPinchar: onClick,
    etiqueta: 'Mapa de términos municipales',
  });

  montarControles();
  montarBuscador();
  pintarLeyenda();
  pintarPie(manifest);

  // piezas que pueden tardar o no estar aún
  S.verRelieve = params.get('relieve') !== '0';
  $('#chk-relieve').checked = S.verRelieve;
  if (S.hay('geo/relieve/capas.json') && S.hay('geo/relieve/relieve_sombreado.png')) {
    capaRelieve({ tipo: 'sombreado', alfa: 0.42 }).then(c => { S.relieve = c; $('#lbl-relieve').hidden = false; dibujar(0); }).catch(e => console.warn(e));
  }
  if (S.hay('geo/nucleos.json')) cargarNucleos().then(n => { S.nucleos = n; dibujar(0); }).catch(() => {});
  if (S.hay('fronteras/historia.json')) cargarHistoria().then(h => { S.historia = h; }).catch(() => {});

  await irA(S.i, { fundido: 0 });
  $('#mapa-msg').hidden = true;

  if (conteo.length) {
    pintarConteo($('#grafico-conteo'), conteo, { actual: () => S.cortes[S.i], alElegir: c => { parar(); irA(S.cortes.indexOf(c)); } });
    pintarEnsenada(conteo);
    if (S.cortes.includes('1752')) cargarCorte('1752', S.hoy).then(async d => {
      const estados = new Set(d.feats.map(f => estadoLimite(f.properties)).filter(Boolean));
      const avisos = S.hay('series/avisos_1752.json') ? await cargarSiHay('series/avisos_1752.json') : null;
      pintarEnsenada(conteo, { estados, avisos });
      const b = document.querySelector('#btn-limite');
      if (b) b.addEventListener('click', () => {
        S.modoLimite = !S.modoLimite; b.setAttribute('aria-pressed', String(S.modoLimite));
        parar(); irA(S.cortes.indexOf('1752'));
        $('#mapa').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
      });
    }).catch(() => {});
  } else {
    $('#grafico-conteo').innerHTML = '<p class="a2-empty">El recuento por corte (conteo.json) aún no está en data/v2.</p>';
  }

  const m = params.get('m');
  if (m) seleccionar(m, { enfocar: false });

  // precarga del resto de cortes en segundo plano (para el timelapse y la ficha)
  const precargar = async () => { for (const c of S.cortes) { try { await cargarCorte(c, S.hoy); } catch (e) { /* aún no está */ } } };
  if (window.requestIdleCallback) requestIdleCallback(precargar, { timeout: 2000 }); else setTimeout(precargar, 300);

  alCambiarTema(() => { leerColores(); pintarLeyenda(); dibujar(0); });
  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(location.search);
    const k = S.cortes.indexOf(p.get('corte'));
    if (k >= 0) irA(k, { url: false });
  });
}

function cortesDelManifiesto(man) {
  if (!man) return [];
  const fich = man.ficheros || man.files || man;
  const out = [];
  for (const k of Object.keys(fich)) {
    const m = /^geo\/terminos\/(.+)\.topo\.json$/.exec(k);
    if (m) out.push(m[1]);
  }
  const ord = c => (c === 'hoy' ? 9999 : +c);
  return out.sort((a, b) => ord(a) - ord(b));
}

function leerColores() {
  colores = {
    seq: [1, 2, 3, 4, 5].map(i => token(`--a2-seq-${i}`)),
    accent: token('--a2-accent'),
    ink: token('--a2-ink'),
    ink2: token('--a2-ink-2'),
    surface: token('--a2-surface'),
    stroke: token('--a2-map-stroke'),
    outline: token('--a2-map-outline'),
    nodata: token('--a2-nodata'),
    nodataLine: token('--a2-nodata-line'),
    estLine: token('--a2-est-line'),
    ochre: token('--a2-ochre'),
    violet: token('--a2-violet'),
    blue: token('--a2-blue'),
    selFill: (() => { const c = window.d3.color(token('--a2-ink')); c.opacity = 0.28; return c.formatRgb(); })(),
    aprox: (() => { const c = window.d3.color(token('--a2-ink')); c.opacity = 0.5; return c.formatRgb(); })(),
  };
}

/* ---------- escala: cuántos recintos de hoy forman el término ---------- */
const CLASES = [
  { max: 1, txt: '1' }, { max: 2, txt: '2' }, { max: 4, txt: '3–4' }, { max: 9, txt: '5–9' }, { max: Infinity, txt: '10 o más' },
];
function clase(n) { return CLASES.findIndex(c => n <= c.max); }
function colorTermino(p) {
  const c = colores.seq[Math.max(0, clase(p.pz.length))];
  if (p.pg === 'oficial') return c;
  // derivado por unión o aproximado: un punto más translúcido que el oficial
  const d = window.d3.color(c); d.opacity = 0.9; return d.formatRgb();
}

/* ---------- dibujo ---------- */
async function irA(i, { fundido = FUNDIDO_MS, url = true } = {}) {
  i = Math.max(0, Math.min(S.cortes.length - 1, i));
  S.i = i;
  const corte = S.cortes[i];
  const msg = $('#mapa-msg');
  let actual;
  try {
    actual = await cargarCorte(corte, S.hoy);
  } catch (e) {
    msg.hidden = false; msg.textContent = `El mapa de ${corte} aún no está en data/v2.`;
    return;
  }
  if (S.i !== i) return; // llegó tarde
  msg.hidden = true;
  S.actual = actual;
  S.previo = i > 0 ? await cargarCorte(S.cortes[i - 1], S.hoy).catch(() => null) : null;
  if (S.i !== i) return;
  for (const f of actual.feats) f.properties.cambia = !!(S.previo && !S.previo.claves.has(f.properties.key));
  dibujar(fundido);
  pintarCabecera();
  sincronizarControles();
  if (url) escribirURL();
  if (S.sel) refrescarSeleccion();
  document.dispatchEvent(new CustomEvent('fr:corte', { detail: { corte } }));
}

function dibujar(fundido = 0) {
  if (!mapa || !S.actual) return;
  const corte = S.cortes[S.i];
  const feats = S.actual.feats;
  const tramaAprox = trama({ linea: colores.aprox, paso: 4.5, grosor: 0.8, angulo: 45 });
  const tramaSinMun = trama({ fondo: colores.nodata, linea: colores.nodataLine, angulo: 'x' });
  const capas = [
    {
      tipo: 'poligonos', rasgos: feats, elegible: true,
      relleno: f => {
        if (f.properties.pe === 'sin_municipio_en_la_fecha') return tramaSinMun;
        if (S.modoLimite && corte === '1752') {
          const e = ESTADOS_LIMITE_1752.find(x => x.id === estadoLimite(f.properties));
          return e ? token(e.token) : tramaSinMun;
        }
        return colorTermino(f.properties);
      },
      trama: f => (f.properties.pg === 'aproximado' && f.properties.pe !== 'sin_municipio_en_la_fecha') ? tramaAprox : null,
      trazo: colores.stroke, grosor: f => f.properties.pg === 'oficial' ? 0.7 : 0.5,
    },
    ...(S.relieve && S.verRelieve ? [{ ...S.relieve, recorte: S.hoy.encaje }] : []),
    { tipo: 'malla', geom: S.actual.interiores, trazo: colores.ink, grosor: 0.6, guiones: [1.2, 2.4], alfa: 0.55 },
  ];
  if (S.cambios && S.previo) {
    const cambian = feats.filter(f => f.properties.cambia);
    const tinte = window.d3.color(colores.accent); tinte.opacity = 0.22;
    capas.push({ tipo: 'poligonos', rasgos: cambian, relleno: tinte.formatRgb(), trazo: colores.accent, grosor: 1.7 });
  }
  capas.push({ tipo: 'malla', geom: S.hoy.borde, trazo: colores.outline, grosor: 1.1 });
  // municipios sin contorno propio: puntos en su núcleo
  const pts = (S.nucleos.get(corte) || []).filter(p => p.proc === 'contenido_sin_contorno');
  capas.push({
    tipo: 'puntos', elegible: true,
    puntos: pts.map(p => ({ ...p, r: 2.6, relleno: colores.ink, trazo: colores.surface, grosor: 1, dato: p })),
  });
  // número de municipios en los términos conjuntos
  const conj = feats.filter(f => f.properties.pe === 'termino_conjunto_de_varios' && f.properties.nm > 1);
  const path = window.d3.geoPath(mapa.proyeccion);
  capas.push({
    tipo: 'texto', color: colores.ink, halo: colores.surface, fuente: '700 10.5px "JetBrains Mono", monospace',
    textos: conj.map(f => ({ xy: path.centroid(f), texto: String(f.properties.nm) })).filter(t => t.xy.every(Number.isFinite)),
  });
  mapa.dibujar({ capas, fundido });
  pintarEncima();
}

function pintarEncima() {
  mapa.dibujarEncima((ctx, path) => {
    if (S.sel && S.actual) {
      const pieza = S.hoy.porIne.get(S.sel);
      const term = S.actual.porPieza.get(S.sel);
      if (term) { ctx.beginPath(); path(term); ctx.strokeStyle = colores.surface; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = colores.ink; ctx.lineWidth = 3; ctx.stroke(); }
      if (pieza) {
        ctx.beginPath(); path(pieza); ctx.fillStyle = colores.selFill; ctx.fill();
        ctx.setLineDash([3, 2.5]); ctx.strokeStyle = colores.ink; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    const h = S.hover;
    if (h && h.type === 'Feature') { ctx.beginPath(); path(h); ctx.strokeStyle = colores.ink; ctx.lineWidth = 1.6; ctx.stroke(); }
  });
}

/* ---------- cabecera del mapa, insignias y estado ---------- */
function pintarCabecera() {
  const corte = S.cortes[S.i];
  const fila = S.conteo.find(r => r.corte === corte);
  $('#anio-grande').textContent = corte === 'hoy' ? 'Hoy' : corte;
  $('#anio-sub').textContent = fila && fila.fuente ? (fuente(fila.fuente) ? tituloFuente(fila.fuente) : fila.fuente) : '';
  const bs = [insignia('candidata')];
  if (PRE1842(corte)) { bs.push(insignia('revision')); bs.push(insignia('supuesto')); }
  $('#insignias-mapa').innerHTML = bs.join('');

  const feats = S.actual.feats;
  const cambian = feats.filter(f => f.properties.cambia).length;
  const sinMun = feats.filter(f => f.properties.pe === 'sin_municipio_en_la_fecha').length;
  const prev = S.i > 0 ? S.cortes[S.i - 1] : null;
  const partes = [`<strong>${corte === 'hoy' ? 'Hoy' : corte}</strong>: ${entero(feats.length)} términos dibujados`];
  if (fila && fila.entrada != null) partes.push(`${entero(fila.entrada)} ${PRE1842(corte) ? 'pueblos con entrada propia' : 'municipios'}`);
  const filaPrev = prev ? S.conteo.find(r => r.corte === prev) : null;
  if (prev) {
    const dm = fila && filaPrev && fila.entrada != null && filaPrev.entrada != null ? fila.entrada - filaPrev.entrada : null;
    const dmTxt = dm ? ` (${dm > 0 ? '+' : '−'}${entero(Math.abs(dm))} ${PRE1842(corte) || PRE1842(prev) ? (Math.abs(dm) === 1 ? 'entrada' : 'entradas') : (Math.abs(dm) === 1 ? 'municipio' : 'municipios')}${PRE1842(prev) && !PRE1842(corte) ? ', con otra fuente' : ''})` : '';
    partes.push((cambian ? `${entero(cambian)} términos cambian de forma frente a ${prev}` : `ningún término cambia de forma frente a ${prev}`) + dmTxt);
  }
  if (sinMun) partes.push(`${entero(sinMun)} términos sin pueblo contado en la fuente${PRE1842(corte) ? ' (pendientes de situar)' : ''}`);
  $('#estado-corte').innerHTML = partes.join(' · ');
  mapa.base.setAttribute('aria-label', `Mapa de términos municipales en ${corte}. ${$('#estado-corte').textContent}`);

  if (!S.sel) pintarResumen(fila, feats.length, cambian);
}

function pintarResumen(fila, nTerm, cambian) {
  const el = $('#resumen-corte');
  if (!el) return;
  const corte = S.cortes[S.i];
  el.innerHTML = `<div class="fr-resumen">
    <div class="a2-stat"><span class="a2-stat__value">${fila && fila.entrada != null ? entero(fila.entrada) : '—'}</span>
      <span class="a2-stat__label">${PRE1842(corte) ? 'pueblos con entrada propia' : 'municipios'} en ${corte === 'hoy' ? 'la actualidad' : corte}</span></div>
    <div class="a2-stat"><span class="a2-stat__value">${entero(nTerm)}</span>
      <span class="a2-stat__label">términos que se pueden dibujar</span></div>
  </div>
  ${fila && fila.definicion ? `<p class="a2-small" style="margin-top:12px">Qué se cuenta: ${esc(fila.definicion)}.</p>` : ''}
  ${fila && fila.rotulo ? `<p class="a2-note">${esc(fila.rotulo)}</p>` : ''}`;
}

/* ---------- leyenda ---------- */
function pintarLeyenda() {
  $('#leyenda').innerHTML = `
    <div>
      <p class="a2-panel__title">Recintos de hoy que forman cada término</p>
      ${rampa(colores.seq, CLASES.map(c => c.txt), { etiqueta: 'Recintos de hoy por término' })}
    </div>
    ${leyenda([
      { texto: 'Cambia frente al corte anterior', color: 'color-mix(in srgb, var(--a2-accent) 22%, transparent)', estilo: 'border:2px solid var(--a2-accent);' },
      { texto: 'Término del municipio elegido (su recinto de hoy, en gris)', color: 'transparent', estilo: 'border:3px solid var(--a2-ink);' },
      { texto: 'Aproximado (traspasos posteriores)', color: 'var(--a2-seq-2)', estilo: 'background-image:repeating-linear-gradient(45deg,var(--a2-ink) 0 .7px,transparent .7px 4px);' },
      { texto: 'La fuente no cuenta ningún pueblo ahí (1752, 1787: lugar pendiente de situar)', clase: 'a2-trama-sindato' },
      { texto: 'Municipio sin contorno propio (en su núcleo)', clase: 'a2-swatch--dot', color: 'var(--a2-ink)' },
      { texto: 'Borde de recintos de hoy dentro de un término', clase: 'a2-swatch--dash', estilo: 'border-top-style:dotted;' },
    ], { etiqueta: 'Leyenda del mapa' })}
    <p class="a2-small" style="margin:0">El número sobre un término dice cuántos municipios de esa fecha comparten ese polígono.
      Geometría oficial (recinto de hoy, IECA) con borde sólido; la derivada por unión, algo más clara.</p>`;
}

/* ---------- controles ---------- */
function montarControles() {
  const r = $('#rango-corte');
  r.max = S.cortes.length - 1;
  r.addEventListener('input', () => { parar(); irA(+r.value, { fundido: 220 }); });
  $('#btn-play').addEventListener('click', () => (S.playing ? parar() : reproducir()));
  $('#btn-prev').addEventListener('click', () => { parar(); irA(S.i - 1); });
  $('#btn-next').addEventListener('click', () => { parar(); irA(S.i + 1); });
  $('#chk-cambios').addEventListener('change', e => { S.cambios = e.target.checked; dibujar(0); });
  $('#chk-relieve').addEventListener('change', e => { S.verRelieve = e.target.checked; escribirURL(); dibujar(0); });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowRight') { parar(); irA(S.i + 1); }
    else if (e.key === 'ArrowLeft') { parar(); irA(S.i - 1); }
    else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); S.playing ? parar() : reproducir(); }
  });
  const ticks = $('#ticks');
  ticks.innerHTML = S.cortes.map((c, k) => `<span data-k="${k}" style="left:calc(${k / Math.max(1, S.cortes.length - 1)} * (100% - 16px) + 8px)">${c}</span>`).join('');
  const marcarMenores = () => {
    const w = ticks.getBoundingClientRect().width;
    const cada = w < 420 ? 4 : w < 640 ? 2 : 1;
    const cerca = Math.max(1, cada) * (w < 640 ? 1 : 0.5);
    ticks.querySelectorAll('span').forEach((s, k) => {
      const ult = S.cortes.length - 1;
      const base = k === ult || (k % cada === 0 && ult - k >= Math.max(2, cada / 2 + 1));
      const tapa = k !== S.i && Math.abs(k - S.i) <= Math.ceil(cerca) && w < 900;
      s.classList.toggle('is-minor', !(k === S.i || (base && !tapa)));
    });
  };
  new ResizeObserver(marcarMenores).observe(ticks);
  document.addEventListener('fr:corte', marcarMenores);
}

function sincronizarControles() {
  $('#rango-corte').value = S.i;
  $('#rango-corte').setAttribute('aria-valuetext', S.cortes[S.i]);
  document.querySelectorAll('#ticks span').forEach((s, k) => s.classList.toggle('is-on', k === S.i));
  $('#btn-prev').disabled = S.i === 0;
  $('#btn-next').disabled = S.i === S.cortes.length - 1;
}

function reproducir() {
  if (S.i >= S.cortes.length - 1) irA(0);
  S.playing = true;
  $('#btn-play').setAttribute('aria-label', 'Pausar');
  $('#ico-play').setAttribute('d', 'M6 5h4v14H6zM14 5h4v14h-4z');
  const paso = () => {
    if (!S.playing) return;
    if (S.i >= S.cortes.length - 1) { parar(); return; }
    irA(S.i + 1, { fundido: reduceMotion() ? 0 : FUNDIDO_MS }).then(() => { S.timer = setTimeout(paso, PASO_MS); });
  };
  S.timer = setTimeout(paso, reduceMotion() ? PASO_MS : 500);
}
function parar() {
  S.playing = false;
  clearTimeout(S.timer);
  $('#btn-play').setAttribute('aria-label', 'Reproducir');
  $('#ico-play').setAttribute('d', 'M8 5v14l11-7z');
}

/* ---------- interacción con el mapa ---------- */
function municipioHoyEn(term, ev) {
  if (!term || !term.properties.pz) return null;
  const r = mapa.base.getBoundingClientRect();
  const ll = mapa.proyeccion.invert([ev.clientX - r.left, ev.clientY - r.top]);
  if (!ll) return null;
  for (const c of term.properties.pz) {
    const f = S.hoy.porIne.get(c);
    if (f && window.d3.geoContains(f, ll)) return f;
  }
  return S.hoy.porIne.get(term.properties.pz[0]) || null;
}

function onHover(el, ev) {
  S.hover = el && el.type === 'Feature' ? el : null;
  pintarEncima();
  if (!el) { tooltip.ocultar(); return; }
  const corte = S.cortes[S.i];
  if (el.type !== 'Feature') {
    // punto de núcleo
    const term = S.actual.porPieza.get(el.ine);
    tooltip.mostrar(`<strong>${esc(el.nombre)}</strong>
      Municipio en ${corte} sin contorno propio: se dibuja en su núcleo.${term ? ` Su suelo está dentro del término de ${esc(etiquetaFecha(term.properties))}.` : ''}
      <div class="a2-tt-meta">INE ${esc(el.ine)}</div>`, ev.clientX, ev.clientY);
    return;
  }
  const p = el.properties;
  const hoy = municipioHoyEn(el, ev);
  const lineas = [];
  if (p.pe === 'sin_municipio_en_la_fecha' || !etiquetaFecha(p)) {
    const fila = S.conteo.find(r => r.corte === corte);
    lineas.push(`La fuente de ${corte} no cuenta ningún pueblo en este término.${fila && fila.porQue ? ` ${esc(fila.porQue.charAt(0).toUpperCase() + fila.porQue.slice(1))}.` : ''}<br><span class="a2-tt-meta">Unidad estable «${esc(p.n)}» (nombre de hoy)</span>`);
  }
  else {
    lineas.push(`${p.pz.length === 1 ? '1 recinto de hoy' : `${p.pz.length} recintos de hoy`}${p.ha ? ` · ${entero(p.ha)} ha` : ''}`);
    if (p.nm > 1) lineas.push(`Término conjunto: ${p.nm} municipios en un solo polígono`);
    if (p.mf) lineas.push(`<span class="a2-tt-meta">Unidad estable «${esc(p.n)}»</span>`);
  }
  lineas.push({ oficial: 'Geometría oficial (recinto de hoy)', derivado_por_union: 'Derivado uniendo recintos de hoy', aproximado: 'Aproximado: hay traspasos posteriores en sus piezas' }[p.pg] || esc(p.pg || ''));
  if (p.cambia) lineas.push(`<span style="color:var(--a2-accent)">Cambia frente a ${S.cortes[S.i - 1]}</span>`);
  tooltip.mostrar(`<strong>${esc(etiquetaFecha(p) || `Sin pueblo contado en ${corte}`)}</strong>${lineas.join('<br>')}
    ${hoy ? `<div class="a2-tt-meta">Pincha para ver la historia de ${esc(hoy.properties.n)} (hoy)</div>` : ''}`, ev.clientX, ev.clientY);
}

function onClick(el, ev) {
  if (!el) return;
  if (el.type !== 'Feature') {
    const ine = S.hoy.porIne.has(el.ine) ? el.ine : (S.actual.porPieza.get(el.ine) ? el.ine : null);
    const term = S.actual.porPieza.get(el.ine);
    const destino = S.hoy.porIne.has(el.ine) ? el.ine : (term ? (term.properties.pz.find(z => S.hoy.porIne.has(z)) || null) : null);
    if (destino) seleccionar(destino);
    return;
  }
  const hoy = municipioHoyEn(el, ev);
  if (hoy) seleccionar(hoy.properties.c);
}

/* ---------- selección y ficha ---------- */
async function seleccionar(ine, { enfocar = true } = {}) {
  ine = String(ine).padStart(5, '0');
  if (!S.hoy.porIne.has(ine)) return;
  parar();
  S.sel = ine;
  escribirURL();
  pintarEncima();
  const historia = S.hay('fronteras/historia.json') ? await cargarHistoria().catch(() => new Map()) : new Map();
  S.historia = historia;
  await abrirFicha($('#ficha'), {
    ine, hoy: S.hoy, conteo: S.conteo, cortes: S.cortes, corteActual: () => S.cortes[S.i], historia: historia.get(ine) || null, hayHistoria: historia.size > 0,
    nucleos: S.nucleos, cargarCorte: c => cargarCorte(c, S.hoy),
    irACorte: c => { const k = S.cortes.indexOf(c); if (k >= 0) irA(k); },
    seleccionar: c => seleccionar(c),
    cerrar: () => { S.sel = null; escribirURL(); pintarEncima(); cerrarFicha($('#ficha')); pintarCabecera(); },
    colores,
  });
  if (enfocar) {
    const ficha = $('#ficha');
    if (window.matchMedia('(max-width: 980px)').matches) ficha.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    ficha.focus({ preventScroll: true });
  }
}
function refrescarSeleccion() {
  pintarEncima();
  document.dispatchEvent(new CustomEvent('fr:sel-corte', { detail: { corte: S.cortes[S.i] } }));
}

/* ---------- buscador ---------- */
function montarBuscador() {
  const input = $('#buscar'), lista = $('#sugerencias');
  const indice = S.hoy.feats.map(f => ({ c: f.properties.c, n: f.properties.n, k: normaliza(f.properties.n), p: f.properties.p }))
    .sort((a, b) => a.n.localeCompare(b.n, 'es'));
  const PROV = { '04': 'Almería', '11': 'Cádiz', '14': 'Córdoba', '18': 'Granada', '21': 'Huelva', '23': 'Jaén', '29': 'Málaga', '41': 'Sevilla' };
  let opciones = [], activa = -1;
  const pintar = () => {
    lista.innerHTML = opciones.map((o, k) => `<li role="option" id="opt-${o.c}" data-c="${o.c}" aria-selected="${k === activa}">${esc(o.n)} <small>${PROV[o.p] || ''} · ${o.c}</small></li>`).join('');
    lista.hidden = !opciones.length;
    input.setAttribute('aria-expanded', String(!!opciones.length));
    input.setAttribute('aria-activedescendant', activa >= 0 && opciones[activa] ? `opt-${opciones[activa].c}` : '');
  };
  input.addEventListener('input', () => {
    const q = normaliza(input.value);
    if (!q) { opciones = []; pintar(); return; }
    const empieza = indice.filter(o => o.k.startsWith(q));
    const contiene = indice.filter(o => !o.k.startsWith(q) && o.k.includes(q));
    opciones = [...empieza, ...contiene].slice(0, 12);
    if (/^\d{3,5}$/.test(q)) opciones = indice.filter(o => o.c.startsWith(q)).slice(0, 12);
    activa = opciones.length ? 0 : -1;
    pintar();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); activa = Math.min(opciones.length - 1, activa + 1); pintar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activa = Math.max(0, activa - 1); pintar(); }
    else if (e.key === 'Enter' && opciones[activa]) { e.preventDefault(); elegir(opciones[activa]); }
    else if (e.key === 'Escape') { opciones = []; pintar(); }
  });
  lista.addEventListener('pointerdown', e => {
    const li = e.target.closest('li'); if (!li) return;
    e.preventDefault();
    elegir(opciones.find(o => o.c === li.dataset.c));
  });
  input.addEventListener('blur', () => setTimeout(() => { opciones = []; pintar(); }, 120));
  function elegir(o) { if (!o) return; input.value = o.n; opciones = []; pintar(); seleccionar(o.c); }
}

/* ---------- URL compartible ---------- */
function escribirURL() {
  const p = new URLSearchParams(location.search);
  p.set('corte', S.cortes[S.i]);
  if (S.sel) p.set('m', S.sel); else p.delete('m');
  if (!S.verRelieve) p.set('relieve', '0'); else p.delete('relieve');
  history.replaceState(null, '', `${location.pathname}?${p.toString()}${location.hash}`);
}

/* ---------- pie con versión de datos ---------- */
async function pintarPie(manifest) {
  const v = await version();
  const geo = manifest && (manifest.ficheros || {})['geo/municipios.topo.json'];
  const fecha = (geo && geo.generado) || (v && v.fecha);
  const huella = geo && geo.sha256 ? geo.sha256.slice(0, 8) : (v && v.huella);
  $('#pie').innerHTML = `Atlas Histórico de Andalucía · Fronteras. Geometría histórica aceptada por decisión firmada del responsable de la base
    (términos reconstruidos uniendo los recintos municipales de hoy del IECA). Relaciones entre municipios: INE, alteraciones
    de los municipios. ${fecha ? `Datos generados el ${esc(String(fecha).replace('T', ' a las '))}` : ''}${huella ? ` · huella <span class="a2-mono">${esc(huella)}</span>` : ''}.`;
}

export { S, ESTADOS_LIMITE_1752 };
