# Aprende como puedas — portal de aprendizaje

Primer paso: convertir el proyecto `verbos-irregulares` en una web de aprendizaje con
varias asignaturas. El portal (`index.html`) pasa a ser un menú de tarjetas desplegables
y el juego actual queda dentro como una entrada más.

Aprobado por el usuario en la petición original: copiar el proyecto completo, portal con
logo (lápiz hecho un nudo) y menú Primaria › 5º › Inglés/Francés. Las entradas sin
contenido quedan vacías de momento.

## Specs

S1. "Copiaremos el proyecto completo y lo renombraremos a "Aprende como puedas"." — El
    proyecto `verbos-irregulares` se copia entero (páginas, `verbs.js`, `arcade.js`,
    `vendor/`, `assets/audio/`, `scripts/`) dentro de la nueva web, y la web pasa a
    llamarse "Aprende como puedas". La copia debe funcionar igual que el original:
    abrir su `index.html` con doble clic, sin servidor ni conexión.

S2. "La página principal (index.html) ahora contendrá en el header,el nombre "Aprende como
    puedas" y el logotipo, que es un lápiz hecho un nudo." — El header de la página
    principal muestra, juntos, el nombre "Aprende como puedas" y el logotipo, y el
    logotipo es un lápiz atado con un nudo.

S3. "En el cuerpo tendremos un menú de tarjetas desplegables:" con este árbol:
    - Primaria
        - 5º
            - Inglés
                - Verbos irregulares
            - Francés
                - Colores
    Las tarjetas se despliegan y se pliegan, se pueden recorrer con el teclado y en el
    móvil; el árbol se ve completo tal como está escrito aquí.

S4. "Cuando pulsemos en "Verbos irregulares" llegaremos a lo que era la antigua página
    principal del proyecto. Con todos sus ejercicios y actividades igual que ahora." —
    La entrada "Verbos irregulares" abre la antigua página principal (tarjetas, quiz,
    completa la frase, escucha y adivina y arcade), sin quitarle ningún ejercicio ni
    actividad y sin cambios de comportamiento.

S5. "Las demás entradas están vacías de momento." — Las entradas sin contenido (hoy
    "Francés › Colores") aparecen en el menú pero no llevan a ninguna página: se ven
    como no disponibles y explican que llegarán pronto.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | Copiar el proyecto completo en `primaria/5/ingles/verbos-irregulares/` sin `.git` ni `node_modules`, y comprobar que la copia sigue pasando `check` y `test` | S1 | inline | — |
| T2 | Diseñar el logotipo SVG del lápiz anudado, verificándolo visualmente, y usarlo también como favicon | S2 | inline | — |
| T3 | Escribir el `index.html` del portal: header con logo + nombre, menú de tarjetas desplegables y enlace al juego | S2, S3, S4, S5 | inline | — |
| T4 | README de la web nueva y verificación final: enlaces, rutas relativas, móvil, teclado y que el juego copiado funciona | S1, S3, S4, S5 | inline | — |

## Log

L1 (petición original del usuario, literal):

> Quiero crear una web completa de aprendizaje. El punto de partida será el proyecto verbos-irregulares.
> - Copiaremos el proyecto completo y lo renombraremos a "Aprende como puedas".
> - La página principal (index.html) ahora contendrá en el header,el nombre "Aprende como puedas" y el logotipo, que es un lápiz hecho un nudo. En el cuerpo tendremos un menú de tarjetas desplegables:
>     - Primaria
>         - 5º
>             - Inglés
>                 - Verbos irregulares
>             - Francés
>                 - Colores
> Cuando pulsemos en "Verbos irregulares" llegaremos a lo que era la antigua página principal del proyecto. Con todos sus ejercicios y actividades igual que ahora. Las demás entradas están vacías de momento.

L2 (evidencia): `verbos-irregulares` es un repositorio git propio
(`git rev-parse --show-toplevel` → `/home/pepe/proyectos/verbos-irregulares`). La carpeta
destino `aprende-como-puedas/` ya existía con `inicio.md` vacío, `.atl/` y un fichero de
intercambio de Kate; se conservan y la copia no los toca.

L3 (decisión): el juego copiado va en `primaria/5/ingles/verbos-irregulares/`, una carpeta
por hoja del árbol, para que las rutas relativas del proyecto original
(`assets/audio/...`, `arcade.js`, `vendor/...`) sigan funcionando sin tocar ni una línea
del juego. La copia excluye `.git`, `node_modules` y los ficheros de ruido del sistema.

L4 (evidencia, T1): copia con `rsync -a` y `diff -rq` contra el original → idéntica salvo
`.git`, `node_modules` y `.atl`. Dentro de la copia: `node scripts/check-data.mjs` →
«Verbs: 61 · Example sentences: 122 / Dataset OK»; `node scripts/play-test.mjs` →
«547 comprobaciones OK / Todo verde» (juega una partida de cada modo en Chromium real).

L5 (evidencia, T2): logotipo generado desde un script propio (Catmull-Rom → curvas
Bézier), con máscara SVG para el hueco del nudo, y revisado como imagen a 128/64/40/32/20
px. Un intento anterior con halo de color de fondo se descartó porque dibujaba un contorno
oscuro alrededor de todo el lápiz en vez de sólo el hueco del cruce; la máscara funciona
sobre cualquier fondo. Se genera también `assets/icon-180.png` con `rsvg-convert`.

L6 (evidencia, T3): prueba de interacción con Chromium por DevTools: título con el nombre,
cabecera con logo cargado + nombre, árbol Primaria › 5º › Inglés/Francés, hojas «Verbos
irregulares» y «Colores», clic real sobre la tarjeta que pliega y despliega, `summary`
enfocable por teclado, enlace que navega al juego copiado y audio del juego que resuelve
desde la ruta anidada, sin errores de consola. Capturas revisadas a 900px y 390px.

L7 (resuelto): la actividad copiada decía «INGLÉS · 6º DE PRIMARIA» en su cabecera, su
`<title>` y su README. El usuario confirmó que la etiqueta correcta es 5º y que el error
venía del proyecto antiguo. Se corrigieron las cuatro menciones en la copia y otras
cuatro en `~/proyectos/verbos-irregulares`, que es de donde salían; ningún ejercicio,
actividad ni expectativa de las pruebas cambia. `play-test` en la copia tras el cambio:
«547 comprobaciones OK / Todo verde» (no comprueba la etiqueta).

L8 (estado): la carpeta nueva no es un repositorio git propio; cuelga de
`/home/pepe/proyectos`, donde todo está sin seguimiento. No se ha creado ningún repo ni
commit: eso lo decide el usuario. Tampoco se ha tocado `inicio.md`, `.inicio.md.kate-swp`
ni `.atl/`, que ya estaban en la carpeta.

L9 (resuelto, petición del usuario): «Crea el repo en github y pushea». La carpeta pasó a
ser su propio repositorio (`git init -b main`, identidad local `José G.
<45209323+chipironVacilon@users.noreply.github.com>`, `.gitignore` para `node_modules` y
ruido de editor) y se publicó en https://github.com/chipironVacilon/aprende-como-puedas
(público, rama `main`). Tres commits: `chore: start the repository`, `chore(actividades):
add the irregular-verbs activity as the first entry` y `feat(portal): add the Aprende como
puedas learning site`. El remoto tiene 328 ficheros y ningún `node_modules`, `.atl`,
fichero de intercambio ni repositorio anidado. La revisión nativa de la rebanada nueva se
evaluó antes de empujar: `nativeRisk: medium`, 8 rutas, 650 líneas, `reviewDue: false`
(`under_budget`), así que no hizo falta revisión.
