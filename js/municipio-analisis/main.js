// main.js — «Análisis del municipio»: su historia y su historia comparada, generadas por reglas a partir de las cifras del
// Atlas. Sin ?ine abre el mapa en blanco para elegir municipio. Cada sección carga sus datos cuando se acerca a la vista.
import { json, catalogo, valores, celda, existencia } from './datos.js';
import { esc, entero, decimal, cifra, marca, leyendaConvencion } from './util.js';
import { prepararPoblacion, textoPoblacion, pintarCurva, notaCenso } from './poblacion.js';
import { prepararComparada, textoPobComp, pintarPobComp, fraseParticular } from './comparada.js';
import { pintarFronteras } from './fronteras.js';
import { RASGOS, panel } from './panel.js';
import { pintarHuella, tablaComparada } from './huella.js';
import { calcularDistinto, pintarDistinto, calcularParecidos, pintarParecidos, rasgosParecido } from './distinto.js';
import { prepararPoblamiento, textoPoblamiento, textoPoblamientoComp, pintarPoblamiento, pintarPoblamientoComp } from './poblamiento.js';
import { prepararTierra, textoTierra, pintarTierra, prepararLQ, fraseLQ, textoLQ, pintarLQ } from './tierra.js';
import { prepararPropiedad, textoPropiedad, textoPropiedadComp, pintarPropiedad, pintarPropiedadComp } from './propiedad.js';
import { prepararTrabajo, textoTrabajo, pintarTrabajo, prepararTrabajoComp, textoTrabajoComp, pintarTrabajoComp } from './trabajo.js';
import { prepararGanador, textoVoto, pintarVoto, repartoDe, pintarVotoComp, fraseVoto } from './voto.js';
import { prepararClima, textoClima, pintarClima, prepararClimaComp, textoClimaComp, pintarClimaComp } from './clima.js';
import { prepararCaminos, textoCaminos, pintarCaminos } from './caminos.js';
import { prepararGeografia, textoGeografia, pintarGeografia } from './geografia.js';
import { pintarMapa, datosMunicipio } from './mapa.js';
import { montarSelector, abrirCapaSelector } from './selector.js';
import { cargarFuentes, nombreFuente, fuente } from '../atlas2/fuentes.js';

const PROV = { '04': 'Almería', 11: 'Cádiz', 14: 'Córdoba', 18: 'Granada', 21: 'Huelva', 23: 'Jaén', 29: 'Málaga', 41: 'Sevilla' };
const raiz = document.getElementById('ma-raiz');
const memoEx = new Map();

const SECCIONES = [
  { id: 'fronteras', n: 'Fronteras', t: 'Sus fronteras', una: true },
  { id: 'huella', n: 'En qué destaca', t: 'En qué destaca', una: true },
  { id: 'poblacion', n: 'Población', t: 'Su población' },
  { id: 'poblamiento', n: 'Dispersión', t: 'Núcleo y diseminado' },
  { id: 'tierra', n: 'Tierra', t: 'Su tierra' },
  { id: 'propiedad', n: 'Explotaciones', t: 'Sus explotaciones' },
  { id: 'trabajo', n: 'Trabajo', t: 'Su trabajo' },
  { id: 'voto', n: 'Voto', t: 'Su voto' },
  { id: 'clima', n: 'Clima', t: 'Su clima' },
  { id: 'caminos', n: 'Caminos', t: 'Sus caminos' },
  { id: 'geografia', n: 'Geografía', t: 'Su geografía', una: true },
  { id: 'parecidos', n: 'Parecidos', t: 'Municipios que se le parecen', una: true },
];

function fraseInicial(ctx, Pb) {
  if (!Pb.ult) return '';
  let s = `${esc(ctx.nombre)} tenía ${cifra(entero(Pb.ult.v), Pb.ult.f)} habitantes en el censo de ${Pb.ult.a}`;
  if (Pb.max && Pb.max.a !== Pb.ult.a) {
    const d = (Pb.ult.v / Pb.max.v - 1) * 100;
    s += `, un ${decimal(Math.abs(d))} % ${d < 0 ? 'menos' : 'más'} que en su máximo de ${Pb.max.a}${notaCenso(Pb.max)}`;
  } else if (Pb.max) s += `, la cifra más alta ${Pb.fraseMax}`;
  return `${s}.`;
}

function cabecera(ctx, Pb, sup, alt) {
  const largo = ctx.nombre.length;
  const cl = largo > 24 ? 'ma-nom--xl' : largo > 15 ? 'ma-nom--l' : '';
  const dif = Pb.ult && Pb.max && Pb.max.a !== Pb.ult.a ? (Pb.ult.v / Pb.max.v - 1) * 100 : null;
  const kpi = (r, v, n = '') => `<div class="ma-kpi"><span class="ma-kpi__r">${r}</span><span class="ma-kpi__v">${v}</span>${n ? `<span class="ma-kpi__n">${n}</span>` : ''}</div>`;
  return `
  <header class="ma-hero">
    <div class="ma-w ma-hero__g">
      <div class="ma-hero__t">
        <p class="ma-pre">Análisis del municipio</p>
        <h1 class="ma-nom ${cl}">${ctx.nombre.split(/\s+/).map(p => `<span>${esc(p)}</span>`).join(' ')}</h1>
        <p class="ma-lugar">Provincia de ${esc(ctx.provNombre)}${ctx.partido ? ` · partido judicial de ${esc(ctx.partido.nombre)} en 1888 <span title="${esc(ctx.partido.estado || 'Pertenencia en revisión')}">${marca('2')}</span>` : ''}</p>
        <p class="ma-lede" id="ma-lede">${fraseInicial(ctx, Pb)}</p>
      </div>
      <div class="ma-kpis">
        ${kpi(`Habitantes, ${Pb.ult ? Pb.ult.a : 'censo'}`, Pb.ult ? cifra(entero(Pb.ult.v), Pb.ult.f) : '—')}
        ${kpi('Su máximo en un censo', Pb.max ? cifra(entero(Pb.max.v), Pb.max.f) : '—', Pb.max ? `en ${Pb.max.a}${Pb.max.tipo === 'termino' ? ', con su término de entonces' : ''}` : '')}
        ${kpi('Desde su máximo', dif == null ? (Pb.max ? '0\u00a0%' : '—') : `${dif < 0 ? '−' : '+'}${decimal(Math.abs(dif))}\u00a0%`, dif == null ? (Pb.max ? `${Pb.max.a} es su máximo` : '') : `de ${Pb.max.a} a ${Pb.ult.a}`)}
        ${kpi('Altitud media', alt && alt.v != null ? cifra(`${entero(alt.v)} m`, alt.f) : '—')}
        ${kpi('Superficie hoy', sup ? `${entero(sup)} ha` : '—')}
      </div>
    </div>
  </header>`;
}

const barra = ctx => `<div class="ma-barra" id="ma-barra"><div class="ma-w ma-barra__g">
    <a class="ma-barra__id" href="#ma-arriba" title="Ir al principio"><span class="ma-barra__mapa" id="ma-mini" aria-hidden="true"></span><span class="ma-barra__t"><b>${esc(ctx.nombre)}</b><small>${esc(ctx.provNombre)}</small></span></a>
    <nav class="ma-barra__i" aria-label="Partes del análisis"><ul>${SECCIONES.map(s => `<li><a href="#s-${s.id}" data-ir="${s.id}">${s.n}</a></li>`).join('')}</ul></nav>
    <button type="button" class="ma-barra__cambia" id="ma-cambia"><span class="ma-barra__l">Cambiar de municipio</span><span class="ma-barra__c">Cambiar</span></button>
  </div></div>`;

const bloque = (s, k) => `<section class="ma-sec" id="s-${s.id}" data-sec="${s.id}">
  <div class="ma-w">
    <header class="ma-sec__h"><span class="ma-num">${String(k + 1).padStart(2, '0')}</span><h2>${s.t}</h2></header>
    ${s.una ? '<div class="ma-una"><div class="ma-txt" data-p="h"></div><div class="ma-sec__c" data-p="h"><p class="ma-cargando">Leyendo…</p></div></div>' : `<div class="ma-dos">
      <div class="ma-col"><p class="ma-rot">Su historia</p><div class="ma-txt" data-p="h"></div><div class="ma-sec__c" data-p="h"><p class="ma-cargando">Leyendo…</p></div></div>
      <div class="ma-col ma-col--c"><p class="ma-rot ma-rot--c">Su historia comparada</p><div class="ma-txt" data-p="c"></div><div class="ma-sec__c" data-p="c"><p class="ma-cargando">Leyendo…</p></div></div>
    </div>`}
  </div></section>`;

// el nombre nunca se parte a mitad de palabra: si su palabra más larga no cabe, baja el cuerpo
function ajustaNombre() {
  const h = document.querySelector('.ma-hero .ma-nom'); if (!h) return;
  const ajusta = () => {
    h.style.fontSize = '';
    const w = h.clientWidth, mx = Math.max(...[...h.children].map(s => s.getBoundingClientRect().width));
    if (mx > w && w > 0) h.style.fontSize = `${Math.floor(parseFloat(getComputedStyle(h).fontSize) * w / mx * .985)}px`;
  };
  ajusta();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajusta);
  let tm = null;
  window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(ajusta, 100); });
}

function seguirIndice() {
  const enlaces = new Map([...document.querySelectorAll('[data-ir]')].map(a => [a.dataset.ir, a]));
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      enlaces.forEach(a => a.removeAttribute('aria-current'));
      const a = enlaces.get(e.target.dataset.sec);
      if (a) { a.setAttribute('aria-current', 'true'); const ul = a.closest('ul'); ul.scrollTo({ left: a.offsetLeft - ul.clientWidth / 2 + a.offsetWidth / 2 }); }
    }
  }, { rootMargin: '-30% 0px -65% 0px' });
  document.querySelectorAll('.ma-sec[data-sec]').forEach(s => io.observe(s));
}

const pintaError = el => { el.innerHTML = '<p class="ma-pie">No se pudo leer esta parte.</p>'; };

async function arrancar() {
  const q = new URLSearchParams(location.search).get('ine') || '';
  if (!q) { document.body.classList.add('ma-entrada'); raiz.innerHTML = ''; await montarSelector(raiz); return; }
  const P = await json('visor/pertenencia.json');
  const i = P.ine.indexOf(q);
  if (i < 0) {
    document.body.classList.add('ma-entrada');
    raiz.innerHTML = '';
    await montarSelector(raiz, { aviso: `No hay ningún municipio de hoy con el código ${q}.` });
    return;
  }
  const [H, cat, emp] = await Promise.all([json('fronteras/historia.json'), catalogo(), valores('empleo_pct_agricultura')]);
  const prov = q.slice(0, 2), hist = H.municipios[q] || null;
  const pjId = P.municipio.pj1888[i], pjN = P.niveles.pj1888, pjK = pjN.ids.indexOf(pjId);
  const ctx = {
    ine: q, i, P, cat, hist, prov, nombre: P.nombres[i], provNombre: PROV[prov], cortes: H.cortes, municipios: H.municipios,
    partido: pjK >= 0 ? { nombre: pjN.nombres[pjK], estado: pjN.estado && pjN.estado[pjK] } : null,
    ex: existencia(hist, emp, q),
    exDe: id => { if (!memoEx.has(id)) memoEx.set(id, existencia(H.municipios[id], emp, id)); return memoEx.get(id); },
  };
  document.title = `${ctx.nombre} · Análisis del municipio · Atlas Histórico de Andalucía`;
  const [Pb, alt, geoF] = await Promise.all([prepararPoblacion(ctx), valores('geo_altitud_mean').then(d => celda(d, q, 2026)), datosMunicipio(q)]);
  ctx.bandas = Pb.bandas;
  raiz.innerHTML = `<span id="ma-arriba"></span>${barra(ctx)}${cabecera(ctx, Pb, geoF && geoF.properties.ha, alt)}
    <div class="ma-w ma-leer"><span>Cómo leer cada cifra</span>${leyendaConvencion()}</div>
    ${SECCIONES.map(bloque).join('')}
    <section class="ma-sec ma-sec--fin" id="s-fuentes"><div class="ma-w"><h2>De dónde salen estas cifras</h2><div class="ma-fuentes"></div></div></section>
    <footer class="ma-w ma-pie-pag"><a href="visor.html?mun=${q}">← Volver a la ficha de ${esc(ctx.nombre)} en el visor</a></footer>`;
  ajustaNombre();
  seguirIndice();
  ctx.ha = geoF && geoF.properties.ha;
  pintarMapa(document.getElementById('ma-mini'), q, { mini: true });
  document.getElementById('ma-cambia').addEventListener('click', () => abrirCapaSelector(q));

  const una = (k, fn) => { if (!ctx[k]) ctx[k] = fn(); return ctx[k]; };
  const D = {
    comp: () => una('_comp', () => prepararComparada(ctx, Pb)),
    lq: () => una('_lq', () => prepararLQ(ctx)),
    dis: () => una('_dis', () => prepararPoblamiento(ctx)),
    tierra: () => una('_tierra', () => prepararTierra(ctx)),
    trabajo: () => una('_trabajo', () => prepararTrabajo(ctx)),
    gen: () => una('_gen', () => repartoDe('generales', ctx)),
  };
  // qué tiene de particular: se escribe en cuanto están sus cifras
  Promise.all([D.comp(), D.lq(), D.dis(), D.gen()]).then(([comp, l, dis, gen]) => {
    const t = fraseParticular(ctx, { comp, lq: fraseLQ(l), voto: fraseVoto(gen), dis: dis.ultima && dis.ultima.pos ? dis.ultima : null });
    if (t) document.getElementById('ma-lede').innerHTML = t;
  }).catch(e => { if (!saliendo) console.warn('[análisis] resumen', e); });

  const delTema = async tema => (await panel(ctx)).filter(x => x.t === tema);
  const tareas = {
    async fronteras(h) { await pintarFronteras(h.c, ctx); },
    async huella(h) {
      const filas = await panel(ctx), R = await calcularDistinto(ctx);
      h.t.innerHTML = `<p>Sus ${R.elegidas.length} rasgos más singulares entre ${filas.length} indicadores. Cada punto gris es un municipio; el rojo, este; la raya negra, Andalucía.</p>`;
      pintarHuella(h.c, filas);
      pintarDistinto(h.c.querySelector('.ma-hd'), R, ctx);
    },
    async poblacion(h, c) {
      h.t.innerHTML = textoPoblacion(Pb, ctx); pintarCurva(h.c, Pb, ctx);
      const C = await D.comp(); c.t.innerHTML = textoPobComp(C); pintarPobComp(c.c, C, Pb, ctx);
    },
    async poblamiento(h, c) {
      const X = await D.dis();
      h.t.innerHTML = textoPoblamiento(X); pintarPoblamiento(h.c, X);
      c.t.innerHTML = textoPoblamientoComp(X); pintarPoblamientoComp(c.c, X);
    },
    async tierra(h, c) {
      const [T, L] = await Promise.all([D.tierra(), D.lq()]);
      h.t.innerHTML = textoTierra(T); pintarTierra(h.c, T);
      c.t.innerHTML = textoLQ(L); pintarLQ(c.c, L);
    },
    async propiedad(h, c) {
      const X = await prepararPropiedad(ctx), filas = await delTema('Propiedad');
      h.t.innerHTML = textoPropiedad(X); pintarPropiedad(h.c, X, ctx);
      c.t.innerHTML = textoPropiedadComp(X);
      c.c.innerHTML = `<h3 class="ma-h3">Tamaño medio de la explotación (ha)</h3><div class="ma-graf ma-pl"></div>${tablaComparada(filas)}`;
      pintarPropiedadComp(c.c.querySelector('.ma-pl'), X, ctx);
    },
    async trabajo(h, c) {
      const T = await D.trabajo(); h.t.innerHTML = textoTrabajo(T); pintarTrabajo(h.c, T);
      const X = await prepararTrabajoComp(ctx, T), filas = await delTema('Trabajo');
      c.t.innerHTML = textoTrabajoComp(X);
      c.c.innerHTML = `<h3 class="ma-h3">Ocupados en agricultura (%)</h3><div class="ma-graf ma-tl"></div><p class="ma-pie">Antes de 1991 las cifras de Andalucía y de las provincias mezclan censo y modelo.</p>${tablaComparada(filas)}`;
      pintarTrabajoComp(c.c.querySelector('.ma-tl'), X, ctx);
    },
    async voto(h, c) {
      const G = await prepararGanador(ctx); h.t.innerHTML = textoVoto(G, ctx);
      pintarVoto(h.c, G, ctx, R => pintarVotoComp(c.c, R, ctx, c.t));
    },
    async clima(h, c) {
      const X = await prepararClima(ctx); h.t.innerHTML = textoClima(X); pintarClima(h.c, X);
      const Y = await prepararClimaComp(ctx, X); c.t.innerHTML = textoClimaComp(Y); pintarClimaComp(c.c, Y, ctx);
    },
    async caminos(h, c) {
      const X = await prepararCaminos(ctx), filas = await delTema('Caminos');
      h.t.innerHTML = textoCaminos(X); pintarCaminos(h.c, X);
      c.t.innerHTML = '<p>Frente a Andalucía y a su provincia solo donde esa cifra es comparable; las distancias y los kilómetros se comparan con la mediana de los municipios.</p>';
      c.c.innerHTML = tablaComparada(filas);
    },
    async geografia(h) { const X = await prepararGeografia(ctx); h.t.innerHTML = textoGeografia(X); pintarGeografia(h.c, X); },
    async parecidos(h) {
      const R = await calcularParecidos(ctx);
      h.t.innerHTML = `<p>Los ${R.lista.length} municipios más cercanos en ${rasgosParecido().length} rasgos de población, terreno, usos del suelo, empleo y clima.</p><p class="ma-cautela">Cómo se calcula: cada rasgo se estandariza (media 0, desviación 1), todos pesan igual y se mide la distancia entre municipios.</p><div class="ma-mapa ma-mapa--claro" id="ma-mapa-par"></div>`;
      pintarParecidos(h.c, R, ctx, PROV);
      if (R.lista.length) pintarMapa(document.getElementById('ma-mapa-par'), q, { pares: R.lista.map(x => P.ine[x.j]), claro: true });
    },
  };
  const hecho = new Set();
  const parte = (el, p) => ({ t: el.querySelector(`.ma-txt[data-p="${p}"]`), c: el.querySelector(`.ma-sec__c[data-p="${p}"]`) });
  const lanzar = async el => {
    const id = el.dataset.sec;
    if (hecho.has(id)) return;
    hecho.add(id);
    const h = parte(el, 'h'), c = parte(el, 'c');
    try { await tareas[id](h, c); }
    catch (e) { if (saliendo) return; console.warn('[análisis]', id, e); pintaError(h.c); if (c.c) pintaError(c.c); }
  };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); lanzar(e.target); } }), { rootMargin: '700px 0px' });
  document.querySelectorAll('.ma-sec[data-sec]').forEach(s => io.observe(s));
  await cargarFuentes().catch(() => {});
  pintaFuentes(new Set([...RASGOS.map(r => r.id), 'elec_ganador_municipales', 'ganado1752_ovino', 'poblacion_1591_vecinos', 'usos_g_inculto_y_no_agrario_pct']), cat);
}

function pintaFuentes(usados, cat) {
  const el = document.querySelector('.ma-fuentes'); if (!el) return;
  const ids = new Set();
  for (const u of usados) (cat.get(u)?.fuentes || []).forEach(x => ids.add(x));
  const filas = [...ids].filter(x => fuente(x)).map(x => {
    const fu = fuente(x);
    return `<li>${esc(nombreFuente(x))}${fu.url ? ` · <a href="${esc(fu.url)}" target="_blank" rel="noopener">enlace ↗</a>` : ''}</li>`;
  });
  el.innerHTML = `<p class="ma-intro">Todas las frases de esta página se generan con reglas a partir de las cifras del Atlas: no explican causas. Un dato que falta es un dato que falta, nunca un cero.</p><ul class="ma-lista-f">${filas.join('')}</ul><p class="ma-pie">El detalle de cada indicador y su método, en <a href="fuentes.html">Fuentes</a>.</p>`;
}

let saliendo = false;
window.addEventListener('pagehide', () => { saliendo = true; });
arrancar().catch(e => { if (saliendo) return; console.error(e); raiz.innerHTML = '<p class="ma-cargando">No se pudo leer el municipio.</p>'; });
