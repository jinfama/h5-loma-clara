/* fuentes.html · «Fuentes y método»: versión de los datos (MANIFEST.json + pins_publicos.json), catálogo de fuentes
   originales (fuentes.json), reservas vigentes (reservas.json, texto literal), qué está en revisión, nota de la
   geometría web y cómo leer las tramas. Todo sale de data/v2; aquí no se escribe ninguna cifra a mano. */

import { pintarPersonas } from './personas.js';
import { cargarSiHay } from '../atlas2/data.js';
import { esc, entero, normaliza } from '../atlas2/fmt.js';
import { insignia } from '../atlas2/leyenda.js';
import { CREDITOS } from '../visor4/creditos.js';

pintarPersonas().catch(e => console.error('[fuentes]', e));
const $ = s => document.querySelector(s);

// De dónde sale cada dato: lo que trae creditos.js, bloque a bloque; vacío, «en preparación»
function pintaOrigen() {
  const el = $('#origen-lista'); if (!el) return;
  const L = (CREDITOS && Array.isArray(CREDITOS.origen) ? CREDITOS.origen : []).filter(x => x && x.bloque);
  const conDoi = x => { const t = esc(x.estado), d = String(x.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//, ''); return d ? t.replace('ver el artículo', `<a href="https://doi.org/${esc(d)}" target="_blank" rel="noopener">ver el artículo</a>`) : t; };
  el.innerHTML = L.length ? L.map(x => `<div><dt>${esc(x.bloque)}${x.estado ? `<small>${conDoi(x)}</small>` : ''}</dt><dd>${x.de_otros_trabajos ? `<p><b>De otros trabajos:</b> ${esc(x.de_otros_trabajos)}</p>` : ''}${x.estimado_aqui ? `<p><b>Estimado aquí:</b> ${esc(x.estimado_aqui)}</p>` : ''}${x.autores ? `<p class="p6-origen__au">${esc(x.autores)}</p>` : ''}</dd></div>`).join('') : '<div><dd>En preparación.</dd></div>';
}
pintaOrigen();

// un enlace con ancla (#origen, #leer): lo de arriba se pinta después; se recoloca hasta que quien lee se mueva
(function mantenAncla() {
  const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!el) return;
  const ro = new ResizeObserver(() => el.scrollIntoView());
  const fin = () => ro.disconnect();
  ro.observe(document.body);
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(t => addEventListener(t, fin, { once: true, passive: true }));
  setTimeout(fin, 5000);
})();

const ESTADOS = {
  aceptado: { txt: 'aceptado', clase: 'aceptado' },
  aceptado_con_reserva: { txt: 'aceptado con reserva', clase: 'accent' },
  en_revision: { txt: 'en revisión', clase: 'revision' },
  pendiente_aceptacion_conjunto: { txt: 'pendiente de aceptación de conjunto', clase: 'revision' },
  candidata: { txt: 'candidata', clase: 'candidata' },
};
const estadoBadge = e => {
  const d = ESTADOS[e] || { txt: e || 'sin estado', clase: 'estimado' };
  return `<span class="a2-badge a2-badge--${d.clase} fu-badge-estado">${esc(d.txt)}</span>`;
};
const corta = h => (h ? String(h).slice(0, 8) : '—');
const fecha = s => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');

boot();

async function boot() {
  const tecnica = !!$('#tecnica');      // el sitio público no la lleva ni pide sus ficheros
  const [man, pp, fuentes, reservas, relieve] = await Promise.all([
    cargarSiHay('MANIFEST.json'),
    tecnica ? cargarSiHay('pins_publicos.json') : null,
    cargarSiHay('fuentes.json'),
    cargarSiHay('reservas.json'),
    cargarSiHay('geo/relieve/capas.json'),
  ]);
  // la parte técnica son unos 72.000 nodos: se pinta al abrirla, no al cargar la página
  const det = $('#tecnica');
  let tecnicaLista = false;
  const pintaTecnica = () => { if (tecnicaLista) return; tecnicaLista = true; pintarVersion(man, pp); pintarRevision(pp); pintarReservas(reservas); pintarCatalogo(fuentes); pintarTramas(); pintarGeometria(man, relieve); };
  const h = decodeURIComponent(location.hash.slice(1)), dentro = h && det && det.querySelector(`[id="${h.replace(/"/g, '')}"]`);
  // en el sitio público no hay parte técnica (build_site.py la quita): entonces no se pinta nada de ella
  if (det) {
    if (det.open || dentro || h === 'tecnica') { det.open = true; pintaTecnica(); if (dentro) dentro.scrollIntoView(); }
    else det.addEventListener('toggle', () => { if (det.open) pintaTecnica(); });
  }
  if ($('#notas-tecnicas')) pintarNotasTecnicas(await cargarSiHay('visor/indicadores.json'));
  $('#pie').innerHTML = `${esc($('#autoria').textContent)}${man && man.actualizado ? ` Versión de datos del ${esc(fecha(man.actualizado))}` : ''}${man && man.data_project_sha256 ? ` · unidad <span class="a2-mono">${esc(corta(man.data_project_sha256))}</span>` : ''}.`;
}

/* ---------- notas técnicas de los indicadores (regla 15: solo aquí, en la parte técnica) ---------- */
function pintarNotasTecnicas(cat) {
  const inds = ((cat && (cat.indicadores || cat)) || []).filter(e => e && e.nota_tecnica);
  if (!inds.length) return;
  $('#notas-tecnicas').hidden = false;
  $('#lista-notas-tecnicas').innerHTML = inds.map(e => `<dt>${esc(e.rotulo || e.id)}</dt><dd>${esc(e.nota_tecnica)}</dd>`).join('');
}

/* ---------- versión ---------- */
function pintarVersion(man, pp) {
  const fich = (man && man.ficheros) || {};
  const pins = (pp && pp.pins) || [];
  const usos = new Map();
  for (const [ruta, f] of Object.entries(fich)) for (const p of f.pins || []) {
    if (!usos.has(p.id)) usos.set(p.id, []);
    usos.get(p.id).push(ruta);
  }
  const cuenta = {};
  for (const p of pins) cuenta[p.estado] = (cuenta[p.estado] || 0) + 1;
  $('#version-resumen').innerHTML = !man ? '<p class="a2-empty">MANIFEST.json aún no está en data/v2.</p>' : `
    <div class="a2-panel"><div class="a2-stat"><span class="a2-stat__value a2-mono">${esc(corta(man.data_project_sha256))}</span><span class="a2-stat__label">huella de la unidad (data_project.json) de la que sale esta versión</span></div></div>
    <div class="a2-panel"><div class="a2-stat"><span class="a2-stat__value">${esc(fecha(man.actualizado).slice(0, 10))}</span><span class="a2-stat__label">última generación de los datos web (${esc(fecha(man.actualizado).slice(11))})</span></div></div>
    <div class="a2-panel"><div class="a2-stat"><span class="a2-stat__value">${entero(Object.keys(fich).length)}</span><span class="a2-stat__label">ficheros web en data/v2</span></div></div>
    <div class="a2-panel"><div class="a2-stat"><span class="a2-stat__value">${entero(pins.length)}</span><span class="a2-stat__label">tablas de origen: ${Object.entries(cuenta).map(([e, n]) => `${entero(n)} ${esc((ESTADOS[e] || { txt: e }).txt)}`).join(', ')}</span></div></div>`;

  const filtros = ['todas', ...Object.keys(ESTADOS).filter(e => cuenta[e])];
  let activo = 'todas';
  const fil = $('#filtro-estado');
  const pintarFiltro = () => {
    fil.innerHTML = filtros.map(f => `<button type="button" data-f="${f}" aria-pressed="${f === activo}">${f === 'todas' ? 'Todas' : esc(ESTADOS[f].txt)}${f === 'todas' ? '' : ` (${cuenta[f]})`}</button>`).join('');
  };
  const pintarTabla = () => {
    const filas = pins.filter(p => activo === 'todas' || p.estado === activo);
    $('#tabla-pins tbody').innerHTML = pins.length ? filas.map(p => `<tr>
      <td class="a2-mono">${esc(p.id)}</td><td class="a2-mono">${esc(p.fichero)}</td>
      <td>${estadoBadge(p.estado)}${p.reserva ? '<br><small><a href="#reservas">ver reserva</a></small>' : ''}</td>
      <td class="a2-mono">${esc(p.sha256.slice(0, 8))}</td>
      <td class="fu-usada">${agrupaRutas(usos.get(p.id) || []).map(esc).join('<br>') || '<small>ningún fichero web todavía</small>'}</td></tr>`).join('')
      : '<tr><td colspan="5">pins_publicos.json aún no está en data/v2.</td></tr>';
  };
  pintarFiltro(); pintarTabla();
  fil.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    activo = b.dataset.f; pintarFiltro(); pintarTabla();
  });

  const estadoDe = new Map(pins.map(p => [p.id, p.estado]));
  $('#tabla-ficheros tbody').innerHTML = Object.entries(fich).sort(([a], [b]) => a.localeCompare(b)).map(([ruta, f]) => `<tr>
    <td class="a2-mono">${esc(ruta)}</td><td class="a2-mono">${esc(fecha(f.generado))}</td>
    <td class="a2-mono">${f.bytes != null ? entero(Math.round(f.bytes / 1024)) + ' KB' : '—'}</td>
    <td class="a2-mono">${esc(corta(f.sha256))}</td>
    <td class="fu-usada">${(f.pins || []).map(p => `${esc(p.id)} <span class="a2-mono">${esc(corta(p.sha256))}</span> ${estadoDe.has(p.id) ? estadoBadge(estadoDe.get(p.id)) : ''}`).join('<br>') || '<small>—</small>'}</td></tr>`).join('');
}

/* geo/terminos/1752.topo.json … → «geo/terminos/*.topo.json (22)» */
function agrupaRutas(rutas) {
  const g = new Map();
  for (const r of rutas) {
    const m = /^(geo\/(?:terminos|partidos)\/)[^/]+(\.topo\.json)$/.exec(r);
    const k = m ? `${m[1]}*${m[2]}` : r;
    g.set(k, (g.get(k) || 0) + 1);
  }
  return [...g].map(([k, n]) => (n > 1 ? `${k} (${n})` : k));
}

/* ---------- en revisión ---------- */
function pintarRevision(pp) {
  $('#b-pre1842').innerHTML = insignia('revision') + insignia('supuesto');
  $('#b-1842').innerHTML = insignia('estimado', 'Imputación, no censo');
  $('#b-candidata').innerHTML = insignia('candidata');
  const pins = ((pp && pp.pins) || []).filter(p => p.estado === 'en_revision' || p.estado === 'candidata');
  $('#lista-revision').innerHTML = pins.length
    ? pins.map(p => `<li>${estadoBadge(p.estado)} <span class="a2-mono">${esc(p.id)}</span> <small>${esc(p.fichero)}</small></li>`).join('')
    : '<li><small>Sin datos de estado (pins_publicos.json).</small></li>';
}

/* ---------- reservas ---------- */
function pintarReservas(r) {
  const lista = (r && r.reservas) || [];
  $('#lista-reservas').innerHTML = !r ? '<p class="a2-empty">reservas.json aún no está en data/v2.</p>'
    : !lista.length ? '<p>No hay reservas vigentes.</p>'
    : lista.map(x => `<article class="fu-reserva">
        <h3>${esc(x.rotulo || x.producto)}</h3>
        <p class="a2-small"><span class="a2-mono">${esc(x.producto)}</span>${x.ficha ? ` · ficha ${esc(x.ficha)}` : ''}${x.tema ? ` · tema: ${esc(x.tema)}` : ''}${x.cortes ? ` · cortes: ${esc(x.cortes.join(', '))}` : ''}${x.provincias ? ` · provincias: ${esc(x.provincias.join(', '))}` : ''} · huella <span class="a2-mono">${esc(corta(x.sha256))}</span></p>
        <blockquote class="a2-quote">«${esc(x.texto)}»</blockquote>
      </article>`).join('');
}

/* ---------- catálogo ---------- */
function pintarCatalogo(f) {
  const el = $('#lista-fuentes');
  if (!f) { el.innerHTML = '<p class="a2-empty">fuentes.json aún no está en data/v2.</p>'; return; }
  const items = Object.entries(f).sort((a, b) => (a[1].titulo || a[0]).localeCompare(b[1].titulo || b[0], 'es'));
  const pintar = q => {
    const n = normaliza(q);
    const vis = items.filter(([id, x]) => !n || normaliza([id, x.titulo, x.original, x.nota].join(' ')).includes(n));
    el.innerHTML = vis.map(([id, x]) => `<div class="fu-fuente">
      <dt><code>${esc(id)}</code>${esc(x.titulo || id)}</dt>
      ${x.original && x.original !== x.titulo ? `<dd class="fu-orig">${esc(x.original)}</dd>` : ''}
      ${x.localizador_tipo ? `<dd><strong>Cómo se cita el lugar:</strong> ${esc(x.localizador_tipo)}</dd>` : ''}
      ${x.nota ? `<dd>${esc(x.nota)}</dd>` : ''}</div>`).join('') || '<p class="a2-small">Ninguna fuente coincide.</p>';
  };
  pintar('');
  $('#buscar-fuente').addEventListener('input', e => pintar(e.target.value));
}

/* ---------- tramas ---------- */
function pintarTramas() {
  const T = [
    { m: 'background-color:var(--a2-seq-3)', c: '', t: 'Observado', p: 'Cifra que da la fuente. Color lleno.' },
    { m: 'background-color:var(--a2-seq-3)', c: 'a2-trama-estimado', t: 'Estimado', p: 'Cifra calculada por la unidad (interpolación, reparto, modelo…). Mismo color con rayado fino y un aviso; nunca se presenta como observada.' },
    { m: '', c: 'a2-trama-sindato', t: 'Sin dato', p: 'Casilla vacía. No es un cero: gris neutro con trama cruzada, nunca el color más bajo de la escala.' },
    { m: 'background-color:var(--a2-seq-2);background-image:repeating-linear-gradient(45deg,var(--a2-ink) 0 .7px,transparent .7px 4px)', c: '', t: 'Contorno aproximado', p: 'Término con traspasos de suelo posteriores que no se pueden deshacer con exactitud (mapa de fronteras).' },
    { b: insignia('revision', 'en revisión'), t: 'En revisión', p: '1752 y 1787: construidos con las decisiones firmadas y pendientes de la aceptación de conjunto del responsable de la base y las tablas marcadas «en revisión».' },
    { b: insignia('candidata', 'geometría reconstruida'), t: 'Geometría reconstruida', p: 'Términos, partidos y reinos históricos dibujados uniendo recintos de hoy: no son los límites observados, y cada línea dice su fiabilidad (aceptada por decisión firmada del responsable de la base el 20-nov-2026).' },
    { b: insignia('supuesto'), t: 'Supuesto', p: 'Límites de 1752 y 1787: reconstruidos con recintos de hoy, no observados.' },
    { b: insignia('accent', 'aceptado con reserva'), t: 'Aceptado con reserva', p: 'Tabla aceptada con una reserva vigente: su texto literal está en «Reservas».' },
  ];
  $('#tramas-lista').innerHTML = T.map(x => `<div class="fu-trama">
    ${x.b ? `<div>${x.b}</div>` : `<span class="fu-muestra ${x.c}" style="${x.m}" aria-hidden="true"></span>`}
    <div><h3>${esc(x.t)}</h3><p>${esc(x.p)}</p></div></div>`).join('');
}

/* ---------- geometría web y atribuciones ---------- */
function pintarGeometria(man, relieve) {
  $('#nota-geometria').textContent = man && man.nota_geometria_web ? `«${man.nota_geometria_web}»` : 'MANIFEST.json no trae nota_geometria_web.';
  const tol = Object.entries((man && man.ficheros) || {}).filter(([, f]) => f.tolerancia_m != null);
  const grupos = new Map();
  for (const [ruta, f] of tol) {
    const clave = `${ruta.startsWith('geo/terminos/') ? 'geo/terminos/*' : ruta.startsWith('geo/partidos/') ? 'geo/partidos/*' : ruta}`;
    if (!grupos.has(clave)) grupos.set(clave, new Set());
    grupos.get(clave).add(f.tolerancia_m);
  }
  $('#tolerancias').innerHTML = grupos.size ? `<p class="a2-small">Tolerancia de simplificación: ${[...grupos].map(([k, v]) => `<span class="a2-mono">${esc(k)}</span> ${[...v].join('/')} m`).join(' · ')}.</p>` : '';
  const at = [];
  if (relieve && relieve.capas) for (const c of Object.values(relieve.capas)) at.push(`<li><span class="a2-mono">${esc(c.fichero)}</span> ${esc(c.atribucion || '')}</li>`);
  at.push('<li>Recintos municipales de hoy: IECA (CC BY 4.0).</li>');
  $('#atribuciones').innerHTML = at.join('');
}
