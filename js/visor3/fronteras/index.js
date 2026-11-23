// Entrada de js/visor3/fronteras/ (agente de fronteras). Registra el indicador «fronteras» (VISOR3_API.md §4) y su
// panel plegable (municipios por corte + Catastro de Ensenada). Estilos propios en ./fronteras.css.

import { registrarIndicador } from '../registro.js';
import { on, estado } from '../estado.js';
import { proveedorFronteras, rehacerColores, opciones } from './indicador.js';
import { montarPanel } from './panel.js';
import { mapa } from '../mapa/index.js';
import { M } from '../motor.js';

const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('./fronteras.css', import.meta.url).href;
document.head.append(css);

function repintar() { mapa.repintar(); }

// capas propias encima del mapa (lo que cambia, rayado de aproximados, bordes interiores, núcleos y números),
// solo mientras «fronteras» es el indicador del motor
mapa.capa('fronteras', (ctx, path, proj) => {
  if ((M.ind !== 'fronteras' && M.ind !== 'fronteras_ensenada') || !M.prov) return;
  for (const c of proveedorFronteras._capas(M.i)) { ctx.save(); c.dibujar(ctx, path, proj); ctx.restore(); }
});

// panel plegable (municipios por corte + Ensenada): lo monta el armazón en `.v3-panel-ind` (VISOR3_API.md §4, `panel`)
proveedorFronteras.panel = (el) => montarPanel(el, { repintar });
on('tema', () => { rehacerColores(); repintar(); });
// la ficha de un municipio de hoy se marca en el mapa de términos
const marcaFicha = () => {
  const id = String(estado.ficha || '');
  const ine = /^\d{5}$/.test(id) ? id : null;
  if (ine !== opciones.municipio) { opciones.municipio = ine; repintar(); }
};
on('cambio', ({ claves }) => { if (claves.has('ficha') || claves.has('fn')) marcaFicha(); });
on('motor', marcaFicha);

registrarIndicador(proveedorFronteras);
import('./extra.js').catch(e => console.error('[fronteras] extra', e));
