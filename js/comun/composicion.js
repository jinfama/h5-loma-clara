// composicion.js — gráfica de composición en % a lo largo del tiempo (usos del suelo, empleo por sectores) para cualquier
// unidad: municipio, provincia, partido o Andalucía. No depende de ninguna página: solo de d3 (window.d3) y de lo que recibe.
//
//   const g = pintarComposicion(el, {
//     anios: [1752, 1880, 1956, ...],     // TODAS las fechas de la serie, en orden; una fecha sin dato corta el área
//     categorias: [{ id, rotulo, color, tinta?, picto?, valores: [n|null...], clases: '0312...' | ['0', ...],
//                    sinInterpolar?: [[2007, 2020]], notasSinInterpolar?: { '2007-2020': 'por qué' } }],
//     columna: (anio, i, partes) => bool, // qué fechas con dato van como columna (por defecto, todas)
//     cierre: { anios: [1752], resto: { rotulo, color }, exceso: suma => 'declara el 188 % del término',
//               rotuloSuma?: 'Suma declarada', repartoTexto?: 'la columna reparte lo declarado sobre 100' },
//     cambiosFuente: [{ desde, hasta, rotulo }],  // opcional: marca general de un tramo; no corta nada
//     huecos: [{ desde, hasta, rotulo, corto }], // años en que la unidad no existía; `corto`, si el rótulo no cabe
//     dominio: [a0, a1], rotuloAnio: a => String(a), unidad: '% del término', tabla: true,
//     textos: { dato, interpolado, hueco },
//   });
//   g.actualizar(nuevasOpciones); g.filasDato(); g.destruir();
//
// Reglas: lo interpolado se dibuja difuminado y NUNCA es una cifra: no entra en la tabla ni en filasDato(), y al pasar por
// encima solo dice que no es dato y entre qué dos fechas está. Solo se interpola entre dos fechas contiguas con dato: una
// fecha sin dato corta el área, y una categoría no se interpola en sus tramos `sinInterpolar`. El eje no pasa de 100. El primer y el último año van siempre rotulados.

const CSS = `
.cz { position: relative; width: 100%; min-width: 0; }
.cz-g { width: 100%; min-width: 0; }
.cz-g svg { display: block; max-width: 100%; }
.cz-g text { font-family: inherit; font-size: 11.5px; font-weight: 500; fill: #444; }
.cz-g text.cz-aviso { font-size: 11.5px; font-weight: 700; fill: #101010; paint-order: stroke; stroke: #fff; stroke-width: 3px; }
.cz-g text.cz-hueco { font-size: 11px; font-weight: 700; paint-order: stroke; stroke: #fff; stroke-width: 3px; }
.cz-ley { display: flex; flex-wrap: wrap; gap: 5px 14px; margin: 8px 0 0; padding: 0; list-style: none; font-size: 12.5px; color: #333; }
.cz-ley li { display: inline-flex; align-items: center; gap: 5px; }
.cz-ley i { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 15px; height: 15px; }
.cz-ley i.cz-tile { width: 28px; height: 28px; }
.cz-ley i svg { display: block; max-width: none; }
.cz-ley--clave { padding-top: 6px; border-top: 1px solid #e3e3e3; font-size: 12px; }
.cz-ley i.cz-k-dato { width: 7px; height: 16px; background: #3c4a42; }
.cz-ley i.cz-k-int { width: 22px; height: 12px; background: #3c4a42; opacity: .3; }
.cz-ley i.cz-k-est { width: 7px; height: 16px; background-color: #3c4a42; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.72) 0 1.5px, transparent 1.5px 4px); }
.cz-ley i.cz-k-fuente { width: 16px; height: 14px; border-left: 1.5px dashed #101010; border-right: 1.5px dashed #101010; }
.cz-det { margin-top: 8px; font-size: 12.5px; color: #444; }
.cz-det summary { cursor: pointer; font-weight: 600; color: #101010; }
.cz-det ul { margin: 5px 0 0; padding-left: 16px; }
.cz-tw { overflow-x: auto; margin-top: 6px; }
.cz-tabla { width: 100%; border-collapse: collapse; font-size: 12px; }
.cz-tabla th, .cz-tabla td { padding: 3px 5px; border-bottom: 1px solid #e3e3e3; text-align: right; white-space: nowrap; font-weight: 500; }
.cz-tabla tbody th { min-width: 92px; text-align: left; font-weight: 600; white-space: normal; }
.cz-tabla thead th { font-weight: 700; color: #444; }
.cz-tabla small { color: #6b6b6b; font-size: 10px; }
.cz-tip { position: fixed; z-index: 90; max-width: min(320px, calc(100vw - 16px)); padding: 7px 10px; background: #101010; color: #fff; font: 500 12.5px/1.4 system-ui, sans-serif; pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,.28); }
.cz-tip[hidden] { display: none; }
.cz-tip i { display: inline-block; width: 9px; height: 9px; margin-right: 5px; }
`;
function ponerEstilo() {
  if (document.getElementById('cz-css')) return;
  const s = document.createElement('style');
  s.id = 'cz-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

const NOMBRE_CLASE = { 0: 'observado', 3: 'calculado de originales', 1: 'estimado', 4: 'parcialmente estimado', 5: 'suma parcial', 2: 'en revisión' };
const firme = f => f === '0' || f === '3';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const uno = v => nf.format(v);
let nPat = 0;

// ---------------------------------------------------------------- eje de años: primero y último, siempre
// Con `fechas`, rotula esas fechas (las que se pisan bajan a una segunda fila); sin ellas, años redondos entre los extremos.
export function marcasAnio(a0, a1, x, { minPx = 36, fechas = null } = {}) {
  if (fechas && fechas.length) {
    const xs = [...new Set(fechas.map(Number))].filter(a => a >= a0 && a <= a1).sort((p, q) => p - q);
    const out = [], fin = [-Infinity, -Infinity];
    xs.forEach((a, k) => {
      const X = x(a), ext = k === 0 || k === xs.length - 1;
      if (X - fin[0] >= minPx) { out.push({ a, baja: false }); fin[0] = X; } else if (X - fin[1] >= minPx) { out.push({ a, baja: true }); fin[1] = X; } else if (ext) {
        for (let i = out.length - 1; i > 0; i--) if (!out[i].baja) { out.splice(i, 1); break; }
        out.push({ a, baja: false }); fin[0] = X;
      }
    });
    return out;
  }
  const paso = [1, 2, 5, 10, 20, 25, 50, 100].find(p => Math.abs(x(a0 + p) - x(a0)) >= minPx + 8) || 100;
  const out = [{ a: a0, baja: false }];
  for (let a = Math.ceil(a0 / paso) * paso; a < a1; a += paso) if (a > a0 && Math.abs(x(a) - x(a0)) >= minPx && Math.abs(x(a1) - x(a)) >= minPx) out.push({ a, baja: false });
  if (a1 !== a0) out.push({ a: a1, baja: false });
  return out;
}

// una categoría no se interpola en un tramo marcado; sin marca, se interpola
export const seInterpola = (c, a0, a1) => !(c.sinInterpolar || []).some(([p, q]) => a0 < +q && a1 > +p);

// ---------------------------------------------------------------- el modelo: qué es dato y qué es interpolado
export function modeloComposicion(o) {
  const anios = o.anios.map(Number);
  const cats = o.categorias.map(c => ({ ...c, valores: c.valores.map(v => (v == null || !Number.isFinite(+v) ? null : +v)), clases: typeof c.clases === 'string' ? [...c.clases] : (c.clases || []) }));
  const cierre = o.cierre || null;
  const fechas = anios.map((a, i) => {
    const partes = cats.map((c, k) => (c.valores[i] == null ? null : { k, c, v: c.valores[i], f: c.clases[i] == null ? '0' : String(c.clases[i]) })).filter(Boolean);
    const hay = partes.length > 0, suma = partes.reduce((s, p) => s + p.v, 0);
    const abierta = !!(cierre && cierre.anios.includes(a));
    const excede = abierta && suma > 100.05;
    const factor = suma > 100 ? 100 / suma : 1;     // el eje nunca pasa de 100
    const resto = abierta && hay && suma < 99.95 ? 100 - suma : 0;
    const pila = new Array(cats.length).fill(null);
    let ac = 0;
    for (const p of partes) { const h = p.v * factor; pila[p.k] = [ac, ac + h]; ac += h; }
    const col = hay && (o.columna ? !!o.columna(a, i, partes) : true);
    return { a, i, hay, partes, suma, abierta, excede, resto, tope: ac, pila, columna: col };
  });
  // solo entre dos fechas contiguas de la serie, las dos con dato
  const tramos = [];
  for (let i = 0; i < fechas.length - 1; i++) if (fechas[i].hay && fechas[i + 1].hay) tramos.push({ de: fechas[i], a: fechas[i + 1] });
  // parejas de fechas en que alguna categoría con dato en las dos no se interpola
  const marcas = tramos.map(t => {
    const conDato = cats.filter((c, k) => t.de.pila[k] && t.a.pila[k]);
    const cortadas = conDato.filter(c => !seInterpola(c, t.de.a, t.a.a));
    return cortadas.length ? { de: t.de.a, a: t.a.a, cortadas, todas: cortadas.length === conDato.length } : null;
  }).filter(Boolean);
  return { o, anios, cats, fechas, tramos, marcas, columnas: fechas.filter(f => f.columna) };
}

// lo que se puede leer o exportar: solo cifras de fechas con dato, tal cual vienen
export function filasDato(M) {
  return M.columnas.flatMap(f => f.partes.map(p => ({ anio: f.a, categoria: p.c.id, rotulo: p.c.rotulo, valor: p.v, clase: p.f })));
}

// ---------------------------------------------------------------- partes HTML
function leyendaHTML(M) {
  const o = M.o, tx = o.textos || {};
  const usadas = M.cats.filter(c => c.valores.some(v => v != null && v > 0));
  const hayResto = M.fechas.some(f => f.resto > 0);
  const hayEst = M.columnas.some(f => f.partes.some(p => !firme(p.f)));
  const cat = usadas.map(c => (c.picto
    ? `<li><i class="cz-tile" style="background:${esc(c.color)};color:${esc(c.tinta || '#101010')}">${c.picto}</i><span>${esc(c.rotulo)}</span></li>`
    : `<li><i style="background:${esc(c.color)}"></i><span>${esc(c.rotulo)}</span></li>`)).join('');
  const resto = hayResto ? `<li><i style="background:${esc(o.cierre.resto.color)}"></i><span>${esc(o.cierre.resto.rotulo)}</span></li>` : '';
  const fuente = (o.cambiosFuente || []).length ? `<li><i class="cz-k-fuente"></i><span>${esc(o.cambiosFuente[0].rotulo || 'cambia la fuente')}</span></li>` : '';
  const marca = M.marcas.length ? '<li><i class="cz-k-fuente"></i><span>raya discontinua: tramo que esa categoría no interpola</span></li>' : '';
  const notas = M.marcas.flatMap(t => t.cortadas.map(c => { const n = (c.notasSinInterpolar || {})[`${t.de}-${t.a}`]; return n ? `<li><b>${esc(c.rotulo)}</b>, ${t.de}-${t.a}: ${esc(n)}</li>` : ''; })).filter(Boolean);
  const porque = notas.length ? `<details class="cz-det"><summary>Por qué no se interpola ese tramo</summary><ul>${notas.join('')}</ul></details>` : '';
  return `<ul class="cz-ley">${cat}${resto}</ul><ul class="cz-ley cz-ley--clave">
    <li><i class="cz-k-dato"></i><span>${esc(tx.dato || 'columna en color pleno: fecha con dato')}</span></li>
    ${hayEst ? '<li><i class="cz-k-est"></i><span>columna con trama: dato estimado o en revisión</span></li>' : ''}
    <li><i class="cz-k-int"></i><span>${esc(tx.interpolado || 'color difuminado: interpolado, no es dato')}</span></li>${fuente}${marca}</ul>${porque}`;
}

function tablaHTML(M) {
  const o = M.o;
  if (!o.tabla || !M.columnas.length) return '';
  const rot = o.rotuloAnio || (a => String(a));
  const cels = c => M.columnas.map(f => { const p = f.partes.find(q => q.c.id === c.id); return `<td>${p ? `${uno(p.v)}${firme(p.f) ? '' : ` <small>${esc(NOMBRE_CLASE[p.f] || '')}</small>`}` : '—'}</td>`; }).join('');
  const conSuma = M.columnas.some(f => f.abierta);
  const suma = conSuma ? `<tr><th scope="row">${esc((o.cierre && o.cierre.rotuloSuma) || 'Suma declarada')}</th>${M.columnas.map(f => `<td>${f.abierta ? uno(f.suma) : ''}</td>`).join('')}</tr>` : '';
  return `<details class="cz-det"><summary>Ver las cifras de cada fecha con dato (${esc(o.unidad || '%')})</summary><div class="cz-tw"><table class="cz-tabla"><thead><tr><th></th>${M.columnas.map(f => `<th scope="col">${esc(rot(f.a))}</th>`).join('')}</tr></thead><tbody>${M.cats.filter(c => M.columnas.some(f => f.partes.some(p => p.c.id === c.id && p.v > 0))).map(c => `<tr><th scope="row">${esc(c.rotulo)}</th>${cels(c)}</tr>`).join('')}${suma}</tbody></table></div></details>`;
}

// ---------------------------------------------------------------- dibujo
function dibuja(g, M, W, tip) {
  const d3 = window.d3, o = M.o, rot = o.rotuloAnio || (a => String(a));
  const con = M.fechas.filter(f => f.hay);
  g.innerHTML = '';
  if (!con.length) { g.innerHTML = '<p style="margin:0;font-size:12.5px;color:#6b6b6b">Sin cifras.</p>'; return; }
  const dom = o.dominio || [con[0].a, con[con.length - 1].a];
  const H = o.alto || Math.max(270, Math.min(390, W * .42)), m = { t: 24, r: 14, b: 40, l: 40 };
  const x = d3.scaleLinear().domain(dom).range([m.l + 6, W - m.r - 4]);
  const ancho = () => { const xs = M.columnas.map(f => x(f.a)); const gap = xs.length > 1 ? d3.min(xs.slice(1).map((v, k) => v - xs[k])) : 30; return Math.max(2.5, Math.min(o.anchoMax || 22, gap * .84)); };
  let bw = ancho();
  x.range([m.l + bw / 2 + 2, W - m.r - bw / 2 - 1]);
  bw = ancho();
  const y = d3.scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
  const svg = d3.select(g).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', o.aria || 'Composición en porcentaje a lo largo del tiempo');
  const id = ++nPat, defs = svg.append('defs');
  const trama = (n, op, ang) => { const p = defs.append('pattern').attr('id', `cz-${n}${id}`).attr('width', 5).attr('height', 5).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', `rotate(${ang})`); p.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5).attr('stroke', n === 'h' ? '#6b6b6b' : '#fff').attr('stroke-width', 1.5).attr('stroke-opacity', op); };
  trama('e', .62, 45); trama('r', .85, -45); trama('h', .28, 45);

  [0, 25, 50, 75, 100].forEach(v => {
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', v === 0 || v === 100 ? '#101010' : '#e3e3e3').attr('stroke-width', v === 0 || v === 100 ? 1.1 : 1);
    svg.append('text').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(`${v}${v === 100 ? ' %' : ''}`);
  });
  for (const h of o.huecos || []) {
    const a = x(Math.max(dom[0], h.desde)), b = x(Math.min(dom[1], h.hasta + 1));
    if (b <= a) continue;
    svg.append('rect').attr('x', a).attr('y', m.t).attr('width', b - a).attr('height', H - m.t - m.b).attr('fill', `url(#cz-h${id})`);
  }
  // lo interpolado, difuminado: un polígono por categoría y pareja de fechas contiguas con dato
  M.cats.forEach((c, k) => {
    let d = '';
    for (const t of M.tramos) {
      const p = t.de.pila[k], q = t.a.pila[k];
      if (!p || !q || !seInterpola(c, t.de.a, t.a.a)) continue;     // sin dato en un extremo o tramo marcado: no se une
      d += `M${x(t.de.a).toFixed(1)},${y(p[1]).toFixed(1)}L${x(t.a.a).toFixed(1)},${y(q[1]).toFixed(1)}L${x(t.a.a).toFixed(1)},${y(q[0]).toFixed(1)}L${x(t.de.a).toFixed(1)},${y(p[0]).toFixed(1)}Z`;
    }
    if (d) svg.append('path').attr('d', d).attr('fill', c.color).attr('fill-opacity', o.opacidad || .3);
  });
  // cambio de fuente: siempre visible
  for (const cf of o.cambiosFuente || []) {
    if (cf.hasta < dom[0] || cf.desde > dom[1]) continue;
    const a = x(cf.desde), b = x(cf.hasta);
    svg.append('rect').attr('x', a).attr('y', m.t).attr('width', b - a).attr('height', H - m.t - m.b).attr('fill', '#101010').attr('fill-opacity', .06);
    [a, b].forEach(X => svg.append('line').attr('x1', X).attr('x2', X).attr('y1', m.t - 6).attr('y2', H - m.b).attr('stroke', '#101010').attr('stroke-width', 1.2).attr('stroke-dasharray', '4 3'));
    svg.append('text').attr('x', Math.min(b + bw / 2, W - m.r)).attr('y', m.t - 9).attr('text-anchor', 'end').attr('class', 'cz-aviso').text(cf.rotulo || 'cambia la fuente');
  }
  // tramos que alguna categoría no interpola: marca visible, con sus nombres si caben
  for (const t of M.marcas) {
    const a = x(t.de), b = x(t.a);
    [a, b].forEach(X => svg.append('line').attr('x1', X).attr('x2', X).attr('y1', m.t - 6).attr('y2', H - m.b).attr('stroke', '#101010').attr('stroke-width', 1.2).attr('stroke-dasharray', '4 3'));
    const lista = `sin interpolar: ${t.cortadas.map(c => c.rotulo.toLowerCase()).join(', ')}`;
    const txt = t.todas ? 'sin interpolar' : lista.length * 5.8 <= W * .62 ? lista : `sin interpolar: ${t.cortadas.length} ${t.cortadas.length === 1 ? 'clase' : 'clases'}`;
    svg.append('text').attr('x', Math.min(b + bw / 2, W - m.r)).attr('y', m.t - 9).attr('text-anchor', 'end').attr('class', 'cz-aviso').text(txt);
  }
  // las fechas con dato, en color pleno
  for (const f of M.columnas) {
    const X = x(f.a) - bw / 2;
    for (const p of f.partes) {
      const [a, b] = f.pila[p.k], h = y(a) - y(b);
      if (h <= 0) continue;
      svg.append('rect').attr('x', X).attr('y', y(b)).attr('width', bw).attr('height', Math.max(.4, h)).attr('fill', p.c.color);
      if (!firme(p.f) || f.excede) svg.append('rect').attr('x', X).attr('y', y(b)).attr('width', bw).attr('height', Math.max(.4, h)).attr('fill', `url(#cz-${p.f === '2' ? 'r' : 'e'}${id})`);
    }
    if (f.resto > 0) svg.append('rect').attr('x', X).attr('y', y(100)).attr('width', bw).attr('height', y(f.tope) - y(100)).attr('fill', o.cierre.resto.color);
    if (f.excede) {
      const txt = o.cierre.exceso ? o.cierre.exceso(f.suma) : `${uno(f.suma)} %`, X0 = x(f.a) - bw / 2;
      svg.append('text').attr('x', Math.max(2, X0)).attr('y', m.t - 9).attr('text-anchor', 'start').attr('class', 'cz-aviso').text(txt);
    }
  }
  for (const h of o.huecos || []) {
    const a = x(Math.max(dom[0], h.desde)), b = x(Math.min(dom[1], h.hasta + 1));
    const r = h.rotulo && b - a >= h.rotulo.length * 5.4 ? h.rotulo : h.corto && b - a >= h.corto.length * 5.6 ? h.corto : '';
    if (r) svg.append('text').attr('x', (a + b) / 2).attr('y', m.t + 16).attr('text-anchor', 'middle').attr('class', 'cz-hueco').text(r);
  }
  // eje de años
  const pocas = M.anios.length <= 14;
  marcasAnio(dom[0], dom[1], x, { fechas: pocas ? M.anios.filter(a => a >= dom[0] && a <= dom[1]) : null, minPx: pocas ? 34 : 38 }).forEach(({ a, baja }) => {
    const X = x(a), an = X + 16 > W ? 'end' : X - 16 < 0 ? 'start' : 'middle';
    if (baja) svg.append('line').attr('x1', X).attr('x2', X).attr('y1', H - m.b + 2).attr('y2', H - m.b + 19).attr('stroke', '#bdbdb6');
    svg.append('text').attr('x', X).attr('y', H - m.b + (baja ? 31 : 16)).attr('text-anchor', an).text(rot(a));
  });
  // lectura al pasar: en una columna, sus cifras; en lo difuminado, solo que no es dato
  const tx = o.textos || {};
  const leer = (ev) => {
    const px = d3.pointer(ev)[0], col = M.columnas.find(f => Math.abs(x(f.a) - px) <= bw / 2 + 1.5);
    if (col) {
      const filas = [...col.partes].filter(p => p.v > 0).sort((p, q) => q.v - p.v).map(p => `<i style="background:${esc(p.c.color)}"></i>${esc(p.c.rotulo)}: ${uno(p.v)} % · ${esc(NOMBRE_CLASE[p.f] || '')}`);
      if (col.resto > 0) filas.push(`<i style="background:${esc(o.cierre.resto.color)}"></i>${uno(col.resto)} %: ${esc(o.cierre.resto.rotulo)}`);
      if (col.excede) filas.push(`${esc(o.cierre.exceso ? o.cierre.exceso(col.suma) : '')}: ${esc(o.cierre.repartoTexto || 'la columna reparte lo declarado sobre 100')}`);
      return tip(`<b>${esc(rot(col.a))}</b><br>${filas.join('<br>')}`, ev);
    }
    const a = x.invert(px), t = M.tramos.find(q => a >= q.de.a && a <= q.a.a);
    if (t) {
      const antes = [...M.columnas].reverse().find(f => f.a <= a), luego = M.columnas.find(f => f.a >= a);
      const unidos = antes && luego && M.fechas.slice(antes.i, luego.i + 1).every(f => f.hay);
      const enHueco = (o.huecos || []).find(h => a >= h.desde && a <= h.hasta + 1);
      const mc = M.marcas.find(q => q.de === t.de.a && q.a === t.a.a);
      if (mc) {
        const cl = `${t.de.a}-${t.a.a}`, ls = mc.cortadas.map(c => `${esc(c.rotulo)}${c.notasSinInterpolar && c.notasSinInterpolar[cl] ? `: ${esc(c.notasSinInterpolar[cl])}` : ''}`);
        return tip(`<b>${esc(rot(t.de.a))} a ${esc(rot(t.a.a))}</b><br>Sin interpolar: ${ls.join('<br>')}`, ev);
      }
      return tip(`${esc(tx.tipInterpolado || 'interpolado, no es dato')}${unidos ? ` (entre ${esc(rot(antes.a))} y ${esc(rot(luego.a))})` : ''}${enHueco && enHueco.rotulo ? `<br>${esc(enHueco.rotulo)}` : ''}`, ev);
    }
    const hu = (o.huecos || []).find(h => a >= h.desde && a <= h.hasta + 1);
    return tip(esc(hu && hu.rotulo ? hu.rotulo : (tx.hueco || 'sin dato')), ev);
  };
  svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', Math.max(0, W - m.l - m.r)).attr('height', H - m.t - m.b).attr('fill', 'transparent').on('pointermove', leer).on('pointerleave', () => tip(null));
}

function hazTip() {
  let t = document.getElementById('cz-tip');
  if (!t) { t = document.createElement('div'); t.id = 'cz-tip'; t.className = 'cz-tip'; t.hidden = true; document.body.appendChild(t); }
  return (html, ev) => {
    if (html == null) { t.hidden = true; return; }
    t.innerHTML = html; t.hidden = false;
    const r = t.getBoundingClientRect(), W = document.documentElement.clientWidth, Hv = window.innerHeight;
    let X = ev.clientX + 14, Y = ev.clientY + 14;
    if (X + r.width > W - 8) X = Math.max(8, ev.clientX - r.width - 12);
    if (Y + r.height > Hv - 8) Y = Math.max(8, ev.clientY - r.height - 12);
    t.style.left = `${X}px`; t.style.top = `${Y}px`;
  };
}

// ---------------------------------------------------------------- uso
export function pintarComposicion(el, opciones) {
  ponerEstilo();
  el.classList.add('cz');
  const tip = hazTip();
  let M = null, ancho = 0, tm = null, g = null;
  const monta = o => {
    M = modeloComposicion(o);
    el.innerHTML = `<div class="cz-g"></div>${leyendaHTML(M)}${tablaHTML(M)}`;
    g = el.querySelector('.cz-g');
    ro.disconnect(); ro.observe(g);
    if (ancho) dibuja(g, M, ancho, tip);
  };
  const ro = new ResizeObserver(es => {
    const n = Math.round(es[0].contentRect.width);
    if (!n || n === ancho) return;
    const primera = !ancho; ancho = n;
    clearTimeout(tm);
    if (primera) dibuja(g, M, ancho, tip); else tm = setTimeout(() => dibuja(g, M, ancho, tip), 120);
  });
  monta(opciones);
  return {
    actualizar: o => monta({ ...M.o, ...o }),
    filasDato: () => filasDato(M),
    destruir: () => { ro.disconnect(); clearTimeout(tm); tip(null); el.innerHTML = ''; el.classList.remove('cz'); },
  };
}
