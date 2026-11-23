// selector.js — elegir un indicador con buscador, agrupado por tema y grupo (panel izquierdo y rótulos de los ejes).
import { analizable, enNivel, fijo } from './cruce.js';
import { h, corto } from './comun.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let abierto = null;
export function cerrarSelector() { if (abierto) { abierto.remove(); abierto = null; document.removeEventListener('pointerdown', fuera, true); } }
function fuera(ev) { if (abierto && !abierto.contains(ev.target) && !ev.target.closest('[data-an-sel]')) cerrarSelector(); }

const rango = e => { const a = (e.anios || []).map(Number).filter(Number.isFinite); return fijo(e) ? 'cifra fija (de hoy)' : a.length ? (a[0] === a[a.length - 1] ? String(a[0]) : `${a[0]}-${a[a.length - 1]}`) : ''; };

/** Abre la lista junto a `ancla`. opts: {valor, nivel, excluir, vacio (texto de «ninguno»), alElegir(id)} */
export function abrirSelector(S, ancla, { valor = '', nivel, excluir = [], vacio = null, alElegir }) {
  cerrarSelector();
  const cat = (S.ctx.datos.catalogoSinc ? S.ctx.datos.catalogoSinc() : []).filter(analizable);
  const caja = h('div', { class: 'an-pop', role: 'dialog', 'aria-label': 'Elegir indicador' });
  const q = h('input', { class: 'an-pop__q', type: 'search', placeholder: 'Buscar indicador…', 'aria-label': 'Buscar indicador', autocomplete: 'off' });
  const lista = h('div', { class: 'an-pop__l', role: 'listbox' });
  caja.append(q, lista);
  const pinta = () => {
    const t = norm(q.value.trim());
    lista.textContent = '';
    if (vacio) lista.append(h('button', { type: 'button', role: 'option', class: 'an-pop__it' + (!valor ? ' is-on' : ''), onclick: () => { cerrarSelector(); alElegir(''); } }, h('span', {}, vacio)));
    let tema = null, grupo = null, n = 0;
    for (const e of cat) {
      if (t && !norm(`${e.rotulo} ${e.tema_rotulo || e.tema} ${e.grupo || ''} ${e.unidad || ''}`).includes(t)) continue;
      const tr = e.tema_rotulo || e.tema, gr = e.grupo || '';
      if (tr !== tema) { lista.append(h('p', { class: 'an-pop__t' }, tr)); tema = tr; grupo = null; }
      if (gr && gr !== grupo && gr !== tr) { lista.append(h('p', { class: 'an-pop__g' }, gr)); grupo = gr; }
      const ok = enNivel(e, nivel), ex = excluir.includes(e.id);
      lista.append(h('button', { type: 'button', role: 'option', class: 'an-pop__it' + (e.id === valor ? ' is-on' : ''), disabled: !ok || ex || null, 'aria-selected': String(e.id === valor),
        title: !ok ? 'No hay cifras de este indicador por esta unidad territorial' : ex ? 'Ya está elegido en el otro eje' : null,
        onclick: () => { cerrarSelector(); alElegir(e.id); } },
      h('span', {}, corto(e)), h('small', {}, [e.unidad, rango(e), ok ? '' : 'no por esta unidad'].filter(Boolean).join(' · '))));
      n++;
    }
    if (!n) lista.append(h('p', { class: 'an-pop__v' }, 'Ningún indicador con ese nombre.'));
  };
  q.addEventListener('input', pinta);
  caja.addEventListener('keydown', ev => {
    const bs = [...lista.querySelectorAll('button:not([disabled])')], k = bs.indexOf(document.activeElement);
    if (ev.key === 'Escape') { cerrarSelector(); ancla.focus(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); (bs[k + 1] || bs[0]).focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); (k <= 0 ? q : bs[k - 1]).focus(); }
    else if (ev.key === 'Enter' && document.activeElement === q && bs[0]) { ev.preventDefault(); bs[0].click(); }
  });
  pinta();
  document.body.append(caja);
  // junto al ancla, sin salirse de la pantalla
  const r = ancla.getBoundingClientRect(), W = Math.min(360, innerWidth - 16), H = Math.min(440, innerHeight - 24);
  caja.style.width = W + 'px'; caja.style.maxHeight = H + 'px';
  let left = Math.min(r.left, innerWidth - W - 8), top = r.bottom + 4;
  if (top + H > innerHeight - 8) top = Math.max(8, r.top - H - 4);
  caja.style.left = Math.max(8, left) + 'px'; caja.style.top = top + 'px';
  abierto = caja;
  setTimeout(() => document.addEventListener('pointerdown', fuera, true), 0);
  q.focus();
  const on = lista.querySelector('.is-on'); if (on) on.scrollIntoView({ block: 'center' });
}

/** Botón que enseña el indicador elegido y abre el selector. letra: 'Y', 'X'… (cuadro de tinta a la izquierda). */
export function botonIndicador(S, { letra = '', valor, nivel, excluir = [], vacio = null, alElegir, titulo = '', clase = '', sufijo = '', conUnidad: cu = false }) {
  const e = valor ? S.ctx.datos.indicador(valor) : null;
  const txt = e ? (cu && e.unidad && !/\(/.test(corto(e)) ? `${corto(e)} (${e.unidad})` : corto(e)) : (vacio || 'Elegir…');
  const b = h('button', { type: 'button', class: 'an-ind ' + clase, 'data-an-sel': '', 'aria-haspopup': 'dialog', title: titulo || null },
    letra ? h('span', { class: 'an-tag', 'aria-hidden': 'true' }, letra) : null,
    h('span', { class: 'an-ind__n' }, txt),
    sufijo ? h('span', { class: 'an-ind__a' }, sufijo) : null,
    h('span', { class: 'an-ind__v', 'aria-hidden': 'true' }, '▾'));
  b.addEventListener('click', () => (abierto ? cerrarSelector() : abrirSelector(S, b, { valor, nivel, excluir, vacio, alElegir })));
  return b;
}
