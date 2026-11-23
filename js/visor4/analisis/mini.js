// mini.js — minigráfico de cada análisis para las tarjetas de «¿Qué quieres hacer?» (SVG en texto, 64 × 40). La tinta
// es currentColor (blanca en la tarjeta activa); al pasar el ratón hacen un gesto (css/analisis.css, «.an-modo:hover»):
// la recta se dibuja, las casillas laten, las vecinas se encienden, las series se trazan.

const svg = cuerpo => `<svg viewBox="0 0 64 40" width="64" height="40" focusable="false">${cuerpo}</svg>`;
const STEVENS = ['#e8e8e8', '#e4acac', '#c85a5a', '#b0d5df', '#ad9ea5', '#985356', '#64acbe', '#627f8c', '#574249'];
const DIVERGE = ['#1f4f86', '#a9c3dd', '#e6b3a5', '#c4644c', '#a9c3dd', '#1f4f86', '#ecebe6', '#5a8bbd', '#e6b3a5', '#ecebe6', '#1f4f86', '#a9c3dd', '#c4644c', '#5a8bbd', '#a9c3dd', '#1f4f86'];

export const MINI = {
  // nube de puntos y su recta
  disp: svg(`<g fill="currentColor" fill-opacity=".5">${[[8, 33], [13, 28], [18, 31], [23, 25], [28, 27], [33, 20], [38, 23], [43, 15], [48, 18], [54, 10], [58, 13]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.1"/>`).join('')}</g>
    <path class="an-mini__traza" d="M5 35 L61 7" pathLength="100" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>`),
  // mapa de 3 × 3 colores
  biv: svg(STEVENS.map((c, k) => `<rect class="an-mini__late" style="animation-delay:${(k % 3 + Math.floor(k / 3)) * 70}ms" x="${17 + (k % 3) * 10.5}" y="${3 + (2 - Math.floor(k / 3)) * 11.5}" width="9.5" height="10.5" fill="${c}"/>`).join('')),
  // una unidad y sus vecinas
  moran: svg(`<g stroke="currentColor" stroke-opacity=".45" stroke-width="1.2">${[0, 1, 2, 3, 4, 5].map(i => { const a = (i / 6) * Math.PI * 2 + 0.3; return `<line x1="32" y1="20" x2="${(32 + Math.cos(a) * 14).toFixed(1)}" y2="${(20 + Math.sin(a) * 14).toFixed(1)}"/>`; }).join('')}</g>
    ${[0, 1, 2, 3, 4, 5].map(i => { const a = (i / 6) * Math.PI * 2 + 0.3; return `<circle class="an-mini__late" style="animation-delay:${i * 80}ms" cx="${(32 + Math.cos(a) * 14).toFixed(1)}" cy="${(20 + Math.sin(a) * 14).toFixed(1)}" r="3.6" fill="#d7191c" fill-opacity="${i % 3 === 2 ? 0.35 : 0.8}"/>`; }).join('')}
    <circle cx="32" cy="20" r="5.2" fill="#d7191c" stroke="currentColor" stroke-width="1.4"/>`),
  // matriz de correlaciones
  matriz: svg(DIVERGE.map((c, k) => `<rect class="${k % 5 === 0 ? 'an-mini__late' : ''}" style="animation-delay:${(k % 5 === 0 ? k / 5 : 0) * 90}ms" x="${16 + (k % 4) * 8.2}" y="${3 + Math.floor(k / 4) * 8.6}" width="7.4" height="7.8" fill="${c}"/>`).join('')),
  // coeficientes con su intervalo
  reg: svg(`<line x1="30" y1="3" x2="30" y2="37" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="2 2"/>
    ${[[10, 36, 54, 45], [20, 10, 26, 18], [30, 24, 42, 33]].map(([y, a, b, c], i) => `<g class="an-mini__empuja" style="animation-delay:${i * 90}ms"><line x1="${a}" y1="${y}" x2="${b}" y2="${y}" stroke="currentColor" stroke-width="2"/><rect x="${c - 3}" y="${y - 3}" width="6" height="6" fill="currentColor"/></g>`).join('')}`),
  // unidades seguidas en el tiempo
  panel: svg(`${['M6 31 L20 27 L34 24 L48 19 L58 16', 'M6 22 L20 19 L34 15 L48 11 L58 8', 'M6 37 L20 34 L34 31 L48 27 L58 24'].map((d, i) => `<path class="an-mini__traza" style="animation-delay:${i * 90}ms" d="${d}" pathLength="100" stroke="currentColor" stroke-opacity="${[0.9, 0.6, 0.4][i]}" stroke-width="1.8" fill="none"/>`).join('')}
    <g fill="currentColor">${[6, 20, 34, 48, 58].map(x => `<rect x="${x - 0.6}" y="38" width="1.2" height="2"/>`).join('')}</g>`),
  // dos series en el tiempo
  tiempo: svg(`<path class="an-mini__traza" d="M3 27 C10 10 17 33 25 19 S40 7 47 17 S57 12 61 9" pathLength="100" stroke="currentColor" stroke-width="2" fill="none"/>
    <path class="an-mini__traza" style="animation-delay:120ms" d="M3 33 C10 18 17 37 25 26 S40 15 47 24 S57 19 61 16" pathLength="100" stroke="#d23c2f" stroke-width="2" fill="none" stroke-dasharray="100"/>`),
};
