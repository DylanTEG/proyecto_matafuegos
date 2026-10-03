/* =====================================================================
   app.js - Consulta de matafuegos por número de serie (prototipo)
   Se organiza en 8 secciones: configuración, datos, fechas, validación,
   estado, pantalla, eventos e inicio.
   ===================================================================== */
'use strict';

/* ---------- 1. CONFIGURACIÓN ---------- */
const DIAS_AVISO = 30;               // Con menos de 30 días para vencer, el estado es "POR VENCER"
const SERIE_MIN = 3;                 // Largo mínimo del número de serie
const SERIE_MAX = 20;                // Largo máximo del número de serie

// Campos que todo registro debe tener (se controlan al cargar la base)
const CAMPOS_OBLIGATORIOS = [
  'serie', 'agente', 'clases', 'empresa', 'proxRecarga', 'proxPH',
  'identificacion', 'domicilio', 'fabricante', 'fabAnio', 'vuAnio', 'capacidad'
];

/* ---------- 2. BASE DE DATOS (simulada en memoria) ----------
   Los vencimientos se guardan como en la etiqueta real:
   "AAAA-MM" (mes y año) o solo el año. En la versión final esto
   será una base de datos de verdad. */
const hoy = new Date();
hoy.setHours(0, 0, 0, 0);

// Devuelve "AAAA-MM" desplazado n meses desde hoy (solo para los ejemplos)
function mesRelativo(n) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth() + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Matafuegos real: datos tomados de su etiqueta
const MATAFUEGOS_REAL = {
  serie: '81174',                    // Se usa el Nº de extintor como número de serie
  agente: 'HCFC / Haloclean',
  clases: 'A, B, C',
  empresa: 'SUYAI EXTINTORES S.R.L.',
  proxRecarga: '2027-08',
  notaRecarga: 'Etiqueta amarilla: 08 27',
  proxPH: '2028-08',
  notaPH: 'Etiqueta: 08 28',
  identificacion: '81174',
  domicilio: 'LOPE DE VEGA AV. 2150',
  fabricante: 'Matafuegos Donny S.R.L',
  fabAnio: 2008,
  vuAnio: 2028,
  capacidad: '5 Kg / Haloclean'
};

// Base común de los ejemplos: solo cambian serie y fechas
const BASE_EJEMPLO = {
  ejemplo: true,
  agente: 'Polvo químico seco ABC',
  clases: 'A, B, C',
  empresa: 'Empresa de ejemplo S.R.L.',
  identificacion: 'EJ',
  domicilio: 'Dirección de ejemplo 123',
  fabricante: 'Fabricante de ejemplo',
  capacidad: '5 Kg / Polvo ABC',
  proxPH: mesRelativo(30)
};

// Lista completa. Los ejemplos permiten probar los otros estados del semáforo.
const BASE_DE_DATOS = [
  MATAFUEGOS_REAL,
  { ...BASE_EJEMPLO, serie: 'EJ-001', proxRecarga: mesRelativo(0),  fabAnio: hoy.getFullYear() - 5,  vuAnio: hoy.getFullYear() + 15 }, // por vencer
  { ...BASE_EJEMPLO, serie: 'EJ-002', proxRecarga: mesRelativo(-2), fabAnio: hoy.getFullYear() - 5,  vuAnio: hoy.getFullYear() + 15 }, // vencido
  { ...BASE_EJEMPLO, serie: 'EJ-003', proxRecarga: mesRelativo(6),  fabAnio: hoy.getFullYear() - 21, vuAnio: hoy.getFullYear() - 1 }   // vida útil cumplida
];

/* ---------- 3. UTILIDADES DE FECHAS ---------- */

// "2027-08" -> último día de agosto de 2027. Lanza un error si el formato es inválido.
// Una etiqueta "08/27" vale hasta el final de ese mes.
function finDeMes(texto) {
  const partes = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(texto);
  if (!partes) throw new Error('Fecha inválida "' + texto + '" (se esperaba AAAA-MM)');
  // El día 0 del mes siguiente es el último día del mes pedido
  return new Date(Number(partes[1]), Number(partes[2]), 0);
}

// 2028 -> 31/12/2028. Lanza un error si el año no es razonable.
function finDeAnio(anio) {
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) {
    throw new Error('Año inválido: ' + anio);
  }
  return new Date(anio, 12, 0);
}

// "2027-08" -> "08/2027"
function formatoMes(texto) {
  const [anio, mes] = texto.split('-');
  return mes + '/' + anio;
}

// Días que faltan desde hoy hasta la fecha (negativo si ya pasó)
function diasHasta(fecha) {
  return Math.round((fecha - hoy) / 86400000);
}

// Texto legible: "faltan 12 días" / "vencida hace 3 días"
function textoDias(n) {
  if (n < 0) return 'vencida hace ' + (-n) + ' días';
  if (n === 0) return 'vence hoy';
  return 'faltan ' + n + ' días';
}

/* ---------- 4. VALIDACIÓN Y DETECCIÓN DE ERRORES ---------- */

// Deja solo letras y números en mayúscula: "ej-001" -> "EJ001"
function normalizarSerie(texto) {
  return String(texto).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Revisa lo que escribió la persona. Devuelve { ok, clave, mensaje }.
function validarEntrada(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') {
    return { ok: false, mensaje: 'Ingresá el número grabado en el cilindro.' };
  }
  if (/[^A-Za-z0-9\s-]/.test(texto)) {
    return { ok: false, mensaje: 'Usá solo letras, números, espacios o guiones.' };
  }
  const clave = normalizarSerie(texto);
  if (clave.length < SERIE_MIN) {
    return { ok: false, mensaje: 'El número es muy corto (mínimo ' + SERIE_MIN + ' caracteres).' };
  }
  if (clave.length > SERIE_MAX) {
    return { ok: false, mensaje: 'El número es muy largo (máximo ' + SERIE_MAX + ' caracteres).' };
  }
  return { ok: true, clave: clave };
}

// Revisa un registro de la base. Devuelve una lista de problemas (vacía si está bien).
function validarRegistro(r) {
  const problemas = [];
  CAMPOS_OBLIGATORIOS.forEach(function (campo) {
    if (r[campo] === undefined || r[campo] === null || String(r[campo]).trim() === '') {
      problemas.push('falta el campo "' + campo + '"');
    }
  });
  if (problemas.length === 0) {
    // Solo se prueban las fechas si los campos existen
    try {
      finDeMes(r.proxRecarga);
      finDeMes(r.proxPH);
      finDeAnio(r.fabAnio);
      finDeAnio(r.vuAnio);
    } catch (error) {
      problemas.push(error.message);
    }
  }
  return problemas;
}

// Arma un índice serie -> registro para buscar rápido. Descarta registros
// inválidos o duplicados y los informa en "errores".
function construirIndice(lista) {
  const indice = new Map();
  const errores = [];
  lista.forEach(function (registro, i) {
    const problemas = validarRegistro(registro);
    if (problemas.length > 0) {
      errores.push('Registro #' + (i + 1) + ': ' + problemas.join('; '));
      return;
    }
    const clave = normalizarSerie(registro.serie);
    if (indice.has(clave)) {
      errores.push('Número de serie duplicado: ' + registro.serie);
      return;
    }
    indice.set(clave, registro);
  });
  return { indice: indice, errores: errores };
}

/* ---------- 5. ESTADO DEL MATAFUEGOS ---------- */

// Calcula los tres vencimientos y decide el color del semáforo.
function evaluarEstado(r) {
  const vencimientos = [
    { nombre: 'Recarga anual', fecha: finDeMes(r.proxRecarga) },
    { nombre: 'Prueba hidrostática', fecha: finDeMes(r.proxPH) },
    { nombre: 'Vida útil del cilindro', fecha: finDeAnio(r.vuAnio) }
  ];
  vencimientos.forEach(function (v) { v.dias = diasHasta(v.fecha); });

  // El que vence primero es el que manda en el mensaje
  const primero = vencimientos.slice().sort(function (a, b) { return a.dias - b.dias; })[0];
  const vidaUtil = vencimientos[2];

  let clase, titulo;
  if (vidaUtil.dias < 0)              { clase = 'baja';    titulo = 'DAR DE BAJA'; }
  else if (primero.dias < 0)          { clase = 'vencido'; titulo = 'VENCIDO'; }
  else if (primero.dias <= DIAS_AVISO){ clase = 'aviso';   titulo = 'POR VENCER'; }
  else                                { clase = 'ok';      titulo = 'HABILITADO'; }

  return { vencimientos: vencimientos, primero: primero, clase: clase, titulo: titulo };
}

/* ---------- 6. PANTALLA ---------- */
let dom = {};        // Referencias a los elementos del HTML (se llena en iniciar)
let indice = null;   // Mapa serie -> registro

// Crea un elemento con clase y texto. Se usa textContent (nunca innerHTML)
// para que lo que escribe la persona no pueda inyectar código.
function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

// Muestra un mensaje de error o aviso en la zona de resultados
function mostrarMensaje(titulo, detalle) {
  const caja = crear('div', 'mensaje');
  caja.setAttribute('role', 'alert');
  caja.append(crear('b', '', titulo), crear('p', '', detalle));
  dom.resultado.replaceChildren(caja);
}

// Muestra el semáforo y la ficha completa de un matafuegos
function mostrarFicha(r) {
  const estado = evaluarEstado(r);
  const rec = estado.vencimientos[0];
  const ph = estado.vencimientos[1];
  const vu = estado.vencimientos[2];

  // Semáforo
  const motivo = estado.primero.dias < 0
    ? estado.primero.nombre + ': ' + textoDias(estado.primero.dias)
    : 'Vence primero: ' + estado.primero.nombre.toLowerCase() + ' (' + textoDias(estado.primero.dias) + ')';
  const bloque = crear('div', 'estado ' + estado.clase);
  bloque.append(crear('b', '', estado.titulo), crear('p', '', motivo));

  // Línea con el número de serie
  const serie = crear('p', 'serie', 'N.º de serie ' + r.serie + (r.ejemplo ? ' (dato de ejemplo)' : ''));

  // Ficha: cada fila es [título, valor, texto secundario opcional]
  const filas = [
    ['Agente extintor', r.agente],
    ['Clases de fuego', r.clases],
    ['Empresa recargadora', r.empresa],
    ['Próxima recarga', formatoMes(r.proxRecarga), [r.notaRecarga, textoDias(rec.dias)]],
    ['Próxima P.H.', formatoMes(r.proxPH), [r.notaPH, textoDias(ph.dias)]],
    ['Identificación (Nº de extintor)', r.identificacion],
    ['Domicilio de instalación', r.domicilio],
    ['Fabricante original', r.fabricante],
    ['Fecha de fabricación', String(r.fabAnio)],
    ['Vencimiento de vida útil', String(r.vuAnio), [textoDias(vu.dias)]],
    ['Capacidad y agente', r.capacidad]
  ];
  const lista = crear('dl');
  filas.forEach(function (fila) {
    const celda = crear('div');
    const valor = crear('dd', '', fila[1]);
    const extra = (fila[2] || []).filter(Boolean).join('. ');  // ignora notas vacías
    if (extra) valor.append(crear('small', '', extra));
    celda.append(crear('dt', '', fila[0]), valor);
    lista.append(celda);
  });

  dom.resultado.replaceChildren(bloque, serie, lista);
}

/* ---------- 7. EVENTOS ---------- */

// Se ejecuta al buscar. Todo va dentro de try/catch: si algo falla, se
// muestra un mensaje en vez de dejar la pantalla en blanco.
function buscar() {
  try {
    const entrada = validarEntrada(dom.entrada.value);
    if (!entrada.ok) {
      mostrarMensaje('Revisá el número de serie', entrada.mensaje);
      return;
    }
    const registro = indice.get(entrada.clave);
    if (!registro) {
      mostrarMensaje(
        'No encontramos ese número de serie',
        'Revisá que "' + dom.entrada.value.trim() + '" esté completo y sin letras cambiadas ' +
        '(por ejemplo O y 0). Si está bien, el matafuegos todavía no fue registrado.'
      );
      return;
    }
    mostrarFicha(registro);
  } catch (error) {
    console.error('Error al buscar:', error);
    mostrarMensaje('Ocurrió un error inesperado', 'No se pudo mostrar la ficha. Probá de nuevo.');
  }
}

/* ---------- 8. INICIO ---------- */
function iniciar() {
  // 8.1 Comprobar que el HTML tiene todos los elementos necesarios
  ['entrada', 'buscar', 'ejemplos', 'resultado', 'avisos'].forEach(function (id) {
    const nodo = document.getElementById(id);
    if (!nodo) throw new Error('Falta el elemento #' + id + ' en el HTML');
    dom[id] = nodo;
  });

  // 8.2 Cargar y validar la base de datos
  const carga = construirIndice(BASE_DE_DATOS);
  indice = carga.indice;
  if (carga.errores.length > 0) {
    carga.errores.forEach(function (e) { console.error(e); });
    const aviso = crear('div', 'mensaje aviso-datos');
    aviso.setAttribute('role', 'alert');
    aviso.append(crear('b', '', 'Hay ' + carga.errores.length + ' registro(s) con errores en la base de datos'),
                 crear('p', '', 'No se cargaron. Los detalles están en la consola del navegador (F12).'));
    dom.avisos.append(aviso);
  }

  // 8.3 Conectar los eventos
  dom.buscar.addEventListener('click', buscar);
  dom.entrada.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') buscar();
  });

  // 8.4 Atajos para probar: un botón por cada registro válido
  indice.forEach(function (registro) {
    const boton = crear('button', 'atajo', registro.serie);
    boton.type = 'button';
    boton.addEventListener('click', function () {
      dom.entrada.value = registro.serie;
      buscar();
    });
    dom.ejemplos.append(boton);
  });
}

// Si el inicio falla (por ejemplo, falta un elemento), se avisa en pantalla
try {
  iniciar();
} catch (error) {
  console.error('Error al iniciar la aplicación:', error);
  document.body.prepend(crear('p', 'mensaje', 'No se pudo iniciar la página: ' + error.message));
}
