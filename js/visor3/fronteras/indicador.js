// indicador.js — «Fronteras: términos de cada año» como indicador del visor único (VISOR3_API.md §4).
// Un fotograma por corte (1752, 1787, 1842 … 2021, hoy). Ronda v15 (Juan: «solo los límites de cada año dibujados»):
// de entrada, los límites de cada fecha sobre relleno neutro; con `opciones.hoy`, encima, los de hoy en azul discontinuo.
// El puntero dice solo el nombre del término en la fecha, a qué municipios de hoy corresponde y, si el límite es
// aproximado o supuesto, una línea que lo dice. Lo de antes sigue detrás de sus opciones, apagadas: color por recintos
// de hoy, lo que cambia frente al corte anterior (borde y velo de acento), contorno aproximado (rayado),
// bordes de los recintos de hoy dentro de cada término conjunto (punteado), número de municipios de la fecha en los
// términos conjuntos y municipios sin contorno propio como punto en su núcleo. Nada se inventa: todo sale de
// geo/terminos/<corte>.topo.json, geo/nucleos.json y fronteras/conteo.json.

import { base, PRE1842, anioDeCorte } from './base.js';
import { token, entero, esc } from '../../atlas2/fmt.js';
import { cargar as cargarDatos } from '../../atlas2/data.js';
import { trama } from '../../atlas2/mapa.js';
import { INSIGNIAS } from '../../atlas2/leyenda.js';
import { buscarFuente } from '../../atlas2/fuentes.js';
import { etiquetaFecha } from '../../fronteras/datos.js';
import { hayEstados, dibujaBordes, estadoDe, claseDe, clasesPresentes } from '../../visor4/limites.js';

export const CLASES = [
  { max: 1, txt: '1' }, { max: 2, txt: '2' }, { max: 4, txt: '3–4' }, { max: 9, txt: '5–9' }, { max: Infinity, txt: '10 o más' },
];
const clase = n => Math.max(0, CLASES.findIndex(c => n <= c.max));

// ronda v8: de entrada, limpio (los términos de cada fecha y cuántos municipios había); lo demás, con botones en Opciones.
// dibujo: color por recintos de hoy, rayado de aproximados y puntos; conjuntos: números y bordes interiores; cambios: rojo;
// grises: propuesta de «límites»; ensenada: panel de recuento y Catastro de Ensenada. municipio: INE con la ficha abierta.
export const opciones = { cambios: false, dibujo: false, conjuntos: false, grises: false, ensenada: false, hoy: false, municipio: null };
const FONDO_TERMINO = '#efede6';

let B = null;            // base()
let D = [];              // por fotograma: datos del corte (cargarCorte) con `cambia` marcado
let F = [];              // fotogramas
let COL = null;
let HOY = null;   // malla de los municipios de hoy (interruptor «Fronteras de hoy»)
export const COLOR_HOY = '#1565c0';   // azul y discontinuo: se distingue del negro de los límites de la fecha

function colores() {
  const d3 = window.d3;
  const a = c => { const x = d3.color(token('--a2-ink')); x.opacity = c; return x.formatRgb(); };
  const tinte = d3.color(token('--a2-accent')); tinte.opacity = 0.22;
  COL = {
    seq: [1, 2, 3, 4, 5].map(i => token(`--a2-seq-${i}`)),
    accent: token('--a2-accent'), ink: token('--a2-ink'), surface: token('--a2-surface'),
    tinte: tinte.formatRgb(), aprox: a(0.5), interior: a(0.55),
  };
  return COL;
}

// fuente de cada corte: id de fuentes.json (el recuento trae el id o el texto original) y la de la geometría
function fuentesDeCorte(fila) {
  const out = [];
  const f = fila && fila.fuente;
  if (f) out.push(buscarFuente(f) || f);
  out.push('IECA-DELIM-20260415');
  return out;
}

function fotograma(c, k) {
  const fila = B.conteo.find(r => r.corte === c) || null;
  const pre = PRE1842(c);
  const avisos = [{ tipo: 'candidata', texto: INSIGNIAS.candidata }];
  if (pre) { avisos.push({ tipo: 'revision', texto: INSIGNIAS.revision }); avisos.push({ tipo: 'supuesto', texto: INSIGNIAS.supuesto }); }
  return {
    clave: c, anio: anioDeCorte(c), etiqueta: c === 'hoy' ? 'Hoy' : c, corto: c === 'hoy' ? 'hoy' : c, corte: c,
    avisos, revision: pre, hito: true, fuentes: fuentesDeCorte(fila),
    nota: (fila && (fila.rotulo || (fila.definicion ? `Se cuenta cada ${fila.definicion}.` : ''))) || '',
    fila, k,
  };
}

async function cargar() {
  if (F.length) return;
  B = await base();
  colores();
  const datos = await Promise.all(B.cortes.map(c => B.corte(c).catch(() => null)));
  const cortes = B.cortes.filter((c, k) => datos[k]);
  D = datos.filter(Boolean);
  D.forEach((d, k) => {
    const prev = k > 0 ? D[k - 1] : null;
    for (const f of d.feats) f.properties.cambia = !!(prev && !prev.claves.has(f.properties.key));
    d.porU = new Map(d.feats.map(f => [String(f.properties.u), f]));
    d.nCambian = d.feats.filter(f => f.properties.cambia).length;
  });
  F = cortes.map(fotograma);
}

// ---------- Path2D propios para las capas (caché por proyección)
const P2 = new WeakMap();
let claveProy = '', geoPath = null;
function path2d(obj, proj) {
  const k = `${proj.scale()}|${proj.translate().join(',')}`;
  if (k !== claveProy) { claveProy = k; geoPath = window.d3.geoPath(proj); }
  const c = P2.get(obj);
  if (c && c.k === k) return c.p;
  const p = new Path2D(geoPath(obj) || '');
  P2.set(obj, { k, p });
  return p;
}

function capas(i) {
  const d = D[i];
  if (!d) return [];
  const c = COL || colores();
  const out = [];
  // los límites de los términos de la fecha: lo que enseña este mapa
  if (!d.malla) d.malla = window.topojson.mesh(d.topo, d.topo.objects.terminos, (p, q) => p !== q);
  out.push({ id: 'fr-limites', dibujar(ctx, path, proj) {
    // en 1752 (ronda v17, lo que daba «Catastro de Ensenada»), cada límite con su trazo: continuo, discontinuo o punteado
    if ((opciones.dibujo || conEstado(i)) && hayEstados(d.topo)) { dibujaBordes(ctx, proj, d.topo, { color: c.ink, ancho: 0.85, alfa: 0.78 }); return; }
    ctx.save(); ctx.strokeStyle = c.ink; ctx.globalAlpha = opciones.hoy ? 0.85 : 0.62; ctx.lineWidth = opciones.hoy ? 1.05 : 0.7; ctx.lineJoin = 'round';
    ctx.stroke(path2d(d.malla, proj)); ctx.restore();
  } });
  if (opciones.dibujo) out.push({ id: 'fr-aprox', dibujar(ctx, path, proj) {
    ctx.save(); ctx.fillStyle = trama({ linea: c.aprox, paso: 4.5, grosor: 0.8, angulo: 45 });
    for (const f of d.feats) if (f.properties.pg === 'aproximado' && f.properties.pe !== 'sin_municipio_en_la_fecha') ctx.fill(path2d(f, proj));
    ctx.restore();
  } });
  if (opciones.conjuntos && d.interiores) out.push({ id: 'fr-interiores', dibujar(ctx, path, proj) {
    ctx.save(); ctx.setLineDash([1.2, 2.4]); ctx.strokeStyle = c.interior; ctx.lineWidth = 0.6;
    ctx.stroke(path2d(d.interiores, proj)); ctx.restore();
  } });
  if (opciones.cambios && i > 0) out.push({ id: 'fr-cambios', dibujar(ctx, path, proj) {
    ctx.save(); ctx.lineJoin = 'round';
    for (const f of d.feats) if (f.properties.cambia) {
      const p = path2d(f, proj);
      ctx.fillStyle = c.tinte; ctx.fill(p);
      ctx.strokeStyle = c.accent; ctx.lineWidth = 1.7; ctx.stroke(p);
    }
    ctx.restore();
  } });
  // municipios sin contorno: punto; el propuesto por nombre (NGBE), hueco, con su rótulo en la leyenda
  const esNgbe = p => /ngbe|nombre/i.test(String(p.proc || ''));
  const pts = (B.nucleos.get(F[i].clave) || []).filter(p => p.proc === 'contenido_sin_contorno' || esNgbe(p));
  if (opciones.dibujo && pts.length) out.push({ id: 'fr-nucleos', dibujar(ctx, path, proj) {
    ctx.save(); ctx.lineWidth = 1;
    for (const p of pts) {
      const xy = proj([p.lon, p.lat]); if (!xy) continue;
      ctx.beginPath(); ctx.arc(xy[0], xy[1], 2.6, 0, 2 * Math.PI);
      if (esNgbe(p)) { ctx.fillStyle = c.surface; ctx.fill(); ctx.strokeStyle = c.ink; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.fillStyle = c.ink; ctx.fill(); ctx.strokeStyle = c.surface; ctx.lineWidth = 1; ctx.stroke(); }
    }
    ctx.restore();
  } });
  // municipio de hoy con la ficha abierta: su término en este corte (contorno grueso) y su recinto de hoy (punteado)
  if (opciones.municipio && B.hoy.porIne.has(opciones.municipio)) {
    const ine = opciones.municipio;
    out.push({ id: 'fr-municipio', dibujar(ctx, path, proj) {
      const term = d.porPieza.get(ine), pieza = B.hoy.porIne.get(ine);
      ctx.save(); ctx.lineJoin = 'round';
      if (term) { const p = path2d(term, proj); ctx.strokeStyle = c.surface; ctx.lineWidth = 6; ctx.stroke(p); ctx.strokeStyle = c.ink; ctx.lineWidth = 3; ctx.stroke(p); }
      if (pieza) { const p = path2d(pieza, proj); ctx.setLineDash([3, 2.5]); ctx.strokeStyle = c.ink; ctx.lineWidth = 1.4; ctx.stroke(p); }
      ctx.restore();
    } });
  }
  // las fronteras de hoy, encima, en azul y discontinuas, para comparar con las del año: donde coinciden se ve el negro
  // de la fecha entre los trazos azules; donde solo hay azul, el límite es posterior a la fecha
  if (opciones.hoy) {
    if (!HOY && B.hoy && B.hoy.topo && B.hoy.topo.objects.municipios) HOY = { malla: window.topojson.mesh(B.hoy.topo, B.hoy.topo.objects.municipios, (a, b) => a !== b) };
    if (!HOY) { HOY = { cargando: true }; cargarDatos('geo/municipios.topo.json').then(t => { HOY = { malla: window.topojson.mesh(t, t.objects.municipios, (a, b) => a !== b) }; if (window.__repintarFronteras) window.__repintarFronteras(); }).catch(() => { HOY = null; }); }
    else if (HOY.malla) out.push({ id: 'fr-hoy', dibujar(ctx, path, proj) {
      ctx.save(); ctx.strokeStyle = COLOR_HOY; ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      ctx.setLineDash([2.4, 2.2]);   // más fino que el negro: sobre un límite que ya había, se ve el negro; solo, el azul punteado
      ctx.stroke(path2d(HOY.malla, proj)); ctx.restore();
    } });
  }
  const conj = d.feats.filter(f => f.properties.pe === 'termino_conjunto_de_varios' && f.properties.nm > 1);
  if (opciones.conjuntos && conj.length) out.push({ id: 'fr-numeros', dibujar(ctx, path, proj) {
    const gp = window.d3.geoPath(proj);
    const w = ctx.canvas.width / (ctx.getTransform().a || 1);
    const fs = Math.max(7.5, Math.min(10.5, w / 95));
    ctx.save(); ctx.font = `700 ${fs.toFixed(1)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = fs < 9 ? 2.2 : 3; ctx.strokeStyle = c.surface; ctx.fillStyle = c.ink;
    for (const f of conj) {
      const xy = gp.centroid(f); if (!xy.every(Number.isFinite)) continue;
      ctx.strokeText(String(f.properties.nm), xy[0], xy[1]); ctx.fillText(String(f.properties.nm), xy[0], xy[1]);
    }
    ctx.restore();
  } });
  return out;
}

function frases() {
  const out = [];
  const R = F.map(f => f.fila);
  if (opciones.ensenada && R[0] && R[0].entrada != null) out.push({ i: 0, texto: `${entero(R[0].entrada)} pueblos con entrada propia en el Catastro de Ensenada; ${entero(R[0].dibujables)} términos se pueden dibujar y ${entero(R[0].pendientes)} pueblos están pendientes de situar.` });
  // mayor número de términos que cambian de forma entre dos cortes seguidos
  let kMax = -1;
  D.forEach((d, k) => { if (k > 0 && (kMax < 0 || d.nCambian > D[kMax].nCambian)) kMax = k; });
  if (opciones.cambios && kMax > 0 && D[kMax].nCambian) out.push({ i: kMax, texto: `${entero(D[kMax].nCambian)} términos cambian de forma frente a ${F[kMax - 1].etiqueta}: el mayor cambio entre dos cortes seguidos.` });
  // mayor caída del número de municipios (desde 1842, misma fuente)
  let kCae = -1, caida = 0;
  for (let k = 1; k < F.length; k++) {
    const a = R[k - 1], b = R[k];
    if (!a || !b || a.entrada == null || b.entrada == null || PRE1842(F[k - 1].clave)) continue;
    const dlt = b.entrada - a.entrada;
    if (dlt < caida) { caida = dlt; kCae = k; }
  }
  if (kCae > 0) out.push({ i: kCae, texto: `De ${entero(R[kCae - 1].entrada)} a ${entero(R[kCae].entrada)} municipios entre ${F[kCae - 1].etiqueta} y ${F[kCae].etiqueta}: ${entero(-caida)} menos.` });
  const z = F.length - 1;
  if (z > 0 && R[z] && R[z].entrada != null) out.push({ i: z, texto: `${F[z].etiqueta}: ${entero(R[z].entrada)} municipios.` });
  out.sort((a, b) => a.i - b.i);
  out.forEach((x, k) => { x.hasta = Math.min(out[k + 1] ? out[k + 1].i - 1 : F.length - 1, x.i + 1); });
  return out.filter((x, k, arr) => k === 0 || arr[k - 1].i !== x.i);
}

// 1752 (ronda v17, Juan: «En límites no pongas Catastro de Ensenada… ya está de por sí en Fronteras de cada año»): el
// estado de cada límite, con su trazo, y los términos sin ningún pueblo contado, en la leyenda y en el puntero
const conEstado = i => !!(F[i] && F[i].clave === '1752' && D[i] && hayEstados(D[i].topo));
const TRAZO = { exacto: 'línea continua', aprox: 'línea discontinua', supuesto: 'línea punteada' };
const linea = (fondo, grueso, patron) => `${patron} center/100% ${grueso}px no-repeat, ${fondo}`;
const MUESTRA = {   // la muestra de la leyenda: el relleno del término cruzado por el trazo (un fondo CSS)
  exacto: { etiqueta: 'límite exacto (línea continua)', fondo: linea(FONDO_TERMINO, 1.3, 'linear-gradient(#262626,#262626)') },
  aprox: { etiqueta: 'límite aproximado (línea discontinua)', fondo: linea(FONDO_TERMINO, 1.3, 'repeating-linear-gradient(90deg,#262626 0 4px,transparent 4px 7px)') },
  supuesto: { etiqueta: 'límite supuesto (línea punteada): la fuente no da la línea', fondo: linea(FONDO_TERMINO, 1.8, 'repeating-linear-gradient(90deg,#262626 0 1.6px,transparent 1.6px 4.2px)') },
};
// el porqué de la tabla, sin los códigos de fichas internas
const porQueLlano = t => String(t || '').replace(/pendientes de la ficha AND-[A-Z]+-\d+/g, 'pendientes de situar')
  .replace(/\s*\((?:eso es |ficha )?AND-[A-Z]+-\d+\)/g, '').replace(/\s*\(?(?:la )?(?:ficha )?AND-[A-Z]+-\d+\)?/g, '').trim();
const sinPueblo = d => { let n = 0, ha = 0; for (const f of d.feats) { const p = f.properties; if (p.pe === 'sin_municipio_en_la_fecha' || p.nm === 0) { n++; ha += p.ha || 0; } } return { n, ha }; };

// una línea si el límite no es exacto (estado del límite de geo/terminos/<corte>; su motivo largo queda en la ficha)
const LIMITE = {
  aproximado: 'Límite aproximado: un cambio posterior tocó una de sus líneas y se dibuja con la de hoy',
  supuesto: 'Límite supuesto: se dibuja uniendo sus términos de hoy; la fuente no da la línea',
  documentado_en_texto: 'Límite supuesto: la fuente lo describe en texto, sin línea',
  no_cuadra: 'Límite supuesto: la línea de la fuente no cuadra con los términos de hoy',
};

export const proveedorFronteras = {
  id: 'fronteras', tema: 'fronteras', grupo: 'Fronteras',
  rotulo: 'Fronteras: términos de cada año', titulo: 'Pueblos y fronteras', subrotulo: 'Términos de cada año',
  kicker: 'Pueblos y fronteras · 1752 → hoy',
  entradilla: 'Los límites de los términos municipales de cada fecha. Con «Fronteras de hoy» se ven encima, en azul discontinuo, los de hoy, para comparar.',
  periodo: '1591 – hoy', unidad: 'recintos de hoy',
  niveles: ['termino'], nivel_nativo: 'termino', agregacion: 'no',
  fuentes: ['INE-ALT-XLS', 'ENSENADA-1752', 'FLORIDABLANCA-1787', 'IECA-DELIM-20260415'],
  nota: 'Geometría histórica: términos reconstruidos uniendo recintos de hoy, no límites observados; cada línea dice su fiabilidad (exacto, aproximado o supuesto).',
  acento: '#d63a1f',
  get anios() { return F.map(f => f.anio); },
  async cargar() { await cargar(); },
  async activar() { await cargar(); },
  fotogramas: () => F,
  temporal: () => false,
  capaDe(i) {
    const d = D[i]; if (!d) return null;
    return { clave: `termino:${F[i].clave}`, topo: d.topo, objeto: 'terminos', idDe: p => p.u };
  },
  relleno(i) {
    const d = D[i]; const c = COL || colores();
    return id => {
      const f = d && d.porU.get(String(id));
      if (!f) return { nd: true };
      const p = f.properties;
      if (p.pe === 'sin_municipio_en_la_fecha' || p.nm === 0) return { nd: true };
      return { color: opciones.dibujo ? c.seq[clase(p.pz.length)] : FONDO_TERMINO, est: false };
    };
  },
  leyenda(i) {
    const c = COL || colores();
    if (!opciones.dibujo) {
      const notas = [opciones.cambios ? 'En rojo, los términos que no existían con esa forma en el corte anterior.' : '', opciones.conjuntos ? 'Número: municipios de la fecha que comparten un polígono; punteado, sus bordes interiores.' : ''].filter(Boolean);
      if (conEstado(i)) {
        // 1752: el estado de cada límite con su trazo (solo los que trae la geometría) y los términos sin pueblo
        const pres = clasesPresentes(D[i].topo);
        const items = ['exacto', 'aprox', 'supuesto'].filter(k => pres.has(k)).map(k => ({ color: MUESTRA[k].fondo, etiqueta: MUESTRA[k].etiqueta }));
        if (opciones.hoy) items.push({ color: COLOR_HOY, etiqueta: 'límites de hoy (línea azul punteada, encima)' });
        // cuántos y cuánta superficie: los del recuento (conteo.json) si los trae; si no, los de la geometría
        const fila = F[i].fila || {}, g = sinPueblo(D[i]);
        const sp = { n: fila.sinMunicipio != null ? fila.sinMunicipio : g.n, ha: fila.haSinMunicipio != null ? fila.haSinMunicipio : g.ha }, pq = porQueLlano(fila.porQue);
        const motivo = pq.includes(':') ? pq.slice(pq.indexOf(':') + 1).trim() : pq;
        if (sp.n) notas.push(`Gris tramado: ${entero(sp.n)} ${sp.n === 1 ? 'término' : 'términos'}${sp.ha ? ` (${entero(sp.ha)} ha)` : ''} sin ningún pueblo contado en el Catastro de Ensenada${motivo ? `: ${motivo}` : ''}.`);
        notas.push('Términos reconstruidos uniendo términos de hoy: no son el límite observado.');
        return { tipo: 'categorias', titulo: 'Límites de 1752 (Catastro de Ensenada)', items, nota: notas.join(' ') };
      }
      const items = [{ color: FONDO_TERMINO, etiqueta: 'término de la fecha (su límite, línea negra)' }];
      if (opciones.hoy) items.push({ color: COLOR_HOY, etiqueta: 'límites de hoy (línea azul punteada, encima)' });
      notas.push(opciones.hoy ? 'Un límite azul sin negro debajo es posterior a la fecha; uno negro sin azul ya no existe hoy.' : 'Términos reconstruidos uniendo términos de hoy: no son el límite observado.');
      return { tipo: 'categorias', titulo: 'Límites de cada fecha', items, nota: notas.join(' ') };
    }
    return {
      tipo: 'categorias', titulo: 'Recintos de hoy que forman cada término',
      items: CLASES.map((x, k) => ({ color: c.seq[k], etiqueta: x.txt })),
      nota: [opciones.cambios ? 'En rojo, los términos que no existían con esa forma en el corte anterior.' : '', 'Rayado: contorno aproximado. Punto: municipio sin contorno propio; punto hueco: punto propuesto por nombre (NGBE).', opciones.conjuntos ? 'Número: municipios de la fecha que comparten un polígono.' : '', 'Gris tramado: la fuente no cuenta ningún pueblo ahí (en 1752 y 1787, lugares pendientes de situar).'].filter(Boolean).join(' '),
    };
  },
  cifra(i) {
    if (this.id === 'fronteras') return null;   // ronda v15b (Juan): el año, el mapa y «Fronteras de hoy»; sin «municipios de la fecha»
    const r = F[i] && F[i].fila;
    if (!r || r.entrada == null) return null;
    return { valor: entero(r.entrada), unidad: '', etiqueta: PRE1842(F[i].clave) ? 'pueblos con entrada propia' : 'municipios' };
  },
  serieAndalucia() { return this.id === 'fronteras' ? null : F.map((f, i) => ({ i, v: f.fila ? f.fila.entrada : null })); },   // municipios (o pueblos) por corte
  frases: () => frases(),
  // puntero y ficha breve (ronda v15): el nombre del término en la fecha, a qué municipios de hoy corresponde y, si su
  // límite es aproximado o supuesto, una línea que lo dice. Nada más.
  detalle(i, id) {
    const d = D[i]; const f = d && (d.porU.get(String(id)) || (/^\d{5}$/.test(String(id)) ? d.porPieza.get(String(id)) : null));   // un municipio de hoy: el término que lo contiene
    if (!f) return { titulo: String(id), nd: true };
    const p = f.properties, fr = F[i];
    const nombre = etiquetaFecha(p);
    if (!nombre) {
      const pq = conEstado(i) ? porQueLlano(fr.fila && fr.fila.porQue) : '';
      const motivo = pq.includes(':') ? pq.slice(pq.indexOf(':') + 1).trim() : pq;
      return { titulo: `Sin pueblo contado en ${fr.etiqueta}`, valor: '', nd: true, sinClase: true, lineas: [`La fuente de ${fr.etiqueta} no cuenta ningún pueblo en este término${motivo ? `: ${motivo}` : ''}.`] };
    }
    const hoy = p.pz.map(z => B.hoy.porIne.get(String(z))).filter(Boolean).map(x => x.properties.n);
    const lineas = [];
    if (hoy.length === 1) lineas.push(hoy[0] === nombre ? 'Hoy, el mismo municipio' : `Hoy: ${hoy[0]}`);
    else if (hoy.length > 1) lineas.push(`Hoy son ${entero(hoy.length)} municipios: ${hoy.length > 6 ? `${hoy.slice(0, 5).join(', ')} y ${entero(hoy.length - 5)} más` : `${hoy.slice(0, -1).join(', ')} y ${hoy[hoy.length - 1]}`}`);
    const lim = LIMITE[estadoDe(p)] || (p.pg === 'aproximado' ? LIMITE.aproximado : '');
    // en 1752 se dice también el trazo con que se dibuja (y el exacto, si lo hubiera)
    const k = conEstado(i) ? claseDe(estadoDe(p)) : null;
    if (k && lim) lineas.push(lim.replace(/^Límite (\S+):/, `Límite $1 (${TRAZO[k]}):`));
    else if (k === 'exacto') lineas.push('Límite exacto (línea continua): unión de términos de hoy');
    else if (lim) lineas.push(lim);
    return { titulo: nombre, sub: `Término en ${fr.etiqueta === 'Hoy' ? 'la actualidad' : fr.etiqueta}`, valor: '', sinClase: true, est: false, lineas };
  },
  _capas: (i) => capas(i),
  panelVisible: () => !!opciones.ensenada,   // se dibujan con mapa.capa (js/visor3/fronteras/index.js), no con capas(i) del §4
  hayEstimado: () => false,
  textoEstimado: '',
  ritmo: (i) => (F[i] && (F[i].clave === '1752' || F[i].clave === '1842') ? 2600 : 1600),
  claveReservas: null,
  // para el panel y la ficha
  _datos: () => ({ B, D, F }),
  _esc: esc,
};

export function rehacerColores() { colores(); }
