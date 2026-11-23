// niveles.js — niveles territoriales del selector «Ver por» y su geometría (VISOR3_API.md §3, CONTRATO_VISOR_UNICO.md).

/* global topojson */
import { cargar, cargarSiHay } from '../atlas2/data.js';
import { pertenencia } from './datos.js';

export const NIVELES = [
  { id: 'municipio', rotulo: 'Municipios de hoy', corto: 'Municipios', ruta: 'geo/municipios.topo.json', objeto: 'municipios', idProp: 'c', fija: true },
  { id: 'termino', rotulo: 'Términos de cada año', corto: 'Términos del año', objeto: 'terminos', idProp: 'u', fija: false, candidata: true },
  { id: 'ue1842', rotulo: 'Unidades estables de 1842 (panel equilibrado)', corto: 'Panel 1842', ruta: 'geo/terminos/1842.topo.json', objeto: 'terminos', idProp: 'u', fija: true, panel: true, candidata: true },
  { id: 'ue1752', rotulo: 'Unidades estables de 1752 (panel)', corto: 'Panel 1752', ruta: 'geo/terminos/1752.topo.json', objeto: 'terminos', idProp: 'u', fija: true, panel: true, candidata: true },
  { id: 'pj1888', rotulo: 'Partidos judiciales de 1888', corto: 'Partidos 1888', ruta: 'geo/partidos/1888.topo.json', objeto: 'partidos', idProp: 'id', fija: true, candidata: true },
  { id: 'pj1834', rotulo: 'Partidos judiciales de 1834', corto: 'Partidos 1834', ruta: 'geo/partidos/1834.topo.json', objeto: 'partidos', idProp: 'id', fija: true, candidata: true },
  { id: 'pjactual', rotulo: 'Partidos judiciales de hoy', corto: 'Partidos hoy', ruta: 'geo/partidos/actual.topo.json', objeto: 'partidos', idProp: 'id', fija: true },
  { id: 'comarca_agraria', rotulo: 'Comarcas agrarias (1996)', corto: 'Comarcas agrarias', fija: true, union: true },
  { id: 'provincia', rotulo: 'Provincias', corto: 'Provincias', ruta: 'geo/municipios.topo.json', objeto: 'provincias', idProp: 'p', fija: true },
  { id: 'andalucia', rotulo: 'Andalucía', corto: 'Andalucía', ruta: 'geo/municipios.topo.json', objeto: 'andalucia', idProp: null, idFijo: 'AND', fija: true },
];
export const nivel = id => NIVELES.find(n => n.id === id);

// ---------- cortes de los términos
let CORTES = null;
export async function cortes() {
  if (!CORTES) {
    const c = await cargarSiHay('geo/cortes.json');
    CORTES = c && c.cortes ? c.cortes.map(x => String(x.corte)) : ['1752', '1787', '1842', 'hoy'];
  }
  return CORTES;
}
const anioNum = a => typeof a === 'number' ? a : (String(a).match(/\d{4}/) ? +String(a).match(/\d{4}/)[0] : NaN);
// corte vigente en un año: el último corte ≤ año; después del último corte numérico, «hoy»
export function corteVigente(anio, lista = CORTES || []) {
  const y = anioNum(anio);
  const nums = lista.filter(c => /^\d{4}$/.test(c)).map(Number).sort((a, b) => a - b);
  if (!isFinite(y) || !nums.length) return lista[lista.length - 1] || 'hoy';
  if (y > nums[nums.length - 1] && lista.includes('hoy')) return 'hoy';
  let v = nums[0];
  for (const c of nums) if (c <= y) v = c;
  return String(v);
}

// quién sabe el corte de cada año del indicador activo (el visor lo fija al cargar un indicador)
let corteDeAnio = null;
export function fijarCortes(fn) { corteDeAnio = typeof fn === 'function' ? fn : null; }

// ---------- geometría
const cache = new Map();
function preparar(clave, def, topo, objeto, idDe, extra = {}) {
  const obj = topo.objects[objeto];
  const props = new Map();
  for (const g of obj.geometries) props.set(String(idDe(g.properties || {})), g.properties || {});
  return { clave, nivel: def.id, topo, objeto, idDe, idProp: def.idProp, props, ...extra };
}

export async function geometria(id, anio) {
  const def = nivel(id);
  if (!def) throw new Error(`Nivel desconocido: ${id}`);
  if (def.id === 'termino') {
    await cortes();
    // el corte lo dice el dato de ese año (en población, 2024 y 2025 van con los términos de 2021); si no, el vigente
    const pedido = corteDeAnio ? corteDeAnio(anio) : null;
    const c = pedido && CORTES.includes(String(pedido)) ? String(pedido) : corteVigente(anio);
    const clave = `termino:${c}`;
    if (!cache.has(clave)) cache.set(clave, cargar(`geo/terminos/${c}.topo.json`).then(t => preparar(clave, def, t, 'terminos', p => p.u, { corte: c, supuesta: c === '1752' || c === '1787' })));
    return cache.get(clave);
  }
  if (def.union) {
    const clave = 'comarca_agraria';
    if (!cache.has(clave)) cache.set(clave, Promise.all([cargar('geo/municipios.topo.json'), pertenencia()]).then(([t, per]) => {
      const de = mapaPertenencia(per, 'comarca_agraria');
      if (!de) throw new Error('las comarcas agrarias aún no han llegado al Atlas');
      const grupos = new Map();
      for (const g of t.objects.municipios.geometries) { const k = de(g.properties.c); if (k == null) continue; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(g); }
      const nl = per.niveles && per.niveles.comarca_agraria;
      const nombre = new Map(nl && nl.ids ? nl.ids.map((id, k) => [String(id), (nl.nombres || [])[k]]) : []);
      const geoms = [...grupos].map(([k, gs]) => ({ ...topojson.mergeArcs(t, gs), properties: { id: String(k), n: nombre.get(String(k)) || String(k), pz: gs.map(g => g.properties.c) } }));
      const topo = { ...t, objects: { ...t.objects, comarcas: { type: 'GeometryCollection', geometries: geoms } } };
      return preparar(clave, def, topo, 'comarcas', p => p.id);
    }));
    return cache.get(clave);
  }
  const clave = def.id;
  if (!cache.has(clave)) cache.set(clave, cargar(def.ruta).then(t => preparar(clave, def, t, def.objeto, def.idFijo ? () => def.idFijo : p => p[def.idProp], { supuesta: def.id === 'ue1752' })));
  return cache.get(clave);
}

// pertenencia.json: municipio de hoy → id de un nivel. Se aceptan las dos formas razonables del esquema
// ({nivel: {ine: id}} o {ine: {nivel: id}}), hasta que DATOS.md la fije.
export function mapaPertenencia(per, niv) {
  if (!per) return null;
  // forma de DATOS.md §12: per.ine = [785 INE], per.municipio[nivel] = [id por municipio, alineado con per.ine]
  if (Array.isArray(per.ine) && per.municipio && Array.isArray(per.municipio[niv])) {
    const pos = new Map(per.ine.map((c, k) => [String(c), k]));
    return ine => { const k = pos.get(String(ine)); return k == null ? null : per.municipio[niv][k]; };
  }
  const base = per.municipio || per.niveles || per;
  if (base[niv] && typeof base[niv] === 'object') return ine => base[niv][ine] ?? null;
  const uno = Object.values(base)[0];
  if (uno && typeof uno === 'object' && niv in uno) return ine => (base[ine] || {})[niv] ?? null;
  return null;
}
