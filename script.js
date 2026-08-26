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
        /* Filas antiguas sin las columnas nuevas → 0 / default */
        estadoDia: fila.estado_dia || "produccion",
        produccion: num(fila.produccion_bruta),
        combustible: num(fila.combustible),
        administracion: num(fila.administracion),
        alimentacionLimpieza: num(fila.alimentacion_limpieza),
        conductorMonto: num(fila.conductor_monto),
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

/* Insert directo con todas las columnas del detalle de
   producción (requiere la migración aplicada en Supabase:
   ver supabase/migrations/20260825120000_*.sql) */
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

/* Traduce el error crudo de Supabase a un diagnóstico
   claro para el usuario */
function clasificarErrorGuardado(error) {
    const mensaje = String(error?.message || error || "");
    const codigo = String(error?.code || "");

    /* PGRST204 / schema cache: columnas no migradas o
       caché de PostgREST desactualizada tras el ALTER */
    if (codigo === "PGRST204" || /could not find the|schema cache|column .* of .* relation/i.test(mensaje)) {
        return {
            titulo: "Esquema desactualizado",
            mensaje:
                "La tabla «registros_semanales» todavía no expone las columnas nuevas (administración, alimentación, conductor, estado).\n\n" +
                "1) Ejecuta en el SQL Editor de Supabase:\n" +
                "ALTER TABLE registros_semanales ADD COLUMN IF NOT EXISTS administracion NUMERIC(10,2) DEFAULT 0;\n" +
                "(bloque completo en supabase/migrations/…sql)\n\n" +
                "2) Si YA lo ejecutaste, recarga el caché con:\n" +
                "NOTIFY pgrst, 'reload schema';\n\n" +
                "Después recarga esta página.",
        };
    }

    /* Fallos de red / DNS / timeout */
    if (/failed to fetch|networkerror|load failed|fetch failed|timeout|err_name_not_resolved/i.test(mensaje)) {
        return {
            titulo: "Sin conexión",
            mensaje:
                "No se pudo contactar con Supabase.\n\n" +
                "Revisa tu conexión a internet y vuelve a intentarlo. Si el problema persiste, verifica que el proyecto de Supabase esté activo.",
        };
    }

    /* Permisos RLS */
    if (/row-level security|violates|permission denied|42501/i.test(mensaje)) {
        return {
            titulo: "Permisos insuficientes",
            mensaje:
                "Supabase rechazó la inserción por políticas de seguridad (RLS).\n\n" +
                "Revisa que exista una política INSERT para el rol anónimo en «registros_semanales».",
        };
    }

    return {
        titulo: "Error al guardar",
        mensaje: "No se pudo guardar el registro:\n\n" + (mensaje || "Error desconocido."),
    };
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
const estadoDiaSelect = $id("estadoDia");

/* =====================================================
   GASTOS ADICIONALES DINÁMICOS (filas múltiples)
   ===================================================== */

function crearFilaGastoHTML() {
    return `
        <div class="gasto-fila">
            <label class="field campo-monto">
                <span>Monto ($)</span>
                <div class="money-input">
                    <span>$</span>
                    <input type="number" class="gasto-monto" min="0" step="0.01" placeholder="0.00">
                </div>
            </label>
            <label class="field campo-concepto">
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

/* =====================================================
   MOTOR DE CÁLCULO — Detalle de producción
   Única fuente de verdad: la usan el cálculo en vivo
   y el guardado en Supabase.
   ===================================================== */

function calcularValoresFormulario() {
    /* Solo los días con producción aportan montos de ingreso;
       en Parada quedan en $0.00 */
    const enProduccion = estadoDiaSelect.value === "produccion";

    const produccion = enProduccion ? num($id("produccionTotal").value) : 0;
    const combustible = enProduccion ? num($id("combustible").value) : 0;
    const administracion = enProduccion ? num($id("administracion").value) : 0;
    const alimentacionLimpieza = enProduccion
        ? num($id("alimentacionLimpieza").value)
        : 0;

    const conductorPorcentaje = enProduccion
        ? num($id("conductorPorcentaje").value)
        : 0;

    /* Conductor ($) = Producción total × (% / 100) */
    const conductorMonto = produccion * (conductorPorcentaje / 100);

    /* Los gastos adicionales aplican también en días de
       Parada (ej. reparaciones); el Depósito los refleja */
    const sumaGastos = leerGastosFormulario().reduce((s, g) => s + g.monto, 0);

    /* Depósito ($) = Producción − Combustible − Administración
       − Alimentación/Limpieza − Conductor ($) − Gastos adicionales */
    const deposito = produccion - combustible - administracion
        - alimentacionLimpieza - conductorMonto - sumaGastos;

    return {
        enProduccion,
        produccion,
        combustible,
        administracion,
        alimentacionLimpieza,
        conductorPorcentaje,
        conductorMonto,
        sumaGastos,
        deposito,
    };
}

/* Estado "Parada": deshabilita los campos de producción e
   ingresos y pone todo en $0.00. Los gastos adicionales
   siguen disponibles y el Depósito los refleja solos */
function aplicarEstadoDia() {
    const enProduccion = estadoDiaSelect.value === "produccion";
    const camposMonto = ["produccionTotal", "combustible", "administracion",
        "alimentacionLimpieza", "conductorPorcentaje"];

    camposMonto.forEach((idCampo) => {
        const campo = $id(idCampo);
        if (!enProduccion) campo.value = "";
        campo.disabled = !enProduccion;
    });

    /* Atenúa visualmente el bloque de montos */
    $id("productionFields").classList.toggle("dia-inactivo", !enProduccion);

    actualizarCamposGasto();
}

function calcularEnVivo() {
    const v = calcularValoresFormulario();

    $id("conductorMonto").value = nf.format(v.conductorMonto);
    $id("deposito").value = nf.format(v.deposito);
    $id("resumenProduccion").textContent = fmtMoneda(v.produccion);
    $id("resumenDeposito").textContent = fmtMoneda(v.deposito);
}

fechaInput.addEventListener("change", () => {
    diaSemanaInput.value = nombreDia(fechaInput.value);
});

tieneGastoSelect.addEventListener("change", actualizarCamposGasto);

estadoDiaSelect.addEventListener("change", aplicarEstadoDia);

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

/* Recalculo en tiempo real mientras el usuario escribe */
["produccionTotal", "combustible", "administracion",
    "alimentacionLimpieza", "conductorPorcentaje"].forEach((idCampo) => {
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

    /* Todos los valores derivados del motor de cálculo */
    const v = calcularValoresFormulario();

    /* Suma total de todos los gastos adicionales ingresados */
    const gastos = leerGastosFormulario();

    /* Concatena los conceptos: "Llanta ($10.00), Aceite ($15.00)".
       Aplica también en días de Parada con gastos */
    const conceptoGastos =
        v.sumaGastos > 0
            ? gastos
                  .filter((g) => g.monto > 0)
                  .map((g) => `${g.concepto || "Gasto adicional"} (${fmtMoneda(g.monto)})`)
                  .join(", ") || "Gasto adicional"
            : null;

    const payload = {
        unidad: $id("numeroUnidad").value.trim(),
        ruta: $id("ruta").value.trim(),
        fecha: fechaInput.value,
        estado_dia: estadoDiaSelect.value,
        produccion_bruta: v.produccion,
        combustible: v.combustible,
        administracion: v.administracion,
        alimentacion_limpieza: v.alimentacionLimpieza,
        conductor_porcentaje: v.conductorPorcentaje,
        conductor_monto: v.conductorMonto,
        gastos_adicionales: v.sumaGastos,
        concepto_gastos: conceptoGastos,
        deposito: v.deposito,
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
        const diagnostico = clasificarErrorGuardado(error);
        mostrarModalAviso(diagnostico.titulo, diagnostico.mensaje);
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
    estadoDiaSelect.value = "produccion";
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
                <div class="unit-card${activa}" data-unidad="${esc(u)}" role="button" tabindex="0" aria-label="Ver reporte de la Unidad ${esc(u)}">
                    <div class="unit-info">
                        <strong>Unidad ${esc(u)}</strong>
                        <span>${t.dias} día(s) · Producción ${fmtMoneda(t.produccion)}</span>
                        <span>Depósito ${fmtMoneda(t.deposito)}</span>
                    </div>
                    <button type="button" class="btn-delete-unit" data-unidad="${esc(u)}" title="Borrar Unidad ${esc(u)}" aria-label="Borrar Unidad ${esc(u)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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

/* La tarjeta ya no es un <button> nativo: se maneja
   Enter / Espacio para seleccionarla por teclado */
on("unitsList", "keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;

    const card = e.target.closest(".unit-card");
    if (!card || e.target.closest(".btn-delete-unit")) return;

    e.preventDefault();
    unidadSeleccionada = card.dataset.unidad;
    renderTodo();
});

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
   SEMANA COMPLETA — Lunes a Domingo
   Genera los 7 días de la semana para el reporte.
   Si un día no tiene registro, lo rellena con guiones.
   ===================================================== */

/**
 * Convierte un string ISO "YYYY-MM-DD" a objeto Date (mediodía).
 */
function _isoADate(iso) {
    return new Date(iso + "T12:00:00");
}

/**
 * Obtiene el lunes de la semana que contiene la fecha dada.
 */
function _lunesDeLaSemana(fecha) {
    const d = new Date(fecha);
    const dia = d.getDay();           // 0=Dom, 1=Lun, …, 6=Sáb
    const diff = dia === 0 ? -6 : 1 - dia;   // offset hasta lunes
    d.setDate(d.getDate() + diff);
    return d;
}

/**
 * Formatea un Date a "YYYY-MM-DD".
 */
function _dateAISO(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/**
 * Genera un array de 7 objetos (Lunes → Domingo) para la semana
 * que contiene los registros de la unidad.
 *
 * Cada objeto: { dia, fecha, fechaISO, ruta, deposito, estadoDia, registro }
 * Si no hay registro para ese día, deposito = null, ruta = "", estadoDia = "sin_registro".
 *
 * @param {Array} regs — registrosDeUnidad(unidad), ya ordenados
 * @returns {Array} 7 elementos
 */
function construirSemanaCompleta(regs) {
    if (!regs.length) return [];

    /* Rango de fechas de los registros */
    const fechas = regs.map(r => _isoADate(r.fecha)).sort((a, b) => a - b);
    const primera = fechas[0];
    const ultima  = fechas[fechas.length - 1];

    /* Lunes anterior o igual a la primera fecha; domingo posterior o igual a la última */
    const lunesInicio = _lunesDeLaSemana(primera);
    const domingoFin  = new Date(lunesInicio);
    domingoFin.setDate(domingoFin.getDate() + 6);

    /* Si los registros abarcan más de una semana, extender hasta cubrir todos */
    if (ultima > domingoFin) {
        const nuevoDomingo = _lunesDeLaSemana(ultima);
        nuevoDomingo.setDate(nuevoDomingo.getDate() + 6);
        domingoFin.setTime(nuevoDomingo.getTime());
    }

    /* Mapa rápido: fechaISO → registro */
    const mapa = new Map();
    regs.forEach(r => mapa.set(r.fecha, r));

    /* Construir todos los días Lun→Dom en el rango */
    const diasSemana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    const resultado = [];
    const cursor = new Date(lunesInicio);

    while (cursor <= domingoFin) {
        const iso = _dateAISO(cursor);
        const reg = mapa.get(iso);
        const diaSemana = diasSemana[cursor.getDay() === 0 ? 6 : cursor.getDay() - 1];

        resultado.push({
            dia:       diaSemana,
            fecha:     fmtFecha(iso),
            fechaISO:  iso,
            ruta:      reg ? (reg.ruta || "-") : "",
            deposito:  reg ? reg.deposito : null,
            estadoDia: reg ? reg.estadoDia : "sin_registro",
            registro:  reg || null,
        });

        cursor.setDate(cursor.getDate() + 1);
    }

    return resultado;
}

/* =====================================================
   EXPORTACIÓN PDF — Formato minimalista B/N
===================================================== */

/**
 * Genera y descarga el PDF del Reporte Semanal de una unidad.
 * Formato: título UNIDAD XX, tabla 4 columnas (Día, Fecha, Ruta, Depósito),
 * total depositado al pie alineado a la derecha.
 *
 * @param {string} unidadId  — Número de la unidad seleccionada
 * @param {Array}  registros — Lista normalizada de registros de la unidad
 */
function generarPDFReporteSemanal(unidadId, registros) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        mostrarModalAviso(
            "Librería no disponible",
            "La librería jsPDF no se cargó.\n\nVerifica tu conexión a internet y recarga la página."
        );
        return;
    }
    const { jsPDF } = window.jspdf;

    if (!registros || !registros.length) {
        mostrarModalAviso("Sin registros", "La unidad no tiene registros para exportar.");
        return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pagAncho = doc.internal.pageSize.getWidth();
    const pagAlto  = doc.internal.pageSize.getHeight();
    const M = { l: 18, r: 18, t: 22, b: 18 };
    const utilW = pagAncho - M.l - M.r;
    const maxY  = () => pagAlto - M.b;

    const t = totalesUnidad(unidadId);
    const semana = construirSemanaCompleta(registros);

    /* ---- Título ---- */
    let y = M.t;
    doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(0, 0, 0);
    doc.text("UNIDAD " + unidadId, M.l, y);
    y += 12;

    doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
    doc.line(M.l, y, pagAncho - M.r, y);
    y += 8;

    /* ---- Columnas: Día | Fecha | Ruta | Depósito ---- */
    const cols = [
        { label: "Día",       pct: 0.18, align: "left"  },
        { label: "Fecha",     pct: 0.22, align: "left"  },
        { label: "Ruta",      pct: 0.40, align: "left"  },
        { label: "Depósito",  pct: 0.20, align: "right" },
    ];

    const colW = cols.map(c => utilW * c.pct);
    const colX = [];
    let acc = M.l;
    colW.forEach(w => { colX.push(acc); acc += w; });

    const PADX   = 3;
    const LH     = 5;
    const HHEAD  = 9;
    const HFILA  = 10;
    const FS     = 9.5;

    /* ---- Cabecera de tabla (cuadrícula completa) ---- */
    function dibujarCabecera(y0) {
        doc.setDrawColor(0, 0, 0).setLineWidth(0.4);
        doc.rect(M.l, y0, utilW, HHEAD);
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 0, 0);
        cols.forEach((c, i) => {
            const tx = c.align === "right"
                ? colX[i] + colW[i] - PADX
                : colX[i] + PADX;
            doc.text(c.label, tx, y0 + 6, { align: c.align });
        });
        /* Líneas verticales de columna */
        cols.forEach((_, i) => {
            if (i > 0) {
                doc.setDrawColor(0, 0, 0).setLineWidth(0.2);
                doc.line(colX[i], y0, colX[i], y0 + HHEAD);
            }
        });
        return y0 + HHEAD;
    }

    y = dibujarCabecera(y);

    /* ---- Filas: 7 días (Lun → Dom) con cuadrícula completa ---- */
    doc.setFont("helvetica", "normal").setFontSize(FS).setTextColor(0, 0, 0);

    semana.forEach(dia => {
        const esParada    = dia.estadoDia === "parada";
        const sinRegistro = dia.estadoDia === "sin_registro";

        let depTxt;
        let rutaTxt;
        if (sinRegistro) {
            rutaTxt = "\u2014";
            depTxt  = "\u2014";
        } else if (esParada) {
            rutaTxt = dia.ruta;
            depTxt  = "PARADA";
        } else {
            rutaTxt = dia.ruta;
            depTxt  = dia.deposito > 0 ? fmtMoneda(dia.deposito) : "\u2014";
        }

        const celdas = [dia.dia, dia.fecha, rutaTxt, depTxt];

        if (y + HFILA > maxY()) {
            doc.addPage();
            y = dibujarCabecera(M.t);
        }

        /* Fondo de celda */
        doc.setDrawColor(0, 0, 0).setLineWidth(0.15);

        celdas.forEach((cell, i) => {
            const x1 = colX[i];
            const w1 = colW[i];
            /* Borde exterior de cada celda (cuadrícula completa) */
            doc.rect(x1, y, w1, HFILA);
            /* Texto */
            const tx = cols[i].align === "right"
                ? x1 + w1 - PADX
                : x1 + PADX;
            doc.text(String(cell), tx, y + LH, { align: cols[i].align });
        });

        y += HFILA;
    });

    /* ---- Total depositado ---- */
    y += 6;
    if (y + 12 > maxY()) {
        doc.addPage();
        y = M.t;
    }

    doc.setDrawColor(0, 0, 0).setLineWidth(0.4);
    doc.line(M.l, y, M.l + utilW, y);
    y += 8;

    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 0, 0);
    doc.text(
        "Total depositado: " + fmtMoneda(t.deposito),
        pagAncho - M.r, y, { align: "right" }
    );

    /* ---- Pie de página ---- */
    const nPag = doc.getNumberOfPages();
    for (let i = 1; i <= nPag; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(120, 120, 120);
        doc.text("Control Semanal de Unidades", M.l, pagAlto - 8);
        doc.text("Página " + i + " de " + nPag, pagAncho - M.r, pagAlto - 8, { align: "right" });
    }

    doc.save("Reporte_Unidad_" + unidadId + "_" + hoyISO() + ".pdf");
}

/**
 * Genera y descarga el PDF de la Tabla Resumida (todas las unidades).
 * Formato: encabezado "Producción de las X unidades", rango de fechas,
 * tabla 2 columnas (Unidad, Depósito total), fila TOTAL al final.
 *
 * @param {Array}  resumenUnidades — [{ unidad, deposito, produccion, ... }]
 * @param {string} rangoFechas     — "DD/MM/AAAA hasta DD/MM/AAAA"
 */
function generarPDFTablaResumida(resumenUnidades, rangoFechas) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        mostrarModalAviso(
            "Librería no disponible",
            "La librería jsPDF no se cargó.\n\nVerifica tu conexión a internet y recarga la página."
        );
        return;
    }
    const { jsPDF } = window.jspdf;

    if (!resumenUnidades || !resumenUnidades.length) {
        mostrarModalAviso("Sin datos", "No hay unidades registradas para generar la tabla resumida.");
        return;
    }

    const datos = resumenUnidades.slice().sort((a, b) => num(a.unidad) - num(b.unidad));

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pagAncho = doc.internal.pageSize.getWidth();
    const pagAlto  = doc.internal.pageSize.getHeight();
    const M = { l: 18, r: 18, t: 22, b: 18 };
    const utilW = pagAncho - M.l - M.r;
    const maxY  = () => pagAlto - M.b;

    /* ---- Encabezado (título y rango a la izquierda) ---- */
    let y = M.t;
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(0, 0, 0);
    doc.text("Producción de las " + datos.length + " unidades", M.l, y);
    y += 7;

    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100, 100, 100);
    doc.text(rangoFechas, M.l, y);
    y += 10;

    doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
    doc.line(M.l, y, pagAncho - M.r, y);
    y += 8;

    /* ---- Tabla: 60% de ancho, alineada a la derecha ---- */
    const tablaW  = utilW * 0.60;
    const tablaX   = pagAncho - M.r - tablaW;          /* derecho */
    const colPct  = [0.55, 0.45];
    const colW    = colPct.map(p => tablaW * p);
    const colX    = [tablaX, tablaX + colW[0]];

    const PADX  = 3;
    const LH    = 5;
    const HHEAD = 9;
    const HFILA = 10;

    /* ---- Cabecera de tabla (cuadrícula completa) ---- */
    function dibujarCabecera(y0) {
        doc.setDrawColor(0, 0, 0).setLineWidth(0.4);
        doc.rect(tablaX, y0, tablaW, HHEAD);
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 0, 0);
        doc.text("Unidad", colX[0] + PADX, y0 + 6);
        doc.text("Depósito total", colX[1] + colW[1] - PADX, y0 + 6, { align: "right" });
        /* Línea vertical separadora */
        doc.setDrawColor(0, 0, 0).setLineWidth(0.2);
        doc.line(colX[1], y0, colX[1], y0 + HHEAD);
        return y0 + HHEAD;
    }

    y = dibujarCabecera(y);

    /* ---- Filas (cuadrícula completa: rect por celda) ---- */
    datos.forEach(d => {
        if (y + HFILA > maxY()) {
            doc.addPage();
            y = dibujarCabecera(M.t);
        }

        doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0).setLineWidth(0.15);

        /* Celda "Unidad" */
        doc.rect(colX[0], y, colW[0], HFILA);
        doc.text("Unidad " + d.unidad, colX[0] + PADX, y + LH);

        /* Celda "Depósito total" */
        doc.rect(colX[1], y, colW[1], HFILA);
        doc.text(fmtMoneda(d.deposito), colX[1] + colW[1] - PADX, y + LH, { align: "right" });

        y += HFILA;
    });

    /* ---- Fila TOTAL (cuadrícula completa) ---- */
    if (y + HFILA + 4 > maxY()) {
        doc.addPage();
        y = M.t;
    }

    y += 1;
    const depGlobal = datos.reduce((s, d) => s + d.deposito, 0);

    doc.setDrawColor(0, 0, 0).setLineWidth(0.4);
    /* Borde superior de TOTAL */
    doc.rect(tablaX, y, tablaW, HFILA);
    /* Separador interno */
    doc.setDrawColor(0, 0, 0).setLineWidth(0.2);
    doc.line(colX[1], y, colX[1], y + HFILA);

    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 0, 0);
    doc.text("TOTAL", colX[0] + PADX, y + LH);
    doc.text(fmtMoneda(depGlobal), colX[1] + colW[1] - PADX, y + LH, { align: "right" });

    /* ---- Pie de página ---- */
    const nPag = doc.getNumberOfPages();
    for (let i = 1; i <= nPag; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(120, 120, 120);
        doc.text("Control Semanal de Unidades", M.l, pagAlto - 8);
        doc.text("Página " + i + " de " + nPag, pagAncho - M.r, pagAlto - 8, { align: "right" });
    }

    doc.save("Tabla_Resumida_" + hoyISO() + ".pdf");
}

/**
 * Abre una ventana limpia con el reporte HTML y dispara la impresión
 * nativa del navegador (Ctrl+P / Cmd+P).  El diseño usa los estilos
 * @media print definidos en style.css.
 */
function imprimirReporteEnPantalla() {
    const unitId = unidadSeleccionada;
    const regs   = unitId ? registrosDeUnidad(unitId) : [];

    if (!regs.length) {
        mostrarModalAviso("Sin registros", "Selecciona una unidad con registros antes de imprimir.");
        return;
    }

    const t      = totalesUnidad(unitId);
    const semana = construirSemanaCompleta(regs);

    /* ---- Construir filas de la tabla (7 días fijos) ---- */
    let filasHTML = "";
    semana.forEach(d => {
        const esParada    = d.estadoDia === "parada";
        const sinRegistro = d.estadoDia === "sin_registro";

        let depTxt, rutaTxt;
        if (sinRegistro) {
            rutaTxt = "&mdash;";
            depTxt  = "&mdash;";
        } else if (esParada) {
            rutaTxt = esc(d.ruta);
            depTxt  = "<strong>PARADA</strong>";
        } else {
            rutaTxt = esc(d.ruta);
            depTxt  = d.deposito > 0 ? fmtMoneda(d.deposito) : "&mdash;";
        }

        filasHTML +=
            "<tr>" +
                "<td>" + esc(d.dia) + "</td>" +
                "<td>" + d.fecha + "</td>" +
                "<td>" + rutaTxt + "</td>" +
                "<td class=\"num\">" + depTxt + "</td>" +
            "</tr>";
    });

    /* ---- Resumen de todas las unidades (alineado a la derecha, 60%) ---- */
    const resumen = unidadesRegistradas()
        .map(u => ({ unidad: u, ...totalesUnidad(u) }))
        .sort((a, b) => num(a.unidad) - num(b.unidad));

    let resumenFilas = "";
    resumen.forEach(d => {
        resumenFilas +=
            "<tr>" +
                "<td>Unidad " + esc(d.unidad) + "</td>" +
                "<td class=\"num\">" + fmtMoneda(d.deposito) + "</td>" +
            "</tr>";
    });
    const depGlobal = resumen.reduce((s, d) => s + d.deposito, 0);
    const todasFechas = registros.map(r => r.fecha).sort();
    const rangoFechas = fmtFecha(todasFechas[0]) + " hasta " + fmtFecha(todasFechas[todasFechas.length - 1]);

    /* ---- HTML completo de la ventana de impresión ---- */
    const html = "<!DOCTYPE html><html lang=\"es\"><head>" +
        "<meta charset=\"UTF-8\">" +
        "<title>Reporte Unidad " + esc(unitId) + "</title>" +
        "<style>" +
            "*{box-sizing:border-box;margin:0;padding:0}" +
            "body{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:12px;padding:24px}" +
            "h1{font-size:22px;margin-bottom:12px}" +
            "hr.sep{border:none;border-top:2px solid #000;margin-bottom:16px}" +
            "table{border-collapse:collapse}" +
            "table.main{width:100%;margin-bottom:8px}" +
            "th,td{border:1px solid #000;padding:8px 12px;font-size:11px;text-align:left}" +
            "th{font-weight:bold;background:#fff}" +
            "td.num{text-align:right}" +
            ".total-line{margin-top:12px;text-align:right;font-weight:bold;font-size:12px}" +
            ".footer{margin-top:32px;font-size:7px;color:#888;display:flex;justify-content:space-between}" +
            ".resumen-section{margin-top:28px}" +
            ".resumen-section h2{font-size:14px;margin-bottom:6px}" +
            ".resumen-section .rango{font-size:10px;color:#666;margin-bottom:10px}" +
            "table.resumen{width:60%;margin-left:auto;margin-right:0}" +
            "@media print{" +
                "@page{size:A4 portrait;margin:15mm 12mm}" +
                "body{padding:0;background:#fff}" +
                "table,thead,tbody,tfoot,tr,td,th{page-break-inside:avoid}" +
                "thead{display:table-header-group}" +
            "}" +
        "</style>" +
        "</head><body>" +
        "<h1>UNIDAD " + esc(unitId) + "</h1>" +
        "<hr class=\"sep\">" +
        "<table class=\"main\">" +
            "<thead><tr>" +
                "<th>Día</th><th>Fecha</th><th>Ruta</th><th>Depósito</th>" +
            "</tr></thead>" +
            "<tbody>" + filasHTML + "</tbody>" +
        "</table>" +
        "<div class=\"total-line\">Total depositado: " + fmtMoneda(t.deposito) + "</div>" +
        "<div class=\"resumen-section\">" +
            "<h2>Producción de las " + resumen.length + " unidades</h2>" +
            "<div class=\"rango\">" + rangoFechas + "</div>" +
            "<table class=\"resumen\">" +
                "<thead><tr><th>Unidad</th><th>Depósito total</th></tr></thead>" +
                "<tbody>" + resumenFilas +
                    "<tr><td><strong>TOTAL</strong></td><td class=\"num\"><strong>" + fmtMoneda(depGlobal) + "</strong></td></tr>" +
                "</tbody>" +
            "</table>" +
        "</div>" +
        "<div class=\"footer\">" +
            "<span>Control Semanal de Unidades</span>" +
            "<span>Generado: " + ahoraTexto() + "</span>" +
        "</div>" +
        "</body></html>";

    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) {
        mostrarModalAviso("Ventana bloqueada", "El navegador bloqueó la ventana de impresión.\n\nPermite las ventanas emergentes para este sitio.");
        return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
}

/* =====================================================
   VINCULACIÓN DE BOTONES
   ===================================================== */

function vincularBarraReportes() {

    /* ---- Reporte semanal (PDF) ---- */
    on("downloadDetailedPdfBtn", "click", () => {
        ejecutarAccionReporte("generar el reporte semanal", async () => {
            if (!(await prepararReporte())) return;
            const calc = registrosDeUnidad(unidadSeleccionada);
            generarPDFReporteSemanal(unidadSeleccionada, calc);
        });
    });

    /* ---- Tabla resumida (PDF) ---- */
    on("downloadSummaryPdfBtn", "click", () => {
        ejecutarAccionReporte("generar la tabla resumida", async () => {
            if (!(await prepararReporte())) return;
            const resumen = unidadesRegistradas()
                .map(u => ({ unidad: u, ...totalesUnidad(u) }));
            const fechas  = registros.map(r => r.fecha).sort();
            const rango   = fmtFecha(fechas[0]) + " hasta " + fmtFecha(fechas[fechas.length - 1]);
            generarPDFTablaResumida(resumen, rango);
        });
    });

    /* ---- Imprimir (ventana limpia) ---- */
    on("printReportBtn", "click", () => {
        ejecutarAccionReporte("imprimir el reporte", async () => {
            if (!(await prepararReporte())) return;
            imprimirReporteEnPantalla();
        });
    });

    /* ---- Nuevo registro ---- */
    on("newReportBtn", "click", () => {
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
    aplicarEstadoDia();
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
