/**
 * KONYS PIZZA - LÓGICA DEL CLIENTE (VANILLA JS ES6+)
 * ==================================================
 * Controla:
 * 1. Carga dinámica de horarios según la fecha seleccionada.
 * 2. Carga y renderizado de mesas desde Supabase.
 * 3. Verificación de doble reserva en tiempo real y bloqueo visual de mesas ocupadas.
 * 4. Validación de capacidad de comensales.
 * 5. Envío y confirmación de la reserva con manejo de errores (try/catch).
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Estado Global de la Aplicación ---
  const state = {
    mesas: [],
    horarios: [],
    reservasDelDia: [],
    mesaSeleccionada: null,
    filtroZona: 'todas',
    duracionSlotDefault: 60 // minutos por reserva
  };

  // --- Elementos del DOM ---
  const form = document.getElementById('reservation-form');
  const inputNombre = document.getElementById('cliente_nombre');
  const inputContacto = document.getElementById('cliente_contacto');
  const inputFecha = document.getElementById('fecha');
  const selectHora = document.getElementById('hora_inicio');
  const inputPersonas = document.getElementById('num_personas');
  const btnReservar = document.getElementById('btn-reservar');
  
  const tablesGrid = document.getElementById('tables-grid');
  const tablesCount = document.getElementById('tables-count');
  const zoneFilters = document.getElementById('zone-filters');

  const selectedBox = document.getElementById('selected-table-box');
  const selectedName = document.getElementById('selected-table-name');
  const selectedDetails = document.getElementById('selected-table-details');
  const selectedPill = document.getElementById('selected-table-pill');

  const modal = document.getElementById('confirmation-modal');
  const modalTicket = document.getElementById('modal-ticket');
  const btnCloseModal = document.getElementById('btn-close-modal');

  // Establecer fecha mínima: Hoy
  const hoyISO = new Date().toISOString().split('T')[0];
  inputFecha.min = hoyISO;
  inputFecha.value = hoyISO;

  // =========================================================================
  // 1. CARGA INICIAL DE DATOS DESDE SUPABASE
  // =========================================================================
  
  async function initApp() {
    try {
      await Promise.all([cargarMesas(), cargarHorarios()]);
      await actualizarDisponibilidad();
    } catch (err) {
      console.error('Error al inicializar la app:', err);
      mostrarErrorEnGrid('No pudimos conectar con el servidor. Revisa tu configuración de Supabase.');
    }
  }

  /**
   * Consulta la tabla 'mesas' en Supabase y las almacena en memoria.
   */
  async function cargarMesas() {
    try {
      const { data, error } = await supabaseClient
        .from('mesas')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;

      state.mesas = data || [];
      renderizarMesas();
    } catch (error) {
      console.error('Error al consultar mesas:', error.message);
      throw error;
    }
  }

  /**
   * Consulta la tabla 'horarios' para conocer los turnos del restaurante.
   */
  async function cargarHorarios() {
    try {
      const { data, error } = await supabaseClient
        .from('horarios')
        .select('*')
        .eq('activo', true);

      if (error) {
        console.warn('Advertencia: no se cargaron horarios de la BD, usando turnos estándar.', error.message);
        state.horarios = [];
      } else {
        state.horarios = data || [];
      }

      poblarSelectorHoras();
    } catch (error) {
      console.error('Error al cargar horarios:', error);
      poblarSelectorHoras();
    }
  }

  /**
   * Genera los slots horarios dinámicos según el día seleccionado y la tabla horarios.
   */
  function poblarSelectorHoras() {
    selectHora.innerHTML = '<option value="">-- Elige una hora --</option>';

    if (!inputFecha.value) {
      selectHora.disabled = true;
      return;
    }

    // Determinar día de la semana en español (lunes, martes, etc.)
    const [year, month, day] = inputFecha.value.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const nombreDia = diasSemana[dateObj.getDay()];

    // Filtrar horarios para este día o tomar los generales
    let horariosDia = state.horarios.filter(h => {
      const d = (h.dia_semana || '').toLowerCase();
      return d === nombreDia || d === 'todos' || !h.dia_semana;
    });

    // Slots por defecto si la base de datos de horarios aún está vacía
    const slots = [];
    if (horariosDia.length === 0) {
      const turnosFallback = ['12:00', '13:00', '14:00', '15:00', '19:00', '20:00', '21:00', '22:00'];
      turnosFallback.forEach(t => slots.push({ hora: t, duracion: 60 }));
    } else {
      horariosDia.forEach(h => {
        const slotDuracion = h.duracion_slot || 60;
        state.duracionSlotDefault = slotDuracion;
        
        let [startH, startM] = (h.hora_inicio || '12:00').split(':').map(Number);
        let [endH, endM] = (h.hora_fin || '23:00').split(':').map(Number);

        let currentMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        while (currentMinutes < endMinutes) {
          const hh = String(Math.floor(currentMinutes / 60)).padStart(2, '0');
          const mm = String(currentMinutes % 60).padStart(2, '0');
          slots.push({ hora: `${hh}:${mm}`, duracion: slotDuracion });
          currentMinutes += slotDuracion;
        }
      });
    }

    slots.forEach(slot => {
      const opt = document.createElement('option');
      opt.value = slot.hora;
      opt.textContent = `${slot.hora} hrs`;
      selectHora.appendChild(opt);
    });

    selectHora.disabled = false;
    if (slots.length > 0) {
      selectHora.selectedIndex = 1; // Seleccionar primera hora por conveniencia
    }
  }

  // =========================================================================
  // 2. DISPONIBILIDAD Y DOBLE RESERVA (TIEMPO REAL)
  // =========================================================================

  /**
   * Consulta las reservas existentes para la fecha seleccionada y
   * bloquea visualmente las mesas que ya están ocupadas en el slot.
   */
  async function actualizarDisponibilidad() {
    const fecha = inputFecha.value;
    const hora = selectHora.value;

    if (!fecha) return;

    try {
      let query = supabaseClient
        .from('reservas')
        .select('*')
        .eq('fecha', fecha)
        .neq('estado', 'cancelada');

      if (hora) {
        query = query.eq('hora_inicio', hora);
      }

      const { data, error } = await query;
      if (error) throw error;

      state.reservasDelDia = data || [];
      renderizarMesas();

      // Si la mesa previamente seleccionada ahora está ocupada, deseleccionarla
      if (state.mesaSeleccionada) {
        const estaOcupada = state.reservasDelDia.some(r => r.mesa_id === state.mesaSeleccionada.id);
        const personas = parseInt(inputPersonas.value, 10) || 1;
        if (estaOcupada || state.mesaSeleccionada.capacidad < personas) {
          deseleccionarMesa();
        }
      }
    } catch (err) {
      console.error('Error al verificar reservas existentes:', err.message);
    }
  }

  // =========================================================================
  // 3. RENDERIZADO VISUAL DEL MAPA DE MESAS (GRID)
  // =========================================================================

  function renderizarMesas() {
    tablesGrid.innerHTML = '';

    if (state.mesas.length === 0) {
      tablesGrid.innerHTML = `
        <div class="empty-state">
          <p>No hay mesas registradas en el sistema todavía.</p>
        </div>
      `;
      tablesCount.textContent = '0 mesas';
      return;
    }

    const personasRequeridas = parseInt(inputPersonas.value, 10) || 1;
    const idsOcupados = new Set(state.reservasDelDia.map(r => r.mesa_id));

    // Filtrar por zona seleccionada
    const mesasFiltradas = state.mesas.filter(m => {
      if (state.filtroZona === 'todas') return true;
      return m.zona === state.filtroZona;
    });

    let disponiblesContador = 0;

    mesasFiltradas.forEach(mesa => {
      const estaOcupada = idsOcupados.has(mesa.id);
      const estaActiva = mesa.activa !== false;
      const capacidadSuficiente = mesa.capacidad >= personasRequeridas;
      const esSeleccionada = state.mesaSeleccionada && state.mesaSeleccionada.id === mesa.id;

      // Determinación de clases de estado
      let cardClass = 'table-card';
      let statusBadge = '';
      let isClickable = true;

      if (!estaActiva) {
        cardClass += ' table-card--disabled';
        statusBadge = '<span class="table-badge-status">Inactiva</span>';
        isClickable = false;
      } else if (estaOcupada) {
        cardClass += ' table-card--occupied';
        statusBadge = '<span class="table-badge-status status-badge--occupied">Ocupada</span>';
        isClickable = false;
      } else if (!capacidadSuficiente) {
        cardClass += ' table-card--capacity-low';
        statusBadge = `<span class="table-badge-status status-badge--occupied">Cap. máx ${mesa.capacidad}</span>`;
        isClickable = false;
      } else if (esSeleccionada) {
        cardClass += ' table-card--selected';
        statusBadge = '<span class="table-badge-status status-badge--selected">✓ Seleccionada</span>';
        disponiblesContador++;
      } else {
        cardClass += ' table-card--available';
        statusBadge = '<span class="table-badge-status status-badge--available">Disponible</span>';
        disponiblesContador++;
      }

      // Icono según zona
      let iconoZona = '🍽️';
      if (mesa.zona?.toLowerCase().includes('terraza')) iconoZona = '🌿';
      if (mesa.zona?.toLowerCase().includes('vip')) iconoZona = '⭐';

      const card = document.createElement('article');
      card.className = cardClass;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', isClickable ? '0' : '-1');
      card.setAttribute('aria-pressed', esSeleccionada ? 'true' : 'false');

      card.innerHTML = `
        <div class="table-card-top">
          <span class="table-card-icon">${iconoZona}</span>
          ${statusBadge}
        </div>
        <h4 class="table-card-name">${escapeHTML(mesa.nombre)}</h4>
        <div class="table-card-meta">
          <span class="meta-row">📍 <strong>Zona:</strong> ${escapeHTML(mesa.zona || 'Salón')}</span>
          <span class="meta-row capacity-indicator">👥 <strong>Capacidad:</strong> ${mesa.capacidad} personas</span>
        </div>
      `;

      if (isClickable) {
        card.addEventListener('click', () => seleccionarMesa(mesa));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            seleccionarMesa(mesa);
          }
        });
      }

      tablesGrid.appendChild(card);
    });

    tablesCount.textContent = `${disponiblesContador} disponible${disponiblesContador === 1 ? '' : 's'}`;
  }

  // =========================================================================
  // 4. SELECCIÓN DE MESA
  // =========================================================================

  function seleccionarMesa(mesa) {
    state.mesaSeleccionada = mesa;

    selectedBox.classList.add('active');
    selectedName.textContent = `✨ ${mesa.nombre} (${mesa.zona || 'Salón'})`;
    selectedDetails.textContent = `Capacidad para hasta ${mesa.capacidad} comensales.`;
    selectedPill.textContent = 'Lista para reservar';

    btnReservar.disabled = false;
    renderizarMesas();
  }

  function deseleccionarMesa() {
    state.mesaSeleccionada = null;
    selectedBox.classList.remove('active');
    selectedName.textContent = 'Ninguna mesa seleccionada';
    selectedDetails.textContent = 'Haz clic en una mesa disponible en el mapa.';
    selectedPill.textContent = 'Pendiente';
    btnReservar.disabled = true;
    renderizarMesas();
  }

  // =========================================================================
  // 5. GUARDAR RESERVA (VALIDACIÓN Y SUPABASE INSERT)
  // =========================================================================

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarReserva();
  });

  async function guardarReserva() {
    limpiarErrores();

    const nombre = inputNombre.value.trim();
    const contacto = inputContacto.value.trim();
    const fecha = inputFecha.value;
    const horaInicio = selectHora.value;
    const numPersonas = parseInt(inputPersonas.value, 10);

    // Validaciones de frontend
    let tieneError = false;

    if (!nombre) {
      mostrarError('error-nombre', 'Por favor ingresa tu nombre completo.');
      tieneError = true;
    }

    if (!contacto) {
      mostrarError('error-contacto', 'Ingresa un número de contacto o WhatsApp.');
      tieneError = true;
    }

    if (!fecha) {
      mostrarError('error-fecha', 'Selecciona la fecha de tu visita.');
      tieneError = true;
    }

    if (!horaInicio) {
      mostrarError('error-hora', 'Selecciona la hora de tu reserva.');
      tieneError = true;
    }

    if (!state.mesaSeleccionada) {
      alert('Por favor selecciona una mesa disponible en el panel.');
      tieneError = true;
    }

    if (tieneError) return;

    // Validación de negocio: Personas vs Capacidad
    if (numPersonas > state.mesaSeleccionada.capacidad) {
      alert(`La mesa seleccionada solo tiene capacidad para ${state.mesaSeleccionada.capacidad} personas.`);
      return;
    }

    // Calcular hora de fin (por defecto slot duracion)
    const [hh, mm] = horaInicio.split(':').map(Number);
    const endMinutes = hh * 60 + mm + state.duracionSlotDefault;
    const finHH = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
    const finMM = String(endMinutes % 60).padStart(2, '0');
    const horaFin = `${finHH}:${finMM}`;

    // Deshabilitar botón durante el proceso
    btnReservar.disabled = true;
    btnReservar.querySelector('span').textContent = 'Procesando reserva...';

    try {
      // 1. Doble verificación en Supabase para prevenir race condition
      const { data: conflicto, error: errorCheck } = await supabaseClient
        .from('reservas')
        .select('id')
        .eq('mesa_id', state.mesaSeleccionada.id)
        .eq('fecha', fecha)
        .eq('hora_inicio', horaInicio)
        .neq('estado', 'cancelada');

      if (errorCheck) throw errorCheck;

      if (conflicto && conflicto.length > 0) {
        alert('¡Ups! Esta mesa acaba de ser reservada por otro cliente para este mismo horario. Por favor selecciona otra mesa.');
        await actualizarDisponibilidad();
        return;
      }

      // 2. Insertar nueva reserva en la tabla 'reservas'
      const nuevaReserva = {
        mesa_id: state.mesaSeleccionada.id,
        cliente_nombre: nombre,
        cliente_contacto: contacto,
        num_personas: numPersonas,
        fecha: fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        estado: 'confirmada'
      };

      const { data: reservaCreada, error: errorInsert } = await supabaseClient
        .from('reservas')
        .insert([nuevaReserva])
        .select()
        .single();

      if (errorInsert) throw errorInsert;

      // 3. Éxito: Mostrar modal con ticket de confirmación
      mostrarModalConfirmacion(reservaCreada || nuevaReserva, state.mesaSeleccionada);

      // 4. Limpiar formulario y refrescar mesas
      form.reset();
      inputFecha.value = hoyISO;
      poblarSelectorHoras();
      deseleccionarMesa();
      await actualizarDisponibilidad();

    } catch (err) {
      console.error('Error al guardar la reserva en Supabase:', err);
      alert('Ocurrió un error al procesar tu reserva. Inténtalo nuevamente o contáctanos por WhatsApp. Detalle: ' + err.message);
    } finally {
      btnReservar.disabled = !state.mesaSeleccionada;
      btnReservar.querySelector('span').textContent = 'Confirmar Reserva';
    }
  }

  // =========================================================================
  // 6. EVENTOS DE FORMULARIO Y FILTROS
  // =========================================================================

  inputFecha.addEventListener('change', async () => {
    poblarSelectorHoras();
    await actualizarDisponibilidad();
  });

  selectHora.addEventListener('change', async () => {
    await actualizarDisponibilidad();
  });

  inputPersonas.addEventListener('input', () => {
    renderizarMesas();
    // Si la mesa actual ya no tiene capacidad suficiente, deseleccionar
    if (state.mesaSeleccionada && state.mesaSeleccionada.capacidad < parseInt(inputPersonas.value, 10)) {
      deseleccionarMesa();
    }
  });

  // Filtros de zona
  zoneFilters.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-pill')) {
      document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      state.filtroZona = e.target.dataset.zone;
      renderizarMesas();
    }
  });

  // Modal
  btnCloseModal.addEventListener('click', () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  });

  function mostrarModalConfirmacion(reserva, mesa) {
    modalTicket.innerHTML = `
      <div class="ticket-row"><span class="ticket-label">Cliente:</span><span class="ticket-val">${escapeHTML(reserva.cliente_nombre)}</span></div>
      <div class="ticket-row"><span class="ticket-label">Mesa:</span><span class="ticket-val">${escapeHTML(mesa.nombre)} (${escapeHTML(mesa.zona)})</span></div>
      <div class="ticket-row"><span class="ticket-label">Fecha:</span><span class="ticket-val">${reserva.fecha}</span></div>
      <div class="ticket-row"><span class="ticket-label">Horario:</span><span class="ticket-val">${reserva.hora_inicio} a ${reserva.hora_fin || '--'}</span></div>
      <div class="ticket-row"><span class="ticket-label">Comensales:</span><span class="ticket-val">${reserva.num_personas} personas</span></div>
      <div class="ticket-row"><span class="ticket-label">Estado:</span><span class="ticket-val" style="color: var(--success-green);">Confirmada ✓</span></div>
    `;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  // Utilidades
  function mostrarError(elementId, mensaje) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = mensaje;
  }

  function limpiarErrores() {
    document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
  }

  function mostrarErrorEnGrid(msg) {
    tablesGrid.innerHTML = `
      <div class="empty-state">
        <p style="color: var(--primary-red); font-weight: 600;">⚠️ ${msg}</p>
      </div>
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // INICIAR APLICACIÓN
  initApp();
});
