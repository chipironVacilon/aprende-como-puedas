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
    │                              escucha y adivina, escribe la palabra y arcade
    │                              del marcianito
    └── Francés
        └── Colores              → Vacío de momento
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

## La actividad de verbos irregulares

Viene del proyecto `verbos-irregulares` y se conserva tal como era, con sus 61
verbos, su audio, sus seis modos de juego y sus pruebas. Su documentación está en
`primaria/5/ingles/verbos-irregulares/README.md` y sus comprobaciones se ejecutan
dentro de esa carpeta:

```bash
cd primaria/5/ingles/verbos-irregulares
node scripts/check-data.mjs   # revisa los datos de los verbos
node scripts/play-test.mjs    # juega una partida de cada modo en un navegador real
```
