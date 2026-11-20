// Traduce los errores de la capa de datos y de Supabase Auth a los mensajes de
// docs/requisitos.md. productos.js ya convierte los de Postgres en estos códigos.
const MENSAJES = {
  SKU_DUPLICADO: 'Ya existe un producto con este SKU',
  STOCK_INSUFICIENTE: 'No hay stock suficiente',
  NO_ENCONTRADO: 'Producto no encontrado',
  user_already_exists: 'Ese correo ya tiene una cuenta',
  email_exists: 'Ese correo ya tiene una cuenta',
  invalid_credentials: 'El correo o la contraseña no son correctos',
  email_not_confirmed: 'Confirma tu correo antes de iniciar sesión',
  weak_password: 'La contraseña es demasiado débil',
  email_address_invalid: 'Escribe un correo válido',
  over_request_rate_limit: 'Demasiados intentos; espera un momento',
  over_email_send_rate_limit: 'Demasiados intentos; espera un momento',
};

export function mensajeDeError(error) {
  const mensaje = MENSAJES[error?.code];
  if (mensaje) return mensaje;
  console.error(error);
  return 'Algo salió mal, intenta de nuevo';
}
