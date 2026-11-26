// Esquemas de todos los datos que entran a la aplicación (docs/diseno.md, sección 5).
// Funciona igual en el navegador (import map → /vendor/zod.mjs) y en Node (npm).
import { z } from 'zod';

// Sin compilación con new Function: la CSP de la página no permite eval.
z.config({ jitless: true });

// Deben coincidir con los check de la base de datos cuando exista.
export const LIMITES = { nombre: 100, sku: 50, nota: 200, entero: 2147483647 };

// Los formularios entregan texto: se recorta y "" pasa a undefined (campo vacío).
function limpiarTexto(valor) {
  if (typeof valor !== 'string') return valor;
  const recortado = valor.trim();
  return recortado === '' ? undefined : recortado;
}

// Regla del SKU. Es la misma del check productos_sku_normalizado
// (supabase/migrations/002_sku_normalizado.sql): si cambia aquí, cambia allá.
// Los caracteres van escapados para no dejar invisibles en el archivo.
const INVISIBLES = /[\u{00AD}\u{180E}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FEFF}]/gu;
const ESPACIOS = /[\u{0009}-\u{000D}\u{0020}\u{0085}\u{00A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}]+/gu;

// Dos SKU que se ven iguales quedan iguales. No cambia mayúsculas: de eso se
// encarga el índice único de la base de datos.
export function normalizarSku(sku) {
  return sku.replace(INVISIBLES, '').normalize('NFC').replace(ESPACIOS, ' ').replace(/^ | $/g, '');
}

// Como limpiarTexto, pero con la regla del SKU.
function limpiarSku(valor) {
  if (typeof valor !== 'string') return valor;
  const normalizado = normalizarSku(valor);
  return normalizado === '' ? undefined : normalizado;
}

// Solo convierte lo que parece número; "abc" sigue siendo texto y el esquema lo rechaza.
function limpiarNumero(valor) {
  const limpio = limpiarTexto(valor);
  if (typeof limpio === 'string' && /^[+-]?\d+(\.\d+)?$/.test(limpio)) return Number(limpio);
  return limpio;
}

// Los mensajes se muestran junto a su campo, así que no necesitan nombrarlo.
const OBLIGATORIO = 'Este campo es obligatorio';

const texto = (max, limpiar = limpiarTexto) =>
  z.preprocess(
    limpiar,
    z
      .string({ error: (iss) => (iss.input === undefined ? OBLIGATORIO : 'Escribe un texto') })
      .max(max, `Admite como máximo ${max} caracteres`),
  );

const entero = (min, mensajeMin) =>
  z.preprocess(
    limpiarNumero,
    z
      .int({ error: (iss) => (iss.input === undefined ? OBLIGATORIO : 'Escribe un número entero') })
      .min(min, mensajeMin)
      .max(LIMITES.entero, 'El número es demasiado grande'),
  );

// La contraseña no se recorta: los espacios cuentan. 72 es el límite de bcrypt.
export const credenciales = z.strictObject({
  email: z.preprocess(
    limpiarTexto,
    z.email({ error: (iss) => (iss.input === undefined ? OBLIGATORIO : 'Escribe un correo válido') }),
  ),
  password: z
    .string({ error: OBLIGATORIO })
    .min(1, OBLIGATORIO)
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(72, 'La contraseña admite como máximo 72 caracteres'),
});

export const productoNuevo = z.strictObject({
  nombre: texto(LIMITES.nombre),
  sku: texto(LIMITES.sku, limpiarSku),
  cantidad: entero(0, 'La cantidad no puede ser negativa'),
  minimo: entero(0, 'El mínimo no puede ser negativo'),
});

// La cantidad no se edita: solo cambia con movimientos (HU3-3).
export const productoEdicion = productoNuevo.pick({ nombre: true, sku: true, minimo: true });

export const idProducto = z.uuid({ error: 'Producto no encontrado' });

export const movimiento = z.strictObject({
  producto_id: idProducto,
  tipo: z.enum(['entrada', 'salida'], { error: 'Elige entrada o salida' }),
  unidades: entero(1, 'Las unidades deben ser mayores que 0'),
  nota: z.preprocess(
    limpiarTexto,
    z.string().max(LIMITES.nota, `Admite como máximo ${LIMITES.nota} caracteres`).optional(),
  ),
});

// Única puerta de entrada: { ok: true, datos } o { ok: false, errores: { campo: mensaje } }.
export function validar(esquema, datos) {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return { ok: true, datos: resultado.data };

  const errores = {};
  for (const issue of resultado.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const clave of issue.keys) errores[clave] ??= 'Este campo no se puede enviar';
      continue;
    }
    const campo = issue.path.length > 0 ? String(issue.path[0]) : '_';
    errores[campo] ??= issue.message;
  }
  return { ok: false, errores };
}
