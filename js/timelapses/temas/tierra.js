// tierra.js — tema «La tierra, 1752-2020»: usos del suelo por municipio de hoy en ocho cortes.
// Datos: data/v2/series/usos_suelo.json → datos[corte][clase] = {ha, e, s, q, mn?, mx?} alineados con `ine`.
// Superficie del término: propiedad `ha` de la geometría de hoy. Comparabilidad de cada clase: clases[c].comp[corte].

import { RAMPAS, CAT_USOS, escalaLineal, fmt } from '../escalas.js';
import { estadoPorReady, AVISO, provinciasEnReserva, reservasDe, provDe, listaProvincias, cargaTerminos1752, fichaUnidad1752 } from './base.js';
import { entero } from '../../atlas2/fmt.js';

// Grupos que se enseñan (suma de clases comunes). La comparabilidad se toma de la clase principal del grupo.
const GRUPOS = {
  olivar: { art: 'el olivar', etiqueta: 'Olivar', clases: ['olivar'], rampa: RAMPAS.olivar, max: 0.8, color: CAT_USOS.olivar },
  labor: { art: 'la labor', etiqueta: 'Labor', clases: ['labor', 'labor_de_rotacion_larga'], rampa: RAMPAS.labor, max: 0.9, color: CAT_USOS.labor },
  vina: { art: 'la viña', etiqueta: 'Viña', clases: ['vina'], rampa: RAMPAS.vina, max: 0.4, color: CAT_USOS['viña'] },
  monte: { art: 'el monte y pasto', etiqueta: 'Monte y pasto', clases: ['monte_arbolado', 'monte_bajo', 'dehesa_pasto'], principal: 'monte_bajo', rampa: RAMPAS.monte, max: 1, color: CAT_USOS.monte },
  regadio: { etiqueta: 'Regadío y huerta', clases: ['regadio_huerta'], color: CAT_USOS.regadio },
  dehesa: { etiqueta: 'Dehesa con cultivo', clases: ['dehesa_agricola'], color: CAT_USOS.dehesa },
  lenosos: { etiqueta: 'Otros leñosos', clases: ['frutales', 'lenosos_mixtos_y_otros'], color: CAT_USOS.frutales },
  inculto: { etiqueta: 'Inculto y no agrario', clases: ['inculto', 'no_agrario'], color: CAT_USOS.improductivo },
};
const DOMINANTE = ['olivar', 'labor', 'vina', 'monte', 'regadio', 'dehesa', 'lenosos', 'inculto'];
const ANIO = { '1752': 1752, 'hacia 1880': 1880 };
// ids del catálogo data/v2/fuentes.json para cada corte (el texto completo de cortes_info.fuente_original va en la nota)
const FUENTES = {
  '1752': ['ENSENADA-1752'], 'hacia 1880': ['RESENA-1888', 'JCA-1891-CEREAL'],
  '1956': ['MUCVA-1956'], '1977': ['MUCVA-1977'], '1984': ['MUCVA-1984'], '1999': ['MUCVA-1999'], '2007': ['MUCVA-2007'],
  '2020': ['SIPNA-2020'],
};

const T = {
  id: 'tierra',
  kicker: 'Timelapse 02 · La tierra',
  titulo: 'La tierra',
  subtitulo: 'Olivar, labor, viña, monte, dehesa, regadío: qué ocupaba cada término y cómo cambió.',
  entradilla: 'Parte del término municipal de hoy que ocupa cada uso, en ocho cortes de 1752 a 2020. Las fuentes clasifican distinto: no todas las clases se comparan entre cortes.',
  periodo: '1752 – 2020',
  acento: '#5f8a2a',
  rampa: RAMPAS.olivar,
  estado: estadoPorReady(['usos_suelo'], 'data/v2/series/usos_suelo.json', '1752 en revisión'),
  vistas: [
    { id: 'olivar', etiqueta: 'Olivar' },
    { id: 'labor', etiqueta: 'Labor' },
    { id: 'vina', etiqueta: 'Viña' },
    { id: 'monte', etiqueta: 'Monte y pasto' },
    { id: 'dominante', etiqueta: 'Uso dominante' },
  ],
  textoEstimado: 'estimado (repartido o imputado)',
  claveReservas: 'usos_suelo',   // tema de data/v2/reservas.json
};

let D, HA, NOMBRE, HA_AND, ESC = {}, T52, N52, NMUN;

T.cargar = async ({ cargar, geo }) => {
  D = await cargar('series/usos_suelo.json');
  HA = new Map(); NOMBRE = new Map();
  for (const g of geo.objects.municipios.geometries) { HA.set(g.properties.c, g.properties.ha); NOMBRE.set(g.properties.c, g.properties.n); }
  HA_AND = D.ine.reduce((s, c) => s + (HA.get(c) || 0), 0);
  for (const [k, g] of Object.entries(GRUPOS)) if (g.rampa) ESC[k] = escalaLineal(0, g.max, g.rampa);
  T.idx = new Map(D.ine.map((c, j) => [c, j]));
  // 1752 va por unidad estable (términos compartidos: por municipio superarían su término)
  T52 = await cargaTerminos1752(cargar);
  const U = D.ue1752_col;
  N52 = { ids: U.ids, datos: U.datos, idx: new Map(U.ids.map((u, j) => [u, j])), ha: u => (T52.props.get(u) || {}).ha, unidad: true };
  NMUN = {};
};

// nivel de cada corte: 1752 por unidad estable; los demás por municipio de hoy
function nivel(ct) {
  if (ct === '1752') return N52;
  return NMUN[ct] || (NMUN[ct] = { ids: D.ine, datos: D.datos[ct], idx: T.idx, ha: c => HA.get(c), unidad: false });
}
T.capaDe = (i) => T.fotogramas[i].corte === '1752' ? T52.capa : null;

// ha de un grupo en un corte para el municipio j: suma de las clases con cifra; null si ninguna la tiene
function haGrupo(corte, g, j) {
  const dd = nivel(corte).datos;
  let s = null, est = false;
  for (const k of GRUPOS[g].clases) {
    const c = dd[k]; if (!c) continue;
    const v = c.ha[j];
    if (v == null) continue;
    s = (s || 0) + v;
    if (c.e[j] === '1') est = true;
  }
  return { v: s, est };
}

function dominante(corte, j) {
  let best = null, bv = -1, est = false, any = false;
  for (const g of DOMINANTE) {
    const r = haGrupo(corte, g, j);
    if (r.v == null) continue;
    any = true;
    if (r.v > bv) { bv = r.v; best = g; est = r.est; }
  }
  return any && bv > 0 ? { g: best, est, v: bv } : null;
}

function comparabilidad(corte, g) {
  const cl = GRUPOS[g].principal || GRUPOS[g].clases[0];
  const ids = (D.clases[cl] && D.clases[cl].comp[corte]) || [];
  return ids.map(i => D.textos[i]).filter(Boolean);
}

T.preparar = (vista) => {
  T.fotogramas = D.cortes.map(ct => {
    const info = D.cortes_info[ct] || {};
    const anio = ANIO[ct] || +ct;
    const f = { clave: ct, anio, etiqueta: ct, corto: ct === 'hacia 1880' ? '≈1880' : ct, hito: true, corte: ct,
      fuentes: info.fid || FUENTES[ct] || [],
      fuentesTexto: (info.fid || FUENTES[ct]) ? [] : (info.fuente_original || []), avisos: [] };
    if (ct === '1752') {
      f.revision = true;
      f.avisos.push(AVISO.revision, AVISO.supuesto);
      f.avisos.push(AVISO.accent('No cierra con la superficie del término: es lo declarado'));
    }
    if (ct === 'hacia 1880') f.avisos.push(AVISO.accent('Año real según el municipio: entre 1872 y 1890'));
    const notas = [];
    if (vista !== 'dominante') {
      const comp = comparabilidad(ct, vista);
      if (comp.length) notas.push(`Comparabilidad de la clase: ${comp.join(' · ')}`);
    } else notas.push('Uso dominante: el grupo de clases con más hectáreas en el término. Las clases no son del todo comparables entre cortes.');
    if (ct === '1752') {
      const n = T52.avisos ? T52.avisos.n : null;
      notas.unshift(`1752 se pinta por unidad estable (términos de 1752, geometría candidata y límites supuestos), no por municipio: hay términos compartidos que, vistos por municipio, superan su término${n ? ` (${n} municipios, avisos de 1752)` : ''}.`);
    }
    if (info.cierra) notas.push(`¿Cierra con el término? ${info.cierra}`);
    f.nota = notas.join(' ');
    return f;
  });
  T.temporal = true;
  T.frases = frases(vista);
};

T.relleno = (i, vista) => {
  const ct = T.fotogramas[i].corte;
  const N = nivel(ct);
  if (vista === 'dominante') {
    return (c) => {
      const j = N.idx.get(c); if (j == null) return { nd: true };
      const r = dominante(ct, j);
      return r ? { color: GRUPOS[r.g].color, est: r.est } : { nd: true };
    };
  }
  const esc = ESC[vista];
  return (c) => {
    const j = N.idx.get(c); if (j == null) return { nd: true };
    const r = haGrupo(ct, vista, j);
    if (r.v == null || !N.ha(c)) return { nd: true };
    return { color: esc(r.v / N.ha(c)), est: r.est };
  };
};

// Totales de Andalucía de un corte: sin las provincias que ese corte tiene con reserva (reservas.json).
// `area` es la superficie de los municipios que sí cuentan, para que el % no se lea sobre toda Andalucía.
function fuera(ct) { return provinciasEnReserva(T.claveReservas, ct); }
function totalGrupo(ct, g) {
  const ex = fuera(ct), N = nivel(ct);
  let s = 0, n = 0, area = 0;
  for (let j = 0; j < N.ids.length; j++) {
    const c = N.ids[j];
    if (ex.has(provDe(c))) continue;
    area += N.ha(c) || 0;
    const r = haGrupo(ct, g, j); if (r.v != null) { s += r.v; n++; }
  }
  return { s, n, area, ex, uds: N.unidad ? 'unidades de 1752' : 'municipios' };
}
function textoReserva(ex, ct) {
  return `sin contar ${listaProvincias(ex)}, con reserva`;
}

T.cifra = (i, vista) => {
  const ct = T.fotogramas[i].corte;
  if (vista === 'dominante') {
    const cnt = {}, ex = fuera(ct), N = nivel(ct);
    let n = 0;
    for (let j = 0; j < N.ids.length; j++) {
      if (ex.has(provDe(N.ids[j]))) continue;
      const r = dominante(ct, j); if (r) { cnt[r.g] = (cnt[r.g] || 0) + 1; n++; }
    }
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (!top) return { valor: '—', etiqueta: 'sin dato' };
    return { valor: entero(top[1]), unidad: N.unidad ? 'unidades de 1752' : 'municipios', etiqueta: `con ${GRUPOS[top[0]].etiqueta.toLowerCase()} como uso dominante (de ${entero(n)} con dato${ex.size ? ', ' + textoReserva(ex, ct) : ''})` };
  }
  const t = totalGrupo(ct, vista);
  const g = fmt.grande(t.s);
  const donde = t.ex.size ? `${fmt.pct1(t.s / t.area)} del resto de Andalucía, ${textoReserva(t.ex, ct)}` : `${fmt.pct1(t.s / HA_AND)} de Andalucía`;
  return { valor: g.v, unidad: (g.u ? g.u + ' de ' : '') + 'ha', etiqueta: `de ${GRUPOS[vista].etiqueta.toLowerCase()} en ${entero(t.n)} ${t.uds} con dato · ${donde}` };
};

// en la mini serie, un corte con reserva no da punto (su total no es comparable con los demás)
T.serie = (vista) => vista === 'dominante' ? null : T.fotogramas.map((f, i) => { const t = totalGrupo(f.corte, vista); return { i, v: t.ex.size ? null : t.s }; });
T.sparkCero = true;
// valor numérico (fracción del término) de un municipio de hoy; 1752 va por unidad estable y el uso dominante no es una cifra
T.valor = (i, c, vista) => {
  const ct = T.fotogramas[i].corte;
  if (ct === '1752' || vista === 'dominante') return null;
  const j = T.idx.get(c); if (j == null || !HA.get(c)) return null;
  const r = haGrupo(ct, vista, j);
  return r.v == null ? null : { v: r.v / HA.get(c), est: r.est };
};
T.unidadDe = () => '% del término';
T.escalaDe = (vista) => ESC[vista] || null;

T.leyenda = (i, vista) => {
  if (vista === 'dominante') {
    return { tipo: 'categorias', titulo: 'Uso con más superficie', items: DOMINANTE.map(g => ({ color: GRUPOS[g].color, etiqueta: GRUPOS[g].etiqueta })) };
  }
  const e = ESC[vista];
  return { tipo: 'continua', escala: e, titulo: `${GRUPOS[vista].etiqueta} · % del término`, formato: v => fmt.pct(v),
    ticks: d3.ticks(0, GRUPOS[vista].max, 4) };
};

T.detalle = (i, c, d) => {
  const vista = T._v || 'olivar';
  const f = T.fotogramas[i], ct = f.corte, N = nivel(ct), j = N.idx.get(c);
  let nombre = NOMBRE.get(c) || d.n;
  const lineas = [];
  if (N.unidad) {
    const fu = fichaUnidad1752(T52.props.get(c), x => NOMBRE.get(x));
    nombre = fu.titulo; lineas.push(...fu.lineas);
    const av = (T52.avisos && T52.avisos.por_unidad && T52.avisos.por_unidad[c]) || [];
    if (av.length) lineas.push(`Vista por municipio superaría su término: ${av.map(x => NOMBRE.get(x) || x).join(', ')}`);
  }
  if (j == null) return { titulo: nombre, sub: ct, nd: true, lineas };
  if (ct === 'hacia 1880' && D.anio_mun_1880[c]) lineas.push(`Año del dato: ${D.anio_mun_1880[c].join(', ')}`);
  const av = (!N.unidad && D.avisos[ct] && D.avisos[ct][c]) || [];
  for (const k of av.slice(0, 2)) { const t = D.textos[k]; if (t) lineas.push(t.length > 130 ? t.slice(0, 127) + '…' : t); }
  if (vista === 'dominante') {
    const r = dominante(ct, j);
    if (!r) return { titulo: nombre, sub: ct, nd: true, lineas };
    return { titulo: nombre, sub: ct, valor: `${GRUPOS[r.g].etiqueta}: ${fmt.pct(r.v / N.ha(c))} del término`, est: r.est, lineas };
  }
  const r = haGrupo(ct, vista, j);
  if (r.v == null) return { titulo: nombre, sub: ct, nd: true, lineas };
  const est = GRUPOS[vista].clases.map(k => N.datos[k]).filter(Boolean).map(x => D.estados[x.s[j]]).filter(Boolean);
  if (r.est && est.length) lineas.push([...new Set(est)].join('; '));
  return { titulo: nombre, sub: ct, valor: `${fmt.pct(r.v / N.ha(c))} del término · ${entero(r.v)} ha`, est: r.est, lineas };
};

T.ritmo = () => 2600;
T.acentoDe = (v, oscuro) => v === 'dominante' ? null : GRUPOS[v].rampa(oscuro ? 0.42 : 0.75);
T.visor = (i, vista) => {
  const ct = T.fotogramas[i].corte;
  const cl = vista === 'dominante' ? 'olivar' : (GRUPOS[vista].principal || GRUPOS[vista].clases[0]);
  return `visor.html#cat=suelo&ind=pct_s_${cl}&view=map&year=${ANIO[ct] || ct}`;
};

function frases(vista) {
  const F = D.cortes;
  const out = [];
  out.push({ i: 0, texto: '1752: lo que declaró cada pueblo al Catastro de Ensenada, por unidad estable. No cierra con la superficie del término.' });
  if (vista === 'dominante') {
    for (const [k, ct] of F.entries()) {
      if (k === 0) continue;
      let n = 0; for (let j = 0; j < nivel(ct).ids.length; j++) { const r = dominante(ct, j); if (r && r.g === 'olivar') n++; }
      if (ct === '1956' || ct === '2020') out.push({ i: k, texto: `${ct}: el olivar es el uso con más superficie en ${entero(n)} municipios.` });
    }
  } else {
    const tot = F.map(ct => totalGrupo(ct, vista).s);
    const et = GRUPOS[vista].etiqueta.toLowerCase();
    const k56 = F.indexOf('1956'), ku = F.length - 1;
    if (k56 > 0) out.push({ i: k56, texto: `1956: primer corte con dato en los ${D.ine.length} municipios. El ${fmt.pct1(tot[k56] / HA_AND)} de Andalucía es ${et}.` });
    if (ku > k56 && tot[k56]) {
      const v = (tot[ku] - tot[k56]) / tot[k56];
      out.push({ i: ku, texto: `De 1956 a 2020 ${GRUPOS[vista].art} ${v >= 0 ? 'gana' : 'pierde'} un ${fmt.pct(Math.abs(v))} de superficie. Ojo: 2020 cambia de fuente y parte del cambio es de leyenda.` });
    }
  }
  const k80 = F.indexOf('hacia 1880');
  if (k80 > 0) {
    let rep = 0, tot = 0;
    for (const c of Object.values(D.datos['hacia 1880'])) for (const st of c.s) { if (st !== '-' && st !== 'y') { tot++; if (st === 'c') rep++; } }
    const ex = fuera('hacia 1880');
    out.push({ i: k80, texto: ex.size
      ? `Hacia 1880, con reserva en ${listaProvincias(ex)}: allí este corte no es definitivo. Cada municipio con su año (1872 a 1890).`
      : `Hacia 1880: cada municipio con su año (1872 a 1890). ${fmt.pct(rep / tot)} de las cifras se reparten desde una unidad mayor.` });
  }
  out.sort((a, b) => a.i - b.i);
  out.forEach((x, k) => { x.hasta = out[k + 1] ? out[k + 1].i - 1 : x.i; });
  return out;
}

const prep = T.preparar; T.preparar = (v) => { T._v = v; prep(v); };

export default T;
