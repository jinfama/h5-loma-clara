// comun.js — lo que comparten las páginas de Info que leen js/visor4/creditos.js.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const enlaceDe = x => (x.doi ? `https://doi.org/${String(x.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : x.url || '');
