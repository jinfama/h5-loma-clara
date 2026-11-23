// buscador.js — el gran buscador de todos los indicadores (ronda v19, Juan: «como el del Banco Mundial»).
// Un panel que se abre desde la derecha con un buscador y la lista de TODOS los indicadores, agrupados por tema, con su
// periodo y sus escalas (municipio actual, municipio histórico, partido, provincia), y filtros por tema y por escala.
// Al pulsar uno, se abre en el visor. Es aparte del buscador pequeño de la lista de la izquierda.

import { esc, normaliza } from '../atlas2/fmt.js';
import { pictoDeIndicador } from '../pictos/agro.js';

const ESCALAS = [
  ['municipio', 'Municipio actual'],
  ['termino', 'Municipio histórico'],
  ['pj1888', 'Partido judicial'],
  ['provincia', 'Provincia'],
];

let H = null, panel = null, filtroTema = '', filtroEscala = '', ultimoFoco = null;

/* h = { arbol(), indicador(id), disponibles(ent) → Set de niveles, periodoDe([ids]), irA(id), esAnalisis(id), actual() } */
export function montarBuscador(h) {
  H = h;
  const b = document.getElementById('v4-buscador-abrir');
  if (b) b.addEventListener('click', abrir);
  const bm = document.getElementById('v4-buscador-movil'); if (bm) bm.addEventListener('click', abrir);   // en el móvil, en la cabecera
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel && !panel.hidden) { e.preventDefault(); cerrar(); } });
}

function entradas() {
  const a = H.arbol(); if (!a) return [];
  const out = [];
  for (const t of a.temas) for (const g of t.grupos) for (const c of g.conceptos) for (const cc of [c, ...(c.hijos || [])]) {
    for (const v of cc.variantes) {
      const ent = H.indicador(v.ind); if (!ent) continue;
      const esc0 = H.disponibles(ent);
      const rot = cc.variantes.length > 1 && v.etiqueta ? `${cc.rotulo} · ${v.etiqueta}` : cc.rotulo;
      out.push({
        id: v.ind, rot, grupo: g.rotulo, tema: t, unidad: ent.unidad || '', per: H.periodoDe([v.ind]),
        escalas: ESCALAS.filter(([k]) => esc0.has(k)).map(([k]) => k), analisis: H.esAnalisis(v.ind),
        clave: normaliza(`${rot} ${g.rotulo} ${t.rotulo} ${t.largo || ''} ${ent.unidad || ''} ${ent.nota || ''} ${H.periodoDe([v.ind])}`),
      });
    }
  }
  return out;
}

function crear() {
  panel = document.createElement('div');
  panel.className = 'v4-bus'; panel.id = 'v4-bus'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'v4-bus-t');
  panel.innerHTML = `<div class="v4-bus__velo" data-cierra></div>
    <section class="v4-bus__panel">
      <header class="v4-bus__cab">
        <div><h2 class="v4-bus__t" id="v4-bus-t">Todos los indicadores</h2><p class="v4-bus__n" aria-live="polite"></p></div>
        <button type="button" class="v4-bus__x" data-cierra aria-label="Cerrar">✕</button>
      </header>
      <label class="v4-bus__q"><span class="v4-sr">Buscar en todos los indicadores</span><input type="search" id="v4-bus-q" placeholder="Busca: olivar, densidad, PSOE, ganado, 1752…" autocomplete="off"></label>
      <div class="v4-bus__filtros">
        <div class="v4-bus__fila" role="group" aria-label="Tema"><span class="v4-bus__k">Tema</span><span class="v4-bus__chips" data-f="tema"></span></div>
        <div class="v4-bus__fila" role="group" aria-label="Escala"><span class="v4-bus__k">Escala</span><span class="v4-bus__chips" data-f="escala"></span></div>
      </div>
      <div class="v4-bus__res" tabindex="-1"></div>
    </section>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-cierra]')) { cerrar(); return; }
    const ch = e.target.closest('[data-chip]');
    if (ch) { if (ch.dataset.chip === 'tema') filtroTema = ch.dataset.v; else filtroEscala = ch.dataset.v; pinta(); return; }
    const it = e.target.closest('[data-ind]');
    if (it) { cerrar(); H.irA(it.dataset.ind); }
  });
  panel.querySelector('#v4-bus-q').addEventListener('input', () => pinta());
}

function chips() {
  const a = H.arbol();
  const temas = [['', 'Todos'], ...(a ? a.temas.map(t => [t.id, t.rotulo]) : [])];
  panel.querySelector('[data-f="tema"]').innerHTML = temas.map(([v, r]) => `<button type="button" class="v4-bus__chip" data-chip="tema" data-v="${esc(v)}" aria-pressed="${v === filtroTema}">${esc(r)}</button>`).join('');
  panel.querySelector('[data-f="escala"]').innerHTML = [['', 'Todas'], ...ESCALAS].map(([v, r]) => `<button type="button" class="v4-bus__chip" data-chip="escala" data-v="${esc(v)}" aria-pressed="${v === filtroEscala}">${esc(r)}</button>`).join('');
}

function pinta() {
  chips();
  const q = normaliza(panel.querySelector('#v4-bus-q').value || '').trim();
  const palabras = q ? q.split(/\s+/) : [];
  const act = H.actual();
  const lista = entradas().filter(x => (!filtroTema || x.tema.id === filtroTema) && (!filtroEscala || x.escalas.includes(filtroEscala)) && palabras.every(p => x.clave.includes(p)));
  panel.querySelector('.v4-bus__n').textContent = `${lista.length.toLocaleString('es-ES')} ${lista.length === 1 ? 'indicador' : 'indicadores'}`;
  const porTema = new Map();
  for (const x of lista) { if (!porTema.has(x.tema.id)) porTema.set(x.tema.id, { t: x.tema, xs: [] }); porTema.get(x.tema.id).xs.push(x); }
  const NOM = Object.fromEntries(ESCALAS);
  panel.querySelector('.v4-bus__res').innerHTML = lista.length ? [...porTema.values()].map(({ t, xs }) => `
    <section class="v4-bus__tema"><h3 class="v4-bus__h">${esc(t.largo || t.rotulo)} <span>${xs.length}</span></h3>
      <ul class="v4-bus__lista">${xs.map(x => `<li><button type="button" class="v4-bus__it${x.id === act ? ' is-actual' : ''}${x.analisis ? ' is-analisis' : ''}" data-ind="${esc(x.id)}">
        <span class="v4-bus__r">${(() => { const sv = pictoDeIndicador(x.id, { tam: 22, titulo: '' }); return sv ? `<span class="v4-bus__picto" aria-hidden="true">${sv}</span>` : ''; })()}${esc(x.rot)}${x.analisis ? ' <em class="v4-bus__atlas">∑ calculado por el Atlas</em>' : ''}</span>
        <span class="v4-bus__g">${esc(x.grupo)}${x.unidad ? ` · ${esc(x.unidad)}` : ''}</span>
        <span class="v4-bus__p">${esc(x.per || '')}</span>
        <span class="v4-bus__e">${x.escalas.map(k => `<i>${esc(NOM[k])}</i>`).join('')}</span>
      </button></li>`).join('')}</ul></section>`).join('')
    : '<p class="v4-bus__vacio">Ningún indicador con eso. Prueba con otra palabra o quita algún filtro.</p>';
}

export function abrir() {
  if (!panel) crear();
  ultimoFoco = document.activeElement;
  pinta();
  panel.hidden = false;
  document.body.classList.add('v4-bus-abierto');
  const b = document.getElementById('v4-buscador-abrir'); if (b) b.setAttribute('aria-expanded', 'true');
  setTimeout(() => { const i = panel.querySelector('#v4-bus-q'); if (i) i.focus(); }, 30);
}
export function cerrar() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  document.body.classList.remove('v4-bus-abierto');
  const b = document.getElementById('v4-buscador-abrir'); if (b) b.setAttribute('aria-expanded', 'false');
  if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
}
