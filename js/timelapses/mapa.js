// mapa.js — lienzo (Canvas) con los 785 recintos de hoy precalculados como Path2D.
// Pinta un color por recinto, la trama de «estimado» y la de «sin dato», bordes de provincia o de grupo,
// y responde a «¿qué recinto hay bajo el puntero?». No dibuja fronteras propias: solo las del TopoJSON.

/* global d3, topojson */

import { proyeccionAndalucia, trama } from '../atlas2/mapa.js';
import { token } from '../atlas2/fmt.js';

const DPR_MAX = 2;

// color con poca saturación y algo más claro: lo que está en revisión no compite con lo firme
function desatura(c) {
  const h = d3.hsl(c);
  if (!isFinite(h.s)) return c;
  h.s *= 0.25; h.l = h.l * 0.7 + 0.22;
  return h.formatHex();
}
// suma parcial con la calidad encendida: el color, a medio camino del gris (no se lee como un total)
function suaviza(c) {
  const h = d3.hsl(c);
  if (!isFinite(h.s)) return c;
  h.s *= 0.55; h.l = h.l * 0.82 + 0.12;
  return h.formatHex();
}
// trama de puntos (para «en revisión»); no existe en las tramas comunes, que son de rayas
function puntos(color, dpr) {
  const s = Math.round(6 * dpr);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.beginPath(); x.arc(s / 2, s / 2, 1.15 * dpr, 0, 2 * Math.PI); x.fill();
  return c.getContext('2d').createPattern(c, 'repeat');
}

// d3 entiende los polígonos en sentido horario; si un anillo viene al revés, d3 lo toma como «todo el globo
// menos este recinto» y lo pinta sobre todo el lienzo. Se invierte el orden de los anillos que lo necesitan.
export function rebobina(f) {
  const g = f.geometry || f;
  if (!g || !g.coordinates) return f;
  const fix = poly => {
    if (d3.geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI) poly.forEach(r => r.reverse());
  };
  if (g.type === 'Polygon') fix(g.coordinates);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(fix);
  return f;
}

export class MapaCanvas {
  constructor(canvas, { onHover, onLeave, onClick } = {}) {
    this.onClick = onClick;
    this.extra = new Map();     // capas de dibujo encima: id → fn(ctx, path, proj, feats)
    this.seleccion = new Set(); // ids con contorno de selección
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onHover = onHover;
    this.onLeave = onLeave;
    this.feats = [];        // [{c, n, p, path, f}]
    this.byCode = new Map();
    this.meshProv = null;   // Path2D
    this.meshGroup = null;  // Path2D (p. ej., partidos o unidades estables)
    this.outline = null;    // Path2D
    this.groupFn = null;
    this.fills = null;      // función (feat) -> {color, est, nd}
    this.highlight = null;  // código resaltado
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement);
    this._bindPointer();
  }

  setGeo(topo) {
    if (this.topo === topo) return;
    this.topo = topo;
    const obj = topo.objects.municipios;
    this.geomMuni = obj;
    this.fc = topojson.feature(topo, obj);
    this.fc.features.forEach(rebobina);
    this.provMesh = topo.objects.provincias
      ? topojson.mesh(topo, topo.objects.provincias, (a, b) => a !== b)
      : topojson.mesh(topo, obj, (a, b) => a !== b && a.properties.p !== b.properties.p);
    this.outlineGeo = topo.objects.andalucia
      ? topojson.feature(topo, topo.objects.andalucia)
      : topojson.merge(topo, obj.geometries);
    (this.outlineGeo.features || [this.outlineGeo]).forEach(rebobina);
    this.resize();
  }

  // Bordes interiores entre grupos (fn: código INE -> id de grupo). null para quitarlos.
  setGroups(fn) {
    this.groupFn = fn;
    if (!fn || !this.topo) { this.groupMeshGeo = null; this.meshGroup = null; this.draw(); return; }
    this.groupMeshGeo = topojson.mesh(this.topo, this.geomMuni, (a, b) => {
      if (a === b) return false;
      const ga = fn(a.properties.c), gb = fn(b.properties.c);
      return ga !== gb;
    });
    this._project();
    this.draw();
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this._dprTope || DPR_MAX);
    this.w = box.width; this.h = box.height; this.dpr = dpr;
    this.canvas.width = Math.round(box.width * dpr);
    this.canvas.height = Math.round(box.height * dpr);
    this.canvas.style.width = box.width + 'px';
    this.canvas.style.height = box.height + 'px';
    this._project();
    this._patterns();
    this.draw();
  }

  _project() {
    if (!this.fc || !this.w) return;
    const pad = Math.max(8, Math.min(this.w, this.h) * 0.04);
    const ins = this.insets || { top: 0, right: 0, bottom: 0, left: 0 };
    // misma proyección que el resto del atlas (cónica conforme de js/atlas2/mapa.js)
    const proj = proyeccionAndalucia(this.outlineGeo, this.w, this.h, pad);
    if (this.modo4) proj.precision(0);   // las geometrías ya son densas: sin remuestreo, proyectar va varias veces más rápido
    if (ins.top || ins.right || ins.bottom || ins.left) {
      proj.fitExtent([[pad + ins.left, pad + ins.top], [this.w - pad - ins.right, this.h - pad - ins.bottom]], this.outlineGeo);
    }
    // ampliar y mover (visor v4): la vista {k, x, y} se aplica sobre el encaje; se reproyecta todo, de modo que el ancho de
    // los trazos sigue en píxeles de pantalla (no engorda al ampliar) y el puntero, la selección y los rótulos siguen igual
    this.base = { s: proj.scale(), t: proj.translate(), b: d3.geoPath(proj).bounds(this.outlineGeo) };
    this.vista = this._limita(this.vista || { k: 1, x: 0, y: 0 });
    const v = this.vista;
    if (v.k !== 1 || v.x || v.y) proj.scale(this.base.s * v.k).translate([this.base.t[0] * v.k + v.x, this.base.t[1] * v.k + v.y]);
    this.proj = proj;
    const gp = d3.geoPath(proj), gpC = d3.geoPath(proj);
    const trazado = geo => { const q = new Path2D(); gpC.context(q)(geo); return q; };   // directo al trazado, sin pasar por texto
    const capa = this.capa;
    if (capa) {
      // otra geometría (p. ej., los términos candidatos de 1752): mismos encaje y proyección que los municipios de hoy
      if (!capa._fc) { capa._fc = topojson.feature(capa.topo, capa.topo.objects[capa.objeto]); capa._fc.features.forEach(rebobina); }
      // cada corte se proyecta una vez por encuadre: en el timelapse los cortes vuelven y no se recalculan
      const kP = proj.scale() + '|' + proj.translate().join(',');
      if (capa._px && capa._px.k === kP) this.feats = capa._px.feats;
      else {
        this.feats = capa._fc.features.map(f => {
          const pr = f.properties || {};
          const id = String(capa.idDe ? capa.idDe(pr) : pr[capa.id]);
          const pz = pr.pz || [];
          const p = pr.p || pr.pv || (pz.length ? String(pz[0]).slice(0, 2) : null);
          return { c: id, n: pr.n, p, props: pr, f, path: trazado(f) };
        });
        capa._px = { k: kP, feats: this.feats };
      }
    } else {
      this.feats = this.fc.features.map(f => ({ c: f.properties.c, n: f.properties.n, p: f.properties.p, f, path: trazado(f) }));
    }
    this.byCode = new Map(this.feats.map(d => [d.c, d]));
    this.meshProv = trazado(this.provMesh);
    this.outline = trazado(this.outlineGeo);
    this.meshGroup = this.groupMeshGeo ? new Path2D(gp(this.groupMeshGeo) || '') : null;
  }

  setInsets(ins) { this.insets = ins; this._project(); this.draw(); }

  // capa: null (municipios de hoy) o {clave, topo, objeto, id}. Devuelve true si ha cambiado la geometría.
  usaCapa(capa) {
    const k = capa ? capa.clave : null;
    if (k === (this.capa ? this.capa.clave : null)) return false;
    this.capa = capa || null;
    this._project();
    return true;
  }

  // Tramas comunes del atlas (js/atlas2/mapa.js): estimado = rayado fino sobre el color del dato;
  // sin dato = gris neutro con trama cruzada (nunca el color más bajo de la escala).
  _patterns() {
    this.patNd = trama({ fondo: token('--a2-nodata'), linea: token('--a2-nodata-line'), angulo: 'x' });
    this.patEst = trama({ fondo: null, linea: token('--a2-est-line'), paso: 5, grosor: 1.1 });
    this.patRes = puntos(token('--a2-ochre') || '#c98a1b', this.dpr);
    // «sin dato a este nivel» (la fuente no da la cifra a este nivel): fondo neutro con rayas sueltas, distinta del cruzado
    // parcialmente estimado (solo agregados): rayado más ralo y más claro que el de estimado
    this.patEst4 = trama({ fondo: null, linea: token('--a2-est4-line') || 'rgba(0,0,0,.22)', paso: 9, grosor: 0.9 });
    this.patSn = trama({ fondo: token('--a2-nivel') || token('--a2-nodata'), linea: token('--a2-nivel-line') || token('--a2-nodata-line'), paso: 7, grosor: 1, angulo: 45 });
  }

  refreshTheme() { this._patterns(); this.draw(); }

  // fills: lista alineada con this.feats, cada elemento {color, est:boolean, nd:boolean}
  setFills(arr) { this.fills = arr; this.draw(); }

  draw() {
    const { ctx } = this;
    if (!ctx || !this.w) return;
    if (this._snap) { this._dibujaSnap(); return; }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.feats.length) return;
    const stroke = token('--a2-map-stroke') || 'rgba(255,255,255,.8)';
    const ink = token('--a2-map-outline') || '#13171b';
    const base = token('--a2-surface-2') || '#ccc';
    const fills = this.fills;
    const est = [], est4 = [], res = [], parc = [], resZona = [];
    // visor v4: sin tramas de calidad salvo que se pida («Señalar la calidad del dato»); con ella, degradados suaves
    if (this.modo4) {
      const papel = token('--a2-bg') || '#f8f6f0';
      this._pintaFills(fills, base, papel, res, resZona, parc);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this._cF, 0, 0); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._parc = this.calidad ? parc : [];
    } else
    for (let k = 0; k < this.feats.length; k++) {
      const d = this.feats[k];
      const r = fills ? fills[k] : null;
      if (r && r.res) res.push(d);
      if (!r || r.nd) { ctx.fillStyle = r && r.sn && this.patSn ? this.patSn : this.patNd; ctx.fill(d.path); continue; }
      if (r.parcial) {
        // suma parcial: el color de su cifra, apagado sobre el fondo neutro (no se lee como un total) y borde discontinuo
        ctx.fillStyle = token('--a2-nivel') || base; ctx.fill(d.path);
        ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = r.res ? desatura(r.color || base) : (r.color || base); ctx.fill(d.path); ctx.restore();
        parc.push(d);
      } else {
        ctx.fillStyle = r.res ? desatura(r.color || base) : (r.color || base);
        ctx.fill(d.path);
      }
      if (r.est) est.push(d);
      else if (r.est4) est4.push(d);
    }
    if (est.length) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = this.patEst;
      for (const d of est) ctx.fill(d.path);
      ctx.restore();
    }
    if (est4.length && this.patEst4) {
      ctx.save();
      ctx.fillStyle = this.patEst4;
      for (const d of est4) ctx.fill(d.path);
      ctx.restore();
    }
    if (!this.modo4) this._parc = parc;
    // «en revisión» (reservas): color desaturado + puntos ocres, distinto del rayado de estimado
    if (res.length && !this.modo4) {
      ctx.save();
      ctx.fillStyle = this.patRes;
      for (const d of res) ctx.fill(d.path);
      ctx.restore();
    }
    // las líneas no cambian con el año: en el visor v4 van en su propia capa y solo se redibujan si cambia el encuadre
    if (this.modo4) { this._pintaTrazos(stroke, ink); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this._cT, 0, 0); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
    else this._trazos(ctx, stroke, ink);
    ctx.strokeStyle = ink;
    // borde discontinuo de las sumas parciales
    if (this._parc && this._parc.length) {
      ctx.save();
      // por dentro del recinto (recortado), para que la línea de provincia no la tape
      ctx.strokeStyle = token('--a2-parcial-line') || ink; ctx.lineWidth = 4; ctx.setLineDash([6, 4]);
      for (const d of this._parc) { ctx.save(); ctx.clip(d.path); ctx.stroke(d.path); ctx.restore(); }
      ctx.restore();
    }
    // reserva en el modo v4: solo el contorno del conjunto reservado (no cada celda), en ocre; más fino con la calidad apagada
    if (this.modo4 && (res.length || resZona.length)) {
      const borde = this._bordeConjunto(new Set([...res, ...resZona].map(d => String(d.c))));
      if (borde) {
        ctx.save(); ctx.strokeStyle = token('--a2-ochre') || '#b07d1a'; ctx.lineWidth = this.calidad ? 2 : 1.4; ctx.lineJoin = 'round';
        ctx.stroke(borde); ctx.restore();
      }
    }
    // borde de la zona con reserva (entre provincias con y sin reserva)
    const zona = this.modo4 ? [] : res;
    if (zona.length) {
      const res = zona;
      const borde = this._bordeReserva(new Set(res.map(d => d.p)));
      if (borde) {
        ctx.save();
        ctx.strokeStyle = token('--a2-ochre') || '#c98a1b';
        ctx.lineWidth = this.modo4 && !this.calidad ? 1.2 : 2; ctx.setLineDash(this.modo4 && !this.calidad ? [] : [5, 3]);
        ctx.stroke(borde);
        ctx.restore();
      }
    }
    if (this.highlight) {
      const h = this.byCode.get(this.highlight);
      const g = (!this.capa && this.groupFn) ? this.groupFn(this.highlight) : null;
      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      if (g != null) {
        for (const d of this.feats) if (this.groupFn(d.c) === g) ctx.stroke(d.path);
      } else if (h) ctx.stroke(h.path);
      ctx.restore();
    }
    if (this.seleccion.size) {
      ctx.save();
      // borde blanco ancho y, encima, el color de su chip (o la tinta si no tiene)
      ctx.lineJoin = 'round';
      ctx.strokeStyle = token('--a2-bg') || '#fff'; ctx.lineWidth = 4.2;
      for (const d of this.feats) if (this.seleccion.has(d.c)) ctx.stroke(d.path);
      for (const d of this.feats) if (this.seleccion.has(d.c)) {
        ctx.strokeStyle = (this.selColor && this.selColor.get(String(d.c))) || ink; ctx.lineWidth = 2.4;
        ctx.stroke(d.path);
      }
      ctx.restore();
    }
    if (this.extra.size) {
      const path = d3.geoPath(this.proj, ctx);
      for (const fn of this.extra.values()) { ctx.save(); try { fn(ctx, path, this.proj, this.feats); } catch (e) { console.error(e); } ctx.restore(); }
    }
  }

  // ---------- capas del visor v4: los colores se repintan solo en las unidades que cambian; las líneas, solo con otro encuadre
  _capa(n) {
    const W = this.canvas.width, H = this.canvas.height;
    if (!this[n] || this[n].width !== W || this[n].height !== H) { this[n] = document.createElement('canvas'); this[n].width = W; this[n].height = H; return true; }
    return false;
  }
  _pintaFills(fills, base, papel, res, resZona, parc) {
    if (this._capa('_cF')) this._fk = null;
    const x = this._cF.getContext('2d'), n = this.feats.length;
    const todo = !this._fk || this._fkP !== this.proj || this._fkF !== this.feats || this._fkT !== this.patNd || this._fkC !== !!this.calidad;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (todo) { x.clearRect(0, 0, this.w, this.h); this._fk = new Array(n); this._fkP = this.proj; this._fkF = this.feats; this._fkT = this.patNd; this._fkC = !!this.calidad; }
    let cambios = 0;
    x.lineJoin = 'round'; x.lineWidth = 0.7;
    for (let k = 0; k < n; k++) {
      const d = this.feats[k], r = fills ? fills[k] : null, nd = !r || r.nd;
      if (!nd) { if (r.res) (r.resZona ? resZona : res).push(d); if (r.parcial) parc.push(d); }
      const clave = nd ? (r && r.sn ? 'sn' : 'nd') : `${r.color || ''}|${this.calidad ? (r.res ? 1 : 0) + (r.parcial ? 2 : 0) + (r.est ? 4 : 0) + (r.est4 ? 8 : 0) : 0}`;
      if (this._fk[k] === clave) continue;
      const habia = this._fk[k] !== undefined;
      this._fk[k] = clave; cambios++;
      if (nd) {
        if (habia) { x.fillStyle = papel; x.fill(d.path); }
        x.fillStyle = r && r.sn && this.patSn ? this.patSn : this.patNd; x.fill(d.path);
        if (habia) { x.strokeStyle = papel; x.stroke(d.path); }
        continue;
      }
      let col = r.color || base, alfa = 1;
      if (this.calidad) {
        if (r.res) col = desatura(col);
        else if (r.parcial) col = suaviza(col);
        if (r.est) alfa = 0.48; else if (r.est4) alfa = 0.74;
      }
      if (alfa < 1) { x.fillStyle = papel; x.fill(d.path); x.globalAlpha = alfa; }
      x.fillStyle = col; x.fill(d.path); x.globalAlpha = 1;
      if (habia && alfa === 1) { x.strokeStyle = col; x.stroke(d.path); }   // sin halo del color anterior en el borde
    }
    // al pararse, una pasada limpia
    if (cambios && !todo) { clearTimeout(this._tLimpio); this._tLimpio = setTimeout(() => this.limpia(), 1400); }
  }
  limpia() { clearTimeout(this._tLimpio); if (!this.canvas.isConnected) return; this._fk = null; this.draw(); }
  // resolución del lienzo mientras se reproduce en un teléfono (menos píxeles por fotograma); no toca la geometría
  setDprTope(v) {
    if ((this._dprTope || null) === (v || null) || !this.w) { this._dprTope = v; return; }
    this._dprTope = v;
    const dpr = Math.min(window.devicePixelRatio || 1, v || DPR_MAX);
    if (dpr === this.dpr) return;
    this.dpr = dpr; this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this._patterns(); this._fk = null; this.draw();
  }
  _pintaTrazos(stroke, ink) {
    const nueva = this._capa('_cT'), grupo = this.capa ? null : this.meshGroup;
    const clave = [this.dpr, stroke, ink, this.capa ? this.capa.clave : '', this.bordeFeat || '', !!this.bordes, !!this.limMun, !!this.sinProv].join('|');
    if (!nueva && this._tK === clave && this._tP === this.proj && this._tG === grupo && this._tF === this.feats) return;
    this._tK = clave; this._tP = this.proj; this._tG = grupo; this._tF = this.feats;
    const x = this._cT.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this._cT.width, this._cT.height);
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._trazos(x, stroke, ink);
  }
  _trazos(x, stroke, ink) {
    x.lineJoin = 'round';
    x.strokeStyle = this.bordeFeat || stroke;
    const grupo = this.capa ? null : this.meshGroup;
    x.globalAlpha = this.bordeFeat ? 1 : grupo ? 0.45 : (this.capa ? 0.95 : 0.7);
    x.lineWidth = 0.4;
    // visor v4: en los términos de cada fecha, el borde según el estado del límite (js/visor4/limites.js)
    if (this.bordes && this.capa) { x.globalAlpha = 1; this.bordes(x, this.proj, this.bordeFeat || stroke); }
    else for (const d of this.feats) x.stroke(d.path);
    x.globalAlpha = 1;
    if (grupo) {
      x.strokeStyle = ink; x.globalAlpha = 0.55; x.lineWidth = 0.7;
      x.stroke(this.meshGroup);
    }
    x.strokeStyle = ink;
    // visor v4, «Fondo»: límites de los municipios de hoy (encima de cualquier unidad) y, si no se quitan, los provinciales
    if (this.limMun && this.topo && this.geomMuni) {
      if (!this.meshMuni || this.meshMuniK !== this.proj) { this.meshMuni = new Path2D(d3.geoPath(this.proj)(topojson.mesh(this.topo, this.geomMuni, (a, b) => a !== b)) || ''); this.meshMuniK = this.proj; }
      x.globalAlpha = 0.5; x.lineWidth = 0.45; x.stroke(this.meshMuni);
    }
    if (!this.sinProv) { x.globalAlpha = this.bordeFeat ? 0.32 : 0.6; x.lineWidth = this.bordeFeat ? 0.8 : 1; x.stroke(this.meshProv); }
    x.globalAlpha = 0.9; x.lineWidth = 1.3; x.stroke(this.outline);
    x.globalAlpha = 1;
  }

  setSeleccion(ids) { this.seleccion = new Set((ids || []).map(String)); this.draw(); }
  capaEncima(id, fn) { if (fn) this.extra.set(id, fn); else this.extra.delete(id); this.draw(); }

  // contorno de un conjunto de recintos (ids): las líneas entre un recinto del conjunto y otro que no lo es, y la costa o
  // la raya exterior de los del conjunto. Vale para municipios de hoy y para cualquier capa (términos, partidos…).
  _bordeConjunto(ids) {
    const capa = this.capa;
    const topo = capa ? capa.topo : this.topo, obj = capa ? topo.objects[capa.objeto] : this.geomMuni;
    if (!topo || !obj) return null;
    const idDe = g => String(capa ? (capa.idDe ? capa.idDe(g.properties || {}) : (g.properties || {})[capa.id]) : g.properties.c);
    // la clave lleva la proyección entera (encaje, márgenes y zoom): si no, el borde se queda en la de antes y se sale del mapa
    const key = (capa ? capa.clave : 'hoy') + '|' + [...ids].sort().join(',') + '|' + this.proj.scale() + '|' + this.proj.translate().join(',');
    if (this._conjKey === key) return this._conj;
    // en el timelapse los mismos conjuntos vuelven una y otra vez: se guardan los últimos para no recalcular la malla
    this._conjM = this._conjM || new Map();
    if (this._conjM.has(key)) { this._conj = this._conjM.get(key); this._conjKey = key; return this._conj; }
    const en = g => ids.has(idDe(g));
    const geo = topojson.mesh(topo, obj, (a, b) => (a === b ? en(a) : en(a) !== en(b)));
    this._conj = new Path2D(d3.geoPath(this.proj)(geo) || '');
    this._conjKey = key;
    this._conjM.set(key, this._conj);
    if (this._conjM.size > 48) this._conjM.delete(this._conjM.keys().next().value);
    return this._conj;
  }

  _bordeReserva(provs) {
    const key = [...provs].sort().join(',') + '|' + this.proj.scale() + '|' + this.proj.translate().join(',');   // misma razón
    if (this._bordeKey === key) return this._borde;
    const geo = topojson.mesh(this.topo, this.geomMuni, (a, b) => a !== b && provs.has(a.properties.p) !== provs.has(b.properties.p));
    this._borde = new Path2D(d3.geoPath(this.proj)(geo) || '');
    this._bordeKey = key;
    return this._borde;
  }

  // ---------- ampliar y mover
  _limita(v) {
    const k = Math.max(1, Math.min(16, v.k || 1));
    if (!this.base || !this.w) return { k, x: v.x || 0, y: v.y || 0 };
    const ins = this.insets || { top: 0, right: 0, bottom: 0, left: 0 };
    const cx = ins.left + (this.w - ins.left - ins.right) / 2, cy = ins.top + (this.h - ins.top - ins.bottom) / 2;
    const [[x0, y0], [x1, y1]] = this.base.b;
    // el centro del hueco del mapa siempre cae dentro del recuadro de Andalucía ampliado
    const lim = (val, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), val));
    return { k, x: k === 1 && !v.x ? 0 : lim(v.x || 0, cx - k * x1, cx - k * x0), y: k === 1 && !v.y ? 0 : lim(v.y || 0, cy - k * y1, cy - k * y0) };
  }
  get ampliado() { return !!(this.vista && (this.vista.k > 1.001 || Math.abs(this.vista.x) > 0.5 || Math.abs(this.vista.y) > 0.5)); }
  _gesto(nv, { ya = false } = {}) {
    if (!this.w) return;
    nv = this._limita(nv);
    if (!this._snap) {
      const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height;
      c.getContext('2d').drawImage(this.canvas, 0, 0);
      this._snap = c; this._v0 = { ...this.vista };
    }
    this.vista = nv;
    this._dibujaSnap();
    clearTimeout(this._tg);
    const fin = () => { this._snap = null; this._project(); this.draw(); if (this.onVista) this.onVista(this.vista); };
    if (ya) fin(); else this._tg = setTimeout(fin, 150);
  }
  _dibujaSnap() {
    const { ctx } = this, v0 = this._v0, v = this.vista, r = v.k / v0.k, d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(r, 0, 0, r, (v.x - r * v0.x) * d, (v.y - r * v0.y) * d);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._snap, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  // ampliar k veces alrededor de un punto de la pantalla (px del lienzo)
  zoomPor(f, cx = this.w / 2, cy = this.h / 2, op) {
    const v = this.vista || { k: 1, x: 0, y: 0 }, k1 = Math.max(1, Math.min(16, v.k * f));
    this._gesto({ k: k1, x: cx - k1 * (cx - v.x) / v.k, y: cy - k1 * (cy - v.y) / v.k }, op);
  }
  moverPor(dx, dy, op) { const v = this.vista || { k: 1, x: 0, y: 0 }; this._gesto({ k: v.k, x: v.x + dx, y: v.y + dy }, op); }
  encuadra() { this._gesto({ k: 1, x: 0, y: 0 }, { ya: true }); }

  hit(x, y) {
    if (this._snap) return null;
    const { ctx } = this;
    if (this.hitExtra) { const e = this.hitExtra(x, y); if (e) return e; }   // p. ej., una burbuja (visor v4)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const d of this.feats) if (ctx.isPointInPath(d.path, x * this.dpr, y * this.dpr)) return d;
    return null;
  }

  _bindPointer() {
    let raf = 0, last = null;
    const move = (ev) => {
      last = ev;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = this.canvas.getBoundingClientRect();
        const x = last.clientX - r.left, y = last.clientY - r.top;
        const d = this.hit(x, y);
        const code = d ? d.c : null;
        if (code !== this.highlight) { this.highlight = code; this.draw(); }
        if (d) this.onHover && this.onHover(d, last.clientX, last.clientY);
        else this.onLeave && this.onLeave();
      });
    };
    const ptrs = new Map();
    let ini = null, movido = false;
    const local = ev => { const r = this.canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    const dist = () => { const p = [...ptrs.values()]; return p.length < 2 ? 0 : Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); };
    const medio = () => { const p = [...ptrs.values()]; return p.length < 2 ? p[0] : [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]; };
    this.canvas.addEventListener('pointerdown', (ev) => {
      move(ev);
      if (!this.mover || ev.button > 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;   // Ctrl/Mayús + clic: seleccionar
      ptrs.set(ev.pointerId, local(ev));
      ini = { p: medio(), d: dist(), v: { ...(this.vista || { k: 1, x: 0, y: 0 }) } };
      movido = false;
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      if (ptrs.has(ev.pointerId) && ini) {
        ptrs.set(ev.pointerId, local(ev));
        const m = medio(), d = dist();
        if (!movido && Math.hypot(m[0] - ini.p[0], m[1] - ini.p[1]) < 4 && !(ini.d && Math.abs(d - ini.d) > 4)) return;
        if (!movido) { movido = true; try { this.canvas.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ } this.canvas.classList.add('is-moviendo'); if (this.onLeave) this.onLeave(); }
        const v0 = ini.v;
        let k = v0.k, x = v0.x, y = v0.y;
        if (ptrs.size === 2 && ini.d) {   // pellizco: amplía alrededor del punto medio inicial y sigue al punto medio
          k = Math.max(1, Math.min(16, v0.k * d / ini.d));
          x = ini.p[0] - k * (ini.p[0] - v0.x) / v0.k; y = ini.p[1] - k * (ini.p[1] - v0.y) / v0.k;
        }
        this._gesto({ k, x: x + m[0] - ini.p[0], y: y + m[1] - ini.p[1] });
        return;
      }
      move(ev);
    });
    const suelta = (ev) => {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.delete(ev.pointerId);
      if (movido) { this._arrastre = true; this.canvas.classList.remove('is-moviendo'); }
      if (ptrs.size) ini = { p: medio(), d: dist(), v: { ...this.vista } }; else ini = null;
    };
    this.canvas.addEventListener('pointerup', suelta);
    this.canvas.addEventListener('pointercancel', suelta);
    this.canvas.addEventListener('wheel', (ev) => {
      if (!this.mover) return;
      ev.preventDefault();
      const [x, y] = local(ev);
      this.zoomPor(Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0018)), x, y);
    }, { passive: false });
    this.canvas.addEventListener('dblclick', (ev) => {
      if (!this.mover) return;
      clearTimeout(this._tclic);
      const [x, y] = local(ev);
      this.zoomPor(ev.shiftKey ? 0.5 : 2, x, y, { ya: true });
    });
    this.canvas.addEventListener('click', (ev) => {
      if (!this.onClick) return;
      if (this._arrastre) { this._arrastre = false; return; }   // al terminar de mover no se abre nada
      const go = () => {
        const r = this.canvas.getBoundingClientRect();
        const d = this.hit(ev.clientX - r.left, ev.clientY - r.top);
        if (d) this.onClick(d, ev);
      };
      if (!this.mover) { go(); return; }
      // con el mapa móvil, un doble clic acerca: el clic sencillo espera un momento por si llega el segundo
      clearTimeout(this._tclic);
      if (ev.detail >= 2) return;
      this._tclic = setTimeout(go, 240);
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (ini) return;
      this.highlight = null; this.draw(); this.onLeave && this.onLeave();
    });
  }
}
