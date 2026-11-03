"""Genera el dataset de pruebas para Data Studio (datos inventados sobre geodatos publicos).

Uso: python -I gen.py <salida.xlsx> [filas_ventas]
"""
import datetime as dt
import os
import random
import sys

from openpyxl import Workbook

random.seed(42)
OUT = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 900

# Geodatos publicos (ciudades, ISO 3166-1 alfa-2, coordenadas aproximadas)
GEO = [
    ("Europa", "España", "ES", "Madrid", 40.4168, -3.7038),
    ("Europa", "España", "ES", "Barcelona", 41.3874, 2.1686),
    ("Europa", "Francia", "FR", "París", 48.8566, 2.3522),
    ("Europa", "Alemania", "DE", "Berlín", 52.52, 13.405),
    ("Europa", "Italia", "IT", "Roma", 41.9028, 12.4964),
    ("Europa", "Portugal", "PT", "Lisboa", 38.7223, -9.1393),
    ("Norteamérica", "Estados Unidos", "US", "Nueva York", 40.7128, -74.006),
    ("Norteamérica", "Estados Unidos", "US", "Los Ángeles", 34.0522, -118.2437),
    ("Norteamérica", "México", "MX", "Ciudad de México", 19.4326, -99.1332),
    ("Norteamérica", "Canadá", "CA", "Toronto", 43.6532, -79.3832),
    ("Sudamérica", "Argentina", "AR", "Buenos Aires", -34.6037, -58.3816),
    ("Sudamérica", "Chile", "CL", "Santiago", -33.4489, -70.6693),
    ("Sudamérica", "Colombia", "CO", "Bogotá", 4.711, -74.0721),
    ("Sudamérica", "Brasil", "BR", "São Paulo", -23.5505, -46.6333),
    ("Sudamérica", "Perú", "PE", "Lima", -12.0464, -77.0428),
    ("Asia", "Japón", "JP", "Tokio", 35.6762, 139.6503),
]
GW = [8, 5, 6, 6, 4, 3, 9, 6, 6, 3, 5, 4, 4, 5, 3, 3]
CAT = {
    "Electrónica": [("Portátiles", ["Portátil Nimbus 14", "Portátil Orion 16"], (650, 1400)),
                    ("Audio", ["Auriculares Eco", "Altavoz Brisa"], (35, 180))],
    "Hogar": [("Cocina", ["Cafetera Aroma", "Batidora Turbo"], (40, 220)),
              ("Decoración", ["Lámpara Luna", "Alfombra Duna"], (25, 160))],
    "Moda": [("Calzado", ["Zapatilla Vento", "Bota Sierra"], (45, 140)),
             ("Ropa", ["Chaqueta Polar", "Camiseta Básica"], (12, 95))],
    "Deporte": [("Ciclismo", ["Bici Urbana Aire", "Casco Rayo"], (40, 700)),
                ("Fitness", ["Esterilla Zen", "Mancuernas 10kg"], (15, 90))],
}
PRODS = []
for c, subs in CAT.items():
    for s, ps, (lo, hi) in subs:
        for p in ps:
            PRODS.append((c, s, p, round(random.uniform(lo, hi), 2)))

CANAL, CW = ["Online", "Tienda física", "Marketplace"], [5, 3, 2]
SEG, SW = ["Particular", "Pyme", "Gran cuenta"], [6, 3, 1]
VEND = ["Ana Ruiz", "Bruno Díaz", "Carla Méndez", "David Soto", "Elena Vidal", "Fernando Paz"]
FUENTE = [("google", "cpc"), ("google", "organic"), ("facebook", "paid_social"), ("instagram", "paid_social"),
          ("newsletter", "email"), ("(direct)", "(none)"), ("bing", "cpc")]
COM = ["Muy satisfecho", "Entrega rápida", "Producto como se esperaba", "Embalaje mejorable", "Volvería a comprar",
       None, None, None]
HOUR_W = [1, 1, 1, 1, 1, 1, 2, 3, 5, 7, 8, 8, 9, 8, 8, 8, 8, 9, 10, 10, 9, 7, 5, 3]

START, END = dt.date(2024, 1, 1), dt.date(2025, 12, 31)
DAYS = (END - START).days + 1
EUR = '#,##0.00 "€"'


def slugify(t: str) -> str:
    t = t.lower().replace(" ", "-")
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u")):
        t = t.replace(a, b)
    return t


wb = Workbook()

# ---- ventas (tabla de hechos) ------------------------------------------------
ws = wb.active
ws.title = "ventas"
ws.append(["id_pedido", "fecha", "fecha_hora", "anio_mes", "region", "pais", "codigo_pais", "ciudad", "lat_long",
           "canal", "fuente", "medio", "categoria", "subcategoria", "producto", "vendedor", "segmento_cliente",
           "cliente_nuevo", "unidades", "precio_unitario", "descuento_pct", "ingresos", "coste", "valoracion",
           "dias_entrega", "devuelto", "url_producto", "imagen_producto", "comentario"])
for i in range(N):
    # tendencia creciente + estacionalidad (noviembre/diciembre)
    d = START + dt.timedelta(days=int((random.random() ** 0.85) * DAYS))
    if random.random() < 0.12:
        d = dt.date(random.choice((2024, 2025)), random.choice((11, 12)), random.randint(1, 28))
    g = random.choices(GEO, GW)[0]
    c, s, p, price = random.choice(PRODS)
    canal = random.choices(CANAL, CW)[0]
    f, m = random.choice(FUENTE) if canal != "Tienda física" else ("(offline)", "tienda")
    u = random.choice([1, 1, 1, 2, 2, 3, 4, 5, 10])
    disc = random.choice([0, 0, 0, 0.05, 0.1, 0.15, 0.2, 0.3])
    ts = dt.datetime.combine(d, dt.time(random.choices(range(24), HOUR_W)[0], random.randint(0, 59), random.randint(0, 59)))
    slug = slugify(p)
    ws.append([
        f"P-{100000 + i}", d, ts, int(d.strftime("%Y%m")), g[0], g[1], g[2], g[3], f"{g[4]},{g[5]}",
        canal, f, m, c, s, p, random.choice(VEND), random.choices(SEG, SW)[0], random.random() < 0.35,
        u, price, disc, round(u * price * (1 - disc), 2), round(u * price * random.uniform(0.45, 0.7), 2),
        random.choices([1, 2, 3, 4, 5, None], [1, 2, 5, 10, 12, 3])[0],
        random.randint(0, 1) if canal == "Tienda física" else random.randint(1, 12),
        random.random() < 0.06,
        f"https://tienda-ejemplo.test/p/{slug}", f"https://placehold.co/120x120.png?text={slug[:12]}",
        random.choice(COM),
    ])
for r in ws.iter_rows(min_row=2):
    r[1].number_format = "yyyy-mm-dd"
    r[2].number_format = "yyyy-mm-dd hh:mm:ss"
    r[19].number_format = r[21].number_format = r[22].number_format = EUR
    r[20].number_format = "0%"

# ---- objetivos (para combinar por anio_mes + pais) ---------------------------
paises = sorted({g[1] for g in GEO})
wo = wb.create_sheet("objetivos")
wo.append(["anio_mes", "pais", "objetivo_ingresos", "objetivo_pedidos"])
for y in (2024, 2025):
    for mth in range(1, 13):
        for p_ in paises:
            base = random.randint(800, 6000) * (1 + 0.15 * (y - 2024)) * (1.4 if mth in (11, 12) else 1)
            wo.append([y * 100 + mth, p_, round(base), max(2, int(base / 250))])
for r in wo.iter_rows(min_row=2):
    r[2].number_format = EUR

# ---- trafico_web (embudo, dispersion, tasas) ----------------------------------
ww = wb.create_sheet("trafico_web")
ww.append(["fecha", "pais", "fuente", "medio", "dispositivo", "sesiones", "usuarios", "paginas_vistas",
           "conversiones", "rebote_pct"])
for k in range(0, DAYS, 3):
    d = START + dt.timedelta(days=k)
    for p_ in random.sample(paises, 4):
        f, m = random.choice(FUENTE)
        se = random.randint(80, 900)
        ww.append([d, p_, f, m, random.choices(["Móvil", "Escritorio", "Tablet"], [6, 3, 1])[0], se,
                   int(se * random.uniform(0.6, 0.9)), int(se * random.uniform(1.5, 4.5)),
                   int(se * random.uniform(0.005, 0.04)), round(random.uniform(0.25, 0.7), 3)])
for r in ww.iter_rows(min_row=2):
    r[0].number_format = "yyyy-mm-dd"
    r[9].number_format = "0.0%"

# ---- diccionario (documentacion de cobertura) -------------------------------
wd = wb.create_sheet("diccionario")
wd.append(["hoja", "campo", "tipo_looker", "uso_recomendado"])
for row in [
    ("ventas", "id_pedido", "Texto", "COUNT_DISTINCT = pedidos"),
    ("ventas", "fecha", "Fecha", "Series temporales, control de periodo, comparación con periodo anterior"),
    ("ventas", "fecha_hora", "Fecha y hora", "Mapa de calor hora x día de la semana"),
    ("ventas", "anio_mes", "Número (AAAAMM)", "Clave de combinación con objetivos"),
    ("ventas", "region > pais > ciudad", "Geo / jerarquía", "Desglose (drill-down), mapas"),
    ("ventas", "codigo_pais", "Geo: país (ISO)", "Mapa geográfico relleno"),
    ("ventas", "lat_long", "Geo: latitud,longitud", "Google Maps con burbujas"),
    ("ventas", "canal, fuente, medio", "Texto", "Circular, Sankey fuente->medio, filtros desplegables"),
    ("ventas", "categoria > subcategoria > producto", "Texto", "Treemap, desglose"),
    ("ventas", "cliente_nuevo, devuelto", "Booleano", "Control de casilla, CASE"),
    ("ventas", "unidades, dias_entrega", "Número", "SUM, histograma, control deslizante"),
    ("ventas", "precio_unitario, ingresos, coste", "Moneda EUR", "KPIs, campo calculado de margen"),
    ("ventas", "descuento_pct", "Porcentaje", "AVG, formato condicional"),
    ("ventas", "valoracion", "Número 1-5 (con nulos)", "AVG, dispersión, tratamiento de nulos"),
    ("ventas", "url_producto", "URL", "Enlace en tabla, HYPERLINK()"),
    ("ventas", "imagen_producto", "URL de imagen", "IMAGE() en tabla"),
    ("ventas", "comentario", "Texto (con nulos)", "Filtros de texto, REGEXP_MATCH"),
    ("objetivos", "objetivo_ingresos", "Moneda", "Combinar con ventas: viñetas, indicador, % cumplimiento"),
    ("trafico_web", "sesiones, conversiones", "Número", "Dispersión, tasa de conversión calculada, áreas"),
    ("trafico_web", "dispositivo", "Texto", "Barras apiladas"),
    ("trafico_web", "rebote_pct", "Porcentaje", "AVG, formato condicional"),
]:
    wd.append(list(row))

wb.save(OUT)
print(os.path.getsize(OUT), ws.max_row, wo.max_row, ww.max_row)


# ---- TSV por pestana (para pegar en Google Sheets con configuracion regional en_US) ----
def cell_text(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, dt.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, dt.date):
        return v.strftime("%Y-%m-%d")
    return str(v).replace("\t", " ").replace("\n", " ")


base = os.path.splitext(OUT)[0]
for sheet in wb.worksheets:
    path = f"{base}__{sheet.title}.tsv"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        for row in sheet.iter_rows(values_only=True):
            fh.write("\t".join(cell_text(v) for v in row) + "\n")
    print(path, os.path.getsize(path))
