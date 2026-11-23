// huella.js — en qué destaca: para cada indicador, su valor, Andalucía, su provincia, la mediana de los municipios y una
// frase con su barra («más que el 82 % de los municipios»).
import { TEMAS, enQueDifiere, puestoTxt, frasePos } from './panel.js';
import { esc, num, cifra } from './util.js';

const ref = c => (c ? cifra(num(c.v), c.f) : '<span class="ma-nd" title="Este indicador no tiene esa cifra">—</span>');

// la barra enseña exactamente la parte de municipios que dice la frase
export function barraPos(p) {
  const F = frasePos(p);
  return `<span class="ma-pb"><span class="ma-pb__t">${F.t}</span><span class="ma-pb__b" aria-hidden="true"><i class="ma-pb__i ma-pb__i--${F.lado}" style="width:${F.w}%"></i></span><span class="ma-pb__p">${puestoTxt(p)}</span></span>`;
}

export function filaTabla(x) {
  return `<tr>
    <th scope="row"><span class="ma-t-n">${esc(x.r)}</span><span class="ma-t-d">${esc(x.cuando)} · ${esc(x.u)}</span>${x.aviso ? `<span class="ma-t-a">${esc(x.aviso)}</span>` : ''}</th>
    <td data-r="Este municipio" class="ma-t-v">${cifra(num(x.v), x.f)}</td>
    <td data-r="Andalucía">${ref(x.and)}</td>
    <td data-r="Su provincia">${ref(x.prov)}</td>
    <td data-r="Mediana de municipios">${x.med == null ? '—' : num(x.med)}</td>
    <td data-r="Entre los municipios" class="ma-t-pos">${x.pos ? barraPos(x.pos) : '<span class="ma-t-a">Sin puesto hasta terminar el cotejo</span>'}</td>
    <td data-r="En qué se diferencia" class="ma-t-q">${x.enRevision ? 'No se compara hasta terminar el cotejo' : esc(enQueDifiere(x)) || 'Sin cifra con la que compararlo'}</td>
  </tr>`;
}

export function tablaComparada(filas) {
  return `<div class="ma-tabla-w"><table class="ma-tabla"><thead><tr><th scope="col">Indicador</th><th scope="col">Este municipio</th><th scope="col">Andalucía</th><th scope="col">Su provincia</th><th scope="col">Mediana de municipios</th><th scope="col">Entre los municipios</th><th scope="col">En qué se diferencia</th></tr></thead><tbody>${filas.map(filaTabla).join('')}</tbody></table></div>`;
}

export function pintarHuella(caja, filas) {
  const temas = TEMAS.filter(t => filas.some(x => x.t === t));
  let tema = '', todas = false;
  caja.innerHTML = `<div class="ma-huella">
      <div class="ma-hd"></div>
      <div class="ma-ht">
        <h3 class="ma-h3">Indicador por indicador</h3>
        <div class="ma-chips" role="group" aria-label="Filtrar por tema"><button type="button" data-tema="" aria-pressed="true">Lo que más lo distingue</button>${temas.map(t => `<button type="button" data-tema="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>
        <div class="ma-ht__t"></div>
        <button type="button" class="ma-ver-mas" hidden></button>
      </div>
    </div>`;
  const cuerpo = caja.querySelector('.ma-ht__t'), mas = caja.querySelector('.ma-ver-mas');
  const pinta = () => {
    const base = tema ? filas.filter(x => x.t === tema) : [...filas].filter(x => todas || !x.enRevision).sort((a, b) => b.rareza - a.rareza);
    const lim = tema || todas ? base.length : 10;
    cuerpo.innerHTML = tablaComparada(base.slice(0, lim));
    mas.hidden = !!tema;
    mas.textContent = todas ? 'Ver solo los 10 que más lo distinguen' : `Ver los ${filas.length} indicadores`;
  };
  caja.querySelectorAll('[data-tema]').forEach(b => b.addEventListener('click', () => {
    tema = b.dataset.tema;
    caja.querySelectorAll('[data-tema]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    pinta();
  }));
  mas.addEventListener('click', () => { todas = !todas; pinta(); });
  pinta();
}
