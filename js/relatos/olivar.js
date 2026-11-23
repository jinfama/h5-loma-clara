// Atlas Histórico de Andalucía · Relato del olivar, de 1752 a 2020. Lee las cifras al abrir la página y dibuja siete escenas
// (ocho cuando se encienda el paso de España, en olivar-espana.js).
// Reglas: las fechas se empalman en una sola línea (decisión del responsable, 23-nov-2026) y cada punto lleva su tipo;
// 1752 es lo declarado, un MÍNIMO (faltan municipios y tierras sin declarar), y no cierra con el término; 1752 y hacia 1880
// son sumas parciales; una celda sin dato no es cero. Ninguna cifra de 1752 se presenta como total ni como base de un multiplicador.
// En los municipios de unidades de 1752 que declaraban más tierra que su término no se dice «mínimo»: cada uno lleva su caso,
// «sin cuadrar» (siguen pasándose de su término) o «ajustado» (declaraban de más y ya quedan en su término).
// En 2020 la clase cambia de contenido (ya lleva el olivar regado): la línea sigue, con una marca visible, y ninguna cuenta
// de crecimiento, reparto o multiplicador cruza el tramo 2007-2020.
import {
  d3, topojson, COLOR, N, pct, signo, vis, txt, ajusta, tip, ejeX, ejeY, punto, anillo, tipoDeClase, textoClase, leyenda, defs,
  baseMapa, rematar, lista,
} from './util.js';
import { leer, valores, catalogo, cobertura, geometria, registroFuentes, exige, afirma, celda, parcial, indiceAnio, fuentesDe } from './datos.js';
import { FAOSTAT, ESYRCE } from './externos.js';
import { ESPANA, cargarEspana, escenaEspana } from './olivar-espana.js';

const RESERVA_1880 = ['04', '18', '21'];   // Almería, Granada y Huelva
// capataz, 23-nov-2026: errata de la base en 1956-2007; se quita cuando llegue la versión agraria corregida
export const AVISO_REVISION = 'En revisión: de 1956 a 2007 la base cuenta el olivar de regadío dentro de frutales, así que en esas fechas la cifra de olivar es un mínimo y lo que sube de 2007 a 2020 no se puede leer como crecimiento';
export const AVISO_2020 = 'En 2020 cambia lo que incluye esta clase: ya lleva el olivar regado';
const mayus = t => t[0].toUpperCase() + t.slice(1);
const rotAnio = y => (y === 1880 ? 'hacia 1880' : String(y));
/** Tipo de punto: declarado (1752), suma parcial o la clase real de la celda. */
const tipoPunto = q => (q.y === 1752 ? 'decl' : q.par ? 'est' : tipoDeClase(q.f));
const textoPunto = q => [
  q.y === 1752 ? 'mínimo declarado en el Catastro' : textoClase(q.f),
  q.par ? `suma parcial de ${N(q.par[0])} de ${N(q.par[1])} municipios` : '',
  q.y === 2020 ? 'la clase ya lleva el olivar regado' : '',
].filter(Boolean).join(' · ');

export async function cargar() {
  const [cat, reg, cob, minimo, and, andP, pro, mun, pc, mix, fru, topo] = await Promise.all([
    catalogo(), registroFuentes(), cobertura(), leer('visor/usos_1752_minimo.json'),
    valores('usos_olivar_ha', 'andalucia'), valores('usos_olivar_pct', 'andalucia'),
    valores('usos_olivar_ha', 'provincia'), valores('usos_olivar_ha', 'municipio'),
    valores('usos_olivar_pct', 'municipio'), valores('usos_lenosos_mixtos_y_otros_ha', 'andalucia'),
    valores('usos_frutales_ha', 'andalucia'), geometria(),
  ]);
  const K = {};
  const ind = exige(cat.indicadores.find(i => i.id === 'usos_olivar_ha'), 'indicador');
  const anios = ind.anios;
  afirma(anios.join() === '1752,1880,1956,1977,1984,1999,2007,2020', 'fechas de la serie');
  afirma(mun.ids.join() === pc.ids.join(), 'mismos municipios en hectáreas y porcentaje');

  const nombre = {};
  topo.objects.municipios.geometries.forEach(x => { nombre[x.properties.c] = x.properties.n; });
  const nomProv = {};
  topo.objects.provincias.geometries.forEach(x => { nomProv[x.properties.p] = x.properties.n; });

  // ---------- marco mundial ----------
  K.mundo = FAOSTAT.mundo; K.espFao = FAOSTAT.paises[0].ha; K.andEsy = ESYRCE.andalucia; K.espEsy = ESYRCE.espana;
  K.cuotaEsp = 100 * ESYRCE.andalucia / ESYRCE.espana;                    // parte de Andalucía en España, misma encuesta
  K.pctDirecto = 100 * ESYRCE.andalucia / FAOSTAT.mundo;                  // Andalucía (encuesta) / mundo (FAOSTAT)
  K.andEscala = FAOSTAT.paises[0].ha * ESYRCE.andalucia / ESYRCE.espana;  // misma parte, aplicada a la cifra de FAOSTAT
  K.pctEscala = 100 * K.andEscala / FAOSTAT.mundo;
  K.pctEsp = 100 * FAOSTAT.paises[0].ha / FAOSTAT.mundo;
  K.pctMin = Math.min(K.pctDirecto, K.pctEscala); K.pctMax = Math.max(K.pctDirecto, K.pctEscala);
  afirma(K.pctMax < 50, 'Andalucía no llega a la mitad del mundo');
  FAOSTAT.paises.forEach((p, i) => { K[`fao.${i}`] = p.ha; });
  afirma(K.andEscala > FAOSTAT.paises[2].ha && K.andEsy < FAOSTAT.paises[1].ha, 'posición entre los países');

  // ---------- serie andaluza: una sola línea, con el tipo de cada punto ----------
  const T = y => exige(celda(and, y, 'AND').v, 'total ' + y);
  const serie = anios.map(y => {
    const c = celda(and, y, 'AND');
    const q = { y, v: T(y), f: c.f, pe: c.pe, par: parcial(and, y, 'AND'), pct: exige(celda(andP, y, 'AND').v, 'porcentaje ' + y) };
    K[`t.${y}`] = q.v; K[`pct.${y}`] = q.pct; K[`f.${y}`] = q.f;
    return q;
  });
  afirma(serie.filter(s => s.par).map(s => s.y).join() === '1752,1880', 'solo 1752 y 1880 son sumas parciales');
  K['par.1752'] = serie[0].par[0]; K['par.1880'] = serie[1].par[0]; K.parDe = serie[0].par[1];
  K.masCifra = K['par.1880'] - K['par.1752'];
  const c0 = cob.indicadores.usos_olivar_ha;
  K['cob.1752'] = c0.pct_con_cifra[c0.anios.indexOf(1752)];
  K['cob.1880'] = c0.pct_con_cifra[c0.anios.indexOf(1880)];
  K.saltoX = T(1880) / T(1752);
  // ---------- cuánto falta en 1752: lo que queda sin declarar ----------
  afirma(minimo.anio === 1752 && /mínimo/.test(minimo.aviso), 'aviso del mínimo de 1752');
  const minA = minimo.niveles.andalucia, minP = minimo.niveles.provincia;
  K['min.sin'] = exige(minA.sin_declarar_pct[0], 'superficie sin declarar');
  K['min.nsin'] = exige(minA.municipios_sin_dato[0], 'municipios sin ningún uso');
  K['min.mun'] = exige(minA.municipios[0], 'municipios');
  afirma(minA.marca[0] === 'minimo' && minP.marca.every(x => x === 'minimo'), 'Andalucía y las provincias siguen en mínimo');
  const sinCuadrar = new Set(exige(minimo.sin_cuadrar_municipios, 'municipios sin cuadrar'));
  const ajustados = new Set(exige(minimo.ajustados_municipios, 'municipios ajustados'));
  afirma([...ajustados].every(c => !sinCuadrar.has(c)), 'sin cuadrar y ajustados no se solapan');
  const textoSinCuadrar = exige(minimo.textos?.sin_cuadrar, 'texto de sin cuadrar');
  const textoAjustado = exige(minimo.textos?.ajustado, 'texto de ajustado');
  // La marca es de la unidad y la cifra del municipio, un reparto de la suya: el puntero y la leyenda del mapa lo dicen así
  const textoMunSC = exige(minimo.textos_municipio?.sin_cuadrar, 'texto municipal de sin cuadrar');
  const textoMunAJ = exige(minimo.textos_municipio?.ajustado, 'texto municipal de ajustado');
  // fuera de las listas de la base, sus clases pasan del 100 % (aritmética del visor) o quedan entre 100 y 100,5 %: tampoco son un mínimo
  const excedeMun = new Map(Object.entries(exige(minimo.excede_municipios, 'municipios que pasan del 100 %')));
  const sumaMun = new Set(exige(minimo.suma_municipios, 'municipios entre 100 y 100,5 %'));
  const textoExcede = exige(minimo.textos?.excede, 'texto de los que pasan del 100 %');
  K['ex.mun'] = excedeMun.size;
  K['sc.mun'] = sinCuadrar.size; K['sc.ue'] = exige(minimo.sin_cuadrar_ue1752, 'unidades sin cuadrar').length;
  K['aj.mun'] = ajustados.size; K['aj.ue'] = exige(minimo.ajustados_ue1752, 'unidades ajustadas').length;
  minP.ids.forEach((p, j) => {
    K[`min.p.${p}.sin`] = exige(minP.sin_declarar_pct[j], 'sin declarar ' + p);
    K[`min.p.${p}.nsin`] = exige(minP.municipios_sin_dato[j], 'sin ningún uso ' + p);
  });
  K.caidaHa = T(1984) - T(1956); K.caidaPct = 100 * (T(1984) / T(1956) - 1);
  K.subeHa = T(2007) - T(1984); K.subePct = 100 * (T(2007) / T(1984) - 1);
  afirma(K.caidaHa < 0 && K.subeHa > 0, 'cae y luego sube');
  afirma(d3.min([1956, 1977, 1984, 1999, 2007], y => T(y)) === T(1984), '1984 es el mínimo de los mapas');
  // Hasta 2007 el olivar regado va en frutales y los mosaicos con olivar en leñosos mixtos: la caída se comprueba con las tres clases
  [1956, 1984].forEach(y => {
    K[`mix.${y}`] = exige(celda(mix, y, 'AND').v, 'leñosos mixtos ' + y);
    K[`fru.${y}`] = exige(celda(fru, y, 'AND').v, 'frutales ' + y);
    K[`sum3.${y}`] = T(y) + K[`mix.${y}`] + K[`fru.${y}`];
  });
  afirma(K['sum3.1984'] < K['sum3.1956'], 'la caída se mantiene con frutales y leñosos mixtos');

  // ---------- clase real de las celdas de 1752 y hacia 1880 ----------
  const reparto = y => {
    const i = indiceAnio(mun, y), ha = {};
    mun.v[i].forEach((v, j) => { if (v !== null) ha[mun.f[i][j]] = (ha[mun.f[i][j]] || 0) + v; });
    const tot = d3.sum(Object.values(ha));
    const parte = f => 100 * (ha[f] || 0) / tot;
    const mot = m => mun.mot.filter(x => x[0] === i && x[2] === m).length;
    return { obs: parte('0'), est: parte('1'), res: parte('2'), calc: parte('3'), mot, ceros: mun.v[i].filter(v => v === 0).length, nRes: [...mun.f[i]].filter(c => c === '2').length, sin: mun.v[i].filter(v => v === null).length };
  };
  const r52 = reparto(1752), r80 = reparto(1880);
  K['cl.1752.obs'] = r52.obs; K['cl.1752.est'] = r52.est; K['cl.1752.res'] = r52.res;
  K['cl.1880.obs'] = r80.obs; K['cl.1880.est'] = r80.est; K['cl.1880.calc'] = r80.calc;
  K['n.1752.sin'] = r52.sin; K['n.1752.ns'] = r52.mot('ns'); K['n.1752.d'] = r52.mot('d'); K['n.1752.cero'] = r52.ceros; K['n.1752.res'] = r52.nRes;
  K['n.1880.sin'] = r80.sin; K['n.1880.nd'] = r80.mot('nd'); K['n.1880.cero'] = r80.ceros;
  afirma(K['n.1752.ns'] + K['n.1752.d'] === K['n.1752.sin'], 'motivos de 1752');
  { const i = indiceAnio(mun, 1752); afirma(mun.v[i].every((v, j) => v !== 0 || mun.f[i][j] !== '0'), 'ningún cero de 1752 es cifra observada'); }
  afirma(K['n.1880.nd'] === K['n.1880.sin'], 'motivos de hacia 1880');
  {
    const i = indiceAnio(mun, 1752);
    const conCifra = lista => mun.ids.map((c, j) => j).filter(j => lista.has(mun.ids[j]) && mun.v[i][j] !== null);
    const sc = conCifra(sinCuadrar), aj = conCifra(ajustados);
    K['sc.conOli'] = sc.length; K['sc.sinOli'] = K['sc.mun'] - sc.length; K['sc.ha'] = d3.sum(sc, j => mun.v[i][j]);
    K['aj.conOli'] = aj.length; K['aj.sinOli'] = K['aj.mun'] - aj.length; K['aj.ha'] = d3.sum(aj, j => mun.v[i][j]);
    afirma(sc.length + aj.length === K['n.1752.res'] && [...sc, ...aj].every(j => mun.f[i][j] === '2'), 'las celdas con reserva son las de los dos casos');
  }

  // ---------- mismos municipios entre hacia 1880 y 1956, sin las tres provincias con reserva ----------
  const i80 = indiceAnio(mun, 1880), i56 = indiceAnio(mun, 1956);
  const mismos = mun.ids.map((id, j) => j).filter(j => !RESERVA_1880.includes(mun.ids[j].slice(0, 2)) && mun.v[i80][j] !== null && mun.v[i56][j] !== null);
  const s80 = d3.sum(mismos, j => mun.v[i80][j]), s56 = d3.sum(mismos, j => mun.v[i56][j]);
  K.mismosN = mismos.length; K.mismos80 = s80; K.mismos56 = s56; K.mismosX = s56 / s80;
  K.mismosEst = 100 * d3.sum(mismos.filter(j => mun.f[i80][j] === '1'), j => mun.v[i80][j]) / s80;

  // ---------- provincias ----------
  const provs = pro.ids.map(p => {
    const s = anios.map(y => {
      const c = celda(pro, y, p);
      const q = { y, v: exige(c.v, `provincia ${p} ${y}`), f: c.f, pe: c.pe, par: parcial(pro, y, p) };
      q.parte = 100 * q.v / T(y);
      K[`p.${p}.${y}`] = q.v; K[`p.${p}.c${y}`] = q.parte; K[`p.${p}.f${y}`] = q.f;
      return q;
    });
    const de = y => s.find(q => q.y === y);
    const r = { p, n: nomProv[p], s, de, d1: 100 * (de(1984).v / de(1956).v - 1), d2: 100 * (de(2007).v / de(1984).v - 1) };
    K[`p.${p}.d1`] = r.d1; K[`p.${p}.d2`] = r.d2;
    return r;
  });
  const P = id => provs.find(q => q.p === id);
  afirma(provs.every(q => q.d2 > 0), 'todas las provincias suben de 1984 a 2007');
  afirma(provs.filter(q => q.d1 > 0).map(q => q.p).sort().join() === '18,23', 'de 1956 a 1984 solo suben Granada y Jaén');
  afirma(d3.least(provs, q => q.d1).p === '41', 'Sevilla es la que más cae');
  afirma(d3.greatest(provs, q => q.de(1752).v).p === '41', 'Sevilla es la primera en 1752');
  afirma(['1956', '1977', '1984', '1999', '2007', '2020'].every(y => d3.greatest(provs, q => q.de(+y).v).p === '23'), 'Jaén es la primera desde 1956');
  K.r1752 = P('41').de(1752).v / P('23').de(1752).v;
  K.r2007 = P('23').de(2007).v / P('41').de(2007).v;
  K.sevCon = P('41').de(1752).par[0]; K.sevDe = P('41').de(1752).par[1];
  K.jaeCon = P('23').de(1752).par[0]; K.jaeDe = P('23').de(1752).par[1];
  K.jc1956 = P('23').de(1956).parte + P('14').de(1956).parte;
  K.jc2007 = P('23').de(2007).parte + P('14').de(2007).parte;
  K.huelvaPe = 100 * d3.min([1956, 1977, 1984, 1999, 2007], y => P('21').de(y).pe);

  // ---------- densidad municipal en todas las fechas ----------
  const dens = {};
  anios.forEach(y => {
    const i = indiceAnio(pc, y);
    const iM = indiceAnio(mun, y);
    // el motivo de cada celda vacía es el que da la base (p. ej., cosecha declarada sin su superficie): un vacío nunca se cuenta como cero
    const motivo = new Map(mun.mot.filter(x => x[0] === iM).map(x => [mun.ids[x[1]], mun.motivos[x[2]]]));
    const vals = pc.v[i].map((v, j) => ({ id: pc.ids[j], v, f: pc.f[i][j], ha: mun.v[iM][j], mot: motivo.get(pc.ids[j]) }));
    const con = vals.filter(q => q.v !== null);
    const m75 = con.filter(q => q.v > 75), m50 = con.filter(q => q.v > 50);
    dens[y] = { por: Object.fromEntries(vals.map(q => [q.id, q])), n: con.length, m75: m75.length, m50: m50.length };
    K[`d.${y}.n`] = con.length; K[`d.${y}.m75`] = m75.length; K[`d.${y}.m50`] = m50.length;
    K[`d.${y}.e75`] = m75.filter(q => q.f === '1').length; K[`d.${y}.e50`] = m50.filter(q => q.f === '1').length;
    if (y === 2020) K.jaen75 = m75.filter(q => q.id.startsWith('23')).length;
  });

  // ---------- 2020 ----------
  const iH = indiceAnio(mun, 2020), iP = indiceAnio(pc, 2020);
  const conOli = mun.ids.map((id, j) => ({ id, n: nombre[id], v: mun.v[iH][j], f: mun.f[iH][j], p: pc.v[iP][j], fp: pc.f[iP][j] })).filter(q => q.v !== null && q.v > 0);
  const orden = [...conOli].sort((a, b) => b.v - a.v);
  const tot = d3.sum(orden, q => q.v);
  let acu = 0, nMitad = 0;
  for (const q of orden) { acu += q.v; nMitad += 1; if (acu >= tot / 2) break; }
  K.hoyMitad = nMitad; K.hoyCon = orden.length;
  const topHa = orden.slice(0, 6), topPct = conOli.filter(q => q.p !== null).sort((a, b) => b.p - a.p).slice(0, 6);
  topHa.forEach((q, i) => { K[`topHa.${i}`] = q.v; K[`topHa.${i}.n`] = q.n; K[`topHa.${i}.f`] = q.f; });
  topPct.forEach((q, i) => { K[`topPct.${i}`] = q.p; K[`topPct.${i}.n`] = q.n; K[`topPct.${i}.f`] = q.fp; });

  const espana = await cargarEspana(serie, K);
  const fuentes = fuentesDe(cat, reg, ['usos_olivar_ha']);
  return { K, anios, serie, T, provs, P, dens, topHa, topPct, topo, nombre, fuentes, espana, sinCuadrar, ajustados, textoSinCuadrar, textoAjustado, textoMunSC, textoMunAJ, excedeMun, sumaMun, textoExcede };
}

/** Lo que falta en 1752, dicho junto a la cifra. */
const falta1752 = K => `faltan municipios y tierras sin declarar: el ${pct(K['min.sin'])} de la superficie de Andalucía queda sin declarar, ${N(K['min.nsin'])} de ${N(K['min.mun'])} municipios no tienen ningún uso y, en olivar, la fuente no da superficie en ${N(K['n.1752.sin'])}`;

const rango = K => `${N(Math.floor(K.pctMin))} y el ${N(Math.round(K.pctMax))}`;

export const cabecera = D => ({
  pre: 'Relato · Olivar',
  h1: `Desde un mínimo de ${N(D.K['t.1752'])} ha declaradas en 1752, el olivar andaluz avanza a saltos y se desplaza hacia Jaén`,
  lede: `Doscientos sesenta y ocho años de olivar andaluz, del Catastro de Ensenada a hoy: una línea que sube, cae y vuelve a subir, un mapa que se desplaza hacia Jaén y una región que reúne entre el ${rango(D.K)} % del olivar del mundo. ${AVISO_REVISION}.`,
});

// =====================================================================================================================
// Piezas comunes de los mapas
// =====================================================================================================================
const CL = [
  { t: 'Cero', c: '#f7f7f4', f: v => v === 0 },
  { t: 'Hasta 25 %', c: '#d5e8db', f: v => v <= 25 },
  { t: '25-50 %', c: '#9ecdb0', f: v => v <= 50 },
  { t: '50-75 %', c: '#3f9c6d', f: v => v <= 75 },
  { t: 'Más del 75 %', c: '#0c4a2e', f: () => true },
];
const colorPct = v => (v === null || v === undefined ? 'url(#rl-sin)' : CL.find(c => c.f(v)).c);
// un porcentaje que redondea a 0,0 con hectáreas declaradas no es un cero: va en la primera clase y se escribe «menos de 0,1 %»
const casiCero = q => q?.v === 0 && q.ha > 0;
const colorCelda = q => colorPct(casiCero(q) ? 0.01 : q?.v);
const pctCelda = q => (casiCero(q) ? `menos de ${pct(0.1)}` : pct(q.v));
const leyendaPct = [{ solo: true, t: 'Olivar en el término:' }, ...CL.map(c => ({ bg: c.c, t: c.t })), { c: 'rl-m--sin', t: 'Sin dato' }];

function capaPct(g, m, D, y, a, b, velo) {
  const por = D.dens[y].por;
  const c = vis(g.append('g'), a, b);
  c.selectAll('path').data(m.munis).join('path').attr('class', 'p-mun').attr('d', m.path).attr('fill', f => colorCelda(por[f.properties.c]));
  if (velo) {
    const de = cl => m.munis.filter(f => por[f.properties.c]?.f === cl && por[f.properties.c]?.v > 0);
    c.append('g').selectAll('path').data(de('1')).join('path').attr('d', m.path).attr('fill', 'url(#rl-tr-est)').style('pointer-events', 'none');
    if (y !== 1752) c.append('g').selectAll('path').data(de('2')).join('path').attr('d', m.path).attr('fill', 'url(#rl-tr-res)').style('pointer-events', 'none');
  }
  // 1752: los municipios sin cuadrar y los ajustados llevan siempre su trama, tengan o no cifra de olivar
  if (y === 1752) {
    [[D.sinCuadrar, 'rl-tr-res'], [D.ajustados, 'rl-tr-aju']].forEach(([lista, trama]) => {
      c.append('g').selectAll('path').data(m.munis.filter(f => lista.has(f.properties.c))).join('path')
        .attr('class', 'v-caso').attr('d', m.path).attr('fill', `url(#${trama})`).style('pointer-events', 'none');
    });
  }
  return c;
}
function tipMunicipio(g, m, D, y) {
  const por = D.dens[y].por;
  tip(g.append('g').selectAll('path').data(m.munis).join('path').attr('class', 'hit').attr('d', m.path), f => {
    const q = por[f.properties.c];
    const caso = y !== 1752 ? null : D.sinCuadrar.has(f.properties.c) ? D.textoMunSC : D.ajustados.has(f.properties.c) ? D.textoMunAJ : D.excedeMun.has(f.properties.c) ? D.textoExcede.replace('{pct}', N(D.excedeMun.get(f.properties.c), 1)) : null;
    if (!q || q.v === null) return `<b>${f.properties.n}</b>${rotAnio(y)}: sin cifra de olivar: ${q?.mot || 'sin dato (no es cero)'}${caso ? ` · ${caso}` : ''}`;
    const clase = caso ? caso : y === 1752 && !D.sumaMun.has(f.properties.c) ? `mínimo declarado · ${textoClase(q.f)}` : textoClase(q.f);
    const ha = q.ha > 0 && q.ha < 1 ? 'menos de 1 ha' : `${N(q.ha)} ha`;
    return `<b>${f.properties.n}</b>${rotAnio(y)}: ${ha} · ${pctCelda(q)} del término · ${clase}`;
  });
}
function rotuloAnio(g, w, top, compacto, y, linea, a, b) {
  const c = vis(g.append('g'), a, b);
  txt(c, w, top + (compacto ? 16 : 28), rotAnio(y), 't-gran t-halo', 'end');
  if (linea) txt(c, w, top + (compacto ? 30 : 46), linea, 't-sec t-halo', 'end');
}

// =====================================================================================================================
// Escenas
// =====================================================================================================================
const y1752 = {
  id: 'y1752', titulo: '1752: lo que declara el Catastro',
  pasos: D => {
    const K = D.K, S = D.P('41').de(1752), C = D.P('14').de(1752), J = D.P('23').de(1752);
    return [
      `<p class="rl-pre">Paso {{paso}}</p><h2>En 1752, el Catastro declara un mínimo de ${N(K['t.1752'])} ha de olivar</h2>
       <p>La historia empieza con el Catastro de Ensenada. Esa cifra equivale <b>como mínimo al ${pct(K['pct.1752'], 2)}</b> de la superficie de Andalucía, porque ${falta1752(K)}.</p>
       <p>Dentro de lo declarado destacan <b>Sevilla</b> (<b>${pct(S.parte)}</b>, con un ${pct(K['min.p.41.sin'])} de su superficie sin declarar), <b>Córdoba</b> (<b>${pct(C.parte)}</b>, ${pct(K['min.p.14.sin'])}) y <b>Jaén</b> (<b>${pct(J.parte)}</b>, ${pct(K['min.p.23.sin'])}).</p>
       <p class="rl-nota">Lo declarado no cierra con la superficie del término.</p>`,
      `<p><b>Hay cifra en ${N(K['par.1752'])} de ${N(K.parDe)} municipios.</b> Los otros <b>${N(K['n.1752.sin'])}</b> van con trama gris porque no tienen dato, que no es lo mismo que cero: en ${N(K['n.1752.ns'])} la fuente cita el olivar pero no da su superficie y en ${N(K['n.1752.d'])} no hay dato. Otros ${N(K['n.1752.cero'])} figuran con cero, ninguno como cifra directa de la fuente.</p>
       <p>De las hectáreas, el <b>${pct(K['cl.1752.obs'])}</b> es cifra de la fuente, el <b>${pct(K['cl.1752.est'])}</b> está estimado y el <b>${pct(K['cl.1752.res'])}</b> es de unidades que declaraban más tierra que su término. Ahí la cifra no es un mínimo, y cada municipio lleva el caso de su unidad:</p>
       <p><b>${mayus(D.textoSinCuadrar)}.</b> ${N(K['sc.mun'])} municipios de ${N(K['sc.ue'])} unidades del Catastro; ${N(K['sc.conOli'])} con cifra de olivar (${N(K['sc.ha'])} ha).</p>
       <p><b>${mayus(D.textoAjustado)}.</b> ${N(K['aj.mun'])} municipios de ${N(K['aj.ue'])} unidades; ${N(K['aj.conOli'])} con cifra de olivar (${N(K['aj.ha'])} ha).</p>`,
    ];
  },
  alt: (s, D) => `Mapa municipal del olivar declarado en 1752, un mínimo: ${N(D.K['par.1752'])} municipios con cifra y ${N(D.K['n.1752.sin'])} sin dato.`,
  fuente: () => 'Catastro de Ensenada (1750-1754): superficie declarada, en los municipios de hoy. Porcentaje sobre la superficie oficial del término.',
  dibuja({ g, html, w, h, D, compacto }) {
    defs(g);
    const casos = [{ c: 'rl-m--trr', t: mayus(D.textoMunSC) }, { c: 'rl-m--tra', t: mayus(D.textoMunAJ) }];
    leyenda(html, [...leyendaPct, ...casos], 1, 1);
    leyenda(html, [...leyendaPct, { c: 'rl-m--tre', t: 'Estimada' }, ...casos], 2, 2);
    // la leyenda es larga: el mapa empieza donde ella acaba, con la letra y el ancho reales
    const top = Math.ceil(d3.max(html.selectAll('.rl-ley').nodes(), n => n.getBoundingClientRect().height)) + 4;
    const m = baseMapa(D.topo, 0, top + (compacto ? 6 : 14), w, h - top - (compacto ? 6 : 14));
    capaPct(g, m, D, 1752, 1, 1, false);
    capaPct(g, m, D, 1752, 2, 2, true);
    rematar(g, m);
    rotuloAnio(g, w, top, compacto, 1752, `mínimo: ${N(D.K['t.1752'])} ha declaradas`, 1, 99);
    tipMunicipio(g, m, D, 1752);
  },
};

const y1880 = {
  id: 'y1880', titulo: 'Hacia 1880: más municipios con cifra',
  pasos: D => {
    const K = D.K, S = D.P('41').de(1880), C = D.P('14').de(1880), J = D.P('23').de(1880);
    return [
      `<p class="rl-pre">Paso {{paso}}</p><h2>Hacia 1880, las fuentes suman ${N(K['t.1880'])} ha</h2>
       <p>Ya hay cifra en <b>${N(K['par.1880'])}</b> municipios, ${N(K.masCifra)} más que en 1752. <b>Córdoba</b> (<b>${pct(C.parte)}</b>) y <b>Sevilla</b> (<b>${pct(S.parte)}</b>) van casi igualadas, y <b>Jaén</b> sube al <b>${pct(J.parte)}</b>.</p>
       <p class="rl-nota">Huelva, Granada y Almería, con borde discontinuo, llevan reserva. Los ${N(K['n.1880.sin'])} municipios con trama no declaran olivar en esta fuente: sin dato, no cero.</p>`,
      `<p><b>La suma de hacia 1880 es ${N(K.saltoX, 1)} veces el mínimo de 1752, pero ese salto mezcla crecimiento real con diferencias de cobertura, y con estos datos no se puede separar una cosa de la otra.</b></p>
       <p class="rl-nota">Hacia 1880, el ${pct(K['cl.1880.obs'])} de las hectáreas es cifra de la fuente, el ${pct(K['cl.1880.calc'])} está calculado de originales y el ${pct(K['cl.1880.est'])} está estimado.</p>`,
    ];
  },
  alt: (s, D) => `Mapa municipal del olivar hacia 1880: ${N(D.K['par.1880'])} municipios con cifra y ${N(D.K['n.1880.sin'])} sin dato.`,
  fuente: () => 'Reseña geográfica y estadística de España (1888) y Avance estadístico sobre el cultivo cereal (1891). Fechas de 1872 a 1890 según el municipio.',
  dibuja({ g, html, w, h, D, compacto }) {
    defs(g);
    const top = compacto ? 42 : 30;
    leyenda(html, [...leyendaPct, { c: 'rl-m--res', t: 'Provincia con reserva' }], 1, 1);
    leyenda(html, [...leyendaPct, { c: 'rl-m--tre', t: 'Estimada' }, { c: 'rl-m--res', t: 'Provincia con reserva' }], 2, 2);
    const m = baseMapa(D.topo, 0, top + (compacto ? 6 : 14), w, h - top - (compacto ? 6 : 14));
    capaPct(g, m, D, 1880, 1, 1, false);
    capaPct(g, m, D, 1880, 2, 2, true);
    rematar(g, m);
    const reservadas = topojson.merge(D.topo, D.topo.objects.provincias.geometries.filter(x => RESERVA_1880.includes(x.properties.p)));
    g.append('path').datum(reservadas).attr('d', m.path).attr('fill', 'none').attr('stroke', COLOR.estimado).attr('stroke-width', 2).attr('stroke-dasharray', '6 4').style('pointer-events', 'none');
    rotuloAnio(g, w, top, compacto, 1880, `${N(D.K['t.1880'])} ha`, 1, 99);
    tipMunicipio(g, m, D, 1880);
  },
};

const serie = {
  id: 'serie', titulo: 'Una línea de 268 años',
  pasos: D => {
    const K = D.K;
    return [
      `<p class="rl-pre">Paso {{paso}}</p><h2>De un mínimo de ${N(K['t.1752'])} ha en 1752 a ${N(K['t.2007'])} en 2007, y no en línea recta</h2>
       <p>Ocho fechas empalmadas en una sola línea. El punto de 1752 es <b>un mínimo</b>, al menos el <b>${pct(K['pct.1752'], 2)}</b> de la superficie de Andalucía, porque faltan municipios y tierras sin declarar. En 2007 el olivar ocupa el <b>${pct(K['pct.2007'], 2)}</b>, y entre las dos cifras no se puede calcular un multiplicador.</p>
       <p class="rl-nota">Las fuentes cambian de una fecha a otra. La forma de cada punto dice qué tipo de cifra es.</p>`,
      `<p>De hacia 1880 a 1956 se puede medir sobre el mismo grupo: en los <b>${N(K.mismosN)}</b> municipios de las cinco provincias sin reserva con cifra en las dos fechas, el olivar pasa de <b>${N(K.mismos80)}</b> a <b>${N(K.mismos56)} ha</b>: se multiplica por <b>${N(K.mismosX, 2)}</b>.</p>
       <p class="rl-nota">Un ${N(K.mismosEst, 0)} % de la superficie de partida en ese grupo es estimada: vale como orden de magnitud.</p>`,
      `<p><b>Luego cae.</b> Entre 1956 y 1984, Andalucía pierde <b>${N(Math.abs(K.caidaHa))} ha</b> de olivar (<b>${N(K.caidaPct, 1)} %</b>).</p>
       <p class="rl-nota">Tampoco es un simple trasvase entre clases: sumando al olivar los frutales, donde iba el olivar regado, y los leñosos mixtos, donde van los mosaicos con olivar, la superficie también baja, de ${N(K['sum3.1956'])} a ${N(K['sum3.1984'])} ha.</p>`,
      `<p><b>Y sube más de lo que había caído.</b> De 1984 a 2007 gana <b>${N(K.subeHa)} ha</b> (<b>${signo(K.subePct, 1)} %</b>) y llega a <b>${N(K['t.2007'])} ha</b>.</p>
       <p class="rl-nota">Hasta 2007, esta clase no lleva el olivar regado.</p>`,
      `<p><b>${AVISO_2020}.</b> La cifra de esa fecha es <b>${N(K['t.2020'])} ha</b>, el ${pct(K['pct.2020'], 2)} de la superficie de Andalucía.</p>
       <p class="rl-nota">La línea sigue hasta 2020, sin años interpolados, pero la diferencia con 2007 no es crecimiento real y aquí no se mide.</p>`,
    ];
  },
  alt: (s, D) => `Línea de la superficie de olivar en Andalucía: ${D.serie.map(q => `${rotAnio(q.y)}, ${N(q.v)} ha`).join('; ')}.`,
  fuente: s => (s <= 2
    ? 'Catastro de Ensenada; Reseña de 1888 y Avance de 1891; Mapas de Usos y Coberturas Vegetales de Andalucía; Sistema de Información sobre el Patrimonio Natural de Andalucía (2020).'
    : 'Mapas de Usos y Coberturas Vegetales de Andalucía (1956-2007) y Sistema de Información sobre el Patrimonio Natural de Andalucía (2020).'),
  dibuja({ g, html, w, h, D, compacto }) {
    defs(g);
    const K = D.K;
    leyenda(html, [{ c: 'rl-m--decl', t: '1752: mínimo declarado' }, { c: 'rl-m--hueco', t: 'Suma parcial' }, { c: 'rl-m--parte', t: 'En parte estimada' }, { c: 'rl-m--clase', t: 'Cambia el contenido de la clase' }]);
    const top = compacto ? 46 : 40, b = 24;
    const marca2020 = (c, x) => {
      const cx = x(2020), cy = y(K['t.2020']);
      const r = compacto ? 7 : 9, yt = y(compacto ? 2e5 : 3.5e5);
      anillo(c, cx, cy, r);
      c.append('line').attr('x1', cx).attr('x2', cx).attr('y1', cy + r).attr('y2', yt - (compacto ? 11 : 14))
        .attr('stroke', COLOR.tinta).attr('stroke-width', 1).style('pointer-events', 'none');
      txt(c, cx, yt, 'en 2020 cambia lo que incluye', 't-sec t-halo', 'end');
      txt(c, cx, yt + (compacto ? 12 : 15), 'esta clase: ya lleva el olivar regado', 't-sec t-halo', 'end');
    };
    const y = d3.scaleLinear([0, 1.75e6], [h - b, top]);
    ejeY(g, y, 0, w, [5e5, 1e6, 1.5e6], v => `${N(v / 1e6, 1)} M ha`);
    const lin = x => d3.line().x(q => x(q.y)).y(q => y(q.v));
    const marcas = (c, x, datos) => {
      datos.forEach(q => punto(c, x(q.y), y(q.v), tipoPunto(q), compacto ? 3.6 : 4.6));
      tip(c.append('g').selectAll('circle').data(datos).join('circle').attr('class', 'hit').attr('cx', q => x(q.y)).attr('cy', q => y(q.v)).attr('r', 11),
        q => `<b>${rotAnio(q.y)}</b>${N(q.v)} ha · ${q.par ? 'como mínimo ' : ''}${pct(q.pct, 2)} de Andalucía · ${textoPunto(q)}`);
    };

    // ---------- la línea entera, a escala de tiempo ----------
    const ent = vis(g.append('g'), 1, 2);
    const xE = d3.scaleLinear([1752, 2020], [compacto ? 10 : 16, w - (compacto ? 14 : 30)]);
    ejeX(ent, xE, h - b, compacto ? [1752, 1880, 1956, 2020] : [1752, 1800, 1850, 1900, 1956, 2020]);
    ent.append('path').datum(D.serie).attr('fill', 'none').attr('stroke', COLOR.verde).attr('stroke-width', 2.2).attr('d', lin(xE));
    marcas(ent, xE, D.serie);
    // 1752 es un mínimo: flecha hacia arriba desde el punto
    const y52 = y(K['t.1752']), x52 = xE(1752), alto52 = compacto ? 26 : 36;
    ent.append('path').attr('d', `M${x52} ${y52 - 7}V${y52 - alto52}m-4 6l4 -6l4 6`).attr('fill', 'none').attr('stroke', COLOR.estimado).attr('stroke-width', 1.8).style('pointer-events', 'none');
    txt(ent, x52 + 8, y52 - alto52 + 2, `mínimo: ${N(K['t.1752'])}`, 't-num t-halo');
    txt(ent, xE(1880), y(K['t.1880']) + 21, N(K['t.1880']), 't-num t-halo', 'middle');
    txt(ent, xE(2020), y(K['t.2020']) - 13, N(K['t.2020']), 't-num t-halo', 'end');
    marca2020(ent, xE);
    const s2 = vis(ent.append('g'), 2, 2);
    const ya = y(K.mismos80), yb = y(K.mismos56);
    s2.append('line').attr('x1', xE(1880)).attr('x2', xE(1956)).attr('y1', ya).attr('y2', yb).attr('stroke', COLOR.estimado).attr('stroke-width', 1.8).attr('stroke-dasharray', '5 4');
    [[1880, ya], [1956, yb]].forEach(([a, cy]) => s2.append('circle').attr('cx', xE(a)).attr('cy', cy).attr('r', 4).attr('fill', '#fff').attr('stroke', COLOR.estimado).attr('stroke-width', 2));
    const xM = xE(compacto ? 1942 : 1925);
    txt(s2, xM, (ya + yb) / 2 + (compacto ? 50 : 48), `×${N(K.mismosX, 2)}`, 't-gran t-halo', 'middle');
    txt(s2, xM, (ya + yb) / 2 + (compacto ? 64 : 66), `los mismos ${N(K.mismosN)} municipios`, 't-sec t-halo', 'middle');

    // ---------- detalle de 1956 a 2020: misma línea, misma escala vertical ----------
    const det = vis(g.append('g'), 3, 5);
    const map = D.serie.filter(q => q.y >= 1956);
    const xD = d3.scaleLinear([1956, 2020], [compacto ? 16 : 26, w - (compacto ? 18 : 36)]);
    txt(det, xD(1956), top + 14, 'Detalle, 1956-2020', 't-sec t-halo');
    ejeX(det, xD, h - b, compacto ? [1956, 1984, 2007, 2020] : [1956, 1977, 1984, 1999, 2007, 2020]);
    det.append('path').datum(map).attr('fill', 'none').attr('stroke', COLOR.verde).attr('stroke-width', 2.2).attr('d', lin(xD));
    marcas(det, xD, map);
    txt(det, xD(1956), y(K['t.1956']) - 12, N(K['t.1956']), 't-num t-halo');
    txt(det, xD(1984), y(K['t.1984']) + 21, N(K['t.1984']), 't-num t-halo', 'middle');
    txt(det, xD(2007), y(K['t.2007']) - 12, N(K['t.2007']), 't-num t-halo', 'end');
    txt(det, xD(2020), y(K['t.2020']) - 13, N(K['t.2020']), 't-num t-halo', 'end');
    marca2020(det, xD);
    const s3 = vis(det.append('g'), 3, 3);
    s3.append('path').datum(map.filter(q => q.y <= 1984)).attr('fill', 'none').attr('stroke', COLOR.perdida).attr('stroke-width', 3.4).attr('d', lin(xD));
    txt(s3, xD(1970), y(K['t.1984']) + (compacto ? 50 : 66), `${N(K.caidaPct, 1)} %`, 't-gran t-halo', 'middle');
    const s4 = vis(det.append('g'), 4, 4);
    s4.append('path').datum(map.filter(q => q.y >= 1984 && q.y <= 2007)).attr('fill', 'none').attr('stroke', COLOR.verde).attr('stroke-width', 3.8).attr('d', lin(xD));
    txt(s4, xD(1996), y(K['t.1984']) + (compacto ? 50 : 66), `${signo(K.subePct, 1)} %`, 't-gran t-halo', 'middle');
  },
};

const provincias = {
  id: 'provincias', titulo: 'De Sevilla a Jaén',
  pasos: D => {
    const K = D.K, J = D.P('23'), S = D.P('41'), G = D.P('18');
    return [
      `<p class="rl-pre">Paso {{paso}}</p><h2>Lo declarado en 1752 pone a Sevilla por delante de Jaén; en 2007, Jaén tiene ${N(K.r2007, 1)} veces el olivar de Sevilla</h2>
       <p>En 1752 son mínimos: <b>Sevilla</b> declara al menos <b>${N(S.de(1752).v)} ha</b>, con un ${pct(K['min.p.41.sin'])} de su superficie sin declarar, y <b>Jaén</b> al menos <b>${N(J.de(1752).v)}</b>, con un ${pct(K['min.p.23.sin'])}. La razón entre ambas, ${N(K.r1752, 1)}, compara lo declarado, no el olivar real.</p>
       <p>En 2007 son <b>${N(S.de(2007).v)}</b> y <b>${N(J.de(2007).v)} ha</b>. Jaén es la primera provincia en todas las fechas desde 1956.</p>
       <p class="rl-nota">En 1752 hay cifra en ${N(K.sevCon)} de ${N(K.sevDe)} municipios de Sevilla y en ${N(K.jaeCon)} de ${N(K.jaeDe)} de Jaén. Huelva lleva al menos un ${N(K.huelvaPe, 0)} % de cifra estimada entre 1956 y 2007.</p>`,
      `<p><b>El vuelco se ve entre 1956 y 1984.</b> Sevilla pasa de <b>${N(S.de(1956).v)}</b> a <b>${N(S.de(1984).v)} ha</b> (<b>${N(S.d1, 1)} %</b>), mientras Jaén gana un <b>${N(J.d1, 1)} %</b> y Granada un <b>${N(G.d1, 1)} %</b>: son las dos únicas que suben. De 1984 a 2007 suben las ocho.</p>`,
      `<p><b>El peso se desplaza.</b> Con los mapas completos, Jaén pasa del <b>${pct(J.de(1956).parte)}</b> del olivar andaluz en 1956 al <b>${pct(J.de(2007).parte)}</b> en 2007, y Sevilla del <b>${pct(S.de(1956).parte)}</b> al <b>${pct(S.de(2007).parte)}</b>.</p>
       <p class="rl-nota">Los cuadrados de 1752 son la parte de cada provincia en lo declarado (Sevilla ${pct(S.de(1752).parte)}, Jaén ${pct(J.de(1752).parte)}), no en el olivar real.</p>
       <p>Jaén y Córdoba juntas reúnen el <b>${pct(K.jc1956)}</b> en 1956 y el <b>${pct(K.jc2007)}</b> en 2007.</p>`,
    ];
  },
  alt: (s, D) => `Olivar por provincia de 1752 a 2020. Sevilla: mínimo de ${N(D.P('41').de(1752).v)} ha en 1752 y ${N(D.P('41').de(2007).v)} en 2007. Jaén: mínimo de ${N(D.P('23').de(1752).v)} y ${N(D.P('23').de(2007).v)}.`,
  fuente: () => 'Catastro de Ensenada; Reseña de 1888 y Avance de 1891; Mapas de Usos y Coberturas Vegetales de Andalucía; Sistema de Información sobre el Patrimonio Natural (2020).',
  dibuja({ g, html, w, h, D, compacto }) {
    leyenda(html, [{ c: 'rl-m--decl', t: '1752: mínimo declarado' }, { c: 'rl-m--hueco', t: 'Estimada, reserva o suma parcial' }, { c: 'rl-m--parte', t: 'En parte estimada' }, { c: 'rl-m--lleno', t: 'Observada' }, { c: 'rl-m--clase', t: '2020: ya lleva el olivar regado' }], 1, 2);
    const orden = [...D.provs].sort((a, b) => b.de(2007).v - a.de(2007).v);
    const top = compacto ? 50 : 30;
    const mult = vis(g.append('g'), 1, 2);
    const cols = compacto ? 2 : 4, filas = Math.ceil(8 / cols);
    const gapX = compacto ? 12 : 22, gapY = compacto ? 4 : 14;
    const cw = (w - gapX * (cols - 1)) / cols, ch = (h - top - gapY * (filas - 1)) / filas;
    const maxV = d3.max(D.provs, q => d3.max(q.s, i => i.v));
    orden.forEach((q, k) => {
      const c = mult.append('g').attr('transform', `translate(${(k % cols) * (cw + gapX)},${top + Math.floor(k / cols) * (ch + gapY)})`);
      const tp = compacto ? 16 : 26, bt = compacto ? 4 : 18;
      const x = d3.scaleLinear([1752, 2020], [4, cw - 5]);
      const y = d3.scaleLinear([0, maxV * 1.06], [ch - bt, tp]);
      c.append('line').attr('class', 'g-base').attr('x1', 0).attr('x2', cw).attr('y1', y(0)).attr('y2', y(0));
      if (!compacto) { txt(c, 0, ch - 4, '1752', 't-eje'); txt(c, cw, ch - 4, '2020', 't-eje', 'end'); }
      const lin = d3.line().x(i => x(i.y)).y(i => y(i.v));
      D.provs.filter(o => o !== q).forEach(o => c.append('path').datum(o.s).attr('d', lin).attr('fill', 'none').attr('stroke', '#e2e2de').attr('stroke-width', 1));
      const clave = q.p === '41' || q.p === '23';
      c.append('path').datum(q.s).attr('d', lin).attr('fill', 'none').attr('stroke', COLOR.verde).attr('stroke-width', 2);
      if (clave) vis(c.append('path'), 2, 2).datum(q.s).attr('d', lin).attr('fill', 'none').attr('stroke', q.p === '41' ? COLOR.perdida : COLOR.hondo).attr('stroke-width', 3);
      q.s.forEach(i => punto(c, x(i.y), y(i.v), tipoPunto(i), compacto ? 2 : 2.8));
      anillo(c, x(2020), y(q.de(2020).v), compacto ? 4.5 : 5.5);
      ajusta(txt(c, 0, compacto ? 11 : 15, q.n, 't-tit'), cw * .52);
      txt(c, cw, compacto ? 11 : 15, `${N(q.de(2007).v / 1000)} mil (2007)`, 't-sec', 'end');
      tip(c.append('rect').attr('class', 'hit').attr('width', cw).attr('height', ch).datum(q),
        o => `<b>${o.n}</b>${o.s.map(i => `${i.y === 1752 ? '1752 (mínimo)' : rotAnio(i.y)}: ${N(i.v)}`).join(' · ')} ha · en 1752, ${pct(D.K[`min.p.${o.p}.sin`])} de su superficie sin declarar y ${N(D.K[`min.p.${o.p}.nsin`])} municipios sin ningún uso`);
    });

    // ---------- parte de cada provincia ----------
    const pes = vis(g.append('g'), 3, 3);
    leyenda(html, [{ c: 'rl-m--decl', t: '1752: parte de lo declarado' }, { c: 'rl-m--parte', t: '1956' }, { c: 'rl-m--lleno', t: '2007' }], 3, 3);
    const izq = compacto ? 58 : 84, der = compacto ? 38 : 56;
    const x = d3.scaleLinear([0, 42], [izq, w - der]);
    const fy = d3.scaleBand(orden.map(q => q.p), [top + 4, h - 20]).padding(.2);
    txt(pes, izq, h - 4, 'Parte del olivar andaluz en cada fecha (%)', 't-sec');
    [0, 10, 20, 30, 40].forEach(v => {
      pes.append('line').attr('class', 'g-rej').attr('x1', x(v)).attr('x2', x(v)).attr('y1', top + 4).attr('y2', h - 20);
      txt(pes, x(v), h - 21 + 12, '', 't-eje', 'middle');
    });
    orden.forEach(q => {
      const cy = fy(q.p) + fy.bandwidth() / 2, a = q.de(1752), m = q.de(1956), z = q.de(2007);
      txt(pes, izq - 7, cy + 4, q.n, 't-rot', 'end');
      pes.append('line').attr('x1', x(a.parte)).attr('x2', x(z.parte)).attr('y1', cy).attr('y2', cy).attr('stroke', COLOR.medio).attr('stroke-width', 2);
      punto(pes, x(a.parte), cy, 'decl', compacto ? 3.4 : 4.4);
      punto(pes, x(m.parte), cy, 'pest', compacto ? 3.4 : 4.2);
      const zp = pes.append('circle').attr('cx', x(z.parte)).attr('cy', cy).attr('r', compacto ? 4 : 5).attr('fill', COLOR.verde).attr('stroke', COLOR.verde);
      zp.attr('stroke-width', 2);
      const sube = z.parte >= a.parte;
      const rotulo = (v, lado, cls) => {          // junto al punto o, si no cabe antes del nombre, encima
        const xr = x(v) + lado * 9, arriba = lado < 0 && xr < izq + 30;
        txt(pes, arriba ? x(v) : xr, arriba ? cy - 9 : cy + 4, N(v, 1), cls, arriba ? 'middle' : lado > 0 ? 'start' : 'end');
      };
      rotulo(z.parte, sube ? 1 : -1, 't-num t-halo');
      rotulo(a.parte, sube ? -1 : 1, 't-sec t-halo');
    });
  },
};

const mar = {
  id: 'mar', titulo: 'Municipios casi de un solo cultivo',
  pasos: D => {
    const K = D.K;
    return [
      `<p class="rl-pre">Paso {{paso}}</p><h2>De ${N(K['d.1956.m75'])} municipios en 1956 a ${N(K['d.2007.m75'])} en 2007 con tres cuartas partes de olivar</h2>
       <p>Con lo declarado en 1752, ninguno de los ${N(K['d.1752.n'])} municipios con cifra pasa del 75 % de su término, y hacia 1880 solo ${N(K['d.1880.m75'])} de ${N(K['d.1880.n'])}. En <b>1956</b> son <b>${N(K['d.1956.m75'])}</b>, y <b>${N(K['d.1956.m50'])}</b> pasan de la mitad.</p>
       <p class="rl-nota">Las barras con trama son fechas con suma parcial. Con valor estimado en 1956: ${N(K['d.1956.e75'])} de los ${N(K['d.1956.m75'])} y ${N(K['d.1956.e50'])} de los ${N(K['d.1956.m50'])}.</p>`,
      `<p>En <b>2007</b> ya son <b>${N(K['d.2007.m75'])}</b> los que pasan del 75 % y <b>${N(K['d.2007.m50'])}</b> los que pasan de la mitad.</p>
       <p class="rl-nota">Con valor estimado: ${N(K['d.2007.e75'])} y ${N(K['d.2007.e50'])}.</p>`,
      `<p><b>${AVISO_2020}.</b> Con ese contenido, <b>${N(K['d.2020.m75'])}</b> municipios pasan del 75 % y <b>${N(K['d.2020.m50'])}</b> de la mitad; <b>${N(K.jaen75)}</b> de los ${N(K['d.2020.m75'])} están en Jaén.</p>
       <p class="rl-nota">Por eso esas cifras no se comparan con las de 2007. Con valor estimado: ${N(K['d.2020.e75'])} y ${N(K['d.2020.e50'])}. El porcentaje es la superficie de olivar sobre la del término municipal.</p>`,
    ];
  },
  alt: (s, D) => {
    const y = [1956, 2007, 2020][s - 1];
    return `Mapa municipal del porcentaje de olivar en ${y}. Municipios con más del 75 %: ${D.K[`d.${y}.m75`]}.`;
  },
  fuente: s => (s < 3 ? `Mapa de Usos y Coberturas Vegetales del Suelo de Andalucía, ${s === 1 ? 1956 : 2007}.` : 'Sistema de Información sobre el Patrimonio Natural de Andalucía, 2020; la clase ya lleva el olivar regado.') + ' Trama blanca: municipio con cifra estimada.',
  dibuja({ g, html, w, h, D, compacto }) {
    defs(g);
    const top = compacto ? 42 : 30;
    leyenda(html, [...leyendaPct, { c: 'rl-m--tre', t: 'Estimada' }]);
    const altoB = compacto ? 62 : Math.min(112, h * .2);
    const hMapa = h - top - altoB - 6;
    const m = baseMapa(D.topo, 0, top + (compacto ? 2 : 10), w, hMapa - (compacto ? 2 : 10));
    [[1956, 1, 1], [2007, 2, 2], [2020, 3, 99]].forEach(([y, a, b]) => {
      capaPct(g, m, D, y, a, b, true);
    });
    rematar(g, m);
    [[1956, 1, 1], [2007, 2, 2], [2020, 3, 99]].forEach(([y, a, b]) => rotuloAnio(g, w, top, compacto, y, `${N(D.dens[y].m75)} municipios con más del 75 %`, a, b));
    tip(g.append('g').selectAll('path').data(m.munis).join('path').attr('class', 'hit').attr('d', m.path), f => {
      const fmt = y => { const q = D.dens[y].por[f.properties.c]; return q?.v === null || q?.v === undefined ? 'sin dato' : `${pctCelda(q)}${q.f === '1' ? ' (estimada)' : ''}`; };
      return `<b>${f.properties.n}</b>1956: ${fmt(1956)} · 2007: ${fmt(2007)} · 2020: ${fmt(2020)}`;
    });

    // ---------- barras: municipios con más del 75 % en las ocho fechas ----------
    const y0 = h - altoB, yb = h - 16;
    const x = d3.scaleBand(D.anios, [0, w]).padding(.22);
    const y = d3.scaleLinear([0, d3.max(D.anios, a => D.dens[a].m75)], [yb, y0 + 16]);
    g.append('line').attr('class', 'g-base').attr('x1', 0).attr('x2', w).attr('y1', yb).attr('y2', yb);
    const actual = { 1956: [1, 1], 2007: [2, 2], 2020: [3, 99] };
    D.anios.forEach(a => {
      const n = D.dens[a].m75, parcialA = a === 1752 || a === 1880;
      g.append('rect').attr('x', x(a)).attr('width', x.bandwidth()).attr('y', y(n)).attr('height', Math.max(1, yb - y(n)))
        .attr('fill', parcialA ? 'url(#rl-est)' : COLOR.medio);
      if (actual[a]) vis(g.append('rect'), ...actual[a]).attr('x', x(a)).attr('width', x.bandwidth()).attr('y', y(n)).attr('height', Math.max(1, yb - y(n))).attr('fill', '#0c4a2e');
      txt(g, x(a) + x.bandwidth() / 2, y(n) - 3, `${parcialA ? '≥' : ''}${N(n)}`, 't-sec t-halo', 'middle');
      if (a === 2020) g.append('rect').attr('x', x(a) - 1).attr('width', x.bandwidth() + 2).attr('y', y(n) - 1).attr('height', Math.max(2, yb - y(n) + 1)).attr('fill', 'none').attr('stroke', COLOR.tinta).attr('stroke-width', 1.6).style('pointer-events', 'none');
      txt(g, x(a) + x.bandwidth() / 2, yb + 12, a === 2020 ? '2020*' : compacto && a === 1880 ? '1880' : rotAnio(a), 't-eje', 'middle');
    });
    txt(g, 0, y0 + 9, '* ya lleva el olivar regado', 't-sec t-halo');
  },
};

const hoy = {
  id: 'hoy', titulo: 'Dónde está hoy',
  pasos: D => {
    const K = D.K, h1 = D.topHa[0], p1 = D.topPct[0];
    return [
      `<p class="rl-pre">Paso {{paso}}</p><h2>${N(K.hoyMitad)} municipios reúnen la mitad del olivar andaluz</h2>
       <p>En 2020, de los <b>${N(K.hoyCon)}</b> municipios con olivar, <b>${N(K.hoyMitad)}</b> suman la mitad de la superficie. <b>${h1.n}</b> es el de más hectáreas (<b>${N(h1.v)} ha</b>${h1.f === '1' ? ', cifra estimada' : ''}), y <b>${p1.n}</b> el de mayor densidad: el <b>${pct(p1.p)}</b> de su término.</p>
       <p class="rl-nota">${AVISO_2020}: estas cifras son el reparto de esa fecha.</p>`,
    ];
  },
  alt: (s, D) => `Municipios con más olivar en 2020, encabezados por ${D.topHa[0].n}, y con mayor densidad, encabezados por ${D.topPct[0].n}.`,
  fuente: () => 'Sistema de Información sobre el Patrimonio Natural de Andalucía, 2020; la clase ya lleva el olivar regado. Barra con trama: cifra estimada.',
  dibuja({ html, h, D, compacto }) {
    const c = html.append('div').attr('class', 'rl-listas');
    const n = compacto ? (h < 300 ? 4 : 5) : 6;
    lista(c, {
      titulo: 'Más hectáreas', nota: 'Superficie de olivar en 2020', max: D.topHa[0].v,
      filas: D.topHa.slice(0, n).map(q => ({ nombre: q.n, valor: `${N(q.v)} ha`, medida: q.v, est: q.f === '1', det: q.f === '1' ? 'cifra estimada' : '' })),
    });
    lista(c, {
      titulo: 'Más densidad', nota: '% del término municipal con olivar en 2020', max: 100,
      filas: D.topPct.slice(0, n).map(q => ({ nombre: q.n, valor: pct(q.p), medida: q.p, est: q.f === '1', det: q.f === '1' ? 'cifra estimada' : '' })),
    });
  },
};

const mundo = {
  id: 'mundo', titulo: 'Andalucía en el mundo',
  pasos: D => {
    const K = D.K;
    return [
      `<p class="rl-pre">Paso {{paso}}</p><h2>Hoy, entre el ${rango(K)} % del olivar mundial</h2>
       <p>FAOSTAT da para 2024 <b>${N(K.mundo)} ha</b> de olivar cosechado en el mundo. La encuesta oficial española da a Andalucía <b>${N(K.andEsy)} ha</b>: el <b>${pct(K.pctDirecto)}</b>.</p>
       <p>Las dos fuentes no miden igual: la española cuenta también plantaciones jóvenes y abandonadas. Si a la cifra de España en FAOSTAT se le aplica la parte andaluza de la encuesta (<b>${pct(K.cuotaEsp)}</b>), sale el <b>${pct(K.pctEscala)}</b>.</p>
       <p class="rl-nota">Es una fracción importante, no la mayor parte de la superficie mundial. España entera tiene el ${pct(K.pctEsp)}.</p>`,
      `<p><b>Más que casi cualquier país.</b> Con cualquiera de las dos medidas, Andalucía tiene más olivar que Marruecos, Italia, Turquía o Grecia. Por delante solo quedan España, de la que forma parte, y Túnez.</p>
       <p class="rl-nota">La cifra de Túnez de 2024 es imputada por FAOSTAT, y su serie oscila mucho: entre ${N(FAOSTAT.tunezMin)} y ${N(FAOSTAT.tunezMax)} ha de 2018 a 2024. Por eso el total mundial se mueve entre ${N(FAOSTAT.mundoMin)} ha (${FAOSTAT.mundoMinAnio}) y ${N(FAOSTAT.mundoMax)} ha (${FAOSTAT.mundoMaxAnio}).</p>
       <p class="rl-cta"><a href="visor.html?ind=usos_olivar_pct&amp;nivel=municipio&amp;anio=1752">Ver el olivar en el visor</a><a href="visor.html?ind=usos_olivar_ha&amp;nivel=provincia&amp;anio=1752">Por provincias</a></p>`,
    ];
  },
  alt: (s, D) => (s === 1
    ? `Cien casillas representan el olivar mundial; Andalucía ocupa entre ${N(D.K.pctMin, 1)} y ${N(D.K.pctMax, 1)}.`
    : 'Barras de superficie de olivar de los mayores países en 2024, con Andalucía entre ellos.'),
  fuente: () => `${FAOSTAT.cita}. ${ESYRCE.cita}.`,
  dibuja({ g, html, w, h, D, compacto }) {
    defs(g);
    const K = D.K;
    leyenda(html, [{ bg: COLOR.verde, t: 'Andalucía' }, { c: 'rl-m--est', t: 'Margen entre las dos medidas' }, { bg: COLOR.claro, t: 'Resto de España' }, { bg: COLOR.base, t: 'Resto del mundo' }, { solo: true, t: 'Cada casilla, 1 %' }], 1, 1);
    const w1 = vis(g.append('g'), 1, 1);
    const top = compacto ? 42 : 40;
    const lado = Math.min((w - 8) / 10, (h - top - 4) / 10);
    const x0 = Math.max(0, (w - lado * 10) / 2) * (compacto ? 1 : .18);
    const firme = Math.floor(K.pctMin), margen = Math.ceil(K.pctMax) - firme, esp = Math.round(K.pctEsp);
    d3.range(100).forEach(i => {
      const fila = Math.floor(i / 10), col = i % 10;
      w1.append('rect').attr('x', x0 + col * lado + 1).attr('y', top + fila * lado + 1).attr('width', lado - 3).attr('height', lado - 3)
        .attr('fill', i < firme ? COLOR.verde : i < firme + margen ? 'url(#rl-est)' : i < esp ? COLOR.claro : COLOR.base);
    });
    if (!compacto) {
      const xt = x0 + lado * 10 + 22, ww = w - xt;
      if (ww > 150) {
        txt(w1, xt, top + 34, `${N(K.pctMin, 1)}-${N(K.pctMax, 1)} %`, 't-gran');
        txt(w1, xt, top + 54, 'Andalucía', 't-rot');
        txt(w1, xt, top + 104, pct(K.pctEsp), 't-gran');
        txt(w1, xt, top + 124, 'España entera', 't-rot');
      }
    }

    const w2 = vis(g.append('g'), 2, 2);
    const filas = [
      ...FAOSTAT.paises.map(p => ({ n: p.n, ha: p.ha, tipo: p.clase === 'imputada' ? 'imp' : 'pais' })),
      { n: 'Andalucía', ha: K.andEsy, min: K.andEscala, tipo: 'and' },
    ].sort((a, b) => b.ha - a.ha);
    const izq = compacto ? 72 : 96, dcha = compacto ? 72 : 110, t2 = 8, b2 = 4;
    const y = d3.scaleBand(filas.map(f => f.n), [t2, h - b2]).padding(.3);
    const x = d3.scaleLinear([0, FAOSTAT.paises[0].ha], [izq, w - dcha]);
    filas.forEach(f => {
      txt(w2, izq - 7, y(f.n) + y.bandwidth() / 2 + 4, f.n, f.tipo === 'and' ? 't-rot' : '', 'end');
      if (f.tipo === 'and') {
        w2.append('rect').attr('x', izq).attr('y', y(f.n)).attr('height', y.bandwidth()).attr('width', x(f.min) - izq).attr('fill', COLOR.verde);
        w2.append('rect').attr('x', x(f.min)).attr('y', y(f.n)).attr('height', y.bandwidth()).attr('width', x(f.ha) - x(f.min)).attr('fill', 'url(#rl-est)');
      } else {
        w2.append('rect').attr('x', izq).attr('y', y(f.n)).attr('height', y.bandwidth()).attr('width', x(f.ha) - izq).attr('fill', f.tipo === 'imp' ? 'url(#rl-est)' : COLOR.medio);
      }
      const et = f.tipo === 'and' ? `${N(f.min / 1e6, 2)}-${N(f.ha / 1e6, 2)} M ha` : `${N(f.ha / 1e6, 2)} M ha${f.tipo === 'imp' ? '*' : ''}`;
      txt(w2, x(f.ha) + 6, y(f.n) + y.bandwidth() / 2 + 4, et, 't-num');
    });
    txt(w2, w, h - 6, '* imputada por FAOSTAT', 't-sec', 'end');
  },
};

/** Lista de escenas; el paso de España entra solo cuando su serie está cargada. */
export const escenas = D => [y1752, y1880, serie, provincias, mar, hoy, ...(D.espana ? [escenaEspana] : []), mundo];

export const cierre = D => ({
  enlaces: [
    { t: 'Olivar, % del término', u: 'visor.html?ind=usos_olivar_pct&nivel=municipio&anio=1752' },
    { t: 'Olivar, hectáreas por municipio', u: 'visor.html?ind=usos_olivar_ha&nivel=municipio&anio=1752' },
    { t: 'Olivar por provincia', u: 'visor.html?ind=usos_olivar_ha&nivel=provincia&anio=1752' },
  ],
  notas: [
    'La línea empalma fuentes distintas: Catastro de Ensenada (1752), Reseña de 1888 y Avance de 1891 (hacia 1880), mapas de usos de la Junta (1956-2007) y Sistema de Información sobre el Patrimonio Natural (2020). Cada punto lleva su tipo.',
    'Hasta 2007 la clase de olivar no lleva el olivar regado, que iba en frutales; en 2020 lo lleva todo. La línea sigue, sin años interpolados, y la diferencia entre 2007 y 2020 no se presenta como crecimiento: ninguna cuenta de este relato cruza ese tramo.',
    `En Andalucía y en cada provincia, 1752 es un mínimo: ${falta1752(D.K)}. Lo declarado no cierra con el término, y de 1752 a cualquier fecha posterior no se calcula un multiplicador como crecimiento real.`,
    `En ${N(D.K['sc.mun'] + D.K['aj.mun'] + D.K['ex.mun'])} municipios la cifra de 1752 no es un mínimo. ${mayus(D.textoSinCuadrar)}: ${N(D.K['sc.mun'])} municipios de ${N(D.K['sc.ue'])} unidades del Catastro. ${mayus(D.textoAjustado)}: ${N(D.K['aj.mun'])} municipios de ${N(D.K['aj.ue'])} unidades. En otros ${N(D.K['ex.mun'])}, fuera de esas listas, sus clases suman más de lo que cabe en su superficie.`,
    '1752 y hacia 1880 son sumas parciales; hacia 1880 lleva reserva en Huelva, Granada y Almería. Sin dato no es cero.',
    `Andalucía no concentra la mayor parte del olivar mundial: entre un ${N(D.K.pctMin, 1)} y un ${N(D.K.pctMax, 1)} % de la superficie, según se mida.`,
    'La cifra andaluza de 2024 es la del informe del Ministerio sobre el olivar; los resultados generales de esa encuesta para 2024 figuran como provisionales.',
    'Este relato describe patrones. No atribuye causas a los cambios porque no se apoya aquí en una referencia que las demuestre.',
  ],
  fuentes: D.fuentes,
  extra: [
    ...(D.espana ? [{ titulo: ESPANA.fuente, url: ESPANA.url }] : []),
    { titulo: FAOSTAT.cita, url: FAOSTAT.url }, { titulo: ESYRCE.cita, url: ESYRCE.url },
  ],
});
