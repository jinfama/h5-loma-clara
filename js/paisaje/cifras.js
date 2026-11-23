// Cifras del municipio con las clases comunes del Atlas. Se cargan solo al pedirlas (unos 2 MB).

const GRUPOS = [
  ['tierra_de_labor', 'Tierra de labor (con regadío y huerta)'],
  ['lenosos', 'Leñosos (olivar, viña, frutales y mezclas)'],
  ['monte_y_pasto', 'Monte y pasto'],
  ['inculto_y_no_agrario', 'Inculto y no agrario'],
  ['dehesa_agricola_sin_asignar', 'Dehesa agrícola sin asignar'],
  ['sin_clasificar', 'Sin clasificar'],
];
const ANIOS = [1956, 1977, 1984, 1999, 2007, 2020];
const fmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let datos = null;

async function cargar() {
  if (datos) return datos;
  const piezas = await Promise.all(GRUPOS.map(async ([g]) => {
    const r = await fetch(`data/v2/visor/valores/usos_g_${g}_pct__municipio.json`);
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }));
  datos = piezas;
  return datos;
}

function celda(d, anio, ine) {
  const a = d.anios.indexOf(anio);
  const m = d.ids.indexOf(ine);
  if (a < 0 || m < 0) return '<span class="pz-sin">sin dato</span>';
  const v = d.v[a][m];
  if (v === null || v === undefined) return '<span class="pz-sin">sin dato</span>';
  const marca = d.f?.[a]?.[m];
  const extra = marca === '1' ? '<small>estimado</small>' : marca === '2' ? '<small>en revisión</small>' : '';
  return `${fmt.format(v)} %${extra}`;
}

function tabla(piezas, ine) {
  const cab = ANIOS.map((a) => `<th scope="col"${a === 2020 ? ' class="pz-corte"' : ''}>${a}</th>`).join('');
  const filas = GRUPOS.map(([, rotulo], i) => {
    const tds = ANIOS.map((a) => `<td${a === 2020 ? ' class="pz-corte"' : ''}>${celda(piezas[i], a, ine)}</td>`).join('');
    return `<tr><th scope="row">${rotulo}</th>${tds}</tr>`;
  }).join('');
  return `<div class="pz-tabla-marco"><table class="pz-tabla"><thead><tr><th scope="col">% del término</th>${cab}</tr></thead><tbody>${filas}</tbody></table></div>`;
}

export async function mostrarCifras(cuerpo, ine, nombre) {
  cuerpo.innerHTML = '<p>Cargando las cifras…</p>';
  try {
    const piezas = await cargar();
    cuerpo.innerHTML = `
      <p><b>${nombre}.</b> Estas clases son las mismas en todos los años, pero existen solo para el municipio entero: no se pueden pintar parcela a parcela sobre el mapa.</p>
      ${tabla(piezas, ine)}
      <p class="pz-nota pz-nota--fuerte">Entre 2007 y 2020 cambia la fuente (del mapa de usos y coberturas vegetales al Sistema de Información sobre el Patrimonio Natural de Andalucía). Parte de la diferencia entre esas dos columnas es de leyenda y método, no un cambio real del paisaje.</p>
      <p>El mapa de 2020 que se ve en el comparador es otro producto (Siose Andalucía) y no es la fuente de la columna de 2020. Una casilla «sin dato» no es un cero.</p>`;
  } catch (e) {
    cuerpo.innerHTML = '<p class="pz-nota pz-nota--fuerte">No se han podido cargar las cifras. Cierra esta ventana y vuelve a intentarlo.</p>';
  }
}
