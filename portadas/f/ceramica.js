// Portada F · velo de cerámica que se revela alrededor del cursor.
//
// Motivos de dibujo propio, inspirados en la loza de Fajalauza (azul cobalto y verde sobre blanco) y en la lacería
// nazarí: granada, rama de olivo, espiga y estrella de ocho puntas entrelazada. No copian ninguna pieza ni diseño, y no
// son una reproducción histórica. Su sitio sobre el mapa es una retícula regular: es decoración y no indica nada.
// Las líneas del mapa sí son reales: los términos municipales de hoy, las provincias, el contorno y los ríos del Atlas.

export const COBALTO = "#1b3f96";
export const VERDE = "#2b7a4b";
export const BLANCO = "#fbfaf4";

// ---------- Piezas de dibujo (coordenadas unidad: el motivo cabe en un círculo de radio 1) ----------
function hoja(c, x0, y0, x1, y1, a, color) {
  const dx = x1 - x0, dy = y1 - y0, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -dy, ny = dx;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(mx + nx * a, my + ny * a, x1, y1);
  c.quadraticCurveTo(mx - nx * a, my - ny * a, x0, y0);
  c.fill();
  c.strokeStyle = BLANCO;
  c.lineWidth = 0.016;
  c.beginPath();
  c.moveTo(x0 + dx * 0.14, y0 + dy * 0.14);
  c.lineTo(x0 + dx * 0.84, y0 + dy * 0.84);
  c.stroke();
}

// Dos cuadrados girados 45° cuyas cintas pasan alternativamente por encima y por debajo en cada cruce.
// `fondo`: color con el que se abre el hueco del cruce; sin él, el hueco se borra (lienzo transparente).
function estrellaLazo(c, R, ancho, color, fondo) {
  const vertices = (fase) => [0, 1, 2, 3].map((k) => [R * Math.cos(fase + k * Math.PI / 2), R * Math.sin(fase + k * Math.PI / 2)]);
  const cuadrado = (p) => {
    c.beginPath();
    p.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.stroke();
  };
  c.save();
  c.strokeStyle = color;
  c.lineWidth = ancho;
  c.lineJoin = "miter";
  cuadrado(vertices(Math.PI / 4));
  cuadrado(vertices(0));
  const rc = R * Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8), l = ancho * 1.5;
  for (let k = 0; k < 8; k++) {
    const th = Math.PI / 8 + k * Math.PI / 4, x = rc * Math.cos(th), y = rc * Math.sin(th);
    const normal = k % 2 === 0 ? (k / 2) * Math.PI / 2 : Math.PI / 4 + Math.floor(k / 2) * Math.PI / 2;
    const dx = Math.cos(normal + Math.PI / 2) * l, dy = Math.sin(normal + Math.PI / 2) * l;
    c.save();
    c.lineCap = "butt";
    if (fondo) c.strokeStyle = fondo; else c.globalCompositeOperation = "destination-out";
    c.lineWidth = ancho * 1.9;
    c.beginPath(); c.moveTo(x - dx, y - dy); c.lineTo(x + dx, y + dy); c.stroke();
    c.restore();
    c.lineCap = "butt";
    c.beginPath(); c.moveTo(x - dx * 1.2, y - dy * 1.2); c.lineTo(x + dx * 1.2, y + dy * 1.2); c.stroke();
  }
  c.restore();
}

function granada(c) {
  // Tallo y hojas
  c.strokeStyle = VERDE;
  c.lineWidth = 0.05;
  c.lineCap = "round";
  c.beginPath(); c.moveTo(0, 0.92); c.quadraticCurveTo(0.03, 0.74, 0, 0.56); c.stroke();
  hoja(c, 0, 0.78, -0.78, 0.5, 0.26, VERDE);
  hoja(c, 0, 0.78, 0.78, 0.5, 0.26, VERDE);
  // Corona
  c.fillStyle = COBALTO;
  c.beginPath();
  c.moveTo(-0.2, -0.46);
  c.lineTo(-0.3, -0.84);
  c.lineTo(-0.1, -0.66);
  c.lineTo(0, -0.92);
  c.lineTo(0.1, -0.66);
  c.lineTo(0.3, -0.84);
  c.lineTo(0.2, -0.46);
  c.closePath();
  c.fill();
  // Fruto
  c.beginPath();
  c.moveTo(0, -0.58);
  c.bezierCurveTo(0.42, -0.6, 0.68, -0.3, 0.64, 0.06);
  c.bezierCurveTo(0.6, 0.42, 0.3, 0.64, 0, 0.64);
  c.bezierCurveTo(-0.3, 0.64, -0.6, 0.42, -0.64, 0.06);
  c.bezierCurveTo(-0.68, -0.3, -0.42, -0.6, 0, -0.58);
  c.fill();
  // Abertura en almendra con los granos
  c.fillStyle = BLANCO;
  c.beginPath();
  c.moveTo(0, -0.4);
  c.quadraticCurveTo(0.56, 0.03, 0, 0.47);
  c.quadraticCurveTo(-0.56, 0.03, 0, -0.4);
  c.fill();
  c.fillStyle = COBALTO;
  for (const [y, xs] of [[-0.2, [0]], [-0.07, [-0.09, 0.09]], [0.06, [-0.17, 0, 0.17]], [0.19, [-0.09, 0.09]], [0.31, [0]]]) {
    for (const x of xs) {
      c.beginPath();
      c.ellipse(x, y, 0.05, 0.062, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function olivo(c) {
  const P0 = [-0.74, 0.6], P1 = [-0.08, 0.3], P2 = [0.52, -0.48];
  const B = (t) => [
    (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t ** 2 * P2[0],
    (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t ** 2 * P2[1],
  ];
  const ang = (t) => Math.atan2(
    2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]),
    2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]),
  );
  c.strokeStyle = COBALTO;
  c.lineWidth = 0.04;
  c.lineCap = "round";
  c.beginPath(); c.moveTo(...P0); c.quadraticCurveTo(...P1, ...P2); c.stroke();
  [0.14, 0.28, 0.42, 0.56, 0.7, 0.84].forEach((t, i) => {
    const [x, y] = B(t), a = ang(t) + (i % 2 ? 0.8 : -0.8), l = 0.52 - t * 0.16;
    hoja(c, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.4, VERDE);
  });
  const [xf, yf] = P2, af = ang(1);
  hoja(c, xf, yf, xf + Math.cos(af) * 0.36, yf + Math.sin(af) * 0.36, 0.4, VERDE);
  // Aceitunas
  for (const [t, lado] of [[0.36, 1], [0.64, -1]]) {
    const [x, y] = B(t), a = ang(t) + lado * 1.5, ox = x + Math.cos(a) * 0.2, oy = y + Math.sin(a) * 0.2;
    c.strokeStyle = COBALTO;
    c.lineWidth = 0.022;
    c.beginPath(); c.moveTo(x, y); c.lineTo(ox, oy); c.stroke();
    c.fillStyle = COBALTO;
    c.beginPath();
    c.ellipse(ox + Math.cos(a) * 0.08, oy + Math.sin(a) * 0.08, 0.125, 0.09, a, 0, Math.PI * 2);
    c.fill();
  }
}

function espiga(c) {
  c.save();
  c.rotate(0.3);
  c.strokeStyle = VERDE;
  c.lineWidth = 0.045;
  c.lineCap = "round";
  c.beginPath(); c.moveTo(0, 0.96); c.lineTo(0, -0.56); c.stroke();
  hoja(c, 0, 0.82, -0.42, 0.42, 0.34, VERDE);
  hoja(c, 0, 0.7, 0.4, 0.3, 0.34, VERDE);
  for (let k = 0; k < 5; k++) {
    const y = 0.32 - k * 0.185;
    for (const s of [-1, 1]) {
      c.strokeStyle = COBALTO;
      c.lineWidth = 0.012;
      c.beginPath(); c.moveTo(s * 0.2, y - 0.2); c.lineTo(s * 0.33, y - 0.46); c.stroke();
      c.fillStyle = COBALTO;
      c.beginPath();
      c.moveTo(s * 0.015, y);
      c.quadraticCurveTo(s * 0.27, y - 0.02, s * 0.24, y - 0.26);
      c.quadraticCurveTo(s * 0.03, y - 0.19, s * 0.015, y);
      c.fill();
    }
  }
  c.fillStyle = COBALTO;
  c.beginPath();
  c.moveTo(0, -0.54);
  c.quadraticCurveTo(0.12, -0.72, 0, -0.92);
  c.quadraticCurveTo(-0.12, -0.72, 0, -0.54);
  c.fill();
  c.restore();
}

function estrella(c) {
  estrellaLazo(c, 0.9, 0.062, COBALTO, BLANCO);
  c.fillStyle = VERDE;
  c.beginPath(); c.arc(0, 0, 0.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = BLANCO;
  c.beginPath(); c.arc(0, 0, 0.075, 0, Math.PI * 2); c.fill();
}

const MOTIVOS = [granada, olivo, espiga, estrella];

function medallon(c, motivo) {
  c.fillStyle = BLANCO;
  c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill();
  c.strokeStyle = COBALTO;
  c.lineWidth = 0.035;
  c.beginPath(); c.arc(0, 0, 0.97, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 0.011;
  c.beginPath(); c.arc(0, 0, 0.91, 0, Math.PI * 2); c.stroke();
  c.save();
  c.scale(0.76, 0.76);
  motivo(c);
  c.restore();
}

// ---------- La capa que se pone sobre el relieve ----------
// Generador: se pinta a trozos para no trabar la animación de la portada.
//   ctx, W, H: lienzo de destino.  lim: límites de la imagen (lon, lat).
//   mallas: { terminos, provincias, contorno, rios } en lon/lat.
//   km: { x0, y0, x1, y1, aLon, aLat, dentro(x, y), porKmX, porKmY }.
export function* pintarCeramica(ctx, W, H, lim, mallas, km) {
  const X = (lon) => (lon - lim.west) / (lim.east - lim.west) * W;
  const Y = (lat) => (lim.north - lat) / (lim.north - lim.south) * H;
  const f = W / 3072;
  const lineas = (g) => (!g ? [] : g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []);
  const trazar = (g) => {
    ctx.beginPath();
    for (const l of lineas(g)) l.forEach(([lo, la], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la))));
    ctx.stroke();
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(27,63,150,0.72)";
  ctx.lineWidth = 2.8 * f;
  trazar(mallas.terminos);
  yield;
  ctx.strokeStyle = "rgba(43,122,75,0.95)";
  ctx.lineWidth = 3.4 * f;
  for (const r of mallas.rios) trazar(r);
  yield;
  ctx.strokeStyle = "rgba(27,63,150,0.95)";
  ctx.lineWidth = 5 * f;
  trazar(mallas.provincias);
  yield;
  ctx.strokeStyle = COBALTO;
  ctx.lineWidth = 9 * f;
  trazar(mallas.contorno);
  yield;

  // Retícula regular al tresbolillo: decoración, sin relación con lo que hay en cada sitio.
  const R = 23, PX = 92, PY = 76;
  let fila = 0;
  for (let y = km.y0; y <= km.y1; y += PY, fila++) {
    let col = 0;
    for (let x = km.x0 + (fila % 2) * PX / 2; x <= km.x1; x += PX, col++) {
      let cabe = true;
      for (let a = 0; a < 12 && cabe; a++) cabe = km.dentro(x + Math.cos(a * Math.PI / 6) * R * 1.04, y + Math.sin(a * Math.PI / 6) * R * 1.04);
      if (!cabe || !km.dentro(x, y)) continue;
      ctx.save();
      ctx.setTransform(km.porKmX * R, 0, 0, km.porKmY * R, X(km.aLon(x)), Y(km.aLat(y)));
      medallon(ctx, MOTIVOS[(col + fila * 2) % MOTIVOS.length]);
      ctx.restore();
      yield;
    }
  }
}

// ---------- La tela de lacería que se ve sobre el verde, fuera de la maqueta ----------
// `zonas`: rectángulos (CSS px) donde hay texto; ahí la tela se borra, para no estorbar la lectura.
export function pintarTela(canvas, w, h, dpr, zonas) {
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  const c = canvas.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, pw, ph);
  const T = Math.round(64 * dpr), losa = document.createElement("canvas");
  losa.width = losa.height = T;
  const l = losa.getContext("2d"), color = "rgba(246,243,236,0.42)";
  l.translate(T / 2, T / 2);
  estrellaLazo(l, T * 0.36, Math.max(1, 1.05 * dpr), color, null);
  l.fillStyle = color;
  l.beginPath(); l.arc(0, 0, 1.5 * dpr, 0, Math.PI * 2); l.fill();
  const q = T * 0.075;
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = x * T / 2, cy = y * T / 2;
    l.beginPath(); l.moveTo(cx, cy - q); l.lineTo(cx + q, cy); l.lineTo(cx, cy + q); l.lineTo(cx - q, cy); l.closePath(); l.fill();
  }
  c.fillStyle = c.createPattern(losa, "repeat");
  c.fillRect(0, 0, pw, ph);
  c.globalCompositeOperation = "destination-out";
  c.fillStyle = "#000";
  if ("filter" in c) c.filter = `blur(${Math.round(9 * dpr)}px)`;
  const m = 14 * dpr;
  for (const r of zonas) c.fillRect(r.left * dpr - m, r.top * dpr - m, (r.right - r.left) * dpr + 2 * m, (r.bottom - r.top) * dpr + 2 * m);
  if ("filter" in c) c.filter = "none";
  c.globalCompositeOperation = "source-over";
}
