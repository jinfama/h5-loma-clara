// minimo1752.js — PROVISIONAL (23-nov-2026), hasta que exista la tabla de usos balanceados.
// Qué se puede leer de las cifras de usos de 1752, junto a la cifra:
//   · Andalucía, provincia, comarca y partido, según el campo `marca`: «mínimo» por debajo del 100 %; de 100 a 100,5 %,
//     solo «suma el X %»; por encima, «sin cuadrar».
//   · Unidades de 1842 y municipios fuera de las listas que pasan del 100,5 %: texto neutro, porque es aritmética del visor.
//   · Municipio y municipio histórico de 1752: «sin cuadrar» o «ajustado», según sus listas; el resto, sin marca.
//     En municipio, con `textos_municipio`: la marca es de su unidad de 1752 y la cifra municipal es un reparto.
// Este módulo dice cuándo y con qué texto; las vistas solo lo piden.
//
// PARA QUITARLO: borrar este fichero, el bloque «v54» del final de css/visor4.css y las líneas marcadas `minimo1752`:
//   grep -rn "minimo1752\|[mM]inimo(\|Minimo\b" js/
// Sin esos ganchos, Composición sigue repartiendo las hectáreas sobre la superficie de la unidad.

const ANIO = 1752;
const ES_USOS = /^usos_/;
// los términos históricos de 1752 usan los mismos ids que las unidades de 1752
const LISTA = { municipio: 'municipios', ue1752: 'ue1752', termino: 'ue1752' };
let D = null, pedido = null;

// los valores de usos esperan a este fichero: así ninguna vista pinta 1752 sin su marca
export function cargaMinimo1752() {
  if (!pedido) {
    pedido = fetch(new URL('../../data/v2/visor/usos_1752_minimo.json', import.meta.url), { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(j => {
        const niveles = {};
        for (const [n, x] of Object.entries(j.niveles || {})) {
          niveles[n] = new Map(x.ids.map((id, k) => [String(id), { marca: x.marca ? x.marca[k] : 'minimo', sin: x.sin_declarar_pct[k], mun: x.municipios[k], falta: x.municipios_sin_dato[k], suma: x.declarado_pct[k] }]));
        }
        const lista = c => new Set((j[c] || []).map(String));
        D = { niveles, textos: j.textos || {}, textosMunicipio: j.textos_municipio || {},
          municipios: { sin_cuadrar: lista('sin_cuadrar_municipios'), ajustado: lista('ajustados_municipios') },
          ue1752: { sin_cuadrar: lista('sin_cuadrar_ue1752'), ajustado: lista('ajustados_ue1752') },
          ue1842: new Map(Object.entries(j.ue1842 || {})), excedeMunicipio: new Map(Object.entries(j.excede_municipios || {})) };
        return D;
      })
      .catch(e => { console.error('[minimo1752]', e); return null; });
  }
  return pedido;
}

const num = v => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const uno = v => `${num(v)} %`;
const escapa = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const idDe = x => (x && typeof x === 'object' ? x.id : x);
const toca = (ind, anio) => !!D && +anio === ANIO && ES_USOS.test(String(idDe(ind) || ''));
const detalle = u => `${uno(u.sin)} de la superficie sin declarar · ${u.falta} de ${u.mun} municipios sin dato`;
const NOMBRE = { minimo: 'mínimo', sin_cuadrar: 'sin cuadrar', ajustado: 'ajustado', excede: 'pasa del 100 %' };   // «suma» va sin adjetivo

// el estado de una unidad en 1752: 'minimo', 'suma', 'sin_cuadrar', 'ajustado', 'excede' o null
function estadoDe(ind, nivel, anio, id) {
  if (!toca(ind, anio)) return null;
  const k = String(id);
  if (D.niveles[nivel]) { const u = D.niveles[nivel].get(k); return u ? u.marca || null : null; }
  if (nivel === 'ue1842') return D.ue1842.get(k)?.marca || null;
  const l = D[LISTA[nivel]];
  if (!l) return null;
  if (l.sin_cuadrar.has(k)) return 'sin_cuadrar';
  if (l.ajustado.has(k)) return 'ajustado';
  return nivel === 'municipio' && D.excedeMunicipio.has(k) ? 'excede' : null;
}

// nivel agregado con la marca de 1752 (Composición corta ahí la columna)
export const esMinimo = (ind, nivel, anio) => toca(ind, anio) && !!D.niveles[nivel];

export const esSinCuadrar = (ind, nivel, anio, id) => estadoDe(ind, nivel, anio, id) === 'sin_cuadrar';
export const esSuma = (ind, nivel, anio, id) => estadoDe(ind, nivel, anio, id) === 'suma';

// el texto que va junto a la cifra ('' si no toca)
export function marcaMinimo(ind, nivel, anio, id) {
  const e = estadoDe(ind, nivel, anio, id);
  if (!e) return '';
  const k = String(id);
  if (e === 'suma') return D.textos.suma.replace('{pct}', num(D.niveles[nivel].get(k).suma));
  if (e === 'excede') return D.textos.excede.replace('{pct}', num(nivel === 'municipio' ? D.excedeMunicipio.get(k) : D.ue1842.get(k).pct));
  // en municipio la marca es de su unidad de 1752 y la cifra es un reparto: tiene su propio texto
  if (e !== 'minimo') return (nivel === 'municipio' && D.textosMunicipio[e]) || D.textos[e] || NOMBRE[e];
  return `mínimo · ${detalle(D.niveles[nivel].get(k))}`;
}

// «Frente a Andalucía»: en 1752 la referencia es un mínimo, y no se compara
export function motivoFrenteMinimo(ind, anio) {
  if (!esMinimo(ind, 'andalucia', anio)) return '';
  const u = D.niveles.andalucia.values().next().value;
  return u ? `la cifra de Andalucía de ese año es un mínimo (${detalle(u)})` : '';
}

// una fila más en el puntero, con el dato de esa unidad
export function tipMinimo(ind, nivel, anio, id) {
  const t = marcaMinimo(ind, nivel, anio, id);
  return t ? `<div class="vv-tt-min">${escapa(t)}</div>` : '';
}

const tiposDe = (ind, nivel, ids) => [...new Set((ids || []).map(id => estadoDe(ind, nivel, ANIO, id)).filter(e => e && e !== 'suma'))].map(e => NOMBRE[e]);

// para el título de una gráfica: qué marcas hay en 1752 entre las unidades que dibuja
export function rotuloMinimo(ind, nivel, anios, ids) {
  if (!(anios || []).some(a => +a === ANIO)) return '';
  const t = tiposDe(ind, nivel, ids);
  return t.length ? ` · ${ANIO}: ${t.join(', ')}` : '';
}

// Líneas: raya y rótulo en 1752, con el texto completo si hay una sola unidad y cabe
export function marcaEnLineas(g, x, ind, nivel, iw, ih, ids) {
  const tipos = tiposDe(ind, nivel, ids);
  const solo = ids.length === 1 ? marcaMinimo(ind, nivel, ANIO, ids[0]) : '';
  if (!tipos.length && !solo) return;
  const X = x(ANIO);
  if (!(X >= 0 && X <= iw)) return;
  const txt = solo && (solo.length + 7) * 5.5 <= iw - X - 6 ? `${ANIO} · ${solo}` : tipos.length ? `${ANIO}: ${tipos.join(', ')}` : String(ANIO);
  g.append('line').attr('class', 'vv-min-raya').attr('x1', X).attr('x2', X).attr('y1', 0).attr('y2', ih);
  g.append('text').attr('class', 'vv-min-txt').attr('x', X + 5).attr('y', 11).text(txt);
}

// Composición: el recuadro del dibujo común es suyo; la marca se añade a su lectura de la columna de 1752
export function alPunteroComposicion(el, texto) {
  el.addEventListener('pointermove', () => {
    const t = document.getElementById('cz-tip');
    if (!t || t.hidden || t.querySelector('.vv-tt-min')) return;
    const b = t.querySelector('b');
    if (b && b.textContent === String(ANIO)) t.insertAdjacentHTML('beforeend', `<div class="vv-tt-min">${escapa(texto)}</div>`);
  });
}
