/**
 * KONYS - CONFIGURACIÓN DE SUPABASE
 * =================================
 * Inicialización del cliente oficial de Supabase con las credenciales
 * del proyecto "Prueba1" de Andres Camilo Lopez Valenzuela.
 */

const SUPABASE_URL = 'https://uihdpfxsartpbfobwbda.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7DhKJwpl6_DMhDfPqCgXQw_jI6hSsH3';

// Verificación de disponibilidad del SDK cargado vía CDN
if (typeof supabase === 'undefined') {
  console.error('El SDK de Supabase no se cargó correctamente desde el CDN.');
}

// Cliente global de Supabase para toda la aplicación
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
