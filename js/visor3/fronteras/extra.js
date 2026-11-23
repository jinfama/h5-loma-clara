// extra.js — dos indicadores más del tema «Cambios de fronteras» (RONDA_V6.md):
// · «Segregaciones y agregaciones» (ronda v15, Juan: «sí me gusta lo de segregaciones y agregaciones»): un fotograma por
//   intervalo entre dos censos (1842–1857 … 2011–2021) con los municipios de hoy que se segregan o nacen, los que se
//   agregan, se les agrega otro o se fusionan, los que pierden la parte que se segrega y, discretos, otros cambios
//   (traspasos de parte del término, restituciones, segregaciones temporales); el resto, neutro. Sale de
//   fronteras/historia.json (`rel`: t tipo, rol o/d, d/h intervalo de censos, f fecha, c cita, l localizador, s fuente);
//   las relaciones en revisión (antes de 1842) no cuentan. Cada cambio va al intervalo que acaba en el primer censo que
//   ya lo recoge. Es un recuento de registros: no se reparte ni se estima nada.
// · «Catastro de Ensenada (1752)»: los términos de 1752 con el panel abierto en el bloque Ensenada.

import { registrarIndicador } from '../registro.js';
import { base } from './base.js';
import { proveedorFronteras } from './indicador.js';
import { montarPanel } from './panel.js';
import { mapa } from '../mapa/index.js';
import { M } from '../motor.js';
import { esc, entero } from '../../atlas2/fmt.js';
import { relacionesDeTermino, claseCambio, fraseCambio, fechaLlana, finDe, corteTras, nombreOtra, fuentesCorto } from '../../fronteras/ficha.js';

// colores: naranja teja para lo que se segrega o nace (y su tono claro para el municipio del que se segrega), azul para
// lo que se agrega o se fusiona, gris parduzco discreto para lo demás, y el resto en el neutro de los términos
const CLASES = [
  { k: 'nace', color: '#d2602f', txt: 'Se segrega: nace como municipio' },
  { k: 'pierde', color: '#f2bb98', txt: 'Se le segrega una parte de su término' },
  { k: 'agrega', color: '#2f6db3', txt: 'Se agrega a otro, se le agrega otro o se fusiona' },
  { k: 'otro', color: '#a99f8b', txt: 'Otros cambios: traspasos de parte del término, restituciones' },
  { k: 'nada', color: '#ebe8e0', txt: 'Sin cambios en ese intervalo' },
];
const COLOR = Object.fromEntries(CLASES.map(c => [c.k, c.color]));
const ORDEN = ['nace', 'agrega', 'pierde', 'otro'];   // si un municipio tiene varios cambios en el intervalo, manda el primero
const CORTO = { nace: 'Se segrega', pierde: 'Pierde una parte', agrega: 'Se agrega o se fusiona', otro: 'Otro cambio' };

let F = [], porFot = [], idsFot = [], cargado = null;
async function carga() {
  if (cargado) return cargado;
  cargado = (async () => {
    const B = await base();
    const hist = await B.historia();
    const cortes = B.cortes.filter(c => c !== 'hoy' && +c >= 1842);   // 1842 … 2021
    // un fotograma por intervalo entre censos; el de «hoy» no se pone: la tabla llega a 2021
    F = cortes.slice(1).map((c, k) => ({ clave: c, anio: +c, desde: cortes[k], etiqueta: `${cortes[k]}–${c}`, corto: String(c), hito: true, avisos: [], fuentes: ['INE-ALT-XLS'], nota: '' }));
    porFot = F.map(() => new Map()); idsFot = F.map(() => new Set());
    const fuentesFot = F.map(() => new Set());
    for (const [ine, h] of hist) {
      for (const r of relacionesDeTermino(h)) {
        const fin = finDe(r); if (fin == null) continue;
        const k = F.findIndex(f => f.clave === corteTras(fin, cortes));
        if (k < 0) continue;
        const m = porFot[k];
        if (!m.has(String(ine))) m.set(String(ine), []);
        m.get(String(ine)).push(r);
        idsFot[k].add(r.id);
        r.fuentes.forEach(id => fuentesFot[k].add(id));
      }
    }
    F.forEach((f, k) => { if (fuentesFot[k].size) f.fuentes = [...fuentesFot[k]]; });
  })();
  cargado.catch(() => { cargado = null; });
  return cargado;
}
const relsDe = (i, ine) => (porFot[i] && porFot[i].get(String(ine))) || [];
const claseDe = rs => ORDEN.find(k => rs.some(r => claseCambio(r) === k)) || 'nada';
// «se segrega de Serón · 2 de febrero de 2015 · INE, alteraciones de los municipios»
const lineaDe = (r, f) => {
  const cuando = r.fecha ? fechaLlana(r.fecha) : (r.desde != null && r.hasta != null && (String(r.desde) !== f.desde || String(r.hasta) !== f.clave) ? `entre el censo de ${r.desde} y el de ${r.hasta}` : '');
  return [fraseCambio(r.tipo, r.rol, [nombreOtra(r)]), cuando, fuentesCorto(r).join('; ')].filter(Boolean).join(' · ');
};

registrarIndicador({
  id: 'fronteras_cambios', tema: 'fronteras', grupo: 'Segregaciones y agregaciones', rotulo: 'Segregaciones y agregaciones',
  titulo: 'Segregaciones y agregaciones', kicker: 'Pueblos y fronteras', periodo: '1842 – 2021', unidad: 'cambios',
  niveles: ['municipio'], nivel_nativo: 'municipio', agregacion: 'no', fuentes: ['INE-ALT-XLS'],
  entradilla: 'Entre cada censo y el siguiente, qué municipios de hoy se segregan y cuáles se agregan o se fusionan, según el INE.',
  nota: 'Segregaciones, agregaciones, fusiones y traspasos de término entre dos censos seguidos, según las alteraciones de los municipios del INE (y las normas que cita). Lo anterior a 1842 está en revisión y no se cuenta.',
  acento: '#d2602f',
  async cargar() { await carga(); },
  fotogramas: () => F,
  temporal: () => true,
  relleno: (i) => (ine) => ({ color: COLOR[claseDe(relsDe(i, ine))], est: false }),
  leyenda: () => ({
    tipo: 'categorias', titulo: 'Qué pasa entre un censo y el siguiente',
    items: CLASES.map(c => ({ color: c.color, etiqueta: c.txt })),
    nota: 'Cada mapa es un intervalo entre dos censos. Según el INE (alteraciones de los municipios) y las normas que cita; solo los cambios que tocan a algún municipio de hoy. Lo anterior a 1842 está en revisión y no se cuenta.',
  }),
  cifra: (i) => {
    if (!F[i]) return null;
    const n = idsFot[i].size;
    return { valor: entero(n), unidad: n === 1 ? 'cambio' : 'cambios', etiqueta: `Andalucía: cambios de término entre ${F[i].desde} y ${F[i].clave}` };
  },
  serieAndalucia: () => F.map((f, i) => ({ i, v: idsFot[i].size })),
  detalle: (i, ine, d) => {
    const f = F[i]; if (!f) return null;
    const rs = relsDe(i, ine);
    const k = claseDe(rs);
    return { titulo: (d && d.n) || ine, sub: `Entre el censo de ${f.desde} y el de ${f.clave}`, valor: rs.length ? CORTO[k] : '', sinClase: true,
      lineas: rs.length ? rs.map(r => lineaDe(r, f)) : ['Sin cambios de término en este intervalo'] };
  },
  frases: () => [],
  hayEstimado: () => false,
  ritmo: () => 1500,
  claveReservas: null,
});

// «Catastro de Ensenada (1752)»: el mismo indicador de términos, solo en 1752 y con el panel en el bloque Ensenada.
// Desde que hay corte de 1591, 1752 ya no es el primer fotograma: su único fotograma (i = 0) es el de 1752 en el de
// fronteras, y todo lo que va por índice se traslada (también las capas propias, que index.js pide a proveedorFronteras).
const k1752 = () => Math.max(0, proveedorFronteras.fotogramas().findIndex(f => f.clave === '1752'));
const enEns = i => (i || 0) + k1752();
const capasDeFronteras = proveedorFronteras._capas;
proveedorFronteras._capas = i => capasDeFronteras(M.ind === 'fronteras_ensenada' ? enEns(i) : i);
const ensenada = Object.create(proveedorFronteras);
Object.defineProperty(ensenada, 'anios', { get: () => [1752], enumerable: true });
Object.assign(ensenada, {
  id: 'fronteras_ensenada', grupo: 'Catastro de Ensenada (1752)', rotulo: 'Catastro de Ensenada (1752)', titulo: 'Catastro de Ensenada (1752)',
  subrotulo: '', periodo: '1752',
  fotogramas: () => { const k = k1752(); return proveedorFronteras.fotogramas().slice(k, k + 1); },
  capaDe: i => proveedorFronteras.capaDe(enEns(i)),
  relleno: i => proveedorFronteras.relleno(enEns(i)),
  detalle: (i, id, d, n) => proveedorFronteras.detalle(enEns(i), id, d, n),
  cifra: i => proveedorFronteras.cifra(enEns(i)),
  leyenda: i => proveedorFronteras.leyenda(enEns(i)),
  ritmo: () => 2600,
  temporal: () => false,
  frases: () => [],
  serieAndalucia: () => null,
  panel: (el) => {
    const inst = montarPanel(el, { repintar: () => mapa.repintar() });
    const t = el.querySelector('#v3f-tab-ens'); if (t) t.click();
    return inst;
  },
});
registrarIndicador(ensenada);
void esc;
