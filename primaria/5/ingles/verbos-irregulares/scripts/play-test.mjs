#!/usr/bin/env node
/*
 * End-to-end check of the game in a real browser, without a test framework.
 *
 *   node scripts/play-test.mjs [--shots <dir>]
 *
 * It boots headless Chromium through the DevTools protocol, plays a complete
 * round of every mode (right and wrong answers), opens the cards screen, and
 * fails on any console error or broken expectation. With --shots it also saves
 * PNG screenshots so a human can eyeball the design.
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pageUrl = `file://${join(root, "index.html")}`;
const VERBS = createRequire(import.meta.url)(join(root, "verbs.js"));

const shotsIndex = process.argv.indexOf("--shots");
const shotsDir = shotsIndex > -1 ? resolve(process.argv[shotsIndex + 1]) : null;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/snap/bin/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/firefox"
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error("No Chromium found (set CHROME_PATH)");

const failures = [];
const passes = [];
const check = (condition, label, detail) => {
  if (condition) passes.push(label);
  else failures.push(detail === undefined ? label : `${label} :: ${detail}`);
};

const profiles = await mkdtemp(join(tmpdir(), "ivg-profile-"));
const port = 9333 + (process.pid % 400);

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profiles}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--force-device-scale-factor=1",
    "--window-size=900,1250",
    "--allow-file-access-from-files",
    "--autoplay-policy=no-user-gesture-required",
    pageUrl
  ],
  { stdio: ["ignore", "pipe", "pipe"] }
);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function pageTarget() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error("Chromium DevTools endpoint never came up");
}

const target = await pageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((open, error) => {
  socket.addEventListener("open", open, { once: true });
  socket.addEventListener("error", error, { once: true });
});

let messageId = 0;
const pending = new Map();
const consoleErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve: done, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`${message.error.message}`));
    else done(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    consoleErrors.push(details.exception?.description || details.text);
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(" "));
  }
});

const send = (method, params = {}) => {
  const id = (messageId += 1);
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((done, reject) => {
    pending.set(id, { resolve: done, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 20000);
  });
};

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(
      `Page threw: ${response.exceptionDetails.exception?.description || response.exceptionDetails.text}`
    );
  }
  return response.result.value;
}

async function shot(name) {
  if (!shotsDir) return;
  await mkdir(shotsDir, { recursive: true });
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(shotsDir, `${name}.png`), Buffer.from(data, "base64"));
}

const waitFor = async (expression, label) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  check(false, `esperaba: ${label}`);
  return false;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 1250, deviceScaleFactor: 1, mobile: false });
await waitFor("!!window.IVG", "el juego arranca");

/* ---------------------------------------------------------------- home ---- */

const home = await evaluate(`(() => ({
  modes: document.querySelectorAll('.mode').length,
  arcadeCard: (document.querySelector('.mode--arcade') || {}).textContent || '',
  invadersCard: (document.querySelector('.mode--invaders') || {}).textContent || '',
  stars: document.getElementById('stat-stars').textContent,
  practiced: document.querySelector('.progress-card p').textContent,
  hasBanner: !!document.querySelector('.banner'),
  backHref: document.querySelector('.home-link')?.getAttribute('href') ?? null,
  brandLabel: document.querySelector('.brand').getAttribute('aria-label'),
  verbCount: IVG.verbs.length,
  level: IVG.profile.level,
  levels: [...document.querySelectorAll('[data-action=set-level]')].map((node) => ({
    level: node.dataset.level,
    pressed: node.getAttribute('aria-pressed')
  }))
}))()`);
check(home.modes === 7, "el inicio ofrece 7 modos", `encontrados ${home.modes}`);
check(
  home.invadersCard.includes("Invasores"),
  "el inicio ofrece el juego de invasores",
  home.invadersCard
);
check(
  home.arcadeCard.includes("Arcade"),
  "el inicio ofrece el arcade del marcianito",
  home.arcadeCard
);
check(home.verbCount === 61, "el juego carga los 61 verbos", `cargó ${home.verbCount}`);
check(home.levels.length === 2, "el inicio deja elegir nivel", JSON.stringify(home.levels));
check(home.level === 2, "por defecto se juega el nivel 2", `nivel ${home.level}`);
check(
  home.levels.find((node) => node.level === "2")?.pressed === "true",
  "el nivel 2 aparece marcado",
  JSON.stringify(home.levels)
);
check(home.practiced.includes(`de ${home.verbCount} verbos`), "la barra de progreso usa el total", home.practiced);
check(home.stars === "0", "empieza con 0 estrellas", home.stars);
check(
  home.backHref === "../../../../index.html",
  "la cabecera enlaza con el menú del proyecto",
  String(home.backHref)
);
check(
  existsSync(join(root, "../../../../index.html")),
  "el enlace al menú del proyecto apunta a un archivo real"
);
check(
  home.brandLabel === "Volver al menú de la actividad",
  "la cabecera distingue el menú de la actividad del menú del proyecto",
  String(home.brandLabel)
);
await shot("01-home");

/* --------------------------------------------------------------- nivel 1 ---- */

// The level 1 verb list, in the order the request gives it.
const LEVEL_ONE = ["awake", "be", "beat", "become", "begin", "bend", "bet", "bind", "bite", "bleed"];
const levelOneVerbs = LEVEL_ONE.map((base) => VERBS.find((verb) => verb.base === base));
// "was / were" is one option in the quiz, so the pool holds both the raw field
// and each of its variants.
const levelOnePastPool = new Set(
  levelOneVerbs.flatMap((verb) => [verb.past, ...verb.past.split("/").map((part) => part.trim())])
);

await evaluate(`document.querySelector('[data-action="set-level"][data-level="1"]').click()`);
await waitFor("IVG.profile.level === 1", "el nivel 1 queda seleccionado");
const savedLevel = await evaluate("JSON.parse(localStorage.getItem('verbos-irregulares-v1') || '{}').level");
check(savedLevel === 1, "el nivel elegido se guarda en el navegador", `guardado ${savedLevel}`);
await shot("02-nivel-1-inicio");

await evaluate("document.querySelector('[data-action=study]').click()");
await waitFor("!!document.querySelector('.verb-card')", "las tarjetas del nivel 1");

const levelOneStudy = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    labels: [...document.querySelectorAll('.form-row__label')].map((node) => node.textContent.trim()),
    values: [...document.querySelectorAll('.form-row__value')].map((node) => node.textContent.trim()),
    examples: document.querySelectorAll('.verb-card .example').length,
    index: [...document.querySelectorAll('.verb-grid button')].map((node) => node.textContent.trim()),
    chip: document.querySelector('.verb-card__top .chip').textContent.trim(),
    speaks: document.querySelectorAll('.verb-card [data-action=speak]').length
  }))()`)
);
check(
  levelOneStudy.labels.join(" | ") === "Infinitivo | Pasado",
  "nivel 1: la tarjeta solo muestra infinitivo y pasado",
  levelOneStudy.labels.join(" | ")
);
check(
  levelOneStudy.values.join(" | ") === "awake | awoke",
  "nivel 1: la primera tarjeta es awake / awoke",
  levelOneStudy.values.join(" | ")
);
check(levelOneStudy.examples === 1, "nivel 1: solo la frase en pasado", `${levelOneStudy.examples}`);
check(
  levelOneStudy.index.join(",") === LEVEL_ONE.join(","),
  "nivel 1: la lista tiene los 10 verbos del nivel",
  JSON.stringify(levelOneStudy.index)
);
check(levelOneStudy.chip.includes("de 10"), "nivel 1: la tarjeta cuenta 10 verbos", levelOneStudy.chip);
check(levelOneStudy.speaks === 3, "nivel 1: dos formas y una frase con audio", `${levelOneStudy.speaks}`);
await shot("03-nivel-1-tarjetas");

// Move the card pointer, then change level: the cards must start again.
await evaluate("document.querySelector('[data-action=study-next]').click()");
await evaluate("document.querySelector('[data-action=study-next]').click()");
const levelOneThird = await evaluate("document.querySelector('.form-row__value').textContent.trim()");
check(levelOneThird === "beat", "nivel 1: avanzar sigue el orden del nivel", levelOneThird);

await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('[data-action=\"set-level\"][data-level=\"2\"]')", "volver al inicio");
const levelOneHome = await evaluate("document.querySelector('.progress-card p').textContent");
check(levelOneHome.includes("de 10 verbos"), "nivel 1: el progreso cuenta 10 verbos", levelOneHome);

/* --------------------------------------------------------------- study ---- */

await evaluate(`document.querySelector('[data-action="set-level"][data-level="2"]').click()`);
await waitFor("IVG.profile.level === 2", "volver al nivel 2");
await evaluate("document.querySelector('[data-action=study]').click()");
await waitFor("document.querySelector('.verb-card') !== null", "la pantalla de tarjetas");

const study = await evaluate(`(() => ({
  forms: [...document.querySelectorAll('.form-row__value')].map(node => node.textContent.trim()),
  sentences: [...document.querySelectorAll('.example__es')].map(node => node.textContent.trim()),
  speaks: document.querySelectorAll('.speak').length
}))()`);
check(study.forms.join(" | ") === "be | was / were | been", "la tarjeta muestra las tres formas", study.forms.join(" | "));
check(study.sentences.length === 2 && study.sentences.every((text) => text.length > 3), "cada tarjeta trae dos traducciones", JSON.stringify(study.sentences));
check(study.speaks >= 5, "hay altavoces para formas y frases", `encontrados ${study.speaks}`);
await shot("02-tarjetas");

await evaluate("document.querySelector('[data-action=study-next]').click()");
const nextCard = await evaluate("document.querySelector('.form-row__value').textContent.trim()");
check(nextCard === "have", "siguiente tarjeta avanza al verbo siguiente", nextCard);

await evaluate(`(() => {
  const input = document.querySelector('[data-role=study-filter]');
  input.value = 'nadar';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const filtered = await evaluate("[...document.querySelectorAll('.verb-grid button')].map(node => node.textContent.trim())");
check(filtered.includes("swim") && filtered.length < 6, "el buscador filtra en español", JSON.stringify(filtered));

await evaluate(`(() => {
  const input = document.querySelector('[data-role=study-filter]');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);

/* --------------------------------------------------------- audio clips ---- */

// Every recorded clip ships with the game: verify they are all there.
const expectedClips = [];
for (const verb of VERBS) {
  expectedClips.push(
    join(root, "assets", "audio", verb.base, "base.mp3"),
    join(root, "assets", "audio", verb.base, "past.mp3"),
    join(root, "assets", "audio", verb.base, "participle.mp3"),
    join(root, "assets", "audio", verb.base, "example-1.mp3"),
    join(root, "assets", "audio", verb.base, "example-2.mp3")
  );
}
const missingClips = expectedClips.filter((path) => !existsSync(path));
check(missingClips.length === 0, `los ${expectedClips.length} clips grabados existen`, `faltan ${missingClips.length}`);

const clipTotal = readdirSync(join(root, "assets", "audio")).reduce((sum, verbDir) => {
  const verbPath = join(root, "assets", "audio", verbDir);
  return sum + readdirSync(verbPath).filter((file) => file.endsWith(".mp3")).length;
}, 0);
check(clipTotal === expectedClips.length, "no hay clips de más ni de menos", `hay ${clipTotal}`);

await waitFor("IVG.player.fileMode !== null", "la prueba de audio del arranque");
const audioBoot = await evaluate("IVG.player.fileMode");
check(audioBoot === true, "el navegador reproduce los clips grabados", `fileMode=${audioBoot}`);

// The cards screen must wire every speaker button to real files.
await evaluate("location.hash = '#study'");
await waitFor("!!document.querySelector('.verb-card')", "tarjetas para el audio");
const studyAudio = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    buttons: [...document.querySelectorAll('[data-action=speak]')].map(button => JSON.parse(button.dataset.clips || '[]')),
    noBanner: !document.querySelector('.banner')
  }))()`)
);
check(studyAudio.buttons.length === 5, "la tarjeta tiene 5 botones de audio", `${studyAudio.buttons.length}`);
check(
  studyAudio.buttons.every((clips) => clips.length > 0 && existsSync(join(root, clips[0]))),
  "cada botón apunta a un fichero que existe",
  JSON.stringify(studyAudio.buttons)
);
check(studyAudio.noBanner, "sin aviso de audio cuando los clips existen");

await evaluate("document.querySelector('[data-action=speak]').click()");
await new Promise((done) => setTimeout(done, 400));
const afterClick = await evaluate("IVG.player.fileMode");
check(afterClick === true, "al pulsar 🔊 suenan los clips grabados", `fileMode=${afterClick}`);

// Regression: stopping a playing clip used to poison the player state
// (empty src fired a media error that permanently downgraded to synth).
await evaluate("document.querySelector('[data-action=speak]').click()");
await new Promise((done) => setTimeout(done, 200));
await evaluate("document.querySelector('[data-action=speak]').click()");
await new Promise((done) => setTimeout(done, 200));
const afterSpam = await evaluate("IVG.player.fileMode");
check(afterSpam === true, "repetir el clic no degrada a la voz del navegador", `fileMode=${afterSpam}`);

await evaluate(`(() => {
  document.querySelector('[data-action=speak]').click();
  document.querySelector('.study-nav [data-action=study-next]').click();
  return true;
})()`);
const afterNavigation = await evaluate("IVG.player.fileMode");
check(afterNavigation === true, "navegar con audio en marcha no degrada el reproductor", `fileMode=${afterNavigation}`);
await evaluate("document.querySelector('[data-action=speak]').click()");
const stillTrue = await evaluate("IVG.player.fileMode");
check(stillTrue === true, "después de navegar los clips siguen sonando", `fileMode=${stillTrue}`);

// A missing clip must fall back to the browser voice for that clip only:
// the recorded clips of the rest of the game keep playing.
const fakeResult = await evaluate(`(() => new Promise((done) => {
  IVG.player.say(['assets/audio/no-existe.mp3'], 'docs');
  setTimeout(() => done(JSON.stringify({
    fileMode: IVG.player.fileMode,
    missing: IVG.player.missing
  })), 1200);
}))()`);
const fake = JSON.parse(fakeResult);
check(fake.fileMode === true, "un clip que falta no apaga las grabaciones del resto", JSON.stringify(fake));
check(
  fake.missing.includes("assets/audio/no-existe.mp3"),
  "el clip que falta se recuerda",
  JSON.stringify(fake.missing)
);
await evaluate("document.querySelector('[data-action=speak]').click()");
const afterMissing = await evaluate("IVG.player.fileMode");
check(afterMissing === true, "después de un clip roto los grabados siguen sonando", `fileMode=${afterMissing}`);

// Every speaker button must carry one text per clip, so a broken recording is
// read with its own words instead of the whole fallback sentence repeated.
const wiring = JSON.parse(
  await evaluate(`(() => JSON.stringify(
    [...document.querySelectorAll('[data-action=speak]')].map((button) => ({
      clips: JSON.parse(button.dataset.clips || '[]').length,
      texts: JSON.parse(button.dataset.clipTexts || '[]').length
    }))
  ))()`)
);
check(wiring.length > 0, "hay botones de audio que revisar", `${wiring.length}`);
check(
  wiring.every((entry) => entry.texts === entry.clips && entry.clips > 0),
  "cada botón trae un texto por clip",
  JSON.stringify(wiring)
);

// A missing clip must not stall the queue: the recording behind it still plays.
const drained = JSON.parse(
  await evaluate(`(() => new Promise((done) => {
    const before = IVG.player.played;
    IVG.player.say([
      { clip: 'assets/audio/no-existe-2.mp3', text: 'docs' },
      { clip: 'assets/audio/be/base.mp3', text: 'be' }
    ], 'be');
    const started = Date.now();
    const poll = () => {
      if (IVG.player.pending === 0 || Date.now() - started > 8000) {
        done(JSON.stringify({
          pending: IVG.player.pending,
          played: IVG.player.played - before,
          waited: Date.now() - started
        }));
        return;
      }
      setTimeout(poll, 100);
    };
    setTimeout(poll, 100);
  }))()`)
);
check(drained.pending === 0, "un clip que falta no traba la cola de audio", JSON.stringify(drained));
check(drained.played === 1, "y suena la grabación que venía detrás", JSON.stringify(drained));

/* ------------------------------------------------------- rondas nivel 1 ---- */

async function playLevelOneRound(mode) {
  await evaluate("document.querySelector('[data-action=home]').click()");
  await waitFor("!!document.querySelector('.mode')", "inicio antes de la ronda de nivel 1");
  await evaluate(`document.querySelector('[data-action="set-level"][data-level="1"]').click()`);
  await waitFor("IVG.profile.level === 1", "nivel 1 antes de la ronda");
  await evaluate(`document.querySelector('[data-mode=${mode}]').click()`);
  await waitFor(
    `IVG.state.round && IVG.state.round.mode === '${mode}'`,
    `arranca ${mode} en nivel 1`
  );

  const items = JSON.parse(
    await evaluate(`(() => JSON.stringify(IVG.state.round.items.map((item) => ({
      form: item.form,
      verb: item.verb.base,
      options: item.options,
      correct: item.correct,
      prompt: item.prompt,
      sub: item.sub,
      sentence: item.sentence || ""
    }))))()`)
  );
  const allowedPool = mode === "listen" ? new Set(LEVEL_ONE) : levelOnePastPool;

  check(items.length === 10, `nivel 1 ${mode}: 10 preguntas, una por verbo`, `${items.length}`);
  check(
    items.every((item) => item.form === "past"),
    `nivel 1 ${mode}: solo se practica el pasado`,
    JSON.stringify(items.map((item) => item.form))
  );
  check(
    items.every((item) => LEVEL_ONE.includes(item.verb)),
    `nivel 1 ${mode}: solo los 10 verbos del nivel`,
    JSON.stringify(items.map((item) => item.verb))
  );
  check(
    items.every((item) => item.options.length === 4 && allowedPool.has(item.correct)),
    `nivel 1 ${mode}: la respuesta es del pasado del nivel`,
    JSON.stringify(items[0])
  );
  check(
    items.every((item) => item.options.every((option) => allowedPool.has(option))),
    `nivel 1 ${mode}: no se cuelan formas ni verbos de fuera`,
    JSON.stringify(items[0].options)
  );
  if (mode === "quiz") {
    check(
      items.every((item) => item.prompt.includes("pasado") && !item.prompt.includes("participio")),
      "nivel 1 quiz: nunca pide el participio",
      items[0].prompt
    );
  }
  if (mode === "gaps") {
    check(
      items.every((item) => !/\b(has|have)\b/i.test(item.sentence)),
      "nivel 1 frases: nunca usa el presente perfecto",
      items[0].sentence
    );
  }

  const firstIndex = items[0].options.indexOf(items[0].correct);
  await evaluate(`document.querySelectorAll('.option')[${firstIndex}].click()`);
  const correction = JSON.parse(
    await evaluate(`(() => JSON.stringify({
      labels: [...document.querySelectorAll('.feedback .trio i')].map((node) => node.textContent.trim()),
      audio: JSON.parse(document.querySelector('.feedback .trio [data-action=speak]').dataset.clips)
    }))()`)
  );
  check(
    correction.labels.join(" | ") === "Infinitivo | Pasado",
    `nivel 1 ${mode}: la corrección enseña dos formas`,
    correction.labels.join(" | ")
  );
  check(
    correction.audio.length === 2 && correction.audio.every((clip) => !clip.includes("participle")),
    `nivel 1 ${mode}: la corrección suena sin participio`,
    JSON.stringify(correction.audio)
  );
  if (mode === "quiz") await shot("04-nivel-1-quiz");

  for (let question = 1; question < items.length; question += 1) {
    await evaluate("document.querySelector('[data-action=next]').click()");
    const index = await evaluate("IVG.state.round.items[IVG.state.round.index].options.indexOf(IVG.state.round.items[IVG.state.round.index].correct)");
    await evaluate(`document.querySelectorAll('.option')[${index}].click()`);
  }
  await evaluate("document.querySelector('[data-action=next]').click()");
  const result = await evaluate("document.querySelector('.result__score').textContent");
  check(result.includes("10"), `nivel 1 ${mode}: se puede terminar la ronda`, result);
  await shot(`05-nivel-1-${mode}-resultado`);
}

await playLevelOneRound("quiz");
await playLevelOneRound("gaps");
await playLevelOneRound("listen");

const afterLevelOne = JSON.parse(
  await evaluate("JSON.stringify({ stars: IVG.profile.stars, rounds: IVG.profile.rounds })")
);
check(afterLevelOne.rounds === 3, "nivel 1: las rondas jugadas se cuentan", `${afterLevelOne.rounds}`);
check(afterLevelOne.stars === 30, "nivel 1: las estrellas se guardan igual", `${afterLevelOne.stars}`);

await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio después del nivel 1");
await evaluate(`document.querySelector('[data-action="set-level"][data-level="2"]').click()`);
await waitFor("IVG.profile.level === 2", "volver al nivel 2 para el resto de pruebas");

/* ---------------------------------------------------------- every mode ---- */

const baseline = JSON.parse(
  await evaluate("JSON.stringify({ stars: IVG.profile.stars, rounds: IVG.profile.rounds })")
);

async function playRound(mode, { correctCount }) {
  await evaluate("location.hash = ''");
  await evaluate("document.querySelector('[data-action=home]').click()");
  await waitFor("!!document.querySelector('.mode')", "volver al inicio");

  await evaluate(`document.querySelector('[data-mode=${mode}]').click()`);
  await waitFor(
    `IVG.state.round && IVG.state.round.mode === '${mode}' && IVG.state.view === 'play'`,
    `arranca el modo ${mode}`
  );

  const total = await evaluate("IVG.state.round.items.length");
  check(total === 10, `${mode}: la ronda tiene 10 preguntas`, `tiene ${total}`);

  let expectedScore = 0;
  const missed = [];

  for (let question = 0; question < total; question += 1) {
    const snapshot = JSON.parse(
      await evaluate(`(() => {
        const round = IVG.state.round;
        const item = round.items[round.index];
        return JSON.stringify({
          index: round.index,
          correct: item.correct,
          options: item.options,
          mode: round.mode,
          sentence: item.sentence || "",
          renderedSentence: (document.querySelector('.sentence') || {}).textContent || "",
          translation: (document.querySelector('.translation') || {}).textContent || "",
          hasBlank: !!document.querySelector('.sentence .blank'),
          optionCount: document.querySelectorAll('.option').length
        });
      })()`)
    );

    check(snapshot.optionCount === 4, `${mode}: cuatro opciones por pregunta`, `${snapshot.optionCount}`);
    check(
      snapshot.options.filter((option) => option === snapshot.correct).length === 1,
      `${mode}: la respuesta aparece una sola vez`,
      JSON.stringify(snapshot.options)
    );
    if (mode === "gaps") {
      check(snapshot.hasBlank, "frases: la frase muestra el hueco", snapshot.sentence);
      check(
        snapshot.renderedSentence.includes("?") && !snapshot.renderedSentence.includes("____"),
        "frases: el hueco se pinta como hueco",
        snapshot.renderedSentence
      );
      check(snapshot.renderedSentence.length > 12, "frases: la frase se lee entera", snapshot.renderedSentence);
      check(
        snapshot.translation.length > 8,
        "frases: la traducción aparece antes de responder",
        snapshot.translation
      );
    }
    if (question === 0) await shot(`03-${mode}-pregunta`);

    const wantsRight = question < correctCount;
    const index = wantsRight
      ? snapshot.options.indexOf(snapshot.correct)
      : snapshot.options.findIndex((option) => option !== snapshot.correct);

    await evaluate(`document.querySelectorAll('.option')[${index}].click()`);

    const after = JSON.parse(
      await evaluate(`(() => {
        const round = IVG.state.round;
        return JSON.stringify({
          score: round.score,
          streak: round.streak,
          answered: round.answered,
          feedback: (document.querySelector('.feedback__head') || {}).textContent || "",
          correctButtons: document.querySelectorAll('.option.is-correct').length,
          wrongButtons: document.querySelectorAll('.option.is-wrong').length,
          disabled: [...document.querySelectorAll('.option')].every(button => button.disabled),
          starsShown: document.querySelector('.round-top .stat:last-child b').textContent,
          hasTranslation: !!document.querySelector('.feedback .example__es'),
          hasSentence: !!document.querySelector('.feedback .example__en span')
        });
      })()`)
    );

    if (wantsRight) {
      expectedScore += 1;
      check(after.score === expectedScore, `${mode}: suma un acierto`, `score ${after.score} ≠ ${expectedScore}`);
      check(after.feedback.includes("Muy bien"), `${mode}: el acierto se celebra`, after.feedback);
    } else {
      missed.push(snapshot.correct);
      check(after.streak === 0, `${mode}: fallar reinicia la racha`, `racha ${after.streak}`);
      check(after.feedback.includes("Casi"), `${mode}: el fallo dice cuál era`, after.feedback);
    }
    check(after.correctButtons === 1, `${mode}: se marca la opción correcta`, `${after.correctButtons}`);
    check(after.wrongButtons === (wantsRight ? 0 : 1), `${mode}: se marca el fallo`, `${after.wrongButtons}`);
    check(after.disabled, `${mode}: las opciones se bloquean al responder`);
    check(after.hasTranslation, `${mode}: la corrección trae traducción`);
    check(after.hasSentence, `${mode}: la corrección trae la frase en inglés`);

    await evaluate("document.querySelector('.option.is-dim')?.click()");
    const unchanged = await evaluate("IVG.state.round.score");
    check(unchanged === expectedScore, `${mode}: responder dos veces no suma de más`, `score ${unchanged}`);

    if (question === 0) await shot(`04-${mode}-correccion`);

    await evaluate("document.querySelector('[data-action=next]').click()");
  }

  const result = JSON.parse(
    await evaluate(`(() => JSON.stringify({
      title: document.querySelector('.result h2').textContent,
      score: document.querySelector('.result__score').textContent,
      review: (document.querySelector('.result__review') || {}).textContent || "",
      actions: document.querySelectorAll('.result__actions button').length
    }))()`)
  );
  check(result.score.includes(`${expectedScore}`), `${mode}: el resultado cuenta los aciertos`, result.score);
  check(result.actions === 3, `${mode}: el resultado ofrece volver a jugar`, `${result.actions}`);
  check(
    missed.length === 0 || result.review.length > 0,
    `${mode}: los fallos aparecen como repaso`,
    result.review
  );
  if (mode === "quiz") await shot("05-resultado");
  return expectedScore;
}

/* ------------------------------------------------------------ escribir ---- */

/**
 * The writing mode has nothing to click: the answer is typed. The round must
 * accept what a child types, say the word and its sentence out loud once the
 * answer is in, and refuse an empty box instead of spending the question.
 */
async function playWriteRound({ correctCount }) {
  await evaluate("location.hash = ''");
  await evaluate("document.querySelector('[data-action=home]').click()");
  await waitFor("!!document.querySelector('.mode')", "volver al inicio");

  const card = await evaluate(
    "(document.querySelector('[data-mode=write] b') || {}).textContent || ''"
  );
  check(card.length > 0, "el menú ofrece el modo de escribir", card);

  await evaluate("document.querySelector('[data-mode=write]').click()");
  await waitFor(
    "IVG.state.round && IVG.state.round.mode === 'write' && IVG.state.view === 'play'",
    "arranca el modo escribir"
  );

  const total = await evaluate("IVG.state.round.items.length");
  check(total === 10, "escribir: la ronda tiene 10 preguntas", `${total}`);

  // What the mode asks to play is the point of the mode: listen to the request.
  await evaluate(`(() => {
    window.__said = [];
    window.__sayReal = IVG.player.say;
    IVG.player.say = (clips, text) => {
      window.__said.push({ clips: (clips || []).map((entry) => entry.clip || entry), text });
      return window.__sayReal.call(IVG.player, clips, text);
    };
    return true;
  })()`);

  let expectedScore = 0;
  let formQuestions = 0;
  let sentenceQuestions = 0;
  const missed = [];

  for (let question = 0; question < total; question += 1) {
    const snapshot = JSON.parse(
      await evaluate(`(() => {
        const round = IVG.state.round;
        const item = round.items[round.index];
        return JSON.stringify({
          base: item.verb.base,
          form: item.form,
          correct: item.correct,
          accepted: item.accepted,
          hasSentence: typeof item.sentence === 'string',
          sentence: item.sentence || '',
          en: (item.example || {}).en || '',
          renderedSentence: (document.querySelector('.sentence') || {}).textContent || '',
          prompt: document.querySelector('.prompt h2').textContent,
          optionCount: document.querySelectorAll('.option').length,
          inputCount: document.querySelectorAll('[data-role=write-input]').length,
          focused: document.activeElement === document.querySelector('[data-role=write-input]')
        });
      })()`)
    );

    if (snapshot.hasSentence) sentenceQuestions += 1;
    else formQuestions += 1;

    check(snapshot.optionCount === 0, "escribir: no hay opciones que pulsar", `${snapshot.optionCount}`);
    check(snapshot.inputCount === 1, "escribir: hay una casilla para escribir", `${snapshot.inputCount}`);
    check(snapshot.focused, "escribir: la casilla recibe el cursor");
    check(
      snapshot.accepted.length > 0 && snapshot.accepted.every((word) => typeof word === "string" && word.length > 0),
      "escribir: la pregunta sabe qué respuestas valen",
      JSON.stringify(snapshot.accepted)
    );
    if (snapshot.hasSentence) {
      check(
        snapshot.sentence.includes("____") && snapshot.renderedSentence.includes("?"),
        "escribir: la frase muestra el hueco",
        snapshot.renderedSentence
      );
      check(
        snapshot.en.toLowerCase().includes(snapshot.correct.toLowerCase()),
        "escribir: el hueco es una forma del verbo",
        `${snapshot.correct} en ${snapshot.en}`
      );
    } else {
      check(snapshot.renderedSentence.length === 0, "escribir: la pregunta de forma no trae frase");
      check(snapshot.prompt.length > 8, "escribir: la pregunta de forma dice qué escribir", snapshot.prompt);
    }
    if (question === 0) await shot("03-write-pregunta");

    // A stray Enter on an empty box must not spend the question.
    const before = await evaluate("IVG.state.round.score");
    await evaluate(`(() => {
      document.querySelector('[data-role=write-input]').value = '   ';
      document.querySelector('[data-action=check]').click();
      return true;
    })()`);
    const empty = JSON.parse(
      await evaluate(`(() => JSON.stringify({
        answered: !!IVG.state.round.answered,
        score: IVG.state.round.score,
        hasFeedback: !!document.querySelector('.feedback')
      }))()`)
    );
    check(!empty.answered && !empty.hasFeedback, "escribir: una casilla vacía no responde", JSON.stringify(empty));
    check(empty.score === before, "escribir: lo vacío no cambia la puntuación", `${empty.score}`);

    const wantsRight = question < correctCount;
    // A child's keyboard: capitals, a spare space and a full stop still count.
    const typed = wantsRight ? ` ${snapshot.accepted[snapshot.accepted.length - 1].toUpperCase()} ` : "zzz";
    // Half the round answers with the Enter key, half with the button.
    const byKeyboard = question % 2 === 0;

    await evaluate(`(() => {
      const field = document.querySelector('[data-role=write-input]');
      field.value = ${JSON.stringify(typed)};
      if (${byKeyboard}) {
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      } else {
        document.querySelector('[data-action=check]').click();
      }
      return true;
    })()`);
    if (byKeyboard) {
      check(await evaluate("!!document.querySelector('.feedback')"), "escribir: Enter comprueba lo escrito");
    }

    const after = JSON.parse(
      await evaluate(`(() => {
        const round = IVG.state.round;
        const field = document.querySelector('[data-role=write-input]');
        return JSON.stringify({
          score: round.score,
          streak: round.streak,
          feedback: (document.querySelector('.feedback__head') || {}).textContent || '',
          written: (document.querySelector('.feedback p') || {}).textContent || '',
          fieldClass: field ? field.className : '',
          disabled: field ? field.disabled : false,
          said: window.__said.length,
          last: window.__said[window.__said.length - 1] || null,
          hasTrio: !!document.querySelector('.feedback .trio'),
          hasTranslation: !!document.querySelector('.feedback .example__es')
        });
      })()`)
    );

    if (wantsRight) {
      expectedScore += 1;
      check(after.score === expectedScore, "escribir: suma un acierto", `score ${after.score} ≠ ${expectedScore}`);
      check(after.feedback.includes("Muy bien"), "escribir: el acierto se celebra", after.feedback);
      check(after.fieldClass.includes("is-correct"), "escribir: la casilla se pinta de acierto", after.fieldClass);
    } else {
      missed.push(snapshot.correct);
      check(after.streak === 0, "escribir: fallar reinicia la racha", `racha ${after.streak}`);
      check(after.feedback.includes("Casi"), "escribir: el fallo dice cuál era", after.feedback);
      check(after.fieldClass.includes("is-wrong"), "escribir: la casilla se pinta de fallo", after.fieldClass);
    }

    check(after.written.includes(typed.trim()), "escribir: la corrección repite lo escrito", after.written);
    check(after.disabled, "escribir: la casilla se bloquea al responder");
    check(
      await evaluate("document.activeElement === document.querySelector('[data-action=next]')"),
      "escribir: al responder el cursor va al botón de seguir"
    );
    check(after.hasTrio, "escribir: la corrección trae las formas del verbo");
    check(after.hasTranslation, "escribir: la corrección trae traducción");

    // The reason the activity exists: the word and its sentence are said aloud.
    check(after.said === question + 1, "escribir: cada respuesta pide audio", `${after.said}`);
    const clips = after.last ? after.last.clips : [];
    check(clips.length === 2, "escribir: suena la palabra y la frase", JSON.stringify(clips));
    check(
      clips[0] === `assets/audio/${snapshot.base}/${snapshot.form}.mp3`,
      "escribir: primero suena la palabra escrita",
      `${clips[0]}`
    );
    check(
      clips[1] === `assets/audio/${snapshot.base}/example-1.mp3` ||
        clips[1] === `assets/audio/${snapshot.base}/example-2.mp3`,
      "escribir: después suena su frase de ejemplo",
      `${clips[1]}`
    );
    check(
      clips.every((clip) => existsSync(join(root, clip))),
      "escribir: los dos audios existen",
      JSON.stringify(clips.filter((clip) => !existsSync(join(root, clip))))
    );
    check(
      typeof after.last.text === "string" && after.last.text.length > 0,
      "escribir: hay voz de reserva si falta el audio",
      `${after.last && after.last.text}`
    );

    await evaluate("document.querySelector('[data-action=check]')?.click()");
    const unchanged = await evaluate("IVG.state.round.score");
    check(unchanged === expectedScore, "escribir: responder dos veces no suma de más", `score ${unchanged}`);

    if (question === 0) await shot("04-write-correccion");

    const indexBefore = await evaluate("IVG.state.round.index");
    await evaluate(`(() => {
      if (${byKeyboard}) {
        // Exactly what a second Enter does: the answer is in, the button has the focus.
        (document.activeElement || document.body).dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
      } else {
        document.querySelector('[data-action=next]').click();
      }
      return true;
    })()`);
    const indexAfter = await evaluate("IVG.state.round.index");
    check(
      indexAfter === indexBefore + 1,
      "escribir: cada avance va a una sola pregunta",
      `${indexBefore} → ${indexAfter}`
    );
  }

  check(formQuestions > 0 && sentenceQuestions > 0, "escribir: la ronda mezcla formas y frases", `${formQuestions} + ${sentenceQuestions}`);

  const result = JSON.parse(
    await evaluate(`(() => JSON.stringify({
      score: document.querySelector('.result__score').textContent,
      review: (document.querySelector('.result__review') || {}).textContent || '',
      actions: document.querySelectorAll('.result__actions button').length,
      replay: document.querySelector('.result__actions [data-mode=write]') ? true : false
    }))()`)
  );
  check(result.score.includes(`${expectedScore}`), "escribir: el resultado cuenta los aciertos", result.score);
  check(result.actions === 3, "escribir: el resultado ofrece volver a jugar", `${result.actions}`);
  check(result.replay, "escribir: se puede repetir la ronda");
  check(missed.length === 0 || result.review.length > 0, "escribir: los fallos aparecen como repaso", result.review);

  // Leave the player exactly as this mode found it.
  await evaluate(`(() => {
    IVG.player.stop();
    if (window.__sayReal) IVG.player.say = window.__sayReal;
    delete window.__sayReal;
    return true;
  })()`);

  return expectedScore;
}

/**
 * "was" and "were" are both past of "be", but only one fits the sentence. The
 * mode must keep the answer key honest (the sentence picks the word) and still
 * name the near miss, instead of dropping it into the generic wrong answer.
 */
async function checkVariantNearMiss() {
  const be = VERBS.find((verb) => verb.base === "be");
  const bePast = be.examples.find((example) => example.form === "past");
  // Level 1 has ten verbs and a round is ten questions: "be" is always there.
  const crafted = JSON.stringify({
    verb: be,
    form: "past",
    correct: "was",
    accepted: ["was"],
    variants: ["was", "were"],
    sentence: "I ____ at the park yesterday.",
    example: bePast
  });

  await evaluate("location.hash = ''");
  await evaluate("document.querySelector('[data-action=home]').click()");
  await waitFor("!!document.querySelector('.mode')", "inicio antes de la variante");
  await evaluate(`document.querySelector('[data-action="set-level"][data-level="1"]').click()`);
  await waitFor("IVG.profile.level === 1", "nivel 1 para la variante");
  await evaluate("document.querySelector('[data-mode=write]').click()");
  await waitFor("IVG.state.round && IVG.state.round.mode === 'write'", "ronda de escribir en nivel 1");

  // One sentence question for "be", typed in and answered, whatever came up.
  const typeAndSend = (word) =>
    evaluate(`(() => {
      const round = IVG.state.round;
      Object.assign(round.items[round.index], ${crafted});
      round.answered = null;
      IVG.rerender();
      const field = document.querySelector('[data-role=write-input]');
      field.value = ${JSON.stringify(word)};
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    })()`);

  const before = JSON.parse(
    await evaluate(`(() => JSON.stringify({
      score: IVG.state.round.score,
      answered: !!IVG.state.round.answered,
      input: document.querySelectorAll('[data-role=write-input]').length,
      sentence: ((document.querySelector('.sentence') || {}).textContent || '').trim()
    }))()`)
  );
  check(before.input === 1, "variante: la pregunta de frase se pinta para escribir", `${before.input}`);

  await typeAndSend("were");
  const near = JSON.parse(
    await evaluate(`(() => JSON.stringify({
      score: IVG.state.round.score,
      streak: IVG.state.round.streak,
      nearMiss: Boolean(IVG.state.round.answered && IVG.state.round.answered.nearMiss),
      feedback: (document.querySelector('.feedback__head') || {}).textContent || ''
    }))()`)
  );
  check(near.score === before.score, "variante: «were» no acierta en la frase de «was»", `${near.score}`);
  check(near.streak === 0, "variante: la variante hermana reinicia la racha", `${near.streak}`);
  check(near.nearMiss, "variante: el fallo se marca como variante cercana");
  check(near.feedback.includes("toca «was»"), "variante: el aviso dice qué palabra toca", near.feedback);
  check(near.feedback.includes("no «were»"), "variante: el aviso nombra lo escrito", near.feedback);
  check(!near.feedback.includes("la respuesta era"), "variante: no cae en el aviso genérico", near.feedback);

  await typeAndSend("was");
  const right = JSON.parse(
    await evaluate(`(() => JSON.stringify({
      score: IVG.state.round.score,
      feedback: (document.querySelector('.feedback__head') || {}).textContent || ''
    }))()`)
  );
  check(right.score === before.score + 1, "variante: «was» sí acierta en su frase", `${right.score}`);
  check(right.feedback.includes("Muy bien"), "variante: el acierto se celebra", right.feedback);

  // Leave the game as it was found.
  await evaluate("document.querySelector('[data-action=home]').click()");
  await waitFor("!!document.querySelector('.mode')", "inicio antes de volver al nivel 2");
  await evaluate(`document.querySelector('[data-action="set-level"][data-level="2"]').click()`);
  await waitFor("IVG.profile.level === 2", "vuelta al nivel 2");

  return 1;
}

const quizScore = await playRound("quiz", { correctCount: 8 });
const gapsScore = await playRound("gaps", { correctCount: 6 });
const listenScore = await playRound("listen", { correctCount: 10 });
const writeScore = await playWriteRound({ correctCount: 7 });
const variantStars = await checkVariantNearMiss();

const totals = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    stars: IVG.profile.stars,
    bestStreak: IVG.profile.bestStreak,
    rounds: IVG.profile.rounds,
    stored: JSON.parse(localStorage.getItem('verbos-irregulares-v1') || '{}').stars,
    header: document.getElementById('stat-stars').textContent
  }))()`)
);
check(
  totals.stars === baseline.stars + quizScore + gapsScore + listenScore + writeScore + variantStars,
  "las estrellas se acumulan entre rondas",
  JSON.stringify(totals)
);
check(totals.stored === totals.stars, "las estrellas se guardan en el navegador", JSON.stringify(totals));
check(totals.rounds === baseline.rounds + 4, "se cuentan las rondas jugadas", `${totals.rounds}`);

/* --------------------------------------------------------------- arcade ---- */

const ARROW_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

/** Live arcade state: HUD, verb on top, words on the board, alien and monsters. */
const arcadeSnapshot = () =>
  evaluate(`(() => {
    const session = IVG.arcade;
    const game = session.game;
    const canvas = document.querySelector('.arcade__canvas');
    const verbNode = document.querySelector('.arcade__verb');
    const ctx = canvas && canvas.getContext('2d');
    let painted = 0;
    if (ctx) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixels.length; index += 4 * 97) {
        if (pixels[index] > 0) painted += 1;
      }
    }
    return JSON.stringify({
      view: IVG.state.view,
      target: session.target.base,
      past: session.target.past,
      score: session.score,
      stars: IVG.profile.stars,
      best: IVG.profile.arcadeBest,
      rounds: IVG.profile.rounds,
      hudVerb: verbNode ? verbNode.textContent : '',
      hudLang: verbNode ? verbNode.getAttribute('lang') : '',
      points: (document.querySelector('.arcade__points') || {}).textContent || '',
      hint: (document.querySelector('.arcade__hint') || {}).textContent || '',
      words: game.words.map((word) => ({ r: word.r, c: word.c, text: word.text, correct: word.correct })),
      player: { r: game.player.r, c: game.player.c },
      power: Math.round(game.power),
      monsters: game.monsters.length,
      painted,
      canvasWidth: canvas ? canvas.width : 0
    });
  })()`);

/** Next direction the alien would take to reach one tile. */
async function arcadeDirectionTo(goal) {
  const raw = await evaluate(`(() => {
    const game = IVG.arcade.game;
    return JSON.stringify({
      dir: ArcadeGame.stepTowards({ r: game.player.r, c: game.player.c }, { r: ${goal.r}, c: ${goal.c} }),
      r: game.player.r,
      c: game.player.c,
      over: game.over
    });
  })()`);
  return JSON.parse(raw);
}

/** Walk the alien to a tile with real arrow keys, one tile at a time. */
async function walkArcadeTo(goal, budget = 60) {
  for (let step = 0; step < budget; step += 1) {
    const spot = await arcadeDirectionTo(goal);
    if (spot.r === goal.r && spot.c === goal.c) return true;
    if (spot.over || !spot.dir) return false;
    await evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: '${ARROW_KEYS[spot.dir]}', bubbles: true, cancelable: true }))`
    );
    await sleep(260);
  }
  return false;
}

await evaluate("location.hash = ''");
await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio antes del arcade");

/* ------------------------------------------- estrellas en cada tarjeta ---- */

// Every test card carries, on its right, the stars that test has earned.
// Level 1 gave 10 to each test, and the level 2 rounds gave 8, 6 and 10.
const cardStars = JSON.parse(
  await evaluate(`(() => {
    const count = (mode) => {
      const badge = document.querySelector('.mode--' + mode + ' .mode__stars');
      return badge ? Number(badge.querySelector('b').textContent) : null;
    };
    return JSON.stringify({
      quiz: count('quiz'),
      gaps: count('gaps'),
      listen: count('listen'),
      write: count('write'),
      arcade: count('arcade'),
      invaders: count('invaders'),
      study: document.querySelectorAll('.mode--study .mode__stars').length,
      labels: [...document.querySelectorAll('.mode__stars')].map((node) => node.getAttribute('aria-label'))
    });
  })()`)
);
check(
  cardStars.quiz === 18 && cardStars.gaps === 16 && cardStars.listen === 20,
  "cada prueba muestra a la derecha las estrellas que ha ganado",
  JSON.stringify(cardStars)
);
check(cardStars.arcade === 0, "el arcade arranca con 0 estrellas en su tarjeta", `${cardStars.arcade}`);
check(cardStars.invaders === 0, "invasores arranca con 0 estrellas en su tarjeta", `${cardStars.invaders}`);
check(
  cardStars.write === writeScore + variantStars,
  "la tarjeta de escribir cuenta sus estrellas",
  `${cardStars.write} ≠ ${writeScore + variantStars}`
);
check(
  cardStars.quiz + cardStars.gaps + cardStars.listen + cardStars.write + cardStars.arcade + cardStars.invaders === totals.stars,
  "las estrellas de las pruebas suman el total de la barra",
  JSON.stringify({ cardStars, total: totals.stars })
);
check(cardStars.study === 0, "las tarjetas de estudiar no muestran estrellas", `${cardStars.study}`);
check(
  cardStars.labels.every((label) => /^\d+ estrellas en esta prueba$/.test(label || '')),
  "el contador se anuncia a quien usa lector de pantalla",
  JSON.stringify(cardStars.labels)
);
await shot("05-estrellas-por-prueba");

// Spy on the player so the round-opening pronunciation can be counted.
await evaluate(`(() => {
  window.__arcadeSays = [];
  window.__originalSay = IVG.player.say;
  IVG.player.say = function (clips, text) {
    window.__arcadeSays.push({ clips, text });
    return window.__originalSay.call(this, clips, text);
  };
  window.__ticks = [];
  window.__originalTick = Sfx.tick;
  Sfx.tick = function () {
    window.__ticks.push(Date.now());
    return window.__originalTick.apply(this, arguments);
  };
})()`);

const arcadePace = JSON.parse(
  await evaluate("JSON.stringify({ player: ArcadeGame.PLAYER_STEP_MS, monster: ArcadeGame.MONSTER_STEP_MS })")
);
check(
  arcadePace.player >= 220 && arcadePace.monster >= 380,
  "el arcade se juega más despacio que antes",
  JSON.stringify(arcadePace)
);
check(
  arcadePace.monster > arcadePace.player,
  "los monstruos siguen siendo más lentos que el marcianito",
  JSON.stringify(arcadePace)
);

const countdownStartedAt = Date.now();
await evaluate("document.querySelector('[data-mode=arcade]').click()");
await waitFor("IVG.state.view === 'arcade' && !!IVG.arcade", "arranca el arcade");

/** Screen and session while the countdown before a round is still running. */
const arcadeCountdown = () =>
  evaluate(`(() => {
    const session = IVG.arcade;
    const overlay = document.querySelector('.arcade__countdown');
    const say = window.__arcadeSays[0] || null;
    return JSON.stringify({
      started: session.started,
      left: Math.ceil(session.countdown / 1000),
      overlay: overlay ? overlay.textContent : null,
      hudVerb: (document.querySelector('.arcade__verb') || {}).textContent || '',
      words: session.game.words.length,
      player: { r: session.game.player.r, c: session.game.player.c },
      says: window.__arcadeSays.length,
      sayClip: say ? say.clips[0].clip : null,
      sayText: say ? say.clips[0].text : null,
      ticks: window.__ticks.length
    });
  })()`);

const waiting = JSON.parse(await arcadeCountdown());
check(
  waiting.started === false && waiting.left > 0,
  "el arcade arranca con una cuenta atrás",
  JSON.stringify(waiting)
);
check(/^[123]$/.test(waiting.overlay || ""), "la cuenta atrás marca los segundos que quedan", `«${waiting.overlay}»`);
check(waiting.hudVerb === "—", "durante la cuenta atrás el verbo aún no se ha revelado", waiting.hudVerb);
check(waiting.words === 0, "durante la cuenta atrás el laberinto aún no reparte palabras", `${waiting.words}`);
check(waiting.says === 0, "durante la cuenta atrás el verbo todavía no suena", `${waiting.says}`);
check(waiting.ticks === 1, "la cuenta atrás pita al aparecer", `${waiting.ticks}`);

// The board is frozen: a second later nothing has moved on its own.
await sleep(1000);
const frozen = JSON.parse(await arcadeCountdown());
check(
  frozen.started === false && frozen.player.r === waiting.player.r && frozen.player.c === waiting.player.c,
  "la cuenta atrás congela la partida",
  JSON.stringify(frozen.player)
);
check(frozen.hudVerb === "—" && frozen.words === 0, "el tablero sigue a la espera", JSON.stringify(frozen));

await waitFor("IVG.arcade.started === true", "termina la cuenta atrás");
const countdownTook = Date.now() - countdownStartedAt;
check(
  countdownTook >= 2500 && countdownTook <= 4500,
  "la cuenta atrás dura unos tres segundos",
  `${countdownTook} ms`
);

const revealed = JSON.parse(await arcadeCountdown());
check(revealed.overlay === null, "la cuenta atrás se retira al empezar", `«${revealed.overlay}»`);
check(revealed.words === 4, "al terminar la cuenta atrás el laberinto reparte sus palabras", `${revealed.words}`);
check(revealed.hudVerb !== "—" && revealed.hudVerb !== "", "el verbo aparece al terminar la cuenta atrás", revealed.hudVerb);
check(
  revealed.says === 1 && revealed.sayClip === `assets/audio/${revealed.hudVerb}/base.mp3`,
  "el verbo revelado se pronuncia una vez",
  `${revealed.says} × ${revealed.sayClip}`
);
check(revealed.sayText === revealed.hudVerb, "se pronuncia la misma palabra que se muestra", `${revealed.sayText}`);

const tickTimes = JSON.parse(await evaluate("JSON.stringify(window.__ticks)"));
check(tickTimes.length === 3, "la cuenta atrás pita una vez por segundo", `${tickTimes.length} pitidos`);
check(
  tickTimes.length === 3 && tickTimes[2] - tickTimes[0] >= 1400,
  "los pitidos siguen el pulso de la cuenta atrás",
  `${tickTimes.length === 3 ? tickTimes[2] - tickTimes[0] : "?"} ms entre el primero y el último`
);

await sleep(1400);
check((await evaluate("window.__arcadeSays.length")) === 1, "el verbo no vuelve a sonar pasado el arranque");
check((await evaluate("window.__ticks.length")) === 3, "los pitidos se acaban con la cuenta atrás");

const opened = JSON.parse(await arcadeSnapshot());
const expectedPast = opened.past.split("/")[0].trim();
check(opened.view === "arcade", "el arcade abre su propia pantalla", opened.view);
check(
  opened.canvasWidth > 0 && opened.painted > 0,
  "el laberinto se dibuja en el lienzo",
  `ancho ${opened.canvasWidth}, muestras pintadas ${opened.painted}`
);
check(
  opened.hudVerb === opened.target && opened.hudLang === "en",
  "el infinitivo del verbo preside la pantalla",
  `${opened.hudVerb} (lang ${opened.hudLang})`
);
check(opened.words.length === 4, "el laberinto reparte cuatro palabras", `${opened.words.length}`);
check(
  opened.words.filter((word) => word.correct).length === 1,
  "de las cuatro palabras solo una es el pasado correcto",
  JSON.stringify(opened.words)
);
check(
  opened.words.find((word) => word.correct).text === expectedPast,
  "la palabra marcada como correcta es el pasado del verbo",
  `${opened.words.find((word) => word.correct).text} ≠ ${expectedPast}`
);
check(opened.monsters === 3, "el laberinto tiene monstruos", `${opened.monsters}`);
check(/flechas/i.test(opened.hint), "la pantalla explica que se juega con las flechas", opened.hint);
await shot("08-arcade");

// Scoring is checked without monsters so the walk cannot end in the middle;
// the monsters get their own test below.
await evaluate("IVG.arcade.game.monsters.length = 0");

const arrowsWorked = JSON.parse(
  await evaluate(`(() => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    return JSON.stringify({ prevented: event.defaultPrevented });
  })()`)
);
check(arrowsWorked.prevented, "las flechas no desplazan la página al jugar");

let sawWrongWord = false;
let sawRightWord = false;
await evaluate("window.__arcadeSays = []");
for (let attempt = 0; attempt < 14 && !(sawWrongWord && sawRightWord); attempt += 1) {
  const before = JSON.parse(await arcadeSnapshot());
  const wrongWord = before.words.find((word) => !word.correct);
  const goal = sawWrongWord ? before.words.find((word) => word.correct) : wrongWord;
  await walkArcadeTo({ r: goal.r, c: goal.c });
  const after = JSON.parse(await arcadeSnapshot());

  if (after.target !== before.target) {
    // The walk crossed the right word on the way: that is the scoring rule.
    check(after.score === before.score + 1, "recoger el pasado correcto suma un punto", `${after.score} ≠ ${before.score + 1}`);
    check(after.stars === before.stars + 1, "recoger el pasado correcto da una estrella", `${after.stars} ≠ ${before.stars + 1}`);
    check(after.hudVerb === after.target, "el verbo de arriba cambia al acertar", `${after.hudVerb} → ${after.target}`);
    check(after.hudVerb !== before.hudVerb, "la palabra nueva es otro verbo", `${before.hudVerb} → ${after.hudVerb}`);
    check(
      after.words.length === 4 && after.words.filter((word) => word.correct).length === 1,
      "tras acertar se reparten cuatro palabras con una correcta",
      JSON.stringify(after.words)
    );
    check(
      after.words.find((word) => word.correct).text === after.past.split("/")[0].trim(),
      "la palabra correcta es el pasado del verbo nuevo",
      after.words.find((word) => word.correct).text
    );
    check(after.points === String(after.score), "el marcador de la pantalla sigue la puntuación", after.points);
    // The word just collected goes first, the verb that replaces it right after.
    const says = JSON.parse(await evaluate("JSON.stringify(window.__arcadeSays)"));
    const lastSay = says[says.length - 1] || { clips: [] };
    const clips = lastSay.clips || [];
    check(
      clips.length === 2 && clips[0].clip === `assets/audio/${before.target}/past.mp3`,
      "al acertar suena el pasado que se acaba de recoger",
      JSON.stringify(clips.map((entry) => entry.clip))
    );
    check(
      clips.length === 2 && clips[1].clip === `assets/audio/${after.target}/base.mp3`,
      "el verbo que aparece después también suena",
      JSON.stringify(clips.map((entry) => entry.clip))
    );
    check(after.power > 0, "acertar enciende el poder de comerse a los monstruos", `${after.power} ms`);
    sawRightWord = true;
  } else if (after.player.r === wrongWord.r && after.player.c === wrongWord.c) {
    check(after.score === before.score, "una palabra equivocada no suma puntos", `${after.score} ≠ ${before.score}`);
    check(after.stars === before.stars, "una palabra equivocada no da estrellas", `${after.stars}`);
    check(
      after.words.length === 4 && after.words.find((word) => word.correct).text === before.words.find((w) => w.correct).text,
      "la palabra correcta sigue en el tablero tras fallar",
      JSON.stringify(after.words)
    );
    check(after.hudVerb === before.hudVerb, "fallar no cambia el verbo", after.hudVerb);
    sawWrongWord = true;
  }
}

check(sawWrongWord, "se puede comprobar que una palabra equivocada no puntúa");
check(sawRightWord, "se puede comprobar que el pasado correcto puntúa");
await evaluate("IVG.player.say = window.__originalSay");
await evaluate("Sfx.tick = window.__originalTick");
await shot("09-arcade-punto");

// The level still rules the arcade: level 1 never shows a past form it does not teach.
await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio antes del arcade del nivel 1");
check((await evaluate("IVG.arcade")) === null, "salir del arcade termina la partida");
const arcadeCardStars = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    card: Number(document.querySelector('.mode--arcade .mode__stars b').textContent),
    stored: IVG.profile.modeStars.arcade
  }))()`)
);
check(
  arcadeCardStars.card === arcadeCardStars.stored && arcadeCardStars.card > 0,
  "el arcade suma en su tarjeta las estrellas que gana",
  JSON.stringify(arcadeCardStars)
);
await evaluate(`document.querySelector('[data-action="set-level"][data-level="1"]').click()`);
await waitFor("IVG.profile.level === 1", "nivel 1 antes del arcade");
await evaluate("document.querySelector('[data-mode=arcade]').click()");
await waitFor("!!IVG.arcade && IVG.state.view === 'arcade'", "el arcade en nivel 1");
await waitFor("IVG.arcade.started === true", "cuenta atrás del arcade en nivel 1");
const levelOneArcade = JSON.parse(await arcadeSnapshot());
check(LEVEL_ONE.includes(levelOneArcade.target), "nivel 1 arcade: el verbo es de los diez del nivel", levelOneArcade.target);
check(
  levelOneArcade.words.every((word) => levelOnePastPool.has(word.text)),
  "nivel 1 arcade: no se cuelan pasados de fuera",
  JSON.stringify(levelOneArcade.words.map((word) => word.text))
);
check(
  levelOnePastPool.has(levelOneArcade.words.find((word) => word.correct).text),
  "nivel 1 arcade: la respuesta es del pasado del nivel",
  levelOneArcade.words.find((word) => word.correct).text
);

/* ------------------------------------------------------- poder (5 s) ---- */

// While the power lasts the ghosts change colour; with it off they are pink.
const colours = JSON.parse(
  await evaluate(`(() => {
    const key = (colour) => colour && typeof colour.r === 'number'
      ? 'rgb:' + Math.round(colour.r * 255) + ',' + Math.round(colour.g * 255) + ',' + Math.round(colour.b * 255)
      : String(colour);
    const game = IVG.arcade.game;
    const off = key(ArcadeGame.monsterColour(game));
    game.power = ArcadeGame.POWER_MS;
    const on = key(ArcadeGame.monsterColour(game));
    game.power = 0;
    return JSON.stringify({ off, on });
  })()`)
);
check(colours.off !== colours.on, "los monstruos cambian de color con el poder", `${colours.off} → ${colours.on}`);

// The test takes the clock: the engine loop is muted and the same start is
// played twice, once with the power on and once with it off, so the only
// difference left is the rule being tested. Math.random is pinned so both runs
// take the same decisions.
const power = JSON.parse(
  await evaluate(`(() => {
    const session = IVG.arcade;
    session.stopped = true;
    const game = session.game;
    const original = Math.random;
    Math.random = () => 0;
    const cols = ArcadeGame.MAZE[0].length;
    const key = (r, c) => r * cols + c;
    const wall = (r, c) =>
      r < 0 || c < 0 || r >= ArcadeGame.MAZE.length || c >= cols || ArcadeGame.MAZE[r][c] === '#';
    // Steps through the corridors: the maze has no straight lines to trust.
    const distance = (from, to) => {
      const seen = new Map([[key(from.r, from.c), 0]]);
      const queue = [from];
      while (queue.length > 0) {
        const cell = queue.shift();
        const steps = seen.get(key(cell.r, cell.c));
        if (cell.r === to.r && cell.c === to.c) return steps;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const r = cell.r + dr;
          const c = cell.c + dc;
          if (wall(r, c) || seen.has(key(r, c))) continue;
          seen.set(key(r, c), steps + 1);
          queue.push({ r, c });
        }
      }
      return 999;
    };
    const home = { r: game.player.r, c: game.player.c };
    const reset = () => {
      game.player.r = home.r;
      game.player.c = home.c;
      game.player.dir = null;
      game.player.desired = null;
      game.player.timer = 0;
      game.player.moved = false;
      game.monsters.forEach((monster) => {
        monster.eaten = false;
        monster.r = monster.home.r;
        monster.c = monster.home.c;
        monster.dir = null;
        monster.previous = null;
        monster.timer = 0;
        monster.moved = false;
      });
      game.power = 0;
      game.over = false;
    };
    const play = (powerMs, frames) => {
      reset();
      game.power = powerMs;
      let caught = 0;
      for (let frame = 0; frame < frames; frame += 1) {
        if (ArcadeGame.tick(game, 1000 / 60).caught) caught += 1;
      }
      return {
        away: game.monsters.map((monster) =>
          monster.eaten ? 999 : distance(home, { r: monster.r, c: monster.c })
        ),
        caught,
        power: Math.round(game.power),
        over: game.over
      };
    };
    const fleeing = play(ArcadeGame.POWER_MS, 90);
    const chasing = play(0, 90);
    const full = play(ArcadeGame.POWER_MS, 300);
    Math.random = original;
    return JSON.stringify({ fleeing, chasing, full });
  })()`)
);
const total = (run) => run.away.reduce((sum, steps) => sum + steps, 0);
check(
  total(power.fleeing) > total(power.chasing),
  "con el poder los monstruos huyen en vez de perseguir",
  `huyendo acaban a ${power.fleeing.away.join('/')} pasos, persiguiendo a ${power.chasing.away.join('/')}`
);
check(
  power.full.caught === 0 && power.full.over === false,
  "con el poder un monstruo no puede pillarte",
  `${power.full.caught} capturas`
);
check(power.full.power === 0, "el poder dura cinco segundos", `quedan ${power.full.power} ms`);

const eaten = JSON.parse(
  await evaluate(`(() => {
    const game = IVG.arcade.game;
    game.power = ArcadeGame.POWER_MS;
    const player = game.player;
    const monster = game.monsters[0];
    monster.eaten = false;
    monster.r = player.r;
    monster.c = player.c;
    const events = ArcadeGame.tick(game, 1000 / 60);
    return JSON.stringify({
      eaten: !!events.eaten,
      caught: !!events.caught,
      over: game.over,
      left: game.monsters.filter((other) => !other.eaten).length
    });
  })()`)
);
check(eaten.eaten && !eaten.caught && !eaten.over, "con el poder, tocar un monstruo te lo comes", JSON.stringify(eaten));
check(eaten.left === 2, "el monstruo comido sale del laberinto", `quedan ${eaten.left} monstruos`);

const respawn = JSON.parse(
  await evaluate(`(() => {
    const game = IVG.arcade.game;
    const monster = game.monsters[0];
    const home = { r: monster.home.r, c: monster.home.c };
    game.power = 300;
    for (let frame = 0; frame < 30; frame += 1) ArcadeGame.tick(game, 1000 / 60);
    return JSON.stringify({
      power: Math.round(game.power),
      eaten: monster.eaten,
      at: { r: monster.r, c: monster.c },
      home
    });
  })()`)
);
check(
  respawn.eaten === false && respawn.at.r === respawn.home.r && respawn.at.c === respawn.home.c,
  "el monstruo comido vuelve a su esquina al acabarse el poder",
  JSON.stringify(respawn)
);

/* --------------------------------------------- verbos del nivel, sin dos ---- */

// A profile where two verbs have failed a lot used to turn the maze into a
// two-verb treadmill: the level still has to rotate every verb it teaches.
await evaluate("location.hash = ''");
await waitFor("!!document.querySelector('.mode')", "inicio antes del perfil castigado");
await evaluate(`(() => {
  const raw = JSON.parse(localStorage.getItem('verbos-irregulares-v1') || '{}');
  raw.level = 1;
  raw.verbs = { become: { seen: 40, right: 0, wrong: 40 }, bleed: { seen: 40, right: 0, wrong: 40 } };
  localStorage.setItem('verbos-irregulares-v1', JSON.stringify(raw));
})()`);
await send("Page.reload");
await waitFor("!!window.IVG && !!document.querySelector('.mode')", "el juego rearranca con el perfil castigado");
await waitFor("IVG.profile.level === 1", "nivel 1 del perfil guardado");
await evaluate("document.querySelector('[data-mode=arcade]').click()");
await waitFor("!!IVG.arcade && IVG.arcade.started === true", "el arcade con el perfil castigado");
// No monsters: this test is about which verb comes next, not about dodging.
await evaluate("IVG.arcade.game.monsters.length = 0");

const picked = [];
for (let round = 0; round < 12; round += 1) {
  picked.push(await evaluate("IVG.arcade.target.base"));
  await evaluate(`(() => {
    const game = IVG.arcade.game;
    const word = game.words.find((entry) => entry.correct);
    if (!word) return;
    game.player.r = word.r;
    game.player.c = word.c;
    game.player.dir = null;
    game.player.desired = null;
    game.player.timer = 0;
    // The rule only fires on a step, so the test declares the step it took.
    game.player.moved = true;
  })()`);
  await sleep(120);
}
const distinct = [...new Set(picked)];
check(
  distinct.length >= 6,
  "con dos verbos fallados el arcade sigue rotando los verbos del nivel",
  `${distinct.length} distintos en 12 palabras: ${picked.join(', ')}`
);
check(
  picked.every((base, index) => !picked.slice(Math.max(0, index - 4), index).includes(base)),
  "un verbo no vuelve en las cuatro palabras siguientes",
  picked.join(', ')
);
check(
  picked.every((base) => LEVEL_ONE.includes(base)),
  "el arcade no saca verbos de fuera del nivel elegido",
  picked.join(', ')
);

// Back to a clean profile for the rest of the run.
await evaluate("IVG.reset()");
await waitFor("IVG.profile.level === 2", "el perfil vuelve a estar limpio");
// The reload and the reset above do not count as played rounds.
const roundsBeforeRealRun = await evaluate("IVG.profile.rounds");

// A real run: standing still, a monster has to reach the alien.
await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio antes de la partida real");
await evaluate(`document.querySelector('[data-action="set-level"][data-level="2"]').click()`);
await waitFor("IVG.profile.level === 2", "vuelta al nivel 2 para la partida real");
await evaluate("document.querySelector('[data-mode=arcade]').click()");
await waitFor("!!IVG.arcade && IVG.state.view === 'arcade'", "el arcade arranca de nuevo");
await waitFor("IVG.arcade.started === true", "cuenta atrás de la partida nueva");
check((await evaluate("IVG.arcade.score")) === 0, "la partida nueva empieza a cero");
check((await evaluate("IVG.arcade.game.monsters.length")) === 3, "la partida nueva trae sus monstruos");

let gameOver = false;
for (let attempt = 0; attempt < 200 && !gameOver; attempt += 1) {
  gameOver = await evaluate("!!document.querySelector('.arcade__over')");
  if (!gameOver) await sleep(100);
}
check(gameOver, "un monstruo acaba alcanzando al marcianito quieto");
const over = JSON.parse(
  await evaluate(`(() => {
    const box = document.querySelector('.arcade__over');
    return JSON.stringify({
      text: box ? box.textContent : '',
      title: box ? box.querySelector('h2').textContent : '',
      score: IVG.arcade.score,
      best: IVG.profile.arcadeBest,
      rounds: IVG.profile.rounds,
      stored: JSON.parse(localStorage.getItem('verbos-irregulares-v1') || '{}').arcadeBest,
      replay: !!document.querySelector('[data-action=play][data-mode=arcade]')
    });
  })()`)
);
check(/monstruo/i.test(over.title), "el final avisa de que un monstruo te ha pillado", over.title);
check(over.text.includes(String(over.score)), "el final muestra los puntos de la partida", over.text);
check(over.best === over.score, "la partida fija el récord del arcade", `${over.best} ≠ ${over.score}`);
check(over.stored === over.best, "el récord se guarda en el navegador", `${over.stored}`);
check(over.rounds === roundsBeforeRealRun + 1, "la partida cuenta como una ronda jugada", `${over.rounds}`);
check(over.replay, "el final deja jugar otra partida");
await shot("10-arcade-final");

await evaluate("document.querySelector('[data-action=play][data-mode=arcade]').click()");
await waitFor("!!IVG.arcade && IVG.state.view === 'arcade'", "jugar otra partida del arcade");
check((await evaluate("IVG.arcade.score")) === 0, "jugar otra vez empieza una partida limpia");
check((await evaluate("IVG.arcade.game.monsters.length")) === 3, "jugar otra vez devuelve los monstruos");
check(
  (await evaluate("!!document.querySelector('.arcade__canvas')")),
  "jugar otra vez vuelve a pintar el laberinto"
);
await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio después del arcade");

/* ------------------------------------ móvil: pantalla completa y táctil ---- */

/** One finger, the way the browser sees it: a real touch from outside. */
const touchPoints = (x, y) => [{ x, y, radiusX: 8, radiusY: 8, force: 1 }];

const tapAt = async (x, y) => {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchPoints(x, y) });
  await sleep(40);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(120);
};

const swipe = async (from, to) => {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchPoints(from.x, from.y) });
  await sleep(40);
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchPoints(to.x, to.y) });
  await sleep(40);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(140);
};

/** What the phone shows: the page around the maze and the touch controls. */
const phoneLayout = () =>
  evaluate(`(() => {
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const shown = (selector) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node).display !== 'none' : null;
    };
    const stage = document.querySelector('.arcade__stage');
    const canvas = document.querySelector('.arcade__canvas');
    const pad = document.querySelector('.arcade__pad');
    const toggle = document.querySelector('[data-action=arcade-fullscreen]');
    return JSON.stringify({
      viewport: { width: innerWidth, height: innerHeight },
      scrollY: window.scrollY,
      fullscreen: document.body.classList.contains('arcade-fullscreen'),
      topbar: shown('.topbar'),
      footnote: shown('.footnote'),
      overflow: getComputedStyle(document.body).overflow,
      padShown: pad ? getComputedStyle(pad).display !== 'none' : false,
      pad: pad ? box(pad) : null,
      keys: [...document.querySelectorAll('[data-arcade-dir]')].map((node) => ({
        dir: node.dataset.arcadeDir,
        ...box(node)
      })),
      stage: stage ? { ...box(stage), touchAction: getComputedStyle(stage).touchAction } : null,
      canvas: canvas ? { ...box(canvas), ratio: canvas.getBoundingClientRect().width / canvas.getBoundingClientRect().height } : null,
      hint: (document.querySelector('.arcade__hint') || {}).textContent || '',
      mazeRatio: ArcadeGame.MAZE_W / ArcadeGame.MAZE_H,
      toggle: !!toggle,
      pressed: toggle ? toggle.getAttribute('aria-pressed') : null,
      desired: IVG.arcade ? IVG.arcade.game.player.desired : null
    });
  })()`);

/** The phone this section plays on, in CSS pixels: narrow, tall, touch only. */
const PHONE_SCREEN = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

/** Put the page on a phone screen and let the layout settle on the new box. */
const useScreen = async (screen = PHONE_SCREEN) => {
  await send("Emulation.setDeviceMetricsOverride", screen);
  await sleep(500);
};

await send("Emulation.setDeviceMetricsOverride", PHONE_SCREEN);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Page.reload");
await waitFor("!!window.IVG && !!document.querySelector('.mode')", "el juego arranca en un móvil");
await evaluate("document.querySelector('[data-mode=arcade]').click()");
await waitFor("!!IVG.arcade && IVG.state.view === 'arcade'", "el arcade arranca en el móvil");
await waitFor("IVG.arcade.started === true", "cuenta atrás del arcade en el móvil");
// No monsters here either: this test is about the screen and the fingers.
await evaluate("IVG.arcade.game.monsters.length = 0");

const phone = JSON.parse(await phoneLayout());
check(phone.fullscreen, "en el móvil el arcade se abre a pantalla completa", JSON.stringify(phone.fullscreen));
check(
  phone.topbar === false && phone.footnote === false,
  "a pantalla completa se esconde el resto de la página",
  `barra ${phone.topbar}, pie ${phone.footnote}`
);
check(phone.overflow === "hidden", "la página no se desplaza mientras se juega", phone.overflow);
check(
  phone.stage && phone.stage.width >= phone.viewport.width - 40,
  "el laberinto ocupa todo el ancho del móvil",
  `${phone.stage && Math.round(phone.stage.width)} de ${phone.viewport.width}`
);
check(
  phone.canvas &&
    phone.canvas.width >= 320 &&
    phone.canvas.y >= 0 &&
    phone.canvas.y + phone.canvas.height <= phone.viewport.height + 1,
  "el laberinto cabe entero en la pantalla",
  JSON.stringify(phone.canvas)
);
check(
  phone.canvas && Math.abs(phone.canvas.ratio - phone.mazeRatio) < 0.02,
  "el lienzo mantiene la proporción del laberinto",
  phone.canvas && phone.canvas.ratio.toFixed(3)
);
check(
  phone.stage && phone.stage.touchAction === "none",
  "deslizar el laberinto no arrastra la página",
  phone.stage && phone.stage.touchAction
);
check(
  phone.padShown && phone.keys.length === 4,
  "el móvil ofrece cuatro flechas táctiles",
  `${phone.keys.length} flechas, visibles ${phone.padShown}`
);
check(
  phone.keys.length === 4 && phone.keys.every((key) => key.width >= 48 && key.height >= 48),
  "las flechas táctiles son grandes para el dedo",
  JSON.stringify(phone.keys.map((key) => [key.dir, Math.round(key.width), Math.round(key.height)]))
);
check(
  phone.toggle && phone.pressed === "true",
  "el botón de pantalla completa aparece pulsado",
  `botón ${phone.toggle}, pulsado ${phone.pressed}`
);
check(/desliza|toca/i.test(phone.hint), "la pista explica cómo moverse con el dedo", phone.hint);
await shot("11-arcade-movil");

const rightKey = phone.keys.find((key) => key.dir === "right");
if (rightKey) await tapAt(rightKey.x + rightKey.width / 2, rightKey.y + rightKey.height / 2);
const afterTap = JSON.parse(await phoneLayout());
check(
  afterTap.desired === "right",
  "tocar una flecha táctil mueve al marcianito",
  `dirección ${afterTap.desired}`
);

// A browser without pointer events has no pointerdown listener: the keypad still
// has to answer the click that a finger leaves behind.
await evaluate("document.querySelector('[data-arcade-dir=left]')?.click()");
const afterKeyClick = JSON.parse(await phoneLayout());
check(
  afterKeyClick.desired === "left",
  "las flechas responden también al click de un navegador sin punteros",
  `dirección ${afterKeyClick.desired}`
);

const stageMiddle = phone.stage
  ? { x: phone.stage.x + phone.stage.width / 2, y: phone.stage.y + phone.stage.height / 2 }
  : null;
if (stageMiddle) await swipe(stageMiddle, { x: stageMiddle.x, y: stageMiddle.y - 120 });
const afterSwipe = JSON.parse(await phoneLayout());
check(
  afterSwipe.desired === "up",
  "deslizar el dedo por el laberinto mueve al marcianito",
  `dirección ${afterSwipe.desired}`
);
check(afterSwipe.scrollY === 0, "jugar con el dedo no desplaza la página", `${afterSwipe.scrollY} px`);

// Two fingers on the maze: the one that started the drag owns it, and lifting
// the other must not cancel the turn it was about to make.
await evaluate(`(() => {
  const stage = document.querySelector('.arcade__stage');
  const rect = stage.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const fire = (type, id, cx, cy) => stage.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true, cancelable: true
  }));
  IVG.arcade.game.player.desired = null;
  fire('pointerdown', 7, x, y);
  fire('pointerdown', 8, x + 60, y + 60);
  fire('pointerup', 8, x + 60, y + 60);
  fire('pointermove', 7, x, y - 130);
  return true;
})()`);
const afterTwoFingers = JSON.parse(await phoneLayout());
check(
  afterTwoFingers.desired === "up",
  "un segundo dedo no roba ni cancela el gesto del primero",
  `dirección ${afterTwoFingers.desired}`
);

// A phone lying sideways: the keypad turns into one row so the maze keeps room.
await useScreen({ ...PHONE_SCREEN, width: 844, height: 390 });
const landscape = JSON.parse(await phoneLayout());
check(
  landscape.canvas &&
    landscape.canvas.height >= 150 &&
    Math.abs(landscape.canvas.ratio - landscape.mazeRatio) < 0.02 &&
    landscape.canvas.y >= 0 &&
    landscape.canvas.y + landscape.canvas.height <= landscape.viewport.height + 1,
  "en horizontal el laberinto sigue entrando entero",
  JSON.stringify(landscape.canvas)
);
const keyRows = new Set(landscape.keys.map((key) => Math.round(key.y)));
check(
  landscape.keys.length === 4 && keyRows.size === 1,
  "en horizontal las flechas se colocan en una sola fila",
  `${landscape.keys.length} flechas en ${keyRows.size} fila(s)`
);
await shot("12-arcade-movil-horizontal");
await useScreen();

// The same button gives the page back, so a phone can leave the fullscreen game.
await evaluate("document.querySelector('[data-action=arcade-fullscreen]')?.click()");
await sleep(200);
const restored = JSON.parse(await phoneLayout());
check(
  restored.fullscreen === false && restored.topbar === true,
  "el botón devuelve la página normal",
  `pantalla completa ${restored.fullscreen}, barra ${restored.topbar}`
);
check(restored.pressed === "false", "el botón avisa de que ya no hay pantalla completa", restored.pressed);

// On a desktop the arcade keeps its old layout: no cut phone controls.
await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio tras el arcade del móvil");
await send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 1250, deviceScaleFactor: 1, mobile: false });
await send("Page.reload");
await waitFor("!!window.IVG && !!document.querySelector('.mode')", "vuelta al escritorio");
await evaluate("document.querySelector('[data-mode=arcade]')?.click()");
await waitFor("IVG.arcade && IVG.arcade.started === true", "el arcade en el escritorio");
const desktop = JSON.parse(await phoneLayout());
check(
  desktop.fullscreen === false,
  "en el escritorio el arcade no ocupa la pantalla entera",
  JSON.stringify(desktop.fullscreen)
);
check(desktop.padShown === false, "sin pantalla táctil no aparecen las flechas", `${desktop.padShown}`);
await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio después del arcade del móvil");

/* ------------------------------------------------------------ invasores ---- */

// The whole road of the new mode: the countdown, the keyboard, a right shot that
// scores, a wrong shot that costs a life, and the end of the game with its
// record. Everything is read from the running game, never from its markup.
const invadersState = async () =>
  JSON.parse(
    await evaluate(`(() => {
      const session = IVG.invaders;
      const snap = session ? session.game.snapshot() : null;
      const overlay = document.querySelector('.arcade__countdown');
      const canvas = document.querySelector('.invaders__canvas');
      const lives = document.querySelector('.arcade__lives');
      const box = canvas ? canvas.getBoundingClientRect() : null;
      return JSON.stringify({
        view: IVG.state.view,
        started: session ? session.started : null,
        stopped: session ? session.stopped : null,
        score: snap ? snap.score : null,
        lives: snap ? snap.lives : null,
        shipX: snap ? snap.shipX : null,
        aliens: snap ? snap.aliens.map((alien) => ({
          x: alien.x,
          width: alien.width,
          word: alien.word,
          correct: alien.correct,
          alive: alien.alive
        })) : [],
        countdown: overlay ? overlay.textContent : null,
        hudVerb: (document.querySelector('.arcade__verb') || {}).textContent || '',
        hudLabel: (document.querySelector('.arcade__label') || {}).textContent || '',
        hudLives: lives ? lives.textContent : '',
        hudLivesLabel: lives ? lives.getAttribute('aria-label') : '',
        hint: (document.querySelector('.arcade__hint') || {}).textContent || '',
        canvas: box ? { width: Math.round(box.width), height: Math.round(box.height), ratio: box.width / box.height } : null,
        modeStars: IVG.profile.modeStars.invaders,
        best: IVG.profile.invadersBest
      });
    })()`)
  );

/** Hold an arrow until the ship sits under one alien: the real controls, never a hack. */
async function aimInvadersAt(index) {
  const alien = JSON.parse(
    await evaluate(`(() => {
      const snap = IVG.invaders.game.snapshot();
      const target = snap.aliens[${index}];
      return JSON.stringify({
        left: target.x + 6,
        right: target.x + target.width - 6,
        shipX: snap.shipX
      });
    })()`)
  );
  if (alien.shipX > alien.left && alien.shipX < alien.right) return true;
  const key = alien.left > alien.shipX ? "ArrowRight" : "ArrowLeft";
  await evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true }))`
  );
  const arrived = await waitFor(
    `(() => { const x = IVG.invaders.game.snapshot().shipX; return x > ${alien.left} && x < ${alien.right}; })()`,
    `la nave apunta al marciano ${index}`
  );
  await evaluate(
    `document.dispatchEvent(new KeyboardEvent('keyup', { key: '${key}', bubbles: true }))`
  );
  return arrived;
}

const pullInvadersTrigger = (type) =>
  evaluate(`document.dispatchEvent(new KeyboardEvent('${type}', { key: ' ', bubbles: true }))`);

await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode--invaders')", "inicio antes de invasores");
await evaluate("document.querySelector('[data-mode=invaders]').click()");
await waitFor("IVG.state.view === 'invaders' && !!IVG.invaders", "arranca el juego de invasores");

const invadersOpening = await invadersState();
check(invadersOpening.view === "invaders", "invasores abre su propia pantalla", invadersOpening.view);
check(
  invadersOpening.started === false && invadersOpening.countdown !== null,
  "invasores arranca con una cuenta atrás",
  JSON.stringify({ started: invadersOpening.started, countdown: invadersOpening.countdown })
);
check(
  invadersOpening.aliens.length === 0 && invadersOpening.hudVerb === "—",
  "durante la cuenta atrás no hay verbo ni palabras",
  JSON.stringify({ aliens: invadersOpening.aliens.length, verb: invadersOpening.hudVerb })
);
check(
  invadersOpening.hint.includes("barra espaciadora"),
  "la ayuda explica cómo se dispara",
  invadersOpening.hint
);
check(
  invadersOpening.canvas && Math.abs(invadersOpening.canvas.ratio - 4 / 3) < 0.05,
  "el campo de invasores conserva su forma 4:3",
  JSON.stringify(invadersOpening.canvas)
);

await waitFor("IVG.invaders.started === true", "termina la cuenta atrás de invasores");
const wave = await invadersState();
const invadersTarget = await evaluate("IVG.invaders.target.base");
check(wave.aliens.length === 4, "la oleada trae cuatro palabras", `${wave.aliens.length}`);
check(
  wave.aliens.filter((alien) => alien.correct).length === 1,
  "una sola palabra es la correcta",
  JSON.stringify(wave.aliens)
);
check(wave.hudVerb === invadersTarget, "el marcador enseña el verbo", `${wave.hudVerb} ≠ ${invadersTarget}`);
check(
  /^(Pasado|Participio) de$/.test(wave.hudLabel),
  "el marcador dice qué forma se pide",
  wave.hudLabel
);
check(
  wave.hudLives === "❤❤❤" && wave.hudLivesLabel === "3 vidas",
  "se empieza con tres vidas",
  JSON.stringify({ hearts: wave.hudLives, label: wave.hudLivesLabel })
);
await shot("13-invasores");

// The keyboard moves the ship and lets it go on key release.
const beforeMove = (await invadersState()).shipX;
await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))");
await sleep(250);
await evaluate("document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }))");
const afterMove = (await invadersState()).shipX;
const afterRelease = await invadersState();
check(afterMove < beforeMove, "la flecha izquierda mueve la nave", `${beforeMove} → ${afterMove}`);
await sleep(150);
check(
  ((await invadersState()).shipX) === afterRelease.shipX,
  "al soltar la flecha la nave se detiene",
  `${afterRelease.shipX} → ${(await invadersState()).shipX}`
);

// The right alien goes down: a point, a star and a brand-new verb.
await aimInvadersAt(wave.aliens.findIndex((alien) => alien.correct));
await pullInvadersTrigger("keydown");
const scored = await waitFor("IVG.invaders.game.snapshot().score === 1", "el disparo derriba la palabra correcta");
await pullInvadersTrigger("keyup");
const hit = await invadersState();
check(scored && hit.score === 1, "acertar suma un punto", `${hit.score}`);
check(hit.modeStars === 1, "acertar da una estrella al modo", `${hit.modeStars}`);
check(hit.lives === 3, "acertar no cuesta vidas", `${hit.lives}`);
check(
  hit.aliens.length === 4 && hit.aliens.filter((alien) => alien.correct).length === 1,
  "acertar trae un verbo nuevo con su oleada",
  JSON.stringify(hit.aliens)
);
check(hit.hudVerb !== invadersTarget, "el marcador cambia de verbo", `${hit.hudVerb}`);

// Wrong words cost lives and never points; the last one ends the game.
for (const expectedLives of [2, 1, 0]) {
  const snapshot = await invadersState();
  const wrongIndex = snapshot.aliens.findIndex((alien) => alien.alive && !alien.correct);
  await aimInvadersAt(wrongIndex);
  await pullInvadersTrigger("keydown");
  const lost = await waitFor(
    `IVG.invaders.game.snapshot().lives === ${expectedLives}`,
    `un fallo cuesta la vida (quedan ${expectedLives})`
  );
  await pullInvadersTrigger("keyup");
  const after = await invadersState();
  check(lost && after.lives === expectedLives, `fallar deja ${expectedLives} vidas`, `${after.lives}`);
  check(after.score === 1, "fallar no suma puntos", `${after.score}`);
  check(
    after.hudLives === "❤".repeat(expectedLives) + "🖤".repeat(3 - expectedLives),
    `el marcador enseña ${expectedLives} vidas`,
    after.hudLives
  );
  if (expectedLives > 0) {
    check(
      after.aliens.filter((alien) => alien.alive).length === expectedLives + 1,
      `quedan ${expectedLives + 1} palabras en la oleada`,
      `${after.aliens.filter((alien) => alien.alive).length}`
    );
  }
}

await waitFor("IVG.invaders.stopped === true", "cero vidas terminan la partida");
await waitFor("!!document.querySelector('.arcade__over')", "aparece la pantalla del final");
const invadersOver = JSON.parse(
  await evaluate(`(() => {
    const stored = JSON.parse(localStorage.getItem('verbos-irregulares-v1') || '{}');
    return JSON.stringify({
      text: (document.querySelector('.arcade__over') || {}).textContent || '',
      best: IVG.profile.invadersBest,
      stored: typeof stored.invadersBest === 'number' ? stored.invadersBest : null,
      again: !!document.querySelector('[data-action=play][data-mode=invaders]')
    });
  })()`)
);
check(/Has derribado/.test(invadersOver.text), "el final cuenta lo que se derribó", invadersOver.text.slice(0, 120));
check(invadersOver.best === 1, "el récord de invasores se apunta", `${invadersOver.best}`);
check(invadersOver.stored === 1, "el récord se guarda en el navegador", `${invadersOver.stored}`);
check(invadersOver.again, "el final deja jugar otra vez");

// Fullscreen is the same shared screen treatment as the maze.
await evaluate("document.querySelector('[data-action=play][data-mode=invaders]').click()");
await waitFor("!!IVG.invaders && IVG.invaders.started === false", "jugar otra vez vuelve a la cuenta atrás");
await evaluate("document.querySelector('[data-action=invaders-fullscreen]').click()");
await waitFor("document.body.classList.contains('arcade-fullscreen')", "invasores entra en pantalla completa");
await sleep(250);
const fitted = await invadersState();
check(
  fitted.canvas && Math.abs(fitted.canvas.ratio - 4 / 3) < 0.06,
  "a pantalla completa el campo no se deforma",
  JSON.stringify(fitted.canvas)
);
await evaluate("document.querySelector('[data-action=invaders-fullscreen]').click()");
await waitFor("!document.body.classList.contains('arcade-fullscreen')", "invasores sale de pantalla completa");

// The level still rules the new game: level 1 never asks for anything but the past.
await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode--invaders')", "inicio después de invasores");
await evaluate(`document.querySelector('[data-action="set-level"][data-level="1"]').click()`);
await waitFor("IVG.profile.level === 1", "nivel 1 antes de invasores");
await evaluate("document.querySelector('[data-mode=invaders]').click()");
await waitFor("!!IVG.invaders && IVG.invaders.started === true", "invasores en nivel 1");
const levelOneInvaders = JSON.parse(
  await evaluate(`(() => {
    const snap = IVG.invaders.game.snapshot();
    return JSON.stringify({
      label: (document.querySelector('.arcade__label') || {}).textContent || '',
      target: IVG.invaders.target.base,
      words: snap.aliens.map((alien) => alien.word)
    });
  })()`)
);
check(
  LEVEL_ONE.includes(levelOneInvaders.target),
  "nivel 1 invasores: el verbo es de los diez del nivel",
  levelOneInvaders.target
);
check(
  levelOneInvaders.label === "Pasado de",
  "nivel 1 invasores: solo se pide el pasado",
  levelOneInvaders.label
);
check(
  levelOneInvaders.words.every((word) => levelOnePastPool.has(word)),
  "nivel 1 invasores: no se cuelan formas de fuera",
  JSON.stringify(levelOneInvaders.words)
);

await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio tras invasores");
await evaluate(`document.querySelector('[data-action="set-level"][data-level="2"]').click()`);
await waitFor("IVG.profile.level === 2", "vuelta al nivel 2");

/* ------------------------------------------------------ audio + keyboard ---- */

await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "volver al inicio después de jugar");
const starsBeforeTopbarClick = await evaluate("IVG.profile.stars");
await evaluate("document.querySelectorAll('.stat')[0].click()");
const starsAfterTopbarClick = await evaluate("IVG.profile.stars");
check(starsAfterTopbarClick === starsBeforeTopbarClick, "tocar la barra superior no altera las estrellas");

await evaluate("location.hash = '#study'");
await waitFor("!!document.querySelector('.verb-card')", "volver a las tarjetas");
const speakWorked = await evaluate(`(() => {
  const button = document.querySelector('[data-action=speak]');
  button.click();
  return true;
})()`);
check(speakWorked, "los botones de audio responden al clic");

await evaluate("location.hash = '#quiz'");
await waitFor("IVG.state.round && IVG.state.round.mode === 'quiz'", "el modo quiz arranca desde la URL");
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))`);
const keyAnswered = await evaluate("!!IVG.state.round.answered");
check(keyAnswered, "la tecla 1 responde la pregunta");
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
const keyAdvanced = await evaluate("IVG.state.round.index");
check(keyAdvanced === 1, "Enter pasa a la siguiente pregunta", `índice ${keyAdvanced}`);

/* ---------------------------------------------------------------- mobile ---- */

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
});
await evaluate("document.querySelector('[data-action=home]').click()");
await waitFor("!!document.querySelector('.mode')", "inicio en vista móvil");
const mobileLayout = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    modeWidth: Math.round(document.querySelector('.mode').getBoundingClientRect().width),
    viewport: window.innerWidth
  }))()`)
);
check(!mobileLayout.overflow, "en móvil no hay scroll horizontal", JSON.stringify(mobileLayout));
check(mobileLayout.modeWidth < mobileLayout.viewport, "en móvil las tarjetas entran a lo ancho", JSON.stringify(mobileLayout));
await shot("06-movil-inicio");

await evaluate("document.querySelector('[data-mode=gaps]').click()");
await waitFor("IVG.state.view === 'play'", "ronda en móvil");
await evaluate("document.querySelectorAll('.option')[0].click()");
const mobileRound = await evaluate("document.documentElement.scrollWidth > window.innerWidth + 1");
check(!mobileRound, "en móvil la ronda no desborda");
await shot("07-movil-ronda");

/* --------------------------------------------------- perfil y niveles ---- */

// A profile saved before levels existed has no `level` field. It must come back
// as level 2 (the whole game) with its stars, streaks and rounds intact.
await evaluate(`(() => {
  localStorage.setItem('verbos-irregulares-v1', JSON.stringify({
    stars: 7,
    bestStreak: 3,
    rounds: 2,
    verbs: { be: { seen: 2, right: 1, wrong: 1 } }
  }));
  return true;
})()`);
// The page restores its view from the hash, so go home before reloading.
await evaluate("location.hash = ''");
await send("Page.reload");
await waitFor("!!window.IVG && !!document.querySelector('.mode')", "el juego rearranca con un perfil viejo");

const migrated = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    level: IVG.profile.level,
    stars: IVG.profile.stars,
    rounds: IVG.profile.rounds,
    bestStreak: IVG.profile.bestStreak,
    modeStars: IVG.profile.modeStars,
    cardStars: [...document.querySelectorAll('.mode__stars b')].map((node) => node.textContent),
    pressed: document.querySelector('[data-level="2"]').getAttribute('aria-pressed'),
    headStars: document.getElementById('stat-stars').textContent
  }))()`)
);
check(migrated.level === 2, "un perfil sin nivel entra en el nivel 2", `nivel ${migrated.level}`);
check(
  migrated.stars === 7 && migrated.rounds === 2 && migrated.bestStreak === 3,
  "el perfil viejo conserva estrellas, racha y rondas",
  JSON.stringify(migrated)
);
check(
  Object.values(migrated.modeStars).join() === "0,0,0,0,0,0" &&
    migrated.cardStars.join() === "0,0,0,0,0,0",
  "un perfil sin contadores por prueba arranca a cero, sin inventar estrellas",
  JSON.stringify({ modeStars: migrated.modeStars, cardStars: migrated.cardStars })
);
check(
  migrated.pressed === "true" && migrated.headStars === "7",
  "la pantalla arranca en el nivel 2 con las estrellas guardadas",
  JSON.stringify(migrated)
);

// And the level the player picks survives a reload.
await evaluate(`document.querySelector('[data-action="set-level"][data-level="1"]').click()`);
await waitFor("IVG.profile.level === 1", "nivel 1 elegido antes de recargar");
await send("Page.reload");
await waitFor("!!window.IVG && !!document.querySelector('.mode')", "el juego rearranca con el nivel 1");

const reloadedLevel = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    level: IVG.profile.level,
    pressed: document.querySelector('[data-level="1"]').getAttribute('aria-pressed')
  }))()`)
);
check(reloadedLevel.level === 1, "el nivel elegido sobrevive a una recarga", `nivel ${reloadedLevel.level}`);
check(reloadedLevel.pressed === "true", "el nivel 1 sigue marcado tras recargar", JSON.stringify(reloadedLevel));

/* ----------------------------------------------------- borrar progreso ---- */

await evaluate("location.hash = ''");
await waitFor("!!document.querySelector('.mode')", "inicio antes de borrar el progreso");

const beforeReset = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    stars: IVG.profile.stars,
    level: IVG.profile.level,
    button: !!document.querySelector('[data-action=reset-progress]')
  }))()`)
);
check(beforeReset.button, "el inicio ofrece borrar el progreso");
check(beforeReset.stars > 0, "hay progreso que borrar", `${beforeReset.stars} estrellas`);

// One click only asks: nothing is lost until the player confirms.
await evaluate("document.querySelector('[data-action=reset-progress]').click()");
const asking = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    stars: IVG.profile.stars,
    warning: !!document.querySelector('.reset'),
    confirm: !!document.querySelector('[data-action=reset-progress-confirm]'),
    cancel: !!document.querySelector('[data-action=reset-progress-cancel]'),
    text: (document.querySelector('.reset') || {}).textContent || ''
  }))()`)
);
check(
  asking.warning && asking.confirm && asking.cancel,
  "borrar el progreso pide confirmación",
  asking.text.replace(/\s+/g, " ").slice(0, 90)
);
check(asking.stars === beforeReset.stars, "pedir confirmación no borra nada", `${asking.stars} estrellas`);

await evaluate("document.querySelector('[data-action=reset-progress-cancel]').click()");
const cancelled = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    stars: IVG.profile.stars,
    warning: !!document.querySelector('.reset'),
    button: !!document.querySelector('[data-action=reset-progress]')
  }))()`)
);
check(
  cancelled.stars === beforeReset.stars && cancelled.button && !cancelled.warning,
  "cancelar deja el progreso intacto",
  `${cancelled.stars} estrellas`
);

await evaluate("document.querySelector('[data-action=reset-progress]').click()");
await evaluate("document.querySelector('[data-action=reset-progress-confirm]').click()");
const wiped = JSON.parse(
  await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem('verbos-irregulares-v1') || '{}');
    return JSON.stringify({
      stars: IVG.profile.stars,
      streak: IVG.profile.bestStreak,
      rounds: IVG.profile.rounds,
      arcadeBest: IVG.profile.arcadeBest,
      invadersBest: IVG.profile.invadersBest,
      modeStars: IVG.profile.modeStars,
      cardStars: [...document.querySelectorAll('.mode__stars b')].map((node) => node.textContent),
      verbs: Object.keys(IVG.profile.verbs || {}).length,
      level: IVG.profile.level,
      storedStars: typeof raw.stars === 'number' ? raw.stars : null,
      header: (document.getElementById('stat-stars') || {}).textContent || '',
      pressed: (document.querySelector('[data-level="2"]') || {}).getAttribute
        ? document.querySelector('[data-level="2"]').getAttribute('aria-pressed')
        : ''
    });
  })()`)
);
check(wiped.stars === 0 && wiped.header === "0", "borrar el progreso deja las estrellas a cero", `${wiped.stars} / «${wiped.header}»`);
check(wiped.streak === 0 && wiped.rounds === 0 && wiped.arcadeBest === 0, "la racha y los récords desaparecen", JSON.stringify(wiped));
check(wiped.invadersBest === 0, "el récord de invasores también se borra", `${wiped.invadersBest}`);
check(wiped.verbs === 0, "las estadísticas de los verbos se borran", `${wiped.verbs} verbos guardados`);
check(
  Object.values(wiped.modeStars).join() === "0,0,0,0,0,0" && wiped.cardStars.join() === "0,0,0,0,0,0",
  "borrar el progreso deja a cero las estrellas de cada prueba",
  JSON.stringify({ modeStars: wiped.modeStars, cardStars: wiped.cardStars })
);
check(wiped.storedStars === 0, "el borrado se guarda en el navegador", `${wiped.storedStars}`);
check(wiped.level === 2 && wiped.pressed === "true", "el progreso borrado vuelve al nivel 2", `nivel ${wiped.level}`);

// And it survives a reload: the wipe is not just cosmetic.
await send("Page.reload");
await waitFor("!!window.IVG", "el juego rearranca tras borrar");
const persisted = JSON.parse(
  await evaluate(`(() => JSON.stringify({
    stars: IVG.profile.stars,
    rounds: IVG.profile.rounds,
    level: IVG.profile.level
  }))()`)
);
check(
  persisted.stars === 0 && persisted.rounds === 0 && persisted.level === 2,
  "el progreso borrado sigue borrado tras recargar",
  JSON.stringify(persisted)
);

/* --------------------------------------------------- volver al proyecto ---- */

// El camino de vuelta al menú del proyecto tiene que funcionar de verdad: un
// clic en la cabecera deja la actividad y abre el portal.
await evaluate("document.querySelector('.home-link').click()");
for (let attempt = 0; attempt < 80 && !/Aprende como puedas/.test(await evaluate("document.title")); attempt += 1) {
  await sleep(100);
}
check(
  /Aprende como puedas/.test(await evaluate("document.title")),
  "el enlace de la cabecera abre el menú del proyecto",
  await evaluate("document.title")
);
check(
  await evaluate("location.pathname.endsWith('/index.html') && !location.pathname.includes('/primaria/')"),
  "la cabecera regresa al menú principal, no a una página que no existe",
  await evaluate("location.pathname")
);

/* ----------------------------------------------------------------- done ---- */

check(consoleErrors.length === 0, "sin errores de consola", consoleErrors.join(" | "));

socket.close();
chrome.kill("SIGKILL");

console.log(`\n${passes.length} comprobaciones OK`);
if (failures.length) {
  console.error(`\n${failures.length} fallo(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Todo verde");
