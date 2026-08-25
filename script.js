"use strict";
// Configuración de conexión con Supabase
const SUPABASE_URL = 'https://jitzndfgjvecfcfilhkk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BxmzeB0IdA1Yym0SVZzZ-w_2X_Dsiem';

const TABLA_REGISTROS = "registros_semanales";

let supabaseClient = null;
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("No se pudo inicializar el cliente de Supabase. Verifica que el CDN de supabase-js esté cargado.", e);
}

/* =====================================================
   CONTROL SEMANAL DE UNIDADES — script.js
   ===================================================== */

const $id = (id) => document.getElementById(id);

/* =====================================================
   UTILIDADES
===================================================== */

const nf = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function fmtMoneda(valor) {
    const v = Number(valor || 0);
    const signo = v < 0 ? "-" : "";
    return `${signo}$${nf.format(Math.abs(v))}`;
}

function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

function fmtFecha(iso) {
    if (!iso) return "-";
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
}

function nombreDia(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    const s = new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function hoyISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fechaRelativaISO(diasOffset) {
    const d = new Date();
    d.setDate(d.getDate() + diasOffset);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ahoraTexto() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[m]));

/* =====================================================
   ESTADO GLOBAL
===================================================== */

let registros = [];
let unidadSeleccionada = null;

function clienteListo() {
    return !!supabaseClient;
}

/* =====================================================
   NORMALIZACIÓN (BD -> interfaz)
===================================================== */

function normalizarRegistro(fila) {
    const montoGasto = num(fila.gastos_adicionales);
    return {
        id: fila.id,
        created_at: fila.created_at,
        unidad: String(fila.unidad ?? ""),
        ruta: fila.ruta || "",
        fecha: fila.fecha,
        dia: nombreDia(fila.fecha),
        produccion: num(fila.produccion_bruta),
        combustible: num(fila.combustible),
        gastoAdicional: montoGasto
            ? {
                concepto: fila.concepto_gastos || "Gasto adicional",
                monto: montoGasto,
            }
            : null,
        deposito: num(fila.deposito),
    };
}

/* =====================================================
   CRUD SUPABASE (asíncrono)
===================================================== */

async function obtenerRegistros() {
    const { data, error } = await supabaseClient
        .from(TABLA_REGISTROS)
        .select("*")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error al cargar registros desde Supabase:", error);
        alert("Error al cargar los registros: " + error.message);
        return [];
    }
    return (data || []).map(normalizarRegistro);
}

async function insertarRegistro(payload) {
    const { data, error } = await supabaseClient
        .from(TABLA_REGISTROS)
        .insert(payload)
        .select();
    return { data, error };
}

async function eliminarRegistro(registroId) {
    const { error } = await supabaseClient
        .from(TABLA_REGISTROS)
        .delete()
        .eq("id", registroId);
    return error;
}

async function refrescarInterfaz() {
    registros = await obtenerRegistros();
    renderTodo();
}

/* =====================================================
   TOTALES POR UNIDAD
===================================================== */

function ordenarPorFecha(lista) {
    return lista
        .map((r, i) => ({ r, i }))
        .sort((a, b) => (a.r.fecha === b.r.fecha ? a.i - b.i : a.r.fecha < b.r.fecha ? -1 : 1))
        .map((x) => x.r);
}

function registrosDeUnidad(unidad) {
    return ordenarPorFecha(
        registros.filter((r) => r.unidad === unidad)
    );
}

function unidadesRegistradas() {
    const map = new Map();
    registros.forEach((r) => {
        if (!map.has(r.unidad)) map.set(r.unidad, []);
        map.get(r.unidad).push(r);
    });
    return [...map.keys()];
}

function totalesUnidad(unidad) {
    const lista = registrosDeUnidad(unidad);
    const suma = (f) => lista.reduce((s, r) => s + f(r), 0);
    return {
        dias: lista.length,
        produccion: suma((r) => r.produccion),
        combustible: suma((r) => r.combustible),
        gastoAdicional: suma((r) => (r.gastoAdicional ? r.gastoAdicional.monto : 0)),
        deposito: suma((r) => r.deposito),
    };
}

/* =====================================================
   FORMULARIO
===================================================== */

const form = $id("reportForm");
const fechaInput = $id("fecha");
const diaSemanaInput = $id("diaSemana");
const tieneGastoSelect = $id("tieneGastoAdicional");

function actualizarCamposGasto() {
    const activo = tieneGastoSelect.value === "si";
    $id("gastoAdicionalFields").classList.toggle("hidden", !activo);
    if (!activo) {
        $id("conceptoGastoAdicional").value = "";
        $id("gastoAdicional").value = "";
    }
    calcularEnVivo();
}

function calcularEnVivo() {
    const produccion = num($id("produccionTotal").value);
    const combustible = num($id("combustible").value);
    const gasto = tieneGastoSelect.value === "si" ? num($id("gastoAdicional").value) : 0;

    const deposito = produccion - combustible - gasto;

    $id("deposito").value = nf.format(deposito);
    $id("resumenProduccion").textContent = fmtMoneda(produccion);
    $id("resumenDeposito").textContent = fmtMoneda(deposito);
}

fechaInput.addEventListener("change", () => {
    diaSemanaInput.value = nombreDia(fechaInput.value);
});

tieneGastoSelect.addEventListener("change", actualizarCamposGasto);

["produccionTotal", "combustible", "gastoAdicional"].forEach((idCampo) => {
    $id(idCampo).addEventListener("input", calcularEnVivo);
});

let guardando = false;

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!clienteListo()) {
        alert("La conexión con Supabase no está disponible.");
        return;
    }
    if (guardando) return;

    const produccion = num($id("produccionTotal").value);
    const combustible = num($id("combustible").value);
    const gasto = tieneGastoSelect.value === "si" ? num($id("gastoAdicional").value) : 0;
    const deposito = produccion - combustible - gasto;

    const payload = {
        unidad: $id("numeroUnidad").value.trim(),
        ruta: $id("ruta").value.trim(),
        fecha: fechaInput.value,
        produccion_bruta: produccion,
        combustible: combustible,
        gastos_adicionales: gasto,
        concepto_gastos:
            gasto > 0
                ? $id("conceptoGastoAdicional").value.trim() || "Gasto adicional"
                : null,
        deposito: deposito,
    };

    guardando = true;
    const btnGuardar = form.querySelector(".btn-primary");
    const textoOriginal = btnGuardar.textContent;
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando…";

    const { error } = await insertarRegistro(payload);

    guardando = false;
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;

    if (error) {
        console.error("Error al guardar en Supabase:", error);
        alert("Error al guardar el registro: " + error.message);
        return;
    }

    unidadSeleccionada = payload.unidad;
    reiniciarFormulario(false);
    await refrescarInterfaz();

    mostrarModalExito(payload.unidad, payload.deposito);
});

$id("resetFormBtn").addEventListener("click", () => reiniciarFormulario(true));

function reiniciarFormulario(limpiarTodo) {
    const unidadPrev = $id("numeroUnidad").value;
    const rutaPrev = $id("ruta").value;
    form.reset();
    if (!limpiarTodo) {
        $id("numeroUnidad").value = unidadPrev;
        $id("ruta").value = rutaPrev;
    }
    fechaInput.value = hoyISO();
    diaSemanaInput.value = nombreDia(fechaInput.value);
    tieneGastoSelect.value = "no";
    actualizarCamposGasto();
    calcularEnVivo();
}

/* =====================================================
   MODAL DE ÉXITO
===================================================== */

let exitoTimeoutId = null;

function mostrarModalExito(unidad, monto) {
    $id("exitoDetalle").textContent = `Unidad ${unidad} | ${fmtMoneda(monto)}`;
    $id("exitoOverlay").classList.add("show");

    clearTimeout(exitoTimeoutId);
    exitoTimeoutId = setTimeout(cerrarModalExito, 2000);
}

function cerrarModalExito() {
    clearTimeout(exitoTimeoutId);
    $id("exitoOverlay").classList.remove("show");
}

$id("exitoOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) cerrarModalExito();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarModalExito();
});

/* =====================================================
   RENDER: UNIDADES / REPORTE / HISTORIAL
===================================================== */

function renderTodo() {
    renderUnidades();
    renderVistaUnidad();
    renderHistorial();
}

function renderUnidades() {
    const cont = $id("unitsList");
    const unidades = unidadesRegistradas();

    if (!unidades.length) {
        cont.innerHTML = `<div class="empty-state">Aún no hay unidades registradas.</div>`;
        return;
    }

    cont.innerHTML = unidades
        .sort((a, b) => num(a) - num(b))
        .map((u) => {
            const t = totalesUnidad(u);
            const activa = u === unidadSeleccionada ? " activa" : "";
            return `
                <button type="button" class="unit-card${activa}" data-unidad="${esc(u)}">
                    <strong>Unidad ${esc(u)}</strong>
                    <span>${t.dias} día(s) · Producción ${fmtMoneda(t.produccion)}</span>
                    <span>Depósito ${fmtMoneda(t.deposito)}</span>
                </button>`;
        })
        .join("");
}

$id("unitsList").addEventListener("click", (e) => {
    const card = e.target.closest(".unit-card");
    if (!card) return;
    unidadSeleccionada = card.dataset.unidad;
    renderTodo();
    document.querySelector(".preview-panel")?.scrollIntoView({ behavior: "smooth" });
});

function renderVistaUnidad() {
    const tbody = $id("weeklyTableBody");

    if (!unidadSeleccionada || !registrosDeUnidad(unidadSeleccionada).length) {
        tbody.innerHTML = `
            <tr><td colspan="7" class="empty-state">
                ${unidadSeleccionada
                    ? `La unidad ${esc(unidadSeleccionada)} no tiene registros.`
                    : "Selecciona una unidad para visualizar su reporte semanal."}
            </td></tr>`;
        limpiarTotalesTabla();
        pintarEncabezadoVista(unidadSeleccionada, null, null);
        return;
    }

    const calc = registrosDeUnidad(unidadSeleccionada);

    tbody.innerHTML = calc.map((r) => {
        const gastoCell = r.gastoAdicional && r.gastoAdicional.monto
            ? `${fmtMoneda(r.gastoAdicional.monto)}<small>${esc(r.gastoAdicional.concepto)}</small>`
            : "—";

        return `
            <tr>
                <td>${esc(r.dia)}</td>
                <td>${fmtFecha(r.fecha)}</td>
                <td>${esc(r.ruta || "-")}</td>
                <td>${fmtMoneda(r.produccion)}</td>
                <td>${fmtMoneda(r.combustible)}</td>
                <td>${gastoCell}</td>
                <td class="celda-deposito">${fmtMoneda(r.deposito)}</td>
            </tr>`;
    }).join("");

    const t = totalesUnidad(unidadSeleccionada);
    $id("tableTotalProduccion").textContent = fmtMoneda(t.produccion);
    $id("tableTotalCombustible").textContent = fmtMoneda(t.combustible);
    $id("tableTotalGastoAdicional").textContent = fmtMoneda(t.gastoAdicional);
    $id("tableTotalDeposito").textContent = fmtMoneda(t.deposito);

    pintarEncabezadoVista(
        unidadSeleccionada,
        `${fmtFecha(calc[0].fecha)} – ${fmtFecha(calc[calc.length - 1].fecha)}`,
        t
    );
}

function pintarEncabezadoVista(unidad, periodo, totales) {
    $id("previewNumeroUnidad").textContent = unidad || "-";
    $id("reportHeaderDate").textContent = periodo || "Sin registros";

    $id("totalProduccionSemanal").textContent = totales ? fmtMoneda(totales.produccion) : "$0.00";
    $id("totalDepositoSemanal").textContent = totales ? fmtMoneda(totales.deposito) : "$0.00";
    $id("diasRegistrados").textContent = `${totales ? totales.dias : 0} / 7`;
}

function limpiarTotalesTabla() {
    ["tableTotalProduccion", "tableTotalCombustible",
        "tableTotalGastoAdicional", "tableTotalDeposito"].forEach((idCampo) => {
            $id(idCampo).textContent = "$0.00";
        });
}

function renderHistorial(filtro = "") {
    const lista = $id("historyList");
    const q = filtro.trim().toLowerCase();
    /* La consulta ya llega ordenada por fecha DESC desde Supabase */
    const items = registros
        .filter((r) => !q || r.unidad.toLowerCase().includes(q))
        .slice(0, 60);

    if (!items.length) {
        lista.innerHTML = `<li class="empty-state">Aún no hay registros.</li>`;
        return;
    }

    lista.innerHTML = items.map((r) => `
            <li class="history-item">
                <div>
                    <strong>Unidad ${esc(r.unidad)}</strong>
                    <span>${r.dia} · ${fmtFecha(r.fecha)} · ${esc(r.ruta || "-")}</span>
                    <span>Producción ${fmtMoneda(r.produccion)}</span>
                </div>
                <div class="historial-derecha">
                    <strong>${fmtMoneda(r.deposito)}</strong>
                    <button type="button" class="btn-delete" data-id="${r.id}">Eliminar</button>
                </div>
            </li>`).join("");
}

$id("historySearch").addEventListener("input", (e) => renderHistorial(e.target.value));

$id("historyList").addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-delete");
    if (!btn) return;

    if (!clienteListo()) {
        alert("La conexión con Supabase no está disponible.");
        return;
    }
    if (!confirm("¿Eliminar este registro?")) return;

    const error = await eliminarRegistro(btn.dataset.id);
    if (error) {
        console.error("Error al eliminar en Supabase:", error);
        alert("Error al eliminar el registro: " + error.message);
        return;
    }

    await refrescarInterfaz();
});

$id("printReportBtn").addEventListener("click", () => {
    if (!unidadSeleccionada || !registrosDeUnidad(unidadSeleccionada).length) {
        alert("Selecciona una unidad con registros antes de imprimir.");
        return;
    }
    window.print();
});

$id("newReportBtn").addEventListener("click", () => {
    unidadSeleccionada = null;
    reiniciarFormulario(false);
    renderTodo();
    document.querySelector(".form-panel")?.scrollIntoView({ behavior: "smooth" });
    $id("numeroUnidad").focus();
});

/* =====================================================
   DATOS DE PRUEBA
===================================================== */

async function insertarRegistrosDePrueba(silencioso = false) {
    if (!clienteListo()) {
        if (!silencioso) alert("La conexión con Supabase no está disponible.");
        return false;
    }

    const filasPrueba = [
        {
            unidad: "01",
            ruta: "Urb. Ciudad Verde",
            fecha: fechaRelativaISO(-6),
            produccion_bruta: 1250.00,
            combustible: 300.00,
            gastos_adicionales: 50.00,
            concepto_gastos: "Lavada y engrasado",
            deposito: 900.00,
        },
        {
            unidad: "01",
            ruta: "Urb. Ciudad Verde",
            fecha: fechaRelativaISO(-5),
            produccion_bruta: 1180.50,
            combustible: 280.00,
            gastos_adicionales: 0,
            concepto_gastos: null,
            deposito: 900.50,
        },
        {
            unidad: "02",
            ruta: "Centro – Terminal",
            fecha: fechaRelativaISO(-5),
            produccion_bruta: 1420.75,
            combustible: 350.25,
            gastos_adicionales: 75.00,
            concepto_gastos: "Reparación de puerta",
            deposito: 995.50,
        },
    ];

    const { data, error } = await supabaseClient
        .from(TABLA_REGISTROS)
        .insert(filasPrueba)
        .select();

    if (error) {
        console.error("Error al insertar datos de prueba:", error);
        if (!silencioso) alert("Error al insertar los datos de prueba: " + error.message);
        return false;
    }

    registros = await obtenerRegistros();
    renderTodo();

    if (!silencioso) {
        alert(`Se insertaron ${data.length} registros de prueba correctamente.`);
    }
    return true;
}

/* Disponible también desde la consola del navegador */
window.insertarRegistrosDePrueba = insertarRegistrosDePrueba;

$id("btnDatosPrueba").addEventListener("click", () => insertarRegistrosDePrueba(false));

/* =====================================================
   EXPORTACIÓN PDF (jsPDF)
===================================================== */

const PDF_PALETA = {
    texto: [23, 32, 51],
    gris: [100, 116, 139],
    azul: [37, 99, 235],
    azulOscuro: [23, 69, 181],
    borde: [214, 224, 238],
    fondoHead: [23, 32, 51],
    zebra: [246, 249, 255],
    totalesFondo: [238, 245, 255],
    verde: [7, 136, 63],
    verdeFondo: [234, 249, 240],
};

function exportarPDF(resumido = false) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("No se pudo cargar la librería jsPDF. Verifica tu conexión a internet.");
        return;
    }
    if (!unidadSeleccionada) {
        alert("Selecciona una unidad para exportar el reporte.");
        return;
    }

    const calc = registrosDeUnidad(unidadSeleccionada);
    if (!calc.length) {
        alert("La unidad seleccionada no tiene registros para exportar.");
        return;
    }

    const doc = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const C = PDF_PALETA;

    const anchoPagina = doc.internal.pageSize.getWidth();
    const altoPagina = doc.internal.pageSize.getHeight();
    const M = { izq: 12, der: 12, sup: 14, inf: 18 };
    const anchoUtil = anchoPagina - M.izq - M.der;
    const limiteY = () => altoPagina - M.inf;

    /* ---------- Encabezado del documento ---------- */
    let y = M.sup;

    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...C.texto);
    doc.text(resumido ? "REPORTE SEMANAL RESUMIDO" : "REPORTE SEMANAL DETALLADO", M.izq, y);

    y += 5.5;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...C.gris);

    const rutas = [...new Set(calc.map((r) => r.ruta).filter(Boolean))].join(" / ");
    const periodo = `${fmtFecha(calc[0].fecha)} – ${fmtFecha(calc[calc.length - 1].fecha)}`;
    doc.text(`Unidad ${unidadSeleccionada}  ·  Ruta: ${rutas || "-"}`, M.izq, y);
    doc.text(`Generado: ${ahoraTexto()}`, anchoPagina - M.der, y, { align: "right" });

    y += 3.5;
    doc.setFontSize(8.5);
    doc.text(`Periodo: ${periodo}`, M.izq, y);

    y += 2.5;
    doc.setDrawColor(...C.azul).setLineWidth(0.6);
    doc.line(M.izq, y, anchoPagina - M.der, y);
    y += 7;

    /* ---------- Configuración de columnas ---------- */
    const columnasDetallado = [
        { t: "Día", w: 14, a: "l" },
        { t: "Fecha", w: 17, a: "l" },
        { t: "Ruta", w: 28, a: "l" },
        { t: "Producción", w: 19, a: "r" },
        { t: "Combustible", w: 19, a: "r" },
        { t: "Gasto adicional", w: 24, a: "r" },
        { t: "Depósito", w: 18, a: "r" },
    ];

    const columnasResumido = [
        { t: "Día", w: 14, a: "l" },
        { t: "Fecha", w: 17, a: "l" },
        { t: "Ruta", w: 31, a: "l" },
        { t: "Producción", w: 21, a: "r" },
        { t: "Combustible", w: 21, a: "r" },
        { t: "Gasto adicional", w: 22, a: "r" },
        { t: "Depósito", w: 19, a: "r" },
    ];

    const columnas = resumido ? columnasResumido : columnasDetallado;

    const filas = calc.map((r) => [
        r.dia,
        fmtFecha(r.fecha),
        r.ruta || "-",
        fmtMoneda(r.produccion),
        fmtMoneda(r.combustible),
        r.gastoAdicional && r.gastoAdicional.monto
            ? `${fmtMoneda(r.gastoAdicional.monto)} - ${r.gastoAdicional.concepto}`
            : "-",
        fmtMoneda(r.deposito),
    ]);

    const t = totalesUnidad(unidadSeleccionada);
    const filaTotales = [
        "TOTAL SEMANAL",
        "",
        "",
        fmtMoneda(t.produccion),
        fmtMoneda(t.combustible),
        fmtMoneda(t.gastoAdicional),
        fmtMoneda(t.deposito),
    ];

    y = dibujarTablaPDF(doc, {
        columnas,
        filas,
        filaTotales,
        inicioY: y,
        margenX: M.izq,
        anchoUtil,
        supContenido: M.sup + 10,
        limiteY,
        paleta: C,
    });

    /* ---------- Tabla consolidada de unidades ---------- */
    y = agregarConsolidadoPDF(doc, { y, M, anchoPagina, anchoUtil, limiteY, paleta: C });

    /* ---------- Pie de página en todas las hojas ---------- */
    const totalPaginas = doc.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
        doc.setPage(i);
        doc.setDrawColor(...C.borde).setLineWidth(0.3);
        doc.line(M.izq, altoPagina - 11, anchoPagina - M.der, altoPagina - 11);
        doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...C.gris);
        doc.text("Control Semanal de Unidades", M.izq, altoPagina - 7);
        doc.text(`Página ${i} de ${totalPaginas}`, anchoPagina - M.der, altoPagina - 7, {
            align: "right",
        });
    }

    const tipo = resumido ? "Resumido" : "Detallado";
    doc.save(`Reporte_${tipo}_Unidad_${unidadSeleccionada}_${hoyISO()}.pdf`);
}

function dibujarTablaPDF(doc, opts) {
    const { columnas, filas, filaTotales, inicioY, margenX, anchoUtil, supContenido,
        limiteY, paleta: C } = opts;

    const sumaW = columnas.reduce((s, c) => s + c.w, 0);
    const ws = columnas.map((c) => (c.w * anchoUtil) / sumaW);
    const xs = [];
    let acumulado = margenX;
    ws.forEach((w) => {
        xs.push(acumulado);
        acumulado += w;
    });

    const padX = 1.8;
    const padY = 1.7;
    const lh = 3.6;
    const fsCuerpo = 7.8;
    const fsHead = 8.0;
    const hHeader = 7.6;

    function dibujarHeader(yActual) {
        doc.setFillColor(...C.fondoHead);
        doc.rect(margenX, yActual, anchoUtil, hHeader, "F");
        doc.setFont("helvetica", "bold").setFontSize(fsHead).setTextColor(255, 255, 255);

        columnas.forEach((c, i) => {
            const tx = c.a === "r" ? xs[i] + ws[i] - padX : xs[i] + padX;
            doc.text(c.t, tx, yActual + 5, { align: c.a === "r" ? "right" : "left" });
        });
        return yActual + hHeader;
    }

    doc.setFont("helvetica", "normal").setFontSize(fsCuerpo);
    const medidasFilas = filas.map((f) => {
        const lineas = f.map((cell, i) =>
            doc.splitTextToSize(String(cell), ws[i] - padX * 2).slice(0, 2)
        );
        const maxLineas = Math.max(...lineas.map((l) => l.length));
        return { lineas, h: maxLineas * lh + padY * 2 };
    });

    let y = inicioY;
    y = dibujarHeader(y);

    medidasFilas.forEach((m, idx) => {
        if (y + m.h > limiteY()) {
            doc.addPage();
            y = dibujarHeader(supContenido);
        }

        if (idx % 2 === 1) {
            doc.setFillColor(...C.zebra);
            doc.rect(margenX, y, anchoUtil, m.h, "F");
        }

        doc.setFont("helvetica", "normal").setFontSize(fsCuerpo).setTextColor(...C.texto);
        m.lineas.forEach((lineasCelula, i) => {
            const alineacion = columnas[i].a === "r" ? "right" : "left";
            const tx = alineacion === "right" ? xs[i] + ws[i] - padX : xs[i] + padX;
            lineasCelula.forEach((ln, j) => {
                doc.text(ln, tx, y + padY + 2.6 + j * lh, { align: alineacion });
            });
        });

        doc.setDrawColor(...C.borde).setLineWidth(0.2);
        doc.line(margenX, y + m.h, margenX + anchoUtil, y + m.h);
        y += m.h;
    });

    /* Fila de totales */
    doc.setFont("helvetica", "normal").setFontSize(fsCuerpo);
    const hTotales = lh + padY * 2;
    if (y + hTotales > limiteY()) {
        doc.addPage();
        y = dibujarHeader(supContenido);
    }

    doc.setFillColor(...C.totalesFondo);
    doc.rect(margenX, y, anchoUtil, hTotales, "F");
    doc.setDrawColor(...C.azul).setLineWidth(0.4);
    doc.line(margenX, y, margenX + anchoUtil, y);

    doc.setFont("helvetica", "bold").setFontSize(fsCuerpo).setTextColor(...C.azulOscuro);
    filaTotales.forEach((cell, i) => {
        if (cell === "") return;
        const tx = columnas[i].a === "r" ? xs[i] + ws[i] - padX : xs[i] + padX;
        doc.text(String(cell), tx, y + padY + 2.6, { align: columnas[i].a === "r" ? "right" : "left" });
    });
    doc.line(margenX, y + hTotales, margenX + anchoUtil, y + hTotales);

    return y + hTotales + 8;
}

function agregarConsolidadoPDF(doc, opts) {
    const { y: yInicial, M, anchoPagina, anchoUtil, limiteY, paleta: C } = opts;

    const datos = unidadesRegistradas()
        .map((u) => ({ unidad: u, ...totalesUnidad(u) }))
        .sort((a, b) => b.produccion - a.produccion);

    const colW = [anchoUtil * 0.40, anchoUtil * 0.30, anchoUtil * 0.30];
    const xCols = [M.izq, M.izq + colW[0], M.izq + colW[0] + colW[1]];
    const hHead = 7.4;
    const hFila = 6.8;
    const hTotal = 7.6;

    let y = yInicial;

    const altoNecesario = 12 + hHead + datos.length * hFila + hTotal + 4;
    if (y + altoNecesario > limiteY()) {
        doc.addPage();
        y = M.sup;
    }

    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...C.texto);
    doc.text("CONSOLIDADO DE PRODUCCIÓN POR UNIDAD", M.izq, y, { charSpace: 0.5 });
    y += 2.2;
    doc.setDrawColor(...C.azul).setLineWidth(0.5);
    doc.line(M.izq, y, anchoPagina - M.der, y);
    y += 4.5;

    doc.setFillColor(...C.fondoHead);
    doc.rect(M.izq, y, anchoUtil, hHead, "F");
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(255, 255, 255);
    doc.text("Unidad", xCols[0] + 2, y + 4.9);
    doc.text("Producción Total ($)", xCols[1] + colW[1] - 2, y + 4.9, { align: "right" });
    doc.text("Depósito Total ($)", xCols[2] + colW[2] - 2, y + 4.9, { align: "right" });
    y += hHead;

    datos.forEach((d, idx) => {
        if (idx % 2 === 1) {
            doc.setFillColor(...C.zebra);
            doc.rect(M.izq, y, anchoUtil, hFila, "F");
        }
        doc.setFont("helvetica", "normal").setFontSize(8.2).setTextColor(...C.texto);
        doc.text(`Unidad ${d.unidad}`, xCols[0] + 2, y + 4.6);
        doc.text(fmtMoneda(d.produccion), xCols[1] + colW[1] - 2, y + 4.6, { align: "right" });
        doc.text(fmtMoneda(d.deposito), xCols[2] + colW[2] - 2, y + 4.6, { align: "right" });
        doc.setDrawColor(...C.borde).setLineWidth(0.2);
        doc.line(M.izq, y + hFila, M.izq + anchoUtil, y + hFila);
        y += hFila;
    });

    doc.setFillColor(...C.verdeFondo);
    doc.rect(M.izq, y, anchoUtil, hTotal, "F");
    doc.setDrawColor(...C.verde).setLineWidth(0.4);
    doc.line(M.izq, y, M.izq + anchoUtil, y);

    const prodCombinado = datos.reduce((s, d) => s + d.produccion, 0);
    const depCombinado = datos.reduce((s, d) => s + d.deposito, 0);

    doc.setFont("helvetica", "bold").setFontSize(8.4).setTextColor(...C.verde);
    doc.text("TOTAL COMBINADO", xCols[0] + 2, y + 5);
    doc.text(fmtMoneda(prodCombinado), xCols[1] + colW[1] - 2, y + 5, { align: "right" });
    doc.text(fmtMoneda(depCombinado), xCols[2] + colW[2] - 2, y + 5, { align: "right" });
    doc.line(M.izq, y + hTotal, M.izq + anchoUtil, y + hTotal);

    return y + hTotal;
}

$id("downloadDetailedPdfBtn").addEventListener("click", () => exportarPDF(false));
$id("downloadSummaryPdfBtn").addEventListener("click", () => exportarPDF(true));

/* =====================================================
   INICIALIZACIÓN
===================================================== */

(async function iniciar() {
    fechaInput.value = hoyISO();
    diaSemanaInput.value = nombreDia(fechaInput.value);
    actualizarCamposGasto();
    calcularEnVivo();

    if (clienteListo()) {
        registros = await obtenerRegistros();

        /* Si la tabla está vacía, siembra datos de prueba automáticamente */
        if (!registros.length) {
            const ok = await insertarRegistrosDePrueba(true);
            if (ok) {
                registros = await obtenerRegistros();
            }
        }
    }

    renderTodo();
})();
