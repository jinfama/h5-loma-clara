// ejes.js — el control «Eje: lineal / logarítmico» y «Cálculo: la cifra / su logaritmo» del panel izquierdo (escala.js es
// la parte pura). Dispersión tiene los dos; Regresión, Panel y En el tiempo solo el cálculo, porque sus gráficos no llevan
// un eje con la cifra de la variable (coeficientes, residuos, desviaciones típicas).

import { h, seg, corto, nombre, nombreMin, entero } from './comun.js';
import { INFO } from './ayuda.js';
import * as EL from './escala.js';

export const conLog = (ent, on) => (on ? `log de ${nombreMin(ent)}` : nombreMin(ent));
export const ConLog = (ent, on) => (on ? `Log de ${nombreMin(ent)}` : nombre(ent));

/** Lo que hay que saber antes de tocar: el eje no cambia nada; el cálculo, sí. */
export function notaEjes(conEje, extra = '') {
  return h('p', { class: 'an-ej__nota' },
    conEje ? [h('b', {}, 'Eje: '), 'solo cambia cómo se ve; ningún estadístico se mueve. '] : null,
    h('b', {}, 'Cálculo: '), 'con logaritmo cambian los resultados y cómo se leen. ', extra || null);
}

const plural = (n, uno, varios) => `${entero(n)} ${n === 1 ? uno : varios}`;
/** Una variable: su eje (si lo tiene), su cálculo y qué pasa con sus ceros y negativos. */
export function filaLog({ rol, nombre: nom, valores, eje = null, calculo, alEje, alCalculo, info = false, que = 'cifra', ques = 'cifras' }) {
  const c = EL.puedeLog(valores);
  const opcion = (activo, txt) => ['g', txt, c.ok ? null : `No se puede: ${c.motivo}`, !c.ok && !activo];
  const nodos = [h('p', { class: 'an-ej__v' }, h('b', { class: rol === 'Y' ? 'is-y' : null }, rol), ` ${nom}`)];
  if (eje != null) nodos.push(seg(`Eje de ${rol}`, [['l', 'Lineal'], opcion(eje, 'Logarítmico')], eje ? 'g' : 'l', v => alEje(v === 'g'), { titulo: 'Solo cambia cómo se ve', info: info ? INFO.eje : '' }));
  nodos.push(seg(`Cálculo de ${rol}`, [['l', 'La cifra'], opcion(calculo, 'Logaritmo')], calculo ? 'g' : 'l', v => alCalculo(v === 'g'), { titulo: 'Con logaritmo cambian los resultados', info: info ? INFO.calculo : '' }));
  let nota = '';
  if (!c.ok) nota = `No se puede usar logaritmo: ${c.motivo}.`;
  else if (c.noPos) {
    const q = `${plural(c.noPos, que, ques)} con cero o negativo`;
    nota = calculo ? `${q}: fuera del cálculo.` : eje ? `${q}: no se dibuja${c.noPos === 1 ? '' : 'n'} en este eje, pero sigue${c.noPos === 1 ? '' : 'n'} en el cálculo.` : `Con logaritmo, ${q} quedaría${c.noPos === 1 ? '' : 'n'} fuera.`;
  }
  if (nota) nodos.push(h('p', { class: 'an-ej__fuera' }, nota));
  return nodos;
}

/** Regresión, Panel y En el tiempo: solo el cálculo, en `alg` (ids de las variables en logaritmo). */
export function seccionLog(S, { y, xs, logs, valores, extra = '', que, ques }) {
  if (!S.vars.length) return [];
  const pon = (id, on) => { const q = new Set(logs); if (on) q.add(id); else q.delete(id); S.setA({ alg: [...q].join(',') }); };
  const ent = id => S.ctx.datos.indicador(id);
  const fila = (id, rol, info) => { const v = S.vars.find(q => q.id === id); return v ? filaLog({ rol, nombre: corto(ent(id)), valores: valores(v), calculo: logs.has(id), alCalculo: on => pon(id, on), info, que, ques }) : []; };
  return [notaEjes(false, extra), ...fila(y, 'Y', true), ...xs.flatMap((id, j) => fila(id, xs.length > 1 ? `X${j + 1}` : 'X', false))];
}
export function resumenLog(S, { y, xs, logs }) {
  const con = [y, ...xs].filter(id => logs.has(id)).map(id => corto(S.ctx.datos.indicador(id)));
  return con.length ? `Con el logaritmo de ${con.join(', ')}` : 'Con las cifras, sin logaritmos';
}
/** Regresión y Panel: cómo se lee un coeficiente con logaritmos. */
export function avisoLog(S, { y, xs, logs }) {
  const con = [y, ...xs].filter(id => logs.has(id));
  if (!con.length) return '';
  return `Calculado con el logaritmo de ${con.map(id => nombreMin(S.ctx.datos.indicador(id))).join(', ')}: los coeficientes no están en las unidades de la cifra. Con log en Y y en X, b es el % que cambia Y por cada 1 % de X; solo en Y, Y se multiplica por 10^b con una unidad más de X; solo en X, b es lo que cambia Y cuando X se multiplica por 10.`;
}
