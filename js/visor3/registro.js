// registro.js — dónde se enchufan las vistas, los indicadores con proveedor propio y la ficha (VISOR3_API.md §4, §5, §7).

import { emit, registrarClaves } from './estado.js';

export const VISTAS = new Map();
export const PROVEEDORES = new Map();
export const MODOS = new Map();

// Un MODO es una pantalla propia del visor (ronda v13: «Análisis»), no una vista de un indicador. VISOR3_API.md §4 bis.
// registrarModo('analisis', { rotulo, cabecera: { titulo, sub } | (ctx) => ({ titulo, sub }), panelIzquierdo(el, ctx),
//   centro(el, ctx), actualizar(ctx, claves), destruir(), lineaTiempo: true (si quiere la general; por defecto no),
//   seleccion: true (si quiere la tira de selección general; por defecto no), claves: { ax: 'txt', … },
//   exportar(ctx), imagen(ctx), fuentePNG(ctx) })
export function registrarModo(id, def) {
  if (!id || !def) { console.error('[visor3] registrarModo: falta id o definición'); return; }
  MODOS.set(id, { id, rotulo: id, lineaTiempo: false, seleccion: false, ...def });
  if (def.claves) registrarClaves(def.claves, '@' + id);   // sus claves van en la URL mientras el modo está activo
  emit('registro', { tipo: 'modo', id });
}
export let FICHA = null;

export function registrarVista(v) {
  if (!v || !v.id || typeof v.mount !== 'function') { console.error('[visor3] registrarVista: falta id o mount', v); return; }
  VISTAS.set(v.id, { orden: 50, usaAnio: false, nivelPreferido: 'nativo', admite: () => true, update() {}, destroy() {}, ...v });
  // opcionales (VISOR3_API.md): claves propias en la URL, icono (<path…> de 24 × 24), principal (rótulo y pestaña en
  // móvil), leyenda: false (sin «Trazos» debajo), exportar() y imagen() (el pie de «Descargar datos» y «PNG»)
  if (v.claves) registrarClaves(v.claves, v.id);
  emit('registro', { tipo: 'vista', id: v.id });
}

export function registrarIndicador(p) {
  if (!p || !p.id) { console.error('[visor3] registrarIndicador: falta id', p); return; }
  PROVEEDORES.set(p.id, p);
  emit('registro', { tipo: 'indicador', id: p.id });
}

export function registrarFicha(f) {
  FICHA = f;
  emit('registro', { tipo: 'ficha' });
}

export function vistasOrdenadas() {
  return [...VISTAS.values()].sort((a, b) => a.orden - b.orden);
}
