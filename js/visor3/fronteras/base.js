// base.js — datos de fronteras compartidos por el indicador (js/visor3/fronteras/) y la ficha (js/visor3/ficha/).
// Reutiliza los lectores de js/fronteras/datos.js (esquema de docs/v2/DATOS.md). Solo lectura, con caché.

import { cargarSiHay } from '../../atlas2/data.js';
import { cargarFuentes } from '../../atlas2/fuentes.js';
import { cargarConteo, cargarHoy, cargarCorte, cargarNucleos, cargarHistoria } from '../../fronteras/datos.js';

let BASE = null;

/* { manifest, hay(ruta), hoy, conteo, cortes, nucleos, historia(), corte(c) } */
export function base() {
  if (!BASE) {
    BASE = (async () => {
      const manifest = await cargarSiHay('MANIFEST.json');
      const fich = (manifest && (manifest.ficheros || manifest.files)) || {};
      const hay = ruta => Object.prototype.hasOwnProperty.call(fich, ruta);
      const [hoy, conteo] = await Promise.all([
        cargarHoy(),
        hay('fronteras/conteo.json') ? cargarConteo().catch(() => []) : [],
        hay('fuentes.json') ? cargarFuentes() : null,
      ]);
      const conGeo = Object.keys(fich).map(k => (/^geo\/terminos\/(.+)\.topo\.json$/.exec(k) || [])[1]).filter(Boolean);
      const ord = c => (c === 'hoy' ? 9999 : +c);
      let cortes = conteo.length ? conteo.map(r => r.corte) : conGeo.slice().sort((a, b) => ord(a) - ord(b));
      if (conGeo.length) cortes = cortes.filter(c => conGeo.includes(c));
      const nucleos = hay('geo/nucleos.json') ? await cargarNucleos().catch(() => new Map()) : new Map();
      let hist = null;
      const avisos1752 = hay('series/avisos_1752.json') ? await cargarSiHay('series/avisos_1752.json') : null;
      return {
        manifest, hay, hoy, conteo, cortes, nucleos, avisos1752,
        avisoUnidad: u => (avisos1752 && (avisos1752.avisos || []).find(a => a.ue === u)) || null,
        historia: () => (hist = hist || (hay('fronteras/historia.json') ? cargarHistoria().catch(() => new Map()) : Promise.resolve(new Map()))),
        corte: c => cargarCorte(c, hoy),
      };
    })();
    BASE.catch(() => { BASE = null; });
  }
  return BASE;
}

export const PRE1842 = c => c !== 'hoy' && +c < 1842;   // 1591, 1752 y 1787: en revisión, límites supuestos
export const anioDeCorte = c => (c === 'hoy' ? 'hoy' : +c);
export const corteDeAnio = (anio, cortes) => {
  if (anio == null) return cortes[cortes.length - 1];
  if (String(anio) === 'hoy') return 'hoy';
  const y = +String(anio).match(/\d{4}/)?.[0];
  const nums = cortes.filter(c => c !== 'hoy').map(Number);
  if (!isFinite(y)) return cortes[cortes.length - 1];
  if (y > Math.max(...nums) && cortes.includes('hoy')) return 'hoy';
  let v = String(nums[0]);
  for (const c of nums) if (c <= y) v = String(c);
  return v;
};
