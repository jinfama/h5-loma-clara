// Atlas Histórico de Andalucía · Relatos: lectura de las cifras. Todo sale de data/v2/visor al abrir la página.
// Si falta una cifra o deja de cumplirse algo que el texto afirma, la carga falla y la página lo dice: nunca se muestra
// un titular que los datos no sostienen.
const BASE = 'data/v2/';

export const leer = p => fetch(BASE + p).then(r => { if (!r.ok) throw new Error('sin datos: ' + p); return r.json(); });
export const valores = (ind, nivel) => leer(`visor/valores/${ind}__${nivel}.json`);
export const catalogo = () => leer('visor/indicadores.json');
export const cobertura = () => leer('visor/cobertura_municipio.json');
export const geometria = () => leer('geo/municipios.topo.json');
export const registroFuentes = () => leer('fuentes.json');

export const exige = (x, que) => {
  if (x === null || x === undefined || Number.isNaN(x)) throw new Error('falta ' + que);
  return x;
};
/** Comprueba algo que el relato afirma con palabras. */
export const afirma = (cond, que) => { if (!cond) throw new Error('el relato ya no se sostiene: ' + que); };

export const indiceAnio = (fich, anio) => {
  const i = fich.anios.indexOf(anio);
  if (i < 0) throw new Error(`falta el año ${anio} en ${fich.ind}`);
  return i;
};
/** Celda de un fichero de valores: cifra, clase y parte estimada. La cifra puede ser null (sin dato, nunca cero). */
export function celda(fich, anio, id) {
  const iy = indiceAnio(fich, anio), j = fich.ids.indexOf(id);
  if (j < 0) throw new Error(`falta ${id} en ${fich.ind}`);
  return { v: fich.v[iy][j], f: fich.f[iy][j], pe: fich.pe ? fich.pe[iy][j] : null };
}
/** [con dato, total] si la suma de ese año es parcial; null si está completa. */
export function parcial(fich, anio, id) {
  const iy = indiceAnio(fich, anio), j = fich.ids.indexOf(id);
  const p = (fich.parcial || []).find(x => x[0] === iy && x[1] === j);
  return p ? [p[2], p[3]] : null;
}

/** Fuentes de un indicador, con su título y enlace del registro del Atlas. */
export function fuentesDe(cat, reg, ids) {
  const vistos = new Map();
  ids.forEach(id => {
    const ind = cat.indicadores.find(i => i.id === id);
    (ind?.fuentes || []).forEach(k => {
      const f = reg[k];
      if (f?.titulo && !vistos.has(f.titulo)) vistos.set(f.titulo, f.url && f.url !== 'None' ? f.url : null);
    });
  });
  return [...vistos].map(([titulo, url]) => ({ titulo, url }));
}
