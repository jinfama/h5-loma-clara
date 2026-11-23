// bivariante.js — modo «Mapa bivariante»: terciles de X por terciles de Y (3 × 3) sobre los recintos del nivel.

import * as X from './cruce.js';
import * as E from './estadistica.js';
import { h, esc, num, r2, pTxt, entero, valorTxt, corto, nombreProv, marcaTxt, csv } from './comun.js';
import { pintarMapa } from './mapa.js';
import { yPorDefecto, panelXY, tituloXY } from './dispersion.js';

// paleta bivariante de Joshua Stevens (azul-rosa): [fila Y baja→alta][columna X baja→alta]
export const BIV = [
  ['#e8e8e8', '#ace4e4', '#5ac8c8'],
  ['#dfb0d6', '#a5add3', '#5698b9'],
  ['#be64ac', '#8c62aa', '#3b4994'],
];
const NOMBRE_T = ['bajo', 'medio', 'alto'];
const B = { ultimo: null, mapa: null, foco: null };

export const bivariante = {
  reproducible: true,
  aniosPropios: true,
  plan(S) { const x = S.A.ax, y = yPorDefecto(S, x, S.nivelDatos()); return y ? { ids: [x, y], ancla: y } : { error: 'No hay otro indicador con cifras por esta unidad territorial.' }; },
  titulo: S => tituloXY(S, 'y'),
  panel: S => [panelXY(S)],
  descargas: S => [h('button', { type: 'button', class: 'an-btn', onclick: () => exportar(S) }, 'CSV de clases')],
  async pintar(S, cancelado) {
    const cr = await X.cruzar(S.ctx, S.vars, S.nivelDatos(), S.anio, S.ventana);
    if (cancelado()) return;
    if (!cr) { S.sinUnidades(null, null); return; }
    const f = X.filtrar(cr, S.opcionesFiltro());
    if (S.sinUnidades(cr, f)) return;
    const xs = f.dentro.map(r => r.vals[0].v), ys = f.dentro.map(r => r.vals[1].v);
    const tx = xs.length >= 3 ? E.terciles(xs) : null, ty = ys.length >= 3 ? E.terciles(ys) : null;
    const clase = r => [r.vals[0].v <= tx[0] ? 0 : r.vals[0].v <= tx[1] ? 1 : 2, r.vals[1].v <= ty[0] ? 0 : r.vals[1].v <= ty[1] ? 1 : 2];
    const cls = new Map(), cuenta = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    if (tx) for (const r of f.dentro) { const c = clase(r); cls.set(r.id, c); cuenta[c[1]][c[0]]++; }
    B.ultimo = { cr, f, tx, ty, cls, cuenta, pe: E.pearson(xs, ys), sp: xs.length >= 3 ? E.spearman(xs, ys) : null };
    // escena: mapa + leyenda cuadrada encima
    const graf = S.ui.graf;
    graf.textContent = '';
    const caja = h('div', { class: 'an-mapa-caja' });
    graf.append(caja);
    const dentro = new Map(f.dentro.map(r => [r.id, r]));
    const todas = new Map(cr.filas.map(r => [r.id, r]));
    const relleno = id => {
      const r = dentro.get(id), c = cls.get(id);
      if (!r || !c) {
        const fila = todas.get(id);
        if (fila && fila.vals.every(v => v.v != null)) return { color: '#f4f4f2', titulo: `${fila.nombre}: fuera por el filtro o por los ajustes` };
        return null;
      }
      const atenuar = B.foco && (B.foco[0] !== c[0] || B.foco[1] !== c[1]);
      return { color: atenuar ? '#f4f4f2' : BIV[c[1]][c[0]], trama: atenuar ? null : r.res ? 'res' : r.est ? 'est' : null, titulo: `${r.nombre}: X ${NOMBRE_T[c[0]]}, Y ${NOMBRE_T[c[1]]}` };
    };
    const filaDe = id => todas.get(id);
    B.mapa = await pintarMapa(caja, cr.uni, {
      relleno, sel: S.ctx.estado.sel, etiqueta: `Mapa bivariante de ${S.vars[0].ent.rotulo} y ${S.vars[1].ent.rotulo}, ${S.anio}`,
      alPasar: (id, ev) => { const r = filaDe(id); if (r) S.ctx.tooltip.mostrar(ficha(S, r, cls.get(id), cr), ev.clientX, ev.clientY); },
      alSalir: () => S.ctx.tooltip.ocultar(),
      alPinchar: id => { const sel = S.ctx.estado.sel; S.ctx.set({ sel: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] }); },
    });
    B.relleno = relleno;
    resultados(S);
    leyenda(S, S.ui.res.querySelector('.an-biv-ley'), tx, ty, cuenta);
    S.pintaCuenta(f.cuenta, S.vars);
  },
  seleccion(S) { if (B.mapa) B.mapa.repintar(B.relleno, S.ctx.estado.sel); },
  destruir() { B.mapa = null; B.ultimo = null; B.foco = null; },
};

function ficha(S, r, c, cr) {
  const v = S.vars;
  const l = (j) => `<div class="an-tt-f"><span>${esc(corto(v[j].ent))} <small>${v[j].fijo ? 'fija' : cr.usados[j]}</small></span><b>${esc(valorTxt(v[j].ent, r.vals[j].v))}</b></div><div class="an-tt-m">${esc(marcaTxt(r.vals[j].f))}${r.vals[j].res ? ' · ' + esc(r.vals[j].res) : ''}</div>`;
  return `<strong>${esc(r.nombre)}</strong>${r.prov ? `<div class="an-tt-m">${esc(nombreProv(r.prov))}</div>` : ''}${l(0)}${l(1)}${c ? `<div class="an-tt-m">Clase: X ${NOMBRE_T[c[0]]} · Y ${NOMBRE_T[c[1]]}</div>` : ''}`;
}

function leyenda(S, el, tx, ty, cuenta) {
  if (!tx) { el.hidden = true; return; }
  const ex = S.vars[0].ent, ey = S.vars[1].ent;
  const celdas = [];
  for (let yy = 2; yy >= 0; yy--) for (let xx = 0; xx < 3; xx++) {
    celdas.push(h('button', { type: 'button', class: 'an-biv-c', style: `background:${BIV[yy][xx]}`, title: `X ${NOMBRE_T[xx]}, Y ${NOMBRE_T[yy]}: ${cuenta[yy][xx]} unidades (pasa el ratón para verlas)`,
      onmouseenter: () => { B.foco = [xx, yy]; B.mapa.repintar(B.relleno, S.ctx.estado.sel); }, onmouseleave: () => { B.foco = null; B.mapa.repintar(B.relleno, S.ctx.estado.sel); },
      onfocus: () => { B.foco = [xx, yy]; B.mapa.repintar(B.relleno, S.ctx.estado.sel); }, onblur: () => { B.foco = null; B.mapa.repintar(B.relleno, S.ctx.estado.sel); } }, h('span', {}, String(cuenta[yy][xx]))));
  }
  el.replaceChildren(
    h('p', { class: 'an-biv-t' }, 'Leyenda: terciles de cada uno'),
    h('div', { class: 'an-biv-cuerpo' },
      h('p', { class: 'an-biv-ey' }, `${corto(ey)} ↑`),
      h('div', { class: 'an-biv-rejilla' }, ...celdas),
      h('div', { class: 'an-biv-cy' }, h('span', {}, num(ty[1])), h('span', {}, num(ty[0])))),
    h('div', { class: 'an-biv-cx' }, h('span', {}, num(tx[0])), h('span', {}, num(tx[1]))),
    h('p', { class: 'an-biv-ex' }, `${corto(ex)} →`),
    h('p', { class: 'an-biv-n' }, 'El número es de unidades en cada casilla.'),
  );
}

function resultados(S) {
  const u = B.ultimo, el = S.ui.res;
  const n = u.f.dentro.length, ex = S.vars[0].ent, ey = S.vars[1].ent;
  const diag = u.cuenta[0][0] + u.cuenta[1][1] + u.cuenta[2][2], anti = u.cuenta[2][0] + u.cuenta[0][2];
  el.innerHTML = `
    <div class="an-r__big"><span class="an-r__n">${r2(u.pe.r)}</span><span class="an-r__l">r de Pearson</span></div>
    <div class="an-biv-ley"></div>
    <dl class="an-dl an-dl--clave"><dt>Unidades</dt><dd>${S.nTxt(n)}</dd>
    <dt>En la diagonal</dt><dd>${n ? num(diag / n * 100, 0) : '—'} %</dd></dl>
    <p class="an-lectura">Oscuro: alto en las dos; gris claro: bajo en las dos; rosa: solo Y alta; turquesa: solo X alta. Sin relación, en la diagonal caería un tercio.</p>
    ${S.avisoAnios(u.cr.usados) ? `<p class="an-nota an-nota--aviso">${esc(S.avisoAnios(u.cr.usados))}</p>` : ''}
    <ul class="an-ley"><li><i class="an-sw an-sw--t-est"></i>alguna cifra estimada</li>${u.f.cuenta.res ? '<li><i class="an-sw an-sw--t-res"></i>con reserva o en revisión</li>' : ''}<li><i class="an-sw an-sw--t-nd"></i>sin dato (no es cero)</li><li><i class="an-sw" style="background:#f4f4f2;border:1px solid #ddd"></i>fuera por los filtros</li></ul>
    ${S.mas(`<dl class="an-dl"><dt>Spearman (ρ)</dt><dd>${u.sp ? r2(u.sp.rho) : '—'} · p ${u.sp ? pTxt(u.sp.p) : '—'}</dd><dt>r: p</dt><dd>${pTxt(u.pe.p)}</dd>
      <dt>En la diagonal</dt><dd>${entero(diag)}</dd><dt>En esquinas opuestas</dt><dd>${entero(anti)}</dd></dl>
      <p class="an-nota">Cada color junta un tercio de X con un tercio de Y; los terciles se calculan con las unidades que entran. En las esquinas opuestas están las altas en uno y bajas en el otro.</p>`)}`;
  S.ponFuentes(S.fuentesCruce(u.cr));
  void ex; void ey;
}

function exportar(S) {
  const u = B.ultimo; if (!u) return;
  const v = S.vars;
  const filas = [['id', 'unidad', 'provincia', 'x_indicador', 'x_valor', 'x_anio', 'x_marca', 'y_indicador', 'y_valor', 'y_anio', 'y_marca', 'clase_x', 'clase_y', 'entra', 'x_fuente_original', 'y_fuente_original']];
  const fu = j => (u.cr.fuentes[j] || []).map(i => S.ctx.fuentes.nombreFuente(i)).join('; ');
  for (const r of u.cr.filas) {
    const c = u.cls.get(r.id);
    filas.push([r.id, r.nombre, nombreProv(r.prov), v[0].id, r.vals[0].v, v[0].fijo ? 'fija' : u.cr.usados[0], marcaTxt(r.vals[0].f), v[1].id, r.vals[1].v, v[1].fijo ? 'fija' : u.cr.usados[1], marcaTxt(r.vals[1].f), c ? NOMBRE_T[c[0]] : '', c ? NOMBRE_T[c[1]] : '', c ? 'sí' : 'no', fu(0), fu(1)]);
  }
  filas.push([]); filas.push(['# terciles de X', u.tx ? u.tx.join(' | ') : '']); filas.push(['# terciles de Y', u.ty ? u.ty.join(' | ') : '']);
  if (S.avisoAnios(u.cr.usados)) filas.push([`# ${S.avisoAnios(u.cr.usados)}`]);
  csv(`analisis_bivariante__${v[0].id}__${v[1].id}__${S.nivelDatos()}__${S.anio}.csv`, filas);
}
