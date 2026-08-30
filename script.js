"use strict";

/* Marcador para confirmar en consola qué versión ejecuta el navegador */
console.log("%c[script.js] v18 — Fin de semana (PARADA): CASO A (domingo→sábado), CASO B (sábado+domingo→viernes), Regla General: último día con producción de la misma semana; visible en PDF/impresión", "color:#333;font-weight:bold;");

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

/* =====================================================
   SEMANAS — utilidades y filtrado global
===================================================== */

/* Semana seleccionada para Reporte Semanal y Tabla Resumida:
   { inicio: "YYYY-MM-DD", fin: "YYYY-MM-DD" } (lunes–domingo) */
let semanaSeleccionada = null;

/* Se resuelve una vez los registros están cargados: la semana
   más reciente con datos (o la actual si no hay registros) */
function semanaPorDefecto() {
    if (!registros.length) return null;
    const ultimaFecha = registros
        .map((r) => r.fecha)
        .filter(Boolean)
        .sort()
        .pop();
    if (!ultimaFecha) return null;
    return rangoSemanaDe(ultimaFecha);
}

/* Lunes de la semana que contiene la fecha dada */
function lunesDeLaSemana(fecha) {
    const d = new Date(fecha);
    const dia = d.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + diff);
    return d;
}

/* Suma n días a una fecha ISO y devuelve ISO "YYYY-MM-DD" */
function sumarDiasISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Objeto { inicio, fin } de la semana (lunes–domingo) de una fecha ISO */
function rangoSemanaDe(fechaISO) {
    const inicio = _dateAISO(lunesDeLaSemana(new Date(fechaISO + "T12:00:00")));
    return { inicio, fin: sumarDiasISO(inicio, 6) };
}

/* Etiqueta visible de una semana: "DD/MM/AAAA al DD/MM/AAAA" */
function etiquetaSemana(semana) {
    return `${fmtFecha(semana.inicio)} al ${fmtFecha(semana.fin)}`;
}

/* Semanas a ofrecer en el selector:
   semana actual, semana anterior y cada semana con registros.
   Devuelve { inicio, fin } ordenadas de más reciente a más antigua */
function semanasDisponibles() {
    const mapa = new Map();
    let clave;

    clave = rangoSemanaDe(hoyISO()).inicio;
    mapa.set(clave, clave);

    clave = rangoSemanaDe(sumarDiasISO(hoyISO(), -7)).inicio;
    mapa.set(clave, clave);

    registros.forEach((r) => {
        if (!r.fecha) return;
        clave = rangoSemanaDe(r.fecha).inicio;
        mapa.set(clave, clave);
    });

    return [...mapa.keys()]
        .sort((a, b) => (a < b ? 1 : -1))
        .map((inicio) => ({ inicio, fin: sumarDiasISO(inicio, 6) }));
}

/* "DD/MM/AAAA - DD/MM/AAAA" de la semana seleccionada */
function textoPeriodoSemana() {
    return semanaSeleccionada
        ? `${fmtFecha(semanaSeleccionada.inicio)} - ${fmtFecha(semanaSeleccionada.fin)}`
        : "";
}

/* Registros globales filtrados a la semana seleccionada */
function registrosEnSemana(regs) {
    if (!semanaSeleccionada) return regs;
    return regs.filter((r) => r.fecha >= semanaSeleccionada.inicio && r.fecha <= semanaSeleccionada.fin);
}

/* Rellena el <select> con las semanas disponibles */
function renderSelectorSemana() {
    const sel = $id("semanaSelect");
    if (!sel) return;

    const semanas = semanasDisponibles();

    if (!semanas.length) {
        sel.innerHTML = `<option value="">Sin semanas</option>`;
        return;
    }

    if (!semanaSeleccionada || !semanas.some((s) => s.inicio === semanaSeleccionada.inicio)) {
        semanaSeleccionada = semanaPorDefecto() || semanas[0];
    }

    sel.innerHTML = semanas.map((s) => `
        <option value="${s.inicio}"${s.inicio === semanaSeleccionada.inicio ? " selected" : ""}>
            ${s.inicio === rangoSemanaDe(hoyISO()).inicio ? "Semana actual" : (s.inicio === rangoSemanaDe(sumarDiasISO(hoyISO(), -7)).inicio ? "Semana anterior" : "Semana")} (${etiquetaSemana(s)})
        </option>`).join("");

    sel.disabled = false;
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
        conductorPorcentaje: num(fila.conductor_porcentaje) || 18,
        gastoAdicional: montoGasto
            ? {
                concepto: fila.concepto_gastos || "Gasto adicional",
                monto: montoGasto,
            }
            : null,
        deposito: num(fila.deposito),
        observaciones: fila.observaciones || "",
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
                "La tabla «registros_semanales» todavía no expone las columnas nuevas (administración, alimentación, conductor, estado, observaciones).\n\n" +
                "1) Ejecuta en el SQL Editor de Supabase:\n" +
                "ALTER TABLE registros_semanales ADD COLUMN IF NOT EXISTS administracion NUMERIC(10,2) DEFAULT 0;\n" +
                "ALTER TABLE registros_semanales ADD COLUMN IF NOT EXISTS observaciones TEXT DEFAULT NULL;\n" +
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
        registrosEnSemana(registros).filter((r) => r.unidad === unidad)
    );
}

function unidadesRegistradas() {
    const map = new Map();
    registrosEnSemana(registros).forEach((r) => {
        if (!map.has(r.unidad)) map.set(r.unidad, []);
        map.get(r.unidad).push(r);
    });
    return [...map.keys()];
}

/* Todas las unidades únicas con información en la base de datos,
   sin importar la semana seleccionada */
function todasLasUnidades() {
    const map = new Map();
    registros.forEach((r) => {
        if (!map.has(r.unidad)) map.set(r.unidad, true);
    });
    return [...map.keys()];
}

/* Unidad recomendada para el reporte: la de menor número que tenga
   registros en la semana seleccionada; si ninguna los tiene, la primera */
function unidadRecomendada() {
    const todas = todasLasUnidades().sort((a, b) => num(a) - num(b));
    const conRegistros = todas.filter((u) => registrosDeUnidad(u).length);
    return (conRegistros.length ? conRegistros : todas)[0] ?? null;
}

function totalesUnidad(unidad) {
    const lista = registrosDeUnidad(unidad);
    const suma = (f) => lista.reduce((s, r) => s + f(r), 0);
    /* El depósito total se calcula con la lógica de arrastre:
       descuenta la administración pendiente acumulada de días PARADA */
    const resumen = resumenSemana(lista);
    return {
        dias: lista.length,
        produccion: suma((r) => r.produccion),
        combustible: suma((r) => r.combustible),
        gastoAdicional: suma((r) => (r.gastoAdicional ? r.gastoAdicional.monto : 0)),
        deposito: resumen.totalDeposito,
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
       en Parada el admin viene del campo dedicado */
    const enProduccion = estadoDiaSelect.value === "produccion";

    const produccion = enProduccion ? num($id("produccionTotal").value) : 0;
    const combustible = enProduccion ? num($id("combustible").value) : 0;

    /* En parada, la administración viene del campo "adminParada" */
    const administracion = enProduccion
        ? num($id("administracion").value)
        : num($id("adminParada").value);

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
    const sumaGastos = enProduccion
        ? leerGastosFormulario().reduce((s, g) => s + g.monto, 0)
        : 0;

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

/* Estado "Parada": oculta la grilla de producción y muestra
   el bloque alternativo (alerta + admin parada + observaciones) */
function aplicarEstadoDia() {
    const enProduccion = estadoDiaSelect.value === "produccion";

    /* Alterna visibilidad: producción vs parada */
    $id("produccionCampos").classList.toggle("hidden", !enProduccion);
    $id("paradaBlock").classList.toggle("hidden", enProduccion);

    /* Limpia y deshabilita los campos cuando no aplica */
    if (!enProduccion) {
        ["produccionTotal", "combustible", "administracion",
            "alimentacionLimpieza", "conductorPorcentaje"].forEach((idCampo) => {
            $id(idCampo).value = "";
            $id(idCampo).disabled = true;
        });
        tieneGastoSelect.value = "no";
        actualizarCamposGasto();
    } else {
        ["produccionTotal", "combustible", "administracion",
            "alimentacionLimpieza", "conductorPorcentaje"].forEach((idCampo) => {
            $id(idCampo).disabled = false;
        });
        /* Limpia solo la administración de parada al volver a producción;
           las observaciones escritas se conservan */
        $id("adminParada").value = "";
    }

    calcularEnVivo();
}

function calcularEnVivo() {
    const v = calcularValoresFormulario();

    $id("conductorMonto").value = nf.format(v.conductorMonto);
    $id("deposito").value = nf.format(v.deposito);
    $id("resumenProduccion").textContent = fmtMoneda(v.produccion);
    $id("resumenDeposito").textContent = fmtMoneda(v.deposito);

    actualizarAlertaGastos(v);
}

/* Alerta visual: si la suma de los gastos supera la Producción
   total del día, el depósito sería negativo */
function actualizarAlertaGastos(v) {
    const el = $id("gastoWarning");
    if (!el) return;

    const totalGastos = v.combustible + v.administracion + v.alimentacionLimpieza + v.conductorMonto + v.sumaGastos;
    const supera = v.enProduccion && v.produccion > 0 && totalGastos > v.produccion;

    el.classList.toggle("hidden", !supera);
}

fechaInput.addEventListener("change", () => {
    diaSemanaInput.value = nombreDia(fechaInput.value);
});

tieneGastoSelect.addEventListener("change", actualizarCamposGasto);

estadoDiaSelect.addEventListener("change", aplicarEstadoDia);

on("addGastoBtn", "click", () => agregarFilaGasto(true));

/* Delegación: los inputs de las filas se crean dinámicamente.
   Bloquea montos negativos en cada fila de gasto */
$id("gastosLista").addEventListener("input", (e) => {
    if (e.target.classList.contains("gasto-monto") && e.target.value !== "" && num(e.target.value) < 0) {
        e.target.value = "";
    }
    calcularEnVivo();
});

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

/* Recalcula en tiempo real mientras el usuario escribe y
   bloquea la entrada de montos negativos (añadido a min="0") */
["produccionTotal", "combustible", "administracion",
    "alimentacionLimpieza", "conductorPorcentaje", "adminParada"].forEach((idCampo) => {
        const input = $id(idCampo);
        input.addEventListener("input", () => {
            if (input.value !== "" && num(input.value) < 0) input.value = "";
            calcularEnVivo();
        });
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

    /* --- Validaciones de negocio --- */

    if (!$id("numeroUnidad").value.trim()) {
        mostrarModalAviso("Datos incompletos", "El número de unidad es obligatorio.");
        return;
    }

    /* Fecha obligatoria: no se admite guardar sin fecha */
    if (!fechaInput.value) {
        mostrarModalAviso("Falta la fecha", "La fecha es obligatoria para guardar el registro.");
        return;
    }

    /* Bloquea montos negativos (respaldo al min="0" y a la
       limpieza en vivo, por si se escribió un negativo a mano) */
    const negativos = [];
    [["produccionTotal", "Producción total"],
        ["combustible", "Combustible"],
        ["administracion", "Administración"],
        ["alimentacionLimpieza", "Alimentación + limpieza"],
        ["conductorPorcentaje", "Porcentaje del conductor"],
        ["adminParada", "Administración de la parada"],
    ].forEach(([idCampo, nombre]) => {
        if (num($id(idCampo).value) < 0) negativos.push(nombre);
    });
    gastos.forEach((g, i) => {
        if (g.monto < 0) negativos.push(`Gasto adicional #${i + 1}`);
    });
    if (negativos.length) {
        mostrarModalAviso("Montos negativos no permitidos", `Corrige los siguientes valores, no pueden ser negativos:\n\n• ${negativos.join("\n• ")}`);
        return;
    }

    /* Regla de PARADA: no se permite ingresar Producción total */
    if (estadoDiaSelect.value === "parada" && num($id("produccionTotal").value) > 0) {
        mostrarModalAviso("Regla de PARADA", "Un día en PARADA no genera producción.\n\nLa Producción total debe quedar en $0.00 para guardar un día parada.");
        return;
    }

    /* Depósito sin ingresos: no se guarda producción sin ingresos
       registrados (los días PARADA usan el flujo de parada) */
    if (v.enProduccion && v.produccion <= 0) {
        mostrarModalAviso("Producción requerida", "No puedes guardar un depósito sin ingresos registrados.\n\nDebes indicar la Producción total del día. Si la unidad estuvo parada, marca «Estado del día» = Parada.");
        return;
    }

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
        observaciones: $id("observaciones").value.trim(),
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
    $id("adminParada").value = "";
    $id("observaciones").value = "";
    $id("gastoWarning").classList.add("hidden");
    aplicarEstadoDia();
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
    renderSelectorSemana();
    renderUnidades();
    renderVistaUnidad();
    renderHistorial();
}

function renderUnidades() {
    const cont = $id("unitsList");
    const unidades = todasLasUnidades();

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
    const cont = $id("dailyBlocksContainer");
    const totalesEl = $id("weeklyTotals");
    const periodo = textoPeriodoSemana();

    if (!unidadSeleccionada || !registrosDeUnidad(unidadSeleccionada).length) {
        cont.innerHTML = `
            <div class="empty-state">
                ${unidadSeleccionada
                    ? `La unidad ${esc(unidadSeleccionada)} no tiene registros${periodo ? " en la semana seleccionada." : "."}`
                    : (periodo ? "Selecciona una unidad para visualizar su reporte de la semana." : "Selecciona una unidad para visualizar su reporte semanal.")}
            </div>`;
        totalesEl.style.display = "none";
        limpiarTotalesTabla();
        renderObservacionesSemana(null);
        pintarEncabezadoVista(unidadSeleccionada, periodo, null);
        return;
    }

    const calc = registrosDeUnidad(unidadSeleccionada);

    /* Resumen con lógica de arrastre de saldos (admin pendiente) */
    const resumen = resumenSemana(calc);

    /* Construir HTML de bloques diarios */
    cont.innerHTML = resumen.semana.map(d => construirBloqueDia(d)).join("");

    /* Totales semanales */
    totalesEl.style.display = "block";
    $id("tableTotalProduccion").textContent = fmtMoneda(resumen.totalProduccion);
    $id("tableTotalDescuentos").textContent = `-${fmtMoneda(resumen.totalDescuentos)}`;
    $id("tableTotalDeposito").textContent = fmtMoneda(resumen.totalDeposito);

    /* Observaciones consolidadas: solo al final del reporte */
    renderObservacionesSemana(resumen);

    /* Resumen semanal */
    pintarEncabezadoVista(
        unidadSeleccionada,
        periodo || `${fmtFecha(calc[0].fecha)} – ${fmtFecha(calc[calc.length - 1].fecha)}`,
        {
            dias: calc.length,
            produccion: resumen.totalProduccion,
            deposito: resumen.totalDeposito,
        }
    );
}

function pintarEncabezadoVista(unidad, periodo, totales) {
    $id("previewNumeroUnidad").textContent = unidad || "-";
    $id("reportHeaderDate").textContent = periodo || "Sin registros";
    $id("reportHeaderPeriodo").textContent = `Periodo: ${periodo || "--/--/---- - --/--/----"}`;

    $id("totalProduccionSemanal").textContent = totales ? fmtMoneda(totales.produccion) : "$0.00";
    $id("totalDepositoSemanal").textContent = totales ? fmtMoneda(totales.deposito) : "$0.00";
    $id("diasRegistrados").textContent = `${totales ? totales.dias : 0} / 7`;
}

/* Observaciones consolidadas: se muestran ÚNICAMENTE al final
   del reporte (debajo del resumen de días), nunca en cada bloque */
function renderObservacionesSemana(resumen) {
    const obsEl = $id("reporteObservaciones");
    const entradas = resumen && resumen.semana
        ? resumen.semana
            .filter((d) => d.registro && (d.registro.observaciones || "").trim())
            .map((d) => ({ dia: d.dia, fecha: d.fecha, texto: d.registro.observaciones.trim() }))
        : [];

    if (!entradas.length) {
        obsEl.style.display = "none";
        obsEl.innerHTML = "";
        return;
    }

    obsEl.style.display = "block";
    obsEl.innerHTML = `
        <h4 class="obs-title">Observaciones de la semana</h4>
        ${entradas.map((e) => `
            <div class="obs-item">
                <span class="obs-dia">${esc(e.dia)} ${esc(e.fecha)}</span>
                <span class="obs-texto">${esc(e.texto)}</span>
            </div>`).join("")}`;
}

function limpiarTotalesTabla() {
    ["tableTotalProduccion", "tableTotalDescuentos", "tableTotalDeposito"].forEach((idCampo) => {
        $id(idCampo).textContent = "$0.00";
    });
}

/* Cambiar de semana actualiza automáticamente el Reporte Semanal,
   la lista de unidades (Tabla Resumida) y las exportaciones */
on("semanaSelect", "change", (e) => {
    const inicio = e.target.value;
    if (!inicio) return;
    semanaSeleccionada = { inicio, fin: sumarDiasISO(inicio, 6) };
    renderTodo();
    document.querySelector(".preview-panel")?.scrollIntoView({ behavior: "smooth" });
});

/**
 * Construye el HTML de un bloque diario para el reporte detallado.
 * Muestra encabezado del día, detalle operativo con descuentos
 * con signo negativo, subtotales y depósito destacado.  El "Subtotal"
 * resultante ya incluye el Conductor y la Administración pendiente y
 * coincide con el DEPÓSITO.  Los días en PARADA solo muestran el
 * encabezado con su etiqueta.
 *
 * @param {Object} dia — Objeto enriquecido de construirSemanaCompleta()
 *   más lineaAdminPendiente (number|null) y
 *   lineaAdminPendienteDias (Array<string>|null)
 * @returns {string} HTML del bloque
 */
function construirBloqueDia(dia) {
    const sinRegistro = dia.estadoDia === "sin_registro";
    const esParada = dia.estadoDia === "parada";
    const r = dia.registro;

    const badgeClase = esParada ? "day-badge-parada" : (sinRegistro ? "day-badge-sin-registro" : "day-badge-produccion");
    const badgeTexto = esParada ? "PARADA" : (sinRegistro ? "Sin registro" : "PRODUCCIÓN");

    let contenidoDetalle = "";

    if (sinRegistro) {
        contenidoDetalle = `
            <div class="day-block-empty">
                Sin registros para este día.
            </div>`;
    } else if (esParada) {
        /* PARADA visual simplificada: solo el encabezado del día
           con la fecha y la etiqueta "PARADA". */
        contenidoDetalle = "";
    } else {
        /* Día con producción */
        const prod = num(r.produccion);
        const comb = num(r.combustible);
        const admin = num(r.administracion);
        const ali = num(r.alimentacionLimpieza);
        const condMonto = num(r.conductorMonto);
        const condPct = num(r.conductorPorcentaje || 18);
        const gasto = r.gastoAdicional ? num(r.gastoAdicional.monto) : 0;
        const conceptoGasto = r.gastoAdicional ? r.gastoAdicional.concepto : "";
        const adminPend = dia.lineaAdminPendiente || 0;

        /* Subtotal tras solo el combustible */
        const subCombustible = prod - comb;

        /* Subtotal resultante: Producción − Combustible − Administración
           − Alimentación/Limpieza − Gasto extra − Conductor − Admin pendiente.
           Tanto el Conductor como la Administración pendiente se descuentan
           directamente de este Subtotal, que cierra la cifra de DEPÓSITO. */
        const subResultante = depositoAjustado(dia);

        contenidoDetalle = `
            <div class="day-detail-grid">
                <div class="day-detail-row">
                    <span class="day-detail-label">Ruta</span>
                    <span class="day-detail-value">${esc(r.ruta || "-")}</span>
                </div>

                <div class="day-detail-divider"></div>

                <div class="day-detail-row day-detail-ingreso">
                    <span class="day-detail-label">Producción total</span>
                    <span class="day-detail-value">${fmtMoneda(prod)}</span>
                </div>

                <div class="day-detail-row">
                    <span class="day-detail-label">- Combustible</span>
                    <span class="day-detail-value">-${fmtMoneda(comb)}</span>
                </div>

                <div class="day-detail-row day-detail-subtotal">
                    <span class="day-detail-label">Subtotal</span>
                    <span class="day-detail-value">${fmtMoneda(subCombustible)}</span>
                </div>

                <div class="day-detail-row">
                    <span class="day-detail-label">- Administración</span>
                    <span class="day-detail-value">-${fmtMoneda(admin)}</span>
                </div>

                <div class="day-detail-row">
                    <span class="day-detail-label">- Alimentación + limpieza</span>
                    <span class="day-detail-value">-${fmtMoneda(ali)}</span>
                </div>

                ${gasto > 0 ? `
                <div class="day-detail-row">
                    <span class="day-detail-label">- ${esc(conceptoGasto || "Gasto adicional")}</span>
                    <span class="day-detail-value">-${fmtMoneda(gasto)}</span>
                </div>
                ` : ""}

                <div class="day-detail-row">
                    <span class="day-detail-label">- Conductor (${nf.format(condPct)}%)</span>
                    <span class="day-detail-value">-${fmtMoneda(condMonto)}</span>
                </div>

                ${adminPend > 0 ? `
                <div class="day-detail-row day-detail-pendiente">
                    <span class="day-detail-label">- Administración pendiente (${_textoOrigenPendiente(dia.lineaAdminPendienteDias)})</span>
                    <span class="day-detail-value">-${fmtMoneda(adminPend)}</span>
                </div>
                ` : ""}

                <div class="day-detail-row day-detail-subtotal">
                    <span class="day-detail-label">Subtotal</span>
                    <span class="day-detail-value">${fmtMoneda(subResultante)}</span>
                </div>

                <div class="day-detail-row day-detail-deposito">
                    <span class="day-detail-label">DEPÓSITO</span>
                    <span class="day-detail-value">${fmtMoneda(subResultante)}</span>
                </div>
            </div>`;
    }

    return `
        <div class="day-block ${sinRegistro ? "day-block-empty-state" : ""}" style="page-break-inside: avoid;">
            <div class="day-block-header">
                <div class="day-block-title-row">
                    <span class="day-block-name">${esc(dia.dia)}</span>
                    <span class="day-block-date">${dia.fecha}</span>
                </div>
                <span class="day-block-badge ${badgeClase}">${badgeTexto}</span>
            </div>
            ${contenidoDetalle ? `<div class="day-block-body">${contenidoDetalle}</div>` : ""}
        </div>`;
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
            <li class="history-item" data-unidad="${esc(r.unidad)}" data-fecha="${r.fecha}" tabindex="0" role="button" aria-label="Ver reporte de la Unidad ${esc(r.unidad)} de la semana del ${fmtFecha(r.fecha)}">
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

on("historyList", "keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".history-item");
    if (!item || e.target.closest(".btn-delete")) return;
    e.preventDefault();
    navegarDesdeHistorial(item.dataset.unidad, item.dataset.fecha);
});

on("historyList", "click", async (e) => {
    const btn = e.target.closest(".btn-delete");
    if (btn) {
        await borrarRegistroHistorial(btn.dataset.id);
        return;
    }

    const item = e.target.closest(".history-item");
    if (item) navegarDesdeHistorial(item.dataset.unidad, item.dataset.fecha);
});

async function borrarRegistroHistorial(id) {
    if (!clienteListo()) {
        mostrarModalAviso("Sin conexión", "La conexión con Supabase no está disponible.");
        return;
    }
    if (!confirm("¿Eliminar este registro?")) return;

    const error = await eliminarRegistro(id);
    if (error) {
        console.error("Error al eliminar en Supabase:", error);
        mostrarModalAviso("Error al eliminar", "No se pudo eliminar el registro: " + error.message);
        return;
    }

    await refrescarInterfaz();
}

/* Al hacer clic en un registro del historial: selecciona la unidad,
   ajusta la semana a la del registro y muestra el reporte completo */
function navegarDesdeHistorial(unidad, fecha) {
    if (!unidad || !fecha) return;
    unidadSeleccionada = unidad;
    semanaSeleccionada = rangoSemanaDe(fecha);
    renderTodo();
    const panel = document.querySelector(".preview-panel");
    if (panel) panel.scrollIntoView({ behavior: "smooth" });
}

/* Garantiza que exista una unidad con datos antes de
   imprimir o exportar; si no hay selección, toma
   automáticamente la primera unidad disponible. */
function asegurarUnidadParaReporte() {
    if (!registros.length) {
        mostrarModalAviso("Sin registros", "Aún no hay registros para mostrar.\n\nGuarda un registro desde el formulario.");
        return false;
    }

    if (!unidadSeleccionada || !registrosDeUnidad(unidadSeleccionada).length) {
        unidadSeleccionada = unidadRecomendada();
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
   LÓGICA DE ARRASTRE DE SALDOS — Administración pendiente
   ===================================================== */

/**
 * Recorre la semana completa (Lunes → Domingo) y marca en cada día
 * cuánta "Administración pendiente" acumulada se debe descontar.
 *
 * Reglas generales (Lunes → Viernes):
 *  - Un día en "PARADA" acumula su administración como pendiente.
 *  - El primer día con actividad que le siga recibe la línea
 *    "- Administración pendiente (…)" — con el nombre de los días en
 *    PARADA que generaron el saldo, ej. "(lunes)" — y el acumulado
 *    vuelve a cero.
 *
 * Regla del fin de semana (último día con producción de la misma semana):
 *  - Si el DOMINGO (o el SÁBADO) estuvo en PARADA y el DOMINGO no fue de
 *    producción, su administración NO queda flotante: se descuenta dentro
 *    de la misma semana, en el último día previo que sí tuvo producción
 *    (Sábado, Viernes, etc.) → "- Administración pendiente (domingo)",
 *    "- Administración pendiente (sábado y domingo)", "- Administración
 *    pendiente (sábado)".
 *  - Si el DOMINGO sí tuvo producción, la acumulación natural hacia
 *    adelante absorbe lo pendiente del Sábado sin redirigir nada.
 *  - Si en la misma semana no hubo días previos con producción (semana
 *    completa en PARADA), el saldo se acumula y se descuenta en la primera
 *    actividad de la semana siguiente.
 *
 * @param {Array} semana — Resultado de construirSemanaCompleta()
 * @returns {Array} Semana con las propiedades extra:
 *   lineaAdminPendiente (number|null) y
 *   lineaAdminPendienteDias (Array<string>|null, nombres de los días de origen)
 */
function enriquecerSemana(semana) {
    /* Redirecciones del fin de semana: fechaISO del día destino (con
       producción) → [{ monto, dias }]. */
    const redirecciones = new Map();
    /* Días PARADA del fin de semana cuya administración se descuenta
       hacia atrás y, por tanto, no deben acumularse hacia adelante. */
    const fuentesRedirigidas = new Set();

    function agregarRedireccion(destino, monto, dias, incluirCero = false) {
        if (!destino || (monto <= 0 && !incluirCero)) return;
        if (!redirecciones.has(destino.fechaISO)) redirecciones.set(destino.fechaISO, []);
        redirecciones.get(destino.fechaISO).push({ monto, dias });
    }

    /* Último día con PRODUCCIÓN dentro de la MISMA semana: retrocede desde
       el Sábado y se detiene al llegar al Domingo de la semana previa (fin
       del rango de la semana en curso). Devuelve null si no hubo ninguno. */
    function ultimoProduccionSemana(semana, iSabado) {
        for (let j = iSabado; j >= 0; j--) {
            if (semana[j].dia === "Domingo") return null;
            if (semana[j].estadoDia === "produccion") return semana[j];
        }
        return null;
    }

    /* Regla del fin de semana (misma semana en curso):
       CASO A → Domingo PARADA con Sábado PRODUCCIÓN: la administración de la
           parada del domingo se descuenta INMEDIATAMENTE en el Sábado.
       CASO B → Sábado y Domingo PARADA consecutivos: lo acumulado de ambos se
           descuenta en el último día con PRODUCCIÓN de la semana (Viernes).
       REGLA GENERAL → Toda administración por PARADA del fin de semana se
           descuenta del último día con PRODUCCIÓN de la misma semana (Sábado,
           Viernes, etc.); nunca queda flotante para la semana siguiente. */
    for (let i = 0; i + 1 < semana.length; i++) {
        const sabado = semana[i];
        const domingo = semana[i + 1];
        if (sabado.dia !== "Sábado" || domingo.dia !== "Domingo") continue;

        const sabParada = sabado.estadoDia === "parada" && !!sabado.registro;
        const domParada = domingo.estadoDia === "parada" && !!domingo.registro;
        const sabProduccion = sabado.estadoDia === "produccion";
        const domProduccion = domingo.estadoDia === "produccion";

        /* Si el Domingo sí produjo, la acumulación natural hacia adelante
           ya descuenta cualquier saldo del Sábado; no se redirige nada. */
        if (domProduccion) continue;

        const sabAdmin = sabParada ? num(sabado.registro.administracion) : 0;
        const domAdmin = domParada ? num(domingo.registro.administracion) : 0;

        /* CASO A: deducción inmediata en el Sábado */
        if (sabProduccion && domParada) {
            agregarRedireccion(sabado, domAdmin, ["Domingo"], true);
            fuentesRedirigidas.add(domingo.fechaISO);
            continue;
        }

        /* CASO B / REGLA GENERAL: solo Sábado y/o Domingo PARADA */
        if (!sabParada && !domParada) continue;
        const destino = ultimoProduccionSemana(semana, i);

        /* Sin producción previa dentro de la semana (semana completa en
           PARADA): el saldo se acumula y fluye a la semana siguiente. */
        if (!destino) continue;

        if (sabParada) {
            agregarRedireccion(destino, sabAdmin, ["Sábado"], true);
            fuentesRedirigidas.add(sabado.fechaISO);
        }
        if (domParada) {
            agregarRedireccion(destino, domAdmin, ["Domingo"], true);
            fuentesRedirigidas.add(domingo.fechaISO);
        }
    }

    let adminPendiente = 0;
    let adminPendienteDias = [];

    const enriquecidos = semana.map(d => {
        const esParada = d.estadoDia === "parada";
        const sinRegistro = d.estadoDia === "sin_registro";
        const r = d.registro;

        let lineaAdminPendiente = null;
        let lineaAdminPendienteDias = null;

        /* Día con actividad (producción o parada): descuenta lo acumulado */
        if (!sinRegistro && adminPendiente > 0) {
            lineaAdminPendiente = adminPendiente;
            lineaAdminPendienteDias = adminPendienteDias.slice();
        }

        /* Un día PARADA acumula su administración como pendiente.
           Excepción: los días del fin de semana redirigidos hacia atrás
           no acumulan, porque su administración ya se descuenta en un
           día previo con producción. */
        if (esParada && r && !fuentesRedirigidas.has(d.fechaISO)) {
            const adminDelDia = num(r.administracion);
            if (adminDelDia > 0) {
                adminPendiente += adminDelDia;
                adminPendienteDias.push(d.dia);
            }
        }

        /* Un día con producción aplica el pendiente y resetea el acumulado */
        if (!sinRegistro && !esParada && r && lineaAdminPendiente > 0) {
            adminPendiente = 0;
            adminPendienteDias = [];
        }

        return { ...d, lineaAdminPendiente, lineaAdminPendienteDias };
    });

    /* Aplica las redirecciones del fin de semana sobre el día destino */
    for (const d of enriquecidos) {
        const lista = redirecciones.get(d.fechaISO);
        if (!lista) continue;
        for (const item of lista) {
            d.lineaAdminPendiente = (d.lineaAdminPendiente || 0) + item.monto;
            d.lineaAdminPendienteDias = (d.lineaAdminPendienteDias || []).concat(item.dias);
        }
    }

    return enriquecidos;
}

/* Texto de origen de la administración pendiente según los días
   en PARADA que la acumularon, ej. "(lunes)", "(lunes y martes)"
   o "(lunes, martes y miércoles)". */
function _textoOrigenPendiente(nombres) {
    if (!nombres || !nombres.length) return "día anterior";
    const dias = nombres.map(n => n.toLowerCase());
    if (dias.length === 1) return dias[0];
    if (dias.length === 2) return dias[0] + " y " + dias[1];
    return dias.slice(0, -1).join(", ") + " y " + dias[dias.length - 1];
}

/**
 * Depósito ajustado de un día: al valor guardado en la BD se le resta
 * la administración pendiente aplicada ese día.
 *
 * DEPÓSITO = Producción − (Combustible + Administración + Alimentación
 *            + Conductor + Gastos extra + Administración pendiente)
 *
 * @param {Object} dia — Día enriquecido (con lineaAdminPendiente)
 * @returns {number} Depósito con el descuento pendiente aplicado
 */
function depositoAjustado(dia) {
    const r = dia.registro;
    if (!r) return 0;
    return num(r.deposito) - (dia.lineaAdminPendiente || 0);
}

/**
 * Resumen semanal con la lógica de arrastre ya aplicada.
 * Solo los días con producción aportan montos; los días PARADA
 * acumulan su administración como pendiente.
 *
 * @param {Array} regs — registrosDeUnidad(unidad), ordenados
 * @returns {{ semana: Array, totalProduccion: number,
 *             totalDescuentos: number, totalDeposito: number }}
 */
function resumenSemana(regs) {
    if (!regs.length) {
        return { semana: [], totalProduccion: 0, totalDescuentos: 0, totalDeposito: 0 };
    }

    const semana = enriquecerSemana(construirSemanaCompleta(regs));

    let totalProduccion = 0;
    let totalDescuentos = 0;
    let totalDeposito = 0;

    semana.forEach(d => {
        const r = d.registro;
        if (!r || d.estadoDia === "parada") return;

        const adminPend = d.lineaAdminPendiente || 0;

        totalProduccion += num(r.produccion);
        totalDescuentos += r.combustible + r.administracion + r.alimentacionLimpieza
            + r.conductorMonto
            + (r.gastoAdicional ? num(r.gastoAdicional.monto) : 0)
            + adminPend;
        totalDeposito += num(r.deposito) - adminPend;
    });

    return { semana, totalProduccion, totalDescuentos, totalDeposito };
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

    /* Resumen con lógica de arrastre de saldos (admin pendiente) */
    const resumen = resumenSemana(registros);
    const semanaEnriquecida = resumen.semana;

    /* ---- Título ---- */
    const fechasPdf = registros.map(r => r.fecha).filter(Boolean).sort();
    const periodoPdf = textoPeriodoSemana()
        || (fechasPdf.length ? `${fmtFecha(fechasPdf[0])} - ${fmtFecha(fechasPdf[fechasPdf.length - 1])}` : "");
    const periodoEncabezado = `Periodo: ${periodoPdf}`;
    let y = M.t;
    doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(0, 0, 0);
    doc.text("REPORTE SEMANAL", M.l, y);
    y += 8;
    doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(0, 0, 0);
    doc.text("Unidad " + unidadId, M.l, y);
    y += 6;
    doc.setFontSize(11).setTextColor(40, 40, 40);
    doc.text(periodoEncabezado, M.l, y);
    y += 6;

    doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
    doc.line(M.l, y, pagAncho - M.r, y);
    y += 10;

    const LH = 5;
    const FS = 9;

    /* ---- Funciones auxiliares ---- */
    function drawText(text, x, yPos, opts = {}) {
        doc.setFont("helvetica", opts.bold ? "bold" : "normal")
            .setFontSize(opts.size || FS)
            .setTextColor(opts.color || 0, opts.color || 0, opts.color || 0);
        doc.text(text, x, yPos, { align: opts.align || "left" });
    }

    function drawLine(x1, yPos, x2) {
        doc.setDrawColor(180, 180, 180).setLineWidth(0.2);
        doc.line(x1, yPos, x2, yPos);
    }

    function drawBoldLine(x1, yPos, x2) {
        doc.setDrawColor(0, 0, 0).setLineWidth(0.4);
        doc.line(x1, yPos, x2, yPos);
    }

    /* ---- Bloques diarios ---- */
    semanaEnriquecida.forEach(dia => {
        const sinRegistro = dia.estadoDia === "sin_registro";
        const esParada = dia.estadoDia === "parada";
        const r = dia.registro;

        /* Estimar alto del bloque */
        let lineasNecesarias = 3; /* Header + separator mínimo */
        if (sinRegistro) {
            lineasNecesarias = 3;
        } else if (esParada) {
            lineasNecesarias = 3;
        } else {
            lineasNecesarias = 13; /* Producción + desglose con subtotales + depósito */
            if (r && r.gastoAdicional && num(r.gastoAdicional.monto) > 0) lineasNecesarias++;
            if (dia.lineaAdminPendiente > 0) lineasNecesarias++;
        }

        const altoEstimado = lineasNecesarias * (LH + 1.5) + 12;

        if (y + altoEstimado > maxY()) {
            doc.addPage();
            y = M.t;
        }

        /* Fondo del encabezado del día (tono neutro) */
        doc.setFillColor(245, 245, 245);
        doc.rect(M.l, y, utilW, 8, "F");
        doc.setDrawColor(200, 200, 200).setLineWidth(0.3);
        doc.rect(M.l, y, utilW, 8);

        drawText(dia.dia + " — " + dia.fecha, M.l + 3, y + 5.5, { bold: true, size: 10 });

        /* Badge de estado (PRODUCCIÓN verde, PARADA rojo, SIN REGISTRO gris) */
        let badgeColor = [150, 150, 150];
        let badgeText;
        if (sinRegistro) {
            badgeText = "SIN REGISTRO";
        } else if (esParada) {
            badgeText = "PARADA";
            badgeColor = [220, 38, 38];
        } else {
            badgeText = "PRODUCCIÓN";
            badgeColor = [7, 136, 63];
        }

        const badgeW = doc.getTextWidth(badgeText) * 1.1 + 6;
        doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
        doc.roundedRect(M.l + utilW - badgeW - 3, y + 1.5, badgeW, 5, 2, 2, "F");
        doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(255, 255, 255);
        doc.text(badgeText, M.l + utilW - badgeW / 2 - 3, y + 5.2, { align: "center" });

        y += 10;

        if (sinRegistro) {
            drawText("Sin registros para este día.", M.l + 3, y + 3, { color: 60 });
            y += 8;
            drawLine(M.l, y, M.l + utilW);
            y += 6;
            return;
        }

        if (esParada) {
            drawLine(M.l, y, M.l + utilW);
            y += 6;
            return;
        }

        /* Día con producción */
        const prod = num(r.produccion);
        const comb = num(r.combustible);
        const admin = num(r.administracion);
        const ali = num(r.alimentacionLimpieza);
        const condMonto = num(r.conductorMonto);
        const condPct = num(r.conductorPorcentaje || 18);
        const gasto = r.gastoAdicional ? num(r.gastoAdicional.monto) : 0;
        const conceptoGasto = r.gastoAdicional ? r.gastoAdicional.concepto : "";
        const adminPend = dia.lineaAdminPendiente || 0;

        /* Subtotal tras solo el combustible */
        const subCombustible = prod - comb;

        /* Subtotal resultante: Producción − Combustible − Administración
           − Alimentación/Limpieza − Gasto extra − Conductor − Admin pendiente.
           Conductor y Administración pendiente se descuentan directamente
           de este Subtotal, que cierra la cifra de DEPÓSITO. */
        const subResultante = depositoAjustado(dia);

        drawText("Ruta: " + (r.ruta || "-"), M.l + 3, y + 3, { bold: true, size: 9.5 });
        y += 7;
        drawBoldLine(M.l, y, M.l + utilW);
        y += 5;

        /* Producción total */
        drawText("Producción total", M.l + 3, y + 3, { bold: true });
        drawText(fmtMoneda(prod), M.l + utilW - 3, y + 3, { align: "right", bold: true });
        y += 6;

        /* - Combustible → Subtotal */
        drawText("- Combustible", M.l + 3, y + 3, { size: FS });
        drawText("-" + fmtMoneda(comb), M.l + utilW - 3, y + 3, { align: "right", color: 0, size: FS });
        y += 5;
        drawText("Subtotal", M.l + 3, y + 3, { bold: true, size: FS });
        drawText(fmtMoneda(subCombustible), M.l + utilW - 3, y + 3, { align: "right", bold: true });
        y += 6;

        /* - Administración */
        drawText("- Administración", M.l + 3, y + 3, { size: FS });
        drawText("-" + fmtMoneda(admin), M.l + utilW - 3, y + 3, { align: "right", color: 0, size: FS });
        y += 5;

        /* - Alimentación + limpieza */
        drawText("- Alimentación + limpieza", M.l + 3, y + 3, { size: FS });
        drawText("-" + fmtMoneda(ali), M.l + utilW - 3, y + 3, { align: "right", color: 0, size: FS });
        y += 5;

        /* - Gasto adicional (si aplica) */
        if (gasto > 0) {
            drawText("- " + (conceptoGasto || "Gasto adicional"), M.l + 3, y + 3, { size: FS });
            drawText("-" + fmtMoneda(gasto), M.l + utilW - 3, y + 3, { align: "right", color: 0, size: FS });
            y += 5;
        }

        /* - Conductor (%) */
        drawText("- Conductor (" + nf.format(condPct) + "%)", M.l + 3, y + 3, { size: FS });
        drawText("-" + fmtMoneda(condMonto), M.l + utilW - 3, y + 3, { align: "right", color: 0, size: FS });
        y += 5;

        /* - Administración pendiente */
        if (adminPend > 0) {
            drawText("- Administración pendiente (" + _textoOrigenPendiente(dia.lineaAdminPendienteDias) + ")", M.l + 3, y + 3, { size: FS });
            drawText("-" + fmtMoneda(adminPend), M.l + utilW - 3, y + 3, { align: "right", color: 0, size: FS });
            y += 5;
        }

        /* Subtotal resultante (incluye Conductor y Administración pendiente) */
        drawText("Subtotal", M.l + 3, y + 3, { bold: true, size: FS });
        drawText(fmtMoneda(subResultante), M.l + utilW - 3, y + 3, { align: "right", bold: true });
        y += 6;

        /* DEPÓSITO (cifra final con línea superior) */
        doc.setDrawColor(0, 0, 0).setLineWidth(0.6);
        doc.line(M.l, y, M.l + utilW, y);
        y += 5;

        doc.setFillColor(245, 245, 245);
        doc.rect(M.l, y - 4, utilW, 8, "F");
        drawText("DEPÓSITO", M.l + 3, y + 2, { bold: true, size: 12 });
        drawText(fmtMoneda(subResultante), M.l + utilW - 3, y + 2, { align: "right", bold: true, size: 12, color: 0 });
        y += 8;

        drawLine(M.l, y, M.l + utilW);
        y += 8;
    });

    /* ---- Total depositado ---- */
    if (y + 14 > maxY()) {
        doc.addPage();
        y = M.t;
    }

    const totalDep = resumen.totalDeposito;

    doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
    doc.line(M.l, y, M.l + utilW, y);
    y += 10;

    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0, 0, 0);
    doc.text(
        "Total depositado: " + fmtMoneda(totalDep),
        pagAncho - M.r, y, { align: "right" }
    );
    y += 12;

    /* ---- Observaciones de la semana — al final del reporte ---- */
    const observaciones = semanaEnriquecida
        .filter((d) => d.registro && (d.registro.observaciones || "").trim())
        .map((d) => ({ dia: d.dia, fecha: d.fecha, texto: d.registro.observaciones.trim() }));

    if (observaciones.length) {
        if (y + 12 > maxY()) {
            doc.addPage();
            y = M.t;
        }

        doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 0, 0);
        doc.text("Observaciones de la semana", M.l, y);
        y += 2;
        drawLine(M.l, y, M.l + utilW);
        y += 6;

        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(40, 40, 40);
        observaciones.forEach((o) => {
            const lineas = doc.splitTextToSize(o.dia + " " + o.fecha + ": " + o.texto, utilW);
            lineas.forEach((ln) => {
                if (y + 5 > maxY()) {
                    doc.addPage();
                    y = M.t;
                }
                doc.text(ln, M.l, y);
                y += 5;
            });
        });
        y += 6;
    }

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
 * Estructura el desglose semanal de cada unidad con registros en el
 * periodo seleccionado. Reutilizado por el PDF y la impresión de la
 * "Tabla Resumida" para mantener un único origen de datos.
 *
 * @returns {Array} [{ unidad, dias: [{ dia, fecha, ruta, estado, deposito }], total }]
 */
function unidadesResumenPeriodo() {
    return unidadesRegistradas()
        .sort((a, b) => num(a) - num(b))
        .map((u) => {
            const r = resumenSemana(registrosDeUnidad(u));
            return {
                unidad: u,
                dias: r.semana.map((d) => ({
                    dia: d.dia,
                    fecha: d.fecha,
                    ruta: d.registro ? (d.registro.ruta || "-") : "—",
                    estado: d.estadoDia,
                    deposito: d.registro ? depositoAjustado(d) : 0,
                })),
                total: r.totalDeposito,
            };
        });
}

/* Rango del periodo para la Tabla Resumida: "DD/MM/AAAA hasta DD/MM/AAAA" */
function textoRangoPeriodo() {
    if (semanaSeleccionada) {
        return `${fmtFecha(semanaSeleccionada.inicio)} hasta ${fmtFecha(semanaSeleccionada.fin)}`;
    }
    const fechas = registros.map((r) => r.fecha).filter(Boolean).sort();
    if (!fechas.length) return "";
    return `${fmtFecha(fechas[0])} hasta ${fmtFecha(fechas[fechas.length - 1])}`;
}

/**
 * Genera y descarga el PDF de la Tabla Resumida (todas las unidades
 * con registros en el periodo).
 *
 * Estructura:
 *  1. Encabezado "Producción de las X unidades" + rango de fechas.
 *  2. Una tabla independiente por unidad (Día | Fecha | Ruta | Depósito),
 *     Lunes → Domingo, con "PARADA" si el día tuvo parada y "—" si no
 *     hay registro; al pie, "Total depositado: $XX.XX" a la derecha.
 *  3. Mini tabla consolidada (Unidad | Total depositado) + fila TOTAL.
 *
 * @param {Array}  datosUnidades — Salida de unidadesResumenPeriodo()
 * @param {string} rangoFechas   — "DD/MM/AAAA hasta DD/MM/AAAA"
 */
function generarPDFTablaResumida(datosUnidades, rangoFechas) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        mostrarModalAviso(
            "Librería no disponible",
            "La librería jsPDF no se cargó.\n\nVerifica tu conexión a internet y recarga la página."
        );
        return;
    }
    const { jsPDF } = window.jspdf;

    const datos = (datosUnidades || [])
        .filter((u) => u.dias && u.dias.some((d) => d.estado !== "sin_registro"));

    if (!datos.length) {
        mostrarModalAviso("Sin datos", "No hay unidades con registros en el periodo para generar la tabla resumida.");
        return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pagAncho = doc.internal.pageSize.getWidth();
    const pagAlto  = doc.internal.pageSize.getHeight();
    const M = { l: 18, r: 18, t: 22, b: 18 };
    const utilW = pagAncho - M.l - M.r;
    const maxY  = () => pagAlto - M.b;

    /* ---- 1. Encabezado general ---- */
    let y = M.t;
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(0, 0, 0);
    doc.text("Producción de las " + datos.length + " unidades", M.l, y);
    y += 7;

    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(40, 40, 40);
    doc.text(rangoFechas, M.l, y);
    y += 10;

    doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
    doc.line(M.l, y, pagAncho - M.r, y);
    y += 8;

    /* ---- Columnas: Día | Fecha | Ruta | Depósito ---- */
    const colPct = [0.16, 0.20, 0.40, 0.24];
    const colW   = colPct.map((p) => utilW * p);
    const colX   = colW.map((_, i) => M.l + colW.slice(0, i).reduce((a, b) => a + b, 0));

    const PADX = 3;
    const FH   = 5;   /* alto de fila de datos */
    const FHS  = 7;   /* alto de cabecera */

    function dibujarFila(y0, celdas, opts = {}) {
        const alto = opts.alto || FH;
        celdas.forEach((txt, i) => {
            doc.setDrawColor(0, 0, 0).setLineWidth(0.15);
            if (opts.relleno) {
                doc.setFillColor(opts.relleno[0], opts.relleno[1], opts.relleno[2]);
                doc.rect(colX[i], y0, colW[i], alto, "F");
            }
            doc.rect(colX[i], y0, colW[i], alto);
            doc.setFont("helvetica", opts.bold ? "bold" : "normal")
                .setFontSize(9).setTextColor(0, 0, 0);
            const al = i === 3 ? "right" : "left";
            doc.text(
                txt,
                al === "right" ? colX[i] + colW[i] - PADX : colX[i] + PADX,
                y0 + alto / 2 + 1.1,
                { align: al }
            );
        });
    }

    /* ---- 2. Tabla independiente por unidad ---- */
    const altoBloque = 6 + FHS + 7 * FH + 10 + 12;   /* título + cabecera + filas + margen total + separación */

    datos.forEach((u) => {
        if (y + altoBloque > maxY()) {
            doc.addPage();
            y = M.t;
        }

        doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 0, 0);
        doc.text("UNIDAD " + u.unidad, M.l, y);
        y += 6;

        dibujarFila(y, ["Día", "Fecha", "Ruta", "Depósito"], { bold: true, alto: FHS, relleno: [239, 239, 239] });
        y += FHS;

        u.dias.forEach((d) => {
            const celdaDeposito =
                d.estado === "sin_registro" ? "—"
                : d.estado === "parada"     ? "PARADA"
                : fmtMoneda(d.deposito);
            dibujarFila(y, [d.dia, d.fecha, d.ruta || "—", celdaDeposito]);
            y += FH;
        });

        /* Total depositado del periodo de la unidad, alineado a la derecha.
           margen superior para separarlo del borde inferior de la tabla */
        y += 10;

        doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(0, 0, 0);
        /* Etiqueta bajo la columna Ruta; el valor se alinea a la derecha
           con la columna Depósito, dentro del margen de la hoja */
        doc.text("Total depositado:", colX[2] + PADX, y);
        doc.text(fmtMoneda(u.total), colX[3] + colW[3] - PADX, y, { align: "right" });

        /* Separación inferior extra antes del siguiente bloque de unidad */
        y += 12;
    });

    /* ---- 3. Mini tabla de resumen consolidado (al final) ---- */
    if (y + 48 > maxY()) {
        doc.addPage();
        y = M.t;
    }

    y += 4;
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0, 0, 0);
    doc.text("Producción de las " + datos.length + " unidades", M.l, y);
    y += 6;

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(40, 40, 40);
    doc.text(rangoFechas, M.l, y);
    y += 7;

    const miniW   = utilW * 0.55;
    const miniX   = pagAncho - M.r - miniW;
    const miniCol = [0.5, 0.5].map((p) => miniW * p);
    const miniX0  = [miniX, miniX + miniCol[0]];

    function dibujarMiniFila(y0, izq, der, opts = {}) {
        const alto = opts.alto || 6.5;
        doc.setDrawColor(0, 0, 0).setLineWidth(0.15);
        doc.rect(miniX0[0], y0, miniCol[0], alto);
        doc.rect(miniX0[1], y0, miniCol[1], alto);
        doc.setFont("helvetica", opts.bold ? "bold" : "normal")
            .setFontSize(9).setTextColor(0, 0, 0);
        doc.text(izq, miniX0[0] + PADX, y0 + alto / 2 + 1.1);
        doc.text(der, miniX0[1] + miniCol[1] - PADX, y0 + alto / 2 + 1.1, { align: "right" });
    }

    dibujarMiniFila(y, "Unidad", "Total depositado", { bold: true, alto: 7 });
    y += 7;

    const depGlobal = datos.reduce((s, d) => s + d.total, 0);
    datos.forEach((d) => {
        dibujarMiniFila(y, "Unidad " + d.unidad, fmtMoneda(d.total));
        y += 6.5;
    });

    y += 1;
    dibujarMiniFila(y, "TOTAL", fmtMoneda(depGlobal), { bold: true, alto: 7 });
    y += 7;

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

    /* Resumen con lógica de arrastre de saldos (admin pendiente) */
    const resumen = resumenSemana(regs);
    const semanaEnriquecida = resumen.semana;

    /* Construir bloques HTML para impresión */
    let bloquesHTML = "";
    semanaEnriquecida.forEach(d => {
        const sinRegistro = d.estadoDia === "sin_registro";
        const esParada = d.estadoDia === "parada";
        const r = d.registro;

        const badgeTxt = esParada ? "PARADA" : (sinRegistro ? "Sin registro" : "PRODUCCIÓN");
        const badgeCls = esParada ? "print-badge-parada" : (sinRegistro ? "print-badge-sin" : "print-badge-prod");

        let detalle = "";
        if (sinRegistro) {
            detalle = '<div class="print-day-empty">Sin registros para este día.</div>';
        } else if (esParada) {
            detalle = "";
        } else {
            const prod = num(r.produccion);
            const comb = num(r.combustible);
            const admin = num(r.administracion);
            const ali = num(r.alimentacionLimpieza);
            const condMonto = num(r.conductorMonto);
            const condPct = num(r.conductorPorcentaje || 18);
            const gasto = r.gastoAdicional ? num(r.gastoAdicional.monto) : 0;
            const conceptoGasto = r.gastoAdicional ? r.gastoAdicional.concepto : "";
            const adminPend = d.lineaAdminPendiente || 0;
            const subCombustible = prod - comb;
            const subResultante = depositoAjustado(d);

            detalle = '<div class="print-day-detail">' +
                '<div class="print-row print-row-ruta"><span>Ruta</span><span>' + esc(r.ruta || "-") + '</span></div>' +
                '<div class="print-sep"></div>' +
                '<div class="print-row print-row-ingreso"><span>Producción total</span><span>' + fmtMoneda(prod) + '</span></div>' +
                '<div class="print-row"><span>- Combustible</span><span>-' + fmtMoneda(comb) + '</span></div>' +
                '<div class="print-row print-row-sub"><span>Subtotal</span><span>' + fmtMoneda(subCombustible) + '</span></div>' +
                '<div class="print-row"><span>- Administración</span><span>-' + fmtMoneda(admin) + '</span></div>' +
                '<div class="print-row"><span>- Alimentación + limpieza</span><span>-' + fmtMoneda(ali) + '</span></div>' +
                (gasto > 0 ? '<div class="print-row"><span>- ' + esc(conceptoGasto || "Gasto adicional") + '</span><span>-' + fmtMoneda(gasto) + '</span></div>' : '') +
                '<div class="print-row"><span>- Conductor (' + nf.format(condPct) + '%)</span><span>-' + fmtMoneda(condMonto) + '</span></div>' +
                (adminPend > 0 ? '<div class="print-row print-row-pend"><span>- Administración pendiente (' + _textoOrigenPendiente(d.lineaAdminPendienteDias) + ')</span><span>-' + fmtMoneda(adminPend) + '</span></div>' : '') +
                '<div class="print-row print-row-sub"><span>Subtotal</span><span class="print-dep">' + fmtMoneda(subResultante) + '</span></div>' +
                '<div class="print-row print-row-dep"><span>DEPÓSITO</span><span class="print-dep">' + fmtMoneda(subResultante) + '</span></div>' +
                '</div>';
        }

        bloquesHTML +=
            '<div class="print-day-block">' +
                '<div class="print-day-header">' +
                    '<div class="print-day-title"><strong>' + esc(d.dia) + '</strong> — ' + d.fecha + '</div>' +
                    '<span class="print-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
                '</div>' +
                (detalle ? '<div class="print-day-body">' + detalle + '</div>' : '') +
            '</div>';
    });

    /* Totales semanales (ajustados con admin pendiente) */
    const totalProd = resumen.totalProduccion;
    const totalDep = resumen.totalDeposito;

    /* Desglose de todas las unidades con registros en el periodo */
    const resumenUnidades = unidadesResumenPeriodo();
    const depGlobal = resumenUnidades.reduce((s, d) => s + d.total, 0);
    const rangoFechas = textoPeriodoSemana();
    const rangoResumen = textoRangoPeriodo();

    /* Tablas individuales por unidad (Día | Fecha | Ruta | Depósito) */
    let tablasUnidadesHTML = "";
    resumenUnidades.forEach(u => {
        let filas = "";
        u.dias.forEach(d => {
            const celda = d.estado === "sin_registro" ? "—"
                : d.estado === "parada" ? "PARADA"
                : fmtMoneda(d.deposito);
            filas += '<tr><td>' + d.dia + '</td><td>' + d.fecha + '</td><td>' + esc(d.ruta) + '</td><td class="num">' + celda + '</td></tr>';
        });
        tablasUnidadesHTML +=
            '<div class="tabla-unidad-wrap">' +
                '<h3 class="unit-title">Unidad ' + esc(u.unidad) + '</h3>' +
                '<table class="tabla-unidad">' +
                    '<thead><tr><th>Día</th><th>Fecha</th><th>Ruta</th><th>Depósito</th></tr></thead>' +
                    '<tbody>' + filas + '</tbody>' +
                    '<tfoot><tr class="total-unidad"><td colspan="3">Total depositado</td><td class="num">' + fmtMoneda(u.total) + '</td></tr></tfoot>' +
                '</table>' +
            '</div>';
    });

    /* Mini tabla consolidada (Unidad | Total depositado) */
    let resumenFilas = "";
    resumenUnidades.forEach(d => {
        resumenFilas += '<tr><td>Unidad ' + esc(d.unidad) + '</td><td class="num">' + fmtMoneda(d.total) + '</td></tr>';
    });

    /* Observaciones consolidadas — solo al final del reporte */
    const observaciones = semanaEnriquecida
        .filter((d) => d.registro && (d.registro.observaciones || "").trim())
        .map((d) => ({ dia: d.dia, fecha: d.fecha, texto: d.registro.observaciones.trim() }));
    const observacionesHTML = observaciones.length
        ? '<div class="obs-section">' +
            '<h2>Observaciones de la semana</h2>' +
            observaciones.map((o) =>
                '<div class="obs-item"><span class="obs-dia">' + esc(o.dia) + ' ' + esc(o.fecha) + '</span><span class="obs-texto">' + esc(o.texto) + '</span></div>'
            ).join('') +
          '</div>'
        : '';

    const html = '<!DOCTYPE html><html lang="es"><head>' +
        '<meta charset="UTF-8">' +
        '<title>Reporte Unidad ' + esc(unitId) + '</title>' +
        '<style>' +
            '*{box-sizing:border-box;margin:0;padding:0}' +
            'body{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:12px;padding:24px}' +
            'h1{font-size:22px;margin-bottom:4px}' +
            '.subtitle{font-size:13px;color:#000;margin-bottom:12px}' +
            '.subtitle .periodo{font-size:11px;color:#1a1a1a;margin-top:2px}' +
            'hr.sep{border:none;border-top:2px solid #000;margin:10px 0 16px}' +
            '.print-day-block{page-break-inside:avoid;margin-bottom:16px;border:1px solid #999;border-radius:4px;overflow:hidden}' +
            '.print-day-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f0f0f0;border-bottom:1px solid #999}' +
            '.print-day-title{font-size:13px}' +
            '.print-badge{font-size:9px;font-weight:bold;padding:2px 8px;border-radius:10px;text-transform:uppercase;border:1px solid transparent;color:#fff}' +
            '.print-badge-prod{background:#07883f;color:#fff}' +
            '.print-badge-parada{background:#c62828;color:#fff}' +
            '.print-badge-sin{background:#6b7280;color:#fff}' +
            '.print-day-body{padding:10px 12px}' +
            '.print-day-detail{font-size:11.5px}' +
            '.print-day-empty{color:#111;font-style:italic;padding:8px 0}' +
            '.print-row{display:flex;justify-content:space-between;padding:3px 0;color:#000}' +
            '.print-row-ruta{font-weight:bold}' +
            '.print-row-ingreso span:last-child{font-weight:bold;color:#000}' +
            '.print-row-pend{background:#f5f5f5;padding:4px 8px;margin:4px -8px;border-radius:3px}' +
            '.print-row-sub{font-weight:bold;border-top:1px solid #bbb;padding-top:5px;margin-top:3px}' +
            '.print-row-dep{font-size:14px;font-weight:bold;border-top:2px solid #000;padding-top:6px;margin-top:3px}' +
            '.print-sep{border-top:1px solid #eee;margin:4px 0}' +
            '.print-dep{color:#000;font-size:14px}' +
            '.total-line{margin-top:12px;text-align:right;font-weight:bold;font-size:13px}' +
            '.obs-section{margin-top:28px;border:1px solid #999;border-radius:4px;padding:12px 14px;page-break-inside:avoid}' +
            '.obs-section h2{font-size:13px;margin-bottom:8px}' +
            '.obs-item{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-top:1px solid #eee}' +
            '.obs-item:first-of-type{border-top:none}' +
            '.obs-dia{font-weight:bold;white-space:nowrap;color:#000}' +
            '.obs-texto{font-weight:600;color:#000;text-align:right}' +
            '.footer{margin-top:32px;font-size:7px;color:#888;display:flex;justify-content:space-between}' +
            '.resumen-section{margin-top:28px}' +
            '.resumen-section h2{font-size:14px;margin-bottom:6px}' +
            '.resumen-section .rango{font-size:10px;color:#1a1a1a;margin-bottom:10px}' +
            '.tabla-unidad-wrap{page-break-inside:avoid;margin-bottom:18px}' +
            '.unit-title{font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.4px}' +
            'table.tabla-unidad{width:100%;border-collapse:collapse}' +
            'table.tabla-unidad th,table.tabla-unidad td{border:1px solid #999;padding:4px 7px;font-size:10.5px;text-align:left}' +
            'table.tabla-unidad th{background:#f0f0f0;font-weight:bold}' +
            'table.tabla-unidad tfoot td{border-top:2px solid #000;font-weight:bold}' +
            '.resumen-consolidado{margin-top:24px}' +
            'table.resumen{width:60%;margin-left:auto;margin-right:0;border-collapse:collapse;page-break-inside:avoid}' +
            'table.resumen th,table.resumen td{border:1px solid #000;padding:6px 10px;font-size:11px;text-align:left}' +
            'table.resumen th{font-weight:bold;background:#fff}' +
            'td.num{text-align:right}' +
            '@media print{' +
                '@page{size:A4 portrait;margin:15mm 12mm}' +
                'body{padding:0;background:#fff}' +
                '.print-day-block{page-break-inside:avoid}' +
                '.day-block{page-break-inside:avoid}' +
            '}' +
        '</style>' +
        '</head><body>' +
        '<h1>REPORTE SEMANAL</h1>' +
        '<div class="subtitle">Unidad ' + esc(unitId) +
            '<div class="periodo">Periodo: ' + rangoFechas + '</div>' +
        '</div>' +
        '<hr class="sep">' +
        bloquesHTML +
        '<div class="total-line">Total depositado: ' + fmtMoneda(totalDep) + '</div>' +
        observacionesHTML +
        '<div class="resumen-section">' +
            '<h2>Producción de las ' + resumenUnidades.length + ' unidades</h2>' +
            '<div class="rango">' + rangoResumen + '</div>' +
            tablasUnidadesHTML +
            '<h2 class="resumen-consolidado">Producción de las ' + resumenUnidades.length + ' unidades</h2>' +
            '<div class="rango">' + rangoResumen + '</div>' +
            '<table class="resumen">' +
                '<thead><tr><th>Unidad</th><th>Total depositado</th></tr></thead>' +
                '<tbody>' + resumenFilas +
                    '<tr><td><strong>TOTAL</strong></td><td class="num"><strong>' + fmtMoneda(depGlobal) + '</strong></td></tr>' +
                '</tbody>' +
            '</table>' +
        '</div>' +
        '<div class="footer">' +
            '<span>Control Semanal de Unidades</span>' +
            '<span>Generado: ' + ahoraTexto() + '</span>' +
        '</div>' +
        '</body></html>';

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
            const unidades = unidadesResumenPeriodo();
            if (!unidades.length) {
                mostrarModalAviso("Sin datos", "No hay unidades con registros en el periodo para generar la tabla resumida.");
                return;
            }
            generarPDFTablaResumida(unidades, textoRangoPeriodo());
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

    /* 2) Semana por defecto: la más reciente con registros
          (o la actual si aún no hay datos) */
    if (!semanaSeleccionada) {
        semanaSeleccionada = semanaPorDefecto() || null;
    }

    /* 3) Auto-selecciona la primera unidad disponible */
    if (registros.length && !unidadSeleccionada) {
        unidadSeleccionada = unidadRecomendada();
    }

    /* 4) AHORA sí: pinta métricas, tabla e historial */
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
