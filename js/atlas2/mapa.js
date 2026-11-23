/* Atlas v2 · utilidades de mapa.
   Requiere los globales d3 (d3@7.9.0) y topojson (topojson-client@3.1.0), cargados con <script> antes del módulo.

   - proyeccionAndalucia(geo, ancho, alto, margen): cónica conforme centrada en Andalucía, encajada a `geo`.
   - rasgos(topo, objeto), malla(topo, objeto, filtro), contornoExterior(topo, objeto)
   - trama(opts): patrón de Canvas (rayado) para «estimado», «aproximado», «sin dato».
   - new MapaCanvas(contenedor, opts): mapa grande en Canvas con capas, selección por color oculto,
     capa superior para resaltar, fundido entre fotogramas y HiDPI.
   - miniSVG(rasgos, foco, opts): mini-mapa en SVG (cadena) del término `foco` con su entorno.
   - crearTooltip(): tooltip común (.a2-tooltip). */

import { reduceMotion } from './fmt.js';
import { cargar, rutaDatos } from './data.js';

const temaOscuro = () => getComputedStyle(document.documentElement).colorScheme === 'dark';

const d3g = () => window.d3;
const topo = () => window.topojson;

export function proyeccionAndalucia(geo, ancho, alto, margen = 12) {
  return d3g().geoConicConformal()
    .parallels([36.3, 38.3])
    .rotate([4.6, 0])
    .fitExtent([[margen, margen], [ancho - margen, alto - margen]], geo);
}

/* Algunos recintos llegan con los anillos al revés para d3 (que trabaja en la esfera): entonces el polígono «rellena el
   mundo» menos el recinto. Se detecta por el área (> media esfera) y se invierte el orden de los anillos. */
export function enderezar(f) {
  const d3 = d3g();
  if (!f.geometry) return f;
  if (d3.geoArea(f) > 2 * Math.PI) {
    const inv = poly => poly.map(r => r.slice().reverse());
    if (f.geometry.type === 'Polygon') f.geometry.coordinates = inv(f.geometry.coordinates);
    else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates = f.geometry.coordinates.map(inv);
  }
  if (f.geometry.type === 'MultiPolygon') {
    // por si solo una parte está al revés
    f.geometry.coordinates = f.geometry.coordinates.map(poly => {
      const g = { type: 'Polygon', coordinates: poly };
      return d3.geoArea(g) > 2 * Math.PI ? poly.map(r => r.slice().reverse()) : poly;
    });
  }
  return f;
}
/* Rasgos GeoJSON de un objeto TopoJSON, ya enderezados. */
export function rasgos(t, objeto) {
  return topo().feature(t, t.objects[objeto]).features.map(enderezar);
}
export function malla(t, objeto, filtro) {
  return topo().mesh(t, t.objects[objeto], filtro);
}
/* Solo los arcos exteriores (borde de la región). */
export function contornoExterior(t, objeto) {
  return topo().mesh(t, t.objects[objeto], (a, b) => a === b);
}

/* ---------- Tramas en Canvas ---------- */
const cacheTramas = new Map();
/* opts: { fondo: color o null, linea: color, paso: px, grosor: px, angulo: 45|135|'x' }
   Uso: ctx.fillStyle = trama({ fondo: '#93b3c6', linea: 'rgba(0,0,0,.4)' }); */
export function trama({ fondo = null, linea = 'rgba(0,0,0,.4)', paso = 6, grosor = 1.2, angulo = 135 } = {}) {
  const k = [fondo, linea, paso, grosor, angulo].join('|');
  if (cacheTramas.has(k)) return cacheTramas.get(k);
  const s = paso * 4;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (fondo) { g.fillStyle = fondo; g.fillRect(0, 0, s, s); }
  g.strokeStyle = linea; g.lineWidth = grosor;
  const raya = dir => {
    g.beginPath();
    for (let i = -s; i <= 2 * s; i += paso) {
      if (dir > 0) { g.moveTo(i, 0); g.lineTo(i + s, s); } else { g.moveTo(i, s); g.lineTo(i + s, 0); }
    }
    g.stroke();
  };
  if (angulo === 'x') { raya(1); raya(-1); } else raya(angulo === 45 ? -1 : 1);
  const p = g.createPattern(c, 'repeat');
  cacheTramas.set(k, p);
  return p;
}

/* Trama de puntos (para «en revisión» sobre un color): { fondo, color, paso, radio }. */
export function tramaPuntos({ fondo = null, color = 'rgba(0,0,0,.45)', paso = 6, radio = 1.15 } = {}) {
  const k = ['p', fondo, color, paso, radio].join('|');
  if (cacheTramas.has(k)) return cacheTramas.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = paso;
  const g = c.getContext('2d');
  if (fondo) { g.fillStyle = fondo; g.fillRect(0, 0, paso, paso); }
  g.fillStyle = color; g.beginPath(); g.arc(paso / 2, paso / 2, radio, 0, 2 * Math.PI); g.fill();
  const pat = g.createPattern(c, 'repeat');
  cacheTramas.set(k, pat);
  return pat;
}

/* ---------- Mapa en Canvas ---------- */
/* capas: lista de objetos, en orden de dibujo:
   { tipo: 'poligonos', rasgos, relleno: f => estilo|null, trazo: f => color|null | color, grosor, elegible }
   { tipo: 'malla', geom, trazo, grosor, guiones: [a,b] }
   { tipo: 'puntos', puntos: [{ lon, lat, r, relleno, trazo, dato }], elegible }
   Los elementos elegibles se devuelven en alPasar(dato, evento) / alPinchar(dato, evento):
   para polígonos, el rasgo GeoJSON; para puntos, el objeto punto.
   Rendimiento: cada rasgo y cada malla se proyecta UNA vez por tamaño de mapa y se guarda como Path2D (caché por objeto),
   así que redibujar 800 recintos cuesta solo rellenarlos.
   Transiciones (dibujar({ fundido, transicion })):
     transicion: 'imagen' (por defecto) funde el fotograma anterior con el nuevo;
     transicion: 'color' interpola en Lab el color de cada recinto entre su valor anterior y el nuevo (las capas de
     polígonos deben llevar `id`; los rasgos se casan por `clave(f)`: f.id, properties.c, properties.u o su posición). */
export class MapaCanvas {
  constructor(contenedor, { encaje, alPasar = null, alPinchar = null, margen = 14, etiqueta = 'Mapa' } = {}) {
    this.el = contenedor;
    this.encaje = encaje;
    this.margen = margen;
    this.alPasar = alPasar;
    this.alPinchar = alPinchar;
    this.capas = [];
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.base = document.createElement('canvas');
    this.encima = document.createElement('canvas');
    this.base.setAttribute('role', 'img');
    this.base.setAttribute('aria-label', etiqueta);
    this.encima.setAttribute('aria-hidden', 'true');
    Object.assign(this.encima.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.el.style.position = this.el.style.position || 'relative';
    this.el.append(this.base, this.encima);
    // atribución de las capas de imagen (relieve): visible solo cuando alguna está activa
    this.atrib = document.createElement('p');
    this.atrib.className = 'a2-map__attrib';
    this.atrib.hidden = true;
    this.el.append(this.atrib);
    this.pick = document.createElement('canvas');
    this.fotograma = document.createElement('canvas');
    this.anterior = document.createElement('canvas');
    this.pickIndex = [];
    this._anim = null;
    this._paths = new WeakMap();
    this._colores = new Map();   // id de capa → Map(clave → color) del último dibujo (para transicion 'color')
    this._medir();
    this._ro = new ResizeObserver(() => { if (this._medir()) this.dibujar(); });
    this._ro.observe(this.el);
    this._eventos();
  }

  _medir() {
    const r = this.el.getBoundingClientRect();
    const w = Math.max(50, Math.round(r.width)), h = Math.max(50, Math.round(r.height));
    if (w === this.w && h === this.h) return false;
    this.w = w; this.h = h;
    for (const c of [this.base, this.encima, this.pick, this.fotograma, this.anterior]) {
      c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr);
    }
    this.base.style.width = this.encima.style.width = w + 'px';
    this.base.style.height = this.encima.style.height = h + 'px';
    this.proyeccion = proyeccionAndalucia(this.encaje, w, h, this.margen);
    this._claveProy = `${w}|${h}|${this.proyeccion.scale()}|${this.proyeccion.translate().join(',')}`;
    return true;
  }

  ruta(ctx) { return d3g().geoPath(this.proyeccion, ctx); }

  /* Path2D de un rasgo o geometría, en px CSS, en caché mientras no cambie la proyección. */
  path2d(obj) {
    const c = this._paths.get(obj);
    if (c && c.k === this._claveProy) return c.p;
    if (!this._geoPath || this._geoPathK !== this._claveProy) { this._geoPath = d3g().geoPath(this.proyeccion); this._geoPathK = this._claveProy; }
    const d = this._geoPath(obj);
    const p = new Path2D(d || '');
    this._paths.set(obj, { k: this._claveProy, p });
    return p;
  }

  static clave(f, i) {
    const pr = f.properties || {};
    return f.id ?? pr.c ?? pr.u ?? pr.id ?? i;
  }

  /* Dibuja las capas. fundido (ms): mezcla el fotograma anterior con el nuevo. */
  dibujar({ capas, fundido = 0, transicion = 'imagen' } = {}) {
    if (capas) this.capas = capas;
    if (transicion === 'color') return this._dibujarColor(fundido);
    const atr = [...new Set(this.capas.filter(c => c.tipo === 'imagen' && c.atribucion).map(c => c.atribucion))];
    this.atrib.textContent = atr.join(' · ');
    this.atrib.hidden = !atr.length;
    if (!this.w) return;
    const conFundido = fundido > 0 && !reduceMotion() && this._dibujado;
    if (conFundido) {
      const a = this.anterior.getContext('2d');
      a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, this.anterior.width, this.anterior.height);
      a.drawImage(this.base, 0, 0);
    }
    this._pintar(this.fotograma.getContext('2d'));
    this._pintarPick();
    this._dibujado = true;
    const b = this.base.getContext('2d');
    if (this._anim) cancelAnimationFrame(this._anim);
    if (!conFundido) {
      b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, this.base.width, this.base.height);
      b.drawImage(this.fotograma, 0, 0);
      return;
    }
    const t0 = performance.now();
    const paso = now => {
      const k = Math.min(1, (now - t0) / fundido);
      b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, this.base.width, this.base.height);
      b.globalAlpha = 1; b.drawImage(this.fotograma, 0, 0);
      b.globalAlpha = 1 - k; b.drawImage(this.anterior, 0, 0);
      b.globalAlpha = 1;
      if (k < 1) this._anim = requestAnimationFrame(paso); else this._anim = null;
    };
    this._anim = requestAnimationFrame(paso);
  }

  /* Transición por color: cada recinto pasa de su color anterior al nuevo (interpolación Lab). */
  _dibujarColor(fundido) {
    const atr = [...new Set(this.capas.filter(c => c.tipo === 'imagen' && c.atribucion).map(c => c.atribucion))];
    this.atrib.textContent = atr.join(' · ');
    this.atrib.hidden = !atr.length;
    if (!this.w) return;
    const d3 = d3g();
    const nuevos = new Map(), interp = new Map();
    for (const capa of this.capas) {
      if (capa.tipo !== 'poligonos' || capa.id == null || typeof capa.relleno !== 'function') continue;
      const prev = this._colores.get(capa.id) || new Map();
      const m = new Map(), fi = new Map();
      capa.rasgos.forEach((f, i) => {
        const c = capa.relleno(f);
        const k = MapaCanvas.clave(f, i);
        m.set(k, c);
        const a = prev.get(k);
        if (typeof c === 'string' && typeof a === 'string' && a !== c) fi.set(f, d3.interpolateLab(a, c));
      });
      nuevos.set(capa.id, m); interp.set(capa, fi);
    }
    const anima = fundido > 0 && !reduceMotion() && this._dibujado && [...interp.values()].some(x => x.size);
    this._pintarPick();
    this._dibujado = true;
    for (const [id, m] of nuevos) this._colores.set(id, m);
    if (this._anim) cancelAnimationFrame(this._anim);
    const b = this.base.getContext('2d');
    if (!anima) { this._pintar(b); return; }
    const t0 = performance.now();
    const paso = now => {
      const k = Math.min(1, (now - t0) / fundido);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this._pintar(b, (capa, f, c) => { const fi = interp.get(capa); const g = fi && fi.get(f); return g ? g(e) : c; });
      if (k < 1) this._anim = requestAnimationFrame(paso); else this._anim = null;
    };
    this._anim = requestAnimationFrame(paso);
  }

  _pintar(ctx, mezclaColor = null) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = this.ruta(ctx);
    for (const capa of this.capas) {
      if (capa.tipo === 'poligonos') {
        for (const f of capa.rasgos) {
          let fill = typeof capa.relleno === 'function' ? capa.relleno(f) : capa.relleno;
          if (mezclaColor && fill) fill = mezclaColor(capa, f, fill);
          const extra = capa.trama ? capa.trama(f) : null;
          const stroke = typeof capa.trazo === 'function' ? capa.trazo(f) : capa.trazo;
          if (!fill && !stroke && !extra) continue;
          const p2 = this.path2d(f);
          if (fill) { ctx.fillStyle = fill; ctx.fill(p2); }
          if (extra) { ctx.fillStyle = extra; ctx.fill(p2); }
          if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = typeof capa.grosor === 'function' ? capa.grosor(f) : (capa.grosor || 0.6);
            ctx.stroke(p2);
          }
        }
      } else if (capa.tipo === 'malla') {
        if (!capa.geom) continue;
        ctx.setLineDash(capa.guiones || []);
        ctx.strokeStyle = capa.trazo; ctx.lineWidth = capa.grosor || 1;
        ctx.globalAlpha = capa.alfa == null ? 1 : capa.alfa;
        ctx.stroke(this.path2d(capa.geom));
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      } else if (capa.tipo === 'puntos') {
        for (const p of capa.puntos) {
          const xy = this.proyeccion([p.lon, p.lat]);
          if (!xy) continue;
          ctx.beginPath(); ctx.arc(xy[0], xy[1], p.r || 3, 0, 2 * Math.PI);
          if (p.relleno) { ctx.fillStyle = p.relleno; ctx.fill(); }
          if (p.trazo) { ctx.strokeStyle = p.trazo; ctx.lineWidth = p.grosor || 1; ctx.stroke(); }
        }
      } else if (capa.tipo === 'imagen') {
        // raster en EPSG:4326 reproyectado píxel a píxel a la proyección del mapa (ver Raster)
        if (!capa.raster) continue;
        const lienzo = capa.raster.lienzo(this.proyeccion, this.w, this.h, Math.min(this.dpr, 1.5));
        ctx.save();
        if (capa.recorte) ctx.clip(this.path2d(capa.recorte));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = capa.alfa == null ? 0.4 : capa.alfa;
        ctx.globalCompositeOperation = capa.mezcla === 'auto' || !capa.mezcla ? (temaOscuro() ? 'overlay' : 'multiply') : capa.mezcla;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(lienzo, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      } else if (capa.tipo === 'texto') {
        ctx.font = capa.fuente || '600 11px "Schibsted Grotesk", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const t of capa.textos) {
          const xy = t.xy || this.proyeccion([t.lon, t.lat]);
          if (!xy) continue;
          if (capa.halo) { ctx.strokeStyle = capa.halo; ctx.lineWidth = 3; ctx.strokeText(t.texto, xy[0], xy[1]); }
          ctx.fillStyle = capa.color || '#000'; ctx.fillText(t.texto, xy[0], xy[1]);
        }
      }
    }
  }

  _pintarPick() {
    const ctx = this.pick.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.pick.width, this.pick.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.pickIndex = [null];
    const color = i => `rgb(${i & 255},${(i >> 8) & 255},${(i >> 16) & 255})`;
    for (const capa of this.capas) {
      if (!capa.elegible) continue;
      if (capa.tipo === 'poligonos') {
        for (const f of capa.rasgos) {
          const i = this.pickIndex.push(f) - 1;
          ctx.fillStyle = color(i); ctx.fill(this.path2d(f));
        }
      } else if (capa.tipo === 'puntos') {
        for (const p of capa.puntos) {
          const xy = this.proyeccion([p.lon, p.lat]);
          if (!xy) continue;
          const i = this.pickIndex.push(p) - 1;
          ctx.beginPath(); ctx.arc(xy[0], xy[1], Math.max(6, (p.r || 3) + 3), 0, 2 * Math.PI);
          ctx.fillStyle = color(i); ctx.fill();
        }
      }
    }
  }

  /* El canvas oculto tiene bordes suavizados (mezcla de colores): si el píxel exacto cae en un borde,
     se mira alrededor (hasta 2 px) y se toma el primer píxel limpio. */
  elementoEn(x, y) {
    const ctx = this.pick.getContext('2d', { willReadFrequently: true });
    const r = 2 * Math.ceil(this.dpr);
    const px = Math.round(x * this.dpr), py = Math.round(y * this.dpr);
    const lado = 2 * r + 1;
    const d = ctx.getImageData(px - r, py - r, lado, lado).data;
    const en = (i, j) => {
      const o = ((j + r) * lado + (i + r)) * 4;
      if (d[o + 3] < 255) return null;
      return this.pickIndex[d[o] + (d[o + 1] << 8) + (d[o + 2] << 16)] || null;
    };
    const exacto = en(0, 0);
    if (exacto) return exacto;
    for (let k = 1; k <= r; k++) {
      for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== k) continue;
        const e = en(i, j);
        if (e) return e;
      }
    }
    return null;
  }

  /* Dibujo efímero sobre el mapa (resaltar al pasar, selección). fn(ctx, path, proyeccion). */
  dibujarEncima(fn) {
    const ctx = this.encima.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.encima.width, this.encima.height);
    if (!fn) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineJoin = 'round';
    fn(ctx, this.ruta(ctx), this.proyeccion);
  }

  _eventos() {
    const xy = e => { const r = this.base.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    this.base.addEventListener('pointermove', e => {
      if (!this.alPasar) return;
      const [x, y] = xy(e);
      const el = this.elementoEn(x, y);
      this.base.style.cursor = el ? 'pointer' : 'default';
      this.alPasar(el, e);
    });
    this.base.addEventListener('pointerleave', e => this.alPasar && this.alPasar(null, e));
    this.base.addEventListener('click', e => {
      if (!this.alPinchar) return;
      const [x, y] = xy(e);
      this.alPinchar(this.elementoEn(x, y), e);
    });
  }

  destruir() { this._ro.disconnect(); this.el.innerHTML = ''; }
}

/* ---------- Raster georreferenciado (relieve) ----------
   Imagen en rejilla geográfica (EPSG:4326) con sus límites { west, south, east, north }. Se reproyecta a la
   proyección del mapa recorriendo los píxeles de salida (proyección inversa y vecino más próximo); el resultado se
   guarda mientras no cambien el tamaño ni la proyección. */
export class Raster {
  constructor(imagen, limites) {
    const c = document.createElement('canvas');
    c.width = imagen.naturalWidth || imagen.width; c.height = imagen.naturalHeight || imagen.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(imagen, 0, 0);
    this.sw = c.width; this.sh = c.height;
    this.src = g.getImageData(0, 0, c.width, c.height).data;
    this.lim = limites;
    this._clave = null; this._lienzo = null;
  }
  lienzo(proyeccion, w, h, escala = 1) {
    const W = Math.round(w * escala), H = Math.round(h * escala);
    const clave = [W, H, proyeccion.scale(), ...proyeccion.translate()].join('|');
    if (clave === this._clave) return this._lienzo;
    const c = this._lienzo || document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const out = g.createImageData(W, H);
    const o = out.data, src = this.src, { west, east, south, north } = this.lim;
    const kx = this.sw / (east - west), ky = this.sh / (north - south);
    const inv = 1 / escala;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ll = proyeccion.invert([(x + 0.5) * inv, (y + 0.5) * inv]);
        if (!ll) continue;
        const u = Math.floor((ll[0] - west) * kx), v = Math.floor((north - ll[1]) * ky);
        if (u < 0 || v < 0 || u >= this.sw || v >= this.sh) continue;
        const i = (v * this.sw + u) * 4, j = (y * W + x) * 4;
        o[j] = src[i]; o[j + 1] = src[i + 1]; o[j + 2] = src[i + 2]; o[j + 3] = src[i + 3];
      }
    }
    g.putImageData(out, 0, 0);
    this._clave = clave; this._lienzo = c;
    return c;
  }
}

/* Capa «relieve» lista para MapaCanvas (data/v2/geo/relieve/). tipo: 'sombreado' (relieve_sombreado) o 'tintas'
   (altitud_tintas). Devuelve { tipo: 'imagen', raster, alfa, mezcla: 'auto', atribucion, leyenda }. */
const cacheRelieve = new Map();
export function capaRelieve({ tipo = 'sombreado', alfa = 0.4 } = {}) {
  const id = tipo === 'tintas' ? 'altitud_tintas' : 'relieve_sombreado';
  if (!cacheRelieve.has(id)) {
    cacheRelieve.set(id, (async () => {
      const capas = await cargar('geo/relieve/capas.json');
      const meta = capas.capas[id];
      const img = new Image();
      img.decoding = 'async';
      img.src = rutaDatos(`geo/relieve/${meta.fichero}`);
      await img.decode();
      return { raster: new Raster(img, meta.limites), meta };
    })());
  }
  return cacheRelieve.get(id).then(({ raster, meta }) => ({
    tipo: 'imagen', raster, alfa: Math.max(0.3, Math.min(0.5, alfa)), mezcla: 'auto',
    atribucion: meta.atribucion, leyenda: meta.leyenda || null, queEs: meta.que_es,
  }));
}

/* ---------- Mini-mapa SVG ----------
   contexto: rasgos que se dibujan de fondo (gris); foco: rasgo o lista de rasgos resaltados.
   opts: { ancho, alto, zoom (1 = solo el foco; 3 = foco con su entorno), clase, relleno, rellenoFondo } */
export function miniSVG(contexto, foco, { ancho = 120, alto = 100, zoom = 2.6, titulo = '', relleno = 'var(--a2-accent)', rellenoFondo = 'var(--a2-seq-1)', trazo = 'var(--a2-surface)', marca = null } = {}) {
  const d3 = d3g();
  const focos = Array.isArray(foco) ? foco : [foco];
  const fc = { type: 'FeatureCollection', features: focos };
  const pr = d3.geoConicConformal().parallels([36.3, 38.3]).rotate([4.6, 0]).fitExtent([[6, 6], [ancho - 6, alto - 6]], fc);
  // alejar alrededor del centro para ver el entorno
  const [cx, cy] = [ancho / 2, alto / 2];
  pr.scale(pr.scale() / zoom);
  const t = pr.translate();
  const c = d3.geoPath(pr).centroid(fc);
  pr.translate([t[0] + (cx - c[0]), t[1] + (cy - c[1])]);
  const path = d3.geoPath(pr);
  const [[x0, y0], [x1, y1]] = [[-ancho * .2, -alto * .2], [ancho * 1.2, alto * 1.2]];
  const visibles = contexto.filter(f => {
    const b = path.bounds(f);
    return b[1][0] >= x0 && b[0][0] <= x1 && b[1][1] >= y0 && b[0][1] <= y1;
  });
  const ids = new Set(focos);
  const fondo = visibles.filter(f => !ids.has(f)).map(f => `<path d="${path(f)}" fill="${rellenoFondo}" stroke="${trazo}" stroke-width=".6"/>`).join('');
  const frente = focos.map(f => `<path d="${path(f)}" fill="${relleno}" stroke="${trazo}" stroke-width=".8"/>`).join('');
  let marcaSvg = '';
  if (marca) {
    const p = pr(marca);
    if (p) marcaSvg = `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="var(--a2-ink)" stroke="var(--a2-surface)" stroke-width="1.2"/>`;
  }
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img" aria-label="${titulo.replace(/"/g, '&quot;')}">${fondo}${frente}${marcaSvg}</svg>`;
}

/* ---------- Tooltip común ---------- */
export function crearTooltip() {
  const el = document.createElement('div');
  el.className = 'a2-tooltip';
  el.setAttribute('role', 'status');
  document.body.append(el);
  return {
    el,
    mostrar(html, x, y) {
      el.innerHTML = html;
      el.dataset.show = 'true';
      const r = el.getBoundingClientRect();
      let left = x + 14, top = y + 14;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      el.style.left = Math.max(8, left) + 'px';
      el.style.top = Math.max(8, top) + 'px';
    },
    ocultar() { el.dataset.show = 'false'; },
  };
}
