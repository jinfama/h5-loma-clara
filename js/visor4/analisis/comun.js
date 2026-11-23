// comun.js — piezas pequeñas de la vista «Análisis»: formatos en español, elementos, selectores y CSV.
import { MARCA, NOMBRE_PROV } from './cruce.js';

export const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- números
const NF = {};
const nf = (min, max) => (NF[min + '|' + max] ||= new Intl.NumberFormat('es-ES', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: 'always' }));
/** Número con decimales razonables para su tamaño. */
export function num(v, dec = null) {
  if (v == null || !isFinite(v)) return '—';
  if (dec != null) return nf(dec, dec).format(v);
  const a = Math.abs(v);
  if (a >= 1000) return nf(0, 0).format(v);
  if (a >= 100) return nf(0, 1).format(v);
  if (a >= 10) return nf(0, 2).format(v);
  if (a >= 1) return nf(0, 2).format(v);
  if (a === 0) return '0';
  if (a >= 0.01) return nf(0, 3).format(v);
  return v.toExponential(2).replace('.', ',');
}
/** Coeficiente con tres cifras significativas (pendientes, constantes). */
export function sig(v, c = 3) {
  if (v == null || !isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) { const [m, e] = v.toExponential(c - 1).split('e'); return m.replace('.', ',') + ' × 10' + String(+e).replace('-', '⁻').replace(/[0-9]/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]); }   // 8,03 × 10⁻⁵
  const d = Math.max(0, c - 1 - Math.floor(Math.log10(a)));
  return nf(0, Math.min(d, 8)).format(v);
}
export const r2 = v => (v == null || !isFinite(v) ? '—' : nf(2, 2).format(Math.abs(v) < 0.005 ? 0 : v));   // sin «-0,00»
export const pctTxt = v => (v == null || !isFinite(v) ? '—' : nf(0, 0).format(v * 100) + ' %');
/** p en llano: «< 0,001» o tres decimales. */
export const pTxt = p => (p == null || !isFinite(p) ? '—' : p < 0.001 ? '< 0,001' : nf(3, 3).format(p));
export const entero = v => (v == null || !isFinite(v) ? '—' : nf(0, 0).format(v));

/** Valor de un indicador con su unidad. */
export function valorTxt(ent, v) {
  if (v == null || !isFinite(v)) return 'sin dato';
  const u = (ent && ent.unidad) || '';
  return num(v) + (u ? (u.startsWith('%') ? ' ' + u : ' ' + u) : '');
}
export const rotulo = ent => (ent ? ent.rotulo : '—');
export const corto = ent => (ent ? (ent.rotulo_corto || ent.rotulo).replace(/^Usos del suelo: /, '').replace(/^Cosecha 1752, /, '') : '—');
/** Nombre corto sin la unidad entre paréntesis («Olivar», «Densidad»), para los títulos. */
export const nombre = ent => corto(ent).replace(/\s*\([^)]*\)\s*$/, '');
/** El mismo, en minúscula si va en medio de una frase (salvo siglas: SPI, pH…). */
export const nombreMin = ent => { const n = nombre(ent); return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(n) ? n[0].toLowerCase() + n.slice(1) : n; };
export const nombreProv = p => NOMBRE_PROV[p] || '';
export const marcaTxt = f => MARCA[f] || MARCA['.'];

// ---------------------------------------------------------------- DOM
export function h(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

/** Segmentado con el mismo marcado que los de la barra de opciones del visor (.v4-campo > .v4-campo__k + .v4-seg). */
let nSeg = 0;
// ---------------------------------------------------------------- «i» con un recuadro flotante corto
// Componente propio y sencillo (el armazón aún no tiene uno común: PETICIONES_API.md). Un clic abre; otro clic, Esc,
// pulsar fuera, desplazar o cambiar el tamaño de la ventana lo cierran. Solo uno abierto a la vez.
let nI = 0, iAbierto = null;
function fueraI(e) { if (iAbierto && !iAbierto.pop.contains(e.target) && !iAbierto.boton.contains(e.target)) cerrarI(); }
function teclaI(e) { if (e.key === 'Escape' && iAbierto) { const b = iAbierto.boton; cerrarI(); b.focus(); } }
export function cerrarI() {
  if (!iAbierto) return;
  iAbierto.pop.remove(); iAbierto.boton.setAttribute('aria-expanded', 'false'); iAbierto.boton.removeAttribute('aria-describedby');
  iAbierto = null;
  document.removeEventListener('pointerdown', fueraI, true); document.removeEventListener('keydown', teclaI, true);
  window.removeEventListener('scroll', cerrarI, true); window.removeEventListener('resize', cerrarI);
}
export function botonI(texto, rotulo = '') {
  const id = 'an-i-' + (++nI);
  const b = h('button', { type: 'button', class: 'an-i', 'aria-label': rotulo ? `Qué es «${rotulo}»` : 'Qué es esto', 'aria-expanded': 'false' }, 'i');
  b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const era = iAbierto && iAbierto.boton === b;
    cerrarI();
    if (era) return;
    const pop = h('div', { class: 'an-i-pop', id, role: 'tooltip' }, rotulo ? h('b', {}, rotulo + '. ') : null, texto);
    document.body.append(pop);
    const r = b.getBoundingClientRect(), w = pop.offsetWidth, alto = pop.offsetHeight;
    const x = Math.min(Math.max(8, r.left - 12), window.innerWidth - w - 8);
    let y = r.bottom + 6;
    if (y + alto > window.innerHeight - 8) y = Math.max(8, r.top - alto - 6);
    pop.style.left = `${Math.round(x)}px`; pop.style.top = `${Math.round(y)}px`;
    b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-describedby', id);
    iAbierto = { boton: b, pop };
    document.addEventListener('pointerdown', fueraI, true); document.addEventListener('keydown', teclaI, true);
    window.addEventListener('scroll', cerrarI, true); window.addEventListener('resize', cerrarI);
  });
  return b;
}

export function seg(etiqueta, opciones, valor, alCambiar, { titulo = '', info = '' } = {}) {
  const id = 'an-seg-' + (++nSeg);
  const g = h('div', { class: 'v4-seg', role: 'radiogroup', 'aria-labelledby': id, title: titulo || null });
  for (const [v, txt, title, dis] of opciones) {
    g.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(String(v) === String(valor)), title: title || null, disabled: dis || null, onclick: () => alCambiar(v) }, txt));
  }
  g.addEventListener('keydown', e => {
    const bs = [...g.querySelectorAll('button:not([disabled])')], k = bs.indexOf(document.activeElement);
    const to = { ArrowRight: k + 1, ArrowDown: k + 1, ArrowLeft: k - 1, ArrowUp: k - 1 }[e.key];
    if (k < 0 || to == null) return;
    e.preventDefault(); const b = bs[(to + bs.length) % bs.length]; b.focus(); b.click();
  });
  const k = info ? h('p', { class: 'v4-campo__k an-campo__k' }, h('span', { id, title: titulo || null }, etiqueta), botonI(info, etiqueta))
    : h('p', { class: 'v4-campo__k', id, title: titulo || null }, etiqueta);
  return h('div', { class: 'v4-campo an-campo' }, k, g);
}
/** Unidad entre paréntesis solo si el rótulo no la trae ya. */
export function conUnidad(ent) {
  const r = corto(ent);
  return ent && ent.unidad && !/\(/.test(r) ? `${r} (${ent.unidad})` : r;
}
/** Campo con un control cualquiera (un <select>) y el mismo rótulo. */
/** Ancho y alto libres de un elemento, sin su relleno: lo que puede ocupar un gráfico sin que se le corte el borde. */
export function cajaUtil(el) {
  const c = getComputedStyle(el);
  return { w: el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight), h: el.clientHeight - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom) };
}
export function campo(etiqueta, control) {
  return h('div', { class: 'v4-campo an-campo' }, h('p', { class: 'v4-campo__k' }, etiqueta), control);
}

// ---------------------------------------------------------------- CSV
const cel = v => { const t = v == null ? '' : typeof v === 'number' ? String(v) : String(v); return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function csv(nombre, filas) {
  const txt = '﻿' + filas.map(f => f.map(cel).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
