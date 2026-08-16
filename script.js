// ============================================================
// SISTEMA DE REPORTES SEMANALES POR UNIDAD
// ============================================================

// -----------------------------
// ELEMENTOS DEL HTML
// -----------------------------

const form = document.getElementById("reportForm");

const numeroUnidadInput = document.getElementById("numeroUnidad");
const fechaInput = document.getElementById("fecha");
const diaSemanaInput = document.getElementById("diaSemana");
const horaReporteInput = document.getElementById("horaReporte");
const nombreConductorInput = document.getElementById("nombreConductor");
const gananciaInput = document.getElementById("ganancia");
const recorridoInput = document.getElementById("recorrido");
const observacionesInput = document.getElementById("observaciones");

const resetFormBtn = document.getElementById("resetFormBtn");
const newReportBtn = document.getElementById("newReportBtn");

const unitsList = document.getElementById("unitsList");
const historyList = document.getElementById("historyList");
const historySearchInput = document.getElementById("historySearch");

const previewNumeroUnidad = document.getElementById("previewNumeroUnidad");
const reportHeaderDate = document.getElementById("reportHeaderDate");

const totalSemanalElement = document.getElementById("totalSemanal");
const diasRegistradosElement = document.getElementById("diasRegistrados");
const weeklyTableBody = document.getElementById("weeklyTableBody");
const tableTotalSemanal = document.getElementById("tableTotalSemanal");

const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const printReportBtn = document.getElementById("printReportBtn");

// -----------------------------
// VARIABLES
// -----------------------------

let unidadSeleccionada = null;

const STORAGE_KEY = "reportesUnidadesSemanales";

const diasSemana = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado"
];

// -----------------------------
// UTILIDADES
// -----------------------------

function obtenerDiaSemana(fecha) {
  if (!fecha) {
    return "";
  }

  const date = new Date(`${fecha}T00:00:00`);

  return diasSemana[date.getDay()];
}

function formatearFecha(fecha) {
  if (!fecha) {
    return "-";
  }

  const date = new Date(`${fecha}T00:00:00`);

  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatearDinero(valor) {
  const numero = Number(valor) || 0;

  return numero.toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  });
}

function escapeHTML(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function recortarTexto(texto, limite) {
  const valor = String(texto ?? "");

  if (valor.length <= limite) {
    return valor;
  }

  return `${valor.substring(0, limite - 3)}...`;
}

// -----------------------------
// LOCAL STORAGE
// -----------------------------

function obtenerDatos() {
  const datosGuardados = localStorage.getItem(STORAGE_KEY);

  if (!datosGuardados) {
    return {};
  }

  try {
    const datos = JSON.parse(datosGuardados);

    return datos && typeof datos === "object"
      ? datos
      : {};
  } catch (error) {
    console.error(
      "No se pudieron leer los datos guardados:",
      error
    );

    return {};
  }
}

function guardarDatos(datos) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(datos)
    );

    return true;
  } catch (error) {
    console.error(
      "No se pudieron guardar los datos:",
      error
    );

    alert(
      "No se pudo guardar la información en el navegador."
    );

    return false;
  }
}

// -----------------------------
// FECHA Y HORA
// -----------------------------

function actualizarDia() {
  const dia = obtenerDiaSemana(
    fechaInput.value
  );

  diaSemanaInput.value = dia
    ? dia.charAt(0).toUpperCase() + dia.slice(1)
    : "";
}

function obtenerFechaLocal() {
  const ahora = new Date();

  const year = ahora.getFullYear();

  const month = String(
    ahora.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    ahora.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function obtenerHoraLocal() {
  const ahora = new Date();

  const horas = String(
    ahora.getHours()
  ).padStart(2, "0");

  const minutos = String(
    ahora.getMinutes()
  ).padStart(2, "0");

  return `${horas}:${minutos}`;
}

function establecerFechaHoraActual() {
  fechaInput.value = obtenerFechaLocal();

  horaReporteInput.value =
    obtenerHoraLocal();

  actualizarDia();
}

// -----------------------------
// CREAR REGISTRO
// -----------------------------

function crearRegistro() {
  return {
    id: Date.now().toString(),
    fecha: fechaInput.value,
    dia: obtenerDiaSemana(
      fechaInput.value
    ),
    hora: horaReporteInput.value,
    conductor: nombreConductorInput.value.trim(),
    ganancia: Number(
      gananciaInput.value
    ),
    recorrido: recorridoInput.value.trim(),
    observaciones:
      observacionesInput.value.trim()
  };
}

// -----------------------------
// GUARDAR REGISTRO
// -----------------------------

function guardarRegistro() {
  const unidad =
    numeroUnidadInput.value.trim();

  if (!unidad) {
    alert(
      "Ingresa el número de unidad."
    );

    numeroUnidadInput.focus();

    return;
  }

  if (!fechaInput.value) {
    alert(
      "Selecciona una fecha."
    );

    fechaInput.focus();

    return;
  }

  if (!horaReporteInput.value) {
    alert(
      "Ingresa la hora del reporte."
    );

    horaReporteInput.focus();

    return;
  }

  if (
    gananciaInput.value === "" ||
    Number(gananciaInput.value) < 0
  ) {
    alert(
      "Ingresa una ganancia válida."
    );

    gananciaInput.focus();

    return;
  }

  const datos = obtenerDatos();

  if (!Array.isArray(datos[unidad])) {
    datos[unidad] = [];
  }

  const nuevoRegistro =
    crearRegistro();

  const indiceExistente =
    datos[unidad].findIndex(
      (registro) =>
        registro.fecha ===
        nuevoRegistro.fecha
    );

  if (indiceExistente !== -1) {
    const confirmar = confirm(
      `La unidad ${unidad} ya tiene un registro para el ${formatearFecha(
        nuevoRegistro.fecha
      )}.\n\n¿Quieres reemplazarlo?`
    );

    if (!confirmar) {
      return;
    }

    datos[unidad][indiceExistente] =
      nuevoRegistro;
  } else {
    if (datos[unidad].length >= 7) {
      alert(
        "Esta unidad ya tiene 7 días registrados."
      );

      return;
    }

    datos[unidad].push(
      nuevoRegistro
    );
  }

  datos[unidad].sort(
    (a, b) =>
      new Date(a.fecha) -
      new Date(b.fecha)
  );

  if (!guardarDatos(datos)) {
    return;
  }

  unidadSeleccionada = unidad;

  actualizarInterfaz();

  alert(
    "Registro guardado correctamente."
  );

  limpiarCamposDiarios();

  establecerFechaHoraActual();
}

// -----------------------------
// LIMPIAR
// -----------------------------

function limpiarCamposDiarios() {
  gananciaInput.value = "";

  nombreConductorInput.value = "";

  recorridoInput.value = "";

  observacionesInput.value = "";
}

function limpiarFormularioCompleto() {
  form.reset();

  unidadSeleccionada = null;

  establecerFechaHoraActual();

  actualizarInterfaz();

  numeroUnidadInput.focus();
}

// -----------------------------
// TOTALES Y SEMANA
// -----------------------------

function obtenerTotalSemanal(
  registros
) {
  return registros.reduce(
    (total, registro) => {
      return (
        total +
        (Number(
          registro.ganancia
        ) || 0)
      );
    },
    0
  );
}

function obtenerRangoSemana(
  registros
) {
  if (!registros.length) {
    return "Sin registros";
  }

  const fechas = registros
    .map(
      (registro) =>
        new Date(
          `${registro.fecha}T00:00:00`
        )
    )
    .sort(
      (a, b) => a - b
    );

  const primeraFecha =
    fechas[0]
      .toISOString()
      .split("T")[0];

  const ultimaFecha =
    fechas[fechas.length - 1]
      .toISOString()
      .split("T")[0];

  return `${formatearFecha(
    primeraFecha
  )} - ${formatearFecha(
    ultimaFecha
  )}`;
}

// -----------------------------
// UNIDADES
// -----------------------------

function renderUnidades() {
  const datos =
    obtenerDatos();

  const unidades =
    Object.keys(datos).sort(
      (a, b) =>
        a.localeCompare(
          b,
          undefined,
          {
            numeric: true
          }
        )
    );

  if (!unidades.length) {
    unitsList.innerHTML = `
      <div class="empty-state">
        Aún no hay unidades registradas.
      </div>
    `;

    return;
  }

  unitsList.innerHTML =
    unidades
      .map((unidad) => {
        const registros =
          Array.isArray(
            datos[unidad]
          )
            ? datos[unidad]
            : [];

        const total =
          obtenerTotalSemanal(
            registros
          );

        return `
          <div class="unit-card">

            <div>
              <strong>
                Unidad ${escapeHTML(
                  unidad
                )}
              </strong>

              <small>
                ${registros.length} de 7 días registrados
                <br>
                Total:
                ${formatearDinero(
                  total
                )}
              </small>
            </div>

            <button
              type="button"
              class="btn btn-action"
              data-unidad="${escapeHTML(
                unidad
              )}"
            >
              Ver reporte
            </button>

          </div>
        `;
      })
      .join("");

  unitsList
    .querySelectorAll(
      "[data-unidad]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          unidadSeleccionada =
            button.dataset.unidad;

          numeroUnidadInput.value =
            unidadSeleccionada;

          mostrarReporteUnidad(
            unidadSeleccionada
          );
        }
      );
    });
}

// -----------------------------
// REPORTE DE UNIDAD
// -----------------------------

function mostrarReporteUnidad(
  unidad
) {
  const datos =
    obtenerDatos();

  const registros =
    Array.isArray(
      datos[unidad]
    )
      ? datos[unidad]
      : [];

  previewNumeroUnidad.textContent =
    unidad || "-";

  if (!registros.length) {
    reportHeaderDate.textContent =
      "Sin registros";

    totalSemanalElement.textContent =
      formatearDinero(0);

    tableTotalSemanal.textContent =
      formatearDinero(0);

    diasRegistradosElement.textContent =
      "0 / 7";

    weeklyTableBody.innerHTML = `
      <tr>
        <td
          colspan="5"
          class="empty-state"
        >
          Esta unidad todavía no tiene registros.
        </td>
      </tr>
    `;

    return;
  }

  const registrosOrdenados =
    [...registros].sort(
      (a, b) =>
        new Date(a.fecha) -
        new Date(b.fecha)
    );

  const total =
    obtenerTotalSemanal(
      registrosOrdenados
    );

  reportHeaderDate.textContent =
    obtenerRangoSemana(
      registrosOrdenados
    );

  totalSemanalElement.textContent =
    formatearDinero(total);

  tableTotalSemanal.textContent =
    formatearDinero(total);

  diasRegistradosElement.textContent =
    `${registrosOrdenados.length} / 7`;

  weeklyTableBody.innerHTML =
    registrosOrdenados
      .map((registro) => {
        const diaCapitalizado =
          registro.dia
            ? registro.dia
                .charAt(0)
                .toUpperCase() +
              registro.dia.slice(1)
            : "-";

        return `
          <tr>

            <td>
              ${escapeHTML(
                diaCapitalizado
              )}
            </td>

            <td>
              ${escapeHTML(
                formatearFecha(
                  registro.fecha
                )
              )}
            </td>

            <td>
              ${escapeHTML(
                registro.conductor ||
                  "Sin conductor"
              )}
            </td>

            <td>
              <strong>
                ${formatearDinero(
                  registro.ganancia
                )}
              </strong>
            </td>

            <td>
              ${escapeHTML(
                registro.observaciones ||
                  "Sin observaciones"
              )}
            </td>

          </tr>
        `;
      })
      .join("");
}

// -----------------------------
// HISTORIAL
// -----------------------------

function renderHistorial() {
  const datos =
    obtenerDatos();

  const termino =
    historySearchInput.value
      .trim()
      .toLowerCase();

  const registrosHistorial = [];

  Object.keys(datos).forEach(
    (unidad) => {
      const registros =
        Array.isArray(
          datos[unidad]
        )
          ? datos[unidad]
          : [];

      registros.forEach(
        (registro) => {
          registrosHistorial.push(
            {
              unidad,
              ...registro
            }
          );
        }
      );
    }
  );

  registrosHistorial.sort(
    (a, b) =>
      new Date(b.fecha) -
      new Date(a.fecha)
  );

  const filtrados =
    registrosHistorial.filter(
      (registro) => {
        const texto = [
          registro.unidad,
          registro.conductor,
          registro.recorrido,
          registro.observaciones,
          registro.dia
        ]
          .join(" ")
          .toLowerCase();

        return texto.includes(
          termino
        );
      }
    );

  if (!filtrados.length) {
    historyList.innerHTML = `
      <li class="empty-state">
        ${
          registrosHistorial.length
            ? "No se encontraron registros."
            : "Aún no hay registros guardados."
        }
      </li>
    `;

    return;
  }

  historyList.innerHTML =
    filtrados
      .map(
        (registro) => `
        <li
          class="history-item"
          data-unidad="${escapeHTML(
            registro.unidad
          )}"
        >

          <div class="meta">

            <strong>
              Unidad ${escapeHTML(
                registro.unidad
              )}
            </strong>

            <small>
              ${escapeHTML(
                registro.conductor ||
                  "Sin conductor"
              )}
              •
              ${escapeHTML(
                registro.recorrido ||
                  "Sin recorrido"
              )}
            </small>

          </div>

          <span class="badge">
            ${escapeHTML(
              formatearFecha(
                registro.fecha
              )
            )}
            <br>
            ${formatearDinero(
              registro.ganancia
            )}
          </span>

        </li>
      `
      )
      .join("");

  historyList
    .querySelectorAll(
      ".history-item"
    )
    .forEach((item) => {
      item.addEventListener(
        "click",
        () => {
          unidadSeleccionada =
            item.dataset.unidad;

          numeroUnidadInput.value =
            unidadSeleccionada;

          mostrarReporteUnidad(
            unidadSeleccionada
          );
        }
      );
    });
}

// -----------------------------
// ACTUALIZAR INTERFAZ
// -----------------------------

function actualizarInterfaz() {
  renderUnidades();

  renderHistorial();

  if (unidadSeleccionada) {
    mostrarReporteUnidad(
      unidadSeleccionada
    );

    return;
  }

  previewNumeroUnidad.textContent =
    "-";

  reportHeaderDate.textContent =
    "Sin registros";

  totalSemanalElement.textContent =
    formatearDinero(0);

  tableTotalSemanal.textContent =
    formatearDinero(0);

  diasRegistradosElement.textContent =
    "0 / 7";

  weeklyTableBody.innerHTML = `
    <tr>
      <td
        colspan="5"
        class="empty-state"
      >
        Selecciona una unidad para visualizar
        su reporte semanal.
      </td>
    </tr>
  `;
}

// -----------------------------
// GENERAR PDF
// -----------------------------

function descargarPDF() {
  if (
    !window.jspdf ||
    !window.jspdf.jsPDF
  ) {
    alert(
      "La librería jsPDF no está disponible. Revisa tu conexión a internet."
    );

    return;
  }

  if (!unidadSeleccionada) {
    alert(
      "Selecciona una unidad antes de generar el PDF."
    );

    return;
  }

  const datos =
    obtenerDatos();

  const registros =
    Array.isArray(
      datos[unidadSeleccionada]
    )
      ? datos[unidadSeleccionada]
      : [];

  if (!registros.length) {
    alert(
      "La unidad seleccionada todavía no tiene registros."
    );

    return;
  }

  const { jsPDF } =
    window.jspdf;

  const pdf = new jsPDF(
    "p",
    "mm",
    "a4"
  );

  pdf.setFont(
    "helvetica",
    "bold"
  );

  pdf.setFontSize(20);

  pdf.text(
    "REPORTE SEMANAL",
    105,
    18,
    {
      align: "center"
    }
  );

  pdf.setFontSize(14);

  pdf.text(
    `Unidad ${unidadSeleccionada}`,
    105,
    28,
    {
      align: "center"
    }
  );

  pdf.setFont(
    "helvetica",
    "normal"
  );

  pdf.setFontSize(10);

  pdf.text(
    `Periodo: ${obtenerRangoSemana(
      registros
    )}`,
    105,
    36,
    {
      align: "center"
    }
  );

  let y = 46;

  const alturaCabecera = 10;
  const alturaFila = 12;

  const columnas = [
    {
      titulo: "Día",
      x: 10,
      ancho: 28
    },
    {
      titulo: "Fecha",
      x: 38,
      ancho: 28
    },
    {
      titulo: "Conductor",
      x: 66,
      ancho: 42
    },
    {
      titulo: "Ganancia",
      x: 108,
      ancho: 32
    },
    {
      titulo: "Observaciones",
      x: 140,
      ancho: 60
    }
  ];

  function dibujarCabeceraTabla() {
    pdf.setFont(
      "helvetica",
      "bold"
    );

    pdf.setFontSize(8.5);

    columnas.forEach(
      (columna) => {
        pdf.rect(
          columna.x,
          y,
          columna.ancho,
          alturaCabecera
        );

        pdf.text(
          columna.titulo,
          columna.x +
            columna.ancho / 2,
          y + 6,
          {
            align: "center"
          }
        );
      }
    );

    y += alturaCabecera;
  }

  dibujarCabeceraTabla();

  pdf.setFont(
    "helvetica",
    "normal"
  );

  pdf.setFontSize(8.5);

  const registrosOrdenados =
    [...registros].sort(
      (a, b) =>
        new Date(a.fecha) -
        new Date(b.fecha)
    );

  registrosOrdenados.forEach(
    (registro) => {
      if (
        y + alturaFila >
        270
      ) {
        pdf.addPage();

        y = 20;

        dibujarCabeceraTabla();

        pdf.setFont(
          "helvetica",
          "normal"
        );

        pdf.setFontSize(8.5);
      }

      columnas.forEach(
        (columna) => {
          pdf.rect(
            columna.x,
            y,
            columna.ancho,
            alturaFila
          );
        }
      );

      const dia =
        registro.dia
          ? registro.dia
              .charAt(0)
              .toUpperCase() +
            registro.dia.slice(1)
          : "-";

      pdf.text(
        recortarTexto(
          dia,
          14
        ),
        12,
        y + 7
      );

      pdf.text(
        formatearFecha(
          registro.fecha
        ),
        40,
        y + 7
      );

      pdf.text(
        recortarTexto(
          registro.conductor ||
            "Sin conductor",
          22
        ),
        68,
        y + 7
      );

      pdf.text(
        formatearDinero(
          registro.ganancia
        ),
        110,
        y + 7
      );

      pdf.text(
        recortarTexto(
          registro.observaciones ||
            "Sin observaciones",
          34
        ),
        142,
        y + 7
      );

      y += alturaFila;
    }
  );

  const total =
    obtenerTotalSemanal(
      registros
    );

  y += 10;

  if (y > 270) {
    pdf.addPage();

    y = 25;
  }

  pdf.setFont(
    "helvetica",
    "bold"
  );

  pdf.setFontSize(13);

  pdf.text(
    `TOTAL SEMANAL: ${formatearDinero(
      total
    )}`,
    15,
    y
  );

  pdf.setFont(
    "helvetica",
    "normal"
  );

  pdf.setFontSize(10);

  pdf.text(
    `Días registrados: ${registros.length} de 7`,
    15,
    y + 8
  );

  pdf.save(
    `reporte-unidad-${unidadSeleccionada}.pdf`
  );
}

// -----------------------------
// IMPRIMIR
// -----------------------------

function imprimirReporte() {
  if (!unidadSeleccionada) {
    alert(
      "Selecciona una unidad antes de imprimir."
    );

    return;
  }

  window.print();
}

// -----------------------------
// EVENTOS
// -----------------------------

function configurarEventos() {
  fechaInput.addEventListener(
    "change",
    actualizarDia
  );

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      guardarRegistro();
    }
  );

  resetFormBtn.addEventListener(
    "click",
    limpiarFormularioCompleto
  );

  newReportBtn.addEventListener(
    "click",
    limpiarFormularioCompleto
  );

  historySearchInput.addEventListener(
    "input",
    renderHistorial
  );

  downloadPdfBtn.addEventListener(
    "click",
    descargarPDF
  );

  printReportBtn.addEventListener(
    "click",
    imprimirReporte
  );
}

// -----------------------------
// INICIO
// -----------------------------

function init() {
  establecerFechaHoraActual();

  configurarEventos();

  actualizarInterfaz();
}

init();