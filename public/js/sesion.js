// Registro, inicio y cierre de sesión con correo y contraseña (Supabase Auth).
// supabase-js guarda la sesión en el navegador y la renueva sola.
import { supabase } from './cliente.js';

function falla(code, cause) {
  const error = new Error(code, { cause });
  error.code = code;
  return error;
}

export async function registrar({ email, password }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // Con "Confirm email" activado, un correo ya registrado no da error: vuelve sin identidades.
  if (data.user?.identities?.length === 0) throw falla('user_already_exists');
  // Sin sesión significa que Supabase espera la confirmación del correo.
  return { confirmarCorreo: !data.session };
}

export async function iniciarSesion({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function cerrarSesion() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Llama a `alCambiar(usuario | null)` ahora y cada vez que cambie la sesión.
export function vigilarSesion(alCambiar) {
  supabase.auth.onAuthStateChange((evento, sesion) => {
    // Fuera del callback: dentro no se debe esperar otras llamadas a Supabase.
    setTimeout(() => alCambiar(sesion?.user ?? null), 0);
  });
}
