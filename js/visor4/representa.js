// representa.js — «Representación» del mapa (ronda v8): coropletas, burbujas proporcionales y relieve por dato.
// · Burbujas (ronda v22): en todos los indicadores con cifra (fuera, las categorías). Un círculo por unidad, en su centro,
//   con área proporcional a la cifra; con negativos, al valor absoluto, y el color dice el signo. El tamaño máximo es el
//   del eje entero, para comparar años.
// · Relieve 3D: cada unidad levantada en proporción a su cifra; el color, el de la escala elegida (js/visor4/relieve3d.js).
// Ninguna de las dos inventa nada: leen la misma cifra de cada celda que las coropletas, con su clase.

/* global d3 */
import { token } from '../atlas2/fmt.js';
import { esCategorico } from '../visor3/escala.js';

export const REPS = [
  ['coro', 'Coropletas', 'Cada unidad, del color de su cifra'],
  ['burbujas', 'Burbujas', 'Un círculo por unidad; su área es proporcional a la cifra'],
  ['relieve', 'Relieve 3D', 'Cada unidad levantada según su cifra; arrastra para girar e inclinar'],
];

const divergente = (ent, prov, nivel) => {
  const cat = typeof ent.escala === 'string' ? ent.escala : (ent.escala && ent.escala.tipo) || '';
  if (cat === 'divergente') return true;
  try { const e = prov && prov.escala ? prov.escala(nivel) : null; return !!(e && e.tipo === 'divergente'); } catch (er) { return false; }
};

// por qué no se puede (texto llano) o '' si se puede
export function motivoNo(rep, ent, prov, nivel) {
  if (!rep || rep === 'coro') return '';
  if (!ent || ent.proveedor || ent.mensual || ent.capaBase || /^capa_/.test(ent.id)) return 'Solo para indicadores con una cifra por unidad.';
  if (prov && prov.sinNivel && prov.sinNivel(nivel)) return 'Este indicador no tiene dato a este nivel.';
  if (esCategorico(ent)) return 'Es una categoría (por ejemplo, quién ganó), no una cifra: se ve en colores.';
  if (rep === 'relieve' && /^elec_/.test(ent.id)) return 'En elecciones, el relieve no aporta.';
  // burbujas y relieve, solo con cantidades o medidas que crecen desde cero
  const u = String(ent.unidad || '');
  if (/^a[ñn]o\b/i.test(u) || /_anio_/.test(ent.id)) return 'Es una fecha, no una cantidad: se ve por periodos.';
  if (/^[íi]ndice|^pH$|°C/i.test(u)) return 'Es un índice o una escala sin cero real: el tamaño no significaría nada.';
  if (rep === 'burbujas') {
    if (divergente(ent, prov, nivel)) return 'Va por encima y por debajo de un valor central: el tamaño de un círculo no lo diría.';
    let sg = null; try { sg = prov && prov.signoDe ? prov.signoDe(nivel) : null; } catch (e) { sg = null; }
    if (sg && sg.neg) return 'Tiene cifras negativas: las burbujas son para cantidades positivas.';
  }
  if (rep === 'relieve') { let sg = null; try { sg = prov && prov.signoDe ? prov.signoDe(nivel) : null; } catch (e) { sg = null; } if (sg && sg.neg) return 'El relieve necesita cifras que crecen desde cero; aquí hay cifras negativas.'; }
  if (rep === 'relieve' && divergente(ent, prov, nivel)) return 'El relieve necesita cifras que crecen desde cero; esta escala va por encima y por debajo de la media.';
  return '';
}
export function repEfectiva(rep, ent, prov, nivel) {
  return (rep === 'burbujas' || rep === 'relieve') && !motivoNo(rep, ent, prov, nivel) ? rep : 'coro';
}

// color de las burbujas: el tono fuerte de la rampa del indicador
export function colorBurbuja(esc) {
  if (!esc || !esc.escala || !esc.dominio) return token('--v4-tinta') || '#101010';
  const [lo, hi] = esc.dominio;
  const v = esc.log ? lo * Math.pow(hi / Math.max(lo, 1e-9), 0.8) : lo + (hi - lo) * 0.8;
  try { return esc.color(v); } catch (e) { return '#101010'; }
}

// con cifras negativas: un color para cada signo (los extremos de las clases del indicador si van a los dos lados)
export function coloresSigno(esc) {
  const pos = colorBurbuja(esc);
  const cl = esc && esc.clases;
  if (cl && cl.length > 1 && cl[0].hasta != null && cl[0].hasta <= 0) {
    const ultima = cl[cl.length - 1];
    return { pos: ultima.desde != null && ultima.desde > 0 ? ultima.color : '#2166ac', neg: cl[0].color };
  }
  return { pos, neg: '#b2182b' };
}

// radio máximo según el número de unidades y el tamaño del mapa
// suma: el mayor Σ(cifra / máximo) de un año. Con ella, los círculos nunca cubren más de ~28 % de Andalucía en ninguna fecha
export function radioMaximo(nUnidades, w, h, suma = null) {
  const k = Math.min(w, h * 2.05) / 2.05;   // alto útil de Andalucía en el lienzo
  const base = Math.max(10, k * Math.min(0.2, Math.max(0.055, 0.85 / Math.sqrt(Math.max(1, nUnidades)))));
  if (!(suma > 0)) return base;
  const area = k * k * 2.05 * 0.5;   // Andalucía ocupa más o menos la mitad de su encuadre
  return Math.max(5, Math.min(base, Math.sqrt(0.28 * area / (Math.PI * suma))));
}

// ---------- dibujo: burbujas encima del mapa (capa de MapaCanvas)
const centros = new WeakMap();   // rasgo → [x, y] por clave de proyección
function centroDe(d, proj, clave) {
  let c = centros.get(d);
  if (c && c.k === clave) return c.xy;
  const gp = d3.geoPath(proj);
  // el centro del trozo más grande (un término con islas no pone la burbuja en el mar)
  let geo = d.f, xy = null;
  if (geo && geo.geometry && geo.geometry.type === 'MultiPolygon') {
    let best = null, area = -1;
    for (const p of geo.geometry.coordinates) { const g = { type: 'Polygon', coordinates: p }; const a = gp.area(g); if (a > area) { area = a; best = g; } }
    xy = best ? gp.centroid(best) : null;
  } else if (geo) xy = gp.centroid(geo);
  if (!xy || !xy.every(Number.isFinite)) xy = null;
  centros.set(d, { k: clave, xy });
  return xy;
}

export function dibujaBurbujas(ctx, proj, feats, { vals, max, rmax, color, colorNeg, calidad, hl, selColor }) {
  const out = [];
  if (!vals || !max || !proj) return out;
  const clave = proj.scale() + '|' + proj.translate().join(',');
  for (let k = 0; k < feats.length; k++) {
    const r = vals[k];
    if (!r || r.nd || r.v == null || !isFinite(r.v) || r.v === 0) continue;
    const xy = centroDe(feats[k], proj, clave);
    if (!xy) continue;
    out.push({ d: feats[k], x: xy[0], y: xy[1], r: Math.max(0.8, rmax * Math.sqrt(Math.abs(r.v) / max)), c: r });
  }
  out.sort((a, b) => b.r - a.r);   // las pequeñas, encima
  const papel = token('--v4-papel') || '#ffffff';
  const ocre = token('--a2-ochre') || '#b07d2b';
  ctx.save();
  ctx.lineJoin = 'round';
  for (const b of out) {
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI);
    ctx.globalAlpha = b.c.ia ? 0.4 : calidad && b.c.est ? 0.38 : calidad && b.c.est4 ? 0.58 : 0.8;
    ctx.fillStyle = b.c.v < 0 && colorNeg ? colorNeg : color; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash(calidad && b.c.parcial ? [2.5, 2] : []);
    const sc = selColor && selColor.get(String(b.d.c));
    ctx.strokeStyle = sc || (String(b.d.c) === String(hl) ? '#101010' : b.c.res ? ocre : papel);
    ctx.lineWidth = sc ? 2.4 : String(b.d.c) === String(hl) ? 1.8 : b.c.res ? 1.5 : 0.8;
    ctx.stroke();
  }
  ctx.restore();
  return out;
}

// la burbuja bajo el puntero (la más pequeña que lo contiene, que es la que se ve encima)
export function burbujaEn(lista, x, y) {
  if (!lista) return null;
  for (let k = lista.length - 1; k >= 0; k--) { const b = lista[k]; if ((x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r) return b.d; }
  return null;
}

// tres círculos de referencia con cifras redondas (1, 2, 5 × 10ⁿ), dibujados a la misma escala que el mapa
export function referencias(max, rmax, rTope = 34) {
  const redondo = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };
  const vTope = max * Math.min(1, (rTope / rmax) ** 2);
  const v1 = redondo(vTope);
  const vs = [v1, redondo(v1 / 4.5), redondo(v1 / 20)].filter((v, k, a) => v > 0 && a.indexOf(v) === k);
  return vs.map(v => ({ v, r: rmax * Math.sqrt(v / max) }));
}
