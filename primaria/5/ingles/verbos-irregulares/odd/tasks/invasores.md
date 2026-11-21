# Invasores · un juego tipo Space Invaders

Un sexto modo de la actividad de verbos irregulares: una nave abajo, cuatro
marcianos arriba con cuatro palabras y el niño derriba el marciano que lleva la
forma correcta del verbo. El laberinto del marcianito se queda como está.

## Specs

S1. El juego. Texto literal del usuario: «crea un juego tipo space invaders para
    practicar en los verbos-irregulares». Un modo nuevo llamado **Invasores** que
    se juega en una sola pantalla: la nave del jugador abajo, una oleada de cuatro
    marcianos en fila arriba, cada marciano con una palabra en inglés. Arriba, en
    el marcador, se ve el verbo en infinitivo y qué forma se pide (pasado o
    participio). El juego es continuo, como el arcade del laberinto: no son diez
    preguntas, se juega hasta perder las tres vidas.

S2. Qué se pregunta. El verbo y las cuatro opciones salen del nivel elegido, con
    las mismas reglas que el resto de la actividad: en el nivel 1 solo el pasado y
    solo los diez verbos del nivel; en el nivel 2 las tres formas y los 61 verbos.
    En el nivel 2 la forma pedida alterna pasado y participio. Los cuatro verbos
    que se acaban de ver no vuelven, igual que en el arcade. Las tres opciones
    falsas nunca son otra forma del mismo verbo.

S3. Acertar. Derribar el marciano que lleva la forma correcta suma un punto, da
    una estrella (contador propio del modo), muestra un destello de acierto y suena
    el audio de esa forma. Acto seguido aparece un verbo nuevo con su oleada.

S4. Fallar. Derribar un marciano con una forma incorrecta cuesta una vida, tiñe el
    marciano de rojo y lo deshace; no suma punto ni estrella y la vida que queda se
    ve en el marcador. Se empieza con tres vidas y no hay pregunta nueva: el verbo
    sigue ahí hasta que se acierte o hasta que se acaben las vidas.

S5. La invasión. Los marcianos bajan despacio hacia la nave. Si la oleada llega a
    la altura del jugador, se pierde una vida y la oleada vuelve a su altura
    inicial; el verbo y las palabras no cambian. Es presión, no castigo: la partida
    solo termina cuando se acaban las vidas.

S6. Fin y récord. Con cero vidas la partida se acaba, se ve la puntuación, el
    récord propio del modo se guarda en el navegador junto al resto del perfil y el
    botón **Borrar progreso** también deja el récord a cero.

S7. Controles. Con teclado: las flechas izquierda y derecha mueven la nave y la
    barra espaciadora dispara (un disparo a la vez, el que está en el aire). Con el
    dedo, como el arcade: la almohadilla de la pantalla con «←», «→» y «Fuego», y
    además arrastrar el dedo sobre el campo mueve la nave. En el móvil se juega a
    pantalla completa con el botón **⤢ Pantalla completa**, igual que el arcade.

S8. Su sitio. El modo aparece como tarjeta **Invasores** en la pantalla de inicio
    de la actividad, con su color, su contador de estrellas y su explicación corta;
    respeta el nivel elegido y arranca con la misma cuenta atrás de tres segundos
    que el arcade, con el campo visible y todavía sin palabras.

S9. Nada más cambia. El arcade del laberinto, los modos de tarjetas, quiz, frases,
    escucha y escribir, la puntuación, el reparto de preguntas y el perfil guardado
    siguen exactamente igual. Un perfil viejo arranca con el récord y las estrellas
    de invasores a cero.

S10. Pruebas. `scripts/play-test.mjs` juega una partida de invasores en un Chromium
    real y comprueba: la cuenta atrás, que la nave se mueve con las flechas, que
    disparar al marciano correcto suma punto y estrella, que disparar a uno
    incorrecto quita una vida, y que al llegar a cero vidas la partida termina y el
    récord queda guardado. Cualquier error de consola hace fallar la tanda. La
    simulación (`invaders.js`) no toca el DOM ni el reloj: recibe el tiempo y un
    generador aleatorio, y se puede manejar desde la prueba.

S11. Documentación. El `README.md` de la actividad explica el modo nuevo junto a
    los otros (cómo se juega, qué se pregunta, controles con teclado y con el dedo)
    y el `README.md` de la raíz lo menciona en la línea de lo que hay hoy.

## Tasks

- T1 · S1-S6 · writer · simulación `invaders.js` (sin DOM, sin reloj propio)
- T2 · S7-S9 · writer · integración del modo en `index.html` (tarjeta, vista, HUD,
  canvas, controles, estrellas, récord, pantalla completa)
- T3 · S10-S11 · writer · pruebas en `scripts/play-test.mjs` y documentación en
  los dos `README.md`

## Log

L1 (usuario, literal): «crea un juego tipo space invaders para practicar en los
verbos-irregulares»

L2 (decisión del usuario, de la pregunta «¿Dónde entra el juego de invasores?»):
eligió «Modo nuevo junto al laberinto (recomendado)»: «Sexto modo de la actividad:
tarjeta «Invasores» en el inicio, estrellas propias, laberinto intacto.» El arcade
del laberinto no se toca.

L3 (nota de la sesión): `scripts/play-test.mjs` ya tenía cambios sin confirmar de
la tarea anterior (`escribir-ajustes.md`) al empezar esta; se conservan y las
pruebas nuevas se añaden al lado, sin reescribir lo que había.

L4 (sesión, cierre): T1, T2 y T3 hechos. `node scripts/play-test.mjs` en verde: 848
comprobaciones y salida 0. El repaso nativo aprobó el candidato
(`review-8768ebd0c80159e6`, lentes resiliencia, legibilidad y fiabilidad) con nueve
hallazgos no bloqueantes, anotados como trabajo posterior.

L5 (sesión, entrega): T1-T3 van en `faa2df0` (`feat(verbos-irregulares): add the
Invasores space-invaders mode`), encima de `b6f85ad` con el arreglo de escribir.
Empujado a `main` (`b4da226..faa2df0`).
