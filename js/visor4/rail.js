// rail.js — la barra de temas del visor (izquierda), compartida con las páginas propias que la llevan (paisaje.html).
// En el visor, main.js pinta «Por tema» con botones que abren la lista de cada tema; fuera de él, montarRailPagina()
// pinta lo mismo con enlaces al visor. El bloque «Análisis y visualizaciones» es igual en los dos sitios.

import { icono } from './iconos.js';
import { ACENTO_TEMA } from './acentos.js';

export const TITULO_ANALISIS = 'Análisis y visualizaciones';

// iconos del bloque, cada uno con su gesto al pasar: los puntos se ordenan en una recta, el mapa marca un municipio,
// pasa la página de un relato, sale el sol sobre el paisaje
export const ICO_AN = {
  datos: '<svg class="ia ia--datos" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 3.5v17h17"/><line class="ia-recta" x1="6" y1="18" x2="20" y2="6"/><circle class="ia-p" style="--dy:5.1px" cx="7" cy="12" r="1.5"/><circle class="ia-p" style="--dy:-2.4px" cx="10" cy="17" r="1.5"/><circle class="ia-p" style="--dy:2.5px" cx="13" cy="9.5" r="1.5"/><circle class="ia-p" style="--dy:-3.6px" cx="16" cy="13" r="1.5"/><circle class="ia-p" style="--dy:1.9px" cx="19" cy="5" r="1.5"/></svg>',
  municipio: '<svg class="ia ia--mun" viewBox="0 0 24 24" aria-hidden="true"><path class="ia-mun" d="M11.5 12.5l5 1.2-2.6 3.8-4.2-1z"/><path d="M2.8 13.5 6 9l4-1 3-3.2 4 1.2 4.2 3-1.6 4-4 2-2.5 3.6-4.2-1-3.2-2z"/><path class="ia-lim" d="M10 8l1.5 4.5 5 1.2M11.5 12.5l-1.8 4"/></svg>',
  relatos: '<svg class="ia ia--rel" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5"/><path d="M12 6.5c2-1.5 5-2 8.5-1.5v13c-3.5-.5-6.5 0-8.5 1.5z"/><path class="ia-hoja" d="M12 6.5c2-1.5 5-2 8.5-1.5v13c-3.5-.5-6.5 0-8.5 1.5z"/><path d="M12 6.5v13"/></svg>',
  paisaje: '<svg class="ia ia--pai" viewBox="0 0 24 24" aria-hidden="true"><circle class="ia-sol" cx="17" cy="7" r="2.4"/><path d="M2.5 18.5 9 9.5l4.2 5.6 2.6-2.8 5.7 6.2z"/><path d="M2.5 21h19"/></svg>',
};

// las páginas del bloque; «De datos» va antes, como botón en el visor y como enlace fuera de él
export const ANALISIS_RAIL = [
  { id: 'municipio', href: 'analisis-municipio.html', icono: 'municipio', corto: 'De un municipio', largo: 'Análisis de un municipio', titulo: 'Análisis de un municipio: elige uno en el mapa' },
  { id: 'relatos', href: 'relatos.html', icono: 'relatos', corto: 'Relatos', largo: 'Relatos', titulo: 'Relatos: historias contadas con los datos del Atlas' },
  { id: 'paisaje', href: 'paisaje.html', icono: 'paisaje', corto: 'Paisaje', largo: 'Cambio en el paisaje', titulo: 'Cambio en el paisaje: fotos aéreas y mapas de usos del suelo de un municipio, con una cortina' },
];
export const DE_DATOS = { corto: 'De datos', largo: 'Análisis de datos', titulo: 'Análisis de datos: relacionar indicadores en el espacio y en el tiempo (dispersión, mapa bivariante, Moran, correlaciones, regresión)' };

const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cuerpo = (ico, x) => `${ICO_AN[ico]}<span class="v4-tema__c">${esc(x.corto)}</span><span class="v4-tema__l">${esc(x.largo)}</span>`;

// los enlaces del bloque (sin «De datos»); `actual`, la página en la que se está
export const enlacesAnalisis = (actual = '') => ANALISIS_RAIL.map(x => `<li class="v4-an"><a class="v4-tema v4-tema--mun" href="${x.href}" aria-label="${esc(x.largo)}"${x.id === actual ? ' aria-current="page"' : ''} style="--acento:#2fa36b" title="${esc(x.titulo)}">${cuerpo(x.icono, x)}</a></li>`).join('');
export const botonDeDatos = (pulsado) => `<li class="v4-an"><button type="button" class="v4-tema v4-tema--analisis" data-vista-ir="analisis" aria-label="${esc(DE_DATOS.largo)}" aria-pressed="${!!pulsado}" style="--acento:#2fa36b" title="${esc(DE_DATOS.titulo)}">${cuerpo('datos', DE_DATOS)}</button></li>`;
export const filasRail = (nTemas, nAnalisis) => Math.ceil(nTemas / 2) + Math.ceil(nAnalisis / 2);
// el icono de cada tema se dibuja por trazo al pasar (longitud 1 en lo que no lleva ya su propio discontinuo)
export function trazos(ul) {
  ul.querySelectorAll('.i4 path, .i4 circle, .i4 rect, .i4 line, .i4 polyline').forEach(e => { if (!e.hasAttribute('stroke-dasharray') && !e.matches('.ic-rio, .ic-traza, .ic-recta')) e.setAttribute('pathLength', '1'); });
}

// Fuera del visor: los temas llevan al visor (a la lista de ese tema), «Todos los indicadores» abre allí el buscador y
// «De datos», el análisis de datos. Los temas salen del catálogo, como en el visor.
export async function montarRailPagina({ actual = '' } = {}) {
  const ul = document.getElementById('v4-temas'), rail = document.getElementById('v4-rail');
  if (!ul || !rail) return;
  const pinta = (temas, acento) => {
    ul.innerHTML = '<li class="v4-rail__k">Por tema</li>'
      + temas.map(t => `<li><a class="v4-tema" href="visor.html?tema=${encodeURIComponent(t.id)}" style="--acento:${acento[t.id] || '#2f4a3e'}">${icono(t.id)}<span>${esc(t.rotulo)}</span></a></li>`).join('')
      + `<li class="v4-rail__k v4-rail__k--an">${esc(TITULO_ANALISIS)}</li>`
      + `<li class="v4-an"><a class="v4-tema v4-tema--mun" href="visor.html?modo=analisis" aria-label="${esc(DE_DATOS.largo)}" style="--acento:#2fa36b" title="${esc(DE_DATOS.titulo)}">${cuerpo('datos', DE_DATOS)}</a></li>`
      + enlacesAnalisis(actual);
    rail.style.setProperty('--r-filas', filasRail(temas.length, ANALISIS_RAIL.length + 1));
    trazos(ul);
  };
  try {
    const [datos, cat] = await Promise.all([import('../visor3/datos.js'), import('./catalogo.js')]);
    cat.construir(await datos.catalogo());
    const a = cat.arbol();
    // «Pueblos y fronteras» lo registra en el visor su propio módulo (no viene en el catálogo): va siempre, primero
    const hay = new Set((a && a.temas || []).map(t => t.id)), POR_MODULO = new Set(['fronteras']);
    const temas = cat.TEMAS.filter(t => hay.has(t.id) || POR_MODULO.has(t.id));
    pinta(temas.length > POR_MODULO.size ? temas : cat.TEMAS.filter(t => t.id !== 'propiedad'), ACENTO_TEMA);
  } catch (e) {
    console.error('[rail]', e);
    const { TEMAS } = await import('./catalogo.js').catch(() => ({ TEMAS: [] }));
    pinta(TEMAS.filter(t => t.id !== 'propiedad'), ACENTO_TEMA);
  }
}
