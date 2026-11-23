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

- **T1** — `assets/theme.css` (tokens del tema + base tipográfica y de foco) y migración del portal `index.html`. Commit: `2fc37b4` `feat(tema): adopt sticker kids theme tokens and portal`. Hecho.
- **T2** — Migración de `primaria/5/ingles/verbos-irregulares/index.html`. Commit: `eec8dbd` `feat(tema): restyle irregular verbs activity`. Hecho.
- **T3** — Migración de `primaria/5/frances/numeros/index.html`. Commit: `5e2e379` `feat(tema): restyle french numbers activity`. Hecho.
- **T4** — Migración de `primaria/5/frances/colores/index.html`. Commit: `4ca52ec` `feat(tema): restyle french colours activity`. Hecho.
- **T5** — Verificación visual de las 4 páginas y de sus pantallas de ejercicio, `npm test` de verbos, contraste AA y coherencia de paleta. Commit: `6b1d62d` `docs(tema): explain the shared theme sheet when adding an activity`. Hecho, con la evidencia de L7.

## Log

- **L1** — «quiero modificar el tema y la paleta de colores de la web, para que quede más limpio, amigable y llamativo, para niños. Me haces aluna sugerencia?»
- **L2** — Dirección elegida por el usuario: «02 Sticker fiesta».
- **L3** — Entregable de diseño: `design/tema-ninos/` con `01-papel-limpio.html`, `02-sticker-fiesta.html`, `03-mapa-misiones.html` y `design.json`. El artboard elegido para implementar es `02-sticker-fiesta.html`; los otros dos quedan como alternativas descartadas.

- **L4** — Reparto en commits de la rama `feat/tema-sticker-kids`: `2fc37b4` (tokens + portal + `design/`), `eec8dbd` (verbos), `4ca52ec` (colores), `5e2e379` (números), `6b1d62d` (README). El orden real invirtió T3 y T4 (colores antes que números); el contenido de cada task es el declarado.
- **L5** — Frontera de slice: el diff completo de la rama son ~1.370 líneas añadidas y 324 quitadas sobre 11 archivos, y ~1.200 de ellas son `design/tema-ninos/*.html` (los artboards de las tres direcciones). El cambio de producto son ~700 líneas de CSS/HTML repartidas en los 5 commits. Para publicar, `design/` puede ir en su propio commit/PR y el tema en otro, siguiendo la skill de chained PR.
- **L6** — Hallazgos técnicos que condicionaron el tema: (a) el motor LittleJS del arcade escribe `background: rgb(0,0,0)` inline en `<body>` al inicializarse, por eso el color y las manchas del tema viven en `html` y `body` fuerza `background: transparent !important`; (b) las páginas de actividad necesitan `../../../../assets/theme.css` (cuatro niveles), un nivel mal y todos los tokens desaparecen en silencio dejando la página sin estilos; (c) el marcador `.prompt .hl` usaba `--gold` como color de texto y no pasaba AA sobre crema, ahora usa tinta sobre fondo oro.
- **L7** — Verificación observada: `npm test` de verbos → 853 comprobaciones OK; capturas headless revisadas una por una en portal (480 y 380 px), verbos (inicio, tarjetas, quiz, quiz respondido, escribir, arcade, invasores), colores (inicio, quiz, parejas) y números (inicio, quiz, escribir); contraste calculado para los pares texto/fondo del tema (todos ≥ 4,5 salvo texto grande) y `--ok` oscurecido a `#0b7d5e` para pasar AA también en tamaño normal.
