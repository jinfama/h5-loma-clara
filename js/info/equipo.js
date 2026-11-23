// equipo.js — pinta en equipo.html las personas y la autoría de las bases de datos.
// Todo sale de js/visor4/creditos.js, para que no haya dos listas.
import { CREDITOS } from '../visor4/creditos.js';
import { esc, enlaceDe } from './comun.js';

function destacada(p) {
  const datos = [
    p.orcid ? `<li><span>ORCID</span><a href="https://orcid.org/${esc(p.orcid)}" target="_blank" rel="noopener">${esc(p.orcid)}</a></li>` : '',
    p.correo ? `<li><span>Correo</span><a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a></li>` : '',
  ].join('');
  return `<article class="in-lider" aria-labelledby="h-lider">
    ${p.foto ? `<figure class="p6-foto"><img src="${esc(p.foto)}" alt="${esc(p.nombre)}" width="240" height="300"></figure>` : ''}
    <div>
      <h2 id="h-lider">${esc(p.nombre)}</h2>
      <p class="in-afil">${esc(p.afiliacion)}</p>
      ${datos ? `<ul class="in-datos">${datos}</ul>` : ''}
    </div>
  </article>`;
}

function pintaPersonas() {
  const caja = document.getElementById('in-personas');
  const L = (CREDITOS.equipo || []).filter(p => p && p.nombre);
  const primera = L.find(p => p.destacado);
  const resto = L.filter(p => p !== primera);
  caja.innerHTML = (primera ? destacada(primera) : '')
    + (resto.length ? `<ul class="in-resto">${resto.map(p => `<li><h3>${esc(p.nombre)}</h3><p class="in-afil">${esc(p.afiliacion)}</p></li>`).join('')}</ul>` : '');
}

// «ver el artículo» lleva al DOI cuando la base tiene uno
function estadoHTML(x) {
  const u = enlaceDe(x), t = esc(x.estado);
  return u ? t.replace('ver el artículo', `<a href="${esc(u)}" target="_blank" rel="noopener">ver el artículo</a>`) : t;
}

function pintaAutorias() {
  const L = (CREDITOS.origen || []).filter(x => x && x.bloque && x.autores);
  document.getElementById('in-autorias').innerHTML = L.map(x =>
    `<div><dt>${esc(x.bloque)}</dt><dd>${esc(x.autores)}${x.estado ? `<small>${estadoHTML(x)}</small>` : ''}</dd></div>`).join('');
}

pintaPersonas();
pintaAutorias();
