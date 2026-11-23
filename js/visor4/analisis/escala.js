// escala.js — eje lineal o logarítmico y cálculo con la cifra o con su logaritmo. Puro: sin DOM ni datos, para probarlo.
// Encargo de Juan (ronda v24): «en análisis, eje se puede poner log o no». Son dos cosas distintas:
//   · el EJE (clave `aej`, «lg»: X lineal, Y log) solo cambia cómo se ve: ningún estadístico se mueve;
//   · el CÁLCULO (clave `atr`, igual) usa el logaritmo en base 10 de la cifra: cambian los resultados y cómo se leen.
// Sin `atr`, el cálculo sigue al eje: es lo que hacían los enlaces anteriores, y así dan las mismas cifras que entonces.
// Un cero o un negativo no tiene logaritmo: esa unidad queda fuera y se cuenta. Nunca se le suma nada (nada de log(x+1)).

/** «lg» → [false, true]; lo que no sean dos letras l/g → null. */
export const letras = t => (/^[lg]{2}$/.test(t || '') ? [t[0] === 'g', t[1] === 'g'] : null);
export const aLetras = ([x, y]) => `${x ? 'g' : 'l'}${y ? 'g' : 'l'}`;

/** {ejes: [X, Y], calculo: [X, Y]} según la URL y, si falta, la escala del catálogo (catalogo: [X, Y]). */
export function estadoLog(aej, atr, catalogo) {
  const ejes = letras(aej) || [!!catalogo[0], !!catalogo[1]];
  return { ejes, calculo: letras(atr) || ejes.slice() };
}
/** Cambia el eje j (0 X, 1 Y) sin tocar el cálculo: por eso deja escritos los dos. */
export function cambiaEje(aej, atr, catalogo, j, log) {
  const { ejes, calculo } = estadoLog(aej, atr, catalogo);
  ejes[j] = !!log;
  return { aej: aLetras(ejes), atr: aLetras(calculo) };
}
/** Cambia el cálculo de la variable j sin tocar su eje. */
export function cambiaCalculo(aej, atr, catalogo, j, log) {
  const { ejes, calculo } = estadoLog(aej, atr, catalogo);
  calculo[j] = !!log;
  return { aej: aLetras(ejes), atr: aLetras(calculo) };
}
/** Otra variable en la posición j: esa posición vuelve a la escala del catálogo de la nueva (lo elegido para la otra se queda). */
export function alCambiarVariable(aej, atr, logCatalogo, j) {
  const out = {};
  for (const [k, t] of [['aej', aej], ['atr', atr]]) { const q = letras(t); if (q) { q[j] = !!logCatalogo; out[k] = aLetras(q); } }
  return out;
}
/** Intercambiar X e Y: cada una se lleva su eje y su cálculo. */
export function alIntercambiar(aej, atr) {
  const out = {};
  for (const [k, t] of [['aej', aej], ['atr', atr]]) { const q = letras(t); if (q) out[k] = aLetras([q[1], q[0]]); }
  return out;
}

/** La cifra que entra en el cálculo: la misma o su logaritmo en base 10; si no es mayor que cero, null (nunca log(x+1)). */
export const transforma = (v, log) => (v == null || !isFinite(v) ? null : !log ? +v : v > 0 ? Math.log10(v) : null);

/** Cuántas cifras hay, cuántas son mayores que cero y cuántas no. */
export function cuentaLog(valores) {
  let n = 0, pos = 0;
  for (const v of valores) { if (v == null || !isFinite(v)) continue; n++; if (v > 0) pos++; }
  return { n, pos, noPos: n - pos };
}
/** ¿Se puede usar logaritmo con estas cifras? Si no, el motivo (la opción sale apagada). */
export function puedeLog(valores, minimo = 3) {
  const c = cuentaLog(valores);
  if (!c.n) return { ...c, ok: false, motivo: 'no hay cifras' };
  if (c.pos < minimo) return { ...c, ok: false, motivo: !c.pos ? 'ninguna cifra es mayor que cero' : `solo ${c.pos === 1 ? 'una cifra es mayor' : `${c.pos} cifras son mayores`} que cero` };
  return { ...c, ok: true, motivo: '' };
}
