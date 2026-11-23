// Atlas Histórico de Andalucía · «Cómo se hace»: escenas de los pasos 4 a 6 (fronteras, huecos, leer cada cifra).
import { d3, topojson, COLOR, N, esc, vis, txt, tip, ejeX, ejeY, cruz, ajusta } from './util.js';
import { DALIAS, EJIDO } from './datos.js';

const proyeccion = () => d3.geoConicConformal().parallels([36, 38.5]).rotate([4.5, 0]);

// ---------- Paso 4: armonizar fronteras ---------------------------------------------------------------------------------
export const fronteras = {
  id: 'fronteras', titulo: 'Armonizar fronteras',
  fuente: s => (s < 4
    ? 'Censos del INE; Real Decreto 2251/1982 (BOE n.º 218, 11-9-1982). Recintos municipales del IECA (2026); el término de 1981 es su unión.'
    : 'Censos del INE; reparto con las series homogéneas de Goerlich y otros (Fundación BBVA e Ivie). Estimación del Atlas.'),
  alt: (s, D) => ['', `Mapa del antiguo término de Dalías, con ${D.t.d81} habitantes en 1981.`,
    'El mismo mapa con la línea que lo divide en 1982.',
    `Dos municipios en 1991: Dalías, ${D.t.d91d}; El Ejido, ${D.t.d91e}.`,
    `La cifra de 1981 repartida: ${D.t.d81d} en Dalías y ${D.t.d81e} en El Ejido, estimados.`,
    'Áreas apiladas de Dalías y El Ejido de 1842 a 2021; hasta 1981 la división es estimada.'][s],
  dibuja({ g, w, h, D, compacto }) {
    const objs = D.topo.objects.municipios;
    const par = objs.geometries.filter(o => o.properties.c === DALIAS || o.properties.c === EJIDO);
    const antiguo = topojson.merge(D.topo, par);
    const altoCuenta = compacto ? 62 : 84;
    const hm = h - altoCuenta - 6;
    const pr = proyeccion().fitExtent([[10, 8], [w - 10, hm - 6]], antiguo);
    const path = d3.geoPath(pr);
    const feats = topojson.feature(D.topo, objs).features;
    const [[bx0, by0], [bx1, by1]] = [[-30, -30], [w + 30, hm + 30]];
    const ctx = feats.filter(f => {
      if (f.properties.c === DALIAS || f.properties.c === EJIDO) return false;
      const [[a, b], [c, d]] = path.bounds(f);
      return c > bx0 && a < bx1 && d > by0 && b < by1;
    });
    const clipId = 'ch-clip-mapa';
    g.append('clipPath').attr('id', clipId).append('rect').attr('width', w).attr('height', hm);
    const mapa = vis(g.append('g').attr('clip-path', `url(#${clipId})`), 1, 4);
    mapa.append('g').selectAll('path').data(ctx).join('path').attr('class', 'p-ctx').attr('d', path);

    vis(mapa.append('path').datum(antiguo).attr('d', path).attr('fill', '#9dbcd8').attr('stroke', COLOR.tinta).attr('stroke-width', 1.5), 1, 2);
    const fD = feats.find(f => f.properties.c === DALIAS), fE = feats.find(f => f.properties.c === EJIDO);
    const dos = vis(mapa.append('g'), 3, 4);
    dos.append('path').datum(fD).attr('d', path).attr('fill', COLOR.tomado).attr('stroke', '#fff').attr('stroke-width', 1.5)
      .call(tip, () => `<b>Dalías</b>1991: ${D.t.d91d} habitantes`);
    dos.append('path').datum(fE).attr('d', path).attr('fill', '#7fa7cc').attr('stroke', '#fff').attr('stroke-width', 1.5)
      .call(tip, () => `<b>El Ejido</b>1991: ${D.t.d91e} habitantes`);
    const raya = topojson.mesh(D.topo, objs, (a, b) => (a.properties.c === DALIAS && b.properties.c === EJIDO) || (a.properties.c === EJIDO && b.properties.c === DALIAS));
    vis(mapa.append('path').datum(raya).attr('d', path).attr('fill', 'none').attr('stroke', COLOR.mal).attr('stroke-width', 2.5).attr('stroke-dasharray', '6 4'), 2, 2);

    const [cx, cy] = path.centroid(antiguo);
    const c1 = vis(mapa.append('g'), 1, 2);
    txt(c1, cx, cy - 4, 'Dalías', 't-tit t-halo', 'middle');
    txt(c1, cx, cy + 14, 'un solo municipio', 't-sec t-halo', 'middle');
    const c3 = vis(mapa.append('g'), 3, 4);
    const [dx, dy] = path.centroid(fD), [ex, ey] = path.centroid(fE);
    txt(c3, dx, dy, 'Dalías', 't-tit t-halo', 'middle');
    txt(c3, ex, ey, 'El Ejido', 't-tit t-halo', 'middle');

    // la cuenta de abajo
    const yB = hm + (compacto ? 26 : 34), altoB = compacto ? 14 : 18;
    const barra = (a, b, tit, partes, total) => {
      const c = vis(g.append('g'), a, b);
      txt(c, 0, yB - 10, tit, 't-rot');
      const xx = d3.scaleLinear([0, total], [0, w - 2]);
      let ac = 0;
      partes.forEach((p, i) => {
        const r = c.append('rect').attr('x', xx(ac) + (i ? 1 : 0)).attr('y', yB).attr('height', altoB)
          .attr('width', Math.max(2, xx(p.v) - (i ? 1 : 0))).attr('fill', p.fill).attr('stroke', p.st || 'none');
        tip(r, () => `<b>${esc(p.n)}</b>${N(p.v)} habitantes${p.nota ? ' · ' + p.nota : ''}`);
        txt(c, i === 0 ? xx(ac) : w - 2, yB + altoB + 15, `${p.n} ${N(p.v)}`, 't-sec', i === 0 ? 'start' : 'end').style('fill', COLOR.tinta);
        ac += p.v;
      });
    };
    const d81 = D.f81D[2];
    barra(1, 2, `Censo de 1981: ${D.t.d81} habitantes`, [{ n: 'Dalías', v: d81, fill: COLOR.tomado }], d81);
    const d91 = D.de(D.dal, 1991).v, e91 = D.de(D.eji, 1991).v;
    barra(3, 3, 'Censo de 1991, ya por separado', [{ n: 'Dalías', v: d91, fill: COLOR.tomado }, { n: 'El Ejido', v: e91, fill: '#7fa7cc' }], d91 + e91);
    const d81d = D.de(D.dal, 1981).v, d81e = D.de(D.eji, 1981).v;
    barra(4, 4, `1981 en los límites de hoy: ${D.t.pd} y ${D.t.pe}`, [
      { n: 'Dalías', v: d81d, fill: 'url(#ch-trama-est)', st: COLOR.estimado, nota: 'estimado' },
      { n: 'El Ejido', v: d81e, fill: 'url(#ch-trama-est)', st: COLOR.estimado, nota: 'estimado' },
    ], d81);

    // las áreas apiladas
    const graf = vis(g.append('g'), 5, 5);
    const P = D.pila;
    const x = d3.scaleLinear([1842, 2021], [4, w - 4]);
    const yMax = Math.ceil(d3.max(P, p => p.total) / 10000) * 10000;
    const y = d3.scaleLinear([0, yMax], [h - 26, 18]);
    ejeY(graf, y, 0, w, d3.range(20000, yMax + 1, 20000));
    const hasta = P.filter(p => p.y <= 1981), desde = P.filter(p => p.y >= 1991);
    const areaD = d3.area().x(p => x(p.y)).y0(y(0)).y1(p => y(p.d));
    const areaE = d3.area().x(p => x(p.y)).y0(p => y(p.d)).y1(p => y(p.total));
    graf.append('path').attr('d', areaD(hasta)).attr('fill', 'url(#ch-trama-est)').attr('opacity', .9);
    graf.append('path').attr('d', areaE(hasta)).attr('fill', '#fbf1e4');
    graf.append('path').attr('d', areaD(desde)).attr('fill', COLOR.tomado);
    graf.append('path').attr('d', areaE(desde)).attr('fill', '#7fa7cc');
    graf.append('path').attr('class', 'l-est').attr('d', d3.line().x(p => x(p.y)).y(p => y(p.d))(hasta));
    graf.append('path').attr('class', 'l-obs').attr('stroke-width', 2).attr('d', d3.line().x(p => x(p.y)).y(p => y(p.total))(hasta));
    graf.append('path').attr('class', 'l-obs').attr('d', d3.line().x(p => x(p.y)).y(p => y(p.total))(desde));
    const x82 = x(1982);
    graf.append('line').attr('x1', x82).attr('x2', x82).attr('y1', 18).attr('y2', h - 26).attr('stroke', COLOR.mal).attr('stroke-dasharray', '4 3');
    txt(graf, x82 - 6, 32, '1982: se divide', 't-sec', 'end').style('fill', COLOR.mal);
    ajusta(txt(graf, x(1850), y(d3.max(hasta, p => (p.y <= 1940 ? p.total : 0))) - 12, 'Hasta 1981: total del censo y división estimada', 't-sec t-halo'), x82 - x(1850) - 8);
    txt(graf, w - 6, y(D.de(D.eji, 2021).v * .55), 'El Ejido', 't-rot t-halo', 'end');
    txt(graf, w - 6, y(D.de(D.dal, 2021).v / 2) + 4, 'Dalías', 't-rot t-halo', 'end').style('fill', '#fff').style('stroke', COLOR.tomado);
    ejeX(graf, x, h - 26, [1850, 1900, 1950, 2000]);
    cruz(graf, x, y, P.map(p => ({ y: p.y, v: p.total, ...p })), 18, h - 26, p => `<b>${p.y}: ${N(p.total)} en total</b>Dalías ${N(p.d)} · El Ejido ${N(p.e)}${p.est ? '<br>división estimada' : '<br>observado'}`, 5, 5);
  },
};

// ---------- Paso 5: rellenar huecos -------------------------------------------------------------------------------------
export const huecos = {
  id: 'huecos', titulo: 'Rellenar huecos',
  fuente: s => (s < 5
    ? 'Marchena, habitantes. Censos y padrón continuo del INE; los años entre censos, estimados en la base de datos.'
    : s < 7
      ? 'Olivar de Marchena, en hectáreas. Catastro de Ensenada; Reseña de 1888 y Junta Consultiva (hacia 1880); MUCVA (1956-2007) y SIPNA (2020), Junta de Andalucía.'
      : 'Marchena, habitantes. Censo de 1591 y Catastro de Ensenada (estimados a partir de los vecinos), Floridablanca, censos y padrón del INE.'),
  alt: (s, D) => ['', `Puntos de los ${D.t.nC} censos de Marchena entre 1842 y 2021.`,
    `Detalle de 1900 a 1930 con el hueco entre 1910 y 1920.`,
    `Interpolación entre 1910 y 1920: en 1915, ${D.t.y1915}.`,
    `La serie anual completa, con ${D.t.nE} años estimados.`,
    `Olivar de Marchena de 1752 a 2020: una línea seguida que empalma cuatro fuentes.`,
    `La misma línea con una marca en 2020, cuando la clase pasa a incluir el olivar regado; el tramo 2007-2020 no se interpola.`,
    `Población de Marchena con un hueco sin interpolar entre 1591 (${D.t.m91h}) y 1752 (${D.t.m52h}).`][s],
  dibuja({ g, w, h, D, compacto }) {
    const M = D.mar, C = D.marCensos;
    const lab = 'habitantes';
    const yMax = 24000;

    // serie completa
    const todo = vis(g.append('g'), 1, 1);
    const todoB = vis(g.append('g'), 4, 4);
    const x = d3.scaleLinear([1842, 2025], [6, w - 8]);
    const y = d3.scaleLinear([0, yMax], [h - 26, 24]);
    [todo, todoB].forEach(c => {
      ejeY(c, y, 0, w, d3.range(5000, yMax + 1, 5000));
      txt(c, 0, 13, lab, 't-sec');
      ejeX(c, x, h - 26, [1850, 1900, 1950, 2000]);
    });
    const linea = d3.line().x(p => x(p.y)).y(p => y(p.v));
    todoB.append('path').attr('class', 'l-est').attr('d', linea(M));
    const est = M.filter(p => p.e === 1);
    todoB.append('g').selectAll('circle').data(est).join('circle').attr('cx', p => x(p.y)).attr('cy', p => y(p.v))
      .attr('r', compacto ? 1.4 : 2).attr('fill', '#fff').attr('stroke', COLOR.estimado).attr('stroke-width', 1);
    [todo, todoB].forEach(c => c.append('g').selectAll('circle').data(C).join('circle').attr('cx', p => x(p.y)).attr('cy', p => y(p.v))
      .attr('r', compacto ? 3.4 : 4.5).attr('fill', COLOR.tomado).attr('stroke', '#fff').attr('stroke-width', 1.5));
    const eti = (c, p) => txt(c, x(p.y), y(p.v) - 10, N(p.v), 't-rot t-halo', p.y < 1860 ? 'start' : p.y > 2000 ? 'end' : 'middle');
    [todo, todoB].forEach(c => [1842, 1970, 2021].forEach(a => eti(c, D.de(M, a))));
    const leyB = vis(g.append('g').attr('transform', `translate(${compacto ? 70 : 92},9)`), 4, 4);
    leyB.append('circle').attr('r', 4).attr('fill', COLOR.tomado);
    txt(leyB, 8, 4, 'censo', 't-sec');
    leyB.append('circle').attr('cx', 58).attr('r', 3).attr('fill', '#fff').attr('stroke', COLOR.estimado).attr('stroke-width', 1.5);
    txt(leyB, 66, 4, 'año estimado', 't-sec');
    cruz(todo, x, y, C, 24, h - 26, p => `<b>${p.y}: ${N(p.v)}</b>cifra de censo`, 1, 1);
    const met = { o: 'cifra de censo', l: 'interpolación entre dos censos', g: 'crecimiento del padrón, ajustado a los censos' };
    cruz(todoB, x, y, M, 24, h - 26, p => `<b>${p.y}: ${N(p.v)}</b>${met[p.m] || ''}`, 4, 4);

    // detalle 1900-1930
    const zoom = vis(g.append('g'), 2, 3);
    const zx = d3.scaleLinear([1895, 1933], [6, w - 8]);
    const trozo = M.filter(p => p.y >= 1900 && p.y <= 1930);
    const zy = d3.scaleLinear([10000, 20000], [h - 26, 24]);
    ejeY(zoom, zy, 0, w, d3.range(10000, 20001, 2500));
    ejeX(zoom, zx, h - 26, [1900, 1910, 1920, 1930]);
    zoom.append('rect').attr('x', zx(1910)).attr('width', zx(1920) - zx(1910)).attr('y', 24).attr('height', h - 50).attr('fill', '#fbf1e4');
    const q = vis(zoom.append('g'), 2, 2);
    txt(q, zx(1915), zy(11700), 'sin cifra', 't-rot', 'middle').style('fill', COLOR.estimado);
    txt(q, zx(1915), zy(11100), 'nueve años', 't-sec', 'middle');
    const inter = vis(zoom.append('g'), 3, 3);
    const a = D.de(M, 1910), b = D.de(M, 1920), m15 = D.de(M, 1915);
    inter.append('line').attr('class', 'l-est').attr('x1', zx(a.y)).attr('y1', zy(a.v)).attr('x2', zx(b.y)).attr('y2', zy(b.v));
    inter.append('g').selectAll('circle').data(trozo.filter(p => p.y > 1910 && p.y < 1920)).join('circle')
      .attr('cx', p => zx(p.y)).attr('cy', p => zy(p.v)).attr('r', p => (p.y === 1915 ? 7 : 4))
      .attr('fill', '#fff').attr('stroke', COLOR.estimado).attr('stroke-width', 2)
      .call(tip, p => `<b>${p.y}: ${N(p.v)}</b>interpolado (estimado)`);
    txt(inter, zx(1915) + 11, zy(m15.v) + 22, `1915: ${N(m15.v)}`, 't-num t-halo').style('fill', COLOR.estimado);
    txt(inter, zx(1915) + 11, zy(m15.v) + 39, 'estimado', 't-sec t-halo');
    const cen = trozo.filter(p => p.m === 'o');
    zoom.append('g').selectAll('circle').data(cen).join('circle').attr('cx', p => zx(p.y)).attr('cy', p => zy(p.v))
      .attr('r', 7).attr('fill', COLOR.tomado).attr('stroke', '#fff').attr('stroke-width', 2)
      .call(tip, p => `<b>${p.y}: ${N(p.v)}</b>cifra de censo`);
    cen.forEach(p => (p.y === 1900
      ? txt(zoom, zx(p.y) + 12, zy(p.v) + 5, N(p.v), 't-num t-halo')
      : txt(zoom, zx(p.y), zy(p.v) - 14, N(p.v), 't-num t-halo', p.y === 1930 ? 'end' : 'middle')));

    // olivar: fuentes empalmadas. La línea sigue; 2020 lleva marca porque cambia lo que cuenta la clase, y ese tramo no se interpola
    const oli = vis(g.append('g'), 5, 6);
    const O = D.olivar, oMax = 14000;
    const ox = d3.scaleLinear([1745, 2030], [6, w - 8]);
    const oy = d3.scaleLinear([0, oMax], [h - 26, 24]);
    ejeY(oli, oy, 0, w, [4000, 8000, 12000]);
    txt(oli, 0, 13, 'hectáreas de olivar', 't-sec');
    ejeX(oli, ox, h - 26, [1800, 1850, 1900, 1950, 2000]);
    const o07 = O.find(p => p.y === 2007), o20 = O.find(p => p.y === 2020), o52 = O.find(p => p.y === 1752);
    const tramos = [[1752, 1752, 'Ensenada', 'start'], [1880, 1880, 'Reseña y Junta', 'middle'], [1956, 2007, 'MUCVA', 'middle'], [2020, 2020, 'SIPNA', 'end']];
    const tira = vis(oli.append('g'), 5, 5);
    tramos.forEach(([d, h2, n, an]) => {
      tira.append('path').attr('fill', 'none').attr('stroke', COLOR.gris).attr('d', `M${ox(d)},52V47H${ox(h2)}V52`);
      txt(tira, an === 'end' ? ox(h2) + 4 : an === 'start' ? ox(d) - 2 : (compacto && d === 1956 ? ox(1974) : (ox(d) + ox(h2)) / 2), 42, n, 't-sec', an);
    });
    vis(oli.append('rect').attr('x', ox(2007)).attr('width', ox(2020) - ox(2007)).attr('y', 24).attr('height', h - 50).attr('fill', '#fbf1e4'), 6, 6);
    oli.append('path').attr('fill', 'none').attr('stroke', '#5f5f5f').attr('stroke-width', 2).attr('d', d3.line().x(p => ox(p.y)).y(p => oy(p.v))(O));
    const fuenteO = p => (p.y === 1752 ? 'Catastro de Ensenada' : p.y === 1880 ? 'Reseña de 1888 y Junta Consultiva' : p.y === 2020 ? 'SIPNA, Junta de Andalucía' : 'MUCVA, Junta de Andalucía');
    oli.append('g').selectAll('circle').data(O).join('circle').attr('cx', p => ox(p.y)).attr('cy', p => oy(p.v)).attr('r', compacto ? 4.5 : 6)
      .attr('fill', p => (p.y < 1956 ? COLOR.fuente : COLOR.tomado)).attr('stroke', '#fff').attr('stroke-width', 1.5)
      .call(tip, p => `<b>${p.y === 1880 ? 'hacia 1880' : p.y}: ${N(p.v, 1)} ha</b>${fuenteO(p)}`);
    txt(oli, ox(1752) + 2, oy(o52.v) - 12, `1752: ${N(o52.v, 1)}`, 't-rot t-halo');
    txt(oli, ox(2020) + 6, oy(o20.v) - 30, `2020: ${N(o20.v, 1)}`, 't-rot t-halo', 'end');
    const marca = vis(oli.append('g'), 6, 6);
    marca.append('line').attr('x1', ox(2020)).attr('x2', ox(2020)).attr('y1', 24).attr('y2', h - 26).attr('stroke', COLOR.mal).attr('stroke-dasharray', '4 3');
    marca.append('path').attr('d', d3.symbol(d3.symbolDiamond, compacto ? 120 : 190)()).attr('transform', `translate(${ox(2020)},${oy(o20.v)})`)
      .attr('fill', '#fff').attr('stroke', COLOR.mal).attr('stroke-width', 2.5);
    if (!compacto) txt(marca, ox(2007) - 8, oy(o07.v) - 12, `2007: ${N(o07.v, 1)}`, 't-rot t-halo', 'end');   // en el móvil taparía el punto de 1956; la cifra está en el texto
    ajusta(txt(marca, ox(2007) - 8, oy(3400), 'En 2020 la clase incluye', 't-rot t-halo', 'end'), ox(2007) - 14).style('fill', COLOR.mal);
    ajusta(txt(marca, ox(2007) - 8, oy(3400) + 16, 'el olivar regado: sin interpolar', 't-sec t-halo', 'end'), ox(2007) - 14).style('fill', COLOR.tinta);

    // población: entre 1591 y 1752 no hay ninguna cifra y se deja el hueco
    const pob = vis(g.append('g'), 7, 7);
    const px = d3.scaleLinear([1535, 2030], [6, w - 8]);
    const py = d3.scaleLinear([0, yMax], [h - 26, 24]);
    ejeY(pob, py, 0, w, d3.range(5000, yMax + 1, 5000));
    txt(pob, 0, 13, 'habitantes de Marchena', 't-sec');
    ejeX(pob, px, h - 26, [1600, 1700, 1800, 1900, 2000]);
    pob.append('rect').attr('x', px(1591)).attr('width', px(1752) - px(1591)).attr('y', 24).attr('height', h - 50).attr('fill', 'url(#ch-trama)');
    const pA = { y: 1591, v: D.m91.hab, k: 'estimado a partir de los vecinos' }, pB = { y: 1752, v: D.u52.hab, k: 'estimado a partir de los vecinos' };
    const pC = { y: 1787, v: D.m87.tot, k: 'Censo de Floridablanca' };
    const resto = [pB, pC, ...M.map(q => ({ y: q.y, v: q.v, k: met[q.m] || '' }))];
    pob.append('path').attr('fill', 'none').attr('stroke', '#5f5f5f').attr('stroke-width', 1.5).attr('d', d3.line().x(q => px(q.y)).y(q => py(q.v))(resto));
    [pA, pB].forEach(q => pob.append('circle').attr('cx', px(q.y)).attr('cy', py(q.v)).attr('r', compacto ? 5 : 6.5)
      .attr('fill', '#fff').attr('stroke', COLOR.estimado).attr('stroke-width', 2.5));
    pob.append('circle').attr('cx', px(pC.y)).attr('cy', py(pC.v)).attr('r', compacto ? 3.6 : 4.5).attr('fill', COLOR.fuente).attr('stroke', '#fff');
    pob.append('g').selectAll('circle').data(C).join('circle').attr('cx', q => px(q.y)).attr('cy', q => py(q.v))
      .attr('r', compacto ? 2.4 : 3).attr('fill', COLOR.tomado);
    txt(pob, px(pA.y) + 2, py(pA.v) - 13, `1591: ${N(pA.v)}`, 't-rot t-halo');
    txt(pob, px(pB.y) + 4, py(pB.v) + 24, `1752: ${N(pB.v)}`, 't-rot t-halo');
    const cB = (px(1591) + px(1752)) / 2;
    ajusta(txt(pob, cB, py(3600), `${D.t.gap91} años sin cifra`, 't-rot t-halo', 'middle'), px(1752) - px(1591) - 4).style('fill', COLOR.mal);
    ajusta(txt(pob, cB, py(3600) + 16, 'no se interpola', 't-sec t-halo', 'middle'), px(1752) - px(1591) - 4).style('fill', COLOR.tinta);
    cruz(pob, px, py, [pA, ...resto], 24, h - 26, q => `<b>${q.y}: ${N(q.v)}</b>${q.k}`, 7, 7);
  },
};

// ---------- Paso 6: leer cada cifra -------------------------------------------------------------------------------------
export const leer = {
  id: 'leer', titulo: 'Leer cada cifra',
  fuente: s => (s < 2
    ? 'Censos y padrón del INE; Censo de 1591, edición del INE. Colores: los de la página Cobertura para la población.'
    : 'Vecinos de 1591 por municipio de hoy (edición del INE del Censo de 1591). Recintos municipales del IECA (2026).'),
  alt: (s, D) => ['', 'Cuatro fichas: cifra observada, estimada, suma parcial y sin dato, cada una con su ejemplo real.',
    `Mapa de Andalucía en 1591: ${D.t.nCon} municipios con cifra y ${D.t.nSin} sin dato.`,
    `El mismo mapa con la suma parcial de ${D.t.and91} habitantes estimados.`][s],
  dibuja({ g, html, w, h, D, compacto }) {
    // las cuatro fichas
    const f = vis(html.append('div').attr('class', 'ch-fichas'), 1, 1);
    const pct = (D.par91[2] / D.par91[3]) * 100;
    [
      ['ch-m-obs', 'Observada', N(D.de(D.mar, 1991).v), 'Marchena, 1991. La cifra del censo, tal cual.'],
      ['ch-m-est', 'Estimada', N(D.de(D.mar, 1915).v), 'Marchena, 1915. Año sin censo: sale de interpolar.'],
      ['ch-m-par', 'Suma parcial', N(D.and91), `Andalucía, 1591. Suma de ${N(D.par91[2])} de los ${N(D.par91[3])} municipios (${N(pct, 0)} %): no es el total.`],
      ['ch-m-sin', 'Sin dato', '—', 'Dalías, 1591. La fuente no cubre el reino de Granada. No es un cero.'],
    ].forEach(([m, tit, v, p]) => {
      const c = f.append('article').attr('class', 'ch-ficha');
      const mu = c.append('div').attr('class', `ch-ficha__m ${m}`);
      if (m === 'ch-m-par') mu.style('background', `linear-gradient(90deg, #f4aeb1 0 ${pct}%, #fff ${pct}% 100%)`);
      c.append('h3').text(tit);
      c.append('div').attr('class', 'ch-ficha__v').text(v);
      c.append('p').text(p);
    });

    // el mapa de 1591
    const mapa = vis(g.append('g'), 2, 3);
    const objs = D.topo.objects;
    const pie = compacto ? 42 : 58;
    const hm = h - pie;
    const and = topojson.feature(D.topo, objs.andalucia);
    const pr = proyeccion().fitExtent([[2, 2], [w - 2, hm - 2]], and);
    const path = d3.geoPath(pr);
    const feats = topojson.feature(D.topo, objs.municipios).features;
    const clase = id => D.clase91[id];
    mapa.append('g').selectAll('path').data(feats).join('path').attr('class', 'p-mun').attr('d', path)
      .attr('fill', d => { const c = clase(d.properties.c); return c === '0' ? COLOR.obs : c === '1' ? COLOR.est : 'url(#ch-trama)'; })
      .call(tip, d => {
        const id = d.properties.c, c = clase(id);
        if (c === '.') return `<b>${esc(d.properties.n)}</b>sin dato en 1591${D.esGranada(id) ? ': la fuente no cubre el reino de Granada' : ''}. No es un cero`;
        return `<b>${esc(d.properties.n)}: ${N(D.valor91[id])} vecinos</b>${c === '0' ? 'cifra de la fuente' : 'parte estimada por reparto'}`;
      });
    mapa.append('path').datum(topojson.mesh(D.topo, objs.provincias, (a, b) => a !== b)).attr('d', path).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.5);
    mapa.append('path').datum(topojson.mesh(D.topo, objs.provincias, (a, b) => a !== b)).attr('d', path).attr('fill', 'none').attr('stroke', '#303030').attr('stroke-width', .6);

    // leyenda
    const n = { o: Object.values(D.clase91).filter(c => c === '0').length, e: Object.values(D.clase91).filter(c => c === '1').length };
    const ley = mapa.append('g').attr('transform', `translate(0,${hm + 8})`);
    const it = [[COLOR.obs, `Cifra de la fuente (${N(n.o)})`], [COLOR.est, `Estimada por reparto (${N(n.e)})`], ['url(#ch-trama)', `Sin dato (${D.t.nSin})`]];
    let xl = 0, yl = 0;
    it.forEach(([c, t]) => {
      const ancho = t.length * (compacto ? 5.9 : 6.8) + 24;
      if (xl + ancho > w) { xl = 0; yl += 17; }
      ley.append('rect').attr('x', xl).attr('y', yl).attr('width', 14).attr('height', 12).attr('fill', c).attr('stroke', '#7a7a7a').attr('stroke-width', .5);
      txt(ley, xl + 19, yl + 10.5, t, 't-sec').style('fill', COLOR.tinta);
      xl += ancho;
    });
    const suma = vis(g.append('g'), 3, 3);
    const yS = compacto ? 16 : 24;
    txt(suma, w - 4, yS, `${D.t.and91} habitantes estimados`, 't-tit t-halo', 'end');
    txt(suma, w - 4, yS + 17, `suma parcial: ${D.t.nCon} de ${D.t.nMun} municipios`, 't-sec t-halo', 'end').style('fill', COLOR.tinta);
  },
};
