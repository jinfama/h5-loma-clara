// selector.js — el mapa en blanco de Andalucía para elegir municipio: a pantalla completa al entrar sin código y, dentro del
// análisis, como capa con «Cambiar de municipio». Al pasar sale el nombre; al pinchar se abre su análisis.
import { geo } from './mapa.js';
import { d3, esc, tip, sinTip } from './util.js';

const PROV = { '04': 'Almería', 11: 'Cádiz', 14: 'Córdoba', 18: 'Granada', 21: 'Huelva', 23: 'Jaén', 29: 'Málaga', 41: 'Sevilla' };
const llano = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ir = ine => { location.href = `analisis-municipio.html?ine=${ine}`; };

export async function montarSelector(el, { actual = '', aviso = '', alCerrar = null } = {}) {
  el.innerHTML = `
    <div class="ma-sel">
      <div class="ma-sel__cab">
        <p class="ma-pre">Análisis del municipio</p>
        <h1 class="ma-sel__t">Pincha un municipio</h1>
        ${aviso ? `<p class="ma-sel__aviso">${esc(aviso)}</p>` : ''}
        <div class="ma-sel__busca" role="search">
          <label class="p6-sr" for="ma-sel-q">Buscar un municipio por su nombre</label>
          <input id="ma-sel-q" type="search" placeholder="O escribe su nombre" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="ma-sel-lista">
          <ul id="ma-sel-lista" class="ma-sel__lista" role="listbox" hidden></ul>
        </div>
      </div>
      ${alCerrar ? '<button type="button" class="ma-sel__cerrar">Cerrar ✕</button>' : ''}
      <div class="ma-sel__mapa" aria-label="Mapa de los municipios de Andalucía"></div>
      <div class="ma-sel__zoom" role="group" aria-label="Acercar o alejar el mapa">
        <button type="button" data-z="1" aria-label="Acercar">+</button>
        <button type="button" data-z="-1" aria-label="Alejar">−</button>
        <button type="button" data-z="0">Toda</button>
      </div>
    </div>`;
  const caja = el.querySelector('.ma-sel__mapa');
  const G = await geo();
  const lista = G.mun.map(f => ({ ine: f.properties.c, n: f.properties.n, l: llano(f.properties.n), f })).sort((a, b) => a.n.localeCompare(b.n, 'es'));
  let capa = null, zoom = null, svg = null, path = null, W = 0, H = 0, foco = null;

  const dibuja = () => {
    W = caja.clientWidth; H = caja.clientHeight;
    if (!W || !H) return;
    const margen = W < 560 ? 8 : 24, cuerpo = W < 560 ? 8 : 13;
    const pr = d3.geoMercator().fitExtent([[margen, margen], [W - margen, H - margen]], G.and);
    path = d3.geoPath(pr);
    caja.innerHTML = '';
    svg = d3.select(caja).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    capa = svg.append('g');
    capa.append('g').selectAll('path').data(G.mun).join('path')
      .attr('class', d => `ma-sel__m${d.properties.c === actual ? ' is-actual' : ''}`).attr('d', path).attr('data-ine', d => d.properties.c)
      .on('pointermove', (ev, d) => { marca(d.properties.c); tip(`<b>${esc(d.properties.n)}</b><br>${esc(PROV[d.properties.p] || '')}`, ev); })
      .on('pointerleave', () => { marca(null); sinTip(); })
      .on('click', (ev, d) => { sinTip(); ir(d.properties.c); });
    capa.append('path').attr('class', 'ma-sel__prov').attr('d', path(G.prov));
    capa.append('path').attr('class', 'ma-sel__borde').attr('d', path(G.and));
    capa.append('g').selectAll('text').data(G.provincias).join('text').attr('class', 'ma-sel__pn')
      .attr('x', d => path.centroid(d)[0]).attr('y', d => path.centroid(d)[1]).attr('text-anchor', 'middle')
      .text(d => PROV[String(d.properties.c || d.properties.p || d.properties.id || '').slice(0, 2)] || d.properties.n || '');
    zoom = d3.zoom().scaleExtent([1, 14]).translateExtent([[0, 0], [W, H]]).on('zoom', ev => {
      capa.attr('transform', ev.transform);
      capa.selectAll('.ma-sel__pn').attr('font-size', cuerpo / ev.transform.k).style('stroke-width', 3 / ev.transform.k);
    });
    svg.call(zoom);
    capa.selectAll('.ma-sel__pn').attr('font-size', cuerpo).style('stroke-width', 3);
  };
  const marca = ine => {
    if (foco === ine || !capa) return;
    if (foco) capa.select(`[data-ine="${foco}"]`).classed('is-foco', false);
    foco = ine;
    if (ine) capa.select(`[data-ine="${ine}"]`).classed('is-foco', true).raise();
  };
  const acerca = ine => {
    const f = G.porIne.get(ine); if (!f || !zoom) return;
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const k = Math.min(9, .35 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(Math.max(1, k)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    svg.transition().duration(350).call(zoom.transform, t);
    marca(ine);
  };
  dibuja();
  let tm = null;
  const ro = new ResizeObserver(() => { clearTimeout(tm); tm = setTimeout(() => { if (caja.clientWidth !== W || caja.clientHeight !== H) dibuja(); }, 120); });
  ro.observe(caja);

  el.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => {
    if (!zoom) return;
    const z = +b.dataset.z;
    if (!z) svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);
    else svg.transition().duration(200).call(zoom.scaleBy, z > 0 ? 1.8 : 1 / 1.8);
  }));

  // buscador con sugerencias
  const q = el.querySelector('#ma-sel-q'), ul = el.querySelector('#ma-sel-lista');
  let opciones = [], sel = -1;
  const pintaLista = () => {
    ul.innerHTML = opciones.map((o, i) => `<li role="option" id="ma-op-${i}" aria-selected="${i === sel}" data-i="${i}"><b>${esc(o.n)}</b> <span>${esc(PROV[o.ine.slice(0, 2)])}</span></li>`).join('');
    ul.hidden = !opciones.length;
    q.setAttribute('aria-expanded', opciones.length ? 'true' : 'false');
    if (sel >= 0) q.setAttribute('aria-activedescendant', `ma-op-${sel}`); else q.removeAttribute('aria-activedescendant');
  };
  q.addEventListener('input', () => {
    const t = llano(q.value.trim());
    opciones = t ? [...lista.filter(x => x.l.startsWith(t)), ...lista.filter(x => !x.l.startsWith(t) && x.l.includes(t))].slice(0, 8) : [];
    sel = opciones.length ? 0 : -1;
    pintaLista();
    if (opciones[0]) acerca(opciones[0].ine); else marca(null);
  });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opciones.length) return;
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length;
      pintaLista(); acerca(opciones[sel].ine);
    } else if (e.key === 'Enter' && opciones[sel]) { e.preventDefault(); ir(opciones[sel].ine); }
    else if (e.key === 'Escape' && opciones.length) { e.stopPropagation(); opciones = []; sel = -1; pintaLista(); }
  });
  ul.addEventListener('pointerdown', e => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); ir(opciones[+li.dataset.i].ine); } });
  ul.addEventListener('pointermove', e => { const li = e.target.closest('[data-i]'); if (li) marca(opciones[+li.dataset.i].ine); });

  if (alCerrar) el.querySelector('.ma-sel__cerrar').addEventListener('click', alCerrar);
  if (actual && G.porIne.has(actual)) marca(null);
  if (!matchMedia('(pointer: coarse)').matches) q.focus({ preventScroll: true });
  return () => ro.disconnect();
}

// la capa «Cambiar de municipio»
export function abrirCapaSelector(actual) {
  let capa = document.getElementById('ma-capa');
  if (capa) return;
  capa = document.createElement('div');
  capa.id = 'ma-capa'; capa.className = 'ma-capa'; capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true'); capa.setAttribute('aria-label', 'Cambiar de municipio');
  document.body.appendChild(capa);
  document.body.classList.add('ma-sin-scroll');
  const volverA = document.activeElement;
  let suelta = null;
  const cierra = () => {
    if (suelta) suelta();
    capa.remove(); sinTip();
    document.body.classList.remove('ma-sin-scroll');
    document.removeEventListener('keydown', tecla, true);
    if (volverA && volverA.focus) volverA.focus();
  };
  const tecla = e => { if (e.key === 'Escape') { e.preventDefault(); cierra(); } };
  document.addEventListener('keydown', tecla, true);
  montarSelector(capa, { actual, alCerrar: cierra }).then(f => { suelta = f; });
}
