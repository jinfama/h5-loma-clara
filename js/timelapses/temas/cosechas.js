// cosechas.js — tema «Lo que daba la tierra en 1752»: producción y rendimientos del Catastro de Ensenada por
// unidad estable de 1752 (términos candidatos de «límites», límites supuestos), no por municipio: hay términos compartidos
// que, vistos por municipio, superan su término (series/avisos_1752.json). No es temporal: va de producto en producto.
// Datos: data/v2/series/agraria_1752.json. Dos capas que no se suman: `obs` (lo que trae la fuente, convertido a kg o
// ha) y `est` (capa entera, observado más estimado). Aquí: una unidad con cifra en `obs` se pinta lisa; una que solo
// tiene cifra en `est` lleva la trama de estimado.

import { RAMPAS, escalaLog, fmt } from '../escalas.js';
import { estadoPorReady, AVISO, cargaTerminos1752, fichaUnidad1752 } from './base.js';
import { entero } from '../../atlas2/fmt.js';

const PASOS = [
  ['g', 'cereal', 'Cereal', 'cereal'], ['p', 'trigo', 'Trigo', 'cereal'], ['p', 'cebada', 'Cebada', 'cereal'],
  ['p', 'centeno', 'Centeno', 'cereal'], ['p', 'maíz', 'Maíz', 'cereal'],
  ['p', 'aceite', 'Aceite', 'aceite'], ['p', 'vino_mosto', 'Vino y mosto', 'vino'], ['p', 'uva', 'Uva', 'vino'],
  ['p', 'pasa', 'Pasa', 'vino'], ['g', 'hortaliza', 'Hortaliza', 'monte'], ['g', 'fruta', 'Fruta', 'labor'],
  ['g', 'leguminosa', 'Legumbres', 'labor'], ['p', 'lino', 'Lino', 'regadio'], ['p', 'cáñamo', 'Cáñamo', 'regadio'],
  ['p', 'zumaque', 'Zumaque', 'vina'],
];

const T = {
  id: 'cosechas',
  kicker: 'Timelapse 03 · Cosechas de 1752',
  titulo: 'Lo que daba la tierra en 1752',
  subtitulo: 'Producción y rendimientos del Catastro de Ensenada, producto a producto.',
  entradilla: 'Toneladas por km² del término de 1752, unidad estable a unidad estable (o kilos por hectárea sembrada), producto a producto. Liso: cifra que trae la fuente. Rayado: estimada (rendimientos de pueblos vecinos, repartos).',
  periodo: '1752',
  acento: '#c98a1b',
  rampa: RAMPAS.cereal,
  estado: estadoPorReady(['agraria_1752'], 'data/v2/series/agraria_1752.json', 'en revisión'),
  temporal: false,
  vistas: [
    { id: 'est', etiqueta: 'Producción' },
    { id: 'obs', etiqueta: 'Solo lo observado' },
    { id: 'rend', etiqueta: 'Rendimiento' },
  ],
  textoEstimado: 'estimado (sin cifra en la fuente)',
};

let D, HA, NOMBRE, IDX, ESC = {}, T52;

T.cargar = async ({ cargar, geo }) => {
  D = await cargar('series/agraria_1752.json');
  NOMBRE = new Map(geo.objects.municipios.geometries.map(g => [g.properties.c, g.properties.n]));
  T52 = await cargaTerminos1752(cargar);
  // nivel unidad estable: ids UE-1752-…, superficie del término candidato de 1752
  IDX = new Map(D.ids.unidad_estable.map((u, j) => [u, j]));
  HA = new Map([...IDX.keys()].map(u => [u, (T52.props.get(u) || {}).ha]));
};

const capa = (k, grp, prod) => (D[k].unidad_estable[grp] || {})[prod] || null;
const nombreUd = u => { const p = T52.props.get(u); return p ? (p.mf || p.n) : u; };
T.capaDe = () => T52.capa;

function celda(paso, j, vista) {
  const [grp, prod] = paso;
  const o = capa('obs', grp, prod), e = capa('est', grp, prod);
  const ov = o && o.prod ? o.prod.v[j] : null;
  const ev = e && e.prod ? e.prod.v[j] : null;
  if (vista === 'obs') return ov == null ? null : { v: ov, est: false, ov, ev };
  if (vista === 'rend') {
    const r = e && e.rend ? e.rend.v[j] : null;
    return r == null ? null : { v: r, est: ov == null, ov, ev, rend: r };
  }
  return ev == null ? null : { v: ev, est: ov == null, ov, ev };
}

// escala de cada paso: de un 2 % a un 98 % de los valores, redondeada a 1-2-5
function redondo(x, arriba) {
  const k = Math.floor(Math.log10(x)), b = 10 ** k;
  const ms = [1, 2, 5, 10];
  if (arriba) return ms.map(m => m * b).find(v => v >= x);
  return [...ms].reverse().map(m => m * b).find(v => v <= x);
}

function escalaPaso(i, vista) {
  const key = i + vista;
  if (ESC[key]) return ESC[key];
  const paso = PASOS[i];
  const vals = [];
  for (const [c, j] of IDX) {
    const r = celda(paso, j, vista);
    if (!r) continue;
    const x = vista === 'rend' ? r.v : r.v / (HA.get(c) / 100);
    if (x > 0 && isFinite(x)) vals.push(x);
  }
  vals.sort((a, b) => a - b);
  const lo = vals.length ? redondo(Math.max(vals[Math.floor(vals.length * 0.02)], 1e-3), false) : 0.01;
  const hi = vals.length ? redondo(Math.max(vals[Math.floor(vals.length * 0.98)], lo * 10), true) : 10;
  const s = escalaLog(lo, hi, RAMPAS[paso[3]] || RAMPAS.cereal);
  const ticks = s.ticksRedondos;
  s.ticksRedondos = ticks.length > 5 ? ticks.filter((v, k) => k % 2 === 0 || k === ticks.length - 1) : ticks;
  ESC[key] = s;
  return s;
}

T.preparar = (vista) => {
  T.fotogramas = PASOS.map((p, i) => ({
    clave: p[1], etiqueta: p[2], corto: p[2], i, revision: true, hito: true,
    avisos: [AVISO.revision, AVISO.supuesto, ...(vista === 'obs' ? [] : [AVISO.estimado('Rayado: estimado')])],
    fuentes: ['ENSENADA-1752'],
    nota: `Se pinta por unidad estable de 1752, no por municipio: hay términos compartidos que, vistos por municipio, superan su término${T52.avisos ? ` (${T52.avisos.n} municipios, avisos de 1752)` : ''}. ${D.rotulo}. ${vista === 'rend' ? 'Rendimiento: kilos por hectárea sembrada de ese producto.' : 'Producción repartida sobre la superficie del término de 1752 (candidato).'} ${D.capas[vista === 'obs' ? 'obs' : 'est']}.`,
  }));
  T.frases = frases(vista);
};

T.relleno = (i, vista) => {
  const s = escalaPaso(i, vista), paso = PASOS[i];
  return (c) => {
    const j = IDX.get(c); if (j == null || !HA.get(c)) return { nd: true };
    const r = celda(paso, j, vista);
    if (!r) return { nd: true };
    const x = vista === 'rend' ? r.v : r.v / (HA.get(c) / 100);
    return { color: s(Math.max(x, 1e-6)), est: r.est };
  };
};

function total(i, vista) {
  let s = 0, n = 0, no = 0;
  for (const [, j] of IDX) {
    const r = celda(PASOS[i], j, vista === 'rend' ? 'est' : vista);
    if (!r) continue;
    s += r.v; n++; if (!r.est) no++;
  }
  return { s, n, no };
}

T.cifra = (i, vista) => {
  const t = total(i, vista);
  const ton = t.s >= 1000 ? fmt.grande(t.s) : { v: fmt.d1(t.s), u: '' };
  const lab = vista === 'obs' ? `en las ${entero(t.n)} unidades de 1752 con cifra en la fuente`
    : `en ${entero(t.n)} unidades de 1752 (${entero(t.no)} con cifra en la fuente, el resto estimado)`;
  return { valor: ton.v, unidad: (ton.u ? ton.u + ' de ' : '') + 't', etiqueta: `de ${PASOS[i][2].toLowerCase()} ${lab}` };
};

T.serie = () => null;

T.leyenda = (i, vista) => ({
  tipo: 'continua', escala: escalaPaso(i, vista), log: true,
  titulo: `${PASOS[i][2]} · ${vista === 'rend' ? 'kg por ha sembrada' : 't por km² de término'} · log.`,
  formato: v => v < 1 ? fmt.d2(v) : entero(v),
});
T.hayEstimado = (i, vista) => vista !== 'obs';

T.detalle = (i, c, d) => {
  const fu = fichaUnidad1752(T52.props.get(c), x => NOMBRE.get(x));
  const j = IDX.get(c), nombre = fu.titulo;
  const vista = T._v || 'est';
  const sub = `${PASOS[i][2]}, 1752`;
  if (j == null) return { titulo: nombre, sub, nd: true, lineas: fu.lineas };
  const r = celda(PASOS[i], j, vista);
  if (!r) return { titulo: nombre, sub, nd: true, lineas: fu.lineas };
  const l = [...fu.lineas];
  if (r.ov != null) l.push(`Observado: ${fmt.d1(r.ov)} t`);
  if (r.ev != null && vista !== 'obs') l.push(`Capa estimada: ${fmt.d1(r.ev)} t`);
  const e = capa('est', PASOS[i][0], PASOS[i][1]);
  if (e && e.rend && e.rend.v[j] != null && vista !== 'rend') l.push(`Rendimiento: ${entero(e.rend.v[j])} kg/ha`);
  if (e && e.prod && e.prod.s && D.estados[e.prod.s[j]] && r.est) l.push(D.estados[e.prod.s[j]]);
  const valor = vista === 'rend' ? `${entero(r.v)} kg/ha` : `${fmt.d2(r.v / (HA.get(c) / 100))} t/km²`;
  return { titulo: nombre, sub, valor, est: r.est, lineas: l };
};
const prep = T.preparar; T.preparar = (v) => { T._v = v; prep(v); };

T.ritmo = () => 2600;
const EN_VISOR = ['trigo', 'cebada', 'centeno', 'aceite', 'vino_mosto', 'hortaliza'];
T.visor = (i, vista) => {
  const p = PASOS[i][1];
  const ind = EN_VISOR.includes(p) ? `&ind=${vista === 'rend' ? 'rend' : 'prod'}_${p}` : '';
  return `visor.html#cat=agraria${ind}&view=map${vista === 'obs' ? '&he=1' : ''}`;
};

function frases(vista) {
  return PASOS.map((p, i) => {
    const t = total(i, 'est'), o = total(i, 'obs');
    let best = null, bv = -1, bestEst = false;
    for (const [c, j] of IDX) { const r = celda(p, j, 'est'); if (r && r.v > bv) { bv = r.v; best = c; bestEst = r.est; } }
    const nom = p[2].toLowerCase();
    const txt = vista === 'obs'
      ? `${p[2]}: ${entero(o.n)} unidades de 1752 dan cifra en el Catastro.`
      : `${p[2]}: ${entero(o.n)} unidades de 1752 con cifra en el Catastro y ${entero(t.n - t.no)} más estimadas. La mayor cosecha de ${nom}: ${nombreUd(best)}${bestEst ? ' (estimada)' : ''}.`;
    return { i, texto: txt, hasta: i };
  });
}

export default T;
