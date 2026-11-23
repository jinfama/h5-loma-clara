// Atlas Histórico de Andalucía · Relatos: utilidades de dibujo comunes a las escenas.
export const d3 = window.d3;
export const topojson = window.topojson;

export const COLOR = {
  verde: '#007a3d', hondo: '#0f3b2c', claro: '#9fd0b3', estimado: '#c46f14', perdida: '#a8321f', azul: '#2f6fa8',
  tinta: '#101010', gris: '#6b6b6b', linea: '#e3e3e3', base: '#ecece8', medio: '#b7bfba',
};

/** Número con punto de millares y coma decimal, también con cuatro cifras (Intl no agrupa 2.170 en español). */
export function N(x, d = 0) {
  const [e, f] = Math.abs(x).toFixed(d).split('.');
  const neg = x < 0 && Number(Math.abs(x).toFixed(d)) !== 0;
  return (neg ? '−' : '') + e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
}
export const pct = (x, d = 1) => `${N(x, d)} %`;
export const mill = (x, d = 1) => `${N(x / 1e6, d)} millones`;
export const signo = (x, d = 1) => (x > 0 ? '+' : '') + N(x, d);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Marca un elemento como visible solo entre los subpasos a y b. */
export const vis = (sel, a, b = 99) => sel.attr('data-a', a).attr('data-b', b);
export function aplicar(root, sub) {
  root.querySelectorAll('[data-a]').forEach(el => {
    el.classList.toggle('on', sub >= +el.dataset.a && sub <= +el.dataset.b);
  });
}

export function txt(g, x, y, s, cls = '', anchor = 'start') {
  return g.append('text').attr('x', x).attr('y', y).attr('class', cls).attr('text-anchor', anchor).text(s);
}

/** Reduce la letra de un texto SVG hasta que quepa en max píxeles. */
export function ajusta(sel, max) {
  const n = sel.node(), L = n.getComputedTextLength();
  if (L > max && max > 0) sel.style('font-size', (parseFloat(getComputedStyle(n).fontSize) * max / L).toFixed(1) + 'px');
  return sel;
}

// ---------- tooltip ---------------------------------------------------------------------------------------------------
const tipEl = () => document.getElementById('rl-tip');
export function tipVer(ev, html) {
  const t = tipEl();
  t.innerHTML = html;
  t.hidden = false;
  const r = t.getBoundingClientRect();
  const x = Math.min(ev.clientX + 14, innerWidth - r.width - 8);
  const y = ev.clientY - r.height - 12 < 8 ? ev.clientY + 16 : ev.clientY - r.height - 12;
  t.style.left = Math.max(8, x) + 'px';
  t.style.top = y + 'px';
}
export function tipOcultar() { const t = tipEl(); if (t) t.hidden = true; }
export function tip(sel, fn) {
  sel.on('pointerenter pointermove', (ev, d) => tipVer(ev, fn(d))).on('pointerleave', tipOcultar);
  return sel;
}

// ---------- ejes -------------------------------------------------------------------------------------------------------
export function ejeX(g, x, y, marcas) {
  g.append('line').attr('class', 'g-base').attr('x1', x.range()[0]).attr('x2', x.range()[1]).attr('y1', y).attr('y2', y);
  marcas.forEach(m => {
    g.append('line').attr('class', 'g-base').attr('x1', x(m)).attr('x2', x(m)).attr('y1', y).attr('y2', y + 4);
    const [r0, r1] = x.range();
    txt(g, x(m), y + 16, String(m), 't-eje', x(m) > r1 - 16 ? 'end' : x(m) < r0 + 16 ? 'start' : 'middle');
  });
}
export function ejeY(g, y, x0, x1, marcas, fmt = v => N(v)) {
  marcas.forEach(m => {
    g.append('line').attr('class', 'g-rej').attr('x1', x0).attr('x2', x1).attr('y1', y(m)).attr('y2', y(m));
    txt(g, x0, y(m) - 4, fmt(m), 't-eje t-halo');
  });
}

// ---------- marcas de clase --------------------------------------------------------------------------------------------
/** Punto según su clase: lleno (observada), claro (en parte estimada) o hueco ámbar (estimada o suma parcial). */
export function punto(g, cx, cy, tipo, r = 4.5) {
  if (tipo === 'decl') {   // declarada en la fuente: cuadrado hueco
    const s = r * 1.75;
    return g.append('rect').attr('x', cx - s / 2).attr('y', cy - s / 2).attr('width', s).attr('height', s)
      .attr('fill', '#fff').attr('stroke', COLOR.estimado).attr('stroke-width', 2);
  }
  const c = g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r).attr('stroke-width', 2);
  if (tipo === 'obs') c.attr('fill', COLOR.verde).attr('stroke', COLOR.verde);
  else if (tipo === 'pest') c.attr('fill', COLOR.claro).attr('stroke', COLOR.verde);
  else c.attr('fill', '#fff').attr('stroke', COLOR.estimado);
  return c;
}
/** Anillo negro: la clase de la cifra cambia de contenido en esa fecha. */
export const anillo = (g, cx, cy, r = 8) => g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)
  .attr('fill', 'none').attr('stroke', COLOR.tinta).attr('stroke-width', 1.6).style('pointer-events', 'none');
export const tipoDeClase = f => (f === '0' || f === '3' ? 'obs' : f === '4' ? 'pest' : 'est');
export const textoClase = f => ({
  0: 'observada', 1: 'estimada', 2: 'con reserva o en revisión', 3: 'calculada de cifras originales',
  4: 'en parte estimada', 5: 'suma parcial', '.': 'sin dato',
}[f] ?? 'sin clasificar');

export function leyenda(html, items, a = 1, b = 99) {
  const d = html.append('div').attr('class', 'rl-ley').attr('data-a', a).attr('data-b', b);
  items.forEach(it => {
    const s = d.append('span');
    if (!it.solo) {
      const i = s.append('i').attr('class', 'rl-m ' + (it.c || ''));
      if (it.bg) i.style('background', it.bg);
    }
    s.append('span').text(it.t);
  });
  return d;
}

// ---------- mapas ------------------------------------------------------------------------------------------------------
const proyeccion = () => d3.geoConicConformal().parallels([36, 38.5]).rotate([4.5, 0]);

export function defs(g) {
  const d = g.append('defs');
  const pat = (id, fondo, raya, paso = 5, ancho = 1.3, giro = 45) => {
    const p = d.append('pattern').attr('id', id).attr('width', paso).attr('height', paso)
      .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', `rotate(${giro})`);
    if (fondo) p.append('rect').attr('width', paso).attr('height', paso).attr('fill', fondo);
    p.append('line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', paso).attr('stroke', raya).attr('stroke-width', ancho);
  };
  pat('rl-sin', '#efefec', '#9a9a9a', 4.5, 1);        // sin dato
  pat('rl-tr-est', null, 'rgba(255,255,255,.8)', 3.6, 1.1); // velo de «estimada» sobre un color
  pat('rl-est', '#f8e6d0', COLOR.estimado, 4, 1.4);   // estimada, en barras y casillas
  pat('rl-tr-res', null, 'rgba(196,111,20,.95)', 3.6, 1.1); // velo de «con reserva» o «sin cuadrar» sobre un color
  pat('rl-tr-aju', null, 'rgba(47,111,168,.95)', 3.6, 1.1, -45); // velo de «ajustado»: otro color y la raya al revés
}

/** Prepara el mapa de Andalucía dentro de la caja dada. */
export function baseMapa(topo, x0, y0, w, h) {
  const o = topo.objects;
  const and = topojson.feature(topo, o.andalucia);
  const pr = proyeccion().fitExtent([[x0 + 2, y0 + 2], [x0 + w - 2, y0 + h - 2]], and);
  const path = d3.geoPath(pr);
  const munis = topojson.feature(topo, o.municipios).features;
  const provs = topojson.feature(topo, o.provincias).features;
  const internas = topojson.mesh(topo, o.provincias, (a, b) => a !== b);
  const borde = topojson.mesh(topo, o.provincias, (a, b) => a === b);
  return { pr, path, munis, provs, internas, borde };
}

/** Líneas de provincia y contorno, encima de todo. */
export function rematar(g, m) {
  g.append('path').datum(m.internas).attr('class', 'p-prov').attr('d', m.path);
  g.append('path').datum(m.borde).attr('class', 'p-cont').attr('d', m.path);
}

/** Lista de filas (municipios) en la capa HTML. */
export function lista(cont, { titulo, nota, filas, max, clase = '' }) {
  const b = cont.append('div').attr('class', 'rl-lista');
  b.append('h3').text(titulo);
  if (nota) b.append('p').text(nota);
  filas.forEach(f => {
    const r = b.append('div').attr('class', `rl-fila ${clase} ${f.est ? 'est' : ''}`);
    r.append('b').text(f.nombre).attr('title', f.nombre);
    r.append('strong').text(f.valor);
    r.append('i').style('width', Math.max(2, 100 * f.medida / max).toFixed(1) + '%');
    if (f.det) r.append('small').text(f.det);
  });
}
