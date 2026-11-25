"""Servidor MCP de solo lectura para Mini Inventario.

Herramientas:
  - buscar_producto(nombre): busca productos por nombre (coincidencia parcial).
  - stock_bajo(): lista productos con cantidad < minimo.

Seguridad:
  - DATABASE_URL se lee de mcp-inventario/.env y nunca se imprime ni se devuelve.
  - Todas las consultas son parametrizadas y fijas (no hay SQL libre).
  - La conexion se abre en modo solo lectura y no hay herramientas de escritura.
  - Maximo 50 resultados por consulta.
"""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv(Path(__file__).parent / ".env")

MAX_RESULTADOS = 50

mcp = FastMCP("inventario")


def _conectar() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        # Mensaje generico: nunca se incluye el valor de la variable.
        raise RuntimeError("Falta DATABASE_URL en mcp-inventario/.env")
    conn = psycopg.connect(url, connect_timeout=10)
    conn.read_only = True  # transaccion de solo lectura
    return conn


def _consultar(sql: str, params: tuple) -> list[dict]:
    try:
        with _conectar() as conn, conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    except psycopg.Error as e:
        # Solo el tipo de error: el texto puede contener datos de conexion.
        raise RuntimeError(f"Error de base de datos ({type(e).__name__})") from None


@mcp.tool
def buscar_producto(nombre: str) -> list[dict]:
    """Busca productos cuyo nombre contenga el texto dado (sin distinguir mayusculas).

    Devuelve hasta 50 resultados con nombre, sku, cantidad y minimo.
    """
    texto = nombre.strip()
    if not texto:
        raise ValueError("El nombre no puede estar vacio")
    if len(texto) > 100:
        raise ValueError("El nombre no puede superar 100 caracteres")
    # Escapa comodines de LIKE para que el texto se busque literalmente.
    patron = "%" + texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    return _consultar(
        """
        SELECT nombre, sku, cantidad, minimo
        FROM public.productos
        WHERE nombre ILIKE %s
        ORDER BY nombre
        LIMIT %s
        """,
        (patron, MAX_RESULTADOS),
    )


@mcp.tool
def stock_bajo() -> list[dict]:
    """Lista productos por debajo del minimo (cantidad < minimo), los mas faltantes primero.

    Devuelve hasta 50 resultados con nombre, sku, cantidad, minimo y faltan.
    """
    return _consultar(
        """
        SELECT nombre, sku, cantidad, minimo, (minimo - cantidad) AS faltan
        FROM public.productos
        WHERE cantidad < minimo
        ORDER BY faltan DESC, nombre
        LIMIT %s
        """,
        (MAX_RESULTADOS,),
    )


if __name__ == "__main__":
    mcp.run()  # transporte stdio
