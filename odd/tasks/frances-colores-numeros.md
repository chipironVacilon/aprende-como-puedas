# Francés — colores y números

Dos actividades nuevas para la asignatura "Francés" del portal: una para los colores
(página que el menú anunciaba pero que no existía) y otra para los números del 1 al 30.
Siguen el patrón del resto de la web: una carpeta por actividad, se abren con doble clic,
sin servidor y sin conexión.

## Specs

S1. «añade nuevas actividades bajo la asinatura "Francés". Para aprender los colores
    (página que ya existe)» — Bajo Francés hay una actividad para aprender los colores en
    francés, enlazada desde el menú del portal. El menú anunciaba "Colores" pero la página
    no existía (L2): se crea.

S2. «y para aprender los números del 1 al 30 (nueva página)» — Bajo Francés hay una página
    nueva para aprender los números del 1 al 30 en francés, enlazada desde el menú.

S3. El contenido es el correcto: los once colores básicos en francés con su color real y su
    traducción al español, y los números del 1 al 30 en francés, sin faltar ni sobrar
    ninguno, escritos como se enseñan en clase (`vingt et un`, `vingt-deux`, … `trente`).

S4. Cada actividad enseña de verdad, no sólo muestra una lista: se puede estudiar, practicar
    con preguntas y comprobar la respuesta, con acierto y error explicados (y la palabra
    francesa se puede escuchar cuando el equipo tiene voz en francés).

S5. El menú del portal queda coherente: la tarjeta "Pronto" de Colores pasa a ser un enlace
    real, aparece Números 1-30, el contador de Francés dice "2 actividades" y no queda
    ninguna tarjeta pendiente en esa asignatura.

S6. Igual que el resto de la web: se abre con doble clic en su `index.html`, sin servidor,
    sin conexión y sin instalar nada; se puede recorrer con teclado y se lee en el móvil.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | Documento de tarea, rama y datos verificables (colores y números) | S3 | inline | — |
| T2 | Actividad "Colores" en `primaria/5/frances/colores/index.html` | S1, S3, S4, S6 | inline | 29fe212 |
| T3 | Actividad "Números 1-30" en `primaria/5/frances/numeros/index.html` | S2, S3, S4, S6 | inline | 687942e |
| T4 | Portal y README: dos enlaces reales, contador y árbol de contenidos | S5 | inline | 5dad2be |
| T5 | Verificación en Chromium real: contenido, modos, teclado, móvil, sin errores | S1-S6 | inline | — (script de /tmp, no se versiona) |

## Log

L1 (petición del usuario, literal):

> añade nuevas actividades bajo la asinatura "Francés". Para aprender los colores (página que ya existe) y para aprender los números del 1 al 30 (nueva página)

L2 (evidencia): la página de colores **no existía**: no hay `primaria/5/frances/` en el
repositorio y la tarjeta del menú era un `<div class="activity activity--soon">` con la
etiqueta "Pronto". La petición la da por existente; se crea junto con la de números. No hay
proyecto previo de francés en `~/proyectos` que copiar.

L3 (decisión): cada actividad es una carpeta autocontenida con su `index.html` (CSS y JS
dentro), como la actividad de inglés, para que se pueda copiar o mover sola. Se usa la
misma familia visual del portal (fondo oscuro, tarjetas, botón degradado) y una cabecera con
enlace de vuelta al menú.

L4 (decisión): el audio se pide a la voz francesa del navegador (`speechSynthesis`) y no a
grabaciones: el proyecto de inglés genera MP3 con `msedge-tts`, que necesita internet y
`npm install`, y las dos actividades nuevas tienen que funcionar sin conexión. Si el equipo
no tiene voz en francés, las actividades siguen funcionando sin sonido y lo explican.

L5 (evidencia, T2-T5): comprobación en Chromium real por DevTools (sin dependencias, el
mismo método que `scripts/play-test.mjs` de la actividad de inglés). Inyecta antes de
cargar una voz francesa de mentira y al final repite la carga sin ella. Resultado: «213
comprobaciones OK / Todo verde», entre ellas: los 11 colores con su color y su traducción
(la tarjeta «rouge» suena al tocarla), el quiz completa 10 preguntas de los tres tipos con
una respuesta correcta, una incorrecta y su corrección («9 de 10»), la racha se reinicia al
fallar y se queda en 7, las parejas se terminan (6 de 6, con fallos y cartas que se
cierran), el modo escucha suena al empezar y acierta, los 30 números con su palabra
francesa exacta (comprobados uno a uno contra la tabla), el quiz en los dos sentidos, la
escritura acepta mayúsculas y espacios en vez de guiones y rechaza lo incorrecto enseñando
la palabra, «Otra ronda» deja el campo vacío, el portal tiene 2 actividades en Francés con
enlaces a ficheros que existen y sin ninguna tarjeta «Pronto», a 390 px no hay scroll
horizontal en ninguna de las tres páginas y no hay ningún error de consola. Sin voz
instalada el modo «Escucha» queda apagado con su aviso y el resto sigue funcionando.

L6 (decisión de entrega): cada actividad es un fichero autocontenido de ~1.100 líneas, así
que la rebanada natural es la página entera y no una partición artificial que dejaría la
página a medias. Se entrega como rama `feat/frances-colores-numeros` con tres commits de
unidad funcional (colores, números, portal+README) más este documento; nada de push ni PR,
que lo decide el usuario.

L7 (evidencia, commits): T2 → `29fe212`; T3 → `687942e`; T4 → `5dad2be`; este documento en
el commit siguiente. La verificación T5 no se versiona: el script vive en `/tmp` porque
necesita un Chromium y no aporta nada al repositorio estático.
