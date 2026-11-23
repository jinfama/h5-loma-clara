// panel.js — panel plegable de «Fronteras» sobre el mapa a pantalla completa: municipios por corte (gráfico) y
// el bloque del Catastro de Ensenada (1752). Si el armazón da un hueco (`panel(el, ctx)` del proveedor, pedido en
// PETICIONES_API.md), se monta ahí; si no, el módulo crea el suyo fijo sobre el escenario.

import { estado, on, setEstado } from '../estado.js';
import { base, corteDeAnio, anioDeCorte } from './base.js';
import { pintarConteo, pintarEnsenada, estadoLimite } from '../../fronteras/graficos.js';
import { opciones } from './indicador.js';
import { esc } from '../../atlas2/fmt.js';

// plegado al empezar en pantallas estrechas o bajas (el mapa manda); se despliega con un toque
const PLEGADO_MOVIL = () => window.matchMedia('(max-width: 640px), (max-height: 820px)').matches;

export function montarPanel(el, { repintar = () => {} } = {}) {
  let vivo = true;
  const offs = [];
  let grafico = null;
  el.classList.add('v3f-panel');
  el.innerHTML = `
    <div class="v3f-panel__barra">
      <div class="v3f-tabs" role="tablist" aria-label="Fronteras">
        <button type="button" role="tab" id="v3f-tab-conteo" aria-controls="v3f-pane-conteo" aria-selected="true"><span class="v3f-largo">Municipios por corte</span><span class="v3f-corto">Por corte</span></button>
        <button type="button" role="tab" id="v3f-tab-ens" aria-controls="v3f-pane-ens" aria-selected="false">Ensenada<span class="v3f-largo"> 1752</span></button>
      </div>
      <button type="button" class="v3f-plegar" aria-expanded="true" aria-controls="v3f-cuerpo" title="Plegar o desplegar">
        <span class="v3f-pill">Recuento · Ensenada</span><span class="a2-sr">Plegar o desplegar el panel</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z"/></svg>
      </button>
    </div>
    <div class="v3f-cuerpo" id="v3f-cuerpo">
      <section class="v3f-pane" id="v3f-pane-conteo" role="tabpanel" aria-labelledby="v3f-tab-conteo">
        <p class="v3f-h" id="v3f-h-conteo"></p>
        <div class="v3f-chart" id="v3f-chart" role="img" aria-label="Número de municipios por corte"></div>
        <div class="v3f-ley" id="v3f-ley"></div>
        <label class="v3f-toggle"><input type="checkbox" id="v3f-cambios" ${opciones.cambios ? 'checked' : ''}> Resaltar en el mapa lo que cambia</label>
      </section>
      <section class="v3f-pane" id="v3f-pane-ens" role="tabpanel" aria-labelledby="v3f-tab-ens" hidden>
        <div id="v3f-ens-ins" class="v3f-ins"></div>
        <div class="v3f-ens-stats" id="v3f-ens-stats"></div>
        <p class="v3f-txt">El Catastro de Ensenada no es un censo de ayuntamientos: da una entrada por cada pueblo que respondió
          al interrogatorio. Algunos pueblos no se han podido situar todavía, y algunas entradas son cortijos, castillos,
          donadíos o dehesas que la fuente lista aparte. Los términos en gris tramado del mapa de 1752 son unidades en las que
          la fuente no cuenta ningún pueblo: corresponden a lugares pendientes de situar, no a zonas sin dueño.</p>
        <p class="a2-note v3f-txt"><strong>Los términos de 1752 se dibujan uniendo los recintos de hoy; no son los límites
          observados.</strong> Aún no sabemos qué zonas tenían límite documentado, cuáles están supuestas y cuáles pudieron no
          pertenecer a nadie: lo está estudiando la sesión de límites (columna futura <code>estado_limite_1752</code>).</p>
        <div id="v3f-ens-lim"></div>
        <button type="button" class="a2-btn v3f-ir1752">Ver el mapa de 1752</button>
      </section>
    </div>`;
  const $ = s => el.querySelector(s);
  const plegar = (si) => {
    el.dataset.plegado = si ? 'true' : 'false';
    $('.v3f-plegar').setAttribute('aria-expanded', si ? 'false' : 'true');
    if (!si && grafico) requestAnimationFrame(() => grafico.dibujar());
  };
  plegar(PLEGADO_MOVIL());
  $('.v3f-plegar').addEventListener('click', () => plegar(el.dataset.plegado !== 'true'));
  const tabs = [...el.querySelectorAll('[role="tab"]')];
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => { x.setAttribute('aria-selected', String(x === t)); $('#' + x.getAttribute('aria-controls')).hidden = x !== t; });
    plegar(false);
    if (t.id === 'v3f-tab-conteo' && grafico) requestAnimationFrame(() => grafico.dibujar());
  }));
  el.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const k = tabs.indexOf(document.activeElement); if (k < 0) return;
    const n = tabs[(k + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
  });
  $('#v3f-cambios').addEventListener('change', e => { opciones.cambios = e.target.checked; repintar(); });

  let corteActual = null;
  const avisar = () => document.dispatchEvent(new CustomEvent('fr:corte', { detail: { corte: corteActual } }));

  base().then(async B => {
    if (!vivo) return;
    corteActual = corteDeAnio(estado.anio, B.cortes);
    if (B.conteo.length) {
      grafico = pintarConteo($('#v3f-chart'), B.conteo, {
        actual: () => corteActual,
        alElegir: c => setEstado({ anio: anioDeCorte(c) }),
        tituloEl: $('#v3f-h-conteo'), notaEl: null, leyendaEl: $('#v3f-ley'), compacto: true,
      });
      const d1752 = B.cortes.includes('1752') ? await B.corte('1752').catch(() => null) : null;
      const estados = new Set(d1752 ? d1752.feats.map(f => estadoLimite(f.properties)).filter(Boolean) : []);
      pintarEnsenada(B.conteo, { estados, avisos: B.avisos1752 }, { statsEl: $('#v3f-ens-stats'), insigniasEl: $('#v3f-ens-ins'), limiteEl: $('#v3f-ens-lim') });
    } else {
      $('#v3f-chart').innerHTML = '<p class="a2-small">El recuento por corte (fronteras/conteo.json) aún no está en data/v2.</p>';
    }
    $('.v3f-ir1752').addEventListener('click', () => setEstado({ anio: 1752 }));
    const sigue = () => { const c = corteDeAnio(estado.anio, B.cortes); if (c !== corteActual) { corteActual = c; avisar(); } };
    offs.push(on('anio', sigue), on('cambio', ({ claves }) => { if (claves.has('anio')) sigue(); }));
  }).catch(e => { $('#v3f-chart').innerHTML = `<p class="a2-small">${esc(String(e.message || e))}</p>`; });

  return {
    actualizar() { document.dispatchEvent(new CustomEvent('fr:corte', { detail: { corte: corteActual } })); },
    destruir() { vivo = false; offs.forEach(f => f()); if (grafico) grafico.destruir(); el.innerHTML = ''; el.classList.remove('v3f-panel'); },
  };
}
