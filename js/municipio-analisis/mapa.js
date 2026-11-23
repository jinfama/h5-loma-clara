// mapa.js — el mapa de situación: Andalucía, sus 785 términos y este resaltado (y, si se pide, los que se le parecen).
import { json } from './datos.js';
import { d3, esc, alAncho } from './util.js';

let topo = null;
export async function geo() {
  if (!topo) {
    const t = await json('geo/municipios.topo.json');
    const mun = window.topojson.feature(t, t.objects.municipios).features;
    topo = {
      mun, porIne: new Map(mun.map(f => [f.properties.c, f])),
      prov: window.topojson.mesh(t, t.objects.provincias, (a, b) => a !== b),
      lineas: window.topojson.mesh(t, t.objects.municipios, (a, b) => a !== b),
      and: window.topojson.feature(t, t.objects.andalucia),
      provincias: window.topojson.feature(t, t.objects.provincias).features,
    };
  }
  return topo;
}
export async function datosMunicipio(ine) { const G = await geo(); return G.porIne.get(ine) || null; }

export async function pintarMapa(el, ine, { pares = [], claro = false, mini = false } = {}) {
  const G = await geo();
  const f = G.porIne.get(ine);
  const pinta = W => {
    const H = Math.round(W * .62);
    const pr = d3.geoMercator().fitExtent([[4, 4], [W - 4, H - 4]], G.and), path = d3.geoPath(pr);
    const col = claro
      ? { fondo: '#f4f4f1', mun: '#dcdcd6', prov: '#8c8c86', sel: '#a3412a', par: '#007a3d' }
      : { fondo: '#16493a', mun: 'rgba(255,255,255,.11)', prov: 'rgba(255,255,255,.42)', sel: '#f2c14e', par: '#7fd3a3' };
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img')
      .attr('aria-label', f ? `Situación de ${f.properties.n} en Andalucía` : 'Mapa de Andalucía');
    svg.append('path').attr('d', path(G.and)).attr('fill', col.fondo);
    if (!mini) svg.append('path').attr('d', path(G.lineas)).attr('fill', 'none').attr('stroke', col.mun).attr('stroke-width', .5);
    svg.append('path').attr('d', path(G.prov)).attr('fill', 'none').attr('stroke', col.prov).attr('stroke-width', .9);
    for (const p of pares) {
      const q = G.porIne.get(p); if (!q) continue;
      svg.append('path').attr('d', path(q)).attr('fill', col.par).append('title').text(q.properties.n);
      const [cx, cy] = path.centroid(q);
      svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 5).attr('fill', 'none').attr('stroke', col.par).attr('stroke-width', 1.4);
    }
    if (f) {
      svg.append('path').attr('d', path(f)).attr('fill', col.sel);
      const [cx, cy] = path.centroid(f);
      svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', mini ? 4.5 : 9).attr('fill', 'none').attr('stroke', col.sel).attr('stroke-width', mini ? 1.3 : 1.6);
    }
  };
  alAncho(el, pinta);
}
export { esc };
