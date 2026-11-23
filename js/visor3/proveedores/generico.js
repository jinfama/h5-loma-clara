// generico.js — proveedor para cualquier indicador de data/v2/visor/indicadores.json leído de
// visor/valores/<ind>__<nivel>.json. Da al motor lo mismo que un tema de timelapses: fotogramas, relleno, leyenda,
// cifra (de Andalucía, si existe el fichero de ese nivel), frases sacadas de los datos y ficha del puntero.

import { valores, valoresSiHay, corteDe, aniosBase, variantesDe, varianteElegida, aniosAtlas, tramoAtlas } from '../datos.js';
import { geometria, nivel as defNivel } from '../niveles.js';
import { escalaDe, registrarEscala, esCategorico, escalaCategorica } from '../escala.js';
import { INSIGNIAS } from '../../atlas2/leyenda.js';
import { entero, decimal } from '../../atlas2/fmt.js';
import { estado } from '../estado.js';
import { etiquetaFecha } from '../../fronteras/datos.js';
import { marcaMinimo } from '../minimo1752.js';   // minimo1752
import { esIntensidad, difFrente, textoFrente, formatoFrente, cortesFrente, refAndalucia, notaRef, REF_NO_COMPLETA } from '../frente.js';
// periodo de un indicador fijo (transporte: «época romana», «segunda mitad del siglo XVIII»…), con mayúscula para el año grande
const mayus = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);

// escala pedida por el usuario (estado.esc: 'log' | 'lin' | ''); '' = la del catálogo. Una divergente no se toca.
// un periodo no es una cifra: la despoblación se calcula sobre los censos de esos años, y así se dice, en pequeño
const rotuloPeriodo = ent => { const m = /^poblacion_(anio|perdida)_max$/.test(ent.id || '') && /^(\d{4})\D+(\d{4})$/.exec(String(ent.periodo || '')); return m ? `Censos de ${m[1]} a ${m[2]}` : ''; };
export function escalaPedida(ent) {
  const e = estado.esc;
  const cat = typeof ent.escala === 'string' ? ent.escala : (ent.escala && ent.escala.tipo) || '';
  if (cat === 'divergente' || !e) return '';
  return e === 'log' ? 'log' : 'lineal';
}

const NOTA_POB_ANTIGUA = 'Población de 1752 y 1787: construida con las decisiones firmadas; pendiente de la aceptación de conjunto del responsable de la base';
const AV = {
  supuesto: { tipo: 'supuesto', texto: INSIGNIAS.supuesto },
  candidata: { tipo: 'candidata', texto: INSIGNIAS.candidata },
  estimado: t => ({ tipo: 'estimado', texto: t }),
};
const num = a => (typeof a === 'number' ? a : +(String(a).match(/\d{4}/) || [NaN])[0]);

const fmtPct = p => `${(Math.round(+p * 10) / 10).toLocaleString('es-ES')} %`;

// la unidad que se escribe detrás de la cifra: si empieza por «%», el formato ya lo puso («74 %» y no «74 % % de…»)
function unidadTras(ent) {
  const u = String(ent.unidad || '');
  return /^%/.test(u) ? u.replace(/^%\s*/, '') : u;
}

// Años con fuente: la barra de tiempo enseña por defecto solo los años con cifra de fuente (`anios_fuente` del catálogo
// o del fichero); con `estado.interp` («ver también años interpolados»), todos. `s.F` es la lista vigente.
function conFiltro(s, todos, anios, anual = null) {
  const af = anios && anios.length ? new Set(anios.map(String)) : null;
  s.Ftodos = todos;
  s.hayInterpolados = !!af && todos.some(f => !af.has(String(f.clave)));
  let k = null, F = todos;
  Object.defineProperty(s, 'F', {
    configurable: true,
    get() {
      const kk = estado.interp && anual && anual.length > todos.length ? 'a' : estado.interp || !af ? 't' : 'f';
      if (kk !== k) {
        k = kk;
        F = kk === 'a' ? anual : kk === 't' ? todos : todos.filter(f => af.has(String(f.clave)));
        if (!F.length) F = todos;
        s.geos = new Map();
      }
      return F;
    },
  });
}

// años de fuente con las variantes del mismo año juntas («2019-04» y «2019-11» cuentan como 2019)
const baseAf = af => (Array.isArray(af) ? [...new Set(af.map(x => { const m = /^(\d{4})[-_.].+$/.exec(String(x)); return m ? +m[1] : x; }))] : af);
export function proveedorGenerico(ent) {
  const st = {};   // por nivel: {d, and, F, todos, geos: Map(clave → geo)}; la escala se calcula según `estado.esc`
  const escs = new Map();
  const CATEG = esCategorico(ent);
  // «Cambio respecto a [año]» (ronda v16, Juan, despoblación): (cifra del año / cifra del año base − 1) × 100, con clases
  // divergentes y simétricas fijas para todo el timelapse; si alguna de las dos cifras es estimada, el resultado también
  const CAMBIA = /^poblacion_(hab|densidad)$/.test(ent.id);
  const baseCmb = (niv) => {
    if (!CAMBIA || !estado.cmb || niv === 'termino') return null;
    const s = st[niv]; if (!s || !s.d || s.sinNivel) return null;
    const pedido = +estado.cmb;
    const f = s.F.reduce((b, x) => (Math.abs(+x.anio - pedido) < Math.abs(+b.anio - pedido) ? x : b), s.F[0]);
    return f ? { clave: f.clave, anio: f.anio, etiqueta: f.etiqueta } : null;
  };
  const cmbCache = new Map();
  const cambioDe = (niv, clave, b) => {
    const key = `${niv}|${clave}|${b.clave}`;
    if (cmbCache.has(key)) return cmbCache.get(key);
    const s = st[niv], c = corteDe(s.d, clave), cb = corteDe(s.d, b.clave);
    let r = null;
    if (c && cb) {
      const pos = new Map(cb.ids.map((id, j) => [String(id), j]));
      const v = [], est = [];
      c.ids.forEach((id, j) => {
        const jb = pos.get(String(id)), x = c.v[j], y = jb == null ? null : cb.v[jb];
        v.push(x == null || y == null || !(y > 0) ? null : (x / y - 1) * 100);
        est.push(/[14]/.test(((c.f || '')[j] || '') + (jb == null ? '' : ((cb.f || '')[jb] || ''))));
      });
      r = { v, est, pos: new Map(c.ids.map((id, j) => [String(id), j])) };
    }
    cmbCache.set(key, r);
    return r;
  };
  const escCmb = (niv, b) => {
    const k = `cmb|${niv}|${b.clave}`;
    if (!escs.has(k)) {
      const todos = [];
      for (const f of st[niv].F) { const r = cambioDe(niv, f.clave, b); if (r) for (const x of r.v) if (x != null && isFinite(x)) todos.push(x); }
      escs.set(k, escalaDe({ ...ent, cambio: true, minimo: -100, rotulo: `Cambio respecto a ${b.etiqueta}`, unidad: '%', escala: 'divergente' }, todos));
    }
    return escs.get(k);
  };
  // «Frente a Andalucía» (ronda v23): solo con la cifra de Andalucía de la base; nunca una media de municipios
  const PUEDE_AND = esIntensidad(ent);
  const refDe = (niv, clave, obs = !!estado.obs) => { const s = st[niv]; return refAndalucia(s && s.and ? corteDe(s.and, clave) : null, obs, { ind: ent.id, anio: clave }); };
  const andDe = (niv, clave) => { const r = refDe(niv, clave); return r.v == null ? null : r; };
  // ¿se puede comparar algún año? (con todas las cifras). Con «Solo observado» el modo sigue, y los años de referencia
  // estimada salen vacíos con su motivo
  const tieneAnd = (niv) => {
    const s = st[niv]; if (!s || !s.d || s.sinNivel || !s.and) return false;
    if (s._ta == null) s._ta = s.anios.some(a => refDe(niv, a, false).v != null);
    return s._ta;
  };
  const frenteOn = (niv) => estado.ver === 'and' && !estado.interp && !estado.cmb && PUEDE_AND && tieneAnd(niv);
  const frCache = new Map();
  const frenteDe = (niv, clave) => {
    const key = `${niv}|${clave}|${estado.var || ''}|${estado.obs ? 'o' : 't'}`;
    if (frCache.has(key)) return frCache.get(key);
    const c = corteDe(st[niv].d, clave), a = andDe(niv, clave);
    const r = c && a ? { v: Array.from(c.v, x => difFrente(ent, x, a.v)), A: a.v, estA: a.est, notaA: notaRef(a) } : null;
    frCache.set(key, r);
    return r;
  };
  const escFrente = (niv) => {
    const k = `and|${niv}|${estado.var || ''}|${estado.obs ? 'o' : 't'}`;   // los cortes, solo con los años que se comparan en este modo
    if (!escs.has(k)) {
      const vals = [];
      for (const a of st[niv].anios) { const r = frenteDe(niv, a); if (r) for (const x of r.v) if (x != null && isFinite(x)) vals.push(x); }
      const e = escalaDe({ ...ent, frente: true, rotulo: 'Frente a Andalucía', unidad: '', escala: 'divergente', cortesFijos: cortesFrente(ent, vals), formatoPropio: v => formatoFrente(ent, v) }, vals);
      if (e.clases && e.clases.length % 2) { const m = (e.clases.length - 1) / 2, c = e.clases[m]; c.etiqueta = `como Andalucía (${formatoFrente(ent, c.desde)} a ${formatoFrente(ent, c.hasta)})`; }
      escs.set(k, e);
    }
    return escs.get(k);
  };
  // la escala de la cifra original (para escribir la cifra, también en «Frente a Andalucía»)
  const fmtBase = (niv) => { const f = escOrig(niv).formato; registrarEscala(ent.id, escDe(niv)); return f; };
  let escPar = null;   // «Comparar» (ronda v21): las clases de los dos años que se comparan
  const escDe = (niv) => {
    if (escPar && escPar.niv === niv) { registrarEscala(ent.id, escPar.e); return escPar.e; }
    if (frenteOn(niv)) { const e = escFrente(niv); registrarEscala(ent.id, e); return e; }
    const b = baseCmb(niv);
    if (b) { const e = escCmb(niv, b); registrarEscala(ent.id, e); return e; }
    return escOrig(niv);
  };
  const escOrig = (niv) => {
    if (CATEG) { if (!escs.has('cat')) escs.set('cat', escalaCategorica(ent)); registrarEscala(ent.id, escs.get('cat')); return escs.get('cat'); }
    const s = st[niv], tipo = escalaPedida(ent);
    const k = niv + '|' + tipo;
    if (!escs.has(k)) escs.set(k, escalaDe(tipo ? { ...ent, escala: tipo } : ent, s ? s.todos : []));
    const e = escs.get(k);
    registrarEscala(ent.id, e);
    return e;
  };
  const P = {
    id: ent.id, tema: ent.tema, rotulo: ent.rotulo, titulo: ent.rotulo, kicker: ent.grupo || ent.tema, unidad: ent.unidad || '', nota: ent.nota || '',
    niveles: ent.niveles || [], nivel_nativo: ent.nivel_nativo,
    async cargar(niv) {
      if (st[niv]) return;
      const [d, and] = await Promise.all([valores(ent.id, niv), niv === 'andalucia' ? null : valoresSiHay(ent.id, 'andalucia')]);
      if (!d) {
        // la unidad no da cifra a este nivel: todos los recintos llevan la trama «sin dato a este nivel» (no se reparte nada)
        const anios = (ent.anios && ent.anios.length) ? ent.anios.slice() : [''];
        st[niv] = { d: null, and, anios, sinNivel: true, todos: [], geos: new Map() };
        conFiltro(st[niv], anios.map(a => fotogramaSinNivel(ent, niv, a)), null);
        await P.prepararGeo(niv, 0);
        return;
      }
      const anios = aniosBase(d);   // 2019 una vez, aunque tenga abril y noviembre
      const todos = [];
      for (const a of anios) { const c = corteDe(d, a); if (c) for (const v of c.v) if (v != null && isFinite(v)) todos.push(v); }
      st[niv] = { d, and, anios, todos, geos: new Map() };
      // la barra de tiempo enseña solo los años con alguna cifra en este nivel (Juan: «mostrar solo años con datos»)
      const conDato = anios.filter(a => { const c = corteDe(d, a); return c && c.v.some(v => v != null); });
      if (CATEG || ent.sin_interpolar || ent.tema === 'politica' || ent.tema === 'elecciones' || /^elec_/.test(ent.id)) d.__sinInterp = true;   // una categoría, ni unas elecciones (v20), no se interpolan
      const fBase = (conDato.length ? conDato : anios).map(a => fotograma(ent, niv, d, a));
      // «Todo interpolado»: un fotograma por año entre el primero y el último con cifra (los de la base, tal cual)
      const porClave = new Map(fBase.map(f => [String(f.anio), f]));
      const anual = d.__sinInterp || ent.estatico || ent.periodo ? null : aniosAtlas(d).map(y => porClave.get(String(y)) || { ...fotograma(ent, niv, d, y), atlas: true });
      conFiltro(st[niv], fBase, baseAf(d.anios_fuente || ent.anios_fuente || null), anual);
      // geometría del primer fotograma ya lista; las demás se piden al cruzar de corte
      await P.prepararGeo(niv, 0);
    },
    activar() {},
    async prepararGeo(niv, i) {
      const s = st[niv], f = s.F[i];
      const g = await geometria(niv, niv === 'termino' && f.corte ? String(f.corte) : f.anio);   // el corte que trae el dato
      s.geos.set(i, g);
      return g;
    },
    fotogramas: (niv) => st[niv].F,
    hayInterpolados: (niv) => !ent.sin_interpolar && !!(st[niv] && st[niv].hayInterpolados),
    // por épocas (etiquetas_anio): el número es una clave; los pasos, a igual distancia
    temporal: (niv) => !ent.etiquetas_anio && st[niv].F.every(f => isFinite(f.anio)),
    capaDe(i, niv) {
      const g = st[niv].geos.get(i) || [...st[niv].geos.values()].pop();
      return g ? { clave: g.clave, topo: g.topo, objeto: g.objeto, idDe: g.idDe } : null;
    },
    relleno(i, niv) {
      const s = st[niv];
      if (s.sinNivel) return () => ({ nd: true, sn: true });
      const c = corteDe(s.d, s.F[i].clave), esc = escDe(niv), obs = !!estado.obs;
      if (!c) return () => ({ nd: true });
      const b = baseCmb(niv);
      if (b) {
        const r = cambioDe(niv, s.F[i].clave, b);
        if (!r) return () => ({ nd: true });
        return (id) => {
          const k = r.pos.get(String(id)); if (k == null) return { nd: true };
          const x = r.v[k], res = c.res.has(k);
          if (x == null) return { nd: true, res };
          if (obs && r.est[k]) return { nd: true, oculto: true };
          return { color: esc.color(x), v: x, est: r.est[k], res };
        };
      }
      const pos = new Map(c.ids.map((id, k) => [String(id), k]));
      const fr = frenteOn(niv), rFr = fr ? frenteDe(niv, s.F[i].clave) : null;
      if (fr && !rFr) return () => ({ nd: true });   // ese año, sin cifra de Andalucía
      // f = 2 con entrada en `res` es una reserva (se desatura y lleva puntos); f = 2 sin entrada es una unidad en
      // revisión (partidos, ue1752, 1752/1787): se pinta normal y el fotograma lleva la insignia
      return (id) => {
        const k = pos.get(String(id)); if (k == null) return { nd: true };
        const v = c.v[k], f0 = (c.f || '')[k], res = c.res.has(k);
        const fc = c.clase && f0 === '2' && c.clase[k] && c.clase[k] !== '.' ? c.clase[k] : f0;   // 1591: f = 2 en todo; la clase, aparte
        if (v == null || fc === '.') {
          // «nd»: la unidad declara otros usos en esa fecha, pero no este (probablemente no lo había): no es un cero ni
          // un «sin dato»; un tono casi blanco de la escala, sin trama (ronda v17)
          // «ns» (olivar, viña y frutales de 1752): sin superficie declarada en el Catastro (árboles sin medir); tampoco es cero
          const mk = c.mot.get(k);
          if (mk === 'nd' || mk === 'ns') { const e0 = esc.clases && esc.clases[0] ? esc.clases[0].color : '#e8e4da'; return mk === 'nd' ? { color: d3.interpolateRgb(e0, '#ffffff')(0.62), nodecl: true, res } : { color: '#eef3f6', sinmedir: true, res }; }
          return { nd: true, res, sn: c.mot.get(k) === 'n' };
        }
        if (obs && (fc === '1' || fc === '4')) return { nd: true, oculto: true };
        if (fc === 'I') return { color: d3.interpolateRgb(esc.color(v), '#ffffff')(0.42), v, ia: true, res };   // interpolación del Atlas
        const x = c.extra ? c.extra(k) : {};
        // suma parcial: no se pinta como un total (color apagado y borde discontinuo, js/timelapses/mapa.js)
        if (rFr) { const d = rFr.v[k]; if (d == null) return { nd: true, res }; return { color: esc.color(d), v: d, est: fc === '1', est4: fc === '4', calc: fc === '3', res, parcial: !!x.parcial || fc === '5' }; }
        return { color: esc.color(v), v, est: fc === '1', est4: fc === '4', calc: fc === '3', res, parcial: !!x.parcial || fc === '5' };
      };
    },
    leyenda: (i, niv) => (st[niv].sinNivel ? { tipo: 'sinnivel', titulo: `${ent.rotulo}${ent.unidad ? ' · ' + ent.unidad : ''}` } : (() => {
      const sp = escDe(niv).leyenda();
      if (!frenteOn(niv)) return sp;
      const f = st[niv].F[i], a = f ? refDe(niv, f.clave) : null;
      const ref = a && a.v != null ? `Andalucía en ${f.etiqueta}: ${fmtBase(niv)(a.v)}${unidadTras(ent) ? ' ' + unidadTras(ent) : ''}${notaRef(a) ? ` (${notaRef(a)})` : ''}` : `${f ? f.etiqueta + ': ' : ''}${a ? a.motivo : 'ese año no hay cifra de Andalucía'}`;
      // sin ningún año que comparar en este modo no hay cortes: solo el motivo
      if (!escDe(niv).porClases) return { tipo: 'categorias', items: [], frente: true, titulo: `Frente a Andalucía · ${ref}` };
      return { ...sp, frente: true, titulo: `Frente a Andalucía · ${ref}` };
    })()),
    escala: (niv) => escDe(niv),
    // Comparar: clases calculadas sobre esos años (claves); null, las de siempre. Dice si ha cambiado algo
    frenteDisponible: (niv) => PUEDE_AND && tieneAnd(niv),
    // por qué no se ofrece, si hay fichero de Andalucía pero ningún año vale en este modo
    motivoSinFrente(niv) {
      const s = st[niv]; if (!s || !s.and || !s.anios) return '';
      return s.anios.some(a => refDe(niv, a, false).motivo === REF_NO_COMPLETA) ? 'Ningún año tiene una cifra de Andalucía completa.' : '';
    },
    escalaComun(niv, claves) {
      if (!claves || frenteOn(niv)) { const habia = !!escPar; escPar = null; return habia; }   // frente a Andalucía: cortes fijos de todo el periodo
      const s = st[niv];
      if (CATEG || !s || s.sinNivel || !s.d) return false;
      const b = baseCmb(niv);
      const k = `${niv}|${claves.join('|')}|${escalaPedida(ent)}|${estado.cmb}|${estado.interp}|${estado.obs}`;
      if (escPar && escPar.k === k) return false;
      const vals = [];
      for (const cl of claves) {
        const r = b ? cambioDe(niv, cl, b) : corteDe(s.d, cl);
        if (r) for (const v of r.v) if (v != null && isFinite(v)) vals.push(v);
      }
      if (!vals.length) { const habia = !!escPar; escPar = null; return habia; }
      const tipo = escalaPedida(ent);
      const e = b ? escalaDe({ ...ent, cambio: true, minimo: -100, rotulo: `Cambio respecto a ${b.etiqueta}`, unidad: '%', escala: 'divergente' }, vals)
        : escalaDe(tipo ? { ...ent, escala: tipo } : ent, vals);
      escPar = { k, niv, e };
      registrarEscala(ent.id, e);
      return true;
    },
    // máximo del eje entero en ese nivel (burbujas y relieve por dato comparables entre años)
    maximo(niv) {
      const s = st[niv]; if (!s || s.sinNivel || !s.d || CATEG) return null;
      if (s.max != null) return s.max;
      let m = 0;
      for (const f of s.F) { const c = corteDe(s.d, f.clave); if (c) for (const v of c.v) if (v != null && v > m) m = v; }
      s.max = m || null;
      return s.max;
    },
    // burbujas: la cifra más grande en valor absoluto de todo el eje (con «Cambio», la del cambio)
    // el mayor Σ(|cifra| / máximo) de un año: con él se limita cuánto mapa tapan las burbujas
    sumaRelativa(niv) {
      const m = P.maximoAbs(niv), s = st[niv]; if (!(m > 0) || !s) return null;
      const b = baseCmb(niv), fr = frenteOn(niv), k = fr ? `and|${estado.obs ? 'o' : 't'}` : b ? String(b.clave) : '';
      s.sumaR = s.sumaR || {};
      if (k in s.sumaR) return s.sumaR[k];
      let mx = 0;
      for (const a of s.anios) { const r = fr ? frenteDe(niv, a) : b ? cambioDe(niv, String(a), b) : corteDe(s.d, a); if (!r) continue; let t = 0; for (const v of r.v) if (v != null && isFinite(v)) t += Math.abs(v); if (t > mx) mx = t; }
      return (s.sumaR[k] = mx / m);
    },
    maximoAbs(niv) {
      const s = st[niv]; if (!s || s.sinNivel || !s.d || CATEG) return null;
      const b = baseCmb(niv), fr = frenteOn(niv), k = fr ? `and|${estado.obs ? 'o' : 't'}` : b ? String(b.clave) : '';
      s.maxAbs = s.maxAbs || {}; s.signo = s.signo || {};
      if (k in s.maxAbs) return s.maxAbs[k];
      let m = 0, neg = false, pos = false;
      for (const a of s.anios) {
        const r = fr ? frenteDe(niv, a) : b ? cambioDe(niv, String(a), b) : corteDe(s.d, a);
        if (r) for (const v of r.v) if (v != null && isFinite(v)) { if (Math.abs(v) > m) m = Math.abs(v); if (v < 0) neg = true; else if (v > 0) pos = true; }
      }
      s.maxAbs[k] = m || null; s.signo[k] = { neg, pos };
      return s.maxAbs[k];
    },
    // ¿hay cifras negativas o positivas en todo el eje? (leyenda de las burbujas; el relieve no admite negativos)
    signoDe(niv) {
      const s = st[niv]; if (!s || s.sinNivel || !s.d || CATEG) return null;
      P.maximoAbs(niv);
      const b = baseCmb(niv);
      return s.signo[frenteOn(niv) ? `and|${estado.obs ? 'o' : 't'}` : b ? String(b.clave) : ''] || null;
    },
    sinNivel: (niv) => !!(st[niv] && st[niv].sinNivel),
    cifra(i, niv) {
      const s = st[niv]; if (!s.and) return null;
      const c = corteDe(s.and, s.F[i].clave); if (!c) return null;
      // Andalucía sin cifra: se dice por qué (p. ej., «algún municipio no figura en el diccionario en esa fecha»)
      if (c.v[0] == null) { const m = c.mot.get(0); return { valor: '', unidad: '', etiqueta: `Andalucía: sin dato${m ? ' (' + (c.textoMotivo(m) || m) + ')' : ''}` }; }
      const b = baseCmb(niv);
      if (b) {
        const cb = corteDe(s.and, b.clave), y = cb ? cb.v[0] : null;
        if (y == null || !(y > 0)) return { valor: '', unidad: '', etiqueta: `Andalucía: sin cifra en ${b.etiqueta}` };
        const est = /[14]/.test(String(c.f[0] || '') + String(cb.f[0] || ''));
        return { valor: escDe(niv).formato((c.v[0] / y - 1) * 100), unidad: '', etiqueta: `Andalucía · respecto a ${b.etiqueta}${est ? ' (estimado)' : ''}` };
      }
      const x = c.extra ? c.extra(0) : {};
      const marca = { 1: 'estimado', 2: 'con reserva', 3: 'calculado de originales', 4: 'parcialmente estimado', I: 'interpolación del Atlas, no es un dato' }[c.f[0]] || '';
      const partes = [marca, x.pe != null && x.pe > 0 && !(c.f[0] === '1' && x.pe >= 100) ? `${fmtPct(x.pe)} estimado` : ''];
      if (x.parcial || c.f[0] === '5') x.parcial = x.parcial || { n: null, m: null };
      if (x.parcial) partes.unshift(x.parcial.n != null ? `suma parcial: ${entero(x.parcial.n)} de ${entero(x.parcial.m)} unidades con dato` : 'suma parcial');
      return { valor: (frenteOn(niv) ? fmtBase(niv) : escDe(niv).formato)(c.v[0]), unidad: unidadTras(ent), parcial: !!x.parcial, minimo: marcaMinimo(ent.id, 'andalucia', s.F[i].clave, 'AND'), etiqueta: `Andalucía${partes.filter(Boolean).length ? ' (' + partes.filter(Boolean).join(' · ') + ')' : ''}` };
    },
    serieAndalucia(niv) {
      const s = st[niv]; if (!s.and || CATEG) return null;
      // en la mini serie no entran las sumas parciales (no son el total)
      return s.F.map((f, i) => { const c = corteDe(s.and, f.clave); return { i, v: c && c.f[0] !== '2' && c.f[0] !== '5' && !(c.extra && c.extra(0).parcial) ? c.v[0] : null }; });
    },
    frases(niv) { return st[niv].sinNivel ? [] : frasesGenericas(ent, st[niv], frenteOn(niv) ? { formato: fmtBase(niv) } : escDe(niv), CATEG); },
    categorico: CATEG,
    // variantes del año del fotograma (2019: abril y noviembre) y la elegida
    variantes(i, niv) { const s = st[niv]; if (!s || !s.d || !s.F[i]) return null; const l = variantesDe(s.d, s.F[i].clave, ent); return l ? { lista: l, elegida: varianteElegida(l) } : null; },
    detalle(i, id, d, niv) {
      const s = st[niv], f = s.F[i], c = s.d ? corteDe(s.d, f.clave) : null;
      const g = s.geos.get(i);
      const pr = (g && g.props.get(String(id))) || (d && d.props) || {};
      // en términos y unidades estables, primero el pueblo de la fecha (mf) y luego la etiqueta de la unidad (n)
      const fecha = pr.u ? etiquetaFecha(pr) : null;
      const titulo = fecha && fecha !== pr.n ? `${fecha} (unidad estable ${pr.n})` : (pr.n || d.n || id);
      if (s.sinNivel) return { titulo, sub: f.etiqueta, nd: true, sn: true, lineas: ['Sin dato a este nivel: la fuente no da esta cifra por ' + ((defNivel(niv) || {}).rotulo || niv).toLowerCase() + '.'] };
      if (!c) return { titulo, sub: f.etiqueta, nd: true };
      const k = c.ids.map(String).indexOf(String(id));
      const v = k < 0 ? null : c.v[k], f0 = k < 0 ? '.' : (c.f || '')[k];
      const fc = c.clase && f0 === '2' && k >= 0 && c.clase[k] && c.clase[k] !== '.' ? c.clase[k] : f0;
      const lineas = [];
      if (pr.rn) lineas.push(`${String(pr.rn)}: reino o provincia del vecindario de 1591 (leído en su línea)`);
      else if (pr.rnd) lineas.push(`Reino de ${String(pr.rnd).replace(/^reino de /i, '')}: ${String(pr.rnm || pr.rndm || 'deducido de la intendencia de 1752').replace(/_/g, ' ')}; sin línea en 1591`);
      const el = pr.estado_limite || pr.el;
      if (el && !/^exacto/.test(el) && el !== 'sin_municipio_en_la_fecha') lineas.push(`Límite ${{ aproximado: 'aproximado', supuesto: 'supuesto: término de hoy agrupado', documentado_en_texto: 'supuesto (documentado en texto)', no_cuadra: 'supuesto (la fuente no cuadra)' }[el] || String(el).replace(/_/g, ' ')}`);
      const mc = k >= 0 ? c.mot.get(k) : null;
      if (mc) lineas.push(c.textoMotivo(mc) || mc);
      if (k >= 0 && c.res.get(k)) lineas.push(c.res.get(k).rotulo);
      else if (fc === '2') lineas.push('Unidad en revisión');
      const x = k >= 0 && c.extra ? c.extra(k) : {};
      if (fc === '5' && !x.parcial) x.parcial = { n: null, m: null };
      if (x.parcial) lineas.push((x.parcial.n != null ? `Suma parcial: ${entero(x.parcial.n)} de ${entero(x.parcial.m)} unidades con dato (no es el total)` : 'Suma parcial (no es el total)') + (x.parcial.motivo ? `: ${x.parcial.motivo}` : ''));
      if (fc === 'I') { const tr = tramoAtlas(s.d, id, f.anio); lineas.unshift(`Interpolación del Atlas${tr ? ` entre ${tr[0]} y ${tr[1]}` : ''}: no es un dato`); }
      if (fc === '3') lineas.push('Calculado de originales');
      if (fc === '4') lineas.push('Parcialmente estimado' + (x.pe != null ? ` (${fmtPct(x.pe)} estimado)` : ''));
      else if (x.pe != null && (fc === '1' || fc === '2') && x.pe > 0 && x.pe < 100) lineas.push(`${fmtPct(x.pe)} estimado`);
      if (x.metodo) lineas.push(x.metodo.charAt(0).toUpperCase() + x.metodo.slice(1));
      if (x.aviso) lineas.push(x.aviso.charAt(0).toUpperCase() + x.aviso.slice(1));
      if (x.q) lineas.push(`Confianza ${x.q}`);
      if (v == null) return { titulo, sub: f.etiqueta, nd: true, lineas };
      if (estado.obs && (fc === '1' || fc === '4')) return { titulo, sub: f.etiqueta, nd: true, lineas: ['Estimado: oculto con «solo lo observado»'] };
      { const mn = marcaMinimo(ent.id, niv, f.clave, id); if (mn) lineas.unshift(mn); }   // minimo1752
      { const rv = ent.revision_anios && ent.revision_anios[String(f.clave)]; if (rv) lineas.unshift(rv); }
      if (frenteOn(niv)) {
        const rF = frenteDe(niv, f.clave), fB = fmtBase(niv), u = unidadTras(ent) ? ' ' + unidadTras(ent) : '';
        const m0 = refDe(niv, f.clave).motivo;
        const lin = rF ? textoFrente(ent, rF.v[k], rF.A, fB) + (rF.notaA ? ` · cifra de Andalucía: ${rF.notaA}` : '') : m0.charAt(0).toUpperCase() + m0.slice(1);
        return { titulo, sub: f.etiqueta, valor: `${fB(v)}${u}`, est: fc === '1', est4: fc === '4', calc: fc === '3', parcial: !!x.parcial, lineas: [lin, ...lineas] };
      }
      const bC = baseCmb(niv);
      if (bC) {
        const r = cambioDe(niv, f.clave, bC), kk = r ? r.pos.get(String(id)) : null, xc = kk == null ? null : r.v[kk];
        const cb = corteDe(s.d, bC.clave), jb = cb ? cb.ids.map(String).indexOf(String(id)) : -1, vb = jb < 0 ? null : cb.v[jb], eo = escOrig(niv);
        if (xc == null) return { titulo, sub: f.etiqueta, nd: true, lineas: [`Sin cifra en ${bC.etiqueta} para comparar`, ...lineas] };
        return { titulo, sub: `${f.etiqueta} respecto a ${bC.etiqueta}`, valor: escDe(niv).formato(xc), est: r.est[kk], lineas: [`${eo.formato(vb)} en ${bC.etiqueta} → ${eo.formato(v)} en ${f.etiqueta}${unidadTras(ent) ? ' ' + unidadTras(ent) : ''}`, ...lineas] };
      }
      return { titulo, sub: f.etiqueta, valor: `${escDe(niv).formato(v)}${unidadTras(ent) ? ' ' + unidadTras(ent) : ''}`, est: fc === '1', est4: fc === '4', calc: fc === '3', ia: fc === 'I', parcial: !!x.parcial, lineas };
    },
    hayEstimado: (i, niv) => { const s = st[niv]; if (s.sinNivel || estado.obs) return false; const c = corteDe(s.d, s.F[i].clave); return !!c && /[14]/.test(String(c.f || '')); },
    ritmo: (i, niv) => (st[niv].F.length > 40 ? 220 : 1600),
    claveReservas: ent.tema,
    _st: st,
  };
  return P;
}

function fotograma(ent, niv, d, a) {
  const c = corteDe(d, a);
  const y = num(a);
  const def = defNivel(niv) || {};
  const f = { clave: String(a), anio: isFinite(y) ? y : a, etiqueta: rotuloPeriodo(ent) || (ent.periodo ? mayus(ent.periodo) : ent.estatico ? 'Hoy' : String(a)), corto: ent.periodo || (ent.estatico ? 'hoy' : String(a)), corte: c && c.corte, avisos: [], hito: true };
  const etq = ent.etiquetas_anio && ent.etiquetas_anio[String(a)];
  if (etq) { f.etiqueta = etq; f.corto = etq; }
  f.fuentes = (c && c.fuentes) || ent.fuentes || [];
  if (!Array.isArray(f.fuentes)) f.fuentes = String(f.fuentes).split(';').map(s => s.trim()).filter(Boolean);
  // sin ids de fuente (geografía): la nota del catálogo empieza por la fuente original; se enseña esa primera frase
  if (!f.fuentes.length && ent.nota) f.fuentesTexto = [String(ent.nota).split('. ')[0]];
  f.nota = (c && c.nota) || '';
  // ronda v22: sin marca general por fecha; cada cifra lleva su clase. Una sola nota de bloque, solo en población
  if (/^poblacion_(hab|densidad)$/.test(ent.id) && (y === 1752 || y === 1787)) f.avisos.push({ tipo: 'nota', texto: NOTA_POB_ANTIGUA });
  if ((niv === 'termino' && (c && (c.corte === '1752' || c.corte === '1787'))) || niv === 'ue1752') f.avisos.push(AV.supuesto);
  if (def.candidata) f.avisos.push(AV.candidata);
  // un año en revisión en todo el indicador (catálogo: revision_anios), p. ej. olivar y frutales de 1956 a 2007
  { const rv = ent.revision_anios && ent.revision_anios[String(a)]; if (rv) f.avisos.push({ tipo: 'revision', texto: rv }); }
  if (c) {
    // reservas de las celdas de este año (rótulo de cada una, sin repetir)
    const rots = [...new Set([...c.res.values()].filter(Boolean).map(r => r.rotulo))];
    for (const r of rots) f.avisos.push({ tipo: 'revision', texto: r, reserva: true });
    const fs = String(c.f || '');
    const revUnidad = [...fs].some((ch, k) => ch === '2' && !c.res.has(k));
    if (revUnidad) f.avisos.push({ tipo: 'revision', texto: /^pj/.test(niv) ? 'Pertenencia de los partidos en revisión' : 'Unidades en revisión' });
    if (/[14]/.test(fs)) f.estimado = !/[0235]/.test(fs);
  }
  return f;
}

function fotogramaSinNivel(ent, niv, a) {
  const y = num(a);
  const etq = ent.etiquetas_anio && ent.etiquetas_anio[String(a)];
  const f = { clave: String(a), anio: isFinite(y) ? y : a, etiqueta: rotuloPeriodo(ent) || (ent.periodo ? mayus(ent.periodo) : ent.estatico ? 'Hoy' : String(a)), corto: ent.periodo || (ent.estatico ? 'hoy' : String(a)), corte: null, hito: true,
    avisos: [], fuentes: Array.isArray(ent.fuentes) ? ent.fuentes : [], nota: '', sinNivel: true };
  if (etq) { f.etiqueta = etq; f.corto = etq; }
  return f;
}

function frasesGenericas(ent, s, esc, categ = false) {
  const out = [];
  const F = s.F;
  // cobertura del primer año y del último
  const cob = i => { const c = corteDe(s.d, F[i].clave); if (!c) return null; const n = c.v.filter(v => v != null).length; return { n, m: c.v.length }; };
  const a = cob(0), z = cob(F.length - 1);
  if (a) out.push({ i: 0, texto: `${F[0].etiqueta}: ${entero(a.n)} de ${entero(a.m)} unidades con dato.` });
  if (s.and && !categ) {
    const R = F.map(f => { const c = corteDe(s.and, f.clave); return c && c.f[0] !== '2' ? c.v[0] : null; });
    let kMax = -1, kMin = -1;
    R.forEach((v, k) => { if (v == null) return; if (kMax < 0 || v > R[kMax]) kMax = k; if (kMin < 0 || v < R[kMin]) kMin = k; });
    const u = unidadTras(ent) ? ' ' + unidadTras(ent) : '';
    if (kMax > 0) out.push({ i: kMax, texto: `${F[kMax].etiqueta}: el valor más alto de Andalucía en la serie, ${esc.formato(R[kMax])}${u}.` });
    if (kMin > 0 && kMin !== kMax) out.push({ i: kMin, texto: `${F[kMin].etiqueta}: el más bajo, ${esc.formato(R[kMin])}${u}.` });
  }
  if (z && F.length > 1) out.push({ i: F.length - 1, texto: `${F[F.length - 1].etiqueta}: ${entero(z.n)} de ${entero(z.m)} unidades con dato.` });
  out.sort((x, y) => x.i - y.i);
  const span = F.length > 40 ? 10 : 1;
  out.forEach((x, k) => { const nx = out[k + 1] ? out[k + 1].i - 1 : F.length - 1; x.hasta = Math.min(nx, x.i + span - 1); });
  void decimal;
  return out.filter((x, k, arr) => k === 0 || arr[k - 1].i !== x.i);
}
