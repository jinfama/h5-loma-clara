import { pintarCeramica, pintarTela } from "./ceramica.js";

// Portada F · «Atlas Histórico»: una maqueta viva de Andalucía. Sobre el relieve, cada municipio de hoy es una columna
// que crece con sus habitantes, año de fuente a año de fuente (población de la base, poblacion_hab__municipio.json;
// años de anios_fuente del catálogo), en el sitio de su capital actual (DERA, núcleos de hoy). Sin gráficas.
//
// Dos maneras de levantar el relieve, según lo que haya en data/v2/geo/relieve/:
//  · Modelo de elevación (altura_terrain_rgb.png, IGN MDT200 a unos 400 m): una malla continua con la altura
//    multiplicada por EXAG_DEM. Solo se lee si capas.json de esa carpeta la lista (así no hay peticiones a ficheros
//    que no existen). Mientras no esté colocada, no se usa.
//  · Si no está: los municipios de hoy (IECA, 15-04-2026) alzados según su altitud media (la cifra de la base por
//    municipio, IGN MDT200), con la altura multiplicada por EXAG_MUNI.
// Encima, en los dos casos, el relieve sombreado del IGN y los ríos de niveles 1 a 3 del DERA, pintados en la
// textura. Ninguna altura se inventa ni se interpola entre municipios.

const raiz = document.documentElement;
const RAIZ = "../../", V2 = RAIZ + "data/v2/", REL = V2 + "geo/relieve/";
const DEM_FICHERO = "altura_terrain_rgb.png";
const CAPITALES = ["04013", "11012", "14021", "18087", "21041", "23050", "29067", "41091"];
const VERDE = "#007a3d", VERDE_HONDO = "#0f3b2c";

// Proyección local (equirectangular con el coseno de la latitud media): 1 unidad de escena = 1 km.
const RAD = Math.PI / 180, LON0 = -4.6, LAT0 = 37.35;
const KX = 111.32 * Math.cos(LAT0 * RAD), KY = 110.95;
const pX = (lon) => (lon - LON0) * KX, pY = (lat) => (lat - LAT0) * KY;
const iX = (x) => x / KX + LON0, iY = (y) => y / KY + LAT0;

const OPCION_QUINTO = "a";   // quinto tema por defecto: a «Agua», b «Clima» (?clima=a|b para elegir)
const BASE = 2.4;       // grosor de la maqueta bajo el nivel del mar (km de escena)
const EXAG_MUNI = 17;   // municipios alzados: altitud media × 17
const EXAG_DEM = 5.5;   // modelo de elevación: altura × 5,5
const TOL_KM = 0.12;    // simplificación de los contornos para la escena (120 m)

const reducir = matchMedia("(prefers-reduced-motion: reduce)");
const pequena = () => Math.min(innerWidth, innerHeight) < 600;

function aRespaldo(motivo) {
  if (motivo) console.warn("Portada F: se queda la imagen fija del relieve.", motivo);
  raiz.classList.remove("cargando", "listo");
  raiz.classList.add("sin3d");
}

const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + " → " + r.status); return r.json(); });
const imagen = (u) => new Promise((ok, mal) => {
  const im = new Image();
  im.onload = () => ok(im);
  im.onerror = () => mal(new Error("No carga " + u));
  im.src = u;
});
// El modelo de elevación se lee sin gestión de color: los bytes RGB son la altura.
async function bytesImagen(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(u + " → " + r.status);
  const bm = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas");
  c.width = bm.width; c.height = bm.height;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(bm, 0, 0);
  return { w: bm.width, h: bm.height, px: cx.getImageData(0, 0, bm.width, bm.height).data };
}
// capas.json puede venir como diccionario (formato del atlas) o como lista (formato de la unidad).
function entradaCapa(capas, fichero) {
  const c = capas && capas.capas;
  const lista = Array.isArray(c) ? c : Object.values(c || {});
  return lista.find((x) => x && x.fichero === fichero) || null;
}

// ---------- Geometría plana ----------
function decodificarArcos(topo) {
  const t = topo.transform;
  return topo.arcs.map((arco) => {
    if (!t) return arco.map((p) => [p[0], p[1]]);
    let x = 0, y = 0;
    return arco.map((p) => { x += p[0]; y += p[1]; return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]; });
  });
}
function dist2Seg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1];
  return ex * ex + ey * ey;
}
// Douglas-Peucker por arco: los extremos se conservan, así la topología compartida no se abre.
function simplificar(pts, tol) {
  const n = pts.length;
  if (n <= 3) return pts;
  const guarda = new Uint8Array(n);
  guarda[0] = guarda[n - 1] = 1;
  const tol2 = tol * tol, pila = [];
  if (pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1]) {
    const a = Math.floor(n / 3), b = Math.floor(2 * n / 3);
    guarda[a] = guarda[b] = 1;
    pila.push([0, a], [a, b], [b, n - 1]);
  } else pila.push([0, n - 1]);
  while (pila.length) {
    const [a, b] = pila.pop();
    let im = -1, dm = tol2;
    for (let i = a + 1; i < b; i++) { const d = dist2Seg(pts[i], pts[a], pts[b]); if (d > dm) { dm = d; im = i; } }
    if (im >= 0) { guarda[im] = 1; pila.push([a, im], [im, b]); }
  }
  return pts.filter((_, i) => guarda[i]);
}
function area(r) {
  let a = 0;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}
function limpiar(r) {
  const out = [];
  for (const p of r) { const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}
// Polígonos limpios: exterior en sentido antihorario, huecos en horario; fuera las piezas de menos de 10 ha (islotes
// como Alborán: alzados con la altitud media de todo su municipio, engañarían).
function poligonos(geom) {
  const lista = !geom ? [] : geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  const out = [];
  for (const pol of lista) {
    const ext = limpiar(pol[0]);
    if (ext.length < 3 || Math.abs(area(ext)) < 0.1) continue;
    if (area(ext) < 0) ext.reverse();
    const anillos = [ext];
    for (let k = 1; k < pol.length; k++) {
      const h = limpiar(pol[k]);
      if (h.length < 3 || Math.abs(area(h)) < 0.1) continue;
      if (area(h) > 0) h.reverse();
      anillos.push(h);
    }
    out.push(anillos);
  }
  return out;
}
function centroide(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : r[0];
}
// Parte un anillo en tramos de como mucho `paso` km (para que las líneas sigan el terreno).
function densificar(r, paso) {
  const out = [];
  for (let i = 0, n = r.length; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / paso));
    for (let s = 0; s < k; s++) out.push([a[0] + (b[0] - a[0]) * s / k, a[1] + (b[1] - a[1]) * s / k]);
  }
  return out;
}

// ---------- Textura: relieve sombreado del IGN, límites y ríos del DERA ----------
function pintarTextura(sombra, lim, muniTopo, riosTopo, TW, suave) {
  const W0 = sombra.naturalWidth, H0 = sombra.naturalHeight;
  const a = document.createElement("canvas");
  a.width = W0; a.height = H0;
  const ca = a.getContext("2d", { willReadFrequently: true });
  ca.drawImage(sombra, 0, 0);
  const d = ca.getImageData(0, 0, W0, H0), px = d.data;
  // Llano (≈ 179 en la imagen) casi blanco, como la cal; las laderas en sombra, más oscuras; las de sol, blancas.
  const lut = new Uint8ClampedArray(256);
  const k = suave ? 0.95 : 1.45;
  for (let v = 0; v < 256; v++) lut[v] = Math.max(80, Math.min(255, v < 179 ? 238 - (179 - v) * k : 238 + (v - 179) * 0.7));
  for (let i = 0; i < px.length; i += 4) { if (px[i + 3]) { const o = lut[px[i]]; px[i] = o; px[i + 1] = o; px[i + 2] = o - 3; } }
  ca.putImageData(d, 0, 0);

  const TH = Math.round(TW * H0 / W0);
  const t = document.createElement("canvas");
  t.width = TW; t.height = TH;
  const c = t.getContext("2d");
  c.fillStyle = "#eeebe4"; c.fillRect(0, 0, TW, TH);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
  c.drawImage(a, 0, 0, TW, TH);
  const X = (lon) => (lon - lim.west) / (lim.east - lim.west) * TW;
  const Y = (lat) => (lim.north - lat) / (lim.north - lim.south) * TH;
  const lineas = (g) => !g ? [] : g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
  const trazo = (geoms) => {
    c.beginPath();
    for (const g of geoms) for (const l of lineas(g)) l.forEach(([lo, la], i) => (i ? c.lineTo(X(lo), Y(la)) : c.moveTo(X(lo), Y(la))));
    c.stroke();
  };
  const f = TW / 4096;
  c.lineJoin = "round"; c.lineCap = "round";
  c.strokeStyle = suave ? "rgba(15,59,44,.17)" : "rgba(15,59,44,.08)"; c.lineWidth = 1.2 * f;
  trazo([topojson.mesh(muniTopo, muniTopo.objects.municipios, (p, q) => p !== q)]);
  c.strokeStyle = "rgba(15,59,44,.42)"; c.lineWidth = 2.4 * f;
  trazo([topojson.mesh(muniTopo, muniTopo.objects.provincias, (p, q) => p !== q)]);
  const clave = Object.keys(riosTopo.objects)[0];
  const rios = topojson.feature(riosTopo, riosTopo.objects[clave]).features;
  for (const [nivel, ancho] of [[3, 2.0], [2, 3.2], [1, 5.6]]) {
    c.strokeStyle = VERDE; c.lineWidth = ancho * f;
    trazo(rios.filter((r) => r.properties && r.properties.nivel === nivel).map((r) => r.geometry));
  }
  return t;
}
// Máscara de Andalucía (para recortar la malla continua por su contorno exacto).
function pintarMascara(anillosKm, lim, TW, TH) {
  const t = document.createElement("canvas");
  t.width = TW; t.height = TH;
  const c = t.getContext("2d");
  c.fillStyle = "#000"; c.fillRect(0, 0, TW, TH);
  c.fillStyle = "#fff"; c.beginPath();
  for (const r of anillosKm) r.forEach(([x, y], i) => {
    const u = (iX(x) - lim.west) / (lim.east - lim.west) * TW, v = (lim.north - iY(y)) / (lim.north - lim.south) * TH;
    i ? c.lineTo(u, v) : c.moveTo(u, v);
  });
  c.fill("evenodd");
  return t;
}

// =====================================================================================================
async function iniciar() {
  if (raiz.classList.contains("sin3d")) return;
  const [THREE, { OrbitControls }, { LineSegments2 }, { LineSegmentsGeometry }, { LineMaterial }] = await Promise.all([
    import("three"),
    import("three/addons/controls/OrbitControls.js"),
    import("three/addons/lines/LineSegments2.js"),
    import("three/addons/lines/LineSegmentsGeometry.js"),
    import("three/addons/lines/LineMaterial.js"),
  ]);
  const [muniTopo, riosTopo, altJson, capasRel, pobl, catalogo, nucleos] = await Promise.all([
    json(V2 + "geo/municipios.topo.json"),
    json(V2 + "capas/rios_1_3.topo.json"),
    json(V2 + "visor/valores/geo_altitud_mean__municipio.json"),
    json(REL + "capas.json"),
    json(V2 + "visor/valores/poblacion_hab__municipio.json"),
    json(V2 + "visor/indicadores.json"),
    json(V2 + "geo/nucleos.json"),
  ]);
  const capaSombra = entradaCapa(capasRel, "relieve_sombreado.png");
  if (!capaSombra) throw new Error("capas.json no trae relieve_sombreado.png");
  const capaDem = entradaCapa(capasRel, DEM_FICHERO);
  const lim = capaSombra.limites;
  const [sombra, dem] = await Promise.all([
    imagen(REL + capaSombra.fichero),
    capaDem ? bytesImagen(REL + capaDem.fichero).catch((e) => { console.warn("Portada F: sin modelo de elevación.", e); return null; }) : null,
  ]);
  const modo = dem ? "dem" : "municipios";

  // ---------- Renderizador ----------
  const lienzo = document.getElementById("lienzo");
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  let pr = Math.min(window.devicePixelRatio || 1, pequena() ? 2 : 1.75);
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const maxTex = renderer.capabilities.maxTextureSize;
  const TW = Math.min(maxTex, pequena() ? 2048 : 4096);

  // ---------- Municipios en km ----------
  const arcosKm = decodificarArcos(muniTopo).map((a) => simplificar(a.map(([lo, la]) => [pX(lo), pY(la)]), TOL_KM));
  const topoKm = { type: "Topology", objects: muniTopo.objects, arcs: arcosKm };
  const provincias = {};
  for (const g of muniTopo.objects.provincias.geometries) provincias[g.properties.p] = g.properties.n;
  const altPorIne = {};
  altJson.ids.forEach((id, i) => { const v = altJson.v[0][i]; if (v != null && (altJson.f ? altJson.f[0][i] !== "." : true)) altPorIne[id] = v; });
  const EXAG = modo === "dem" ? EXAG_DEM : EXAG_MUNI;
  const munis = topojson.feature(topoKm, muniTopo.objects.municipios).features.map((ft) => {
    const pr_ = ft.properties, pols = poligonos(ft.geometry);
    const alt = altPorIne[pr_.c];
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    const planos = [];
    for (const pol of pols) for (const r of pol) {
      const fa = new Float64Array(r.length * 2);
      r.forEach(([x, y], i) => { fa[2 * i] = x; fa[2 * i + 1] = y; if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; });
      planos.push(fa);
    }
    return { c: pr_.c, n: pr_.n, p: pr_.p, ha: pr_.ha, alt, h: BASE + (alt == null ? 0 : alt) / 1000 * EXAG_MUNI, pols, planos, bb };
  }).filter((m) => m.pols.length);
  const contorno = topojson.feature(topoKm, muniTopo.objects.andalucia).features.flatMap((ft) => poligonos(ft.geometry));

  // Rejilla para saber qué municipio hay bajo un punto (x, y) en km.
  const CEL = 8;
  const gx0 = Math.min(...munis.map((m) => m.bb[0])), gy0 = Math.min(...munis.map((m) => m.bb[1]));
  const GWc = Math.ceil((Math.max(...munis.map((m) => m.bb[2])) - gx0) / CEL) + 1;
  const GHc = Math.ceil((Math.max(...munis.map((m) => m.bb[3])) - gy0) / CEL) + 1;
  const celdas = Array.from({ length: GWc * GHc }, () => []);
  munis.forEach((m, i) => {
    for (let cy = Math.floor((m.bb[1] - gy0) / CEL); cy <= Math.floor((m.bb[3] - gy0) / CEL); cy++)
      for (let cx = Math.floor((m.bb[0] - gx0) / CEL); cx <= Math.floor((m.bb[2] - gx0) / CEL); cx++) celdas[cy * GWc + cx].push(i);
  });
  const dentro = (planos, x, y) => {
    let c = false;
    for (const r of planos) for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
      const xi = r[2 * i], yi = r[2 * i + 1], xj = r[2 * j], yj = r[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let ultimoHallado = -1;
  function municipioEn(x, y) {
    if (ultimoHallado >= 0) { const m = munis[ultimoHallado]; if (x >= m.bb[0] && x <= m.bb[2] && y >= m.bb[1] && y <= m.bb[3] && dentro(m.planos, x, y)) return ultimoHallado; }
    const cx = Math.floor((x - gx0) / CEL), cy = Math.floor((y - gy0) / CEL);
    if (cx < 0 || cy < 0 || cx >= GWc || cy >= GHc) return -1;
    for (const i of celdas[cy * GWc + cx]) {
      const m = munis[i];
      if (x < m.bb[0] || x > m.bb[2] || y < m.bb[1] || y > m.bb[3]) continue;
      if (dentro(m.planos, x, y)) { ultimoHallado = i; return i; }
    }
    return -1;
  }

  // ---------- Texturas ----------
  const lienzoTex = pintarTextura(sombra, lim, muniTopo, riosTopo, TW, modo === "dem");
  const textura = new THREE.CanvasTexture(lienzoTex);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const uvDe = (x, y) => [(iX(x) - lim.west) / (lim.east - lim.west), (iY(y) - lim.south) / (lim.north - lim.south)];

  // ---------- Escena ----------
  const escena = new THREE.Scene();
  const maqueta = new THREE.Group();
  escena.add(maqueta);
  const matCima = new THREE.MeshLambertMaterial({ color: 0xffffff, map: textura });
  // Municipio señalado: una máscara aparte tiñe su cima de verde andaluz (sin tocar la textura grande).
  const lienzoSel = document.createElement("canvas");
  lienzoSel.width = 1600; lienzoSel.height = Math.round(1600 * lienzoTex.height / lienzoTex.width);
  const ctxSel = lienzoSel.getContext("2d");
  ctxSel.fillStyle = "#000"; ctxSel.fillRect(0, 0, lienzoSel.width, lienzoSel.height);
  const texSel = new THREE.CanvasTexture(lienzoSel);
  texSel.generateMipmaps = false; texSel.minFilter = THREE.LinearFilter;
  // Capas de cada tema (paisajes, transporte, fronteras, clima): dos lienzos que se funden uno en otro.
  // Se suben con el alfa premultiplicado para que los bordes de puntos y líneas no se oscurezcan.
  const OW = pequena() ? 2048 : 3072, OH = Math.round(OW * lienzoTex.height / lienzoTex.width);
  const capas = [0, 1].map(() => {
    const c = document.createElement("canvas");
    c.width = OW; c.height = OH;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return { c, x: c.getContext("2d"), t };
  });
  // Neblina del clima: dos lienzos pequeños (es un campo suave; subirlos cuesta poco aunque cambie cada año).
  const NW = 256, NH = Math.round(NW * OH / OW);
  const nieblas = [0, 1].map(() => {
    const c = document.createElement("canvas");
    c.width = NW; c.height = NH;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
    return { c, x: c.getContext("2d"), t };
  });
  // Velo de cerámica (ceramica.js): textura vacía hasta que se pinta, cuando la portada ya está quieta.
  const texVacia = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  texVacia.needsUpdate = true;
  const uSel = {
    ceramica: { value: texVacia }, lenteXYR: { value: new THREE.Vector3(0, 0, 1) }, lenteFuerza: { value: 0 },
    zonasUI: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4(-9, -9, -9, -9)) },
    niebla0: { value: nieblas[0].t }, niebla1: { value: nieblas[1].t }, nieblaMezcla: { value: 0 }, nieblaOn: { value: 0 },
    mapaSel: { value: texSel }, colorSel: { value: new THREE.Color(VERDE) },
    capa0: { value: capas[0].t }, capa1: { value: capas[1].t }, mezcla: { value: 0 }, ola: { value: 0 }, sentido: { value: 1 }, brillo: { value: 1 },
  };
  matCima.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uSel);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D mapaSel;
uniform vec3 colorSel;
uniform sampler2D capa0;
uniform sampler2D capa1;
uniform float mezcla;
uniform float ola;
uniform float sentido;
uniform float brillo;
uniform sampler2D niebla0;
uniform sampler2D niebla1;
uniform float nieblaMezcla;
uniform float nieblaOn;
uniform sampler2D ceramica;
uniform vec3 lenteXYR;
uniform float lenteFuerza;
uniform vec4 zonasUI[5];`)
      .replace("#include <map_fragment>", `#include <map_fragment>
#ifdef USE_MAP
  // Fundido; con «ola», un frente ondulado que cruza de oeste a este (como la antigua portada C).
  float mzc = mezcla;
  if (ola > 0.5) {
    float u = vMapUv.x + 0.035 * sin(vMapUv.y * 22.0 + vMapUv.x * 7.0);
    float pr = sentido > 0.5 ? mezcla : 1.0 - mezcla;
    float lc = clamp((pr * 1.3 - u) / 0.3, 0.0, 1.0);
    mzc = sentido > 0.5 ? lc : 1.0 - lc;
  }
  vec4 capaTema = mix(texture2D(capa0, vMapUv), texture2D(capa1, vMapUv), mzc);
  diffuseColor.rgb = diffuseColor.rgb * (1.0 - capaTema.a) + capaTema.rgb * brillo;
  vec4 nb = mix(texture2D(niebla0, vMapUv), texture2D(niebla1, vMapUv), nieblaMezcla) * nieblaOn;
  diffuseColor.rgb = diffuseColor.rgb * (1.0 - nb.a) + nb.rgb;
  // Alrededor del cursor, el relieve en blanco de loza con los términos y los motivos. Nunca detrás de un texto.
  float velo = 0.0;
  vec4 dibujo = vec4(0.0);
  if (lenteFuerza > 0.001) {
    float dLente = distance(gl_FragCoord.xy, lenteXYR.xy) / lenteXYR.z;
    velo = lenteFuerza * (1.0 - smoothstep(0.66, 1.0, dLente));
    for (int iz = 0; iz < 5; iz++) {
      vec2 qz = max(zonasUI[iz].xy - gl_FragCoord.xy, gl_FragCoord.xy - zonasUI[iz].zw);
      velo *= smoothstep(0.0, lenteXYR.z * 0.14, max(qz.x, qz.y));
    }
    if (velo > 0.002) {
      float lumMapa = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 loza = vec3(0.95, 0.945, 0.915) * mix(0.62, 1.0, smoothstep(0.2, 0.74, lumMapa));
      dibujo = texture2D(ceramica, vMapUv) * velo;
      diffuseColor.rgb = mix(diffuseColor.rgb, loza, velo);
    }
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, colorSel, texture2D(mapaSel, vMapUv).g * 0.42);
#endif`)
      .replace("#include <opaque_fragment>", `#ifdef USE_MAP
  if (velo > 0.002) outgoingLight = outgoingLight * (1.0 - dibujo.a) + dibujo.rgb;
#endif
#include <opaque_fragment>`);
  };
  function pintarSel(m) {
    const W = lienzoSel.width, H = lienzoSel.height;
    ctxSel.fillStyle = "#000"; ctxSel.fillRect(0, 0, W, H);
    if (m) {
      ctxSel.fillStyle = "#fff"; ctxSel.beginPath();
      for (const r of m.pols.flat()) r.forEach(([x, y], k) => {
        const [u, v] = uvDe(x, y);
        k ? ctxSel.lineTo(u * W, (1 - v) * H) : ctxSel.moveTo(u * W, (1 - v) * H);
      });
      ctxSel.fill("evenodd");
    }
    texSel.needsUpdate = true;
  }
  const matPared = new THREE.MeshLambertMaterial({ color: 0xe6dfd1, vertexColors: true });

  // Paredes verticales de un anillo, del suelo (y = 0) a la altura que diga `alturaDe(x, y)`.
  function paredes(anillos, alturaDe, pos, nor, col) {
    for (const r of anillos) for (let i = 0, n = r.length; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      if (!l) continue;
      const nx = dy / l, nz = dx / l;            // hacia fuera, ya en coordenadas de escena (z = −y)
      const ha = alturaDe(a), hb = alturaDe(b);
      const A0 = [a[0], 0, -a[1]], B0 = [b[0], 0, -b[1]], B1 = [b[0], hb, -b[1]], A1 = [a[0], ha, -a[1]];
      for (const v of [A0, B0, B1, A0, B1, A1]) { pos.push(v[0], v[1], v[2]); nor.push(nx, 0, nz); const s = v[1] ? 1 : 0.5; col.push(s, s, s); }
    }
  }
  function mallaParedes(pos, nor, col) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, matPared);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  let alturaEn;   // altura de la superficie (sin escalar) en (x, y) km, o null fuera de Andalucía
  let HMAX = 0;
  if (modo === "municipios") {
    // Cimas: cada municipio, plano a la altura de su altitud media.
    const pos = [], nor = [], uv = [], idx = [];
    for (const m of munis) {
      m.ini = idx.length;
      for (const pol of m.pols) {
        const base = pos.length / 3, todos = pol.flat();
        const caras = THREE.ShapeUtils.triangulateShape(pol[0].map((p) => new THREE.Vector2(p[0], p[1])), pol.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1]))));
        for (const p of todos) { pos.push(p[0], m.h, -p[1]); nor.push(0, 1, 0); uv.push(...uvDe(p[0], p[1])); }
        for (const [a, b, c] of caras) {
          const A = todos[a], B = todos[b], C = todos[c];
          const s = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
          if (s >= 0) idx.push(base + a, base + b, base + c); else idx.push(base + a, base + c, base + b);
        }
      }
      m.num = idx.length - m.ini;
      HMAX = Math.max(HMAX, m.h);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const cimas = new THREE.Mesh(g, matCima);
    cimas.castShadow = cimas.receiveShadow = true;
    const pp = [], pn = [], pc = [];
    for (const m of munis) paredes(m.pols.flat(), () => m.h, pp, pn, pc);
    maqueta.add(cimas, mallaParedes(pp, pn, pc));
    alturaEn = (x, y) => { const i = municipioEn(x, y); return i < 0 ? null : munis[i].h; };
  } else {
    // Malla continua del modelo de elevación, recortada por el contorno de Andalucía con una máscara.
    const dl = capaDem.limites || lim;
    const { w: W, h: H, px } = dem;
    const paso = pequena() ? 3 : 2;
    const alt = new Float32Array(W * H), ok = new Uint8Array(W * H);
    for (let i = 0, k = 0; i < W * H; i++, k += 4) if (px[k + 3] > 127) { alt[i] = -10000 + (px[k] * 65536 + px[k + 1] * 256 + px[k + 2]) * 0.1; ok[i] = 1; }
    const GW = Math.floor((W - 1) / paso) + 1, GH = Math.floor((H - 1) / paso) + 1, rv = paso >> 1;
    const gz = new Float32Array(GW * GH), gv = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      let s = 0, n = 0;
      for (let dj = -rv; dj <= rv; dj++) {
        const y = j * paso + dj; if (y < 0 || y >= H) continue;
        for (let di = -rv; di <= rv; di++) { const x = i * paso + di; if (x < 0 || x >= W) continue; const q = y * W + x; if (ok[q]) { s += alt[q]; n++; } }
      }
      const q = j * GW + i;
      if (n) { gz[q] = BASE + s / n / 1000 * EXAG_DEM; gv[q] = 1; } else gz[q] = BASE;
      if (gz[q] > HMAX) HMAX = gz[q];
    }
    const dLon = (dl.east - dl.west) / W, dLat = (dl.north - dl.south) / H;
    const pos = new Float32Array(GW * GH * 3), uv = new Float32Array(GW * GH * 2);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const q = j * GW + i, lon = dl.west + (i * paso + 0.5) * dLon, lat = dl.north - (j * paso + 0.5) * dLat;
      pos[3 * q] = pX(lon); pos[3 * q + 1] = gz[q]; pos[3 * q + 2] = -pY(lat);
      uv[2 * q] = (lon - lim.west) / (lim.east - lim.west); uv[2 * q + 1] = (lat - lim.south) / (lim.north - lim.south);
    }
    const usar = new Uint8Array((GW - 1) * (GH - 1));
    for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
      const q = j * GW + i;
      if (gv[q] || gv[q + 1] || gv[q + GW] || gv[q + GW + 1]) usar[j * (GW - 1) + i] = 1;
    }
    const idx = [];
    for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
      let u = usar[j * (GW - 1) + i];
      if (!u) for (let dj = -1; dj <= 1 && !u; dj++) for (let di = -1; di <= 1 && !u; di++) {
        const jj = j + dj, ii = i + di;
        if (jj >= 0 && ii >= 0 && jj < GH - 1 && ii < GW - 1 && usar[jj * (GW - 1) + ii]) u = 2;
      }
      if (!u) continue;
      const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const anillosAnd = contorno.flat();
    const mascara = new THREE.CanvasTexture(pintarMascara(anillosAnd, lim, TW, lienzoTex.height));
    matCima.alphaMap = mascara;
    matCima.alphaTest = 0.5;
    const tierra = new THREE.Mesh(g, matCima);
    tierra.castShadow = tierra.receiveShadow = true;
    // Altura bilineal sobre la misma rejilla que la malla.
    alturaEn = (x, y) => {
      const lon = iX(x), lat = iY(y);
      const fi = ((lon - dl.west) / dLon - 0.5) / paso, fj = ((dl.north - lat) / dLat - 0.5) / paso;
      if (fi < 0 || fj < 0 || fi > GW - 1 || fj > GH - 1) return null;
      const i0 = Math.min(GW - 2, Math.floor(fi)), j0 = Math.min(GH - 2, Math.floor(fj)), ti = fi - i0, tj = fj - j0, q = j0 * GW + i0;
      return (gz[q] * (1 - ti) + gz[q + 1] * ti) * (1 - tj) + (gz[q + GW] * (1 - ti) + gz[q + GW + 1] * ti) * tj;
    };
    const pp = [], pn = [], pc = [];
    paredes(anillosAnd.map((r) => densificar(r, paso * 0.4)), (p) => alturaEn(p[0], p[1]) ?? BASE, pp, pn, pc);
    maqueta.add(tierra, mallaParedes(pp, pn, pc));
  }

  // Suelo que recibe la sombra de la maqueta.
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: 0x03140d, opacity: 0.5 }));
  suelo.receiveShadow = true;
  suelo.position.y = -0.01;
  escena.add(suelo);

  // ---------- Luz rasante del oesnoroeste, como la del relieve sombreado ----------
  const sol = new THREE.DirectionalLight(0xfff3df, 4.3);
  const AZ_SOL = 300 * RAD, EL_SOL = 27 * RAD;
  sol.position.set(Math.sin(AZ_SOL) * Math.cos(EL_SOL), Math.sin(EL_SOL), -Math.cos(AZ_SOL) * Math.cos(EL_SOL)).multiplyScalar(900);
  sol.castShadow = true;
  sol.shadow.mapSize.set(pequena() ? 2048 : 4096, pequena() ? 2048 : 4096);
  Object.assign(sol.shadow.camera, { left: -320, right: 320, top: 260, bottom: -260, near: 300, far: 1600 });
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.35;
  escena.add(sol, sol.target);
  escena.add(new THREE.HemisphereLight(0xeef3f0, 0x2a5a48, 1.35));

  // ---------- Pueblos y ciudades: una columna por municipio de hoy, en el sitio de su capital actual ----------
  // Altura proporcional a los habitantes del año elegido (1 unidad de escena = POB_UNIDAD habitantes). Sin cifra en
  // la base, no hay columna (vacío no es cero). Una losa baja marca cada municipio con cifra ese año.
  const COL_W = 2.1, LOSA_W = 1.9, LOSA_H = 0.14, POB_UNIDAD = 6000;
  const puntoCapital = {};
  for (const p of (nucleos.cortes && nucleos.cortes.hoy) || []) puntoCapital[p[2]] = [pX(p[0]), pY(p[1])];
  const iyDe = new Map(pobl.anios.map((y, i) => [y, i]));
  const ipDe = new Map(pobl.ids.map((c, i) => [c, i]));
  const catPob = (catalogo.indicadores || []).find((x) => x.id === "poblacion_hab") || {};
  const ANIOS = (catPob.anios_fuente || pobl.anios).filter((y) => iyDe.has(y)).sort((a, b) => a - b);
  const AN0 = ANIOS[0], AN1 = ANIOS[ANIOS.length - 1];
  const cols = munis.map((m) => {
    let xy = puntoCapital[m.c];
    if (!xy) { const mayor = m.pols.slice().sort((a, b) => Math.abs(area(b[0])) - Math.abs(area(a[0])))[0]; xy = centroide(mayor[0]); }
    const base = modo === "municipios" ? m.h : (alturaEn(xy[0], xy[1]) ?? m.h);
    return { x: xy[0], y: xy[1], base, ip: ipDe.has(m.c) ? ipDe.get(m.c) : -1, cur: 0, obj: 0, hay: false };
  });
  const cajaBase = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const COLOR_COL = new THREE.Color(0x16a65c), COLOR_COL_SEL = new THREE.Color(0xfff6dc);
  const columnas = new THREE.InstancedMesh(cajaBase, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x04381d }), cols.length);
  columnas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  columnas.castShadow = false;   // sus sombras largas cruzarían el suelo: sin ellas queda más sobrio
  columnas.frustumCulled = false;
  const losas = new THREE.InstancedMesh(cajaBase, new THREE.MeshLambertMaterial({ color: 0x86bd9c }), cols.length);
  losas.receiveShadow = true;
  losas.frustumCulled = false;
  cols.forEach((_, i) => columnas.setColorAt(i, COLOR_COL));
  // Punta de cada columna, sin sombrear: un brillo sutil.
  const puntas = new THREE.InstancedMesh(cajaBase, new THREE.MeshBasicMaterial({ color: 0x9df0c0 }), cols.length);
  puntas.frustumCulled = false;
  const PUNTA_H = 0.7;
  // Halo leve en las grandes ciudades (las que pasan de 60 000 habitantes en algún año).
  const texHalo = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(120,240,170,0.95)"); g.addColorStop(0.28, "rgba(20,170,90,0.45)"); g.addColorStop(1, "rgba(0,122,61,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const halos = [];
  cols.forEach((c, i) => {
    if (c.ip < 0) return;
    let mx = 0;
    for (const y of ANIOS) { const v = pobl.v[iyDe.get(y)][c.ip]; if (v != null && v > mx) mx = v; }
    if (mx < 60000) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHalo, transparent: true, depthWrite: false, opacity: 0.62 }));
    sp.scale.set(0, 0, 1);
    maqueta.add(sp);
    halos.push({ i, sp });
  });
  let tauCol = 170;   // la reproducción lo alarga para que las columnas crezcan sin saltos entre años
  maqueta.add(columnas, losas, puntas);
  const m4 = new THREE.Matrix4(), qId = new THREE.Quaternion(), vP = new THREE.Vector3(), vS = new THREE.Vector3();
  function moverColumnas(dt, todas) {
    const k = reducir.matches ? 1 : 1 - Math.exp(-dt / tauCol);
    let cambia = false;
    cols.forEach((c, i) => {
      if (!todas && c.cur === c.obj) return;
      const d = c.obj - c.cur;
      c.cur = Math.abs(d) < 0.004 ? c.obj : c.cur + d * k;
      vP.set(c.x, c.base, -c.y);
      if (c.cur > 0) vS.set(COL_W, c.cur, COL_W); else vS.set(0, 0, 0);
      columnas.setMatrixAt(i, m4.compose(vP, qId, vS));
      if (c.cur > PUNTA_H * 1.5) { vP.y = c.base + c.cur - PUNTA_H + 0.02; vS.set(COL_W * 1.04, PUNTA_H, COL_W * 1.04); } else vS.set(0, 0, 0);
      puntas.setMatrixAt(i, m4.compose(vP, qId, vS));
      cambia = true;
    });
    if (cambia) {
      columnas.instanceMatrix.needsUpdate = true; puntas.instanceMatrix.needsUpdate = true;
      for (const hl of halos) {
        const c = cols[hl.i], s = c.cur > 0 ? 1.2 * Math.sqrt(c.cur * POB_UNIDAD / 1000) : 0;
        hl.sp.position.set(c.x, c.base + c.cur, -c.y);
        hl.sp.scale.set(s, s, 1);
      }
    }
    return cambia;
  }
  function moverLosas() {
    cols.forEach((c, i) => {
      vP.set(c.x, c.base, -c.y);
      if (c.hay) vS.set(LOSA_W, LOSA_H, LOSA_W); else vS.set(0, 0, 0);
      losas.setMatrixAt(i, m4.compose(vP, qId, vS));
    });
    losas.instanceMatrix.needsUpdate = true;
  }
  let colSel = -1;
  function resaltarColumna(i) {
    if (colSel >= 0) columnas.setColorAt(colSel, COLOR_COL);
    colSel = i;
    if (i >= 0) columnas.setColorAt(i, COLOR_COL_SEL);
    columnas.instanceColor.needsUpdate = true;
  }

  // Las 8 capitales, con su nombre encima de la columna.
  const rotulos = document.getElementById("rotulos");
  const caps = CAPITALES.map((c) => munis.findIndex((m) => m.c === c)).filter((i) => i >= 0).map((i) => {
    const el = document.createElement("span");
    el.className = "cap"; el.textContent = munis[i].n;
    rotulos.appendChild(el);
    return { i, el };
  });

  // ---------- Contorno del municipio bajo el cursor ----------
  const matContorno = new LineMaterial({ color: new THREE.Color(VERDE_HONDO).getHex(), linewidth: 2.5, worldUnits: false });
  let contornoMalla = null;
  function marcar(i) {
    if (contornoMalla) { maqueta.remove(contornoMalla); contornoMalla.geometry.dispose(); contornoMalla = null; }
    pintarSel(i < 0 ? null : munis[i]);
    resaltarColumna(i);
    sucio = true;
    if (i < 0) return;
    const m = munis[i], seg = [];
    const alto = modo === "municipios" ? () => m.h + 0.08 : (p) => (alturaEn(p[0], p[1]) ?? BASE) + 0.45;
    for (const r of m.pols.flat()) {
      const d = modo === "municipios" ? r : densificar(r, 0.6);
      for (let k = 0, n = d.length; k < n; k++) {
        const a = d[k], b = d[(k + 1) % n];
        seg.push(a[0], alto(a), -a[1], b[0], alto(b), -b[1]);
      }
    }
    const g = new LineSegmentsGeometry();
    g.setPositions(seg);
    contornoMalla = new LineSegments2(g, matContorno);
    maqueta.add(contornoMalla);
  }

  // ---------- Cámara y encuadre en el hueco libre de la primera pantalla ----------
  const heroe = document.getElementById("inicio");
  const tam = () => ({ w: heroe.clientWidth, h: heroe.clientHeight });
  const camara = new THREE.PerspectiveCamera(30, tam().w / tam().h, 2, 8000);
  const camPrueba = camara.clone();
  const objetivo0 = new THREE.Vector3(4, 6, 6);
  // Desde el sur, con el norte arriba; en pantallas altas, desde el oeste, a lo largo del Guadalquivir.
  const vertical = () => tam().w / tam().h < 1 || tam().w < 700;
  const vista0 = () => (vertical() ? { pol: 46 * RAD, az: 0 } : { pol: 52 * RAD, az: 0 });
  const puntosEncuadre = [];
  {
    const todos = contorno.flat().flat(), salto = Math.max(1, Math.floor(todos.length / 600));
    for (let i = 0; i < todos.length; i += salto) {
      const [x, y] = todos[i];
      puntosEncuadre.push(new THREE.Vector3(x, 0, -y), new THREE.Vector3(x, (alturaEn(x, y) ?? BASE) + 2, -y));
    }
  }
  // Cima de las columnas más altas (su máximo en todos los años, más el rótulo): no deben subir por encima del título.
  const cimasEncuadre = [];
  cols.forEach((c) => {
    if (c.ip < 0) return;
    let mx = 0;
    for (const y of ANIOS) { const v = pobl.v[iyDe.get(y)][c.ip]; if (v != null && v > mx) mx = v; }
    if (mx / POB_UNIDAD > 12) cimasEncuadre.push(new THREE.Vector3(c.x, c.base + mx / POB_UNIDAD + 14, -c.y));
  });
  const pp0 = new THREE.Vector3();
  function rectangulo(d, vista, w, h) {
    camPrueba.position.setFromSpherical(new THREE.Spherical(d, vista.pol, vista.az)).add(objetivo0);
    camPrueba.lookAt(objetivo0);
    camPrueba.updateMatrixWorld();
    const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of puntosEncuadre) {
      pp0.copy(p).project(camPrueba);
      const x = (pp0.x + 1) / 2 * w, y = (1 - pp0.y) / 2 * h;
      if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
    }
    r.cima = Infinity;
    for (const p of cimasEncuadre) { pp0.copy(p).project(camPrueba); r.cima = Math.min(r.cima, (1 - pp0.y) / 2 * h); }
    return r;
  }
  let distancia0 = 700;
  function encuadre() {
    const { w, h } = tam();
    camara.aspect = camPrueba.aspect = w / h;
    camara.clearViewOffset(); camPrueba.updateProjectionMatrix();
    const hr = heroe.getBoundingClientRect();
    const rel = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { top: r.top - hr.top, bottom: r.bottom - hr.top }; };
    const boton = rel(".cab .entrar"), cab = rel(".cab"), titulo = rel(".cab h1"), tiempo = rel("#tiempo");
    const zona = vertical()
      ? { x0: 32, x1: w - 32, y0: cab.bottom + 18, y1: tiempo.top - 16 }
      : { x0: w * 0.2, x1: w - 72, y0: Math.max(h * 0.34, boton.bottom - h * 0.05), y1: tiempo.top - 34 };
    const vista = vista0(), aw = zona.x1 - zona.x0, ah = Math.max(80, zona.y1 - zona.y0);
    let lo = 40, hi = 8000;
    for (let k = 0; k < 30; k++) {
      const d = (lo + hi) / 2, r = rectangulo(d, vista, w, h);
      // La maqueta cabe en el hueco y la columna más alta, ya centrada, no pasa del título.
      const cy = (zona.y0 + zona.y1) / 2 - (r.y0 + r.y1) / 2;
      const cabe = r.x1 - r.x0 <= aw && r.y1 - r.y0 <= ah && (vertical() || r.cima + cy >= titulo.bottom + 18);
      if (cabe) hi = d; else lo = d;
    }
    distancia0 = hi;
    const r = rectangulo(hi, vista, w, h);
    const dx = (zona.x0 + zona.x1) / 2 - (r.x0 + r.x1) / 2, dy = (zona.y0 + zona.y1) / 2 - (r.y0 + r.y1) / 2;
    camara.setViewOffset(w, h, -dx, -dy, w, h);
    camara.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    matContorno.resolution.set(w, h);
  }
  encuadre();
  {
    const vista = vista0();
    camara.position.setFromSpherical(new THREE.Spherical(distancia0, vista.pol, vista.az)).add(objetivo0);
    camara.lookAt(objetivo0);
  }
  // La rueda sola baja la página (a «Sobre el atlas»); con Ctrl (o pellizcando en el panel táctil) acerca.
  // Una sola pantalla: la rueda (sin Ctrl) acerca y aleja la maqueta; la página no se desplaza.
  const mandos = new OrbitControls(camara, lienzo);
  lienzo.style.touchAction = "none";   // en el móvil, deslizar gira y pellizcar acerca; la página no se desplaza
  mandos.target.copy(objetivo0);
  mandos.enableDamping = true; mandos.dampingFactor = 0.07;
  mandos.rotateSpeed = 0.55; mandos.zoomSpeed = 0.9; mandos.panSpeed = 0.7;
  mandos.screenSpacePanning = false; mandos.zoomToCursor = true;
  mandos.minDistance = 40; mandos.maxDistance = distancia0 * 1.7;
  mandos.minPolarAngle = 0.02; mandos.maxPolarAngle = 78 * RAD;
  mandos.update();

  let tocado = false, gesto = false, ultimoGesto = -Infinity, enCalma = false, t0Calma = 0;
  let sucio = true, visible = true, puntero = null, pendiente = false;
  mandos.addEventListener("start", () => { gesto = true; tocado = true; enCalma = false; });
  mandos.addEventListener("end", () => { gesto = false; ultimoGesto = performance.now(); });
  mandos.addEventListener("change", () => { sucio = true; if (puntero) pendiente = true; });
  function reencuadrar() {
    encuadre();
    mandos.maxDistance = distancia0 * 1.7;
    if (!tocado) {
      const vista = vista0();
      mandos.target.copy(objetivo0);
      camara.position.setFromSpherical(new THREE.Spherical(distancia0, vista.pol, vista.az)).add(objetivo0);
      enCalma = false;
    }
    mandos.update();
    sucio = true;
  }
  addEventListener("resize", reencuadrar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reencuadrar);
  // Si la portada no se ve (se ha bajado a «Sobre el atlas»), no se pinta.
  new IntersectionObserver((ents) => { visible = ents[0].isIntersecting; if (visible) sucio = true; }).observe(heroe);
  lienzo.addEventListener("webglcontextlost", (e) => { e.preventDefault(); aRespaldo("contexto WebGL perdido"); });

  // =================================== Temas de la maqueta ===================================
  // Tres temas: Población (columnas), Paisajes (manto de puntos) y Transporte (vías que se trazan). Se eligen pasando
  // por su palabra, abajo; cada uno trae sus fechas y su forma de enseñarse sobre la maqueta.
  const PXk = (x) => (iX(x) - lim.west) / (lim.east - lim.west) * OW;
  const PYk = (y) => (lim.north - iY(y)) / (lim.north - lim.south) * OH;
  const PXg = (lon) => (lon - lim.west) / (lim.east - lim.west) * OW;
  const PYg = (lat) => (lim.north - lat) / (lim.north - lim.south) * OH;
  const kmPx = OW / ((lim.east - lim.west) * KX);
  const escala = OW / 3072;
  function caminoKm(anillos) {
    const p = new Path2D();
    for (const r of anillos) { r.forEach(([x, y], k) => (k ? p.lineTo(PXk(x), PYk(y)) : p.moveTo(PXk(x), PYk(y)))); p.closePath(); }
    return p;
  }
  let caminoAnd = null;
  const caminoAndalucia = () => caminoAnd || (caminoAnd = caminoKm(contorno.flat()));
  const lineasDe = (g) => !g ? [] : g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
  function trazarLineas(ctx, rasgos) {
    ctx.beginPath();
    for (const f of rasgos) for (const l of lineasDe(f.geometry || f)) l.forEach(([lo, la], k) => (k ? ctx.lineTo(PXg(lo), PYg(la)) : ctx.moveTo(PXg(lo), PYg(la))));
    ctx.stroke();
  }
  function azar(semilla) {
    let a = semilla >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pausa = () => new Promise((r) => setTimeout(r, 0));

  // ---------- Capas pintadas sobre el relieve: fundido (u ola) entre dos lienzos ----------
  // Un pintor puede ser una función o un generador (function*): el generador se reparte en varios cuadros para no
  // trabar la animación, y la capa solo se sube y se funde cuando está entera.
  let capaActiva = 0, mezclaObj = 0, durMezcla = 0.6, trabajo = null;
  function pintarCapa(pintor, dur, ola) {
    const k = trabajo ? trabajo.k : 1 - capaActiva, L = capas[k];
    if (trabajo) { trabajo.cancelar(); trabajo = null; }
    L.x.setTransform(1, 0, 0, 1, 0, 0); L.x.globalAlpha = 1; L.x.setLineDash([]);
    L.x.clearRect(0, 0, OW, OH);
    const fin = () => {
      L.t.needsUpdate = true;
      capaActiva = k; mezclaObj = k; durMezcla = reducir.matches ? 0 : dur;
      uSel.ola.value = ola ? 1 : 0; uSel.sentido.value = k;
      sucio = true;
    };
    let r = null;
    if (pintor) { L.x.save(); r = pintor(L.x); }
    // Si el pintor devuelve un generador, se pinta por partes en los cuadros siguientes.
    if (r && typeof r.next === "function") { trabajo = { k, gen: r, fin: () => { L.x.restore(); fin(); }, cancelar: () => L.x.restore() }; return; }
    if (pintor) L.x.restore();
    fin();
  }
  function seguirTrabajo() {
    if (!trabajo) return false;
    const t0 = performance.now();
    let r;
    do { r = trabajo.gen.next(); } while (!r.done && performance.now() - t0 < 7);
    if (r.done) { const f = trabajo.fin; trabajo = null; f(); }
    return true;
  }

  // ---------- Paisajes: usos del suelo en un manto de puntos (paleta de «La tierra») ----------
  const CLASE = {
    regadio_huerta: ["#00a3e0", "regadío y huerta"], frutales: ["#ff6f61", "frutales"], olivar: ["#7a9a01", "olivar"],
    vina: ["#8e2c8e", "viña"], lenosos_mixtos_y_otros: ["#e85fa6", "otros leñosos"], labor: ["#f5c518", "labor"],
    labor_de_rotacion_larga: ["#f08a24", "labor de rotación larga"], dehesa_agricola: ["#d9a066", "dehesa sin asignar"],
    dehesa_pasto: ["#b5651d", "dehesa y pasto"], monte_bajo: ["#5f9e6e", "monte bajo"], monte_arbolado: ["#1d6b45", "monte arbolado"],
    inculto: ["#b9c98a", "inculto"], no_agrario: ["#3c3c3c", "no agrario"], sin_clasificar: ["#b8a1d9", "sin clasificar"],
  };
  const ORDEN = Object.keys(CLASE);
  const claseInfo = (c) => CLASE[c] || ["#9aa5a0", c.replace(/_/g, " ")];
  function rgbaDe(hex, gris) {
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    if (gris) { const l = Math.round(150 + (0.3 * r + 0.59 * g + 0.11 * b - 128) * 0.45); r = g = b = l; }
    return `rgb(${r},${g},${b})`;
  }
  let USOS = null, RES = [], ineUsos = null, puntosMuni = null;
  const PASO_PUNTO = pequena() ? 1.25 : 0.95;   // km entre puntos: un manto fino
  async function prepararPuntos() {
    const lista = munis.map(() => []);
    const x0 = Math.min(...munis.map((m) => m.bb[0])), y0 = Math.min(...munis.map((m) => m.bb[1]));
    const x1 = Math.max(...munis.map((m) => m.bb[2])), y1 = Math.max(...munis.map((m) => m.bb[3]));
    let t0 = performance.now();
    for (let y = y0, f = 0; y <= y1; y += PASO_PUNTO * 0.866, f++) {
      for (let x = x0 + (f % 2) * PASO_PUNTO / 2; x <= x1; x += PASO_PUNTO) {
        const i = municipioEn(x, y);
        if (i >= 0) lista[i].push(PXk(x), PYk(y));
      }
      if (performance.now() - t0 > 4) { await pausa(); t0 = performance.now(); }
    }
    // Orden fijo y al azar dentro de cada municipio: el sitio del punto no dice dónde estaba el cultivo.
    lista.forEach((l, i) => {
      const r = azar(i * 7919 + 13);
      for (let a = l.length / 2 - 1; a > 0; a--) {
        const b = Math.floor(r() * (a + 1));
        [l[2 * a], l[2 * b]] = [l[2 * b], l[2 * a]];
        [l[2 * a + 1], l[2 * b + 1]] = [l[2 * b + 1], l[2 * a + 1]];
      }
    });
    puntosMuni = lista;
  }
  const reservaUsos = (corte) => {
    const pv = new Set();
    for (const r of RES) if (r.tema === "usos_suelo" && (r.cortes || []).includes(corte)) for (const p of r.provincias || []) pv.add(p);
    return pv;
  };
  function repartoUsos(m, k) {
    const iu = ineUsos.get(m.c);
    if (iu == null) return null;
    const d = USOS.datos[USOS.cortes[k]], lista = [];
    let suma = 0;
    for (const c of ORDEN.concat(Object.keys(d).filter((c) => !CLASE[c]))) {
      const o = d[c];
      if (!o) continue;
      const ha = o.ha[iu];
      if (ha == null || ha <= 0) continue;
      lista.push({ c, ha, est: !!(o.e && o.e[iu] === "1") });
      suma += ha;
    }
    // 1752 no cierra con la superficie del término: lo no declarado se queda sin punto.
    return suma ? { lista, suma, den: Math.max(suma, m.ha || 0) } : null;
  }
  function* pintarPaisaje(ctx, k) {
    const gris = reservaUsos(USOS.cortes[k]);
    const lado = PASO_PUNTO * 0.84 * kmPx, ladoEst = lado * 0.66, lotes = new Map();
    for (let i = 0; i < munis.length; i++) {
      const m = munis[i], r = repartoUsos(m, k), pts = puntosMuni[i], n = pts.length / 2;
      if (!r || !n) continue;
      const cuota = r.lista.map((u) => u.ha / r.den * n), ent = cuota.map(Math.floor);
      let falta = Math.round(r.suma / r.den * n) - ent.reduce((a, b) => a + b, 0);
      cuota.map((q, j) => [q - ent[j], j]).sort((a, b) => b[0] - a[0]).forEach(([, j]) => { if (falta > 0) { ent[j]++; falta--; } });
      let p = 0;
      r.lista.forEach((u, j) => {
        // Lo estimado, en punto más pequeño del mismo color.
        const clave = rgbaDe(claseInfo(u.c)[0], gris.has(m.p)) + (u.est ? "e" : "");
        let l = lotes.get(clave);
        if (!l) lotes.set(clave, (l = []));
        for (let q = 0; q < ent[j] && p < n; q++, p++) l.push(pts[2 * p], pts[2 * p + 1]);
      });
      if (i % 60 === 0) yield;
    }
    for (const [clave, l] of lotes) {
      const est = clave.endsWith("e"), a = est ? ladoEst : lado, med = a / 2;
      ctx.fillStyle = est ? clave.slice(0, -1) : clave;
      for (let q = 0; q < l.length; q += 2) { ctx.fillRect(l[q] - med, l[q + 1] - med, a, a); if (q % 12000 === 0) yield; }
    }
  }

  // ---------- Transporte: calzadas, caminos del XVIII y ferrocarril que se traza al abrirse ----------
  let TR = null, estMalla = null, ests = [];
  const COLOR_EST = new THREE.Color(0xffeab0), COLOR_DESTELLO = new THREE.Color(0xffffff);
  const cTmp = new THREE.Color();
  function moverEstaciones(dt, todas) {
    if (!estMalla) return false;
    const k = reducir.matches ? 1 : 1 - Math.exp(-dt / 140), kd = Math.exp(-dt / 260);
    let cambia = false;
    ests.forEach((e, i) => {
      if (!todas && e.cur === e.obj && !e.destello) return;
      const d = e.obj - e.cur;
      e.cur = Math.abs(d) < 0.01 ? e.obj : e.cur + d * k;
      e.destello = e.destello > 0.02 ? e.destello * kd : 0;
      const s = e.cur * 1.45 * (1 + 1.6 * e.destello);
      vP.set(e.x, e.base + 0.15, -e.y);
      vS.set(s, s * 0.9, s);
      estMalla.setMatrixAt(i, m4.compose(vP, qId, vS));
      estMalla.setColorAt(i, cTmp.copy(COLOR_EST).lerp(COLOR_DESTELLO, Math.min(1, e.destello * 1.5)));
      cambia = true;
    });
    if (cambia) { estMalla.instanceMatrix.needsUpdate = true; estMalla.instanceColor.needsUpdate = true; }
    return cambia;
  }
  // Vías que se abren en el paso: líneas 3D sobre el relieve que se dibujan de punta a punta, con una luz delante.
  const trazos = [];
  const texLuz = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,240,1)"); g.addColorStop(0.25, "rgba(255,236,170,0.55)"); g.addColorStop(1, "rgba(255,220,120,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function abrirTrazos(Y) {
    if (trazos.some((t) => t.anio === Y && !t.apagando)) return;
    const nuevas = TR.lineas.filter((l) => (+l.properties.anio_apertura || 0) === Y);
    if (!nuevas.length) return;
    const seg = [];
    for (const l of nuevas) for (const linea of lineasDe(l.geometry)) {
      const km = linea.map(([lo, la]) => [pX(lo), pY(la)]), d = [];
      for (let k = 0; k < km.length - 1; k++) {
        const a = km[k], b = km[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.8));
        for (let s = 0; s < n; s++) d.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]);
      }
      d.push(km[km.length - 1]);
      for (let k = 0; k < d.length - 1; k++) {
        const a = d[k], b = d[k + 1];
        seg.push(a[0], (alturaEn(a[0], a[1]) ?? BASE) + 0.35, -a[1], b[0], (alturaEn(b[0], b[1]) ?? BASE) + 0.35, -b[1]);
      }
    }
    if (!seg.length) return;
    const geo = new LineSegmentsGeometry();
    geo.setPositions(seg);
    geo.instanceCount = 0;
    const mat = new LineMaterial({ color: 0xffe896, linewidth: 2.4, worldUnits: false, transparent: true, opacity: 1 });
    mat.uniforms.resolution.value = matContorno.resolution;   // la misma resolución que el contorno, también al cambiar de tamaño
    const malla = new LineSegments2(geo, mat);
    malla.frustumCulled = false;
    const luz = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLuz, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    luz.scale.set(7, 7, 1);
    maqueta.add(malla, luz);
    const n = seg.length / 6;
    trazos.push({ anio: Y, malla, mat, geo, luz, seg, n, t0: performance.now(), dur: reducir.matches ? 0 : Math.min(1500, 500 + n * 0.9), alfa: 1, apagando: false });
  }
  function animarTrazos(ahora, dt) {
    let vivo = false;
    for (let j = trazos.length - 1; j >= 0; j--) {
      const t = trazos[j];
      const p = t.dur ? Math.min(1, (ahora - t.t0) / t.dur) : 1, k = Math.max(1, Math.ceil(p * t.n));
      if (t.geo.instanceCount !== k) { t.geo.instanceCount = k; vivo = true; }
      const q = (k - 1) * 6 + 3;
      t.luz.position.set(t.seg[q], t.seg[q + 1] + 0.4, t.seg[q + 2]);
      t.luz.material.opacity = p < 1 ? 1 : Math.max(0, t.luz.material.opacity - dt / 300);
      if (p < 1 || t.luz.material.opacity > 0) vivo = true;
      if (t.apagando) {
        t.alfa -= dt / 450; t.mat.opacity = Math.max(0, t.alfa); vivo = true;
        if (t.alfa <= 0) { maqueta.remove(t.malla, t.luz); t.geo.dispose(); t.mat.dispose(); t.luz.material.dispose(); trazos.splice(j, 1); }
      }
    }
    return vivo;
  }
  function pintarTransporte(ctx, paso) {
    ctx.fillStyle = "rgba(5, 34, 22, 0.84)";
    ctx.fill(caminoAndalucia());
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const brillo = (rasgos, rgb, ancho) => {
      ctx.strokeStyle = `rgba(${rgb},0.16)`; ctx.lineWidth = ancho * 4.4; trazarLineas(ctx, rasgos);
      ctx.strokeStyle = `rgba(${rgb},0.32)`; ctx.lineWidth = ancho * 2.2; trazarLineas(ctx, rasgos);
      ctx.strokeStyle = `rgba(${rgb},1)`; ctx.lineWidth = ancho; trazarLineas(ctx, rasgos);
    };
    {
      // Las que abren justo este año no se pintan aquí: las traza la luz (abrirTrazos).
      const Y = paso.x, abiertas = [], cerradas = [];
      for (const l of TR.lineas) {
        const a = +l.properties.anio_apertura || 0, c = +l.properties.anio_cierre || 0;
        if (!a || a >= Y) continue;
        (c && c <= Y ? cerradas : abiertas).push(l);
      }
      ctx.strokeStyle = "rgba(170, 196, 180, 0.5)"; ctx.lineWidth = 1.4 * escala;
      ctx.setLineDash([5 * escala, 5 * escala]); trazarLineas(ctx, cerradas); ctx.setLineDash([]);
      brillo(abiertas, "255,232,150", 2.4 * escala);
    }
  }

  const caminoMuni = (m) => m.camino || (m.camino = caminoKm(m.pols.flat()));
  const aKm = (g) => !g ? g : {
    type: g.type,
    coordinates: g.type === "Polygon" ? g.coordinates.map((r) => r.map(([lo, la]) => [pX(lo), pY(la)]))
      : g.type === "MultiPolygon" ? g.coordinates.map((p) => p.map((r) => r.map(([lo, la]) => [pX(lo), pY(la)]))) : [],
  };
  function conPlanos(u) {
    u.bb = [Infinity, Infinity, -Infinity, -Infinity]; u.planos = [];
    for (const pol of u.pols) for (const r of pol) {
      const fa = new Float64Array(r.length * 2);
      r.forEach(([x, y], i) => { fa[2 * i] = x; fa[2 * i + 1] = y; if (x < u.bb[0]) u.bb[0] = x; if (y < u.bb[1]) u.bb[1] = y; if (x > u.bb[2]) u.bb[2] = x; if (y > u.bb[3]) u.bb[3] = y; });
      u.planos.push(fa);
    }
    return u;
  }
  function indiceDe(lista) {
    const C = 8, x0 = Math.min(...lista.map((u) => u.bb[0])), y0 = Math.min(...lista.map((u) => u.bb[1]));
    const GW = Math.ceil((Math.max(...lista.map((u) => u.bb[2])) - x0) / C) + 1, GH = Math.ceil((Math.max(...lista.map((u) => u.bb[3])) - y0) / C) + 1;
    const cel = Array.from({ length: GW * GH }, () => []);
    lista.forEach((u, i) => {
      for (let cy = Math.floor((u.bb[1] - y0) / C); cy <= Math.floor((u.bb[3] - y0) / C); cy++)
        for (let cx = Math.floor((u.bb[0] - x0) / C); cx <= Math.floor((u.bb[2] - x0) / C); cx++) cel[cy * GW + cx].push(i);
    });
    return (x, y) => {
      const cx = Math.floor((x - x0) / C), cy = Math.floor((y - y0) / C);
      if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return -1;
      for (const i of cel[cy * GW + cx]) { const u = lista[i]; if (x >= u.bb[0] && x <= u.bb[2] && y >= u.bb[1] && y <= u.bb[3] && dentro(u.planos, x, y)) return i; }
      return -1;
    };
  }
  const num1 = (v) => v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // ---------- Fronteras: los términos de cada fecha ----------
  const cacheTerm = new Map();
  let termActual = null;
  const TINTES = ["#ead9a6", "#cfe1c2", "#b8d4c4", "#e8c8a6", "#d5d0e6", "#c6dbe8", "#e4c6c6", "#d9e4ae", "#f0dcc4", "#bfd8b0"];
  const tinte = (clave) => { let h = 0; for (const ch of String(clave)) h = (h * 31 + ch.charCodeAt(0)) | 0; return TINTES[Math.abs(h) % TINTES.length]; };
  function terminos(corte) {
    if (!cacheTerm.has(corte)) cacheTerm.set(corte, json(V2 + "geo/terminos/" + corte + ".topo.json").then((t) => {
      const obj = t.objects.terminos || t.objects[Object.keys(t.objects)[0]];
      const lista = topojson.feature(t, obj).features.map((ft) => conPlanos({
        n: ft.properties.n, pz: ft.properties.pz || [], pe: ft.properties.pe, pols: poligonos(aKm(ft.geometry)),
      })).filter((u) => u.pols.length);
      return { corte, lista, malla: topojson.mesh(t, obj), buscar: indiceDe(lista) };
    }));
    return cacheTerm.get(corte);
  }
  function pintarFronteras(ctx, T) {
    for (const u of T.lista) {
      const sinMunicipio = u.pe === "sin_municipio_en_la_fecha";
      const clave = u.pz.length ? u.pz.reduce((a, b) => (a < b ? a : b)) : u.n;
      ctx.fillStyle = sinMunicipio ? "rgba(128,128,128,0.4)" : tinte(clave) + "a6";
      ctx.fill(u.camino || (u.camino = caminoKm(u.pols.flat())));
    }
    ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(15, 59, 44, 0.9)"; ctx.lineWidth = 1.5 * escala;
    trazarLineas(ctx, [T.malla]);
  }

  // ---------- Clima: cada municipio teñido por su anomalía de temperatura ----------
  let CLIMA = null;
  function colorAnom(v) {
    const t = Math.max(-1, Math.min(1, v / 1.5)), a = t < 0 ? [43, 108, 176] : [192, 57, 43], n = [246, 243, 236], k = Math.abs(t);
    return `rgba(${Math.round(n[0] + (a[0] - n[0]) * k)},${Math.round(n[1] + (a[1] - n[1]) * k)},${Math.round(n[2] + (a[2] - n[2]) * k)},0.88)`;
  }
  function pintarClima(ctx, iy) {
    const fila = CLIMA.v[iy];
    for (const m of munis) {
      const j = CLIMA.ip.get(m.c), v = j == null ? null : fila[j];
      ctx.fillStyle = v == null ? "rgba(140,140,140,0.45)" : colorAnom(v);
      ctx.fill(caminoMuni(m));
    }
  }


  // ---------- Clima (opción b): neblina suave, azul o ámbar ----------
  const FRIO = [79, 134, 198], CALIDO = [226, 158, 58], NEUTRO = [246, 243, 236];
  function colorSuave(v, opaco) {
    const t = Math.max(-1, Math.min(1, v / 1.2)), a = t < 0 ? FRIO : CALIDO, k = Math.sqrt(Math.abs(t));
    if (opaco) return `rgb(${Math.round(NEUTRO[0] + (a[0] - NEUTRO[0]) * k)},${Math.round(NEUTRO[1] + (a[1] - NEUTRO[1]) * k)},${Math.round(NEUTRO[2] + (a[2] - NEUTRO[2]) * k)})`;
    return `rgba(${a[0]},${a[1]},${a[2]},${(0.7 * k).toFixed(3)})`;
  }
  let nieblaActiva = 0, nieblaObj = 0, nieblaDur = 0.8, nieblaOnObj = 0;
  let nieblaTmp = null;
  function pintarNiebla(iy, dur) {
    // Se pinta en pequeño (unos 2 km por píxel) y se difumina: una neblina, no un mosaico.
    const k = 1 - nieblaActiva, L = nieblas[k];
    if (!nieblaTmp) { nieblaTmp = document.createElement("canvas"); nieblaTmp.width = NW; nieblaTmp.height = NH; }
    const a = nieblaTmp.getContext("2d"), fila = CLIMA.v[iy];
    a.clearRect(0, 0, NW, NH);
    a.save(); a.scale(NW / OW, NH / OH);
    for (const m of munis) {
      const j = CLIMA.ip.get(m.c), v = j == null ? null : fila[j];
      if (v == null) continue;
      a.fillStyle = colorSuave(v, false);
      a.fill(caminoMuni(m));
    }
    a.restore();
    L.x.clearRect(0, 0, NW, NH);
    if ("filter" in L.x) L.x.filter = "blur(3px)";
    L.x.drawImage(nieblaTmp, 0, 0);
    L.x.filter = "none";
    L.t.needsUpdate = true;
    nieblaActiva = k; nieblaObj = k; nieblaDur = reducir.matches ? 0 : dur;
    sucio = true;
  }

  // ---------- Agua (opción a): los ríos por niveles, que respiran ----------
  let RIOS = null, indRios = null, rioMalla = null, rioActual = null;
  async function indexarRios() {
    const C = 4, celdas = new Map(), segs = [], lineas = [];
    let t0 = performance.now();
    for (let k = 0; k < RIOS.length; k++) for (const f of RIOS[k]) {
      const li = lineas.push({ f, nivel: k + 1 }) - 1;
      for (const l of lineasDe(f.geometry)) for (let s = 0; s < l.length - 1; s++) {
        const ax = pX(l[s][0]), ay = pY(l[s][1]), bx = pX(l[s + 1][0]), by = pY(l[s + 1][1]), si = segs.length / 5;
        segs.push(ax, ay, bx, by, li);
        for (let cx = Math.floor(Math.min(ax, bx) / C); cx <= Math.floor(Math.max(ax, bx) / C); cx++)
          for (let cy = Math.floor(Math.min(ay, by) / C); cy <= Math.floor(Math.max(ay, by) / C); cy++) {
            const key = cx * 100000 + cy;
            let c = celdas.get(key);
            if (!c) celdas.set(key, (c = []));
            c.push(si);
          }
      }
      if (performance.now() - t0 > 4) { await pausa(); t0 = performance.now(); }
    }
    indRios = { C, celdas, segs, lineas };
  }
  // El río más cercano al punto (km), dando preferencia a los grandes; solo los niveles ya encendidos.
  function rioCerca(x, y, nivelMax) {
    if (!indRios) return null;
    const { C, celdas, segs, lineas } = indRios, UMBRAL = [0, 3.2, 2.6, 2, 1.1];
    let mejor = null, mr = 1;
    const cx0 = Math.floor(x / C), cy0 = Math.floor(y / C);
    for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) {
      const c = celdas.get(cx * 100000 + cy);
      if (!c) continue;
      for (const si of c) {
        const L = lineas[segs[si * 5 + 4]];
        if (L.nivel > nivelMax) continue;
        const d = Math.sqrt(dist2Seg([x, y], [segs[si * 5], segs[si * 5 + 1]], [segs[si * 5 + 2], segs[si * 5 + 3]]));
        const r = d / UMBRAL[L.nivel];
        if (r < mr) { mr = r; mejor = L; }
      }
    }
    return mejor;
  }
  // El río bajo el cursor, entero (todos sus tramos), en blanco sobre el relieve.
  function resaltarRio(L) {
    const id = L ? (L.f.properties.codigo_dera || L.f.properties.nombre) : null;
    if (id === rioActual) return;
    rioActual = id;
    if (rioMalla) { maqueta.remove(rioMalla); rioMalla.geometry.dispose(); rioMalla = null; }
    sucio = true;
    if (!L) return;
    const seg = [];
    for (const f of RIOS[L.nivel - 1]) {
      const p = f.properties;
      if ((p.codigo_dera || p.nombre) !== id) continue;
      for (const l of lineasDe(f.geometry)) for (let s = 0; s < l.length - 1; s++) {
        const ax = pX(l[s][0]), ay = pY(l[s][1]), bx = pX(l[s + 1][0]), by = pY(l[s + 1][1]);
        seg.push(ax, (alturaEn(ax, ay) ?? BASE) + 0.4, -ay, bx, (alturaEn(bx, by) ?? BASE) + 0.4, -by);
      }
    }
    if (!seg.length) return;
    const g = new LineSegmentsGeometry();
    g.setPositions(seg);
    const mat = new LineMaterial({ color: 0xffffff, linewidth: L.nivel === 1 ? 4 : 3, worldUnits: false });
    mat.uniforms.resolution.value = matContorno.resolution;
    rioMalla = new LineSegments2(g, mat);
    rioMalla.frustumCulled = false;
    maqueta.add(rioMalla);
  }
  function* pintarRios(ctx, n) {
    ctx.fillStyle = "rgba(4, 30, 34, 0.8)";
    ctx.fill(caminoAndalucia());
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // De la red fina al Guadalquivir, para que los grandes queden encima.
    const ESTILO = { 4: [0.8, "143,196,239", 0.6, 0], 3: [1.7, "169,214,251", 0.95, 2.6], 2: [2.6, "191,227,255", 1, 3], 1: [4.4, "214,238,255", 1, 3.4] };
    for (let k = Math.min(4, n); k >= 1; k--) {
      const [ancho, rgb, alfa, halo] = ESTILO[k], lista = RIOS[k - 1];
      for (let a = 0; a < lista.length; a += 1500) {
        const trozo = lista.slice(a, a + 1500);
        if (halo) { ctx.strokeStyle = `rgba(${rgb},0.18)`; ctx.lineWidth = ancho * halo * escala; trazarLineas(ctx, trozo); }
        ctx.strokeStyle = `rgba(${rgb},${alfa})`; ctx.lineWidth = ancho * escala; trazarLineas(ctx, trozo);
        yield;
      }
    }
  }

  // ---------- Elecciones: la familia ganadora en cada municipio de hoy ----------
  let ELEC = null;
  function pintarElecciones(ctx, iy) {
    const fila = ELEC.v[iy];
    for (const m of munis) {
      const j = ELEC.ip.get(m.c), v = j == null ? null : fila[j], cat = v == null ? null : ELEC.cats[v];
      if (!cat) continue;
      ctx.fillStyle = cat.color + "d8";
      ctx.fill(caminoMuni(m));
    }
    ctx.strokeStyle = "rgba(246, 243, 236, 0.5)"; ctx.lineWidth = 0.9 * escala; ctx.lineJoin = "round";
    for (const m of munis) ctx.stroke(caminoMuni(m));
  }

  // ---------- Trabajo y Propiedad: coropletas secuenciales de pocas clases ----------
  // Lo estimado va rayado; lo que no tiene cifra, en gris rayado («sin dato», nunca el color más bajo).
  const PAL_TRABAJO = ["#dfe8b8", "#b9d18a", "#86b15c", "#4f8a3c", "#255a2a"], CORTES_TRABAJO = [20, 40, 60, 80];
  const PAL_GINI = ["#efdcaa", "#ddb877", "#c48a4a", "#9c5a2a", "#62331a"], CORTES_GINI = [0.5, 0.6, 0.7, 0.8];
  const claseDe = (v, cortes) => { let k = 0; while (k < cortes.length && v >= cortes[k]) k++; return k; };
  const num2 = (v) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function serie(a) {
    return {
      a, v: a.v, f: a.f || [], ip: new Map(a.ids.map((c, i) => [c, i])), iy: new Map(a.anios.map((y, i) => [y, i])),
      av: new Map((a.avisos || []).map(([iy, ii, t]) => [iy + ":" + ii, (a.avisos_textos || {})[t] || t])),
    };
  }
  function trama(ctx, color, fondo) {
    const t = Math.max(6, Math.round(7 * escala)), c = document.createElement("canvas");
    c.width = c.height = t;
    const x = c.getContext("2d");
    x.fillStyle = fondo; x.fillRect(0, 0, t, t);
    x.strokeStyle = color; x.lineWidth = Math.max(1.2, 1.6 * escala);
    x.beginPath(); x.moveTo(-1, t + 1); x.lineTo(t + 1, -1); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(t - 1, t + 1); x.lineTo(t + 1, t - 1); x.stroke();
    return ctx.createPattern(c, "repeat");
  }
  function* pintarCoropleta(ctx, S, iy, pal, cortes, rayarEstimado) {
    const fila = S.v[iy], f = S.f[iy] || "", rayas = new Map(), sinDato = trama(ctx, "rgba(120,120,120,0.55)", "rgba(150,150,150,0.22)");
    let n = 0;
    for (const m of munis) {
      const j = S.ip.get(m.c), v = j == null ? null : fila[j];
      if (v == null) { ctx.fillStyle = sinDato; ctx.fill(caminoMuni(m)); continue; }
      const col = pal[claseDe(v, cortes)];
      if (rayarEstimado && f[j] === "1") {
        if (!rayas.has(col)) rayas.set(col, trama(ctx, col, col + "66"));
        ctx.fillStyle = rayas.get(col);
      } else ctx.fillStyle = col + "e6";
      ctx.fill(caminoMuni(m));
      if (++n % 200 === 0) yield;
    }
    ctx.strokeStyle = "rgba(15, 59, 44, 0.3)"; ctx.lineWidth = 0.8 * escala; ctx.lineJoin = "round";
    for (const m of munis) ctx.stroke(caminoMuni(m));
  }
  const escalaHtml = (pal) => '<span class="escala">' + pal.map((c) => `<i style="background:${c}"></i>`).join("") + "</span>";
  const SIN_DATO = '<span><i class="sin-dato"></i>sin dato</span>';
  let TRAB = null, GINI = null;

  // ---------- Los ocho temas ----------
  const nodo = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
  const notaDe = (y) => {
    const n = (pobl.notas_anio || {})[y] || "";
    return /^en revisi/i.test(n) ? "en revisión" : /imputaci/i.test(n) ? "imputación, no censo" : "";
  };
  const TEMAS = {
    poblacion: {
      listo: true,
      pasos: ANIOS.map((y) => ({ x: y, grande: String(y), nota: notaDe(y) })),
      inicio: 1842,
      rotulos: [[AN0], [1787, "op"], [1842], [1900], [1950], [2000, "op"], [AN1]],
      vel: (t) => (t < 1842 ? 34 : 13), espera: () => 0,
      entrar() { pintarCapa(null, 0.6); },
      mostrar(i) {
        const P = this.pasos, sig = P[i + 1];
        // Mientras se reproduce, la columna tarda lo que tarda en llegar el año siguiente: crece sin saltos.
        tauCol = reproduciendo && sig ? Math.max(140, Math.min(700, (sig.x - P[i].x) / this.vel(P[i].x) * 1000 / 2.6)) : 170;
        const fila = pobl.v[iyDe.get(P[i].x)];
        for (const c of cols) { const v = c.ip >= 0 ? fila[c.ip] : null; c.hay = v != null; c.obj = v != null ? v / POB_UNIDAD : 0; }
        moverLosas();
      },
      salir() { tauCol = 170; for (const c of cols) { c.obj = 0; c.hay = false; } moverLosas(); },
      leyenda: () => "Cada columna, un municipio de hoy; su altura, sus habitantes",
      ficha(i, m) {
        const c = cols[munis.indexOf(m)], y = this.pasos[i].x, iy = iyDe.get(y);
        const v = c && c.ip >= 0 ? pobl.v[iy][c.ip] : null, f = c && c.ip >= 0 && pobl.f ? pobl.f[iy][c.ip] : ".";
        const st = nodo("strong", v == null ? `${y}: sin dato` : `${y}: ${v.toLocaleString("es-ES")} habitantes`);
        const marca = v == null ? "" : f === "2" ? (y > 1787 ? "con reserva" : "en revisión") : f === "1" ? "estimado" : "";
        if (marca) st.append(nodo("small", marca));
        return [st];
      },
    },
    paisajes: {
      async preparar() {
        const [u, r] = await Promise.all([json(V2 + "series/usos_suelo.json"), json(V2 + "reservas.json").catch(() => ({}))]);
        USOS = u; RES = (r && r.reservas) || [];
        ineUsos = new Map(USOS.ine.map((c, i) => [c, i]));
        this.pasos = USOS.cortes.map((c) => ({
          x: c === "hacia 1880" ? 1880 : +c, corte: c, grande: c === "hacia 1880" ? "1880" : c, extra: c === "hacia 1880" ? "hacia" : "",
          nota: c === "1752" ? "en revisión" : reservaUsos(c).size ? "con reserva" : "",
        }));
        this.rotulos = [[1752], [1880, "", "h. 1880"], [1956], [1977, "op"], [1999, "op"], [2020]];
        if (!puntosMuni) await prepararPuntos();
      },
      inicio: 1752, vel: () => 40, espera: () => 2.1,
      entrar() {},
      mostrar(i) { pintarCapa((ctx) => pintarPaisaje(ctx, i), 1.5, true); },
      salir() {},
      leyenda(i) {
        const d = USOS.datos[USOS.cortes[i]], tot = {};
        for (const [c, o] of Object.entries(d)) tot[c] = (o.ha || []).reduce((a, b) => a + (b || 0), 0);
        const top = Object.keys(tot).filter((c) => tot[c] > 0).sort((a, b) => tot[b] - tot[a]).slice(0, pequena() ? 6 : 9);
        return ORDEN.concat(Object.keys(tot).filter((c) => !CLASE[c])).filter((c) => top.includes(c))
          .map((c) => `<span><i style="background:${claseInfo(c)[0]}"></i>${esc(claseInfo(c)[1])}</span>`).join("")
          + "<span>· punto pequeño, estimado</span>";
      },
      ficha(i, m) {
        const r = repartoUsos(m, i), y = this.pasos[i].grande;
        if (!r) return [nodo("strong", `${y}: sin dato`)];
        const st = nodo("strong", y), out = [st];
        if (USOS.cortes[i] === "1752") st.append(nodo("small", "en revisión"));
        else if (reservaUsos(USOS.cortes[i]).has(m.p)) st.append(nodo("small", "con reserva"));
        for (const u of r.lista.slice().sort((a, b) => b.ha - a.ha).slice(0, 3)) {
          const d = nodo("div", null, "usos"), sw = nodo("i");
          sw.style.background = claseInfo(u.c)[0];
          d.append(sw, `${claseInfo(u.c)[1]} ${Math.round(u.ha / r.den * 100)} %`);
          if (u.est) d.append(nodo("span", "estimado", "marca"));
          out.push(d);
        }
        return out;
      },
    },
    transporte: {
      async preparar() {
        const ids = ["ferrocarril_lineas", "ferrocarril_estaciones"];
        const [lin, est] = await Promise.all(ids.map((n) => json(V2 + "capas/tra_heredada_" + n + ".topo.json")));
        const rasgos = (t) => topojson.feature(t, t.objects[Object.keys(t.objects)[0]]).features;
        TR = { lineas: rasgos(lin), estaciones: rasgos(est) };
        const anios = new Set();
        for (const f of TR.lineas.concat(TR.estaciones)) {
          const a = +f.properties.anio_apertura || 0, c = +f.properties.anio_cierre || 0;
          if (a) anios.add(a); if (c) anios.add(c);
        }
        ests = TR.estaciones.filter((f) => f.geometry && f.geometry.type === "Point").map((f) => {
          const [lon, lat] = f.geometry.coordinates, x = pX(lon), y = pY(lat);
          return { x, y, base: alturaEn(x, y) ?? BASE, a: +f.properties.anio_apertura || 0, c: +f.properties.anio_cierre || 0, n: f.properties.nombre, cur: 0, obj: 0, destello: 0 };
        });
        estMalla = new THREE.InstancedMesh(cajaBase, new THREE.MeshBasicMaterial({ color: 0xffffff }), ests.length);
        estMalla.frustumCulled = false;
        ests.forEach((_, i) => estMalla.setColorAt(i, COLOR_EST));
        maqueta.add(estMalla);
        moverEstaciones(16, true);
        const NOTA = "capa heredada, sin revisar", y0 = Math.min(...anios), y1 = Math.max(...anios);
        this.pasos = [...anios].sort((a, b) => a - b).map((y) => ({ x: y, grande: String(y), tipo: "tren", nota: NOTA }));
        this.rotulos = [[y0], [1900], [1950], [y1]];
      },
      inicio: 1860, vel: () => 8, espera: () => 0.22,
      entrar() {},
      mostrar(i) {
        const p = this.pasos[i], ahora = performance.now(), ultimo = i === this.pasos.length - 1;
        // Al reproducir, la capa grande se repinta como mucho una vez por segundo; mientras, las vías que abren las
        // lleva su trazo 3D, que se apaga cuando la capa ya las incluye.
        if (!reproduciendo || ultimo || ahora - (this.pintado || 0) > 950) {
          this.pintado = ahora;
          pintarCapa((ctx) => pintarTransporte(ctx, p), 0.35);
          for (const t of trazos) if (t.anio !== p.x) t.apagando = true;
        }
        abrirTrazos(p.x);
        for (const e of ests) {
          const abre = p.tipo === "tren" && e.a && e.a <= p.x && (!e.c || e.c > p.x) ? 1 : 0;
          if (abre && !e.obj) e.destello = 1;   // se enciende con un pequeño destello
          e.obj = abre;
        }
      },
      salir() { for (const e of ests) e.obj = 0; for (const t of trazos) t.apagando = true; },
      leyenda(i) {
        const p = this.pasos[i];
        return '<span><i class="linea" style="background:#ffe896"></i>vía en servicio</span><span><i class="linea" style="background:repeating-linear-gradient(90deg,#aac4b4 0 4px,transparent 4px 8px)"></i>vía cerrada</span><span><i style="background:#ffeab0"></i>estación abierta</span>';
      },
      ficha(i, m, punto) {
        const p = this.pasos[i];
        if (p.tipo !== "tren" || !punto) return [];
        let mejor = null, dm = 6;
        for (const e of ests) { if (!e.obj) continue; const d = Math.hypot(e.x - punto[0], e.y - punto[1]); if (d < dm) { dm = d; mejor = e; } }
        return mejor ? [nodo("strong", `Estación de ${mejor.n}`), nodo("span", `abierta en ${mejor.a}`)] : [];
      },
    },
    fronteras: {
      turno: 0,
      async preparar() {
        const [cortes, conteo] = await Promise.all([json(V2 + "geo/cortes.json"), json(V2 + "fronteras/conteo.json")]);
        const n = new Map((conteo.cortes || []).map((c) => [c.corte, c.entradas]));
        this.pasos = cortes.cortes.map((c) => ({
          x: c.corte === "hoy" ? 2026 : +c.corte, corte: c.corte, grande: c.corte,
          extra: n.get(c.corte) != null ? `${n.get(c.corte)} municipios` : "",
          nota: /^17/.test(c.corte) ? "en revisión" : "geometría reconstruida con recintos de hoy",   // aceptada (AND-LIM-09 A, 20-nov-2026)
        }));
        this.rotulos = [[1752], [1787, "op"], [1842], [1900], [1950], [2001, "op"], [2026, "", "hoy"]];
        await terminos(this.pasos[0].corte);
      },
      inicio: 1752, vel: () => 16, espera: () => 0.75,
      entrar() {},
      mostrar(i) {
        const mio = ++this.turno, corte = this.pasos[i].corte;
        terminos(corte).then((T) => {
          if (mio !== this.turno || tema !== "fronteras") return;
          termActual = T;
          pintarCapa((ctx) => pintarFronteras(ctx, T), 0.6);
          refrescarFicha();
        }).catch((e) => console.warn("Portada F: términos de " + corte, e));
        const sig = this.pasos[i + 1];
        if (sig) terminos(sig.corte).catch(() => {});
      },
      salir() { this.turno++; },
      leyenda: () => "Cada color, un término de esa fecha",
      ficha(i, m, punto) {
        if (!termActual || !punto) return [];
        const j = termActual.buscar(punto[0], punto[1]);
        if (j < 0) return [];
        const u = termActual.lista[j], f = this.pasos[i].grande;
        if (u.pe === "sin_municipio_en_la_fecha") return [nodo("strong", `${f}: ${u.n}`), nodo("span", "lugar pendiente de situar, en revisión")];
        return [nodo("strong", `${f}: término de ${u.n}`), nodo("span", u.pz.length > 1 ? `hoy son ${u.pz.length} municipios` : "hoy, un municipio")];
      },
    },
    clima: {
      // Opción b: el relieve entero bajo una neblina muy suave, azul o ámbar según la anomalía de temperatura de cada
      // municipio; abajo, las franjas de Andalucía año a año (serie de la base, nivel Andalucía) como línea temporal.
      async preparar() {
        const [m, a] = await Promise.all([
          json(V2 + "visor/valores/clima_tmed_anom__municipio.json"),
          json(V2 + "visor/valores/clima_tmed_anom__andalucia.json").catch(() => null),
        ]);
        CLIMA = m;
        CLIMA.ip = new Map(CLIMA.ids.map((c, i) => [c, i]));
        const and = new Map(a ? a.anios.map((y, i) => [y, a.v[i][0]]) : []);
        this.pasos = CLIMA.anios.map((y, iy) => ({ x: y, grande: String(y), iy }));
        this.franjas = this.pasos.map((p) => (and.get(p.x) == null ? null : colorSuave(and.get(p.x), 1)));
        const a0 = CLIMA.anios[0], a1 = CLIMA.anios[CLIMA.anios.length - 1];
        this.rotulos = [[a0], [1950], [1990, "op"], [a1]];
      },
      vel: () => 7, espera: () => 0.36,
      entrar() { pintarCapa(null, 0.6); nieblaOnObj = 1; },
      mostrar(i) { pintarNiebla(this.pasos[i].iy, reproduciendo ? 0.34 : 0.8); },
      salir() { nieblaOnObj = 0; },
      leyenda: () => '<span>más frío<i class="gradiente suave"></i>más cálido que su media de 1961-1990</span><span>· abajo, Andalucía año a año</span>',
      ficha(i, m) {
        const p = this.pasos[i], j = CLIMA.ip.get(m.c), v = j == null ? null : CLIMA.v[p.iy][j];
        if (v == null) return [nodo("strong", `${p.grande}: sin dato`)];
        return [nodo("strong", `${p.grande}: ${v > 0 ? "+" : ""}${num1(v)} °C`), nodo("span", "frente a su media de 1961-1990")];
      },
    },
    elecciones: {
      async preparar() {
        const a = await json(V2 + "visor/valores/elec_ganador_municipales__municipio.json");
        const cat = (catalogo.indicadores || []).find((x) => x.id === "elec_ganador_municipales") || {};
        ELEC = a;
        ELEC.cats = cat.categorias || a.categorias || [];
        ELEC.ip = new Map(a.ids.map((c, i) => [c, i]));
        ELEC.avisosCelda = new Map((a.avisos || []).map(([iy, ii, t]) => [iy + ":" + ii, t]));
        this.pasos = a.anios.map((y, iy) => ({ x: y, grande: String(y), iy, extra: "municipales" }));
        this.rotulos = [[a.anios[0]], [1991], [2003, "op"], [2015], [a.anios[a.anios.length - 1]]];
      },
      inicio: 1979, vel: () => 6, espera: () => 1.1,
      entrar() {},
      mostrar(i) { const iy = this.pasos[i].iy; pintarCapa((ctx) => pintarElecciones(ctx, iy), 0.6); },
      salir() {},
      leyenda(i) {
        const iy = this.pasos[i].iy, hay = new Set(ELEC.v[iy].filter((v) => v != null));
        return ELEC.cats.map((c, k) => (hay.has(k) ? `<span><i style="background:${c.color}"></i>${esc(c.rotulo)}</span>` : "")).join("");
      },
      ficha(i, m) {
        const p = this.pasos[i], j = ELEC.ip.get(m.c), v = j == null ? null : ELEC.v[p.iy][j], cat = v == null ? null : ELEC.cats[v];
        if (!cat) return [nodo("strong", `${p.grande}: sin dato`)];
        const st = nodo("strong", `Municipales de ${p.grande}`), d = nodo("div", null, "usos"), sw = nodo("i");
        sw.style.background = cat.color;
        d.append(sw, `gana: ${cat.rotulo}`);
        const out = [st, d], av = ELEC.avisosCelda.get(p.iy + ":" + j);
        if (av) out.push(nodo("span", (ELEC.avisos_textos || {})[av] || av));
        return out;
      },
    },
    trabajo: {
      async preparar() {
        const a = await json(V2 + "visor/valores/empleo_pct_agricultura__municipio.json");
        const cat = (catalogo.indicadores || []).find((x) => x.id === "empleo_pct_agricultura") || {};
        TRAB = serie(a);
        // Solo los años con dato de fuente (catálogo); la nota dice cuánto del año es estimación del modelo.
        this.pasos = (cat.anios_fuente || a.anios).filter((y) => TRAB.iy.has(y)).map((y) => {
          const iy = TRAB.iy.get(y), f = a.f[iy] || "";
          let n = 0, e = 0;
          for (const ch of f) if (ch !== ".") { n++; if (ch === "1") e++; }
          const nota = y <= 1787 ? "en revisión" : n && e / n > 0.9 ? "casi todo estimado" : n && e / n > 0.5 ? "en su mayoría estimado" : "";
          return { x: y, grande: String(y), iy, nota, extra: "ocupados en agricultura" };
        });
        const P = this.pasos;
        this.rotulos = [[P[0].x], [1900], [1950], [2001, "op"], [P[P.length - 1].x]];
      },
      inicio: 1787, vel: (t) => (t < 1900 ? 70 : 16), espera: () => 1.1,
      entrar() {},
      mostrar(i) { const iy = this.pasos[i].iy; pintarCapa((ctx) => pintarCoropleta(ctx, TRAB, iy, PAL_TRABAJO, CORTES_TRABAJO, true), 0.6); },
      salir() {},
      leyenda: () => `<span>% de ocupados en agricultura</span><span>0 ${escalaHtml(PAL_TRABAJO)} 100</span><span><i class="rayado"></i>estimado</span>${SIN_DATO}`,
      ficha(i, m) {
        const p = this.pasos[i], j = TRAB.ip.get(m.c), v = j == null ? null : TRAB.v[p.iy][j];
        if (v == null) return [nodo("strong", `${p.grande}: sin dato`)];
        const st = nodo("strong", `${p.grande}: ${num1(v)} % en agricultura`), fch = (TRAB.f[p.iy] || "")[j];
        const marca = fch === "2" ? (p.x <= 1787 ? "en revisión" : "con reserva") : fch === "1" ? "estimado" : "";
        if (marca) st.append(nodo("small", marca));
        const out = [st], av = TRAB.av.get(p.iy + ":" + j);
        if (av) out.push(nodo("span", av));
        return out;
      },
    },
    propiedad: {
      async preparar() {
        const a = await json(V2 + "visor/valores/prop_exp_gini_5__municipio.json");
        const cat = (catalogo.indicadores || []).find((x) => x.id === "prop_exp_gini_5") || {};
        GINI = serie(a);
        this.rotulo = cat.rotulo || "Índice de Gini de la tierra (experimental)";
        this.pasos = (cat.anios_fuente || a.anios).filter((y) => GINI.iy.has(y)).map((y) => ({ x: y, grande: String(y), iy: GINI.iy.get(y), nota: "experimental", extra: "censo agrario" }));
        this.rotulos = this.pasos.map((p) => [p.x]);
      },
      inicio: 1982, vel: () => 4, espera: () => 1.4,
      entrar() {},
      mostrar(i) { const iy = this.pasos[i].iy; pintarCapa((ctx) => pintarCoropleta(ctx, GINI, iy, PAL_GINI, CORTES_GINI, false), 0.6); },
      salir() {},
      leyenda() { return `<span>${esc(this.rotulo)}</span><span>más repartida ${escalaHtml(PAL_GINI)} más concentrada</span>${SIN_DATO}`; },
      ficha(i, m) {
        const p = this.pasos[i], j = GINI.ip.get(m.c), v = j == null ? null : GINI.v[p.iy][j];
        if (v == null) return [nodo("strong", `${p.grande}: sin dato`)];
        const st = nodo("strong", `${p.grande}: Gini ${num2(v)}`);
        st.append(nodo("small", "experimental"));
        const out = [st], av = GINI.av.get(p.iy + ":" + j);
        if (av) out.push(nodo("span", av));
        return out;
      },
    },
    agua: {
      // Opción a: los ríos se encienden por niveles (DERA): Guadalquivir, más de 90 km, de 25 a 90 km y la red fina.
      sinTiempo: true, rio: true,
      async preparar() {
        const t4 = await json(V2 + "capas/rios_4.topo.json");
        const f13 = topojson.feature(riosTopo, riosTopo.objects[Object.keys(riosTopo.objects)[0]]).features;
        const f4 = topojson.feature(t4, t4.objects[Object.keys(t4.objects)[0]]).features;
        RIOS = [1, 2, 3].map((n) => f13.filter((f) => f.properties && f.properties.nivel === n)).concat([f4]);
        await indexarRios();
        this.pasos = [1, 2, 3, 4].map((n) => ({ x: n, grande: "", nivel: n }));
        this.rotulos = [];
      },
      vel: () => 1, espera: () => 1.35,
      entrar() {},
      mostrar(i) { const n = this.pasos[i].nivel; pintarCapa((ctx) => pintarRios(ctx, n), i === 0 ? 0.9 : 1.1); },
      salir() { resaltarRio(null); uSel.brillo.value = 1; },
      leyenda: () => '<span><i class="linea" style="height:4px;background:#d6eeff"></i>Guadalquivir</span>'
        + '<span><i class="linea" style="background:#bfe3ff"></i>más de 90 km</span>'
        + '<span><i class="linea" style="height:2px;background:#a9d6fb"></i>de 25 a 90 km</span>'
        + '<span><i class="linea" style="height:1px;background:#8fc4ef"></i>menos de 25 km</span>',
      ficha(i, m, punto) {
        const r = punto ? rioCerca(punto[0], punto[1], this.pasos[i].nivel) : null;
        resaltarRio(r);
        if (!r) return { ocultar: true };
        const p = r.f.properties, nodos = [nodo("b", p.nombre || "Río sin nombre")];
        nodos.push(nodo("span", p.nivel === 1 ? "el único río de primera categoría del DERA" : `${String(p.longitud_rio_km).replace(".", ",")} km dentro de Andalucía`));
        return { sustituye: true, nodos };
      },
    },
  };

  // ---------- Las cinco palabras: al pasar por una, la maqueta cambia; al salir, se queda ----------
  const temasEl = document.getElementById("temas"), leyendaEl = document.getElementById("leyenda");
  const extraEl = document.getElementById("extra");
  const pista = document.getElementById("pista"), marcas = document.getElementById("marcas");
  const mango = document.getElementById("mango"), hecho = document.getElementById("hecho");
  const anioEl = document.getElementById("anio"), notaEl = document.getElementById("nota");
  const playBtn = document.getElementById("play"), playIco = document.getElementById("playIco");
  let tema = null, iSel = 0, tX = 0, tPaso = 0, reproduciendo = false, autoplay = 0, turno = 0, arrastrePista = false;
  const pasoGuardado = {};
  // Quinto tema: ?clima=a «Agua» (ríos por niveles) o ?clima=b «Clima» (neblina y franjas). Se lee en la portada o en
  // la anfitriona. Por defecto, OPCION_QUINTO.
  const OPCION = (() => {
    let o = new URLSearchParams(location.search).get("clima");
    try { o = o || new URLSearchParams(window.top.location.search).get("clima"); } catch (e) { /* otra procedencia */ }
    return o === "a" || o === "b" ? o : OPCION_QUINTO;
  })();
  raiz.classList.add("op-" + OPCION);
  {
    // El quinto tema (Agua o Clima) no tiene palabra en la portada desde el 21-nov-2026; su código se queda por si vuelve.
    const b5 = temasEl.querySelector('button[data-tema="clima"]');
    if (b5 && OPCION === "a") { b5.dataset.tema = "agua"; b5.textContent = "Agua"; }
  }
  const palabras = [...temasEl.querySelectorAll("button")];
  const marcarPalabras = () => palabras.forEach((b) => b.setAttribute("aria-pressed", b.dataset.tema === tema ? "true" : "false"));
  const Tm = () => TEMAS[tema];
  const pctX = (x) => { const P = Tm().pasos; return (x - P[0].x) / (P[P.length - 1].x - P[0].x) * 100; };
  function construirPista() {
    const T = Tm(), P = T.pasos;
    document.getElementById("tiempo").classList.toggle("sin-tiempo", !!T.sinTiempo);
    pista.classList.toggle("con-franjas", !!T.franjas);
    marcas.textContent = "";
    if (T.franjas) {
      const fr = nodo("div", null, "franjas"), w = 100 / P.length;
      P.forEach((p, k) => { const sp = nodo("span"); sp.style.left = (pctX(p.x) - w / 2) + "%"; sp.style.width = (w + 0.05) + "%"; sp.style.background = T.franjas[k] || "transparent"; fr.append(sp); });
      marcas.append(fr);
    }
    for (const p of P) { const i = nodo("i"); i.style.left = pctX(p.x) + "%"; marcas.append(i); }
    for (const [x, cls, txt] of T.rotulos || []) {
      if (x < P[0].x || x > P[P.length - 1].x) continue;
      const b = nodo("b", txt || String(x), cls || "");
      b.style.left = pctX(x) + "%";
      if (x === P[0].x) b.style.transform = "none";
      if (x === P[P.length - 1].x) b.style.transform = "translateX(-100%)";
      marcas.append(b);
    }
    pista.setAttribute("aria-valuemin", 0); pista.setAttribute("aria-valuemax", P.length - 1);
  }
  function ponerMango(x) { const p = pctX(x); mango.style.left = p + "%"; hecho.style.width = p + "%"; }
  function irPaso(i) {
    const T = Tm(), p = T.pasos[i];
    iSel = i; pasoGuardado[tema] = i; tX = p.x;
    anioEl.textContent = p.grande;
    extraEl.textContent = p.extra || "";
    notaEl.textContent = p.nota || ""; notaEl.hidden = !p.nota;
    pista.setAttribute("aria-valuenow", i);
    pista.setAttribute("aria-valuetext", [p.grande, p.extra, p.nota].filter(Boolean).join(", "));
    ponerMango(p.x);
    T.mostrar(i);
    leyendaEl.innerHTML = T.leyenda(i);
    refrescarFicha();
    sucio = true;
  }
  async function verTema(t, conMovimiento) {
    if (t === tema) return;
    const T = TEMAS[t], mio = ++turno;
    parar();
    if (tema) TEMAS[tema].salir();
    tema = t;
    marcarPalabras();
    if (!T.listo) {
      anioEl.textContent = "…"; extraEl.textContent = ""; notaEl.hidden = true; marcas.textContent = ""; leyendaEl.textContent = "";
      pintarCapa(null, 0.4);
      try { await (T.cargando || (T.cargando = T.preparar())); T.listo = true; }
      catch (e) { T.cargando = null; console.warn("Portada F: no se pudo cargar el tema " + t, e); if (mio === turno) anioEl.textContent = "—"; return; }
      if (mio !== turno) return;
    }
    construirPista();
    T.entrar();
    // Siempre en un año con datos de ese tema (el primero o el más representativo), y desde ahí se cuenta solo.
    const i = T.inicio != null ? Math.max(0, T.pasos.findIndex((p) => p.x >= T.inicio)) : 0;
    irPaso(i);
    // La primera vez, el tema se cuenta solo desde su primera fecha; si se vuelve a él, sigue donde se quedó.
    if (conMovimiento && !reducir.matches && i < T.pasos.length - 1) reproducir();
  }
  // Pista «Pasa el cursor por cada palabra»: se desvanece tras el primer cambio que hace la persona.
  let tPalabra = 0;
  const avisoEl = document.getElementById("avisoTemas");
  const elegir = (t) => { if (t !== tema) avisoEl.classList.add("visto"); verTema(t, true); };
  for (const b of palabras) {
    b.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(tPalabra);
      tPalabra = setTimeout(() => elegir(b.dataset.tema), 90);
    });
    b.addEventListener("pointerleave", () => clearTimeout(tPalabra));
    b.addEventListener("focus", () => elegir(b.dataset.tema));
    b.addEventListener("click", () => {
      clearTimeout(tPalabra);
      if (tema !== b.dataset.tema) elegir(b.dataset.tema);
      else if (Tm().listo && !reproduciendo && !reducir.matches) reproducir();
    });
  }
  // Precarga callada de los otros dos temas cuando la portada ya está quieta.
  function precargar() {
    let cadena = Promise.resolve();
    for (const t of palabras.map((b) => b.dataset.tema).filter((t) => t !== "poblacion")) {   // solo los que tienen palabra
      cadena = cadena.then(() => { const T = TEMAS[t]; if (T.listo || T.cargando) return T.cargando; return (T.cargando = T.preparar().then(() => { T.listo = true; }, (e) => { T.cargando = null; console.warn("Portada F: precarga de " + t, e); })); });
    }
  }

  // ---------- Línea temporal ----------
  function reproducir() {
    const P = Tm().pasos;
    if (iSel >= P.length - 1) irPaso(0);
    reproduciendo = true; autoplay = 0; tPaso = performance.now();
    playIco.setAttribute("d", "M4 3h4v14H4zM12 3h4v14h-4z"); playBtn.setAttribute("aria-label", "Pausar");
    if (tema === "poblacion") TEMAS.poblacion.mostrar(iSel);
  }
  function parar() {
    reproduciendo = false; autoplay = 0;
    playIco.setAttribute("d", "M5 3l12 7-12 7z"); playBtn.setAttribute("aria-label", "Reproducir");
  }
  function pasoDeX(cx) {
    const P = Tm().pasos, r = pista.getBoundingClientRect();
    const t = P[0].x + Math.min(1, Math.max(0, (cx - r.left) / r.width)) * (P[P.length - 1].x - P[0].x);
    let mejor = 0;
    P.forEach((p, i) => { if (Math.abs(p.x - t) < Math.abs(P[mejor].x - t)) mejor = i; });
    return mejor;
  }
  playBtn.addEventListener("click", () => { if (!tema || !Tm().listo) return; reproduciendo ? parar() : reproducir(); });
  pista.addEventListener("pointerdown", (e) => {
    if (!tema || !Tm().listo) return;
    pista.setPointerCapture(e.pointerId); arrastrePista = true; parar(); irPaso(pasoDeX(e.clientX));
  });
  pista.addEventListener("pointermove", (e) => { if (arrastrePista) { const i = pasoDeX(e.clientX); if (i !== iSel) irPaso(i); } });
  pista.addEventListener("pointerup", () => { arrastrePista = false; });
  pista.addEventListener("pointercancel", () => { arrastrePista = false; });
  pista.addEventListener("keydown", (e) => {
    if (!tema || !Tm().listo) return;
    const n = Tm().pasos.length;
    let j;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") j = Math.min(n - 1, iSel + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") j = Math.max(0, iSel - 1);
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = n - 1;
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); reproduciendo ? parar() : reproducir(); return; }
    else return;
    e.preventDefault(); parar(); irPaso(j);
  });

  // ---------- Cursor: nombre del municipio y lo que dice el tema ----------
  const ficha = document.getElementById("ficha");
  const rayo = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4();
  const o = new THREE.Vector3(), dir = new THREE.Vector3();
  let sobre = -1, abajo = null, arrastre = false, ultimaFicha = { x: 0, y: 0, tactil: false }, puntoBajo = null;
  function municipioBajo(cx, cy) {
    const r = lienzo.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(ndc, camara);
    inv.copy(maqueta.matrixWorld).invert();
    o.copy(rayo.ray.origin).applyMatrix4(inv);
    dir.copy(rayo.ray.direction).transformDirection(inv);
    const techo = HMAX + 1;
    if (o.y > techo && dir.y >= 0) return -1;
    const t0 = o.y > techo ? (techo - o.y) / dir.y : 0;
    const t1 = dir.y < 0 ? -o.y / dir.y : t0 + 3000;
    const n = Math.min(900, Math.max(40, Math.ceil(Math.hypot(dir.x, dir.z) * (t1 - t0) / 0.35)));
    for (let k = 0; k <= n; k++) {
      const t = t0 + (t1 - t0) * k / n;
      const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t;
      const i = municipioEn(x, -z);
      if (i < 0) continue;
      const h = modo === "municipios" ? munis[i].h : alturaEn(x, -z);
      if (h != null && y <= h + 1e-3) { puntoBajo = [x, -z]; return i; }
    }
    return -1;
  }
  const rutaFicha = (c) => RAIZ + "visor.html?mun=" + encodeURIComponent(c);
  function abrirFicha(c) {
    const a = document.createElement("a");
    a.href = rutaFicha(c); a.target = "_top";
    document.body.appendChild(a); a.click(); a.remove();
  }
  function mostrarFicha(i, cx, cy, tactil) {
    ultimaFicha = { x: cx, y: cy, tactil };
    const m = munis[i];
    ficha.textContent = "";
    const b = document.createElement("b"); b.textContent = m.n;
    const s = document.createElement("span"); s.textContent = provincias[m.p] ? "provincia de " + provincias[m.p] : "";
    const extra = tema && Tm().listo ? Tm().ficha(iSel, m, puntoBajo) : [];
    if (extra && extra.ocultar) { ficha.hidden = true; return; }
    const propia = !!(extra && extra.sustituye);
    if (propia) ficha.append(...extra.nodos); else ficha.append(b, s, ...extra);
    if (tactil) {
      const a = document.createElement("a");
      a.href = rutaFicha(m.c); a.target = "_top"; a.textContent = propia ? "Abrir la ficha de " + m.n : "Abrir su ficha en el atlas";
      ficha.append(a);
    } else {
      const e = document.createElement("em"); e.textContent = propia ? "Pincha para abrir la ficha de " + m.n : "Pincha para abrir su ficha";
      ficha.append(e);
    }
    ficha.classList.toggle("tactil", !!tactil);
    ficha.hidden = false;
    const fw = ficha.offsetWidth, fh = ficha.offsetHeight;
    let x = cx + 16, y = cy + 18;
    if (x + fw > innerWidth - 8) x = cx - fw - 16;
    if (y + fh > innerHeight - 8) y = cy - fh - 14;
    ficha.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  function ocultarFicha() { ficha.hidden = true; if (rioMalla) resaltarRio(null); }
  function refrescarFicha() { if (sobre >= 0 && !ficha.hidden) mostrarFicha(sobre, ultimaFicha.x, ultimaFicha.y, ultimaFicha.tactil); }
  function ponerSobre(i) {
    if (i === sobre) return;
    sobre = i;
    marcar(tema && TEMAS[tema].rio ? -1 : i);   // con los ríos, se resalta el río, no el municipio
    lienzo.style.cursor = i >= 0 ? "pointer" : "";
  }
  lienzo.addEventListener("pointerdown", (e) => { abajo = { x: e.clientX, y: e.clientY, t: performance.now() }; arrastre = false; });
  lienzo.addEventListener("pointermove", (e) => {
    if (abajo && Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > 6) { arrastre = true; ocultarFicha(); }
    if (e.pointerType !== "mouse") return;
    puntero = { x: e.clientX, y: e.clientY };
    pendiente = !abajo;
    ultimoGesto = performance.now(); enCalma = false;
  });
  lienzo.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { puntero = null; ponerSobre(-1); ocultarFicha(); } });
  lienzo.addEventListener("pointercancel", () => { abajo = null; });
  lienzo.addEventListener("pointerup", (e) => {
    const ab = abajo; abajo = null;
    if (!ab || arrastre || performance.now() - ab.t > 450) return;
    const i = municipioBajo(e.clientX, e.clientY);
    if (e.pointerType === "mouse") { if (i >= 0) abrirFicha(munis[i].c); return; }
    ponerSobre(i);
    if (i >= 0) mostrarFicha(i, e.clientX, e.clientY, true); else ocultarFicha();
  });
  addEventListener("scroll", () => { if (ficha.classList.contains("tactil")) ocultarFicha(); }, { passive: true });
  // Por defecto, Paisajes (Juan, 20-nov-2026): se carga mientras sube la maqueta y entra con la ola al acabar de subir.
  const TEMA0 = "paisajes";
  palabras.forEach((b) => b.setAttribute("aria-pressed", b.dataset.tema === TEMA0 ? "true" : "false"));
  anioEl.textContent = ""; leyendaEl.textContent = "";
  if (reducir.matches) verTema(TEMA0, false);
  else TEMAS[TEMA0].cargando = TEMAS[TEMA0].preparar().then(() => { TEMAS[TEMA0].listo = true; }, (e) => { TEMAS[TEMA0].cargando = null; console.warn("Portada F: Paisajes", e); });

  // ---------- Velo de cerámica alrededor del cursor ----------
  // Solo con ratón (en táctil no hay nada). Sin cursor sobre el mapa, o quieto unos segundos, la portada vuelve a su
  // estado de reposo. Con movimiento reducido aparece y desaparece sin animación.
  const conRaton = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const lazo = document.getElementById("lazo"), tela = document.getElementById("lazoTela");
  const lente = { lista: false, sobre: false, x: 0, y: 0, ox: 0, oy: 0, t: -Infinity, f: 0, R: 170, tz: -Infinity, clave: "", rects: [] };
  const SEL_ZONAS = [".cab h1", ".cab .entra", ".cab .entrar", ".esquina", "#tiempo"];
  function medirLente() {
    const { w, h } = tam(), pr = renderer.getPixelRatio();
    lente.R = Math.max(130, Math.min(230, Math.min(w, h) * 0.235));
    lazo.style.width = lazo.style.height = lente.R * 2 + "px";
    const rects = SEL_ZONAS.map((q) => document.querySelector(q).getBoundingClientRect());
    lente.rects = rects;
    rects.forEach((r, i) => uSel.zonasUI.value[i].set(r.left * pr, (h - r.bottom) * pr, r.right * pr, (h - r.top) * pr));
    const clave = [w, h, ...rects.map((r) => [r.left, r.top, r.right, r.bottom].map(Math.round).join())].join("|");
    if (clave !== lente.clave) { lente.clave = clave; pintarTela(tela, w, h, Math.min(window.devicePixelRatio || 1, 1.5), rects); }
  }
  async function prepararCeramica() {
    if (!conRaton || lente.lista) return;
    const CW = Math.min(renderer.capabilities.maxTextureSize, 3072), CH = Math.round(CW * lienzoTex.height / lienzoTex.width);
    const lc = document.createElement("canvas");
    lc.width = CW; lc.height = CH;
    const cRios = Object.keys(riosTopo.objects)[0];
    const mallaRios = [1, 2].map((n) => topojson.mesh(riosTopo, { type: "GeometryCollection", geometries: riosTopo.objects[cRios].geometries.filter((g) => g.properties && g.properties.nivel === n) }));
    const mallas = {
      terminos: topojson.mesh(muniTopo, muniTopo.objects.municipios, (a, b) => a !== b),
      provincias: topojson.mesh(muniTopo, muniTopo.objects.provincias, (a, b) => a !== b),
      contorno: topojson.mesh(muniTopo, muniTopo.objects.andalucia),
      rios: mallaRios,
    };
    await pausa();
    const km = {
      x0: gx0, y0: gy0, x1: Math.max(...munis.map((m) => m.bb[2])), y1: Math.max(...munis.map((m) => m.bb[3])), aLon: iX, aLat: iY,
      dentro: (x, y) => municipioEn(x, y) >= 0,
      porKmX: CW / ((lim.east - lim.west) * KX), porKmY: CH / ((lim.north - lim.south) * KY),
    };
    const gen = pintarCeramica(lc.getContext("2d"), CW, CH, lim, mallas, km);
    for (let r = gen.next(); !r.done;) {
      const t0 = performance.now();
      while (!r.done && performance.now() - t0 < 6) r = gen.next();
      if (!r.done) await pausa();
    }
    const tx = new THREE.CanvasTexture(lc);
    tx.colorSpace = THREE.SRGBColorSpace; tx.premultiplyAlpha = true;
    tx.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    await pausa();
    renderer.initTexture(tx);
    uSel.ceramica.value = tx;
    lente.lista = true;
  }
  if (conRaton) {
    lienzo.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = lienzo.getBoundingClientRect();
      lente.ox = e.clientX - r.left; lente.oy = e.clientY - r.top; lente.t = performance.now();
      if (!lente.sobre || lente.f === 0) { lente.x = lente.ox; lente.y = lente.oy; lente.tz = -Infinity; }
      lente.sobre = true;
    });
    lienzo.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") lente.sobre = false; });
    setTimeout(() => {
      const arrancar = () => prepararCeramica().catch((e) => console.warn("Portada F: sin velo de cerámica.", e));
      if ("requestIdleCallback" in window) requestIdleCallback(arrancar, { timeout: 2500 }); else arrancar();
    }, 3400);
  }
  function moverLente(ahora, dt) {
    if (!lente.lista) return false;
    if (lente.sobre && ahora - lente.tz > 400) { medirLente(); lente.tz = ahora; }
    const sobreTexto = lente.rects.some((r) => lente.ox > r.left - 16 && lente.ox < r.right + 16 && lente.oy > r.top - 16 && lente.oy < r.bottom + 16);
    const activa = lente.sobre && !sobreTexto && !gesto && !abajo && ahora - lente.t < 3200;
    if (!activa && lente.f === 0) return false;
    const antes = [lente.x, lente.y, lente.f];
    if (reducir.matches) { lente.x = lente.ox; lente.y = lente.oy; lente.f = activa ? 1 : 0; }
    else {
      const k = 1 - Math.exp(-dt / 60);
      lente.x += (lente.ox - lente.x) * k; lente.y += (lente.oy - lente.y) * k;
      if (Math.abs(lente.ox - lente.x) + Math.abs(lente.oy - lente.y) < 0.2) { lente.x = lente.ox; lente.y = lente.oy; }
      lente.f = activa ? Math.min(1, lente.f + dt / 240) : Math.max(0, lente.f - dt / 520);
    }
    if (antes[0] === lente.x && antes[1] === lente.y && antes[2] === lente.f) return false;
    const pr = renderer.getPixelRatio(), { h } = tam();
    uSel.lenteXYR.value.set(lente.x * pr, (h - lente.y) * pr, lente.R * pr);
    uSel.lenteFuerza.value = lente.f;
    lazo.style.opacity = lente.f.toFixed(3);
    lazo.style.transform = `translate(${(lente.x - lente.R).toFixed(1)}px, ${(lente.y - lente.R).toFixed(1)}px)`;
    tela.style.transform = `translate(${(lente.R - lente.x).toFixed(1)}px, ${(lente.R - lente.y).toFixed(1)}px)`;
    return true;
  }

  // ---------- Bucle ----------
  const v = new THREE.Vector3();
  let subida = reducir.matches ? 1 : 0, tSubida = null;
  const DUR_SUBIDA = 2600;
  maqueta.scale.y = reducir.matches ? 1 : 0.02;
  renderer.shadowMap.needsUpdate = true;
  const LIM_X = 300, LIM_Z = 190;
  let tPrev = performance.now(), muestras = 0, acum = 0;

  function rotular() {
    const { w, h } = tam();
    // Cada rótulo encima de su columna, dentro de la pantalla; si choca con otro, sube por encima de él.
    const vistos = [];
    for (const k of caps) {
      const c = cols[k.i];
      v.set(c.x, c.base + c.cur + 2.2, -c.y).applyMatrix4(maqueta.matrixWorld).project(camara);
      if (v.z > 1) { k.el.style.visibility = "hidden"; continue; }
      k.el.style.visibility = "";
      if (!k.ancho) { k.ancho = k.el.offsetWidth; k.alto = k.el.offsetHeight; }
      const x = Math.min(w - 6 - k.ancho / 2, Math.max(6 + k.ancho / 2, (v.x + 1) / 2 * w));
      vistos.push({ k, izq: x - k.ancho / 2, arr: (1 - v.y) / 2 * h - k.alto });
    }
    vistos.sort((p, q) => q.arr - p.arr);
    const puestos = [];
    for (const r of vistos) {
      for (let vuelta = 0; vuelta < 3; vuelta++) {
        let movido = false;
        for (const p of puestos) {
          if (r.izq < p.izq + p.k.ancho + 3 && r.izq + r.k.ancho > p.izq - 3 && r.arr < p.arr + p.k.alto + 3 && r.arr + r.k.alto > p.arr - 3) {
            r.arr = p.arr - r.k.alto - 4; movido = true;
          }
        }
        if (!movido) break;
      }
      puestos.push(r);
      r.k.el.style.transform = `translate(${r.izq.toFixed(1)}px, ${r.arr.toFixed(1)}px)`;
    }
    const dCerca = camara.position.distanceTo(mandos.target);
    raiz.classList.toggle("cerca", dCerca < distancia0 * 0.8 || Math.abs(camara.position.y - mandos.target.y) < dCerca * 0.42);
  }

  function bucle(ahora) {
    requestAnimationFrame(bucle);
    const bruto = ahora - tPrev, dt = Math.min(100, bruto); tPrev = ahora;
    if (!visible) return;
    let continuo = false;
    // Subida inicial: la maqueta se alza desde el plano; luego empieza a correr el tiempo.
    if (subida < 1) {
      if (tSubida === null) tSubida = ahora;
      subida = Math.min(1, (ahora - tSubida) / DUR_SUBIDA);
      const e = 1 - Math.pow(1 - subida, 3);
      maqueta.scale.y = 0.02 + 0.98 * e;
      renderer.shadowMap.needsUpdate = true;
      continuo = true;
      if (puntero) pendiente = true;
      if (subida >= 1) {
        if (!reducir.matches && tema === null) verTema(TEMA0, true);
        setTimeout(precargar, 2500);
      }
    }
    if (autoplay && ahora >= autoplay && tema) reproducir();
    // Reproducción: avanza por las fechas del tema; cada paso se sostiene lo que pida el tema.
    if (reproduciendo && tema && Tm().listo) {
      const T = Tm(), P = T.pasos, sig = P[iSel + 1];
      if (!sig) parar();
      else {
        tX = Math.min(sig.x, tX + T.vel(tX) * dt / 1000);
        ponerMango(tX);
        if (tX >= sig.x && ahora - tPaso >= T.espera(P[iSel]) * 1000) { irPaso(iSel + 1); tPaso = ahora; }
        continuo = true;
      }
    }
    // Capa que se está pintando por partes, trazos de vías que se abren.
    if (seguirTrabajo()) continuo = true;
    if (trazos.length && animarTrazos(ahora, dt)) continuo = true;
    // Clima: fundido entre años de la neblina y su entrada o salida.
    {
      const nm = uSel.nieblaMezcla.value, no = uSel.nieblaOn.value;
      if (nm !== nieblaObj) { const d = nieblaDur ? dt / 1000 / nieblaDur : 1; uSel.nieblaMezcla.value = nm < nieblaObj ? Math.min(nieblaObj, nm + d) : Math.max(nieblaObj, nm - d); continuo = true; }
      if (no !== nieblaOnObj) { const d = reducir.matches ? 1 : dt / 700; uSel.nieblaOn.value = no < nieblaOnObj ? Math.min(nieblaOnObj, no + d) : Math.max(nieblaOnObj, no - d); continuo = true; }
    }
    // Agua: la capa respira despacio.
    if (tema === "agua" && !reducir.matches) { uSel.brillo.value = 1 + 0.11 * Math.sin(ahora / 1000 * 2 * Math.PI / 5.5); continuo = true; }
    if (moverLente(ahora, dt)) sucio = true;
    // Fundido entre las capas del tema.
    const mz = uSel.mezcla.value;
    if (mz !== mezclaObj) {
      const d = durMezcla ? dt / 1000 / durMezcla : 1;
      uSel.mezcla.value = mz < mezclaObj ? Math.min(mezclaObj, mz + d) : Math.max(mezclaObj, mz - d);
      continuo = true;
    }
    // Columnas y estaciones: crecen o se encienden hacia lo que pide el paso.
    if (moverColumnas(dt, false)) continuo = true;
    if (moverEstaciones(dt, false)) continuo = true;
    // En calma (4 s sin tocar ni recorrer el mapa), la maqueta vuelve despacio a su posición normal, norte arriba y
    // centrada, y desde ahí deriva muy poco (unos 4 grados) y muy despacio. Al cargar ya está en esa posición.
    if (!reducir.matches && !gesto && ahora - ultimoGesto > 4000) {
      if (!enCalma) { enCalma = true; t0Calma = ahora; }
      const tc = (ahora - t0Calma) / 1000, r = Math.min(1, tc / 6), rampa = r * r * (3 - 2 * r), v0 = vista0();
      const az = v0.az + 0.07 * Math.sin(tc * 2 * Math.PI / 44) * rampa;
      const pol = v0.pol + 0.02 * Math.sin(tc * 2 * Math.PI / 31) * rampa;
      const k = 1 - Math.exp(-dt / 900);
      mandos.target.lerp(objetivo0, k);
      v.copy(camara.position).sub(mandos.target);
      const sf = new THREE.Spherical().setFromVector3(v);
      sf.radius += (distancia0 - sf.radius) * k;
      sf.phi += (pol - sf.phi) * k;
      const dA = Math.atan2(Math.sin(az - sf.theta), Math.cos(az - sf.theta));
      sf.theta += dA * k;
      v.setFromSpherical(sf);
      camara.position.copy(mandos.target).add(v);
      continuo = true;
      if (puntero) pendiente = true;
    }
    mandos.update();
    const tg = mandos.target, cx = Math.max(-LIM_X, Math.min(LIM_X, tg.x)), cz = Math.max(-LIM_Z, Math.min(LIM_Z, tg.z));
    if (cx !== tg.x || cz !== tg.z) { camara.position.x += cx - tg.x; camara.position.z += cz - tg.z; tg.x = cx; tg.z = cz; }

    if (pendiente && puntero) {
      pendiente = false;
      const i = municipioBajo(puntero.x, puntero.y);
      ponerSobre(i);
      if (i >= 0) mostrarFicha(i, puntero.x, puntero.y, false); else ocultarFicha();
    }
    if (sucio || continuo) {
      maqueta.updateMatrixWorld();
      renderer.render(escena, camara);
      rotular();
      sucio = false;
      // Si va lento (gráficos integrados), baja la resolución hasta llegar a ~60 fps.
      if (continuo && bruto < 1500) {
        acum += bruto; muestras++;
        if (muestras >= 90 || acum >= 1500) {
          if (acum / muestras > 20 && pr > 0.75) { pr = Math.max(0.75, pr - 0.25); renderer.setPixelRatio(pr); encuadre(); }
          muestras = 0; acum = 0;
        }
      }
    }
  }
  moverColumnas(16, true);
  moverLosas();
  maqueta.updateMatrixWorld();
  renderer.render(escena, camara);
  raiz.classList.remove("cargando");
  raiz.classList.add("listo", "modo-" + modo);
  raiz.dataset.modo = modo;
  requestAnimationFrame(bucle);
}

iniciar().catch(aRespaldo);
