# Aprende como puedas

Web de aprendizaje para Primaria: un menú de cursos, asignaturas y actividades, cada
una con sus ejercicios y juegos.

No necesita instalación, ni servidor, ni conexión: se abre el archivo `index.html`
con doble clic.

## Qué hay hoy

```
Primaria
└── 5º
    ├── Inglés
    │   └── Verbos irregulares   → Tarjetas, quiz de formas, completa la frase,
    │                              escucha y adivina, escribe la palabra, arcade
    │                              del marcianito e invasores
    └── Francés
        ├── Colores              → Tarjetas, quiz, parejas y escucha
        └── Números del 1 al 30  → Tarjetas, quiz, escritura y escucha
```

La página principal (`index.html`) es el menú: cabecera con el logotipo (un lápiz
atado con un nudo), una franja de contexto (`Primaria › 5º`) y una sección por
asignatura que se pliega y se despliega. Cada actividad es una tarjeta con su
enlace a una página independiente.

## Cómo está organizado

```
index.html                                  el menú (portal)
assets/logo.svg                             logotipo; también es el favicon
assets/icon-180.png                         icono para móvil y tableta
primaria/5/ingles/verbos-irregulares/       la actividad de inglés, completa
primaria/5/frances/colores/                 los colores en francés
primaria/5/frances/numeros/                 los números del 1 al 30 en francés
primaria/5/frances/verificar.mjs            comprobación de las dos actividades
```

Cada actividad vive en su propia carpeta, con todo lo que necesita dentro
(JavaScript, audios, imágenes). Así se puede mover o copiar sin tocar las demás, y
el menú sólo guarda un enlace a su `index.html`.

## Cómo añadir una actividad

1. Crea la carpeta siguiendo el camino del menú, por ejemplo
   `primaria/5/frances/colores/`, y pon dentro su `index.html` con la actividad.
2. En el `index.html` de la raíz, dentro de la sección de la asignatura
   correspondiente, cambia la tarjeta "Pronto" por un enlace:

   ```html
   <a class="activity" href="primaria/5/frances/colores/index.html">
     <span class="activity__icon" aria-hidden="true">🌈</span>
     <span class="activity__body">
       <span class="activity__title">Colores</span>
       <span class="activity__meta">Los colores en francés, con audio y juego</span>
     </span>
     <span class="activity__go">Empezar <span aria-hidden="true">→</span></span>
   </a>
   ```

   Si añades una asignatura nueva, cópiala entera:

   ```html
   <details class="subject subject--fr" open>
     <summary class="subject__head">
       <span class="subject__icon" aria-hidden="true">🎨</span>
       <h2 class="subject__title">Francés</h2>
       <span class="subject__count">1 actividad</span>
       <span class="subject__chev" aria-hidden="true"></span>
     </summary>
     <div class="subject__panel">
       <div class="activities"><!-- las tarjetas --></div>
     </div>
   </details>
   ```

3. Abre el `index.html` de la raíz y comprueba que el enlace lleva a la actividad.

No hay que compilar nada: los ficheros se editan y se abren tal cual.

## Las actividades de francés

Las dos son una página autocontenida (`index.html` con su CSS y su JavaScript dentro) y
tienen la misma estructura: una cabecera con el enlace de vuelta al menú, el progreso
(estrellas y mejor racha) y cuatro modos.

- **Colores** (`primaria/5/frances/colores/`): los once colores básicos con su color real
  y su traducción. Tarjetas para mirar y escuchar, quiz de diez preguntas, parejas para
  emparejar cada nombre con su color y escucha para reconocer el color de oído.
- **Números del 1 al 30** (`primaria/5/frances/numeros/`): los treinta números con su
  escritura (`dix-sept`, `vingt et un`, `vingt-deux`…), tarjetas, quiz de ida y vuelta
  (del número a la palabra y de la palabra al número), escritura con teclado y escucha.
  La escritura acepta guiones, espacios o no ponerlos: cuenta la ortografía.

El sonido lo pone la voz francesa del navegador (`speechSynthesis`), así que no hay
audios que descargar ni conexión que necesitar. Si el equipo no tiene ninguna voz en
francés, las actividades funcionan igual sin sonido y lo explican; al añadir una voz al
sistema, el modo "Escucha" se activa solo.

El progreso se guarda en el propio navegador (`localStorage`); si está bloqueado, se
juega igual y no se guarda nada.

Las dos actividades tienen una comprobación de navegador, sin dependencias (sólo necesita
un Chromium instalado). Abre las tres páginas, juega a los modos, revisa las palabras y los
enlaces, mira que nada desborde a 390 px y falla si algo lanza un error:

```bash
cd primaria/5/frances
node verificar.mjs                    # 82 comprobaciones
node verificar.mjs --shots /tmp/fr   # además guarda capturas para mirarlas
```

## La actividad de verbos irregulares

Viene del proyecto `verbos-irregulares` y se conserva tal como era, con sus 61
verbos, su audio, sus siete modos de juego y sus pruebas. Su documentación está en
`primaria/5/ingles/verbos-irregulares/README.md` y sus comprobaciones se ejecutan
dentro de esa carpeta:

```bash
cd primaria/5/ingles/verbos-irregulares
node scripts/check-data.mjs   # revisa los datos de los verbos
node scripts/play-test.mjs    # juega una partida de cada modo en un navegador real
```
