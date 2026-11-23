// distinto.js — «Qué lo hace distinto» (posición entre los 785 en un conjunto declarado de rasgos) y «Municipios que se
// le parecen» (distancia sobre valores estandarizados). Los rasgos se declaran aquí y se enseñan en la página.
import { transversal } from './datos.js';
import { panel, enQueDifiere, frasePos } from './panel.js';
import { d3, esc, entero, num, cifra, tip, sinTip, alAncho } from './util.js';

// conjunto con el que se mide el parecido (mismo peso cada uno)
const PARECIDO = [
  { id: 'poblacion_hab', a: 2021, r: 'Habitantes', log: true },
  { id: 'geo_altitud_mean', a: 2026, r: 'Altitud' },
  { id: 'geo_pendiente_media_10m', a: 2026, r: 'Pendiente' },
  { id: 'geo_dist_costa_punto_interior_km', a: 2026, r: 'Distancia a la costa', log1: true },
  { id: 'usos_g_tierra_de_labor_pct', a: 2020, r: 'Labor' },
  { id: 'usos_g_lenosos_pct', a: 2020, r: 'Leñosos' },
  { id: 'usos_g_monte_y_pasto_pct', a: 2020, r: 'Monte y pasto' },
  { id: 'empleo_pct_agricultura', a: 2021, r: 'Empleo agrario' },
  { id: 'empleo_pct_servicios', a: 2021, r: 'Empleo en servicios' },
  { id: 'clima_tmed', media: [1991, 2020], r: 'Temperatura' },
  { id: 'clima_prec', media: [1991, 2020], r: 'Precipitación', log: true },
];

export async function calcularDistinto(ctx) {
  const validas = (await panel(ctx)).filter(x => !x.enRevision).sort((a, b) => b.rareza - a.rareza);
  // como mucho dos por tema y un corte por indicador, para que el retrato no sea de un solo asunto
  const cuenta = {}, vistos = new Set(), elegidas = [];
  for (const x of validas) {
    if (vistos.has(x.id) || (cuenta[x.t] || 0) >= 2) continue;
    vistos.add(x.id); cuenta[x.t] = (cuenta[x.t] || 0) + 1;
    elegidas.push(x);
    if (elegidas.length === 6) break;
  }
  return { elegidas, todas: validas };
}

const fraseProp = x => frasePos(x.pos).t;

export function pintarDistinto(caja, R, ctx) {
  if (!R.elegidas.length) { caja.innerHTML = '<p class="ma-pie">No hay rasgos con dato para compararlo.</p>'; return; }
  caja.innerHTML = `<ol class="ma-tiras">${R.elegidas.map((x, k) => `
    <li class="ma-tira">
      <div class="ma-tira__txt">
        <span class="ma-tema">${esc(x.t)}</span>
        <h3>${esc(x.r)}</h3>
        <p>${cifra(`${num(x.v)} ${esc(x.u)}`, x.f)} <span class="ma-cuando">${esc(x.cuando)}</span></p>
        <p class="ma-tira__pos">${fraseProp(x)}</p>
        <p class="ma-tira__dif">${esc(enQueDifiere(x))}</p>
        ${x.aviso ? `<p class="ma-aviso-m">${esc(x.aviso)}</p>` : ''}
      </div>
      <div class="ma-tira__g" data-k="${k}"></div>
    </li>`).join('')}</ol>`;
  caja.querySelectorAll('.ma-tira__g').forEach(el => {
    const x = R.elegidas[+el.dataset.k];
    alAncho(el, w => tira(el, x, ctx, w));
  });
}

function tira(el, x, ctx, W) {
  const H = 62, mx = 8, ids = ctx.P.ine, nombres = ctx.P.nombres;
  const pares = x.C.v.map((v, i) => (v == null ? null : { v, i })).filter(Boolean);
  const ord = pares.map(p => p.v).sort(d3.ascending);
  const lo = d3.quantile(ord, .005), hi = d3.quantile(ord, .995);
  const pos = x.log && lo > 0;
  const esc0 = (pos ? d3.scaleLog() : d3.scaleLinear()).domain([lo, hi === lo ? lo + 1 : hi]).range([mx, W - mx]).clamp(true);
  // reparto vertical repetible: cada municipio tiene su altura por su posición en la lista
  const yj = i => 12 + ((i * 2654435761) >>> 0) % 997 / 997 * 26;
  el.innerHTML = '';
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img')
    .attr('aria-label', `${x.r}: posición de ${ctx.nombre} entre todos los municipios`);
  svg.append('path').attr('d', pares.map(p => `M${esc0(p.v).toFixed(1)},${yj(p.i).toFixed(1)}h0`).join('')).attr('stroke', '#101010').attr('stroke-opacity', .26).attr('stroke-width', 3.2).attr('stroke-linecap', 'round').attr('fill', 'none');
  if (x.and) svg.append('line').attr('x1', esc0(x.and.v)).attr('x2', esc0(x.and.v)).attr('y1', 6).attr('y2', 44).attr('stroke', '#101010').attr('stroke-width', 1.6);
  const X = esc0(x.v);
  svg.append('line').attr('x1', X).attr('x2', X).attr('y1', 3).attr('y2', 44).attr('stroke', '#a3412a').attr('stroke-width', 1.6);
  svg.append('circle').attr('cx', X).attr('cy', yj(ctx.i)).attr('r', 5.4).attr('fill', '#a3412a').attr('stroke', '#fff').attr('stroke-width', 1.5);
  svg.append('text').attr('x', mx).attr('y', H - 4).attr('class', 'ma-eje-t').text(num(lo));
  svg.append('text').attr('x', W - mx).attr('y', H - 4).attr('text-anchor', 'end').attr('class', 'ma-eje-t').text(num(hi));
  const anillo = svg.append('circle').attr('r', 4).attr('fill', 'none').attr('stroke', '#007a3d').attr('stroke-width', 1.6).style('display', 'none');
  const cerca = (px, py) => { let m = null, dm = 1e9; for (const p of pares) { const d = (esc0(p.v) - px) ** 2 + (yj(p.i) - py) ** 2; if (d < dm) { dm = d; m = p; } } return m; };
  svg.append('rect').attr('width', W).attr('height', 46).attr('fill', 'transparent').style('cursor', 'pointer')
    .on('pointermove', ev => {
      const [px, py] = d3.pointer(ev), p = cerca(px, py);
      if (!p) return;
      anillo.attr('cx', esc0(p.v)).attr('cy', yj(p.i)).style('display', null);
      tip(`<b>${esc(nombres[p.i])}</b> · ${num(p.v)} ${esc(x.u)}`, ev);
    })
    .on('pointerleave', () => { anillo.style('display', 'none'); sinTip(); })
    .on('click', ev => { const [px, py] = d3.pointer(ev), p = cerca(px, py); if (p) location.href = `analisis-municipio.html?ine=${ids[p.i]}`; });
}

// ---------------------------------------------------------------- municipios que se le parecen
export async function calcularParecidos(ctx) {
  const ids = ctx.P.ine, n = ids.length;
  const cols = await Promise.all(PARECIDO.map(async r => {
    const T = await transversal(r, ids);
    const t = T.v.map(v => { if (v == null) return null; if (r.log) return v > 0 ? Math.log10(v) : null; if (r.log1) return Math.log10(1 + v); return v; });
    const xs = t.filter(v => v != null), me = d3.mean(xs), de = d3.deviation(xs) || 1;
    return { r, z: t.map(v => (v == null ? null : (v - me) / de)) };
  }));
  const mio = cols.map(c => c.z[ctx.i]);
  if (mio.some(v => v == null)) return { lista: [], rasgos: PARECIDO };
  const lista = [];
  for (let j = 0; j < n; j++) {
    if (j === ctx.i) continue;
    let s = 0, ok = true; const dif = [];
    for (let c = 0; c < cols.length; c++) {
      const z = cols[c].z[j];
      if (z == null) { ok = false; break; }
      const d = z - mio[c]; s += d * d; dif.push(Math.abs(d));
    }
    if (ok) lista.push({ j, d: Math.sqrt(s / cols.length), dif });
  }
  lista.sort((a, b) => a.d - b.d);
  return { lista: lista.slice(0, 6), rasgos: PARECIDO };
}

export function pintarParecidos(caja, R, ctx, PROV) {
  if (!R.lista.length) { caja.innerHTML = '<p class="ma-pie">A este municipio le falta alguno de los rasgos con que se mide el parecido.</p>'; return; }
  const col = d3.scaleLinear().domain([0, .5, 1.6]).range(['#e7f1ea', '#7fb898', '#0f3b2c']).clamp(true);
  const nombres = R.rasgos.map(x => x.r);
  caja.innerHTML = `<ol class="ma-pares">${R.lista.map(x => {
    const orden = x.dif.map((d, k) => [d, k]).sort((a, b) => a[0] - b[0]);
    const igual = orden.slice(0, 2).map(q => nombres[q[1]].toLowerCase());
    const aparta = orden[orden.length - 1];
    return `<li><a class="ma-par" href="analisis-municipio.html?ine=${ctx.P.ine[x.j]}">
      <span class="ma-par__n">${esc(ctx.P.nombres[x.j])}</span>
      <span class="ma-par__p">${esc(PROV[ctx.P.ine[x.j].slice(0, 2)])}</span>
      <span class="ma-firma" aria-hidden="true">${x.dif.map((d, k) => `<i style="background:${col(d)}" title="${esc(nombres[k])}"></i>`).join('')}</span>
      <span class="ma-par__t">Más cerca en ${esc(igual.join(' y '))}; se aparta más en ${esc(nombres[aparta[1]].toLowerCase())}.</span>
    </a></li>`;
  }).join('')}</ol>
  <p class="ma-pie">Cada casilla es un rasgo, en este orden: ${esc(nombres.join(', ').toLowerCase())}. Clara, casi igual; oscura, muy distinta. Parecerse en estos rasgos no indica ninguna relación histórica entre los municipios.</p>`;
}
export const rasgosParecido = () => PARECIDO.map(x => x.r);
