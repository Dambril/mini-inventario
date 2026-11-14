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

// Solo convierte lo que parece número; "abc" sigue siendo texto y el esquema lo rechaza.
function limpiarNumero(valor) {
  const limpio = limpiarTexto(valor);
  if (typeof limpio === 'string' && /^[+-]?\d+(\.\d+)?$/.test(limpio)) return Number(limpio);
  return limpio;
}

// Los mensajes se muestran junto a su campo, así que no necesitan nombrarlo.
const OBLIGATORIO = 'Este campo es obligatorio';

const texto = (max) =>
  z.preprocess(
    limpiarTexto,
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

export const productoNuevo = z.strictObject({
  nombre: texto(LIMITES.nombre),
  sku: texto(LIMITES.sku),
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
