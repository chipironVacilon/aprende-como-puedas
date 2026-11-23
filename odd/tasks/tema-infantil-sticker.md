# Tema infantil "Sticker fiesta" para Aprende como puedas

Rediseño de tema y paleta de las 4 páginas del sitio (portal + 3 actividades) a una dirección
clara, amigable y llamativa para niños, sin cambiar contenido, navegación ni funcionamiento.

## Specs

- **S1** — Requisito del usuario: «quiero modificar el tema y la paleta de colores de la web, para que quede más limpio, amigable y llamativo, para niños.» Dirección elegida por el usuario: «02 Sticker fiesta». Paleta y formas de referencia: `design/tema-ninos/02-sticker-fiesta.html` (crema `#fff7e8`, tinta `#1b2450`, rosa `#ff5c8a`, amarillo `#ffc93c`, turquesa `#23c6a8`, morado `#7b5cff`, naranja `#ff7a45`; contorno de tinta y sombra dura).
- **S2** — Requisito del usuario: «02 Sticker fiesta». El tema se aplica al portal y a las tres actividades: `index.html`, `primaria/5/ingles/verbos-irregulares/index.html`, `primaria/5/frances/colores/index.html`, `primaria/5/frances/numeros/index.html`.
- **S3** — Promesa existente del sitio, textual: «Todo funciona con doble clic en la página: no hace falta conexión.» Ningún artboard, página ni tema puede agregar peticiones externas (fuentes, CDNs, imágenes remotas): solo pilas de fuentes del sistema y assets locales.
- **S4** — Promesa existente del sitio: contenido, estructura, navegación y ejercicios iguales. El cambio es solo de presentación: mismos textos, mismos enlaces, mismos ids/clases que usa el JS, mismas actividades y misma lógica.
- **S5** — Accesibilidad existente preservada: contraste WCAG AA en texto y controles, `:focus-visible` visible en todo elemento interactivo, y `prefers-reduced-motion` respetado.
- **S6** — La paleta vive en un solo lugar: `assets/theme.css` define los tokens; ninguna página vuelve a declarar valores de color del tema duplicados.

## Tasks

- **T1** — `assets/theme.css` (tokens del tema + base tipográfica y de foco) y migración del portal `index.html`. Commit: `feat(tema): adopt sticker kids theme tokens and portal`.
- **T2** — Migración de `primaria/5/ingles/verbos-irregulares/index.html`. Commit: `feat(tema): restyle irregular verbs activity`.
- **T3** — Migración de `primaria/5/frances/numeros/index.html`. Commit: `feat(tema): restyle french numbers activity`.
- **T4** — Migración de `primaria/5/frances/colores/index.html`. Commit: `feat(tema): restyle french colours activity`.
- **T5** — Verificación visual de las 4 páginas y de sus pantallas de ejercicio, `npm test` de verbos, y coherencia de paleta. Commit: `docs(tema): record theme verification`.

## Log

- **L1** — «quiero modificar el tema y la paleta de colores de la web, para que quede más limpio, amigable y llamativo, para niños. Me haces aluna sugerencia?»
- **L2** — Dirección elegida por el usuario: «02 Sticker fiesta».
- **L3** — Entregable de diseño: `design/tema-ninos/` con `01-papel-limpio.html`, `02-sticker-fiesta.html`, `03-mapa-misiones.html` y `design.json`. El artboard elegido para implementar es `02-sticker-fiesta.html`; los otros dos quedan como alternativas descartadas.
