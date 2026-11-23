/* Atlas v2 · formatos en español y utilidades pequeñas. */

const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/* Ojo: Intl es-ES no pone punto de miles en números de 4 cifras (1234); lo forzamos para
   que las cifras se lean igual en todas las páginas, salvo los años (usar String(año)). */
export function entero(v) {
  if (v == null || Number.isNaN(+v)) return '—';
  const s = nf0.format(Math.round(+v));
  return /^-?\d{4}$/.test(s) ? s.replace(/^(-?\d)(\d{3})$/, '$1.$2') : s;
}
export function decimal(v) {
  if (v == null || Number.isNaN(+v)) return '—';
  return nf1.format(+v);
}
export function pct(v) {
  if (v == null || Number.isNaN(+v)) return '—';
  return nf1.format(+v) + ' %';
}

// Regla 15 del contrato de lectura: lo que ve el público no lleva nombres de fichero ni rutas. Si un texto de la base
// los trae, se quita el paréntesis que los contiene y, si van sueltos, queda solo el nombre en palabras. La nota técnica
// (`nota_tecnica`) no pasa por aquí: va tal cual en la parte técnica de fuentes.html.
const EXT = '(?:topo\\.json|json|csv|gpkg|parquet|py|md|txt|xlsx)';
const RE_FICHERO = new RegExp(`(?:[\\w.-]+\\/)*[\\w.-]+\\.${EXT}\\b|\\b(?:data|documentation|build|code|config|clima)\\/[\\w./-]+`, 'i');
export function limpiaRutas(t) {
  if (typeof t !== 'string' || !RE_FICHERO.test(t)) return t;
  let x = t.replace(new RegExp(`\\s*\\([^()]*?(?:\\.${EXT}\\b|\\b(?:data|documentation|build|code|config)\\/)[^()]*\\)`, 'gi'), '');
  x = x.replace(new RegExp(`(?:[\\w.-]+\\/)*([\\w.-]+)\\.${EXT}\\b`, 'gi'), (m, b) => b.replace(/[_-]+/g, ' '));
  x = x.replace(/\b(?:data|documentation|build|code|config)\/[\w./-]+/gi, '');
  return x.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s*\)/g, '').trim();
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Quita tildes y pasa a minúsculas, para buscar nombres. */
export function normaliza(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export const reduceMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Lee un token CSS (--a2-accent, etc.) ya resuelto para el tema actual. */
export function token(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/* Llama a fn cuando cambia el tema claro/oscuro (sistema o data-theme). */
export function alCambiarTema(fn) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener && mq.addEventListener('change', fn);
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
