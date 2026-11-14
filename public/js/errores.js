// Traduce los errores de la capa de datos a los mensajes de docs/requisitos.md.
// Al pasar a Supabase se añaden aquí sus códigos (user_already_exists, 23505, ...).
const MENSAJES = {
  SKU_DUPLICADO: 'Ya existe un producto con este SKU',
  STOCK_INSUFICIENTE: 'No hay stock suficiente',
  NO_ENCONTRADO: 'Producto no encontrado',
};

export function mensajeDeError(error) {
  const mensaje = MENSAJES[error?.code];
  if (mensaje) return mensaje;
  console.error(error);
  return 'Algo salió mal, intenta de nuevo';
}
