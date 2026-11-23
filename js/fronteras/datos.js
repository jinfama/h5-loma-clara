/* fronteras · lectura y normalización de data/v2 (un único sitio donde se adapta el esquema).
   Esquema de referencia: docs/v2/DATOS.md. Si un campo cambia de nombre, se toca aquí. */

import { cargar, cargarSiHay } from '../atlas2/data.js';
import { limpiaRutas } from '../atlas2/fmt.js';
import { rasgos, malla } from '../atlas2/mapa.js';

const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && o[k] !== '') return o[k]; return null; };
const num = v => (v == null || v === '' || Number.isNaN(+v)) ? null : +v;
const arr = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : String(v).split(/[;,]/).map(s => s.trim()).filter(Boolean));

/* ---------- conteo.json ---------- */
export async function cargarConteo() {
  const raw = await cargar('fronteras/conteo.json');
  const filas = Array.isArray(raw) ? raw : (raw.cortes || raw.filas || raw.rows || []);
  const out = filas.map(r => ({
    corte: String(pick(r, 'corte', 'c')),
    fuente: pick(r, 'fuente', 'fuente_texto'),
    fuente_id: pick(r, 'fuente_id', 'f'),
    entrada: num(pick(r, 'entradas', 'municipios_o_pueblos_con_entrada_propia', 'entrada_propia', 'municipios')),
    sinTermino: num(pick(r, 'n_ine_hoy_sin_termino')),
    sinMunicipio: num(pick(r, 'poligonos_sin_municipio_en_la_fecha', 'n_terminos_sin_municipio_en_la_fecha')),
    haSinMunicipio: num(pick(r, 'ha_sin_municipio_en_la_fecha')),
    porQue: limpiaRutas(pick(r, 'por_que_sin_municipio')),
    sinTerminoLista: pick(r, 'ine_hoy_sin_termino') || [],
    aparte: num(pick(r, 'entidades_que_la_fuente_lista_aparte', 'aparte', 'lista_aparte')),
    pendientes: num(pick(r, 'pendientes_de_situar', 'pendientes')),
    fuera: num(pick(r, 'fuera_de_andalucia', 'fuera')),
    repetidas: num(pick(r, 'repetidas_o_remision', 'repetidas')),
    dibujables: num(pick(r, 'terminos_que_se_pueden_dibujar', 'dibujables', 'terminos')),
    categorias: parseMaybe(pick(r, 'categorias_impresas', 'categorias')),
    rotulo: pick(r, 'rotulo'),
    definicion: pick(r, 'definicion'),
    raw: r,
  }));
  out.nota = raw.nota || null;
  out.rotulo = raw.rotulo_general || null;
  return out;
}
function parseMaybe(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
}

/* ---------- geometría de hoy ---------- */
export async function cargarHoy() {
  const t = await cargar('geo/municipios.topo.json');
  const feats = rasgos(t, 'municipios');
  const porIne = new Map();
  for (const f of feats) {
    const p = f.properties;
    p.c = String(pick(p, 'c', 'ine', 'code'));
    p.n = pick(p, 'n', 'nombre', 'name');
    p.p = pick(p, 'p', 'provincia');
    porIne.set(p.c, f);
  }
  const contorno = t.objects.andalucia ? rasgos(t, 'andalucia') : null;
  const borde = t.objects.andalucia ? malla(t, 'andalucia') : malla(t, 'municipios', (a, b) => a === b);
  const encaje = contorno ? { type: 'FeatureCollection', features: contorno } : { type: 'FeatureCollection', features: feats };
  return { topo: t, feats, porIne, borde, encaje };
}

/* ---------- términos de un corte ---------- */
const cacheCortes = new Map();
export function cargarCorte(corte, hoy) {
  if (cacheCortes.has(corte)) return cacheCortes.get(corte);
  const p = cargar(`geo/terminos/${corte}.topo.json`).then(t => {
    const nombreObj = t.objects.terminos ? 'terminos' : Object.keys(t.objects)[0];
    const feats = rasgos(t, nombreObj);
    const porPieza = new Map();
    const claves = new Set();
    for (const f of feats) {
      const p = f.properties;
      p.u = pick(p, 'u', 'unidad_estable_id');
      p.n = pick(p, 'n', 'nombre');
      p.nm = num(pick(p, 'nm', 'n_municipios_en_la_fecha')) ?? 1;
      p.pz = arr(pick(p, 'pz', 'piezas_hoy')).map(String);
      p.pg = pick(p, 'pg', 'procedencia_geometria');
      p.pe = pick(p, 'pe', 'poligono_es');
      p.cf = pick(p, 'cf', 'confidence');
      p.nt = pick(p, 'nt');
      p.nota = pick(p, 'nota', 'estimation_note') || (t.notas && p.nt != null ? t.notas[String(p.nt)] : null);
      p.mf = pick(p, 'mf', 'municipios_en_la_fecha');
      p.mfc = Array.isArray(p.mfc) ? p.mfc : null;
      p.ha = num(pick(p, 'ha', 'superficie_ha'));
      p.key = p.pz.slice().sort().join(';');
      p.cabeza = cabezaDe(p.u);
      for (const z of p.pz) porPieza.set(z, f);
      claves.add(p.key);
    }
    // bordes interiores de las piezas de hoy dentro de cada término conjunto
    let interiores = null;
    if (hoy) {
      const conj = new Map();
      for (const f of feats) if (f.properties.pe === 'termino_conjunto_de_varios' || f.properties.pz.length > 1) {
        for (const z of f.properties.pz) conj.set(z, f.properties.key);
      }
      interiores = malla(hoy.topo, 'municipios', (a, b) => {
        if (a === b) return false;
        const ka = conj.get(String(a.properties.c ?? a.properties.ine)), kb = conj.get(String(b.properties.c ?? b.properties.ine));
        return ka != null && ka === kb;
      });
    }
    return { corte, topo: t, feats, porPieza, claves, interiores, rotulo: t.leyenda && t.leyenda.rotulo, simplificacion: t.simplificacion_m };
  });
  cacheCortes.set(corte, p);
  p.catch(() => cacheCortes.delete(corte));
  return p;
}

/* Pueblos de la fecha de un término (o de una tanda `pt` de historia.json). Ver DATOS.md:
   `n` y `u` (UE-<corte>-<x>) son etiquetas de la UNIDAD ESTABLE, no el pueblo de esa fecha. El pueblo está en `mf`
   (desde 1842 «INE nombre; INE nombre»; en 1752 y 1787 el nombre impreso) y, en 1752 y 1787, su INE de hoy en `mfc`
   ([[nombre impreso, [INE de hoy…]], …]). No se casan nombres: el INE viene en la tabla.
   Devuelve [{ nombre, ine (INE de la fecha, desde 1842), hoy ([INE de hoy], 1752/1787), impreso }]. */
export function municipiosFecha({ nm, mf, mfc }) {
  if (nm === 0 || !mf) return [];
  if (Array.isArray(mfc)) return mfc.map(([nombre, hoy]) => ({ nombre, ine: null, hoy: (hoy || []).map(String), impreso: true }));
  return String(mf).split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const m = /^(\d{5,6})\s+(.+)$/.exec(v);
    return m ? { nombre: m[2], ine: m[1], hoy: null, impreso: false } : { nombre: v, ine: null, hoy: null, impreso: true };
  });
}
export function etiquetaFecha(p) {
  const ms = municipiosFecha({ nm: p.nm, mf: p.mf, mfc: p.mfc });
  return ms.length ? ms.map(m => m.nombre).join(', ') : null;
}

/* Código de la unidad estable: UE-1752-04001 → 04001 (etiqueta de la unidad, no «cabeza» histórica). */
export function cabezaDe(u) {
  const m = /-(\d{5,6})$/.exec(String(u || ''));
  return m ? m[1] : null;
}

/* ---------- núcleos ---------- */
export async function cargarNucleos() {
  const raw = await cargarSiHay('geo/nucleos.json');
  const out = new Map();
  if (!raw) return out;
  const entradas = Array.isArray(raw) ? groupBy(raw) : Object.entries(raw.cortes || raw);
  for (const [corte, lista] of entradas) {
    out.set(String(corte), (lista || []).map(r => Array.isArray(r)
      ? { lon: +r[0], lat: +r[1], ine: String(r[2]), nombre: r[3], proc: r[4], u: r[5] || null }
      : { lon: +pick(r, 'lon', 'x'), lat: +pick(r, 'lat', 'y'), ine: String(pick(r, 'ine', 'c')), nombre: pick(r, 'nombre', 'n'), proc: pick(r, 'procedencia', 'pg'), u: pick(r, 'u') }));
  }
  return out;
  function groupBy(rows) {
    const m = new Map();
    for (const r of rows) { const c = String(r.corte); if (!m.has(c)) m.set(c, []); m.get(c).push(r); }
    return [...m.entries()];
  }
}

/* ---------- historia.json ----------
   { rotulo, cortes, leyenda, municipios: { INE: { n, e, pc, uc, tr, pt, rel, ext, al, tp } } } (ver su `leyenda`). */
let historia = null;
export async function cargarHistoria() {
  if (historia) return historia;
  const raw = await cargarSiHay('fronteras/historia.json');
  historia = new Map();
  if (!raw) return historia;
  historia.rotulo = raw.rotulo || null;
  const mun = raw.municipios || raw;
  for (const [ine, h] of Object.entries(mun)) {
    if (!h || typeof h !== 'object') continue;
    historia.set(String(ine), {
      ine: String(ine),
      nombre: pick(h, 'n', 'nombre'),
      entidad: pick(h, 'e'),
      primerCenso: num(pick(h, 'pc')),
      ultimoCenso: num(pick(h, 'uc')),
      tramos: (h.tr || []).map(t => ({ tramo: t[0], desde: String(t[1]), hasta: String(t[2]), ue: t[3], ueUltima: t[4], pz: (t[5] || []).map(String), propio: t[6] === 1 || t[6] === '1' || t[6] === true, pg: t[7] })),
      pertenencia: (h.pt || []).map(t => ({ desde: String(t[0]), hasta: String(t[1]), x: t[2] == null ? null : String(t[2]), nombre: t[3], nm: num(t[4]), pz: (t[5] || []).map(String), mf: t[6] || null, mfc: Array.isArray(t[7]) ? t[7] : null })),
      relaciones: (h.rel || []).map(normRel),
      extinguidas: (h.ext || []).map(x => ({ id: x.id, ine: x.ine == null ? null : String(x.ine), nombre: x.n, desde: x.d, hasta: x.h, src: x.src || [] })),
      alias: (h.al || []).map(a => ({ literal: a[0], censos: a[1], fuente: a[2], localizador: a[3] })),
      traspasos: (h.tp || []).map(t => ({ anio: t[0], relacion: t[1], origen: t[2], casadoPor: t[3] })),
      raw: h,
    });
  }
  return historia;
}

function normRel(r) {
  const x = r.x || {};
  return {
    id: r.id,
    tipo: pick(r, 't', 'tipo'),
    rol: pick(r, 'rol'),                   // o: este municipio es el origen; d: el destino
    desde: pick(r, 'd'), hasta: pick(r, 'h'), fecha: pick(r, 'f'),
    cita: pick(r, 'c'),
    localizador: pick(r, 'l'),
    fuentes: String(pick(r, 's') || '').split(';').map(v => v.trim()).filter(Boolean),
    estado: pick(r, 'e'), evidencia: pick(r, 'ev'),
    nota: pick(r, 'nt'),
    revision: r.rev === 1 || r.rev === true,
    otra: { id: x.id || null, nombre: x.n || null, ine: x.ine == null ? null : String(x.ine), vigente: x.v === 1, lugar: x.lugar === 1 },
    // norma que aprueba el cambio (ronda v16): {tipo, num, fecha, boletin, bnum, bfecha, pag, url, sumario}; puede faltar
    norma: r.norma && typeof r.norma === 'object' ? r.norma : null,
  };
}
