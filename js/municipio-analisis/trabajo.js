// trabajo.js — empleo por sectores. Las columnas son años con cifra de fuente; la banda clara, años de modelo. 1787 va
// aparte. Antes de 1991 la serie mezcla censo y modelo, y la página lo dice.
import { valores, serie, avisoDe, dentroDe } from './datos.js';
import { decimal, cifra } from './util.js';
import { lineasComparadas } from './comparada.js';
import { pintarComposicion } from '../comun/composicion.js';

const SECTORES = [
  { id: 'empleo_pct_agricultura', r: 'Agricultura', c: '#b98a2e' },
  { id: 'empleo_pct_industria', r: 'Industria', c: '#6d6f73' },
  { id: 'empleo_pct_servicios', r: 'Servicios', c: '#2a5a85' },
];

export async function prepararTrabajo(ctx) {
  const ds = await Promise.all(SECTORES.map(s => valores(s.id)));
  const anios = ds[0].anios.map(Number);
  const series = ds.map(d => serie(d, ctx.ine));
  const filas = anios.map((a, k) => {
    const fuera = a >= 1842 && (ctx.ex.fuera(a) || (ctx.bandas || []).some(b => a >= b.desde && a <= b.hasta));
    const oculto = a < 1842 && (!!dentroDe(ctx.hist, ctx.ine, a) || avisoDe(ds[0], ctx.ine, a) === 'no_existia');
    const vs = series.map(S => S[k]);
    const ok = !oculto && vs.every(x => x.v != null);
    return { a, fuera, ok, agr: ok ? vs[0].v : null, ind: ok ? vs[1].v : null, ser: ok ? vs[2].v : null, f: !ok ? '.' : fuera ? '1' : vs[0].f, fs: !ok ? ['.', '.', '.'] : fuera ? ['1', '1', '1'] : vs.map(q => q.f), aviso: avisoDe(ds[0], ctx.ine, a) };
  });
  return { filas, pre: filas.find(x => x.a === 1787) || null, serie: filas.filter(x => x.a >= 1842), huecos: ctx.bandas || [] };
}

export function resumenTrabajo(T) {
  const ob = T.serie.filter(x => x.ok && x.f === '0' && x.a <= 2021);
  const u = ob[ob.length - 1] || [...T.serie].reverse().find(x => x.ok && x.a <= 2021) || null;
  return u;
}

export function textoTrabajo(T) {
  const u = resumenTrabajo(T);
  if (!u) return '<p>No hay cifras de empleo para este municipio.</p>';
  const t = [`<p>En ${u.a}, el ${cifra(`${decimal(u.agr)} %`, u.f)} de sus ocupados trabajaba en la agricultura, el ${cifra(`${decimal(u.ind)} %`, u.f)} en la industria y el ${cifra(`${decimal(u.ser)} %`, u.f)} en los servicios.</p>`];
  const ant = T.serie.find(x => x.ok && x.f === '0' && x.a < u.a);
  if (ant) {
    const d = u.agr - ant.agr;
    t.push(`<p>En ${ant.a}, primer año con cifra de fuente, la agricultura era el ${cifra(`${decimal(ant.agr)} %`, ant.f)}: ${d < 0 ? `${decimal(-d)} puntos más` : `${decimal(d)} puntos menos`} que en ${u.a}.</p>`);
  }
  t.push('<p class="ma-cautela">Antes de 1991 esta serie mezcla cifras de censo y de modelo.</p>');
  return t.join('');
}

export function pintarTrabajo(caja, T) {
  if (!T.filas.some(x => x.ok)) { caja.innerHTML = '<p class="ma-pie">Sin cifras de empleo.</p>'; return; }
  caja.innerHTML = `<div class="ma-trabajo"></div>
    <p class="ma-pie">% de los ocupados en los tres sectores. Las columnas son los años con cifra de fuente; entre ellas, el color difuminado es modelo de la base o interpolación: no es dato y no se da como cifra. 1787 son varones ocupados por oficio, en su año.</p>`;
  pintarComposicion(caja.querySelector('.ma-trabajo'), opcionesTrabajo(T));
}

// lo que recibe la gráfica común
export function opcionesTrabajo(T) {
  const clave = ['agr', 'ind', 'ser'], con = T.filas.filter(x => x.ok);
  return {
    anios: T.filas.map(x => x.a), dominio: [con[0].a, con[con.length - 1].a], unidad: '% de los ocupados', tabla: true, alto: 300, aria: 'Empleo por sectores',
    categorias: SECTORES.map((s, k) => ({ id: s.id, rotulo: s.r, color: s.c, valores: T.filas.map(x => (x.ok ? x[clave[k]] : null)), clases: T.filas.map(x => x.fs[k]) })),
    columna: (a, i, partes) => a === 1787 || partes.every(p => p.f === '0' || p.f === '3'),
    huecos: (T.huecos || []).map(h => ({ desde: h.desde, hasta: h.hasta, rotulo: `F${h.rotulo.slice(1)}`, corto: h.madre ? `Parte de ${h.madre.n}` : '' })),
    textos: { dato: 'columna en color pleno: año con cifra de fuente', interpolado: 'color difuminado: modelo o interpolación, no es dato', tipInterpolado: 'modelo o interpolación, no es dato' },
  };
}

// ---------------------------------------------------------------- su peso agrario frente a Andalucía y su provincia
const FECHAS_C = [1900, 1950, 1960, 1970, 1981, 1991, 2001, 2011, 2021];
export async function prepararTrabajoComp(ctx, T) {
  const [A, P] = await Promise.all([valores('empleo_pct_agricultura', 'andalucia'), valores('empleo_pct_agricultura', 'provincia')]);
  const sA = serie(A, 'AND'), sP = serie(P, ctx.prov), q = (S, a) => S.find(x => x.a === a) || { a, v: null, f: '.' };
  const m = FECHAS_C.map(a => { const x = T.serie.find(z => z.a === a); return x && x.ok ? { a, v: x.agr, f: x.f } : { a, v: null, f: '.' }; });
  return { m, A: FECHAS_C.map(a => q(sA, a)), P: FECHAS_C.map(a => q(sP, a)) };
}

export function textoTrabajoComp(C) {
  const k = [...C.m.keys()].reverse().find(i => C.m[i].v != null && C.A[i].v != null);
  if (k == null) return '<p>Sin cifras con las que compararlo.</p>';
  const u = C.m[k], a = C.A[k], p = C.P[k], d = u.v - a.v;
  return `<p>En ${u.a}, la agricultura pesa en su empleo <b class="ma-c">${decimal(Math.abs(d))} puntos ${d >= 0 ? 'más' : 'menos'}</b> que en Andalucía (${cifra(`${decimal(u.v)}\u00a0%`, u.f)} frente a ${cifra(`${decimal(a.v)}\u00a0%`, a.f)})${p.v != null ? ` y ${decimal(Math.abs(u.v - p.v))} puntos ${u.v >= p.v ? 'más' : 'menos'} que en su provincia` : ''}.</p>`;
}

export function pintarTrabajoComp(el, C, ctx) {
  lineasComparadas(el, { unidad: '% en agricultura', series: [{ t: ctx.nombre, c: '#007a3d', w: 2.8, pts: C.m }, { t: 'Provincia', c: '#6b6b6b', pts: C.P }, { t: 'Andalucía', c: '#101010', pts: C.A }] });
}
