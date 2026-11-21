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
    │                              escucha y adivina y arcade del marcianito
    └── Francés
        └── Colores              → Vacío de momento
```

La página principal (`index.html`) es el menú: cabecera con el logotipo (un lápiz
atado con un nudo) y tarjetas desplegables para bajar por el árbol. Cada hoja del
árbol es una página independiente.

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
2. En el `index.html` de la raíz, dentro de la tarjeta de la asignatura
   correspondiente, cambia la tarjeta "Pronto" por un enlace:

   ```html
   <a class="leaf depth-4 type-fr" href="primaria/5/frances/colores/index.html">
     <span class="leaf__icon" aria-hidden="true">🎨</span>
     <span class="leaf__body">
       <span class="leaf__title">Colores</span>
       <span class="leaf__meta">Los colores en francés, con audio y juego</span>
     </span>
     <span class="leaf__go">Empezar <span aria-hidden="true">→</span></span>
   </a>
   ```

3. Abre el `index.html` de la raíz y comprueba que el enlace lleva a la actividad.

No hay que compilar nada: los ficheros se editan y se abren tal cual.

## La actividad de verbos irregulares

Viene del proyecto `verbos-irregulares` y se conserva tal como era, con sus 61
verbos, su audio, sus cinco modos de juego y sus pruebas. Su documentación está en
`primaria/5/ingles/verbos-irregulares/README.md` y sus comprobaciones se ejecutan
dentro de esa carpeta:

```bash
cd primaria/5/ingles/verbos-irregulares
node scripts/check-data.mjs   # revisa los datos de los verbos
node scripts/play-test.mjs    # juega una partida de cada modo en un navegador real
```
