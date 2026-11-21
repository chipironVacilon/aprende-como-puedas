# Escribe la palabra · ajustes tras la revisión

Cierra los dos hallazgos no bloqueantes del revisor sobre el modo `write`
(`index.html`, modo «Escribe la palabra»). Sin funcionalidad nueva: corregir la
clave de respuestas de las preguntas de frase y hacer alcanzable y probado el
Enter para continuar.

## Specs

S1. Variantes de la misma forma en las preguntas de frase. Texto del revisor
    (reliability R3-1): «The sentence variant of the write mode derives its
    accepted answers from a single example's target form (accepted:
    formsOf(example.target)), so when the blank's form is a multi-variant list
    the answer key may not include every form the verb table lists; a child
    typing a different valid variant of the same form would be marked wrong.»
    Decisión: la frase manda — «I was at the park» no admite «were» —, así que la
    variante hermana NO cuenta como acierto, pero tampoco es un fallo mudo: se
    responde con un aviso que la nombra. El único verbo del dataset con variantes
    es `be` (`was / were`), con el ejemplo `I was at the park yesterday.`.

S2. Enter para continuar. Texto del revisor (reliability R3-3): «The keydown
    handler intercepts Enter inside the write input only when state.round.mode is
    'write', but the input has no keydown guard while answered; once answered the
    field is disabled so the browser will not deliver key events to it, meaning
    the Enter-to-next branch inside the handler is likely unreachable. The test
    only clicks next, so the 'press Enter to continue' behavior is asserted in the
    README but not proven in the tests.»

S3. Nada más cambia: ni el reparto de preguntas, ni la puntuación, ni los textos
    existentes de acierto y fallo.

## Tasks

- T1 · S1-S3 · inline · un solo commit con el arreglo y sus tests
  (`index.html` + `scripts/play-test.mjs`)

## Log

L1 (usuario, literal): «adelante con los cambios»

L2: Los hallazgos llegan de la revisión nativa `review-9ec3303036d79ffe`
(aprobada, autoridad quemada) sobre el commit `b4da226`.

L2 (sesión, cierre): T1 hecho. `round.answered.nearMiss` marca la variante hermana y el
aviso dice «Casi… toca «was», no «were»» en vez del mensaje genérico; al responder, el
cursor se va al botón de seguir. `node scripts/play-test.mjs` en verde: 848
comprobaciones, salida 0.
