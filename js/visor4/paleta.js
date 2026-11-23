// paleta.js — colores propios del visor v4 (Andalucía: cal, almagre, albero, olivo, azulejo, pizarra).
// Sustituye, solo dentro del visor, las rampas de js/timelapses/escalas.js (que usan el motor y los temas) y la paleta
// cualitativa de las vistas. Todas las rampas van de claro a oscuro con luminosidad monótona (interpoladas en Lab).

/* global d3 */
import { RAMPAS, DIVERGENTES, CAT_USOS } from '../timelapses/escalas.js';
import { PALETA } from '../visor3/vistas/comun.js';
import { usarRampaDe } from '../visor3/escala.js';

const lab = stops => d3.piecewise(d3.interpolateLab, stops);

// rampas secuenciales, sobrias (sin arcoíris ni magma)
export const R4 = {
  almagre: lab(['#f5efe3', '#ead2b8', '#d9a885', '#bd7656', '#8f4632', '#57261b']),   // población
  olivo:   lab(['#f3f1df', '#dcdbaa', '#b0b672', '#7b8c43', '#4c6331', '#283b20']),   // olivar, usos
  albero:  lab(['#f7f0db', '#eed99d', '#dcb45c', '#b88531', '#83591e', '#4b3313']),   // labor, cereal
  vino:    lab(['#f5e9ea', '#e1c0c6', '#c38d9a', '#9b5a6c', '#6b3246', '#3e1727']),   // viña
  azulejo: lab(['#edf2f4', '#c0d3de', '#8aadc3', '#5784a3', '#305b7b', '#183652']),   // agua, regadío
  monte:   lab(['#edf1e8', '#c4d5bd', '#91b28b', '#5f8a63', '#375f45', '#1c3a2c']),   // monte, pasto
  cuero:   lab(['#f4ede3', '#ddc8ab', '#bf9d75', '#95714d', '#674b31', '#3c2b1c']),   // ganado
  pizarra: lab(['#ebf0ef', '#c1d3d1', '#8db0ae', '#5a8a8b', '#356567', '#1b4145']),   // trabajo
  tierra:  lab(['#f3f1ea', '#dcd5c2', '#b8ad8f', '#8d8164', '#615844', '#38332a']),   // geografía
};

export function aplicarPaleta() {
  Object.assign(RAMPAS, {
    poblacion: R4.almagre, olivar: R4.olivo, aceite: R4.olivo, labor: R4.albero, cereal: R4.albero,
    vina: R4.vino, vino: R4.vino, regadio: R4.azulejo, monte: R4.monte, ganado: R4.cuero, trabajo: R4.pizarra,
  });
  // divergentes: azulejo ↔ cal ↔ almagre (temperatura); tierra seca ↔ cal ↔ azulejo (lluvia)
  DIVERGENTES.temperatura = lab(['#1f4a6b', '#6f98b4', '#c9d8de', '#f4f1ea', '#e7c3a8', '#c27755', '#8c3a26']);
  DIVERGENTES.lluvia = lab(['#6b4a1f', '#b08a52', '#e2d2ad', '#f4f1ea', '#a9c9cf', '#4f8ea0', '#1f5367']);
  Object.assign(CAT_USOS, {
    olivar: '#6f7f3a', labor: '#d6ad55', cereal: '#d6ad55', 'viña': '#8a4a5e', vina: '#8a4a5e', monte: '#3d6b4f', forestal: '#3d6b4f',
    dehesa: '#a98a5c', pastos: '#c4ab7c', prados: '#c4ab7c', regadio: '#4f7fa3', 'regadío': '#4f7fa3', frutales: '#b8664a',
    huerta: '#5f9a8e', improductivo: '#77706a', otros: '#8f8499',
  });
  // series de las vistas (Líneas, Ranking…): diez tonos distinguibles sobre cal, ninguno gris claro
  PALETA.splice(0, PALETA.length, '#1f5f8b', '#a3412a', '#4e7d3a', '#b8861b', '#6b4c8a', '#2c7b78', '#8a5a3c', '#b0587a', '#4b5560', '#7f8f2e');
  usarRampaDe(rampaDe);
}

const CLIMA = {
  temp: t => d3.interpolateYlOrRd(0.04 + 0.96 * t),
  lluvia: t => d3.interpolateBlues(0.06 + 0.94 * t),
  tempDiv: t => d3.interpolateRdBu(1 - t),
  lluviaDiv: t => d3.interpolateBrBG(t),
};

// rampa de cada indicador, por lo que mide (no por el fichero del que sale)
const POR_MIEMBRO = [
  [/olivar|aceite|olivo/, 'olivo'], [/vina|viña|vino|uva|pasa/, 'vino'], [/regad|huerta|hortaliza/, 'azulejo'],
  [/monte|dehesa_pasto|pasto|forraje/, 'monte'], [/labor|cereal|trigo|cebada|centeno|ma[ií]z|leguminosa|habas/, 'albero'],
  [/dehesa|frutal|fruta|higo/, 'cuero'], [/inculto|no_agrario|sin_clasificar|otro|industrial|c[aá][nñ]amo|lino|zumaque/, 'tierra'],
];
export function rampaDe(ent, tipo) {
  if (ent.frente) return t => d3.interpolatePRGn(t);   // frente a Andalucía: morado por debajo, verde por encima, centro claro
  if (ent.cambio) return t => d3.interpolateRdBu(t);   // cambio respecto a un año: pierde en rojo, gana en azul
  const id = String(ent.id || ''), t = ent.tema_origen || ent.tema || '', fam = ent.familia || '';
  const lluvia = /prec|lluvia|spi|sequ/.test(id);
  // clima (ronda v15): temperatura, de amarillo pálido a rojo hondo; lluvia, azules; anomalías de temperatura, azul ↔ blanco
  // ↔ rojo; anomalías de lluvia y SPI, marrón ↔ blanco ↔ verdeazulado (BrBG); el centro, siempre neutro
  if (tipo === 'divergente') return lluvia ? CLIMA.lluviaDiv : CLIMA.tempDiv;
  if (/^clima/.test(id) || t === 'clima') return lluvia ? CLIMA.lluvia : CLIMA.temp;
  if (/^pob/.test(id) || t === 'poblacion') return R4.almagre;
  if (/^ganado/.test(fam) || /^ganado/.test(id)) return R4.cuero;
  if (/^empleo/.test(id) || t === 'trabajo' || t === 'empleo') return R4.pizarra;
  if (/^geo_/.test(id) || t === 'geografia') return /rio|fluvial|costa/.test(id) ? R4.azulejo : /suelo/.test(id) ? R4.cuero : R4.tierra;
  if (/^fronteras/.test(id) || t === 'fronteras' || t === 'territorio') return R4.vino;
  if (t === 'politica' || t === 'elecciones' || /^elec|^voto|^partic/.test(id)) return R4.azulejo;
  if (t === 'propiedad' || /^prop/.test(id)) return R4.albero;
  const clave = `${ent.miembro || ''} ${ent.grupo_origen || ''} ${id}`;
  for (const [re, r] of POR_MIEMBRO) if (re.test(clave)) return R4[r];
  return null;
}

// acento de cada tema (el que marca el tema activo, la cifra y la barra de tiempo)
// vive en acentos.js para que la barra de temas lo use fuera del visor sin cargar las escalas (que piden d3)
export { ACENTO_TEMA } from './acentos.js';
