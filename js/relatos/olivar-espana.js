// Atlas Histórico de Andalucía · Relato del olivar: paso de España, preparado y APAGADO.
//
// Mientras `ESPANA.fichero` sea null, este módulo no añade nada a la página. Para encenderlo, cuando la serie esté lista:
//   1. Poner en `fichero` su ruta dentro de data/v2/ y en `id` el identificador de España en ese fichero.
//   2. Poner en `fuente` la cita en llano y en `url` su enlace.
// El fichero debe tener el formato de los ficheros de valores del visor: { ind, ids, anios, v, f } y, si la hay, `parcial`.
// El paso aparece solo, entre «Dónde está hoy» y «Andalucía en el mundo», y compara únicamente los años comunes.
import { d3, COLOR, N, pct, vis, txt, tip, ejeX, ejeY, punto, tipoDeClase, textoClase, leyenda } from './util.js';
import { leer, exige, afirma } from './datos.js';

export const ESPANA = { fichero: null, id: null, fuente: '', url: '' };

/** Lee la serie de España. Devuelve null mientras el paso esté apagado. */
export async function cargarEspana(serieAndalucia, K) {
  if (!ESPANA.fichero) return null;
  const fich = await leer(ESPANA.fichero);
  const j = fich.ids.indexOf(ESPANA.id);
  afirma(j >= 0, 'España en su fichero');
  const serie = fich.anios.map((y, i) => ({
    y, v: fich.v[i][j], f: fich.f[i][j],
    par: (fich.parcial || []).some(x => x[0] === i && x[1] === j),
  })).filter(q => q.v !== null);
  const comunes = serie.filter(q => serieAndalucia.some(a => a.y === q.y)).map(q => {
    const a = serieAndalucia.find(s => s.y === q.y);
    return { y: q.y, esp: q.v, and: a.v, parte: 100 * a.v / q.v, parcial: q.par || !!a.par };
  });
  afirma(comunes.some(c => c.y <= 2007), 'años comunes con España hasta 2007');
  afirma(comunes.every(c => c.parte <= 100), 'Andalucía no supera a España');
  serie.forEach(q => { K[`esp.${q.y}`] = q.v; });
  comunes.forEach(c => { K[`esp.parte.${c.y}`] = c.parte; });
  return { serie, comunes };
}

export const escenaEspana = {
  id: 'espana', titulo: 'Andalucía dentro de España',
  pasos: D => {
    // En 2020 la clase de olivar cambia de contenido: la comparación entre fechas se queda en las de hasta 2007
    const c = D.espana.comunes.filter(q => q.y <= 2007), ini = c[0], fin = c[c.length - 1];
    const de2020 = D.espana.comunes.find(q => q.y === 2020);
    return [
      `<p class="rl-pre">Paso {{paso}}</p><h2>En ${fin.y}, Andalucía reúne el ${pct(fin.parte)} del olivar de España</h2>
       <p>En ${ini.y} era el <b>${pct(ini.parte)}</b>${ini.parcial ? ', con una suma parcial' : ''}. La comparación se hace solo en los años con cifra en las dos series.</p>
       ${de2020 ? `<p class="rl-nota">En 2020, el ${pct(de2020.parte)}; en esa fecha la clase andaluza ya lleva el olivar regado y no se compara con las anteriores.</p>` : ''}`,
    ];
  },
  alt: (s, D) => {
    const c = D.espana.comunes.filter(q => q.y <= 2007), fin = c[c.length - 1];
    return `Superficie de olivar en España y Andalucía. En ${fin.y}, Andalucía reúne el ${pct(fin.parte)}.`;
  },
  fuente: () => ESPANA.fuente,
  dibuja({ g, html, w, h, D, compacto }) {
    leyenda(html, [{ bg: COLOR.medio, t: 'España' }, { bg: COLOR.verde, t: 'Andalucía' }]);
    const top = compacto ? 32 : 40, b = 24;
    const todos = [...D.espana.serie, ...D.serie];
    const x = d3.scaleLinear(d3.extent(todos, q => q.y), [8, w - (compacto ? 24 : 44)]);
    const y = d3.scaleLinear([0, d3.max(todos, q => q.v) * 1.1], [h - b, top]);
    ejeY(g, y, 0, w, y.ticks(4).filter(v => v > 0), v => `${N(v / 1e6, 1)} M ha`);
    ejeX(g, x, h - b, x.ticks(compacto ? 4 : 7).map(Math.round));
    const lin = d3.line().x(q => x(q.y)).y(q => y(q.v));
    g.append('path').datum(D.espana.serie).attr('fill', 'none').attr('stroke', COLOR.medio).attr('stroke-width', 2.2).attr('d', lin);
    g.append('path').datum(D.serie).attr('fill', 'none').attr('stroke', COLOR.verde).attr('stroke-width', 2.2).attr('d', lin);
    const pts = g.append('g');
    D.espana.serie.forEach(q => punto(pts, x(q.y), y(q.v), q.par ? 'est' : tipoDeClase(q.f), compacto ? 3 : 3.8));
    tip(g.append('g').selectAll('circle').data(D.espana.serie).join('circle').attr('class', 'hit')
      .attr('cx', q => x(q.y)).attr('cy', q => y(q.v)).attr('r', 10),
    q => `<b>España, ${q.y}</b>${N(exige(q.v, 'España'))} ha · ${q.par ? 'suma parcial' : textoClase(q.f)}`);
    vis(g.append('g'), 1);
    const hasta07 = D.espana.comunes.filter(q => q.y <= 2007), fin = hasta07[hasta07.length - 1];
    txt(g, x(fin.y), y(fin.esp) - 10, `${pct(fin.parte)} en ${fin.y}`, 't-num t-halo', 'end');
  },
};
