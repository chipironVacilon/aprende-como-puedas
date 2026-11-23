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
    con preguntas y comprobar la respuesta, con acierto y error explicados. La palabra
    francesa se puede escuchar con **grabaciones MP3 incluidas en la actividad**, generadas
    igual que en la actividad de inglés (voz neuronal de Edge + ffmpeg), nunca con la voz
    del navegador. Sin las grabaciones, el modo "Escucha" queda apagado y se avisa.

S5. El menú del portal queda coherente: la tarjeta "Pronto" de Colores pasa a ser un enlace
    real, aparece Números 1-30, el contador de Francés dice "2 actividades" y no queda
    ninguna tarjeta pendiente en esa asignatura.

S6. Igual que el resto de la web: se abre con doble clic en su `index.html`, sin servidor,
    sin conexión y sin instalar nada; se puede recorrer con teclado y se lee en el móvil.

S8. Las frases sirven además **como ejercicio propio**: un modo "Frases" en cada actividad
    suena una frase y pide elegir, entre cuatro, el color o el número que nombra; acierto y
    error se explican y la corrección enseña la frase entera con su traducción. La ronda se
    puede repetir y las frases cuentan para las estrellas como cualquier otra pregunta.

S7. Cada palabra lleva una **frase corta que la usa en contexto**, con su traducción al
    español y su propia grabación MP3: "Le camion est rouge" / "El camión es rojo",
    "J'ai douze ans" / "Tengo doce años". Las frases se ven en la actividad (tarjetas de
    colores, lista de frases de números) y se repiten en la corrección del quiz y de la
    escritura, con un botón para volver a escucharlas.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | Documento de tarea, rama y datos verificables (colores y números) | S3 | inline | — |
| T2 | Actividad "Colores" en `primaria/5/frances/colores/index.html` | S1, S3, S4, S6 | inline | 29fe212 |
| T3 | Actividad "Números 1-30" en `primaria/5/frances/numeros/index.html` | S2, S3, S4, S6 | inline | 687942e |
| T4 | Portal y README: dos enlaces reales, contador y árbol de contenidos | S5 | inline | 5dad2be |
| T5 | Verificación en Chromium real: contenido, modos, móvil, sin errores | S1-S6 | inline | 48fab0b |
| T6 | Grabar las 41 palabras en MP3, generador y páginas que reproducen los ficheros | S4, S6 | inline | 5364cb1 |
| T7 | Datos compartidos (`datos.js`), frases de ejemplo grabadas y mostradas | S7 | inline | 7cdf635 |
| T8 | Modo "Frases": escuchar la frase y elegir el color o el número que nombra | S8 | inline | bfdc8fb |

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

L8 (decisión, corregida): el script de verificación de L5 sí se versiona, en
`primaria/5/frances/verificar.mjs`: sin él, que un número o una palabra se rompa no lo
detectaría nada (riesgo 6). Se recortó a la parte que importa —contenido, quiz en los dos
sentidos, escritura tolerante, parejas, escucha con voz inyectada, portal, 390 px y el caso
sin voz— y se ejecutó tres veces seguidas: «82 comprobaciones OK / Todo verde» las tres.

L9 (petición del usuario, literal, corrige L4):

> para las voces no uses la voz del navegador. Genera los MP3 igual que en la activiad de inglés

L10 (evidencia, T6): se copió la cadena de la actividad de inglés (`msedge-tts` +
`ffmpeg` con `loudnorm` y recorte de silencios) en `primaria/5/frances/scripts/generate-audio.mjs`,
con `package.json` y `package-lock.json` propios y `node_modules` ignorado. Voz
`fr-FR-DeniseNeural` a `-8%` de velocidad. Seis de los 41 clips se midieron con `ffprobe`:
«un» 0,235 s, «blanc» 0,418 s, «trente» 0,522 s, «rouge» 0,601 s, «dix-sept» 0,679 s y
«vingt-et-un» 0,836 s; 41 clips, 172 KB en total, cero errores. Toda la voz del navegador
(`speechSynthesis`) salió de las dos páginas: ahora un `<audio>` pide
`assets/audio/<palabra>.mp3`, y si falta la carpeta `assets` una grabación de prueba lo
detecta y apaga «Escucha» con su aviso. La comprobación de navegador pasó a 91 y quedó
verde tres veces seguidas; los clips se cargan enteros (`readyState` 4, duración real) y
se comprueba que la orden de `play()` llega con el fichero correcto, porque este Chromium
sin salida de audio no puede sonar.

L11 (rebanada): las grabaciones son binarios y el generador es una unidad funcional con la
página que las reproduce; van en un commit (`5364cb1`), la comprobación en otro y la
documentación en otro. La rama `feat/frances-colores-numeros` acumula siete commits; el push
y el PR siguen siendo decisión del usuario.

L12 (petición del usuario, literal):

> Sí. Graba frases también

L13 (decisión): las frases dejan de estar duplicadas entre la página y el generador siguiendo
el patrón de la actividad de inglés (`verbs.js`): los datos pasan a
`colores/datos.js` y `numeros/datos.js`, que la página carga con `<script src>` y el
generador lee con `require`. Una frase por palabra, con la concordancia ya aplicada
(*L'herbe est verte*, *La neige est blanche*) y alternando *J'ai…* / *Il y a…* en los
números.

L14 (evidencia, T7): 41 frases nuevas grabadas (82 clips en total, 0,27 MB de audio), cero
errores. Duraciones medidas con `ffprobe`: «Le camion est rouge» 1,254 s, «La neige est
blanche» 1,176 s, «J'ai un chat» 0,784 s, «J'ai vingt et un crayons» 1,202 s, «Il y a
trente élèves» 1,176 s. La comprobación de navegador pasó de 91 a 101 comprobaciones y quedó
verde tres veces: lee los mismos `datos.js`, comprueba los 82 ficheros, que cada frase se
vea con su traducción, que pida el `<palabra>-phrase.mp3` correcto, que el MP3 se cargue y
que la orden de `play()` llegue, y que la corrección del quiz y de la escritura repitan la
frase.

L15 (rebanadas): `7cdf635` datos compartidos + páginas + generador + 41 clips nuevos,
`2dc1c7a` la comprobación, y el commit `docs(frances): document the example
sentences` con el README y este documento.

L16 (petición del usuario, literal):

> Sí. Que las frases sirvan como ejercicio

L17 (decisión, T8): en vez de inventar una mecánica nueva, el quiz pasa de un booleano
"escucha sí/no" a un modo (`quiz`, `listen`, `phrase`), que decide el tipo de ronda, la
consigna, la grabación que suena al empezar y lo que se repite al responder. El modo
"Frases" suena `<palabra>-phrase.mp3` y ofrece cuatro colores (con su muestra) o cuatro
números, sin enseñar el texto hasta la corrección: es comprensión auditiva, no lectura.

L18 (evidencia, T8): 117 comprobaciones de navegador, verdes tres veces seguidas. Las nuevas
comprueban que el menú ofrece cinco modos, que la ronda pide `-phrase.mp3`, que suena al
empezar, que hay cuatro opciones con la buena entre ellas, que las opciones de colores son
muestras y las de números son cifras, que acertar se celebra, que la corrección enseña la
frase entera y que "Otra ronda" sigue en el modo Frases.

L19 (rebanadas): `bfdc8fb` páginas + comprobación; el README y este documento en `52b7b76`.

L20 (petición del usuario, literal): «Vamos a revisar la navegabilidad de toda la web. Revisa
que todas las páginas tengan la opción de "volver" y que haya enlaces para ir a la página
principal del proyecto desde las dferentes sub-páginas de asinaturas»

L21 (defecto encontrado en lo ya entregado): el enlace de vuelta de las dos actividades de
francés estaba roto desde S3: `../../../index.html` resuelve, desde
`primaria/5/frances/colores/`, a `primaria/index.html`, que no existe. Los 117 checks no lo
vieron porque comparaban el texto del `href` (`home.brand === "../../../index.html"`), nunca
que el destino exista; el mismo error de profundidad se había copiado a las dos páginas. La
actividad de inglés tenía el defecto simétrico: su cabecera es un botón al menú interno, así
que desde ella no había ningún camino al portal.
Corregido: `../../../../index.html` en las tres páginas; en inglés, enlace `⌂ Inicio` en la
barra superior (con `.topbar__actions` y `flex-wrap` para 390 px), y las etiquetas internas
pasan de «Volver al inicio»/«Salir al inicio» a «Volver al menú»/«Salir al menú», porque
«inicio» ahora nombra el portal.
Lección que queda en las pruebas: `verificar.mjs` comprueba existencia del destino resuelto
y un viaje de ida y vuelta con clic real (portal → Colores → cabecera → portal);
`play-test.mjs` comprueba `href`, existencia y el mismo viaje de vuelta. 120 y 853
comprobaciones, verdes. Auditoría aparte: las 15 referencias relativas de las cuatro páginas
existen. No existen páginas de asignatura intermedias (Primaria, 5º, Inglés y Francés son
`<details>` del portal), así que «sub-página de asignatura» es cada página de actividad.
