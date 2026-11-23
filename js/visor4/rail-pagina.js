// rail-pagina.js — la barra de temas del visor en una página propia (paisaje.html): sus iconos, sus cuadros y, en el
// móvil, el botón «Temas» que la abre y la cierra, como en el visor.
import { icono } from './iconos.js';
import { montarRailPagina } from './rail.js';

document.querySelectorAll('[data-icono]').forEach(s => { s.outerHTML = icono(s.dataset.icono, { clase: s.className }); });
const actual = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
montarRailPagina({ actual });

const b = document.getElementById('pz-temas'), rail = document.getElementById('v4-rail');
const abre = (si) => { document.body.classList.toggle('v4-sub-abierta', si); if (b) b.setAttribute('aria-expanded', String(si)); };
if (b && rail) {
  b.addEventListener('click', (ev) => { ev.stopPropagation(); abre(!document.body.classList.contains('v4-sub-abierta')); });
  document.addEventListener('click', (ev) => { if (document.body.classList.contains('v4-sub-abierta') && !rail.contains(ev.target)) abre(false); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && document.body.classList.contains('v4-sub-abierta')) { abre(false); b.focus(); } });
}
