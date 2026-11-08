/**
 * KONYS PIZZA - LÓGICA DEL PANEL DE ADMINISTRACIÓN
 * ================================================
 * Controla:
 * 1. Autenticación simple frontend (clave maestra guardada en sessionStorage).
 * 2. Navegación por pestañas (Tabs).
 * 3. Gestión y consulta de Reservas (tabla, filtros y cambios de estado).
 * 4. Gestión de Mesas (crear nueva mesa y activar/desactivar).
 * 5. Gestión de Horarios (crear turnos y activar/desactivar).
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Clave maestra por defecto (configurable) ---
  const ADMIN_SECRET = 'konys2026';

  // --- Elementos de Autenticación ---
  const loginSection = document.getElementById('login-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const loginForm = document.getElementById('login-form');
  const adminPassInput = document.getElementById('admin-pass');
  const loginError = document.getElementById('login-error');
  const btnLogout = document.getElementById('btn-logout');

  // --- Tabs y Contadores ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const countReservas = document.getElementById('count-reservas');
  const countMesas = document.getElementById('count-mesas');

  // --- Tab 1: Reservas ---
  const reservasTableBody = document.getElementById('reservas-table-body');
  const filtroEstadoReserva = document.getElementById('filtro-estado-reserva');
  const btnRefreshReservas = document.getElementById('btn-refresh-reservas');

  // --- Tab 2: Mesas ---
  const mesasTableBody = document.getElementById('mesas-table-body');
  const formNuevaMesa = document.getElementById('form-nueva-mesa');
  const btnRefreshMesas = document.getElementById('btn-refresh-mesas');

  // --- Tab 3: Horarios ---
  const horariosTableBody = document.getElementById('horarios-table-body');
  const formNuevoHorario = document.getElementById('form-nuevo-horario');
  const btnRefreshHorarios = document.getElementById('btn-refresh-horarios');

  // Estado local en memoria
  let cacheMesas = new Map();
  let listaReservas = [];

  // =========================================================================
  // 1. SISTEMA DE AUTENTICACIÓN SIMPLE (FRONTEND)
  // =========================================================================

  function verificarSesion() {
    const isAuth = sessionStorage.getItem('konys_admin_auth');
    if (isAuth === 'true') {
      loginSection.classList.add('hidden');
      dashboardSection.classList.remove('hidden');
      btnLogout.classList.remove('hidden');
      cargarDatosAdmin();
    } else {
      loginSection.classList.remove('hidden');
      dashboardSection.classList.add('hidden');
      btnLogout.classList.add('hidden');
    }
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const password = adminPassInput.value.trim();

    if (password === ADMIN_SECRET) {
      sessionStorage.setItem('konys_admin_auth', 'true');
      adminPassInput.value = '';
      verificarSesion();
    } else {
      loginError.textContent = 'Contraseña incorrecta. Intenta nuevamente.';
    }
  });

  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('konys_admin_auth');
    verificarSesion();
  });

  // =========================================================================
  // 2. SISTEMA DE PESTAÑAS (TABS)
  // =========================================================================

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.add('hidden'));

      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.remove('hidden');
    });
  });

  async function cargarDatosAdmin() {
    await cargarCatalogoMesas();
    await cargarReservasAdmin();
    await cargarHorariosAdmin();
  }

  // =========================================================================
  // 3. TAB: VER Y GESTIONAR RESERVAS
  // =========================================================================

  async function cargarReservasAdmin() {
    reservasTableBody.innerHTML = '<tr><td colspan="8" class="text-center">Consultando reservas en Supabase...</td></tr>';
    
    try {
      const { data, error } = await supabaseClient
        .from('reservas')
        .select('*')
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false });

      if (error) throw error;

      listaReservas = data || [];
      countReservas.textContent = listaReservas.length;
      renderizarTablaReservas();
    } catch (err) {
      console.error('Error al cargar reservas:', err);
      reservasTableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:var(--primary-red);">Error al cargar reservas: ${err.message}</td></tr>`;
    }
  }

  function renderizarTablaReservas() {
    const filtro = filtroEstadoReserva.value;
    const filtradas = listaReservas.filter(r => filtro === 'todas' || r.estado === filtro);

    if (filtradas.length === 0) {
      reservasTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No hay reservas para mostrar con este filtro.</td></tr>';
      return;
    }

    reservasTableBody.innerHTML = filtradas.map(reserva => {
      const mesa = cacheMesas.get(reserva.mesa_id) || { nombre: `Mesa ID #${reserva.mesa_id}`, zona: 'N/A' };
      const estadoClass = `status-${reserva.estado || 'confirmada'}`;

      return `
        <tr>
          <td><strong>${escapeHTML(reserva.cliente_nombre)}</strong></td>
          <td><a href="tel:${escapeHTML(reserva.cliente_contacto)}" style="color:inherit;">${escapeHTML(reserva.cliente_contacto)}</a></td>
          <td>${escapeHTML(mesa.nombre)} <small>(${escapeHTML(mesa.zona)})</small></td>
          <td><strong>${reserva.fecha}</strong></td>
          <td>${reserva.hora_inicio} - ${reserva.hora_fin || '--'}</td>
          <td>👥 ${reserva.num_personas}</td>
          <td><span class="status-pill ${estadoClass}">${reserva.estado}</span></td>
          <td>
            <div class="action-btn-group">
              ${reserva.estado === 'confirmada' ? `
                <button class="btn-action btn-action-complete" onclick="window.cambiarEstadoReserva(${reserva.id}, 'completada')" title="Marcar como atendida/completada">✓</button>
                <button class="btn-action btn-action-cancel" onclick="window.cambiarEstadoReserva(${reserva.id}, 'cancelada')" title="Cancelar reserva">✕</button>
              ` : `
                <button class="btn-action btn-action-toggle" onclick="window.cambiarEstadoReserva(${reserva.id}, 'confirmada')" title="Reabrir / Confirmar">↩</button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.cambiarEstadoReserva = async (id, nuevoEstado) => {
    try {
      const { error } = await supabaseClient
        .from('reservas')
        .update({ estado: nuevoEstado })
        .eq('id', id);

      if (error) throw error;
      await cargarReservasAdmin();
    } catch (err) {
      alert('Error al actualizar reserva: ' + err.message);
    }
  };

  filtroEstadoReserva.addEventListener('change', renderizarTablaReservas);
  btnRefreshReservas.addEventListener('click', cargarReservasAdmin);

  // =========================================================================
  // 4. TAB: GESTIÓN DE MESAS
  // =========================================================================

  async function cargarCatalogoMesas() {
    mesasTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando mesas...</td></tr>';
    
    try {
      const { data, error } = await supabaseClient
        .from('mesas')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;

      const mesas = data || [];
      countMesas.textContent = mesas.length;
      
      // Actualizar caché para lookup rápido
      cacheMesas.clear();
      mesas.forEach(m => cacheMesas.set(m.id, m));

      if (mesas.length === 0) {
        mesasTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Aún no hay mesas registradas.</td></tr>';
        return;
      }

      mesasTableBody.innerHTML = mesas.map(mesa => {
        const estaActiva = mesa.activa !== false;
        return `
          <tr>
            <td><strong>${escapeHTML(mesa.nombre)}</strong></td>
            <td>${escapeHTML(mesa.zona || 'Salón')}</td>
            <td>👥 ${mesa.capacidad} personas</td>
            <td>
              <span class="status-pill ${estaActiva ? 'status-activa' : 'status-inactiva'}">
                ${estaActiva ? 'Activa' : 'Inactiva'}
              </span>
            </td>
            <td>
              <button 
                class="btn-action btn-action-toggle" 
                onclick="window.toggleEstadoMesa(${mesa.id}, ${estaActiva})"
              >
                ${estaActiva ? '🚫 Desactivar' : '✅ Activar'}
              </button>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Error al cargar mesas:', err);
      mesasTableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--primary-red);">Error: ${err.message}</td></tr>`;
    }
  }

  // Toggle estado de mesa
  window.toggleEstadoMesa = async (id, estadoActual) => {
    try {
      const { error } = await supabaseClient
        .from('mesas')
        .update({ activa: !estadoActual })
        .eq('id', id);

      if (error) throw error;
      await cargarCatalogoMesas();
    } catch (err) {
      alert('Error al modificar mesa: ' + err.message);
    }
  };

  // Crear nueva mesa
  formNuevaMesa.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('mesa-nombre').value.trim();
    const zona = document.getElementById('mesa-zona').value;
    const capacidad = parseInt(document.getElementById('mesa-capacidad').value, 10);
    const foto_url = document.getElementById('mesa-foto').value.trim() || null;
    const activa = document.getElementById('mesa-activa').checked;

    try {
      const { error } = await supabaseClient
        .from('mesas')
        .insert([{ nombre, zona, capacidad, foto_url, activa }]);

      if (error) throw error;

      alert('¡Mesa creada con éxito!');
      formNuevaMesa.reset();
      document.getElementById('mesa-activa').checked = true;
      await cargarCatalogoMesas();
    } catch (err) {
      alert('Error al crear mesa: ' + err.message);
    }
  });

  btnRefreshMesas.addEventListener('click', cargarCatalogoMesas);

  // =========================================================================
  // 5. TAB: GESTIÓN DE HORARIOS
  // =========================================================================

  async function cargarHorariosAdmin() {
    horariosTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando turnos...</td></tr>';
    
    try {
      const { data, error } = await supabaseClient
        .from('horarios')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const horarios = data || [];
      if (horarios.length === 0) {
        horariosTableBody.innerHTML = '<tr><td colspan="6" class="text-center">No hay horarios configurados. El sistema está usando los horarios por defecto.</td></tr>';
        return;
      }

      horariosTableBody.innerHTML = horarios.map(h => {
        const estaActivo = h.activo !== false;
        return `
          <tr>
            <td><strong style="text-transform: capitalize;">${escapeHTML(h.dia_semana || 'Todos')}</strong></td>
            <td>${escapeHTML(h.jornada || 'General')}</td>
            <td>${h.hora_inicio} - ${h.hora_fin}</td>
            <td>${h.duracion_slot || 60} mins</td>
            <td>
              <span class="status-pill ${estaActivo ? 'status-activa' : 'status-inactiva'}">
                ${estaActivo ? 'Activo' : 'Pausado'}
              </span>
            </td>
            <td>
              <button 
                class="btn-action btn-action-toggle" 
                onclick="window.toggleEstadoHorario(${h.id}, ${estaActivo})"
              >
                ${estaActivo ? 'Pausar' : 'Activar'}
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Error al cargar horarios:', err);
      horariosTableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--primary-red);">Error: ${err.message}</td></tr>`;
    }
  }

  window.toggleEstadoHorario = async (id, estadoActual) => {
    try {
      const { error } = await supabaseClient
        .from('horarios')
        .update({ activo: !estadoActual })
        .eq('id', id);

      if (error) throw error;
      await cargarHorariosAdmin();
    } catch (err) {
      alert('Error al actualizar horario: ' + err.message);
    }
  };

  formNuevoHorario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dia_semana = document.getElementById('horario-dia').value;
    const jornada = document.getElementById('horario-jornada').value;
    const hora_inicio = document.getElementById('horario-inicio').value;
    const hora_fin = document.getElementById('horario-fin').value;
    const duracion_slot = parseInt(document.getElementById('horario-duracion').value, 10);

    try {
      const { error } = await supabaseClient
        .from('horarios')
        .insert([{ dia_semana, jornada, hora_inicio, hora_fin, duracion_slot, activo: true }]);

      if (error) throw error;

      alert('¡Horario guardado con éxito!');
      formNuevoHorario.reset();
      await cargarHorariosAdmin();
    } catch (err) {
      alert('Error al guardar horario: ' + err.message);
    }
  });

  btnRefreshHorarios.addEventListener('click', cargarHorariosAdmin);

  // Utilidad de escape XSS
  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Comprobar sesión al inicio
  verificarSesion();
});
