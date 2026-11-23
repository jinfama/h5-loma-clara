// catalogo.js — temas, subindicadores (grupos) y conceptos del visor v4.
// Manda el catálogo de datos (data/v2/visor/indicadores.json): `temas[].grupos[]` y, en cada indicador, `familia`,
// `miembro`, `miembro_rotulo`, `medida`, `tipo_miembro`, `grupo_origen`, `orden` y `rotulo_corto` (DATOS.md §12).
// Mientras el catálogo publicado no traiga esos campos, se deducen aquí de los ids y rótulos que sí trae (nunca se
// fijan ids a mano). Un concepto reúne las variantes de una misma cosa (olivar en ha y en % del término; ovino en
// 1752 y en 1891); la variante se elige en la barra derecha.

import { META } from '../visor3/datos.js';

export const TEMAS = [
  { id: 'fronteras', rotulo: 'Pueblos y fronteras', lead: 'Cómo cambian los términos municipales de 1591 a hoy: antes había menos municipios. Los límites de cada año y sus segregaciones y agregaciones.' },
  { id: 'poblacion', rotulo: 'Población', lead: 'Cuánta gente vivía en cada sitio y cómo se repartía por el territorio.' },
  { id: 'agrario', rotulo: 'Agrario', lead: 'Qué se hacía con la tierra: usos del suelo, cosechas del Catastro de Ensenada y ganado.' },
  { id: 'propiedad', rotulo: 'Propiedad', largo: 'Propiedad de la tierra', lead: 'Cómo se repartía la tierra: cantidades, indicadores y un grupo experimental, rotulado como tal.' },
  { id: 'clima', rotulo: 'Clima', lead: 'Temperatura y lluvia de cada año, sus anomalías y las normales de cada mes.' },
  { id: 'trabajo', rotulo: 'Trabajo', lead: 'Cómo se reparten los ocupados entre el campo, la industria y los servicios.' },
  { id: 'politica', rotulo: 'Elecciones', lead: 'Participación, votos por familia política y quién ganó en cada sitio.' },
  { id: 'geografia', rotulo: 'Geografía', lead: 'Relieve, agua y suelo de cada municipio: el escenario que apenas cambia.' },
  { id: 'transporte', rotulo: 'Transporte', lead: 'Calzadas, caminos, ferrocarril, carreteras y costa: capas para situarse (heredadas o candidatas, sin revisar) y, debajo, distancias, red y puertos por municipio, medidos en la base.' },
];
const ORDEN_GRUPOS = {
  poblacion: ['Habitantes', 'Densidad', 'Hogares'],
  agrario: ['Superficie y usos del suelo', 'Tipo de cultivo', 'Ganado'],
  clima: ['Temperatura', 'Precipitación', 'Anomalías', 'Climograma'],
  trabajo: ['Estructura del empleo'],
  politica: ['Participación', 'Votos por familia', 'Ganador'],
  propiedad: ['Cantidades', 'Indicadores', 'Experimental'],
  geografia: ['Capas del territorio', 'Relieve', 'Agua y costa', 'Suelo'],
  transporte: ['Caminos históricos', 'Ferrocarril', 'Carreteras', 'Costa',
    'Distancia a las vías (en línea recta)', 'Distancia a los puertos (en línea recta)', 'Red dentro del término', 'Puertos en el término'],
  fronteras: ['Fronteras de cada año', 'Segregaciones y agregaciones'],
};
// tema del catálogo v3 → tema v4
const TEMA_DE = { poblacion: 'poblacion', tierra: 'agrario', usos: 'agrario', usos_suelo: 'agrario', cosechas1752: 'agrario', cosechas: 'agrario', agraria: 'agrario', ganado: 'agrario', clima: 'clima', trabajo: 'trabajo', empleo: 'trabajo', geografia: 'geografia', fronteras: 'fronteras', territorio: 'fronteras', agrario: 'agrario', transporte: 'transporte', politica: 'politica', elecciones: 'politica', electoral: 'politica', propiedad: 'propiedad', propiedad_tierra: 'propiedad' };

export const MEDIDA = {
  pct: { r: '% del término', orden: 1 }, ha: { r: 'Hectáreas', orden: 2 },
  prod_t: { r: 'Producción', orden: 1 }, sup_ha: { r: 'Superficie', orden: 2 }, rend_kgha: { r: 'Rendimiento', orden: 3 },
  censos: { r: 'Censos', orden: 1 }, anual: { r: 'Año a año', orden: 2 },
  valor: { r: 'Valor', orden: 1 }, anomalia: { r: 'Anomalía', orden: 2 },
};
const EJE = { medida: 'Medida', fecha: 'Fecha', serie: 'Serie' };
// secciones dentro de los usos del suelo (grupo comparable de la tabla)
const SECCION = {
  tierra_de_labor: 'Labor', rotacion_larga_solo_1752: 'Labor', lenosos: 'Leñosos', monte_y_pasto: 'Monte y pasto',
  dehesa_agricola_sin_asignar: 'Dehesa', inculto_y_no_agrario: 'Inculto y no agrario', sin_clasificar: 'Sin clasificar',
};
// tildes que faltan en los rótulos deducidos de los ids
const TILDES = { vina: 'viña', agricola: 'agrícola', regadio: 'regadío', lenosos: 'leñosos', rotacion: 'rotación', maiz: 'maíz', canamo: 'cáñamo', cultivo_industrial: 'cultivo industrial' };
const conTildes = s => String(s || '').replace(/_/g, ' ').split(' ').map(w => {
  const t = TILDES[w.toLowerCase()];
  return t ? (w[0] === w[0].toUpperCase() ? t[0].toUpperCase() + t.slice(1) : t) : w;
}).join(' ');
const mayus = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const anioDe = x => { const a = (x.anios || [])[0]; return a != null ? String(a) : ''; };

// ---------- lo que no trae el catálogo publicado, deducido de sus ids y rótulos
function deducir(x) {
  const id = String(x.id), o = { tema: null, grupo: null, familia: x.familia || null, miembro: null, medida: null, tipo: null, padre: null, seccion: null, corto: null };
  let m;
  if (x.proveedor) {
    if (id === 'fronteras') return { ...o, tema: 'fronteras', grupo: 'Fronteras de cada año', corto: 'Fronteras de cada año' };
    if (/^capa_|^fronteras_/.test(id)) return { ...o, tema: x.tema, grupo: x.grupo, corto: x.rotulo };
    if (x.tema !== 'poblacion') return null;   // los demás temas de los timelapses ya están en el catálogo
    const hab = /habit/.test(id);
    return { ...o, tema: 'poblacion', grupo: hab ? 'Habitantes' : 'Densidad', familia: 'poblacion_tl', miembro: hab ? 'hab' : 'dens', medida: /anual/.test(id) ? 'anual' : 'censos', corto: hab ? 'Habitantes' : 'Densidad de población' };
  }
  if ((m = /^usos_(.+)_(ha|pct)$/.exec(id))) return { ...o, tema: 'agrario', grupo: 'Superficie y usos del suelo', familia: 'usos', miembro: m[1], medida: m[2], seccion: SECCION[x.grupo_cat] || null, corto: mayus(conTildes(m[1])) };
  if ((m = /^cosecha_(?:[gp]_)?(.+)_(prod_t|sup_ha|rend_kgha)$/.exec(id))) {
    const tipo = /^cosecha_p_/.test(id) || /producto/.test(x.rotulo || '') ? 'producto' : 'grupo';
    return { ...o, tema: 'agrario', grupo: 'Tipo de cultivo', familia: 'cosecha_' + tipo, miembro: m[1], medida: m[2], tipo, padre: tipo === 'producto' ? (x.grupo_cat || null) : null, corto: mayus(conTildes(m[1])) };
  }
  if ((m = /^ganado(\d{4})_(.+)$/.exec(id))) return { ...o, tema: 'agrario', grupo: 'Ganado', familia: 'ganado' + m[1], miembro: m[2], medida: 'cabezas', corto: mayus(conTildes(m[2])) };
  if ((m = /^empleo_pct_(.+)$/.exec(id))) return { ...o, tema: 'trabajo', grupo: 'Estructura del empleo', familia: 'empleo', miembro: m[1], medida: 'pct', corto: mayus(conTildes(m[1])) };
  if (id === 'clima_mensual') return { ...o, tema: 'clima', grupo: 'Climograma', corto: 'Normales de cada mes' };
  if ((m = /^clima_(tmed|tmax|tmin|prec)(_anom)?$/.exec(id))) {
    const t = m[1] !== 'prec', nom = { tmed: 'Temperatura media', tmax: 'Temperatura máxima', tmin: 'Temperatura mínima' }[m[1]];
    if (m[2]) return { ...o, tema: 'clima', grupo: 'Anomalías', corto: t ? `${nom} frente a 1961-1990` : 'Precipitación frente a 1961-1990' };
    return { ...o, tema: 'clima', grupo: t ? 'Temperatura' : 'Precipitación', corto: t ? `${nom} anual` : 'Precipitación anual' };
  }
  if (/^geo_/.test(id)) return { ...o, tema: 'geografia', grupo: /altitud|pendiente|rugosidad/.test(id) ? 'Relieve' : /suelo/.test(id) ? 'Suelo' : 'Agua y costa', corto: x.rotulo };
  if (/^fronteras_/.test(id)) return { ...o, tema: 'fronteras', grupo: 'Número de municipios', corto: x.rotulo };
  if (/^pob/.test(id)) return { ...o, tema: 'poblacion', grupo: /hog/.test(id) ? 'Hogares' : /dens/.test(id) ? 'Densidad' : 'Habitantes', corto: x.rotulo };
  const t = TEMA_DE[x.tema];
  return t ? { ...o, tema: t, grupo: x.grupo || x.tema, corto: x.rotulo } : null;
}

// ---------- lo que trae el catálogo v4 (si lo trae)
function delCatalogo(x) {
  if (!x.familia && !x.rotulo_corto && !x.tema_rotulo) return null;
  const d = deducir(x) || {};
  const tem = TEMA_DE[x.tema] || x.tema;
  return {
    tema: tem, grupo: tem === 'fronteras' ? (d.grupo || 'Número de municipios') : (x.grupo || d.grupo), familia: x.familia || null, miembro: x.miembro || null,
    medida: x.medida || null, tipo: x.tipo_miembro || null, padre: x.tipo_miembro === 'producto' ? (x.grupo_origen || null) : null,
    seccion: x.familia === 'usos' ? (SECCION[x.grupo_origen] || null) : null,
    corto: x.miembro_rotulo ? mayus(conTildes(x.miembro_rotulo)) : (x.rotulo_corto || d.corto || x.rotulo),
  };
}

// ---------- árbol
let ARBOL = null;
export function arbol() { return ARBOL; }

export function construir(cat) {
  const porInd = new Map();
  const temas = TEMAS.map(t => ({ ...t, grupos: [] }));
  const T = new Map(temas.map(t => [t.id, t]));
  const info = new Map();
  for (const x of cat) {
    if (x.en_arbol === false) continue;   // ronda v15: siguen para la ficha, no en el árbol ni en el buscador
    if (/^(fronteras_n_municipios|fronteras_n_municipios_hoy|capa_fronteras|fronteras_ensenada)$/.test(x.id)) continue;   // Ensenada: en «Fronteras de cada año», 1752 (v17)   // Fronteras, más sencillo (Juan, v15)
    const d = (META.temas && !x.proveedor ? delCatalogo(x) : null) || deducir(x);
    if (!d || !T.has(d.tema)) continue;
    // si la población ya está en el catálogo, los temas de los timelapses de población sobran
    if (x.proveedor && d.tema === 'poblacion' && cat.some(y => !y.proveedor && /^pob/.test(y.id))) continue;
    info.set(x.id, { x, d });
  }
  // grupos en el orden del catálogo v4 si lo trae; si no, en el orden fijado arriba
  const ordenGrupo = (tema, g) => {
    if (tema === 'fronteras' || tema === 'transporte' || g === 'Capas del territorio') { const k = (ORDEN_GRUPOS[tema] || []).indexOf(g); return k < 0 ? 99 : k - 100; }
    const mt = META.temas && META.temas.find(t => t.id === tema);
    const mg = mt && (mt.grupos || []).find(y => y.rotulo === g);
    if (mg && mg.orden != null) return mg.orden;
    const k = (ORDEN_GRUPOS[tema] || []).indexOf(g);
    return k < 0 ? 99 : k;
  };
  const ordenInd = id => { const e = info.get(id); return e && e.x.orden != null ? e.x.orden : [...info.keys()].indexOf(id); };
  // los productos de cosecha, después de sus grupos (cuelgan de ellos)
  const esProd = id => (info.get(id).d.tipo === 'producto' ? 1 : 0);
  const ids = [...info.keys()].sort((a, b) => esProd(a) - esProd(b) || ordenInd(a) - ordenInd(b));
  const conceptos = new Map();   // clave → concepto
  for (const id of ids) {
    const { x, d } = info.get(id);
    const tema = T.get(d.tema);
    let g = tema.grupos.find(y => y.rotulo === d.grupo);
    if (!g) { g = { rotulo: d.grupo, orden: ordenGrupo(d.tema, d.grupo), conceptos: [] }; tema.grupos.push(g); }
    const base = d.familia ? d.familia.replace(/\d{4}$/, '') : null;
    const clave = base && d.miembro ? `${d.tema}|${base}|${d.miembro}` : `${d.tema}|${id}`;
    let c = conceptos.get(clave);
    if (!c) {
      c = { clave, rotulo: d.corto || x.rotulo, tema: tema.id, grupo: g, seccion: d.seccion, tipo: d.tipo, variantes: [], hijos: [], padre: null };
      conceptos.set(clave, c);
      // un producto de cosecha cuelga de su grupo de producto (si tienen el mismo nombre, sobra: es la misma cifra)
      const padre = d.tipo === 'producto' && d.padre ? conceptos.get(`${d.tema}|cosecha_grupo|${d.padre}`) : null;
      if (padre && padre.rotulo.toLowerCase() === c.rotulo.toLowerCase()) { conceptos.set(clave, padre); c = null; }
      else if (padre) { c.padre = padre; padre.hijos.push(c); }
      else g.conceptos.push(c);
    }
    if (!c) { porInd.set(id, { tema, grupo: g, concepto: conceptos.get(clave), variante: null, alias: true }); continue; }
    c.variantes.push({ ind: id, familia: d.familia, medida: d.medida, anio: anioDe(x), unidad: x.unidad });
  }
  // eje de cada concepto (qué distingue a sus variantes) y etiqueta de cada variante
  for (const c of new Set(conceptos.values())) {
    const vs = c.variantes;
    const fams = new Set(vs.map(v => v.familia)), meds = new Set(vs.map(v => v.medida));
    c.eje = vs.length < 2 ? '' : fams.size > 1 ? 'fecha' : meds.size > 1 ? (c.tema === 'poblacion' ? 'serie' : 'medida') : 'medida';
    c.ejeRotulo = EJE[c.eje] || '';
    for (const v of vs) v.etiqueta = c.eje === 'fecha' ? v.anio : v.medida === 'pct' && v.unidad === '% de la superficie' ? v.unidad : (MEDIDA[v.medida] || {}).r || v.medida || '';
    vs.sort((a, b) => (c.eje === 'fecha' ? (+a.anio || 0) - (+b.anio || 0) : ((MEDIDA[a.medida] || {}).orden || 9) - ((MEDIDA[b.medida] || {}).orden || 9)));
    for (const v of vs) porInd.set(v.ind, { tema: T.get(c.tema), grupo: c.grupo, concepto: c, variante: v });
  }
  for (const t of temas) t.grupos.sort((a, b) => a.orden - b.orden);
  // sin `orden` en el catálogo, los usos del suelo van por secciones (labor, leñosos, dehesa, monte…)
  const SEC = ['Labor', 'Leñosos', 'Dehesa', 'Monte y pasto', 'Inculto y no agrario', 'Sin clasificar'];
  for (const t of temas) for (const g of t.grupos) {
    if (!g.conceptos.some(c => c.seccion) || g.conceptos.some(c => info.get(c.variantes[0].ind).x.orden != null)) continue;
    g.conceptos = g.conceptos.map((c, k) => [c, k]).sort((a, b) => (SEC.indexOf(a[0].seccion) - SEC.indexOf(b[0].seccion)) || a[1] - b[1]).map(x => x[0]);
  }
  ARBOL = { temas: temas.filter(t => t.grupos.length), porInd };
  return ARBOL;
}

export const ubicar = id => (ARBOL && ARBOL.porInd.get(id)) || null;
export const tema = id => (ARBOL && ARBOL.temas.find(t => t.id === id)) || null;
// el indicador con que abre un tema: el primero de su primer grupo
export function primeroDe(temaId) {
  const t = tema(temaId);
  const c = t && t.grupos[0] && t.grupos[0].conceptos[0];
  return c ? c.variantes[0].ind : null;
}
// un indicador por familia, miembro y medida (los atajos viejos, sin fijar ids)
export function buscar({ tema: t, familia, miembro, medida, id }) {
  if (!ARBOL) return null;
  if (id && ARBOL.porInd.has(id)) return id;
  for (const [ind, u] of ARBOL.porInd) {
    if (u.alias || !u.variante) continue;
    if (t && u.tema.id !== t) continue;
    if (familia && !(u.variante.familia || '').startsWith(familia)) continue;
    if (miembro && !u.concepto.clave.endsWith('|' + miembro)) continue;
    if (medida && u.variante.medida !== medida) continue;
    return ind;
  }
  return null;
}
// lista plana de conceptos de un tema (para el buscador)
export function todos() {
  const out = [];
  for (const t of (ARBOL ? ARBOL.temas : [])) for (const g of t.grupos) for (const c of g.conceptos) { out.push(c); out.push(...c.hijos); }
  return out;
}
