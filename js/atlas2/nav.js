/* Atlas v2 · barra de navegación común.
   Uso (al principio del <body>, o en el módulo de la página):
     import { montarNav } from './js/atlas2/nav.js';
     montarNav('fronteras');   // portada | timelapses | fronteras | explorar | metodo
   Pone también el enlace «saltar al contenido» hacia #main. */

export const PAGINAS = [
  { id: 'portada',    href: 'index.html',             texto: 'Portada' },
  { id: 'timelapses', href: 'timelapses.html',        texto: 'Timelapses' },
  { id: 'fronteras',  href: 'fronteras.html',         texto: 'Fronteras' },
  { id: 'explorar',   href: 'visor.html',             texto: 'Explorar' },
  { id: 'metodo',     href: 'fuentes.html',           texto: 'Fuentes y método' },
];

export function montarNav(activa, { destino = document.body } = {}) {
  const nav = document.createElement('nav');
  nav.className = 'a2-nav';
  nav.setAttribute('aria-label', 'Secciones del atlas');
  nav.innerHTML = `
    <a class="a2-nav__brand" href="index.html">Atlas Histórico de Andalucía</a>
    <button class="a2-nav__toggle" type="button" aria-expanded="false" aria-controls="a2-nav-links">Menú</button>
    <ul class="a2-nav__links" id="a2-nav-links">
      ${PAGINAS.map(p => `<li><a href="${p.href}"${p.id === activa ? ' aria-current="page"' : ''}>${p.texto}</a></li>`).join('')}
    </ul>`;
  const skip = document.createElement('a');
  skip.className = 'a2-skip';
  skip.href = '#main';
  skip.textContent = 'Saltar al contenido';
  destino.prepend(nav);
  destino.prepend(skip);
  const btn = nav.querySelector('.a2-nav__toggle');
  btn.addEventListener('click', () => {
    const open = nav.dataset.open === 'true' ? 'false' : 'true';
    nav.dataset.open = open;
    btn.setAttribute('aria-expanded', open);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.dataset.open === 'true') { nav.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
  });
  return nav;
}
