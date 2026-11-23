// municipio.js — «Ficha del municipio»: vista propia y amplia de un municipio de hoy (RONDA_V5.md), encima del centro,
// con «Volver al mapa». Reúne lo que ya hay en los datos: su población y demás series por municipio actual, su término
// (un mapa por cada cambio, con su año, qué pasó y la cita de la fuente; o un solo mapa si no cambia:
// js/fronteras/ficha.js, ronda v15), sus cifras de 1752, su geografía y sus fuentes. Nada se escribe a mano.
// Se abre con ?mun=<INE>.

import { estado, setEstado, on } from '../visor3/estado.js';
import * as datos from '../visor3/datos.js';
import { base } from '../visor3/fronteras/base.js';
import { miniSerie } from '../visor3/ficha/serie.js';
import { nombreFuente, fuente } from '../atlas2/fuentes.js';
import { esc, entero, decimal } from '../atlas2/fmt.js';
import { pintarCambiosTermino } from '../fronteras/ficha.js';
import { arbol } from './catalogo.js';
import { botonAnalisis } from '../municipio-analisis/boton.js';

const PROV = { '04': 'Almería', '11': 'Cádiz', '14': 'Córdoba', '18': 'Granada', '21': 'Huelva', '23': 'Jaén', '29': 'Málaga', '41': 'Sevilla' };
const MARCA = { 0: 'observado', 3: 'calculado de originales', 1: 'estimado', 4: 'parcialmente estimado', 5: 'suma parcial', 2: 'con reserva o en revisión' };
let el = null, token = 0, ctxFicha = null, volverA = null;

export function montarMunicipio(contenedor, ctx) {
  el = contenedor; ctxFicha = ctx;
  on('cambio', ({ claves }) => {
    if (claves.has('mun')) pinta();
    // ir a un indicador o a otra vista desde la ficha («Ver su población», «Ver sus términos») la cierra
    else if ((claves.has('ind') || claves.has('vista')) && estado.mun) setEstado({ mun: '' });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && estado.mun && !e.target.closest('input')) { e.stopImmediatePropagation(); setEstado({ mun: '' }); } }, true);
  if (estado.mun) pinta();
}

const fmt = (v, u) => (v == null ? '—' : `${Math.abs(v) >= 100 ? entero(v) : decimal(v)}${u ? ' ' + u : ''}`);

async function pinta() {
  const ine = String(estado.mun || '');
  const mi = ++token;
  if (!/^\d{5}$/.test(ine)) {
    if (!el.hidden) { el.hidden = true; document.body.classList.remove('v4-con-mun'); if (volverA && volverA.focus) volverA.focus(); }
    return;
  }
  if (el.hidden) volverA = document.activeElement;
  el.hidden = false; document.body.classList.add('v4-con-mun');
  el.innerHTML = '<p class="mu-cargando">Leyendo la ficha…</p>';
  const B = await base().catch(() => null);
  if (mi !== token) return;
  const f = B && B.hoy.porIne.get(ine);
  if (!f) { el.innerHTML = `<header class="mu-cab"><button type="button" class="mu-volver">← Volver al mapa</button></header><p class="mu-cargando">No hay ningún municipio de hoy con el código ${esc(ine)}.</p>`; enlazaVolver(); return; }
  const p = f.properties;
  el.innerHTML = `
    <header class="mu-cab">
      <button type="button" class="mu-volver" title="Cerrar la ficha (Esc)">Cerrar ✕</button>
      <div class="mu-tit"><p class="v4-k">Ficha del municipio</p><h1 class="mu-nombre" tabindex="-1">${esc(p.n)}</h1>
        <p class="mu-meta">INE ${esc(ine)} · provincia de ${esc(PROV[String(p.p)] || '')}${p.ha ? ` · ${entero(p.ha)} ha hoy` : ''}</p></div>
      ${botonAnalisis(ine)}
    </header>
    <div class="mu-cuerpo">
      <section class="mu-sec mu-pob"><h2 class="mu-h">Su población</h2><div class="mu-pob__serie"><p class="mu-cargando">Leyendo…</p></div></section>
      <section class="mu-sec"><h2 class="mu-h">Su término</h2><div class="mu-termino"><p class="mu-cargando">Dibujando su término…</p></div></section>
      <section class="mu-sec"><h2 class="mu-h">Sus otras series</h2><div class="mu-series"><p class="mu-cargando">Leyendo…</p></div></section>
      <section class="mu-sec mu-dos"><div><h2 class="mu-h">En 1752</h2><div class="mu-1752"></div></div><div><h2 class="mu-h">Su geografía</h2><div class="mu-geo"></div></div></section>
      <section class="mu-sec"><h2 class="mu-h">Fuentes</h2><ul class="mu-fuentes"></ul></section>
    </div>`;
  enlazaVolver();
  el.querySelector('.mu-nombre').focus({ preventScroll: true });
  const usadas = new Set(['INE-ALT-XLS']);
  // series y término en paralelo; cada parte se pinta cuando llega
  await Promise.all([
    series(ine, mi, usadas),
    termino(ine, B, mi, usadas),
  ]);
  if (mi !== token) return;
  // fuentes con su enlace (solo los que vienen en fuentes.json)
  el.querySelector('.mu-fuentes').innerHTML = [...usadas].map(id => {
    const fu = fuente(id) || {};
    const en = fu.url ? `<a href="${esc(fu.url)}" target="_blank" rel="noopener">${esc((() => { try { return new URL(fu.url).hostname.replace(/^www\./, ''); } catch (e) { return 'enlace'; } })())} ↗</a>` : fu.doi ? `<a href="https://doi.org/${esc(String(fu.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, ''))}" target="_blank" rel="noopener">DOI ↗</a>` : '';
    return `<li${fu.titulo && fu.titulo !== fu.original ? ` title="${esc(fu.titulo)}"` : ''}>${esc(nombreFuente(id))}${en ? ` · ${en}` : ''}</li>`;
  }).join('');
}
function enlazaVolver() { const b = el.querySelector('.mu-volver'); if (b) b.addEventListener('click', () => setEstado({ mun: '' })); }

// cada serie con la marca de su última cifra, el recuento de marcas, el método o aviso y la reserva con su texto
const MARCA_C = { 0: ['de fuente', 'obs'], 3: ['calculada', 'calc'], 1: ['estimada', 'est'], 4: ['parcialmente estimada', 'est'], 5: ['suma parcial', 'parc'], 2: ['en revisión', 'res'] };
function figuraSerie(x) {
  const con = x.pts.filter(q => q.v != null), u = [...con].reverse()[0];
  const cuenta = {}; for (const q of con) { const m = (MARCA_C[q.f] || [])[0]; if (m) cuenta[m] = (cuenta[m] || 0) + 1; }
  const mu = MARCA_C[u.f];
  const reservas = [...new Set(con.map(q => q.reserva && (q.reserva.rotulo || q.reserva.texto)).filter(Boolean))];
  const extra = [u.metodo ? u.metodo.charAt(0).toUpperCase() + u.metodo.slice(1) : '', u.aviso ? u.aviso.charAt(0).toUpperCase() + u.aviso.slice(1) : ''].filter(Boolean);
  return `<figure class="mu-fig"><figcaption><b>${esc(x.c.rotulo)}</b>
    <span>${esc(fmt(u.v, x.e.unidad))} en ${esc(String(u.anio))}${mu ? ` <i class="mu-marca mu-marca--${mu[1]}">${esc(mu[0])}</i>` : ''}</span>
    <span class="mu-cuenta">${Object.entries(cuenta).map(([k, n]) => `${n} ${esc(k)}`).join(' · ')}</span>
    ${extra.map(t => `<span class="mu-ext">${esc(t)}</span>`).join('')}</figcaption>
    ${miniSerie(x.pts, { ancho: 300, alto: 74, formato: v => (Math.abs(v) >= 100 ? entero(v) : decimal(v)), sinUnir: x.e.anios_sin_unir, tramos: x.e.sin_interpolar_tramos })}
    ${reservas.map(r => `<p class="mu-res">${esc(r)}</p>`).join('')}</figure>`;
}

// ---------------------------------------------------------------- series del municipio actual
async function serieDe(id, ine) {
  const d = await datos.valores(id, 'municipio').catch(() => null);
  if (!d || !d.ids) return null;
  const j = d.ids.map(String).indexOf(ine);
  if (j < 0) return null;
  // reserva de cada año (res = [[iy, iid, j]] → reservas[j]) y método o aviso de la celda (empleo, elecciones…)
  const resDe = new Map(); for (const [iy, i, jj] of d.res || []) if (i === j) resDe.set(iy, (d.reservas || [])[jj] || null);
  const pts = d.anios.map((a, k) => {
    const fc = ((d.f || [])[k] || '')[j];
    let x = {}; try { x = datos.extrasCelda(d, k, j, d.ids.length, d, ine, String(a)) || {}; } catch (e) { x = {}; }
    return { anio: a, v: d.v[k][j], est: fc === '1' || fc === '4', res: fc === '2', f: fc, reserva: resDe.get(k) || null, metodo: x.metodo || null, aviso: x.aviso || null };
  });
  return pts.some(x => x.v != null) ? pts : null;
}
async function series(ine, mi, usadas) {
  const A = arbol();
  const cat = datos.catalogoSinc();
  const ent = id => cat.find(x => x.id === id);
  // población: la serie grande
  const pob = ent('poblacion_hab');
  const caja = el.querySelector('.mu-pob__serie');
  const sp = pob ? await serieDe('poblacion_hab', ine) : null;
  if (mi !== token) return;
  if (sp) {
    (pob.fuentes || []).forEach(x => usadas.add(x));
    const ult = [...sp].reverse().find(x => x.v != null);
    // 1591 (estimado): además, los vecinos que da la fuente, si el fichero de vecinos los trae para este municipio
    const p1591 = sp.find(x => +x.anio === 1591 && x.v != null);
    let vec = null;
    if (p1591) { const sv = await serieDe('poblacion_1591_vecinos', ine).catch(() => null); const q = sv && sv.find(x => +x.anio === 1591 && x.v != null); vec = q ? q.v : null; if (mi !== token) return; }
    // padrón oficial (campo `padron` del fichero, 1996-2025): las dos cifras, con su porqué en una «i»
    let padTxt = '';
    const dP = await datos.valores('poblacion_hab', 'municipio').catch(() => null);
    if (mi !== token) return;
    const pad = dP && dP.padron && Array.isArray(dP.padron.anios) ? dP.padron : null;
    if (pad) {
      const jj = (dP.ids || []).map(String).indexOf(ine), ka = pad.anios.map(Number).indexOf(+ult.anio);
      const vp = jj >= 0 && ka >= 0 && pad.v[ka] ? pad.v[ka][jj] : null;
      const porque = [pad.texto, pob.nota].filter(Boolean).join(' ');
      if (vp != null) padTxt = `<p class="mu-padron">${esc(String(ult.anio))}: ${esc(fmt(ult.v))} habitantes${ult.est ? ' (estimado)' : ''} · padrón oficial: ${esc(entero(vp))}${porque ? `<button type="button" class="v4-i" data-ayuda-t="La serie y el padrón" data-ayuda-p="${esc(porque)}" aria-label="Por qué hay dos cifras" aria-expanded="false">i</button>` : ''}</p>`;
    }
    caja.innerHTML = `<p class="mu-cifra"><b>${esc(fmt(ult.v))}</b> habitantes en ${esc(String(ult.anio))}</p>${padTxt}${miniSerie(sp, { formato: v => entero(v), ancho: 720, alto: 150, sinUnir: pob.anios_sin_unir })}${p1591 ? `<p class="mu-1591">1591: ${esc(fmt(p1591.v))} habitantes, estimado${vec != null ? ` · vecinos de la fuente: ${esc(entero(vec))}` : ''}.</p>` : ''}`;
  } else caja.innerHTML = '<p class="mu-cargando">Sin serie de población por municipio actual.</p>';
  // las demás: un indicador por concepto, con más de un año y cifra por municipio actual
  const elegidos = [];
  for (const t of (A ? A.temas : [])) for (const g of t.grupos) for (const c of g.conceptos) {
    const v = c.variantes[0]; const e = ent(v.ind);
    if (!e || e.id === 'poblacion_hab' || e.mensual || e.proveedor || !(e.niveles || []).includes('municipio') || (e.anios || []).length < 2) continue;
    elegidos.push({ tema: t, c, e });
  }
  const res = await enTandas(elegidos, 6, async x => ({ ...x, pts: await serieDe(x.e.id, ine) }));
  if (mi !== token) return;
  const conDato = res.filter(x => x.pts);
  conDato.forEach(x => (x.e.fuentes || []).forEach(id => usadas.add(id)));
  const porTema = new Map();
  for (const x of conDato) { if (!porTema.has(x.tema.id)) porTema.set(x.tema.id, { t: x.tema, xs: [] }); porTema.get(x.tema.id).xs.push(x); }
  el.querySelector('.mu-series').innerHTML = conDato.length ? [...porTema.values()].map(({ t, xs }) => `
    <h3 class="mu-h3">${esc(t.largo || t.rotulo)}</h3>
    <div class="mu-mult">${xs.map(x => figuraSerie(x)).join('')}</div>`).join('')
    : '<p class="mu-cargando">Sin otras series por municipio actual.</p>';
  // 1752 (un solo corte) y geografía (estática): tablas
  const unCorte = [];
  for (const t of (A ? A.temas : [])) for (const g of t.grupos) for (const c of g.conceptos) {
    const v = c.variantes.find(z => z.anio === '1752') || c.variantes[0]; const e = ent(v.ind);
    if (!e || !(e.niveles || []).includes('municipio')) continue;
    if ((e.anios || []).length === 1 && +e.anios[0] === 1752) unCorte.push({ c, e, g });
  }
  const geo = []; for (const t of (A ? A.temas : [])) if (t.id === 'geografia') for (const g of t.grupos) for (const c of g.conceptos) { const e = ent(c.variantes[0].ind); if (e) geo.push({ c, e }); }
  const [r1752, rgeo] = await Promise.all([enTandas(unCorte, 6, async x => ({ ...x, pts: await serieDe(x.e.id, ine) })), enTandas(geo, 6, async x => ({ ...x, pts: await serieDe(x.e.id, ine) }))]);
  if (mi !== token) return;
  const fila = x => { const q = x.pts && x.pts.find(z => z.v != null); (x.e.fuentes || []).forEach(id => usadas.add(id)); return q ? `<tr><th>${esc(x.c.padre ? x.c.padre.rotulo + ': ' + x.c.rotulo : x.c.rotulo)}</th><td>${esc(fmt(q.v, x.e.unidad))}</td><td>${esc(MARCA[q.f] || '')}</td></tr>` : ''; };
  const t1 = r1752.map(fila).filter(Boolean), tg = rgeo.map(fila).filter(Boolean);
  el.querySelector('.mu-1752').innerHTML = t1.length ? `<table class="mu-tabla">${t1.join('')}</table>` : '<p class="mu-cargando">Sin cifras de 1752 por municipio actual.</p>';
  el.querySelector('.mu-geo').innerHTML = tg.length ? `<table class="mu-tabla">${tg.join('')}</table>` : '<p class="mu-cargando">Sin datos de geografía.</p>';
}
async function enTandas(xs, n, fn) {
  const out = new Array(xs.length); let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (k < xs.length) { const i = k++; out[i] = await fn(xs[i]); } }));
  return out;
}

// ---------------------------------------------------------------- su término: un mapa por cada cambio (ronda v15)
// Juan: «simplemente mapa y, si no cambia, [lo dice]; o varios mapas con los cambios en cada momento, comentando la
// fuente». Lo pinta js/fronteras/ficha.js con historia.json (rel: c, l, s) y geo/terminos/<corte>.
async function termino(ine, B, mi, usadas) {
  const caja = el.querySelector('.mu-termino'); if (!caja) return;
  try {
    const hist = await B.historia();
    if (mi !== token) return;
    const ids = await pintarCambiosTermino(caja, {
      ine, hoy: B.hoy, cortes: B.cortes, cargarCorte: c => B.corte(c), historia: hist.get(ine) || null,
      seleccionar: x => setEstado({ mun: x }),
    });
    if (mi !== token) return;
    (ids || []).forEach(id => usadas.add(id));
  } catch (e) {
    if (mi === token) caja.innerHTML = '<p class="mu-cargando">No se pudo dibujar su término.</p>';
  }
}
