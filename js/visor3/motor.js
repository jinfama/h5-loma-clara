// motor.js — el reproductor del visor: indicador y nivel activos, sus fotogramas, el fotograma actual, reproducir,
// velocidad. Lo comparten todas las vistas con `usaAnio`; emite `anio` en cada fotograma (VISOR3_API.md §2).

import { estado, setEstado, emit } from './estado.js';
import { PROVEEDORES } from './registro.js';
import { indicador } from './datos.js';
import { proveedorGenerico } from './proveedores/generico.js';
import { cargarSiHay } from '../atlas2/data.js';
import { reduceMotion } from '../atlas2/fmt.js';
import { ponReservas, reservasDe } from '../timelapses/temas/base.js';

export const M = { prov: null, ind: null, nivel: null, F: [], i: 0, playing: false, acc: 0, last: 0, raf: 0, token: 0 };
const genericos = new Map();
let reservas = null;

export function proveedorDe(ind) {
  if (PROVEEDORES.has(ind)) return PROVEEDORES.get(ind);
  const ent = indicador(ind);
  if (!ent) return null;
  if (!genericos.has(ind)) genericos.set(ind, proveedorGenerico(ent));
  return genericos.get(ind);
}

// Activa un indicador a un nivel: carga lo necesario, arma los fotogramas y los anota con las reservas.
export async function activar(ind, nivel) {
  const tok = ++M.token;
  pausa();
  const prov = proveedorDe(ind);
  if (!prov) throw new Error(`Indicador desconocido: ${ind}`);
  if (!reservas) reservas = cargarSiHay('reservas.json').then(ponReservas);
  await reservas;
  await prov.cargar(nivel);
  if (prov.activar) await prov.activar(nivel);
  if (tok !== M.token) return false;          // otra activación pasó por delante
  M.prov = prov; M.ind = ind; M.nivel = nivel;
  M.F = (prov.fotogramas(nivel) || []).map(f => f);
  anotaReservas(prov, M.F);
  emit('motor', { prov, F: M.F, ind, nivel });
  return true;
}

function anotaReservas(prov, F) {
  for (const f of F) {
    const rs = reservasDe(prov.claveReservas, f.corte ?? f.clave);
    f._res = rs;
    f._resProv = new Set(rs.flatMap(r => r.provincias || []).map(String));
    if (rs.length) f.avisos = [...rs.map(r => ({ tipo: 'revision', texto: r.rotulo, reserva: true })), ...(f.avisos || []).filter(a => !a.reserva)];
  }
}

export function indiceDe(anio) {
  if (anio == null || !M.F.length) return -1;
  const k = M.F.findIndex(f => String(f.clave) === String(anio));
  if (k >= 0) return k;
  const y = +String(anio).replace(/\D/g, '');
  if (!isFinite(y) || !y) return -1;
  let best = -1, bd = Infinity;
  M.F.forEach((f, j) => { const d = Math.abs((+f.anio || 0) - y); if (d < bd) { bd = d; best = j; } });
  return best;
}

export async function irA(i, { fade = true, url = true } = {}) {
  if (!M.F.length) return;
  i = Math.max(0, Math.min(M.F.length - 1, i));
  if (M.prov.prepararGeo) await M.prov.prepararGeo(M.nivel, i);
  const cambio = i !== M.i;
  const prev = M.i;
  M.i = i; M.acc = 0;
  setEstado({ anio: M.F[i].clave }, { silencioso: true, url });
  emit('anio', { i, prev, anio: M.F[i].clave, fotograma: M.F[i], fade: fade && cambio && !reduceMotion() });
}

export function play() {
  if (!M.F.length) return;
  if (M.i >= M.F.length - 1) irA(0, { fade: false });
  M.playing = true; M.last = performance.now();
  setEstado({ play: true }, { silencioso: true, url: false });
  emit('play');
  M.raf = requestAnimationFrame(tick);
}
export function pausa() {
  if (!M.playing) return;
  M.playing = false;
  cancelAnimationFrame(M.raf);
  setEstado({ play: false }, { silencioso: true, url: false });
  emit('pausa');
}
export function duracion(i) {
  const r = M.prov && M.prov.ritmo ? M.prov.ritmo(i, M.nivel) : 1600;
  return r / (estado.vel || 1);
}
let ocupado = false;
function tick(now) {
  if (!M.playing) return;
  const dt = Math.min(100, now - M.last); M.last = now;
  M.acc += dt;
  emit('tick', { t: M.acc, dur: duracion(M.i) });
  if (M.acc >= duracion(M.i) && !ocupado) {
    if (M.i >= M.F.length - 1) { pausa(); return; }
    ocupado = true;
    irA(M.i + 1, { fade: true }).finally(() => { ocupado = false; });
    // la geometría del siguiente corte se pide antes de que haga falta
    if (M.prov.prepararGeo && M.i + 2 < M.F.length) M.prov.prepararGeo(M.nivel, M.i + 2);
  }
  M.raf = requestAnimationFrame(tick);
}
