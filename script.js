"use strict";

/* Marcador para confirmar en consola qué versión ejecuta el navegador */
console.log("%c[script.js] v4 — gastos múltiples dinámicos + borrar unidad", "color:#2563eb;font-weight:bold;");

/* Ningún error puede quedar invisible */
window.addEventListener("error", (e) => {
    console.error("[script.js] Error global:", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
    console.error("[script.js] Promesa rechazada sin capturar:", e.reason);
});

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

/* Conecta eventos sin romper el resto del script si un
   elemento no existe en el HTML */
function on(id, evento, manejador) {
    const el = $id(id);
    if (!el) {
        console.error(`[script.js] No se encontró el elemento #${id} en index.html`);
        return null;
    }
    el.addEventListener(evento, manejador);
    return el;
}

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
    if (!clienteListo()) {
        console.error("Supabase no está disponible (revisa tu conexión o el CDN). No se pudieron cargar los registros.");
        return [];
    }

    try {
        const { data, error } = await supabaseClient
            .from(TABLA_REGISTROS)
            .select("*")
            .order("fecha", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error al cargar registros desde Supabase:", error);
            mostrarModalAviso("Error al cargar", "No se pudieron cargar los registros: " + error.message);
            return [];
        }
        return (data || []).map(normalizarRegistro);
    } catch (error) {
        console.error("Fallo de red al consultar Supabase:", error);
        mostrarModalAviso("Sin conexión", "No se pudo conectar con la base de datos.\n\nVerifica tu conexión a internet y recarga la página.");
        return [];
    }
}

async function insertarRegistro(payload) {
    if (!clienteListo()) {
        return { data: null, error: { message: "Supabase no está disponible." } };
    }
    try {
        const { data, error } = await supabaseClient
            .from(TABLA_REGISTROS)
            .insert(payload)
            .select();
        return { data, error };
    } catch (error) {
        return { data: null, error };
    }
}

async function eliminarRegistro(registroId) {
    if (!clienteListo()) {
        return { message: "Supabase no está disponible." };
    }
    try {
        const { error } = await supabaseClient
            .from(TABLA_REGISTROS)
            .delete()
            .eq("id", registroId);
        return error;
    } catch (error) {
        return error;
    }
}

/* Elimina TODOS los registros semanales que pertenecen a una unidad:
   DELETE FROM registros_semanales WHERE unidad = <numeroUnidad> */
async function eliminarRegistrosDeUnidad(numeroUnidad) {
    if (!clienteListo()) {
        return { message: "Supabase no está disponible." };
    }
    try {
        const { error } = await supabaseClient
            .from(TABLA_REGISTROS)
            .delete()
            .eq("unidad", numeroUnidad);
        return error;
    } catch (error) {
        return error;
    }
}

/* Trae siempre los datos más recientes desde Supabase */
async function sincronizarConSupabase() {
    if (clienteListo()) {
        registros = await obtenerRegistros();
    }
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

/* =====================================================
   GASTOS ADICIONALES DINÁMICOS (filas múltiples)
   ===================================================== */

function crearFilaGastoHTML() {
    return `
        <div class="gasto-fila">
            <label class="field">
                <span>Monto ($)</span>
                <div class="money-input">
                    <span>$</span>
                    <input type="number" class="gasto-monto" min="0" step="0.01" placeholder="0.00">
                </div>
            </label>
            <label class="field">
                <span>Concepto</span>
                <input type="text" class="gasto-concepto" placeholder="Ej: Llanta, aceite, multa…" maxlength="80">
            </label>
            <button type="button" class="btn-remove-gasto" title="Quitar este gasto" aria-label="Quitar este gasto">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>`;
}

function agregarFilaGasto(enfocar = false) {
    const lista = $id("gastosLista");
    lista.insertAdjacentHTML("beforeend", crearFilaGastoHTML());
    if (enfocar) {
        const montos = lista.querySelectorAll(".gasto-monto");
        montos[montos.length - 1]?.focus();
    }
}

/* Garantiza al menos una fila mientras el gasto está activo */
function asegurarFilaGasto() {
    if (!$id("gastosLista").children.length) agregarFilaGasto();
}

/* Vuelve al estado inicial: una sola fila vacía */
function limpiarFilasGasto() {
    $id("gastosLista").innerHTML = "";
    agregarFilaGasto();
}

/* Lee todas las filas visibles: [{ monto, concepto }] */
function leerGastosFormulario() {
    if (tieneGastoSelect.value !== "si") return [];
    return [...$id("gastosLista").querySelectorAll(".gasto-fila")]
        .map((fila) => ({
            monto: num(fila.querySelector(".gasto-monto")?.value),
            concepto: fila.querySelector(".gasto-concepto")?.value.trim() || "",
        }))
        .filter((g) => g.monto > 0 || g.concepto !== "");
}

function actualizarCamposGasto() {
    const activo = tieneGastoSelect.value === "si";
    $id("gastoAdicionalFields").classList.toggle("hidden", !activo);
    if (activo) {
        asegurarFilaGasto();
    } else {
        limpiarFilasGasto();
    }
    calcularEnVivo();
}

function calcularEnVivo() {
    const produccion = num($id("produccionTotal").value);
    const combustible = num($id("combustible").value);

    /* Depósito = Producción − Combustible − Suma total de gastos */
    const sumaGastos = leerGastosFormulario().reduce((s, g) => s + g.monto, 0);
    const deposito = produccion - combustible - sumaGastos;

    $id("deposito").value = nf.format(deposito);
    $id("resumenProduccion").textContent = fmtMoneda(produccion);
    $id("resumenDeposito").textContent = fmtMoneda(deposito);
}

fechaInput.addEventListener("change", () => {
    diaSemanaInput.value = nombreDia(fechaInput.value);
});

tieneGastoSelect.addEventListener("change", actualizarCamposGasto);

on("addGastoBtn", "click", () => agregarFilaGasto(true));

/* Delegación: los inputs de las filas se crean dinámicamente */
$id("gastosLista").addEventListener("input", calcularEnVivo);

$id("gastosLista").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-gasto");
    if (!btn) return;

    const fila = btn.closest(".gasto-fila");
    const lista = $id("gastosLista");

    if (lista.children.length > 1) {
        fila.remove();
    } else {
        /* Última fila: solo se limpia, nunca desaparece */
        fila.querySelector(".gasto-monto").value = "";
        fila.querySelector(".gasto-concepto").value = "";
    }
    calcularEnVivo();
});

["produccionTotal", "combustible"].forEach((idCampo) => {
    $id(idCampo).addEventListener("input", calcularEnVivo);
});

let guardando = false;

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!clienteListo()) {
        mostrarModalAviso("Sin conexión", "La conexión con Supabase no está disponible.");
        return;
    }
    if (guardando) return;

    const produccion = num($id("produccionTotal").value);
    const combustible = num($id("combustible").value);

    /* Suma total de todos los gastos adicionales ingresados */
    const gastos = leerGastosFormulario();
    const gastoTotal = gastos.reduce((s, g) => s + g.monto, 0);
    const deposito = produccion - combustible - gastoTotal;

    /* Concatena los conceptos: "Llanta ($10.00), Aceite ($15.00)" */
    const conceptoGastos =
        tieneGastoSelect.value === "si" && gastoTotal > 0
            ? gastos
                  .filter((g) => g.monto > 0)
                  .map((g) => `${g.concepto || "Gasto adicional"} (${fmtMoneda(g.monto)})`)
                  .join(", ") || "Gasto adicional"
            : null;

    const payload = {
        unidad: $id("numeroUnidad").value.trim(),
        ruta: $id("ruta").value.trim(),
        fecha: fechaInput.value,
        produccion_bruta: produccion,
        combustible: combustible,
        gastos_adicionales: gastoTotal,
        concepto_gastos: conceptoGastos,
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
        mostrarModalAviso("Error al guardar", "No se pudo guardar el registro: " + error.message);
        return;
    }

    unidadSeleccionada = payload.unidad;
    reiniciarFormulario(false);
    await refrescarInterfaz();

    mostrarModalExito(payload.unidad, payload.deposito);
});

on("resetFormBtn", "click", () => reiniciarFormulario(true));

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

on("exitoOverlay", "click", (e) => {
    if (e.target === e.currentTarget) cerrarModalExito();
});

/* =====================================================
   MODAL DE AVISO
===================================================== */

function mostrarModalAviso(titulo, mensaje) {
    $id("avisoTitulo").textContent = titulo;
    $id("avisoMensaje").textContent = mensaje;
    $id("avisoOverlay").classList.add("show");
}

function cerrarModalAviso() {
    $id("avisoOverlay").classList.remove("show");
}

on("avisoBtn", "click", cerrarModalAviso);

on("avisoOverlay", "click", (e) => {
    if (e.target === e.currentTarget) cerrarModalAviso();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        cerrarModalExito();
        cerrarModalAviso();
        cerrarModalConfirmar();
    }
});

/* =====================================================
   MODAL DE CONFIRMACIÓN (borrar unidad)
   ===================================================== */

let unidadPendienteBorrar = null;

function pedirConfirmacionBorrarUnidad(unidad) {
    unidadPendienteBorrar = unidad;
    $id("confirmTitulo").textContent = `Eliminar Unidad ${unidad}`;
    $id("confirmMensaje").textContent =
        `¿Estás seguro de eliminar la Unidad ${unidad} y todos sus registros semanales?\n\nEsta acción no se puede deshacer.`;
    $id("confirmOverlay").classList.add("show");
}

function cerrarModalConfirmar() {
    unidadPendienteBorrar = null;
    $id("confirmOverlay").classList.remove("show");
}

async function eliminarUnidadCompleta(unidad) {
    cerrarModalConfirmar();
    if (!unidad) return;

    if (!clienteListo()) {
        mostrarModalAviso("Sin conexión", "La conexión con Supabase no está disponible.");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from(TABLA_REGISTROS)
            .delete()
            .eq("unidad", unidad);

        if (error) throw error;
    } catch (error) {
        console.error("Error al eliminar la unidad en Supabase:", error);
        mostrarModalAviso(
            "Error al eliminar",
            `No se pudieron eliminar los registros de la Unidad ${unidad}: ${error?.message || error}`
        );
        return;
    }

    /* Limpia la vista si la unidad eliminada estaba seleccionada */
    if (unidadSeleccionada === unidad) {
        unidadSeleccionada = null;
    }

    /* Recarga desde Supabase, actualiza unidades e historial
       y recalcula el reporte semanal */
    await refrescarInterfaz();

    mostrarModalAviso("Unidad eliminada", `La Unidad ${unidad} y todos sus registros semanales fueron eliminados correctamente.`);
}

on("cancelDeleteBtn", "click", cerrarModalConfirmar);

on("confirmDeleteBtn", "click", () => {
    eliminarUnidadCompleta(unidadPendienteBorrar);
});

on("confirmOverlay", "click", (e) => {
    if (e.target === e.currentTarget) cerrarModalConfirmar();
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
                <div class="unit-item">
                    <button type="button" class="unit-card${activa}" data-unidad="${esc(u)}">
                        <strong>Unidad ${esc(u)}</strong>
                        <span>${t.dias} día(s) · Producción ${fmtMoneda(t.produccion)}</span>
                        <span>Depósito ${fmtMoneda(t.deposito)}</span>
                    </button>
                    <button type="button" class="btn-delete-unit" data-unidad="${esc(u)}" title="Borrar Unidad ${esc(u)}" aria-label="Borrar Unidad ${esc(u)}">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                </div>`;
        })
        .join("");
}

on("unitsList", "click", (e) => {
    const btnBorrar = e.target.closest(".btn-delete-unit");
    if (btnBorrar) {
        pedirConfirmacionBorrarUnidad(btnBorrar.dataset.unidad);
        return;
    }

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

on("historySearch", "input", (e) => renderHistorial(e.target.value));

on("historyList", "click", async (e) => {
    const btn = e.target.closest(".btn-delete");
    if (!btn) return;

    if (!clienteListo()) {
        mostrarModalAviso("Sin conexión", "La conexión con Supabase no está disponible.");
        return;
    }
    if (!confirm("¿Eliminar este registro?")) return;

    const error = await eliminarRegistro(btn.dataset.id);
    if (error) {
        console.error("Error al eliminar en Supabase:", error);
        mostrarModalAviso("Error al eliminar", "No se pudo eliminar el registro: " + error.message);
        return;
    }

    await refrescarInterfaz();
});

/* Garantiza que exista una unidad con datos antes de
   imprimir o exportar; si no hay selección, toma
   automáticamente la primera unidad disponible. */
function asegurarUnidadParaReporte() {
    if (!registros.length) {
        mostrarModalAviso("Sin registros", "Aún no hay registros para mostrar.\n\nGuarda un registro desde el formulario.");
        return false;
    }

    if (!unidadSeleccionada || !registrosDeUnidad(unidadSeleccionada).length) {
        unidadSeleccionada = unidadesRegistradas()
            .sort((a, b) => num(a) - num(b))[0];
        renderTodo();
    }
    return true;
}

/* Refresca desde Supabase y deja lista una unidad */
async function prepararReporte() {
    await sincronizarConSupabase();
    renderTodo();
    return asegurarUnidadParaReporte();
}

/* Envoltorio: ningún clic puede fallar en silencio */
async function ejecutarAccionReporte(descripcion, accion) {
    try {
        await accion();
    } catch (error) {
        console.error(`Error al ${descripcion}:`, error);
        mostrarModalAviso("Error en el reporte", `Ocurrió un problema al ${descripcion}.\n\nDetalles: ${error?.message || error}`);
    }
}

/* =====================================================
   DATOS DE PRUEBA — DESHABILITADO
   La siembra de registros ficticios fue eliminada para
   que la app arranque siempre con datos reales.
   ===================================================== */

/* =====================================================
   LIMPIEZA DE TABLA (temporal)
   Ejecutar desde la consola del navegador:
       await limpiarTablaRegistros();
   ===================================================== */

async function limpiarTablaRegistros() {
    if (!clienteListo()) {
        mostrarModalAviso("Sin conexión", "La conexión con Supabase no está disponible.");
        return false;
    }

    if (!confirm("¿Borrar TODOS los registros de la tabla registros_semanales? Esta acción no se puede deshacer.")) {
        return false;
    }

    const { error, count } = await supabaseClient
        .from(TABLA_REGISTROS)
        .delete()
        .neq("id", 0)
        .select();

    if (error) {
        console.error("Error al limpiar la tabla:", error);
        mostrarModalAviso("Error al limpiar", "No se pudo limpiar la tabla: " + error.message);
        return false;
    }

    console.log(`[limpieza] Registros eliminados: ${count ?? "(sin conteo)"}`);
    await refrescarInterfaz();
    return true;
}

window.limpiarTablaRegistros = limpiarTablaRegistros;

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
    console.log(`[PDF] Generando ${resumido ? "tabla resumida" : "reporte detallado"} (unidad: ${unidadSeleccionada ?? "sin selección"})…`);

    if (!window.jspdf || !window.jspdf.jsPDF) {
        mostrarModalAviso("Librería no disponible", "La librería jsPDF no se cargó.\n\nRevisa tu conexión a internet, desactiva bloqueadores y recarga la página.");
        return;
    }
    const { jsPDF } = window.jspdf;

    if (!unidadSeleccionada) {
        mostrarModalAviso("Selecciona una unidad", "Selecciona una unidad para exportar el reporte.");
        return;
    }

    const calc = registrosDeUnidad(unidadSeleccionada);
    if (!calc.length) {
        mostrarModalAviso("Unidad sin registros", "La unidad seleccionada no tiene registros para exportar.");
        return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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

/* Vincula los 4 botones de la barra de reportes */
function vincularBarraReportes() {
    on("downloadDetailedPdfBtn", "click", () => {
        console.log("[clic] Botón «Reporte semanal»");
        ejecutarAccionReporte("generar el reporte semanal", async () => {
            if (!(await prepararReporte())) return;
            exportarPDF(false);
        });
    });

    on("downloadSummaryPdfBtn", "click", () => {
        console.log("[clic] Botón «Tabla resumida»");
        ejecutarAccionReporte("generar la tabla resumida", async () => {
            if (!(await prepararReporte())) return;
            exportarPDF(true);
        });
    });

    on("printReportBtn", "click", () => {
        console.log("[clic] Botón «Imprimir»");
        ejecutarAccionReporte("imprimir el reporte", async () => {
            if (!(await prepararReporte())) return;
            window.print();
        });
    });

    on("newReportBtn", "click", () => {
        console.log("[clic] Botón «Nuevo registro»");
        ejecutarAccionReporte("preparar el nuevo registro", async () => {
            unidadSeleccionada = null;
            reiniciarFormulario(false);
            renderTodo();

            const panelFormulario = document.querySelector(".form-panel");
            panelFormulario?.scrollIntoView({ behavior: "smooth", block: "start" });

            const primerCampo = $id("numeroUnidad");
            primerCampo.focus();
            primerCampo.select();
        });
    });

    console.log("[script.js] Barra de reportes vinculada.");
}

/* =====================================================
   INICIALIZACIÓN
===================================================== */

async function inicializarApp() {
    fechaInput.value = hoyISO();
    diaSemanaInput.value = nombreDia(fechaInput.value);
    actualizarCamposGasto();
    calcularEnVivo();

    try {
        /* 1) Carga automática ANTES de renderizar:
              SELECT * FROM registros_semanales */
        console.log("[init] Consultando registros en Supabase…");
        await sincronizarConSupabase();
        console.log(`[init] Registros recibidos: ${registros.length}`);
    } catch (error) {
        console.error("Error al inicializar los datos desde Supabase:", error);
    }

    /* 2) Auto-selecciona la primera unidad disponible */
    if (registros.length && !unidadSeleccionada) {
        unidadSeleccionada = unidadesRegistradas()
            .sort((a, b) => num(a) - num(b))[0];
    }

    /* 3) AHORA sí: pinta métricas, tabla e historial */
    renderTodo();

    console.log(`[init] Interfaz lista. Unidad mostrada: ${unidadSeleccionada ?? "ninguna"}`);

    if (!clienteListo()) {
        console.warn("[init] Modo limitado: el CDN de Supabase no respondió.");
    }
}

/* Los botones se vinculan al cargar el script (el DOM ya existe
   porque script.js va al final del body), sin depender del fetch */
vincularBarraReportes();

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarApp);
} else {
    inicializarApp();
}
