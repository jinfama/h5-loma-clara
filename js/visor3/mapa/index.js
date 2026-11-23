// mapa/index.js — desde el visor v4 (19-nov-2026) la vista Mapa vive en js/visor4/mapa.js. Este fichero solo
// reexporta su API (`mapa`) para los módulos que la importaban de aquí (fronteras, ficha). La versión del v3, con su
// maquetación, queda en el historial de Git de la rama visor-v2-20261119.
export { mapa } from '../../visor4/mapa.js';
