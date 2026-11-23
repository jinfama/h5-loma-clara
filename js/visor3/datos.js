// datos.js — lectura de data/v2/visor/ (CONTRATO_VISOR_UNICO.md, «Datos por nivel»). Solo lectura, con caché.
// Mientras visor/indicadores.json no exista, el catálogo lo forman los indicadores con proveedor propio
// (los temas de los timelapses y los que registren otros módulos).

import { cargaMinimo1752 } from './minimo1752.js';   // minimo1752
import { cargar, cargarSiHay } from '../atlas2/data.js';
import { limpiaRutas } from '../atlas2/fmt.js';
import { PROVEEDORES } from './registro.js';
import { estado } from './estado.js';

let CAT = null;
export let hayDatosVisor = false;
export const META = { niveles: {}, motivos: {}, temas: null, total: null, nivelesEnDisco: null };
const GRUPO_FAMILIA = {
  usos: 'Tierra: usos del suelo', tierra: 'Tierra: usos del suelo', cosechas1752: 'Cosechas de 1752', ganado1752: 'Ganado 1752',
  ganado1890: 'Ganado 1891', geografia: 'Geografía', clima: 'Clima', clima_mensual: 'Clima', empleo: 'Trabajo', trabajo: 'Trabajo',
  fronteras: 'Fronteras', poblacion: 'Población',
};

// ¿Existe un fichero de data/v2? Se mira en MANIFEST.json (y en READY.json) antes de pedirlo, para no llenar la
// consola de 404 mientras el agente de datos aún no lo ha escrito.
let MAN = null;
export async function existe(ruta) {
  // un fichero de valores existe si el catálogo dice que ese nivel está en disco (el catálogo se genera con los
  // ficheros; el MANIFEST puede ir por detrás mientras el agente de datos reconstruye una parte)
  const mv = /^visor\/valores\/(.+)__([a-z0-9_]+)\.json$/.exec(ruta);
  if (mv && CAT_SINC.length) {
    const e = CAT_SINC.find(x => x.id === mv[1]);
    if (e && !e.proveedor) return (e.niveles_en_disco || e.niveles || []).includes(mv[2]);
  }
  // lo que el visor necesita para pintar no espera al MANIFEST (2,6 MB): estos ficheros los genera siempre la base
  if (/^visor\/(indicadores|pertenencia|cobertura_municipio)\.json$/.test(ruta)) return true;
  if (!MAN) MAN = Promise.all([cargarSiHay('MANIFEST.json'), fetch(new URL('../../data/v2/READY.json', import.meta.url), { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}))]);
  const [m, ready] = await MAN;
  if (m && m.ficheros && m.ficheros[ruta]) return true;
  if (ruta.startsWith('visor/') && (ready.visor || ready.visor_niveles)) {
    const lista = m && m.ficheros ? Object.keys(m.ficheros) : [];
    return lista.length ? lista.includes(ruta) : ruta === 'visor/indicadores.json';
  }
  return false;
}
const siExiste = async ruta => ((await existe(ruta)) ? cargarSiHay(ruta) : null);

export async function catalogo() {
  if (!CAT) {
    CAT = siExiste('visor/indicadores.json').then(j => {
      let lista = Array.isArray(j) ? j : (j && (j.indicadores || j.lista)) || null;
      if (lista) lista = lista.filter(x => !x.no_publicar);   // retenidos por la base: no existen para el visor (lista, buscador ni enlace)
      hayDatosVisor = !!lista;
      if (j && !Array.isArray(j)) {
        META.niveles = j.niveles || {}; META.motivos = j.motivos || {};
        META.temas = j.temas || null; META.total = j.total ?? null; META.nivelesEnDisco = j.niveles_en_disco || null;
      }
      // un id repetido (grupo y producto con el mismo id) se queda una sola vez: el primero
      const vistos = new Set();
      lista = (lista || []).filter(x => (vistos.has(x.id) ? false : (vistos.add(x.id), true)));
      // `grupo` del catálogo tal cual (en el catálogo v4 es el subindicador visible); el rótulo de grupo del v3, aparte
      for (const x of lista) for (const k of ['nota', 'pertenencia_partido', 'nota_nivel', 'origen_nivel', 'aviso', 'nota_partido']) if (typeof x[k] === 'string') x[k] = limpiaRutas(x[k]);
      for (const x of lista) { x.grupo_cat = x.grupo ?? null; if (!META.temas) x.grupo = GRUPO_FAMILIA[x.familia] || GRUPO_FAMILIA[x.tema] || x.tema; }
      return lista;
    });
  }
  const base = await CAT;
  // los proveedores registrados se añaden (o sustituyen al de igual id si el catálogo de datos no lo trae)
  const ids = new Set(base.map(x => x.id));
  const temas = new Set(base.flatMap(x => [x.tema, x.tema_origen, x.familia]).filter(Boolean));
  // un proveedor «solo sin catálogo» (los temas de los timelapses) se retira cuando el catálogo ya trae su tema
  const extra = [...PROVEEDORES.values()]
    .filter(p => !ids.has(p.id) && !(hayDatosVisor && p.soloSinCatalogo && temas.has(p.temaCatalogo || p.tema)))
    .map(p => ({ id: p.id, tema: p.tema, rotulo: p.rotulo, get unidad() { return p.unidad || ''; }, get anios() { return p.anios || []; }, niveles: p.niveles || [p.nivel_nativo || 'municipio'], nivel_nativo: p.nivel_nativo || 'municipio', agregacion: p.agregacion || 'no', escala: p.escala || null, fuentes: p.fuentes || [], nota: p.nota || '', grupo: p.grupo || p.tema, periodo: p.periodo || '', estado: p.estado || null, proveedor: true }));
  return [...base, ...extra];
}
export function catalogoSinc() { return CAT_SINC; }
let CAT_SINC = [];
export async function refrescarCatalogo() { CAT_SINC = await catalogo(); return CAT_SINC; }
export function indicador(id) { return CAT_SINC.find(x => x.id === id); }

// ---------- valores por indicador y nivel
// Un indicador con proveedor propio que sepa dar sus valores (p. ej., los temas de los timelapses a nivel municipio)
// los da él; si no, se lee el fichero, y solo si existe (si no, null: «sin datos a este nivel»).
export async function valores(ind, nivel) {
  if (/^usos_/.test(String(ind))) await cargaMinimo1752();   // minimo1752
  const p = PROVEEDORES.get(ind);
  if (p && p.valores) { const v = await p.valores(nivel); if (v) return v; }
  // partidos y comarcas: el texto de su marca 2 (estado de la pertenencia, ESTADO_UNIDAD) tiene que estar listo antes de pintar
  if (/^(pj|comarca_agraria$)/.test(nivel)) await pertenencia().catch(() => null);
  return siExiste(`visor/valores/${ind}__${nivel}.json`);
}
export function valoresSiHay(ind, nivel) { return valores(ind, nivel); }

const anioClave = a => String(a);
// ---------- variantes de un mismo año (ronda v11: dos generales en 2019, abril y noviembre)
// Claves «AAAA-xx» (o «AAAA_xx», «AAAA.xx») en `anios`/`por_anio`, o el campo `variantes_anio` del fichero o del catálogo:
// {"2019": [{"clave"|"id": "2019-04", "rotulo": "abril"}, {"clave": "2019-11", "rotulo": "noviembre", "defecto": true}]}.
// La barra de tiempo enseña el año una vez; la variante se elige con `estado.var` (por defecto, la marcada o la última).
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const RE_VAR = /^(\d{4})[-_.](.+)$/;
const rotVariante = suf => { const n = +suf; return Number.isInteger(n) && n >= 1 && n <= 12 ? MESES[n - 1] : String(suf).replace(/_/g, ' '); };
const memoVar = new WeakMap();
export function variantesDe(d, anio, meta = null) {
  if (!d) return null;
  if (!memoVar.has(d)) {
    const m = new Map();
    const claves = (d.anios || Object.keys(d.por_anio || {})).map(String);
    for (const k of claves) { const x = RE_VAR.exec(k); if (!x) continue; if (!m.has(x[1])) m.set(x[1], []); m.get(x[1]).push({ clave: k, suf: x[2], rot: rotVariante(x[2]), defecto: false }); }
    const va = d.variantes_anio || (meta && meta.variantes_anio) || null;
    // formato publicado (DATOS.md): {"2019": {"defecto": "noviembre", "otras": [{id, rotulo, v, f}]}}; en `termino`,
    // por_anio["2019"].variantes. El valor normal del año es la convocatoria por defecto.
    const pub = {};
    if (va && typeof va === 'object') for (const [y, x] of Object.entries(va)) if (x && !Array.isArray(x) && Array.isArray(x.otras)) pub[y] = x;
    for (const [y, x] of Object.entries(d.por_anio || {})) if (x && x.variantes && Array.isArray(x.variantes.otras)) pub[y] = x.variantes;
    for (const [y, x] of Object.entries(pub)) {
      const def = String(x.defecto || 'por defecto');
      m.set(String(y), [...x.otras.map(o => ({ clave: `${y}~${o.id}`, suf: String(o.id), rot: String(o.id), datos: o })), { clave: String(y), suf: def, rot: def, defecto: true }]);
    }
    if (va && typeof va === 'object') for (const [y, lista] of Object.entries(va)) {
      if (!Array.isArray(lista)) continue;
      const arr = m.get(String(y)) || [];
      for (const it of lista) {
        const clave = String(it.clave ?? it.id ?? it.anio ?? '');
        const ex = arr.find(v => v.clave === clave);
        const suf = (RE_VAR.exec(clave) || [])[2] || clave;
        const o = ex || { clave, suf, rot: rotVariante(suf), defecto: false };
        if (it.rotulo || it.nombre || it.etiqueta) o.rot = String(it.rotulo || it.nombre || it.etiqueta);
        if (it.defecto || it.por_defecto) o.defecto = true;
        if (!ex) arr.push(o);
      }
      if (arr.length) m.set(String(y), arr);
    }
    memoVar.set(d, m);
  }
  const lista = memoVar.get(d).get(String(anio).replace(RE_VAR, '$1'));
  return lista && lista.length > 1 ? lista : null;
}
// la variante que toca para ese año: la de la URL (`var` = sufijo o rótulo), la marcada por defecto o la última
export function varianteElegida(lista) {
  if (!lista) return null;
  const q = String(estado.var || '').toLowerCase();
  return (q && lista.find(v => v.suf.toLowerCase() === q || v.rot.toLowerCase() === q)) || lista.find(v => v.defecto) || lista[lista.length - 1];
}
// las claves de años de un fichero, con las variantes juntas en su año (una vez)
export function aniosBase(d) {
  const out = [], vistos = new Set();
  for (const a of d.anios || Object.keys(d.por_anio || {})) { const x = RE_VAR.exec(String(a)); const k = x ? x[1] : a; if (vistos.has(String(k))) continue; vistos.add(String(k)); out.push(x ? +x[1] : k); }
  return out;
}
export const esVarianteNoElegida = (d, a) => { const lista = variantesDe(d, a); return !!lista && RE_VAR.test(String(a)) && varianteElegida(lista).clave !== String(a); };
// datos de un año, con la misma forma para niveles fijos y para `termino`
export async function corte(ind, nivel, anio) {
  const d = await valores(ind, nivel);
  return d ? corteDe(d, anio) : null;
}
// Devuelve {anio, corte, ids, v, f, mot: Map(posición → código de motivo), res: Map(posición → reserva {ficha, rotulo}),
// textoMotivo(código), nota, fuentes}. En `termino` los ids van una vez por corte (ids_por_corte, DATOS.md §12).
const memo = new WeakMap();
// ---------- «Todo interpolado» (ronda v19, Juan): interpolación LINEAL y ANUAL del Atlas entre los años con cifra de
// la misma unidad. Nunca extrapola fuera del primer y del último año con cifra de esa unidad. Es del Atlas, no un dato:
// las celdas van con f = 'I'. Cruza los años sin unir (1591 → 1752). No se interpola un archivo con `__sinInterp`
// (categorías) ni las celdas vacías con motivo propio (no declarado, sin superficie, sin dato a este nivel).
// APAGADO (Juan, 23-nov-2026: «tú no debes hacer estimaciones, todo tomado de la base»): el visor no interpola. «Todo interpolado»
// enseña solo los años que trae la base (p. ej., la población entre censos, estimada por la base). Volver a true lo reactiva entero.
export const INTERPOLA_ATLAS = false;
const memoTI = new WeakMap(), memoCI = new WeakMap();
const numA = a => (typeof a === 'number' ? a : +(String(a).match(/\d{4}/) || [NaN])[0]);
function tablaI(d) {
  if (memoTI.has(d)) return memoTI.get(d);
  const base = aniosBase(d), ys = base.map(numA), cs = base.map(a => corteDeSinI(d, a));
  const pos = new Map();
  let lo = Infinity, hi = -Infinity;
  cs.forEach((c, k) => {
    if (!c || !isFinite(ys[k])) return;
    c.ids.forEach((id, j) => {
      const v = c.v[j]; if (v == null || !isFinite(v)) return;
      const key = String(id); if (!pos.has(key)) pos.set(key, []);
      pos.get(key).push([ys[k], v]);
      if (ys[k] < lo) lo = ys[k]; if (ys[k] > hi) hi = ys[k];
    });
  });
  for (const arr of pos.values()) arr.sort((p, q) => p[0] - q[0]);
  const t = { ys, cs, pos, lo, hi };
  memoTI.set(d, t);
  return t;
}
/* Tramos donde cambia la fuente (catálogo: sin_interpolar_tramos, p. ej. [[2007, 2020]]; ronda v26). Ahí la diferencia
   entre dos años no es solo un cambio real: no se interpola ni se une con línea, en ninguna vista. Es independiente de
   anios_sin_unir, que no impide interpolar (población 1591-1752). x = entrada del catálogo o fichero de valores. */
export function tramosSinInterp(x) {
  const e = !x ? null : Array.isArray(x.sin_interpolar_tramos) ? x : x.ind ? indicador(x.ind) : null;
  const t = e && e.sin_interpolar_tramos;
  if (!Array.isArray(t)) return [];
  return t.filter(z => Array.isArray(z) && z.length === 2 && isFinite(+z[0]) && isFinite(+z[1]) && +z[1] > +z[0]).map(z => [+z[0], +z[1]]);
}
/* Años de un indicador que no se clasifican (catálogo: sin_ranking_anios, p. ej. [1960]: en revisión). Mapa, Líneas y Tabla
   siguen, con su marca; Ranking y cualquier «los que más» no ordenan ese año. x = entrada del catálogo o fichero de valores. */
export const REVISION_ANIO = 'en revisión: cotejo con el censo impreso en curso';
export function aniosSinRanking(x) {
  const e = !x ? null : Array.isArray(x.sin_ranking_anios) ? x : x.ind ? indicador(x.ind) : null;
  return new Set(((e && e.sin_ranking_anios) || []).map(Number).filter(isFinite));
}
/* La fecha que se ofrece en su lugar: la siguiente que se clasifica; si no hay, la anterior. */
export function anioClasificable(anios, anio, sin) {
  const ok = anios.map(Number).filter(a => isFinite(a) && !sin.has(a)).sort((a, b) => a - b);
  return ok.find(a => a > +anio) ?? (ok.length ? ok[ok.length - 1] : null);
}
/* El texto de un tramo (catálogo: sin_interpolar_notas, {"1591-1752": "…"} o lista paralela a los tramos); sin él, el de siempre. */
export function notaTramo(x, a, b) {
  const e = !x ? null : x.sin_interpolar_notas || Array.isArray(x.sin_interpolar_tramos) ? x : x.ind ? indicador(x.ind) : null;
  const n = e && e.sin_interpolar_notas;
  if (Array.isArray(n)) { const k = (e.sin_interpolar_tramos || []).findIndex(z => +z[0] === +a && +z[1] === +b); if (k >= 0 && n[k]) return String(n[k]).replace(/[.\s]+$/, ''); }
  else if (n && n[`${a}-${b}`]) return String(n[`${a}-${b}`]).replace(/[.\s]+$/, '');
  const cortada = !!e && (e.anios_sin_unir || []).some(z => +z[0] === +a && +z[1] === +b);
  return cortada ? `Entre ${a} y ${b} cambia la fuente: estas cifras no se unen ni se interpolan` : `Entre ${a} y ${b} no se interpola`;
}
export const conNotaTramo = (x, a, b) => !/^Entre \d+ y \d+ (cambia la fuente|no se interpola)/.test(notaTramo(x, a, b));
/* ¿El paso de `a` a `b` entra en alguno de esos tramos? (compartir solo un extremo no cuenta: 1999-2007 y 2020-2025 valen) */
export const cruzaTramo = (tramos, a, b) => tramos.some(([p0, p1]) => +a < p1 && +b > p0);
const memoTr = new WeakMap();
function tramosDeFichero(d) {
  if (memoTr.has(d)) return memoTr.get(d);
  const t = tramosSinInterp(d);
  if (CAT_SINC.length) memoTr.set(d, t);   // antes de tener catálogo no se guarda
  return t;
}
/* Valor interpolado por el Atlas para la unidad `id` en el año `anio` (null si ese año tiene cifra, si cae fuera del
   primer y del último año con cifra de la unidad, si el paso entra en un tramo donde cambia la fuente o si el archivo
   no se interpola). */
export function interpolaAtlas(d, id, anio) {
  if (!INTERPOLA_ATLAS || !d || d.__sinInterp) return null;
  const s = tablaI(d).pos.get(String(id)), y = numA(anio);
  if (!s || s.length < 2 || !isFinite(y) || y <= s[0][0] || y >= s[s.length - 1][0]) return null;
  let i = 1; while (i < s.length && s[i][0] < y) i++;
  const [y0, v0] = s[i - 1], [y1, v1] = s[i];
  if (y === y1 || cruzaTramo(tramosDeFichero(d), y0, y1)) return null;
  return v0 + (v1 - v0) * (y - y0) / (y1 - y0);
}
/* Los dos años con cifra entre los que va un valor interpolado (para decirlo en la ficha y el puntero). */
export function tramoAtlas(d, id, anio) {
  if (!d) return null;
  const s = tablaI(d).pos.get(String(id)), y = numA(anio);
  if (!s) return null;
  for (let i = 1; i < s.length; i++) if (s[i - 1][0] < y && y < s[i][0]) return cruzaTramo(tramosDeFichero(d), s[i - 1][0], s[i][0]) ? null : [s[i - 1][0], s[i][0]];
  return null;
}
/* Todos los años, uno a uno, entre el primero y el último con alguna cifra (los de «Todo interpolado»). Dentro de un
   tramo donde cambia la fuente, solo los que traen cifra de la base. */
export function aniosAtlas(d) {
  if (!d) return [];
  const t = tablaI(d); if (!isFinite(t.lo)) return [];
  if (!INTERPOLA_ATLAS) return t.ys.filter((y, k) => isFinite(y) && t.cs[k] && t.cs[k].v.some(v => v != null));   // solo los años de la base
  const tr = tramosDeFichero(d), conCifra = new Set(t.ys);
  const out = []; for (let y = t.lo; y <= t.hi; y++) if (conCifra.has(y) || !tr.some(([a, b]) => y > a && y < b)) out.push(y);
  return out;
}
const SIN_INTERP_MOT = /^(nd|ns|n)$/;
function corteConI(d, anio, c) {
  if (!memoCI.has(d)) memoCI.set(d, new Map());
  const m = memoCI.get(d), key = String(anio);
  if (m.has(key)) return m.get(key);
  const t = tablaI(d), y = numA(anio);
  let out = null;
  if (c) {   // año con cifras de la base: los huecos de cada unidad entre dos cifras suyas, interpolados
    const v = c.v.slice(), f = (typeof c.f === 'string' ? c.f : (c.f || []).join('')).padEnd(c.ids.length, '.').split('');
    let alguno = false;
    c.ids.forEach((id, j) => {
      if (v[j] != null) return;
      const mo = c.mot && c.mot.get(j); if (mo && SIN_INTERP_MOT.test(String(mo))) return;
      const x = interpolaAtlas(d, id, y); if (x != null) { v[j] = x; f[j] = 'I'; alguno = true; }
    });
    out = alguno ? { ...c, v, f: f.join(''), atlas: true } : c;
  } else if (isFinite(y) && y > t.lo && y < t.hi && !tramosDeFichero(d).some(([a, b]) => y > a && y < b)) {   // año sin cifras: las unidades del último corte anterior
    let k0 = -1; t.ys.forEach((yy, k) => { if (t.cs[k] && yy < y && (k0 < 0 || yy > t.ys[k0])) k0 = k; });
    const c0 = k0 >= 0 ? t.cs[k0] : null;
    if (c0) {
      const v = c0.ids.map(id => interpolaAtlas(d, id, y));
      out = { ...c0, anio: String(y), v, f: v.map(x => (x == null ? '.' : 'I')).join(''), mot: new Map(), res: new Map(), clase: null, extra: null, nota: '', fuentes: null, sintetico: true, atlas: true };
    }
  }
  m.set(key, out);
  return out;
}
export function corteDe(d, anio) {
  const c = corteDeSinI(d, anio);
  if (!INTERPOLA_ATLAS || !estado.interp || !d || d.__sinInterp) return c;
  return corteConI(d, anio, c);
}
function corteDeSinI(d, anio) {
  if (!d) return null;
  const a = String(anio);
  // un año con dos convocatorias (2019): la elegida; la publicada aparte trae su `v` y su `f` (DATOS.md)
  const vs = !RE_VAR.test(a) ? variantesDe(d, a) : null;
  if (vs) {
    const el = varianteElegida(vs);
    if (el.datos) { const b = corteBase(d, anio); return b ? { ...b, v: el.datos.v || b.v, f: el.datos.f || b.f, variante: el.rot } : null; }
    if (el.clave !== a) { const c = corteBase(d, el.clave); return c ? { ...c, anio, variante: el.rot } : null; }
    const b = corteBase(d, anio); return b ? { ...b, variante: el.rot } : null;
  }
  return corteBase(d, anio);
}
function corteBase(d, anio) {
  if (!memo.has(d)) memo.set(d, new Map());
  const m = memo.get(d), key = anioClave(anio);
  if (m.has(key)) return m.get(key);
  const out = construyeCorte(d, anio);
  m.set(key, out);
  return out;
}
// ---------- procedencia de los agregados (regla acordada con la capataz, 19-nov-2026)
// f (DATOS.md §12): 0 observado · 3 calculado de originales · 1 estimado · 4 parcialmente estimado (0 < pe < 0,5) ·
// 5 suma parcial (agregado con huecos y pe = 0) · 2 con reserva o en revisión · . vacío. pe = parte estimada (0 a 1; aquí
// se devuelve en %); parcial = [[iy, iid, n_con_dato, n_total]] (también con f 1, 4 o 2); q = confianza por id (a, m, b, .).
// Se aceptan, mientras DATOS.md no fije la forma: denso por año (`pe[iy][iid]`, `q[iy]` como cadena de letras), disperso
// (`[[iy, iid, valor…]]` o `[{iy, i, …}]`) y, en `termino`, lo mismo dentro de `por_anio[año]` sin el índice de año.
function leeCampo(cont, nombre, iy, iid, nIds) {
  const x = cont && cont[nombre];
  if (x == null) return undefined;
  if (typeof x === 'string') return iy == null ? x[iid] : undefined;
  if (!Array.isArray(x) || !x.length) return undefined;
  const esDisperso = e => (Array.isArray(e) && e.length >= 2 && typeof e[0] === 'number' && !(iy != null && e.length === nIds)) || (e && typeof e === 'object' && !Array.isArray(e));
  if (iy == null) {
    if (esDisperso(x[0]) && x.length !== nIds) {
      const e = x.find(r => (Array.isArray(r) ? r[0] : (r.i ?? r.iid)) === iid);
      return e === undefined ? undefined : Array.isArray(e) ? (e.length === 2 ? e[1] : e.slice(1)) : e;
    }
    return x[iid];
  }
  const fila = x[iy];
  if (typeof fila === 'string') return fila[iid];
  if (Array.isArray(fila) && fila.length === nIds && !esDisperso(x[0])) return fila[iid];
  const e = x.find(r => (Array.isArray(r) ? r[0] === iy && r[1] === iid : (r.iy ?? r.y) === iy && (r.i ?? r.iid) === iid));
  return e === undefined ? undefined : Array.isArray(e) ? (e.length === 3 ? e[2] : e.slice(2)) : e;
}
const CONF = { a: 'alta', m: 'media', b: 'baja', alta: 'alta', media: 'media', baja: 'baja', high: 'alta', medium: 'media', low: 'baja' };
// {pe, parcial: {n, m} | null, q} de una celda; cont = el fichero (niveles fijos) o por_anio[año] (`termino`)
// método de cada cifra (`mt`, empleo) y aviso de la celda o de la unidad (`avisos`), en llano (ronda v11).
// `mt` y `avisos` se leen con las mismas formas que `q` (cadena por año, lista densa o dispersa [iy, iid, valor]); el
// código se traduce con el diccionario del fichero si lo trae (`metodos`, `mt_textos`, `textos_avisos`…). Sin tramas.
const MT_LLANO = [
  [/^original|^o$/i, 'cifra de fuente'],
  [/sin[ _]?cifra|^\.$|^sin$/i, 'sin cifra'],
  [/censo.*proxy|proxy.*censo/i, 'estimada entre el censo y la afiliación'],
  [/censo.*afilia|afilia.*censo/i, 'estimada entre el censo y la afiliación'],
  [/afilia/i, 'estimada con la afiliación'],
  [/entre|interp|modelo|dos[ _]datos/i, 'estimada entre dos datos de fuente'],
  [/fuente|observ|^0$|^f$/i, 'cifra de fuente'],
];
// avisos conocidos, en llano (la base puede dar el código o el texto)
const AVISO_LLANO = [
  [/^no[ _]?exist|aun[ _]no[ _]exist|municipio[ _]que[ _]no[ _]exist/i, 'este municipio aún no existía en esa fecha; la cifra es la estimada para su término de hoy'],
];
const dicDe = (d, ...k) => { for (const x of k) if (d && d[x] && typeof d[x] === 'object' && !Array.isArray(d[x])) return d[x]; return null; };
export function metodoLlano(cod, d) {
  if (cod == null || cod === '') return null;
  let dic = dicDe(d, 'metodos', 'mt_textos', 'mt_leyenda', 'leyenda_mt', 'textos_mt');
  // `leyenda_mt` en texto: «mt = …: o original de la fuente, d repartida de un censo, m modelo heredado…»
  if (!dic && d && typeof d.leyenda_mt === 'string') {
    dic = {};
    for (const t of d.leyenda_mt.replace(/^[^:]*:\s*/, '').split(/,\s+(?=\S\s)/)) { const m = /^(\S)\s+(.+)$/.exec(t.trim()); if (m) dic[m[1]] = m[2].replace(/\s*\(.*$/, ''); }
  }
  const t = String((dic && dic[cod]) ?? cod);
  for (const [re, llano] of MT_LLANO) if (re.test(t)) return llano;
  return t.replace(/_/g, ' ');
}
function avisoDe(d, cont, iy, iid, nIds, id, key) {
  const dic = dicDe(d, 'textos_avisos', 'avisos_textos', 'avisos_dic', 'leyenda_avisos');
  const txt = c => { if (c == null || c === '' || c === '.') return null; const t = String((dic && dic[c]) ?? c); for (const [re, llano] of AVISO_LLANO) if (re.test(t)) return llano; return t.replace(/_/g, ' '); };
  // por celda (como `q` o `mot`)
  let a = Array.isArray(cont && cont.avisos) || typeof (cont && cont.avisos) === 'string' ? leeCampo(cont, 'avisos', iy, iid, nIds) : undefined;
  if (a != null) return txt(Array.isArray(a) ? a[a.length - 1] : a);
  // por unidad: {id: texto} o, por año, {año: {id: texto}}
  const o = (d && d.avisos && typeof d.avisos === 'object' && !Array.isArray(d.avisos)) ? d.avisos : (d && d.avisos_unidad) || null;
  if (o && id != null) { const y = key != null && o[key] && typeof o[key] === 'object' ? o[key][id] : o[id]; if (y != null && typeof y !== 'object') return txt(y); }
  return null;
}

export function extrasCelda(cont, iy, iid, nIds, d = cont, id = null, key = null) {
  let pe = leeCampo(cont, 'pe', iy, iid, nIds);
  if (pe && typeof pe === 'object') pe = pe.pe ?? null;
  let parcial = null;
  const p = leeCampo(cont, 'parcial', iy, iid, nIds);
  if (Array.isArray(p) && p.length >= 2) parcial = { n: p[0], m: p[1], motivo: p[2] != null ? String(((d && d.motivos) || {})[p[2]] ?? p[2]) : null };
  else if (p && typeof p === 'object') parcial = { n: p.n_con_dato ?? p.n, m: p.n_total ?? p.m };
  else if (p === true || p === 1) parcial = { n: leeCampo(cont, 'n_con_dato', iy, iid, nIds), m: leeCampo(cont, 'n_total', iy, iid, nIds) };
  if (parcial && !(parcial.n != null && parcial.m != null && parcial.n < parcial.m)) parcial = parcial && parcial.n == null ? { n: null, m: null } : null;
  const q = leeCampo(cont, 'q', iy, iid, nIds) ?? leeCampo(cont, 'confianza', iy, iid, nIds);
  const pc = pe == null || pe === '' ? null : (+pe <= 1 ? +pe * 100 : +pe);   // la tabla da 0 a 1
  const mt = leeCampo(cont, 'mt', iy, iid, nIds);
  return { pe: pc, parcial, q: q && q !== '.' ? CONF[String(q)] || String(q) : null, metodo: mt != null && mt !== '.' ? metodoLlano(mt, d) : (mt === '.' ? metodoLlano('.', d) : null), aviso: avisoDe(d, cont, iy, iid, nIds, id, key) };
}
// ¿el fichero publica la parte estimada? (solo los agregados: provincia, partidos, comarcas y Andalucía; DATOS.md §12)
export const tieneProcedenciaNueva = d => !!d && ('pe' in d || !!(d.por_anio && Object.values(d.por_anio).some(x => x && 'pe' in x)));

function construyeCorte(d, anio) {
  const key = anioClave(anio);
  const textos = { ...(META.motivos || {}), ...(d.motivos || {}), ...((d.motivo_vacio && d.motivo_vacio.textos) || {}) };
  const reservas = d.reservas || [];
  const base = { anio, nota: (d.notas_anio || {})[key] || '', fuentes: (d.fuentes_anio || {})[key] || null, textoMotivo: c => textos[c] || null };
  if (d.por_anio) {
    const x = d.por_anio[key];
    if (!x) return null;
    const ids = x.ids || (d.ids_por_corte || {})[x.corte] || [];
    return { ...base, corte: x.corte, geo: (d.geo_por_corte || {})[x.corte] || null, ids, v: x.v, f: x.f || '',
      mot: new Map([...(x.mot || []).map(([i, c]) => [i, c]), ...(((x.motivo_vacio || {}).celdas) || []).map(r => (r.length === 3 ? [r[1], r[2]] : r))]), res: new Map((x.res || []).map(([i, j]) => [i, reservas[j]])),
      clase: typeof x.clase === 'string' ? x.clase : null, textoMotivo: c => ({ ...textos, ...((x.motivo_vacio && x.motivo_vacio.textos) || {}) })[c] || null,
      nota: x.nota || base.nota, fuentes: x.fuentes || base.fuentes, extra: i => extrasCelda(x, null, i, ids.length, { ...d, ...x, avisos: x.avisos ?? d.avisos }, ids[i], key) };
  }
  const k = d.anios.map(anioClave).indexOf(key);
  if (k < 0) return null;
  const mot = new Map(), res = new Map();
  for (const [iy, i, c] of d.mot || []) if (iy === k) mot.set(i, c);
  for (const [iy, i, c] of ((d.motivo_vacio || {}).celdas) || []) if (iy === k) mot.set(i, c);
  for (const [iy, i, j] of d.res || []) if (iy === k) res.set(i, reservas[j]);
  return { ...base, corte: null, geo: d.geo, ids: d.ids, v: d.v[k], f: (d.f || [])[k] || '', clase: Array.isArray(d.clase) && typeof d.clase[k] === 'string' ? d.clase[k] : null, mot, res, extra: i => extrasCelda(d, k, i, d.ids.length, d, d.ids[i], key) };
}
export async function serie(ind, nivel, id) {
  const d = await valores(ind, nivel);
  if (!d) return [];
  const j = d.ids.indexOf(id);
  if (j < 0) return [];
  return d.anios.map((a, k) => ({ anio: a, v: d.v[k][j], f: ((d.f || [])[k] || '')[j] || '.' }));
}

/* Estado de la pertenencia de cada partido o comarca (pertenencia.json, niveles[nivel].estado): el texto que sustituye al «en revisión»
   genérico de una celda con marca 2 sin reserva (capataz, 22-nov-2026). ESTADO_UNIDAD[nivel] = Map(id -> texto). */
export const ESTADO_UNIDAD = {};
export function pertenencia() {
  return siExiste('visor/pertenencia.json').then(p => {
    if (p && p.niveles) for (const [nid, n] of Object.entries(p.niveles)) {
      if (!Array.isArray(n.estado) || ESTADO_UNIDAD[nid]) continue;
      ESTADO_UNIDAD[nid] = new Map(n.ids.map((id, k) => [id, n.estado[k]]).filter(([, t]) => t));
    }
    return p;
  });
}
export function estadoUnidad(nivel, id) { const m = ESTADO_UNIDAD[nivel]; return (m && m.get(id)) || ''; }

const ESTADO_CELDA = { 0: 'observado', 3: 'calculado', 1: 'estimado', 4: 'parcial_estimado', 5: 'suma_parcial', 2: 'reserva', '.': 'vacio' };
export function celda(f, k) { return ESTADO_CELDA[(f || '')[k]] || 'vacio'; }
