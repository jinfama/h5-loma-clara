// geografia.js — su terreno entre los 785: cada rasgo con su cifra y su posición.
import { transversal } from './datos.js';
import { esc, num, cifra, entero } from './util.js';

const RASGOS = [
  { id: 'geo_altitud_mean', a: 2026, r: 'Altitud media', u: 'm', alto: 'más alto', bajo: 'más bajo' },
  { id: 'geo_pendiente_media_10m', a: 2026, r: 'Pendiente media', u: '%', alto: 'más abrupto', bajo: 'más llano' },
  { id: 'geo_rugosidad_vrm_media_10m', a: 2026, r: 'Rugosidad del relieve', u: 'índice 0-1', alto: 'más rugoso', bajo: 'más liso' },
  { id: 'geo_dist_costa_punto_interior_km', a: 2026, r: 'Distancia a la costa', u: 'km', alto: 'más lejos', bajo: 'más cerca' },
  { id: 'geo_dist_rio_principal_punto_interior_km', a: 2026, r: 'Distancia al río principal', u: 'km', alto: 'más lejos', bajo: 'más cerca' },
  { id: 'geo_densidad_red_fluvial', a: 2026, r: 'Densidad de la red fluvial', u: 'km/km²', alto: 'más densa', bajo: 'menos densa' },
  { id: 'geo_suelo_ph_agua_0_30', a: 2026, r: 'pH del suelo', u: 'pH', alto: 'más alto', bajo: 'más bajo' },
  { id: 'geo_suelo_arcilla_0_30', a: 2026, r: 'Arcilla del suelo', u: '%', alto: 'más arcilla', bajo: 'menos arcilla' },
  { id: 'geo_suelo_carbono_organico_0_30', a: 2026, r: 'Carbono orgánico del suelo', u: 'g/kg', alto: 'más carbono', bajo: 'menos carbono' },
];

export async function prepararGeografia(ctx) {
  const filas = await Promise.all(RASGOS.map(async r => {
    const T = await transversal(r, ctx.P.ine), v = T.v[ctx.i];
    if (v == null) return null;
    const xs = T.v.filter(x => x != null);
    const bajo = xs.filter(x => x < v).length, igual = xs.filter(x => x === v).length;
    return { ...r, v, f: T.f[ctx.i], p: (bajo + igual / 2) / xs.length * 100, n: xs.length };
  }));
  return filas.filter(Boolean);
}

export function textoGeografia(G) {
  const alt = G.find(x => x.id === 'geo_altitud_mean'), cos = G.find(x => x.id === 'geo_dist_costa_punto_interior_km');
  const t = [];
  if (alt) t.push(`<p>Su altitud media es de ${cifra(`${entero(alt.v)} m`, alt.f)}: más alto que el ${entero(Math.floor(alt.p))} % de los municipios andaluces.</p>`);
  if (cos) t.push(`<p>Su punto interior está a ${cifra(`${num(cos.v)} km`, cos.f)} de la costa.</p>`);
  return t.join('');
}

export function pintarGeografia(caja, G) {
  caja.innerHTML = `<ul class="ma-geo">${G.map(x => `<li>
    <span class="ma-geo__r">${esc(x.r)}</span>
    <span class="ma-geo__v">${cifra(`${num(x.v)} <small>${esc(x.u)}</small>`, x.f)}</span>
    <span class="ma-geo__b" role="img" aria-label="Posición ${entero(x.p)} de 100 entre los municipios"><i style="left:${x.p}%"></i></span>
    <span class="ma-geo__e"><span>${esc(x.bajo)}</span><span>${esc(x.alto)}</span></span>
  </li>`).join('')}</ul>
  <p class="ma-pie">La marca sitúa al municipio entre los ${entero(G[0] ? G[0].n : 785)} de Andalucía, ordenados de menor a mayor. Son rasgos del terreno de hoy; las cifras de suelo son estimadas.</p>`;
}
