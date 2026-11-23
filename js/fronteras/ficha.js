/* fronteras · el término de un municipio de hoy y sus cambios (ronda v15, «Fronteras no lo pillo»).
   Un mapa por cada cambio de su término (segregaciones, agregaciones, fusiones, traspasos), con su año, qué pasó y la
   fuente tal como viene en historia.json (`rel`: c cita literal, l localizador, s fuente). Si su término no cambia, un
   solo mapa y la frase que lo dice. Solo con los campos de historia.json y de geo/terminos/<corte>: nada a mano.
   Lo usan la ficha breve (js/visor3/ficha/index.js → abrirFicha) y la ficha grande (js/visor4/municipio.js).
   Las relaciones en revisión (rev, antes de 1842) no cuentan; los cambios de nombre no son cambios de término. */

import { esc, entero } from '../atlas2/fmt.js';
import { etiquetaFecha, municipiosFecha } from './datos.js';
import { tituloFuente } from '../atlas2/fuentes.js';

const PRE1842 = c => c !== 'hoy' && +c < 1842;   // 1591, 1752 y 1787
const PROV = { '04': 'Almería', '11': 'Cádiz', '14': 'Córdoba', '18': 'Granada', '21': 'Huelva', '23': 'Jaén', '29': 'Málaga', '41': 'Sevilla' };
const ordC = c => (c === 'hoy' ? 9999 : +c);
const ICO_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L12 13.4l-6.3 6.3-1.4-1.4L10.6 12 4.3 5.7l1.4-1.4L12 10.6l6.3-6.3z"/></svg>';
let ctxActual = null;
let oyente = null;
let nMapa = 0;   // ids únicos de las tramas (la ficha breve y la grande pueden estar a la vez)

/* ---------- qué es un cambio de término y cómo se dice (lo usa también js/visor3/fronteras/extra.js) ---------- */
// rol (historia.json): o = este municipio es el origen; d = el destino. Comprobado con las citas del INE:
// segregación o «disminuye el término porque independiza a X», d «aparece porque se segrega de X»;
// incorporación d «crece porque incorpora a X», o «desaparece porque se integra en X»; fusión d «aparece porque se
// fusionan X…»; división d «aparece porque se segrega de X» (X «se integra por partes»); traspaso o «transfiere…», d «recibe…».
export const TIPOS_TERMINO = new Set(['segregacion', 'division', 'incorporacion', 'fusion', 'transferencia_parcial', 'segregacion_temporal', 'restitucion', 'nueva_fundacion']);
export const relacionesDeTermino = h => (h && h.relaciones ? h.relaciones : []).filter(r => TIPOS_TERMINO.has(r.tipo) && !r.revision);
export const anio4 = v => { const m = /\d{4}/.exec(String(v ?? '')); return m ? +m[0] : null; };
export const finDe = r => anio4(r.hasta) ?? anio4(r.fecha) ?? anio4(r.desde);

// nace: se segrega o nace de una división · pierde: se le segrega una parte · agrega: se agrega, se le agrega otro o se
// fusiona · otro: traspasos de parte del término, segregaciones temporales, restituciones
export function claseCambio(r) {
  if (r.tipo === 'segregacion' || r.tipo === 'division') return r.rol === 'o' ? 'pierde' : 'nace';
  if (r.tipo === 'incorporacion' || r.tipo === 'fusion') return 'agrega';
  return 'otro';
}

const yLista = xs => (xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
export const nombreOtra = r => r.otra.nombre || (r.otra.ine ? `la entidad ${r.otra.ine}` : 'otra entidad');

/* Frase corta: tipo + rol + nombre(s) de la otra entidad. `nombres` puede traer HTML ya escapado. */
export function fraseCambio(tipo, rol, nombres) {
  const L = yLista(nombres), n = nombres.length > 1 ? 'n' : '', o = rol === 'o';
  switch (tipo) {
    case 'segregacion': return o ? `Se le segrega${n} ${L}` : `Se segrega de ${L}`;
    case 'division': return o ? `Se divide; de su término nace${n} ${L}` : `Nace de la división de ${L}`;
    case 'incorporacion': return o ? `Se agrega a ${L}` : `Se le agrega${n} ${L}`;
    case 'fusion': return o ? `Se fusiona en ${L}` : `Nace de la fusión de ${L}`;
    case 'transferencia_parcial': return o ? `Pasa una parte de su término a ${L}` : `Recibe una parte del término de ${L}`;
    case 'segregacion_temporal': return o ? `Se le segrega${n} por un tiempo ${L}` : `Se segrega por un tiempo de ${L}`;
    case 'restitucion': return o ? `${L} se toma como el mismo municipio que este` : `Se toma como el mismo municipio que el antiguo ${L}`;
    case 'nueva_fundacion': return o ? `En su término se funda${n} ${L}` : `Se funda en el término de ${L}`;
    default: return `${String(tipo || 'cambio').replace(/_/g, ' ')} con ${L}`;
  }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaLlana(f) {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(String(f || '').trim());
  if (!m) return String(f || '');
  if (m[3] && MESES[+m[2] - 1]) return `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}`;
  if (m[2] && MESES[+m[2] - 1]) return `${MESES[+m[2] - 1]} de ${m[1]}`;
  return m[1];
}
/* Cuándo, en llano: la fecha de efecto si la hay; si no, el intervalo de censos. */
export function cuandoCambio(r) {
  if (r.fecha) return fechaLlana(r.fecha);
  if (r.desde != null && r.hasta != null) return `entre el censo de ${r.desde} y el de ${r.hasta}`;
  return 'sin fecha en la tabla';
}
/* Corte (con geometría, desde 1842) que ya recoge el cambio: el primero igual o posterior a su fin. */
export function corteTras(fin, cortes) {
  const c = cortes.filter(x => x !== 'hoy' && !PRE1842(x)).find(x => +x >= fin);
  return c != null ? c : (cortes.includes('hoy') ? 'hoy' : null);
}
// una decisión interna de la base no se enseña como cita (ni su nombre ni su código): se dice qué es
const esDecision = r => /^Decisi[oó]n de /.test(String(r.cita || ''));
export const fuentesCorto = r => (esDecision(r) ? ['decisión firmada del responsable de la base'] : r.fuentes.map(id => tituloFuente(id)));
// el localizador, sin nombres técnicos de fuente (los ids con guiones bajos se cambian por el título)
// la norma de un cambio, en una línea: «Decreto 123/1997, de 22-4-1997 · BOJA n.º 56, 15-5-1997, p. 5.908 ↗», con su
// enlace (pestaña nueva) y el sumario literal plegado. Lo que no viene no se pone; sin nada que decir, no sale.
const fechaDMA = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '').trim()); return m ? `${+m[3]}-${+m[2]}-${m[1]}` : String(v ?? '').trim(); };
const isoEnTexto = t => String(t).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (x, y, mo, d) => `${+d}-${+mo}-${y}`);
const miles = t => String(t).replace(/\d{4,}/g, d => d.replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
const hay = v => v != null && String(v).trim() !== '';
export function normaHTML(n) {
  if (!n || typeof n !== 'object') return '';
  const tipo = hay(n.tipo) ? String(n.tipo).trim() : '', num = hay(n.num) ? isoEnTexto(String(n.num).trim()) : '';
  // «Real» + «real decreto de 1924-08-17»: el número ya trae el tipo; no se repite
  let nombre = num && tipo && num.toLowerCase().startsWith(tipo.toLowerCase()) ? num : [tipo, num].filter(Boolean).join(' ');
  nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  const parte1 = [nombre, hay(n.fecha) ? `de ${fechaDMA(n.fecha)}` : ''].filter(Boolean).join(', ');
  const pag = hay(n.pag) ? miles(String(n.pag).trim()) : '';
  const parte2 = [[hay(n.boletin) ? String(n.boletin).trim() : '', hay(n.bnum) ? `n.º ${String(n.bnum).trim()}` : ''].filter(Boolean).join(' '),
    hay(n.bfecha) ? fechaDMA(n.bfecha) : '', pag ? `${/[-–]/.test(pag) ? 'pp.' : 'p.'} ${pag}` : ''].filter(Boolean).join(', ');
  const txt = [parte1, parte2].filter(Boolean).join(' · ');
  if (!txt) return '';
  const url = /^https?:\/\//i.test(String(n.url || '').trim()) ? String(n.url).trim() : '';
  return `<div class="frc-norma">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)} ↗</a>` : `<span>${esc(txt)}</span>`}${hay(n.sumario) ? `<details class="frc-sumario"><summary>Sumario</summary><p>${esc(String(n.sumario).trim())}</p></details>` : ''}</div>`;
}
const locLlano = (l, r) => String(l || '').replace(/\b[a-z]+(?:_[a-z0-9]+){2,}\b/g, id => tituloFuente(id)).replace(/\s*\|\|\s*/g, ' · ').trim();

/* ---------- los momentos en que cambia el término de un municipio de hoy ---------- */
// cada momento: el corte que ya recoge el cambio (despues), el de antes y sus relaciones
function momentosDe(rels, cortes) {
  const validos = cortes.filter(c => !PRE1842(c));
  const por = new Map();
  for (const r of rels) {
    const fin = finDe(r); if (fin == null) continue;
    const despues = corteTras(fin, cortes); if (!despues) continue;
    const k = validos.indexOf(despues);
    const antesR = r.desde != null && validos.includes(String(r.desde)) && ordC(String(r.desde)) < ordC(despues) ? String(r.desde) : (k > 0 ? validos[k - 1] : null);
    if (!por.has(despues)) por.set(despues, { despues, antes: antesR, rels: [] });
    const m = por.get(despues);
    if (antesR && (!m.antes || ordC(antesR) < ordC(m.antes))) m.antes = antesR;
    m.rels.push(r);
  }
  return [...por.values()].sort((a, b) => ordC(a.despues) - ordC(b.despues));
}

// pinta en `el` los mapas de los cambios del término. ctx: { ine, hoy, cortes, cargarCorte(c), historia (de ese ine),
// seleccionar(ine)?, irACorte(c)? }. Devuelve los ids de fuente usados.
export async function pintarCambiosTermino(el, ctx) {
  const yo = ctx.hoy.porIne.get(String(ctx.ine));
  if (!yo) { el.innerHTML = '<p class="a2-small">No hay ningún municipio de hoy con ese código.</p>'; return []; }
  const nombre = yo.properties.n;
  const rels = relacionesDeTermino(ctx.historia);
  const enRevision = (ctx.historia && ctx.historia.relaciones || []).some(r => r.revision && TIPOS_TERMINO.has(r.tipo));
  const momentos = momentosDe(rels, ctx.cortes);
  // términos que hacen falta (los de los momentos; y todos desde 1842 para decir si cambia la geometría)
  const datos = new Map();
  const lee = async c => { if (!datos.has(c)) datos.set(c, await Promise.resolve(ctx.cargarCorte(c)).catch(() => null)); return datos.get(c); };
  for (const c of ctx.cortes) await lee(c);
  const termEn = c => { const d = datos.get(c); return d ? d.porPieza.get(String(ctx.ine)) || null : null; };
  const llave = t => (t ? t.properties.key : null);
  const desde1842 = ctx.cortes.filter(c => !PRE1842(c) && datos.get(c));
  const cambiaGeo = desde1842.some((c, k) => k > 0 && llave(termEn(c)) !== llave(termEn(desde1842[k - 1])));
  const piezas = x => ctx.hoy.porIne.get(String(x));
  const W = 200, H = 150;
  const otraHTML = r => {
    const n = esc(nombreOtra(r));
    return r.otra.ine && r.otra.ine !== String(ctx.ine) && ctx.hoy.porIne.has(r.otra.ine) && ctx.seleccionar ? `<a href="#" data-ine="${esc(r.otra.ine)}">${n}</a>` : n;
  };
  const usadas = new Set();

  // sin cambios: un solo mapa y la frase
  if (!momentos.length && !cambiaGeo) {
    const t = termEn('hoy') || termEn(desde1842[desde1842.length - 1]) || yo;
    const fc = { type: 'FeatureCollection', features: [t, yo] };
    const proj = window.d3.geoMercator().fitExtent([[8, 8], [W - 8, H - 8]], fc), gp = window.d3.geoPath(proj);
    const pre = ctx.cortes.filter(c => PRE1842(c) && datos.get(c)).map(c => ({ c, t: termEn(c) }));
    // antes de 1842 (1591, 1752, 1787: en revisión), lo que dicen los mapas de esas fechas, en una línea
    const preL = pre.filter(x => x.t).map(x => {
      const nom = etiquetaFecha(x.t.properties);
      if (!nom) return `en ${x.c}, la fuente no cuenta ningún pueblo en su suelo`;
      if (llave(x.t) === llave(t)) return `en ${x.c}, el mismo término`;
      const n = x.t.properties.pz.length;
      return `en ${x.c}, su suelo está en el término de «${esc(nom)}», que hoy ${n === 1 ? 'es un municipio' : `son ${entero(n)} municipios`}`;
    });
    const preTxt = preL.length ? `Antes de 1842 (fechas en revisión, límites supuestos): ${preL.join('; ')}.` : '';
    el.innerHTML = `<div class="frc frc--uno">
      <figure class="frc-m">${mapaSVG({ despues: t, hoy: yo, piezas, gp, W, H, titulo: `Término de ${nombre}` })}</figure>
      <div class="frc-txt">
        <p class="frc-frase">Su término no cambia desde 1842: es el mismo en todos los mapas desde esa fecha, y el INE no registra segregaciones ni agregaciones para ${esc(nombre)}.</p>
        ${preTxt ? `<p class="frc-nota">${preTxt}</p>` : ''}
        ${enRevision ? '<p class="frc-nota">Hay propuestas de cambios anteriores a 1842, en revisión: no se cuentan.</p>' : ''}
        <p class="frc-nota">Fuente: ${esc(tituloFuente('INE-ALT-XLS'))}; mapa reconstruido uniendo términos de hoy.</p>
      </div></div>`;
    usadas.add('INE-ALT-XLS');
    enlazar(el, ctx);
    return [...usadas];
  }

  // momentos: los de sus relaciones; si no hubiera ninguna pero cambia la geometría, los cortes en que cambia
  const lista = momentos.length ? momentos : desde1842.filter((c, k) => k > 0 && llave(termEn(c)) !== llave(termEn(desde1842[k - 1])))
    .map(c => ({ despues: c, antes: desde1842[desde1842.indexOf(c) - 1], rels: [] }));
  const feats = [yo];
  for (const m of lista) { const a = m.antes && termEn(m.antes), d = termEn(m.despues); if (a) feats.push(a); if (d) feats.push(d); }
  const proj = window.d3.geoMercator().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features: feats });
  const gp = window.d3.geoPath(proj);

  let hayGana = false, haySale = false;
  const tarjetas = lista.map(m => {
    const antes = m.antes ? termEn(m.antes) : null, despues = termEn(m.despues);
    const mismo = antes && despues && llave(antes) === llave(despues);
    const pzA = antes ? antes.properties.pz : [], pzD = despues ? despues.properties.pz : [];
    // término conjunto (varios municipios de la fecha en un polígono): se dice, porque el mapa no puede separarlos
    const ms = despues && despues.properties.nm > 1 ? municipiosFecha(despues.properties).map(x => x.nombre) : [];
    const conjunto = ms.length > 1 ? (ms.length > 4 ? `${ms.slice(0, 3).join(', ')} y ${ms.length - 3} más` : yLista(ms)) : '';
    if (antes && pzD.some(x => !pzA.includes(x))) hayGana = true;
    if (pzA.some(x => !pzD.includes(x))) haySale = true;
    // cuándo: el año de efecto si todas lo traen y es el mismo; si no, el intervalo de censos
    const fs = [...new Set(m.rels.map(r => anio4(r.fecha)))];
    const ds = m.rels.map(r => anio4(r.desde)).filter(x => x != null), hs = m.rels.map(r => anio4(r.hasta)).filter(x => x != null);
    const d0 = ds.length ? Math.min(...ds) : (m.antes ? m.antes : null), h0 = hs.length ? Math.max(...hs) : m.despues;
    const titulo = fs.length === 1 && fs[0] != null ? String(fs[0]) : (d0 != null ? `${d0}–${h0}` : String(h0));
    const entre = d0 != null && h0 != null && h0 !== 'hoy' ? `entre el censo de ${d0} y el de ${h0}` : '';
    // qué pasó: una línea por tipo, rol y fecha (los nombres juntos)
    const grupos = new Map();
    for (const r of m.rels) { const k = `${r.tipo}|${r.rol}|${r.fecha || ''}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); }
    const que = [...grupos.values()].map(rs => {
      const r = rs[0];
      // debajo de lo que pasó, la norma de cada relación (una vez cada una)
      const normas = [...new Set(rs.map(x => normaHTML(x.norma)).filter(Boolean))].join('');
      return `<li class="frc-que frc-que--${claseCambio(r)}">${fraseCambio(r.tipo, r.rol, rs.map(otraHTML))}${r.fecha ? ` <span class="frc-f">(${esc(fechaLlana(r.fecha))})</span>` : ''}${normas}</li>`;
    }).join('') || `<li class="frc-que frc-que--otro">Cambia el término en el que está su suelo</li>`;
    // la fuente: nombre, cita literal y localizador, tal como vienen
    const fuentes = [...new Set(m.rels.flatMap(fuentesCorto))];
    m.rels.forEach(r => { if (!esDecision(r)) r.fuentes.forEach(id => usadas.add(id)); });
    const citas = m.rels.map(r => {
      if (esDecision(r)) return `<div class="frc-cita"><p>Aceptado por decisión firmada del responsable de la base${/ninguna frase del INE lo dice/i.test(r.cita) ? '; ninguna frase del INE lo dice' : ''}.</p></div>`;
      const cs = String(r.cita || '').split(/\s*\|\|\s*/).filter(Boolean);
      return `<div class="frc-cita">${cs.length ? cs.map(c => `<blockquote>«${esc(c)}»</blockquote>`).join('') : '<p>Sin cita literal en la tabla.</p>'}
        ${r.localizador ? `<p class="frc-loc">${esc(locLlano(r.localizador, r))}</p>` : ''}</div>`;
    }).join('');
    const fig = mapaSVG({ antes, despues, hoy: yo, piezas, gp, W, H, titulo: `Término de ${nombre} tras el cambio de ${titulo}` });
    return `<figure class="frc-m" data-c="${esc(m.despues)}">
      ${ctx.irACorte ? `<button type="button" class="frc-ir" data-c="${esc(m.despues)}" title="Ver ${esc(m.despues === 'hoy' ? 'hoy' : m.despues)} en el mapa">${fig}</button>` : fig}
      <figcaption>
        <p class="frc-cuando"><b>${esc(titulo)}</b>${entre ? `<span>${esc(entre)}</span>` : ''}</p>
        <ul class="frc-ques">${que}</ul>
        ${mismo ? '<p class="frc-nota">El mapa no cambia: se hace uniendo términos de hoy enteros y no puede separar este cambio.</p>' : ''}
        ${conjunto ? `<p class="frc-nota">En ${esc(m.despues)}, el mapa dibuja en un solo polígono a ${esc(conjunto)}: la geometría no los separa.</p>` : ''}
        ${m.rels.length ? `<details class="frc-fuente"><summary>Fuente: ${esc(fuentes.join('; ') || 'sin identificar')} · ver la cita</summary>${citas}</details>` : ''}
      </figcaption></figure>`;
  }).join('');
  el.innerHTML = `<div class="frc">${tarjetas}</div>
    <p class="frc-ley"><span><i class="frc-sw frc-sw--term"></i> su término tras el cambio</span>${hayGana ? '<span><i class="frc-sw frc-sw--gana"></i> lo que gana</span>' : ''}
      ${haySale ? '<span><i class="frc-sw frc-sw--sale"></i> lo que estaba en su término antes y sale</span>' : ''}<span><i class="frc-sw frc-sw--hoy"></i> ${esc(nombre)} hoy</span></p>
    <p class="frc-nota">Cambios desde 1842; la fuente de cada uno va en su mapa. Los mapas se reconstruyen uniendo términos de hoy: no son el límite observado.${enRevision ? ' Las propuestas anteriores a 1842 están en revisión y no se cuentan.' : ''}</p>`;
  enlazar(el, ctx);
  return [...usadas];
}

function mapaSVG({ antes = null, despues, hoy, piezas, gp, W, H, titulo }) {
  const id = `frc-trama-${++nMapa}`;
  const pzA = antes ? antes.properties.pz : [], pzD = despues ? despues.properties.pz : [];
  const gana = antes ? pzD.filter(x => !pzA.includes(x)) : [];
  const sale = pzA.filter(x => !pzD.includes(x));
  const p = (f, cls, extra = '') => { const d = f && gp(f); return d ? `<path d="${d}" class="${cls}"${extra}/>` : ''; };
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(titulo)}">
    <defs><pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="frc-trama"/></pattern></defs>
    ${sale.map(x => p(piezas(x), 'frc-sale', ` fill="url(#${id})"`)).join('')}
    ${p(despues, 'frc-term')}
    ${gana.map(x => p(piezas(x), 'frc-gana')).join('')}
    ${p(hoy, 'frc-hoy')}</svg>`;
}

function enlazar(el, ctx) {
  el.querySelectorAll('a[data-ine]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); if (ctx.seleccionar) ctx.seleccionar(a.dataset.ine); }));
  if (ctx.irACorte) el.querySelectorAll('.frc-ir').forEach(b => b.addEventListener('click', () => ctx.irACorte(b.dataset.c)));
}

/* ---------- ficha breve de un municipio de hoy (js/visor3/ficha/index.js) ---------- */
export function soltarFicha() {
  ctxActual = null;
  if (oyente) { document.removeEventListener('fr:corte', oyente); oyente = null; }
}

export function cerrarFicha(el) {
  soltarFicha();
  el.innerHTML = `<div class="fr-ficha__vacia"><h2 class="fr-ficha__h">Pincha un término</h2>
    <p>O busca un municipio de hoy. Verás su término en un mapa por cada cambio (segregaciones y agregaciones), con la cita del INE.</p></div>`;
}

function cabecera(ctx, f) {
  return `<div class="fr-ficha__top">
      <div><p class="a2-kicker" style="margin:0 0 4px">Su término</p>
      <h2 class="fr-ficha__name">${esc(f.properties.n)}</h2>
      <p class="fr-ficha__meta">INE ${esc(ctx.ine)} · ${esc(PROV[f.properties.p] || '')}${f.properties.ha ? ` · ${entero(f.properties.ha)} ha hoy` : ''}</p></div>
      <button class="a2-btn a2-btn--icon fr-ficha__close" type="button" aria-label="Cerrar la ficha">${ICO_X}</button></div>`;
}

/* ctx: { ine, hoy, cortes, corteActual(), historia, cargarCorte(c), irACorte(c), seleccionar(c), cerrar(),
   conCabecera = true, acciones = null (HTML que sustituye a los botones del pie), alAcciones(el) = null } */
export async function abrirFicha(el, ctx) {
  ctxActual = ctx;
  const f = ctx.hoy.porIne.get(ctx.ine);
  const conCab = ctx.conCabecera !== false;
  el.innerHTML = `${conCab ? cabecera(ctx, f) : ''}<div class="frc-caja"><p class="a2-loading">Dibujando su término…</p></div>
    <div class="fr-acciones">${ctx.acciones != null ? ctx.acciones : `
      <a class="a2-btn a2-btn--primary" href="visor.html?cat=poblacion&m=${esc(ctx.ine)}">Ver su población</a>`}</div>`;
  const cb = el.querySelector('.fr-ficha__close');
  if (cb) cb.addEventListener('click', () => ctx.cerrar());
  if (ctx.alAcciones) ctx.alAcciones(el);
  el.__ctxFicha = ctx;
  try { await pintarCambiosTermino(el.querySelector('.frc-caja'), ctx); }
  catch (e) { const c = el.querySelector('.frc-caja'); if (c) c.innerHTML = '<p class="a2-small">No se pudo dibujar su término.</p>'; return; }
  if (el.__ctxFicha !== ctx) return;
  if (ctx.corteActual) marcarCorte(el, ctx.corteActual());
  if (oyente) document.removeEventListener('fr:corte', oyente);
  oyente = ev => marcarCorte(el, ev.detail.corte);
  document.addEventListener('fr:corte', oyente);
}

// el mapa del cambio vigente en el corte del mapa grande, marcado
function marcarCorte(el, corte) {
  let cur = null;
  el.querySelectorAll('.frc-m[data-c]').forEach(b => { if (ordC(b.dataset.c) <= ordC(corte)) cur = b; b.removeAttribute('aria-current'); });
  if (cur) cur.setAttribute('aria-current', 'true');
}
void ctxActual;
