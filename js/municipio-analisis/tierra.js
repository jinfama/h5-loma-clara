// tierra.js — usos del suelo por cortes (columnas separadas: cada corte es una fuente) y la cabaña de 1752.
import { json, valores, celda, avisoDe, avisoLlano, dentroDe, limpia } from './datos.js';
import { d3, esc, entero, decimal, cifra, marca, MARCAS, COLOR_REV, tip, sinTip, alAncho, tramas, yLista } from './util.js';
import { pictoDeIndicador, claveDeIndicador, filaIsotipo } from '../pictos/agro.js';
import { pintarComposicion } from '../comun/composicion.js';

const GRUPOS = [
  { id: 'usos_g_tierra_de_labor_pct', r: 'Tierra de labor', c: '#d2a24c' },
  { id: 'usos_g_rotacion_larga_solo_1752_pct', r: 'Labor de rotación larga (solo 1752)', c: '#e8cf97' },
  { id: 'usos_g_dehesa_agricola_sin_asignar_pct', r: 'Dehesa agrícola sin asignar', c: '#a08a45' },
  { id: 'usos_g_lenosos_pct', r: 'Leñosos', c: '#66803a' },
  { id: 'usos_g_monte_y_pasto_pct', r: 'Monte y pasto', c: '#2c6549' },
  { id: 'usos_g_inculto_y_no_agrario_pct', r: 'Inculto y no agrario', c: '#a9a496' },
  { id: 'usos_g_sin_clasificar_pct', r: 'Sin clasificar', c: '#d9d5ca' },
];
const CORTES = [1752, 1880, 1956, 1977, 1984, 1999, 2007, 2020];
const TINTA_CLARA = new Set(['#66803a', '#2c6549']);
// tramos que una serie no interpola, según su catálogo; si el campo no existe, ninguno
const marcasDe = (ctx, id) => {
  const c = ctx.cat.get(id) || {}, notas = {};
  for (const [k, t] of Object.entries(c.sin_interpolar_notas || {})) notas[k] = limpia(t);
  return { tramos: Array.isArray(c.sin_interpolar_tramos) ? c.sin_interpolar_tramos : [], notas };
};
const cruza = (tramos, a0, a1) => (tramos || []).some(([p, q]) => a0 < +q && a1 > +p);
const rotCorte = a => (a === 1880 ? 'h. 1880' : String(a));
const GANADO = [['ganado1752_ovino', 'Ovino'], ['ganado1752_caprino', 'Caprino'], ['ganado1752_porcino', 'Porcino'], ['ganado1752_bovino', 'Bovino'], ['ganado1752_asnal', 'Asnal'], ['ganado1752_mular', 'Mular'], ['ganado1752_caballar', 'Caballar'], ['ganado1752_colmenas', 'Colmenas']];

export async function prepararTierra(ctx) {
  const [ds, M1752] = await Promise.all([Promise.all(GRUPOS.map(g => valores(g.id))), minimo1752()]);
  const cortes = CORTES.map(a => {
    const dentro = a < 1842 ? dentroDe(ctx.hist, ctx.ine, a) : null;
    if (dentro) return { a, partes: [], celdas: GRUPOS.map(() => ({ v: null, f: '.' })), suma: 0, aviso: [], fuera: true, dentro };
    const partes = GRUPOS.map((g, k) => ({ ...g, ...celda(ds[k], ctx.ine, a), aviso: avisoLlano(ds[k], avisoDe(ds[k], ctx.ine, a)) })).filter(p => p.v != null && p.v > 0);
    return { a, partes, celdas: GRUPOS.map((g, k) => celda(ds[k], ctx.ine, a)), suma: d3.sum(partes, p => p.v), aviso: [...new Set(partes.map(p => p.aviso).filter(Boolean))] };
  });
  const dentro1752 = dentroDe(ctx.hist, ctx.ine, 1752);
  const gan = dentro1752 ? [] : await Promise.all(GANADO.map(async ([id, r]) => { const d = await valores(id); return { id, r, clave: claveDeIndicador(id), ...celda(d, ctx.ine, 1752) }; }));
  // las que no tienen cifra se quedan, al final, como «sin dato»: nunca como cero
  return { cortes, dentro1752, marca1752: dentro1752 ? null : await marcaDe(M1752, ctx), marcas: Object.fromEntries(GRUPOS.map(g => [g.id, marcasDe(ctx, g.id)])), huecos: ctx.bandas || [], ganado: gan.sort((a, b) => (b.v == null ? -1 : b.v) - (a.v == null ? -1 : a.v)) };
}

export function resumenTierra(T) {
  const u = [...T.cortes].reverse().find(c => c.partes.length);
  if (!u) return null;
  const m = u.partes.reduce((a, b) => (b.v > a.v ? b : a));
  return { a: u.a, r: m.r, v: m.v, f: m.f };
}

// el mayor cambio desde 1956, para cada grupo hasta su última fecha sin cruzar un tramo marcado
export function cambioTierra(T) {
  const a = T.cortes.find(c => c.a === 1956);
  if (!a || !a.partes.length) return null;
  let mej = null;
  for (const g of GRUPOS) {
    const p = a.partes.find(x => x.id === g.id);
    if (!p) continue;
    const tr = (T.marcas[g.id] || {}).tramos || [];
    const b = [...T.cortes].reverse().find(c => c.a > 1956 && !cruza(tr, 1956, c.a) && c.partes.some(x => x.id === g.id));
    if (!b) continue;
    const q = b.partes.find(x => x.id === g.id), d = q.v - p.v;
    if (!mej || Math.abs(d) > Math.abs(mej.d)) mej = { g, p, q, d, fin: b.a };
  }
  return mej;
}

export function textoTierra(T) {
  const t = [], R = resumenTierra(T);
  if (!R) return '<p>No hay cifras de usos del suelo para este municipio.</p>';
  t.push(`<p>En ${R.a} su mayor uso era <b>${esc(R.r.toLowerCase())}</b>: ${cifra(`${decimal(R.v)} %`, R.f)} del término.</p>`);
  const C = cambioTierra(T);
  if (C && Math.abs(C.d) >= 1) t.push(`<p>Entre 1956 y ${C.fin}, lo que más cambió fue <b>${esc(C.g.r.toLowerCase())}</b>: de ${cifra(`${decimal(C.p.v)}\u00a0%`, C.p.f)} a ${cifra(`${decimal(C.q.v)}\u00a0%`, C.q.f)}.</p>`);
  const g = T.ganado.find(x => x.v != null && x.v > 0 && x.id !== 'ganado1752_colmenas');
  if (g) t.push(`<p>En 1752 su mayor cabaña era la de ganado ${esc(g.r.toLowerCase())}: ${cifra(entero(g.v), g.f)} cabezas.</p>`);
  return t.join('');
}

// un mismo valor por icono para todas las especies: la cifra redonda (1, 2 o 5 por potencia de diez) con la que la mayor cabe
function unidadComun(max, iconos) {
  if (!(max > iconos)) return 1;
  const min = max / iconos, base = 10 ** Math.floor(Math.log10(min));
  for (const k of [1, 2, 5, 10]) if (k * base >= min) return k * base;
  return 10 * base;
}
const NOTA_G = { 0: 'Cifra de la fuente.', 3: 'Calculada de originales.', 1: 'Cifra estimada.', 4: 'Cifra parcialmente estimada.', 5: 'Suma parcial.', 2: 'Cifra en revisión.' };

function ganadoHTML(T) {
  const cab = '<h3>Su cabaña en 1752 <small>Catastro de Ensenada</small></h3>';
  if (T.dentro1752) return `<div class="ma-ganado">${cab}<p class="ma-pie">Sin cifra propia: en 1752 la fuente lo da dentro de ${esc(T.dentro1752)}.</p></div>`;
  const con = T.ganado.filter(x => x.v != null);
  if (!con.length) return `<div class="ma-ganado">${cab}<p class="ma-pie">Sin dato de ganado en 1752.</p></div>`;
  const cada = unidadComun(d3.max(con, x => x.v), 24);
  return `<div class="ma-ganado">${cab}<div class="ma-giso">${T.ganado.map(x => `<div class="ma-giso__f"><span class="ma-giso__r">${esc(x.r)}${x.v != null ? marca(x.f) : ''}</span>${filaIsotipo(x.v, { clave: x.clave, unidadPorIcono: cada, maxIconos: 24, tam: 22, nota: x.v != null ? NOTA_G[x.f] || '' : '' })}</div>`).join('')}</div></div>`;
}

// 1752: el resto hasta el término, con su rótulo; por encima del 105 % no hay resto
export function nota1752(T) {
  const c = T.cortes[0];
  if (!c || !c.partes.length) return '';
  const sc = T.marca1752 ? `; su cifra va ${conUnidad(T.marca1752)}` : '';
  if (c.suma < 100) return `; lo que queda hasta el término, en gris: ${TEXTO_RESTO}${sc}`;
  if (c.suma > 105) return `; aquí sus clases suman el ${decimal(c.suma)} % del término: no hay resto, la columna reparte esa suma sobre 100 y las cifras van en la tabla${sc}`;
  if (c.suma > 100.05) return `; aquí sus clases suman el ${decimal(c.suma)} % del término: la columna reparte esa suma sobre 100${sc}`;
  return sc;
}

export function pintarTierra(caja, T) {
  const hay = T.cortes.some(c => c.partes.length);
  if (!hay) { caja.innerHTML = '<p class="ma-pie">Sin cifras de usos del suelo.</p>'; return; }
  const usados = GRUPOS.filter(g => T.cortes.some(c => c.partes.some(p => p.id === g.id)));
  const avisos = [...new Set(T.cortes.flatMap(c => c.aviso.map(x => `${rotCorte(c.a)}: ${x}`)))];
  caja.innerHTML = `<div class="ma-tierra"></div>
    <p class="ma-pie">Cada columna es una fecha con dato, en su año. Entre dos fechas contiguas con dato, el color difuminado es una interpolación para leer la tendencia: no es dato y no se da como cifra. Una fecha sin dato corta el área. 1752 es lo declarado en el Catastro de Ensenada y no cierra con la superficie del término${nota1752(T)}. «h. 1880» reúne datos de 1872 a 1890 según el municipio.</p>
    ${avisos.length ? `<details class="ma-det"><summary>Avisos de la fuente para este municipio (${avisos.length})</summary><ul>${avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
    ${ganadoHTML(T)}`;
  pintarComposicion(caja.querySelector('.ma-tierra'), opcionesTierra(T));
}

// lo que recibe la gráfica común: grupos de uso, sin clases sueltas
export function opcionesTierra(T) {
  return {
    anios: CORTES, dominio: [1752, 2020], unidad: '% del término', tabla: true, aria: 'Usos del suelo por grupos en cada fecha',
    rotuloAnio: a => (a === 1880 ? 'h. 1880' : String(a)),
    categorias: GRUPOS.map((g, k) => ({
      id: g.id, rotulo: g.r, color: g.c, tinta: TINTA_CLARA.has(g.c) ? '#fff' : '#101010', picto: pictoDeIndicador(g.id, { tam: 22, titulo: '' }) || '',
      valores: T.cortes.map(c => c.celdas[k].v), clases: T.cortes.map(c => c.celdas[k].f),
      sinInterpolar: (T.marcas[g.id] || {}).tramos || [], notasSinInterpolar: (T.marcas[g.id] || {}).notas || {},
    })),
    cierre: { anios: [1752], resto: { rotulo: TEXTO_RESTO, color: GRIS_RESTO }, exceso: s => `suman el ${entero(s)}\u00a0% del término`, rotuloSuma: 'Suma de sus clases', repartoTexto: 'la columna reparte esa suma sobre 100' },
    huecos: (T.huecos || []).map(h => ({ desde: h.desde, hasta: h.hasta, rotulo: `F${h.rotulo.slice(1)}`, corto: h.madre ? `Parte de ${h.madre.n}` : '' })),
    textos: { dato: 'columna en color pleno: fecha con dato', interpolado: 'color difuminado: interpolado, no es dato' },
  };
}

const GRIS_RESTO = '#e4e4df';
const TEXTO_RESTO = 'sin dato en hectáreas (no declarado, no convertible o error de medida)';

// ---------------------------------------------------------------- cultivo característico: su peso aquí / su peso en Andalucía
const FILAS_LQ = [
  { id: 'usos_g_tierra_de_labor_pct', r: 'Tierra de labor', art: 'la tierra de labor', cultivo: true },
  { id: 'dehesa_labor_pct', r: 'Dehesa agrícola', art: 'la dehesa agrícola', sub: true, desde: 1956 },
  { id: 'usos_g_lenosos_pct', r: 'Leñosos', art: 'los leñosos', pl: true, cultivo: true, grupo: true },
  { id: 'usos_olivar_pct', r: 'Olivar', art: 'el olivar', cultivo: true, sub: true, desde: 1956 },
  { id: 'usos_vina_pct', r: 'Viña', art: 'la viña', cultivo: true, sub: true, desde: 1956 },
  { id: 'usos_frutales_pct', r: 'Frutales', art: 'los frutales', pl: true, cultivo: true, sub: true, desde: 1956 },
  { id: 'usos_regadio_huerta_pct', r: 'Regadío y huerta', art: 'el regadío y la huerta', cultivo: true, desde: 1956, hasta: 2007 },
  { id: 'usos_g_monte_y_pasto_pct', r: 'Monte y pasto', art: 'el monte y pasto' },
  { id: 'usos_dehesa_pasto_pct', r: 'Dehesa de pasto', art: 'la dehesa de pasto', sub: true, desde: 1956 },
];
const MIN_PESO = 2, MIN_LQ = 1.25;
// Andalucía son las hectáreas declaradas sobre toda su superficie: si a algún municipio le falta esa clase en esa fecha,
// su cifra se queda corta y las «veces» pueden salir más altas de lo real
const soloDeclarado = (d, a) => {
  if (!d._falta) d._falta = new Map();
  if (!d._falta.has(a)) { const k = d._ka.get(+a); d._falta.set(a, k != null && d.v[k].some(x => x == null)); }
  return d._falta.get(a);
};
const fechasCon = (filas, ok) => CORTES.filter((a, k) => filas.some(r => r.cel[k] && ok(r.cel[k])));
// 1752: la cifra de Andalucía y de la provincia es un mínimo, y frente a un mínimo no se calcula «pesa X veces»
const ANIO_MINIMO = 1752;
const faltaEn = (M, nivel, id) => {
  const n = M && M.niveles && M.niveles[nivel], j = n ? n.ids.indexOf(String(id)) : -1;
  return j < 0 ? null : { sin: n.sin_declarar_pct[j], mun: n.municipios[j], sinDato: n.municipios_sin_dato[j], marca: (n.marca || [])[j] || 'minimo' };
};
// donde lo declarado pasa del término no es un mínimo: cada municipio lleva su texto, «sin cuadrar» o «ajustado», según las listas de la base
const minimo1752 = () => json('visor/usos_1752_minimo.json').catch(() => null);
const textoSC = M => (M && M.textos ? limpia(M.textos.sin_cuadrar || '') : '');
// la marca es de su unidad de 1752 y la cifra del municipio, un reparto de la de esa unidad: se da también el porcentaje de la unidad
async function sumaUnidad(ctx) {
  const ue = ctx.P && ctx.P.municipio && ctx.P.municipio.ue1752 ? ctx.P.municipio.ue1752[ctx.i] : null;
  if (!ue) return null;
  try {
    const xs = (await Promise.all(GRUPOS.map(g => valores(g.id, 'ue1752')))).map(d => celda(d, ue, 1752).v).filter(v => v != null);
    return xs.length ? d3.sum(xs) : null;
  } catch { return null; }
}
async function marcaDe(M, ctx) {
  if (!M || !M.textos) return null;
  const tipo = (M.sin_cuadrar_municipios || []).includes(String(ctx.ine)) ? 'sin_cuadrar' : (M.ajustados_municipios || []).includes(String(ctx.ine)) ? 'ajustado' : '';
  const excede = (M.excede_municipios || {})[String(ctx.ine)];
  // fuera de las listas de la base: aritmética del visor, con texto neutro
  if (!tipo && excede != null) return { corto: 'pasa del 100 %', texto: limpia(M.textos.excede.replace('{pct}', decimal(excede))), unidad: null };
  if (!tipo) return null;
  return { corto: tipo === 'ajustado' ? 'ajustado' : 'sin cuadrar', texto: limpia((M.textos_municipio || M.textos)[tipo] || ''), unidad: await sumaUnidad(ctx) };
}
const conUnidad = m => `«${m.texto}»${m.unidad != null ? ` (su unidad: ${decimal(m.unidad)}\u00a0%)` : ''}`;
const queFalta = x => (x ? `queda sin declarar el ${decimal(x.sin)}\u00a0% de su superficie y ${entero(x.sinDato)} de sus ${entero(x.mun)} municipios no tienen dato` : 'faltan municipios y tierras sin declarar');

export async function prepararLQ(ctx) {
  const [ds, M1752] = await Promise.all([
    Promise.all(FILAS_LQ.map(async r => { const [m, A, P] = await Promise.all([valores(r.id), valores(r.id, 'andalucia'), valores(r.id, 'provincia')]); return { m, A, P }; })),
    minimo1752(),
  ]);
  const propia = await marcaDe(M1752, ctx);
  const filas = FILAS_LQ.map((r, k) => ({
    ...r, ...(({ tramos, notas }) => ({ tramos, notas }))(marcasDe(ctx, r.id)),
    cel: CORTES.map(a => {
      if ((r.desde && a < r.desde) || (r.hasta && a > r.hasta)) return null;
      if (a < 1842 && dentroDe(ctx.hist, ctx.ine, a)) return null;
      const M = celda(ds[k].m, ctx.ine, a), A = celda(ds[k].A, 'AND', a), P = celda(ds[k].P, ctx.prov, a);
      if (M.v == null || A.v == null || A.v <= 0) return null;
      const minimo = a === ANIO_MINIMO;
      return { a, p: M.v, f: M.f, pA: A.v, fA: A.f, pP: P.v, fP: P.f, minimo, marcaPropia: minimo ? propia : null, q: minimo ? null : M.v / A.v, qP: !minimo && P.v > 0 ? M.v / P.v : null, soloDeclarado: soloDeclarado(ds[k].m, a) };
    }),
  }));
  const ko = CORTES.indexOf(1956);
  // la fecha más reciente con cifra y, en ella, el que más destaca entre lo que ocupa al menos un 2 % del término
  let dest = null;
  for (let k = CORTES.length - 1; k >= ko && !dest; k--) {
    const vale = filas.filter(r => r.cel[k] && r.cel[k].p >= MIN_PESO && r.cel[k].q >= MIN_LQ).sort((x, y) => y.cel[k].q - x.cel[k].q);
    const hayDatos = filas.some(r => r.cel[k]);
    if (!hayDatos) continue;
    const cult = vale.filter(r => r.cultivo), subs = cult.filter(r => r.sub);
    const elegido = (subs.length ? cult.filter(r => !r.grupo) : cult)[0] || vale[0] || null;
    dest = { k, a: CORTES[k], r: elegido, c: elegido ? elegido.cel[k] : null };
  }
  const primero = dest && dest.r ? dest.r.cel.find(c => c && c.a < dest.a && !c.minimo && !c.soloDeclarado && c.f !== '2' && c.fA !== '2' && !cruza(dest.r.tramos, c.a, dest.a)) : null;
  const conMinimo = filas.flatMap(r => r.cel).filter(c => c && c.minimo);
  return { filas, dest, primero, nAndEst: fechasCon(filas, c => !c.minimo && !['0', '3', '2'].includes(c.fA)).length, andRev: fechasCon(filas, c => !c.minimo && c.fA === '2'), soloDecl: fechasCon(filas, c => !c.minimo && c.soloDeclarado),
    minimo: conMinimo.length ? { rev: conMinimo.some(c => c.fA === '2'), falta: faltaEn(M1752, 'andalucia', 'AND'), texto: textoSC(M1752), propia } : null };
}

export function fraseLQ(L, conMarcas = true) {
  const D = L.dest;
  if (!D) return null;
  if (!D.r) return { frase: `En ${D.a} ningún cultivo ni monte pesa claramente más que en Andalucía.` };
  const c = D.c, m = (v, f) => (conMarcas ? cifra(`${decimal(v)}\u00a0%`, f) : `${decimal(v)}\u00a0%`);
  const que = D.r.cultivo ? `su cultivo más característico ${D.r.pl ? 'son' : 'es'} ${D.r.art}` : `lo que más destaca frente a Andalucía ${D.r.pl ? 'son' : 'es'} ${D.r.art}`;
  return { frase: `En ${D.a} ${que}: ${D.r.pl ? 'pesan' : 'pesa'} <b class="ma-c">${decimal(c.q)} veces</b> lo que en Andalucía (${m(c.p, c.f)} de su término frente a ${m(c.pA, c.fA)}).` };
}

export function textoLQ(L) {
  const F = fraseLQ(L);
  if (!F) return '<p>No hay cifras de usos con las que compararlo.</p>';
  const D = L.dest, ic = D.r ? pictoDeIndicador(D.r.id, { tam: 48, titulo: '' }) : '';
  const t = [ic ? `<div class="ma-cult"><span class="ma-cult__i">${ic}</span><p>${F.frase}</p></div>` : `<p>${F.frase}</p>`];
  if (D.r && D.c.qP != null) t.push(`<p>Frente a su provincia, ${D.r.pl ? 'pesan' : 'pesa'} ${decimal(D.c.qP)} veces.</p>`);
  if (D.r && L.primero) t.push(`<p>En ${rotCorte(L.primero.a)} ${D.r.pl ? 'pesaban' : 'pesaba'} ${decimal(L.primero.q)} veces lo que en Andalucía.</p>`);
  return t.join('');
}

const colLQ = d3.scaleLinear().domain([-2, 0, 2]).range(['#b98a2e', '#f7f5ee', '#0f6b3f']).clamp(true);

export function pintarLQ(caja, L) {
  const hay = CORTES.map((a, k) => L.filas.some(r => r.cel[k]));
  const celda1 = (r, c, k) => {
    if (!c) return `<span class="ma-lq__c ma-lq__c--v"></span>`;
    if (c.minimo) {
      const m = L.minimo, scA = m.falta && m.falta.marca === 'sin_cuadrar';
      const tm = `${rotCorte(c.a)}: ${decimal(c.p)} % aquí (${MARCAS[c.f] || ''})${c.marcaPropia ? `, ${conUnidad(c.marcaPropia)}` : ''}. Andalucía: ${decimal(c.pA)} % (${scA ? m.texto : 'mínimo'})${m.rev ? ', en revisión' : ''}${scA ? '' : `: ${queFalta(m.falta)}`}. No se calcula cuántas veces pesa.`;
      return `<span class="ma-lq__c ma-lq__c--min" title="${esc(tm)}">${c.marcaPropia ? c.marcaPropia.corto : 'mínimo'}</span>`;
    }
    const previa = r.cel.slice(0, k).reverse().find(Boolean), corte = previa && cruza(r.tramos, previa.a, c.a);
    const l = Math.log2(Math.max(c.q, .01)), est = c.f !== '0' && c.f !== '3';
    const t = `${rotCorte(c.a)}: ${decimal(c.p)} % aquí (${MARCAS[c.f] || ''}), ${decimal(c.pA)} % en Andalucía (${MARCAS[c.fA] || ''})${c.soloDeclarado ? '. La de Andalucía solo suma lo declarado: estas veces pueden salir más altas de lo real' : ''}`;
    return `<span class="ma-lq__c${est ? ' is-est' : ''}${corte ? ' is-corte' : ''}${c.soloDeclarado ? ' is-decl' : ''}" style="background-color:${colLQ(l)};color:${Math.abs(l) > 1.15 ? '#fff' : '#101010'}" title="${esc(t)}">${c.q >= 99.5 ? '>99' : decimal(c.q)}</span>`;
  };
  caja.innerHTML = `<div class="ma-lq" style="--cols:${CORTES.length}">
      <div class="ma-lq__f ma-lq__f--cab"><span></span>${CORTES.map((a, k) => `<span${hay[k] ? '' : ' class="is-off"'}>${a === 1880 ? 'h.1880' : a}</span>`).join('')}</div>
      ${L.filas.map(r => `<div class="ma-lq__f"><span class="ma-lq__n${r.sub ? ' is-sub' : ''}">${pictoDeIndicador(r.id, { tam: 20, titulo: '' }) || ''}<span>${esc(r.r)}</span></span>${r.cel.map((c, k) => celda1(r, c, k)).join('')}</div>`).join('')}
    </div>
    <p class="ma-pie">Cuántas veces pesa cada uso aquí respecto a su peso en Andalucía en esa misma fecha: 1 es igual; verde, más; ocre, menos. Con trama, la cifra del municipio es estimada. La de Andalucía lleva parte estimada en ${L.nAndEst} de las ${CORTES.length} fechas${L.andRev.length ? ` y está en revisión en ${yLista(L.andRev.map(rotCorte))}` : ''} (se ve al pasar).${L.minimo ? ` En 1752 la cifra de Andalucía ${L.minimo.falta && L.minimo.falta.marca === 'sin_cuadrar' ? `va «${L.minimo.texto}»` : `es un mínimo${L.minimo.rev ? ' y está en revisión' : ''}: ${queFalta(L.minimo.falta)}`}.${L.minimo.propia ? ` La de este municipio va ${conUnidad(L.minimo.propia)}.` : ''} Por eso esa columna no dice cuántas veces pesa.` : ''}${L.soloDecl.length ? ` En ${yLista(L.soloDecl.map(rotCorte))} la fuente no da todas las clases en todos los municipios: la cifra de Andalucía solo suma lo declarado y lo divide entre toda su superficie. Por eso, en las casillas con esquina negra las veces pueden salir más altas de lo real, y no se usan en las frases.` : ''} Olivar, viña y frutales solo desde 1956: antes la fuente los da mezclados. El regadío se enseña hasta 2007: en 2020 esa clase cambia de contenido.${L.filas.some(r => r.cel.some((c, k) => { const v = c && r.cel.slice(0, k).reverse().find(Boolean); return v && cruza(r.tramos, v.a, c.a); })) ? ' Una raya discontinua a la izquierda indica un tramo que esa serie no interpola: no se calcula el cambio a través de él.' : ''}</p>`;
}
