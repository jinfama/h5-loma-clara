// caminos.js — sus vías por épocas. Cada fecha mide una red distinta, con su fuente: no es una serie y no se une.
import { valores, celda, motivoDe } from './datos.js';
import { esc, num, cifra } from './util.js';

const REDES = [
  { id: 'tra_serie_dist_vias', r: 'Distancia a la vía principal de cada época', u: 'km' },
  { id: 'tra_serie_km_vias', r: 'Kilómetros de vía dentro de su término', u: 'km' },
  { id: 'tra_serie_dist_puertos', r: 'Distancia al puerto', u: 'km' },
];

export async function prepararCaminos(ctx) {
  return Promise.all(REDES.map(async R => {
    const d = await valores(R.id), c = ctx.cat.get(R.id) || {}, et = c.etiquetas_anio || {};
    const fechas = d.anios.map(a => {
      const q = celda(d, ctx.ine, a), nota = String((d.notas_anio || {})[a] || '');
      return { a: +a, rot: et[a] || String(a), que: nota.includes(':') ? nota.split(':').slice(1).join(':').trim() : '', v: q.v, f: q.f, motivo: q.v == null ? motivoDe(d, ctx.ine, a) : '' };
    });
    return { ...R, fechas };
  }));
}

export function textoCaminos(D) {
  const v = D[0], fr = v.fechas.filter(x => x.v != null).map(x => {
    const q = x.que || 'vía', art = /^(calzada|carretera)/i.test(q) ? 'una' : 'un', fin = /^\d{4}$/.test(x.rot) ? ` de ${x.rot}` : '';
    return `${x.v < .05 ? 'menos de 0,1 km' : cifra(`${num(x.v)} km`, x.f)} de ${art} ${esc(q)}${fin}`;
  });
  const t = [];
  if (fr.length) t.push(`<p>Su capital de hoy queda a ${fr.length > 1 ? `${fr.slice(0, -1).join(', a ')} y a ${fr[fr.length - 1]}` : fr[0]}.</p>`);
  t.push('<p class="ma-cautela">Cada fecha es una red distinta: no se leen como una evolución.</p>');
  return t.join('');
}

export function pintarCaminos(caja, D) {
  caja.innerHTML = `${D.map(R => `<div class="ma-red"><h3 class="ma-h3">${esc(R.r)}</h3><ul class="ma-epocas">${R.fechas.map(x => `<li class="${x.v == null ? 'is-vacia' : ''}">
    <span class="ma-epocas__r">${esc(x.rot)}</span>
    <span class="ma-epocas__v">${x.v == null ? 'Sin cifra' : cifra(`${num(x.v)} <small>${esc(R.u)}</small>`, x.f)}</span>
    <span class="ma-epocas__q">${esc(x.v == null ? x.motivo : x.que)}</span>
  </li>`).join('')}</ul></div>`).join('')}
  <p class="ma-pie">Distancias en línea recta desde el punto de la capital de hoy: no son tiempo de viaje ni accesibilidad.</p>`;
}
