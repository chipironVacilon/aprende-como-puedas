#!/usr/bin/env node
/*
 * Browser check for the two French activities and their portal entries.
 *
 *   node primaria/5/frances/verificar.mjs [--shots <dir>]
 *
 * It boots headless Chromium through the DevTools protocol, with no test
 * framework and no npm install, and checks the content and the game flow of
 * both pages plus the portal links. The recordings are real MP3 files, so it
 * checks that every clip exists, that the right one is requested when a word
 * is tapped, and that the browser actually starts playing it. At the end it
 * opens a copy of the colours page without its assets folder and checks the
 * no-sound fallback.
 *
 * --shots saves PNG screenshots so a human can eyeball the design.
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

const requireFrom = createRequire(import.meta.url);
const COLORS = requireFrom("./colores/datos.js");
const NUMBERS = requireFrom("./numeros/datos.js");
const WORDS = Object.fromEntries(NUMBERS.map((item) => [item.n, item.fr]));
const PHRASE_BY_WORD = Object.fromEntries(
  [...COLORS, ...NUMBERS].map((item) => [item.fr, item.phrase])
);

const PAGES = {
  colores: `file://${join(here, "colores/index.html")}`,
  numeros: `file://${join(here, "numeros/index.html")}`,
  portal: `file://${join(root, "index.html")}`
};

const shotsIndex = process.argv.indexOf("--shots");
const shotsDir = shotsIndex > -1 ? resolve(process.argv[shotsIndex + 1]) : null;

const failures = [];
const passes = [];
const check = (condition, label, detail) => {
  if (condition) passes.push(label);
  else failures.push(detail === undefined ? label : `${label} :: ${detail}`);
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// Headless Chromium in this machine has no audio output, so sound cannot be
// heard: the check records the play() orders and verifies the MP3 is loaded and
// decodable, which is what the page is responsible for.
const PLAY_RECORDER = `
(() => {
  window.__plays = [];
  const original = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.__plays.push(this.src);
    try {
      return original.apply(this, arguments) || Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  };
})();
`;

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

async function boot() {
  const profile = await mkdtemp(join(tmpdir(), "frances-check-"));
  const port = 9500 + (process.pid % 300);
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
      "--window-size=900,1250",
      "--allow-file-access-from-files",
      "about:blank"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let target = null;
  for (let attempt = 0; attempt < 160 && !target; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl) || null;
    } catch (error) {
      /* not up yet */
    }
    if (!target) await sleep(120);
  }
  if (!target) throw new Error("Chromium never opened the DevTools endpoint");

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
      if (message.error) reject(new Error(message.error.message));
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

  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(
        `The page threw: ${response.exceptionDetails.exception?.description || response.exceptionDetails.text}`
      );
    }
    return response.result.value;
  };

  const waitFor = async (expression, label, attempts = 100) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (await evaluate(expression)) return true;
      await sleep(100);
    }
    check(false, `esperaba: ${label}`);
    return false;
  };

  const shot = async (name) => {
    if (!shotsDir) return;
    await mkdir(shotsDir, { recursive: true });
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(shotsDir, `${name}.png`), Buffer.from(data, "base64"));
  };

  const viewport = (width, height) =>
    send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 500
    });

  const goto = async (url, ready) => {
    await send("Page.navigate", { url });
    await waitFor(ready, `carga de ${url.split("/").slice(-2).join("/")}`);
    await sleep(150);
  };

  const click = async (selector) => {
    const clicked = await evaluate(
      `(() => { const node = document.querySelector(${JSON.stringify(selector)});
        if (!node) return false; node.click(); return true; })()`
    );
    if (!clicked) check(false, `no encontré ${selector}`);
    await sleep(80);
    return clicked;
  };

  const text = (selector) =>
    evaluate(
      `(() => { const node = document.querySelector(${JSON.stringify(selector)});
        return node ? node.textContent.replace(/\\s+/g, " ").trim() : null; })()`
    );

  const submitWrite = (value) =>
    evaluate(`(() => {
      const input = document.getElementById("write-input");
      input.value = ${JSON.stringify(value)};
      document.querySelector("[data-form=write]").requestSubmit();
      return true;
    })()`);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PLAY_RECORDER });
  await viewport(900, 1250);

  return {
    evaluate,
    waitFor,
    shot,
    viewport,
    goto,
    click,
    text,
    submitWrite,
    consoleErrors,
    close: () => {
      socket.close();
      chrome.kill("SIGKILL");
    }
  };
}

/* ----------------------------------------------------------------- audio ---- */

const slug = (word) => word.replace(/\s+/g, "-");
const clipPath = (activity, file) => join(here, activity, "assets/audio", file);
const clipFiles = (word) => [`${slug(word)}.mp3`, `${slug(word)}-phrase.mp3`];

const READ_AUDIO = `(() => {
  const audio = document.getElementById("audio");
  return audio ? {
    src: audio.src,
    currentTime: audio.currentTime,
    paused: audio.paused,
    readyState: audio.readyState,
    duration: audio.duration
  } : null;
})()`;

async function playedClip(api, activity, word, suffix = "") {
  const expected = `/${activity}/assets/audio/${slug(word)}${suffix}.mp3`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await api.evaluate(`(() => ({
      audio: ${READ_AUDIO.trim()},
      plays: window.__plays.slice(-3)
    }))()`);
    const loaded = state.audio && state.audio.readyState >= 3 && state.audio.src.endsWith(expected);
    const ordered = state.plays.some((entry) => entry.endsWith(expected));
    if (loaded && ordered) return { ...state.audio, ordered: true };
    await sleep(100);
  }
  const state = await api.evaluate(`(() => ({ audio: ${READ_AUDIO.trim()}, plays: window.__plays.slice(-3) }))()`);
  return { ...(state.audio || {}), ordered: false, plays: state.plays };
}

function clipsPresent(activity, words) {
  const missing = [];
  for (const word of words) {
    for (const file of clipFiles(word)) {
      const full = clipPath(activity, file);
      if (!existsSync(full) || statSync(full).size < 800) missing.push(file);
    }
  }
  return missing;
}

/* ---------------------------------------------------------------- colors ---- */

const READ_COLOR_ROUND = `(() => {
  const prompt = document.querySelector(".prompt");
  const swatch = prompt.querySelector(".prompt__swatch");
  const word = prompt.querySelector(".prompt__word");
  const say = prompt.querySelector("[data-say]");
  return {
    swatchLabel: swatch ? swatch.getAttribute("aria-label") : null,
    word: word ? word.textContent.trim() : null,
    say: say ? say.dataset.say : null,
    kind: say ? say.dataset.kind || "word" : null,
    question: prompt.querySelector(".prompt__question").textContent.trim(),
    options: [...document.querySelectorAll(".option")].map((node) => node.dataset.value)
  };
})()`;

function colorTarget(round) {
  if (round.swatchLabel) {
    const es = round.swatchLabel.replace(/^Color\s+/i, "");
    return COLORS.find((color) => color.es === es)?.fr || null;
  }
  if (round.say) return round.say;
  if (round.word) {
    return (
      COLORS.find((color) => color.fr === round.word)?.fr ||
      COLORS.find((color) => color.es === round.word)?.fr ||
      null
    );
  }
  return null;
}

const READ_FEEDBACK = `(() => {
  const feedback = document.querySelector(".feedback");
  return {
    tone: feedback ? feedback.dataset.tone : null,
    message: feedback ? feedback.textContent.replace(/\\s+/g, " ").trim() : null,
    bad: !!document.querySelector(".option.is-bad"),
    ok: !!document.querySelector(".option.is-ok"),
    blocked: [...document.querySelectorAll(".option")].every((node) => node.disabled),
    next: !!document.querySelector("[data-action=next]")
  };
})()`;

async function colors(api) {
  await api.goto(PAGES.colores, "document.querySelectorAll('.mode').length === 5");

  const home = await api.evaluate(`(() => ({
    title: document.title,
    heading: document.querySelector("h1").textContent.replace(/\\s+/g, " ").trim(),
    modes: [...document.querySelectorAll(".mode")].map((node) => node.dataset.action),
    brand: document.querySelector(".brand").getAttribute("href"),
    banner: !!document.querySelector(".banner")
  }))()`);
  check(/colores en francés/i.test(home.title), "colores: el título nombra los colores", home.title);
  check(home.heading === "Los colores", "colores: el título grande es «Los colores»", home.heading);
  check(
    home.modes.join(",") === "study,quiz,memory,listen,phrase",
    "colores: ofrece tarjetas, quiz, parejas, escucha y frases",
    home.modes.join(",")
  );
  check(home.brand === "../../../../index.html", "colores: vuelve al menú del portal", home.brand);
  check(
    existsSync(resolve(join(here, "colores"), home.brand)),
    "colores: el enlace de vuelta apunta a un fichero que existe",
    resolve(join(here, "colores"), home.brand)
  );
  check(!home.banner, "colores: con voz en francés no hay aviso de sonido");
  await api.shot("colores-01-menu");

  await api.click('[data-action="study"]');
  const cards = await api.evaluate(`(() => [...document.querySelectorAll(".color-card")].map((node) => ({
    fr: node.querySelector(".color-card__fr").textContent,
    es: node.querySelector(".color-card__es").textContent,
    hex: node.querySelector(".color-card__swatch").style.backgroundColor
  })))()`);
  check(cards.length === 11, "colores: once tarjetas", `${cards.length}`);
  check(
    cards.map((card) => card.fr).join(",") === COLORS.map((color) => color.fr).join(","),
    "colores: los once colores en francés, en orden",
    cards.map((card) => card.fr).join(",")
  );
  check(
    cards.every((card) => card.hex && card.hex !== ""),
    "colores: cada tarjeta pinta su color",
    JSON.stringify(cards.map((card) => card.hex))
  );
  await api.shot("colores-02-tarjetas");

  check(
    clipsPresent("colores", COLORS.map((color) => color.fr)).length === 0,
    "colores: existen las 22 grabaciones (palabras y frases)",
    clipsPresent("colores", COLORS.map((color) => color.fr)).join(",")
  );

  const sentence = COLORS.find((color) => color.fr === "rouge").phrase;
  const shownSentence = await api.text('.phrase[data-say="rouge"]');
  check(
    shownSentence.includes(sentence.fr) && shownSentence.includes(sentence.es),
    "colores: la tarjeta enseña la frase y su traducción",
    shownSentence
  );

  await api.click('.phrase[data-say="rouge"]');
  const sentenceClip = await playedClip(api, "colores", "rouge", "-phrase");
  check(
    Boolean(sentenceClip) && sentenceClip.src.endsWith("/colores/assets/audio/rouge-phrase.mp3"),
    "colores: la frase de «rouge» pide su grabación",
    JSON.stringify(sentenceClip)
  );
  check(
    Boolean(sentenceClip) && sentenceClip.readyState >= 3 && sentenceClip.ordered,
    "colores: la grabación de la frase se carga y recibe la orden",
    JSON.stringify(sentenceClip)
  );

  await api.click('.color-card__main[data-say="rouge"]');
  const rouge = await playedClip(api, "colores", "rouge");
  check(
    Boolean(rouge) && rouge.src.endsWith("/colores/assets/audio/rouge.mp3"),
    "colores: la tarjeta de «rouge» pide su grabación",
    JSON.stringify(rouge)
  );
  check(
    Boolean(rouge) && rouge.readyState >= 3 && rouge.duration > 0.2,
    "colores: la grabación de «rouge» se carga entera",
    JSON.stringify(rouge)
  );
  check(
    Boolean(rouge) && rouge.ordered,
    "colores: el navegador recibe la orden de reproducir «rouge»",
    JSON.stringify(rouge)
  );

  // Two quiz rounds: one right, one wrong, both with their correction.
  await api.click('[data-action="home"]');
  await api.click('[data-action="quiz"]');
  await api.waitFor("!!document.querySelector('.option')", "el quiz de colores arranca");
  await api.shot("colores-03-quiz");

  const first = await api.evaluate(READ_COLOR_ROUND);
  const target = colorTarget(first);
  check(Boolean(target), "colores: la pregunta dice qué color pide", JSON.stringify(first));
  check(first.options.length === 4, "colores: cuatro opciones", JSON.stringify(first.options));
  check(new Set(first.options).size === 4, "colores: no repite opciones", JSON.stringify(first.options));
  check(first.options.includes(target), "colores: la respuesta buena está entre las opciones");

  await api.click(`.option[data-value="${target}"]`);
  const right = await api.evaluate(READ_FEEDBACK);
  check(right.tone === "ok", "colores: el acierto se marca bien", right.tone);
  check(right.ok && !right.bad, "colores: el acierto pinta la opción buena");
  check(/¡Bien!/.test(right.message || ""), "colores: el acierto se celebra", right.message);
  check(right.blocked, "colores: tras responder no se puede volver a elegir");
  check(right.next, "colores: tras responder hay botón de seguir");
  check(
    (await api.evaluate("document.getElementById('stat-stars').textContent")) === "1",
    "colores: un acierto da una estrella"
  );

  const targetSentence = COLORS.find((color) => color.fr === target).phrase;
  const shownInFeedback = await api.text(".feedback__phrase");
  check(
    Boolean(shownInFeedback) &&
      shownInFeedback.includes(targetSentence.fr) &&
      shownInFeedback.includes(targetSentence.es),
    "colores: la corrección trae la frase de ejemplo",
    shownInFeedback
  );

  await api.click('[data-action="speak"][data-kind="phrase"]');
  const replay = await playedClip(api, "colores", target, "-phrase");
  check(
    Boolean(replay) && replay.src.endsWith(`/colores/assets/audio/${slug(target)}-phrase.mp3`),
    "colores: la frase se puede volver a escuchar desde la corrección",
    JSON.stringify(replay)
  );

  await api.click('[data-action="next"]');
  const second = await api.evaluate(READ_COLOR_ROUND);
  const nextTarget = colorTarget(second);
  const wrong = second.options.find((value) => value !== nextTarget);
  await api.click(`.option[data-value="${wrong}"]`);
  const messed = await api.evaluate(READ_FEEDBACK);
  check(messed.tone === "bad", "colores: el fallo se marca como error", messed.tone);
  check(messed.bad && messed.ok, "colores: al fallar se marcan el fallo y la respuesta buena");
  check(/Casi…/.test(messed.message || ""), "colores: al fallar se dice «Casi»", messed.message);
  check(
    (messed.message || "").includes(nextTarget),
    "colores: al fallar se enseña la respuesta correcta",
    messed.message
  );
  check(
    (await api.evaluate("document.getElementById('stat-streak').textContent")) === "1",
    "colores: la mejor racha conserva el acierto anterior"
  );
  await api.shot("colores-04-fallo");

  await api.click('[data-action="next"]');
  const third = await api.evaluate(READ_COLOR_ROUND);
  check(
    (await api.evaluate("document.querySelector('.progress').textContent")).includes("3 de 10"),
    "colores: el contador de preguntas avanza"
  );
  check(Boolean(colorTarget(third)), "colores: la tercera pregunta también se entiende");
  await api.click('[data-action="home"]');

  // Memory: flip two cards, see them open, and see them close again on a miss.
  await api.click('[data-action="memory"]');
  await api.waitFor("document.querySelectorAll('.memory-card').length === 12", "doce cartas de parejas");
  const start = await api.evaluate(`(() => ({
    cards: document.querySelectorAll(".memory-card").length,
    hidden: [...document.querySelectorAll(".memory-card")].every((node) => node.dataset.action === "flip")
  }))()`);
  check(start.cards === 12, "parejas: doce cartas", `${start.cards}`);
  check(start.hidden, "parejas: todas empiezan boca abajo");
  await api.shot("colores-05-parejas");

  const labels = [];
  for (const index of [0, 1]) {
    await api.click(`[data-index="${index}"]`);
    labels.push(await api.evaluate(`document.querySelector('[data-index="${index}"]')?.getAttribute("aria-label")`));
  }
  check(
    labels.every((label) => label && !label.startsWith("Carta boca abajo")),
    "parejas: las dos cartas se destapan al tocarlas",
    JSON.stringify(labels)
  );
  check(
    (await api.text(".progress")).includes("Intentos 1"),
    "parejas: el primer par cuenta como intento",
    await api.text(".progress")
  );

  const announced = await api.evaluate(`(() => [...document.querySelectorAll(".lead")]
    .map((node) => node.textContent).join(" "))()`);
  check(
    /pareja/i.test(announced),
    "parejas: se dice si era pareja o no",
    announced
  );

  await sleep(1300);
  const after = await api.evaluate(`(() => ({
    open: [...document.querySelectorAll(".memory-card")].filter((node) => node.classList.contains("is-open")).length,
    done: [...document.querySelectorAll(".memory-card")].filter((node) => node.classList.contains("is-done")).length
  }))()`);
  check(
    (after.open === 0 && after.done === 0) || after.done === 2,
    "parejas: si no son pareja se cierran, y si lo son se quedan",
    JSON.stringify(after)
  );

  // Listen mode speaks the colour and can be answered.
  await api.click('[data-action="home"]');
  await api.click('[data-action="listen"]');
  await api.waitFor("!!document.querySelector('[data-action=speak]')", "el modo escucha arranca");
  const listenRound = await api.evaluate(READ_COLOR_ROUND);
  check(listenRound.say, "escucha: hay un color que suena", JSON.stringify(listenRound));
  check(
    listenRound.question === "Escucha el color y elige cuál es.",
    "escucha: la consigna es clara",
    listenRound.question
  );
  const heard = await playedClip(api, "colores", listenRound.say);
  check(
    Boolean(heard) && heard.src.endsWith(`/colores/assets/audio/${slug(listenRound.say)}.mp3`),
    "escucha: suena la grabación del color preguntado",
    JSON.stringify(heard)
  );
  check(
    Boolean(heard) && heard.ordered && heard.readyState >= 3,
    "escucha: la grabación arranca sola al empezar",
    JSON.stringify(heard)
  );
  await api.click(`.option[data-value="${listenRound.say}"]`);
  check(
    /¡Bien!/.test((await api.evaluate(READ_FEEDBACK)).message || ""),
    "escucha: acertar se celebra"
  );
  await api.shot("colores-06-escucha");
  await api.click('[data-action="home"]');
}

async function colorsPhrases(api) {
  await api.click('[data-action="phrase"]');
  await api.waitFor(
    "document.querySelector('.prompt__question')?.textContent.includes('la frase')",
    "el modo frases de colores arranca"
  );

  const round = await api.evaluate(READ_COLOR_ROUND);
  check(round.say && round.kind === "phrase", "frases: la ronda trae la frase grabada", JSON.stringify(round));
  check(
    round.question === "Escucha la frase y elige el color que nombra.",
    "frases: la consigna pide el color de la frase",
    round.question
  );
  check(
    round.options.length === 4 && round.options.includes(round.say),
    "frases: cuatro colores y el correcto entre ellos",
    JSON.stringify(round.options)
  );

  const swatches = await api.evaluate("document.querySelectorAll('.option .option__swatch').length");
  check(swatches === 4, "frases: las opciones son colores, no palabras", `${swatches}`);

  const heard = await playedClip(api, "colores", round.say, "-phrase");
  check(
    Boolean(heard) && heard.src.endsWith(`/colores/assets/audio/${slug(round.say)}-phrase.mp3`),
    "frases: suena la frase al empezar",
    JSON.stringify(heard)
  );
  await api.shot("colores-07-frases");

  await api.click(`.option[data-value="${round.say}"]`);
  const answered = await api.evaluate(READ_FEEDBACK);
  check(/¡Bien!/.test(answered.message || ""), "frases: acertar se celebra", answered.message);
  check(
    (await api.text(".feedback__phrase") || "").includes(PHRASE_BY_WORD[round.say].fr),
    "frases: la corrección enseña la frase entera",
    await api.text(".feedback__phrase")
  );

  await api.click('[data-action="next"]');
  const second = await api.evaluate(READ_COLOR_ROUND);
  check(second.kind === "phrase", "frases: la ronda siguiente sigue siendo de frases", JSON.stringify(second));
  await api.click('[data-action="home"]');
}

/* --------------------------------------------------------------- numbers ---- */

const READ_NUMBER_ROUND = `(() => {
  const prompt = document.querySelector(".prompt");
  const number = prompt.querySelector(".prompt__number");
  const word = prompt.querySelector(".prompt__word");
  const say = prompt.querySelector("[data-say]");
  return {
    number: number ? Number(number.textContent.trim()) : null,
    word: word ? word.textContent.trim() : null,
    say: say ? say.dataset.say : null,
    kind: say ? say.dataset.kind || "word" : null,
    question: prompt.querySelector(".prompt__question").textContent.trim(),
    options: [...document.querySelectorAll(".option")].map((node) => node.dataset.value)
  };
})()`;

function numberTarget(round) {
  if (round.number) return WORDS[round.number];
  return round.word || round.say || null;
}

async function numbers(api) {
  await api.goto(PAGES.numeros, "document.querySelectorAll('.mode').length === 5");

  const home = await api.evaluate(`(() => ({
    title: document.title,
    heading: document.querySelector("h1").textContent.replace(/\\s+/g, " ").trim(),
    modes: [...document.querySelectorAll(".mode")].map((node) => node.dataset.action),
    brand: document.querySelector(".brand").getAttribute("href")
  }))()`);
  check(/números del 1 al 30/i.test(home.title), "números: el título nombra el 1 al 30", home.title);
  check(home.heading === "Del 1 al 30", "números: el título grande es «Del 1 al 30»", home.heading);
  check(
    home.modes.join(",") === "study,quiz,write,listen,phrase",
    "números: ofrece tarjetas, quiz, escribir, escucha y frases",
    home.modes.join(",")
  );
  check(home.brand === "../../../../index.html", "números: vuelve al menú del portal", home.brand);
  check(
    existsSync(resolve(join(here, "numeros"), home.brand)),
    "números: el enlace de vuelta apunta a un fichero que existe",
    resolve(join(here, "numeros"), home.brand)
  );
  await api.shot("numeros-01-menu");

  await api.click('[data-action="study"]');
  const study = await api.evaluate(`(() => ({
    cards: [...document.querySelectorAll(".number-card")].map((node) => ({
      n: Number(node.querySelector(".number-card__n").textContent),
      fr: node.querySelector(".number-card__fr").textContent
    })),
    groups: [...document.querySelectorAll(".group-title")].map((node) => node.textContent.trim()),
    tricks: document.querySelectorAll(".trick li").length
  }))()`);
  check(study.cards.length === 30, "números: hay 30 tarjetas", `${study.cards.length}`);
  check(
    study.cards.map((card) => card.n).join(",") === Object.keys(WORDS).join(","),
    "números: van del 1 al 30 sin saltos",
    study.cards.map((card) => card.n).join(",")
  );
  check(
    study.cards.every((card) => card.fr === WORDS[card.n]),
    "números: cada número tiene su palabra francesa",
    JSON.stringify(study.cards.filter((card) => card.fr !== WORDS[card.n]))
  );
  check(study.groups.length === 3, "números: tres grupos de diez", JSON.stringify(study.groups));
  check(study.tricks === 4, "números: hay trucos de escritura", `${study.tricks}`);
  await api.shot("numeros-02-tarjetas");

  check(
    clipsPresent("numeros", Object.values(WORDS)).length === 0,
    "números: existen las 60 grabaciones (palabras y frases)",
    clipsPresent("numeros", Object.values(WORDS)).join(",")
  );

  const rows = await api.evaluate(`(() => [...document.querySelectorAll(".phrase-row")].map((node) => ({
    say: node.dataset.say,
    kind: node.dataset.kind,
    text: node.textContent.replace(/\\s+/g, " ").trim()
  })))()`);
  check(rows.length === 30, "números: hay 30 frases de ejemplo", `${rows.length}`);
  check(
    rows.every((row) => row.kind === "phrase" && row.text.includes(PHRASE_BY_WORD[row.say].fr)),
    "números: cada frase aparece con su número",
    JSON.stringify(rows.filter((row) => !row.text.includes(PHRASE_BY_WORD[row.say]?.fr ?? "?")))
  );

  await api.click('.phrase-row[data-say="dix-sept"]');
  const numberSentence = await playedClip(api, "numeros", "dix-sept", "-phrase");
  check(
    Boolean(numberSentence) &&
      numberSentence.src.endsWith("/numeros/assets/audio/dix-sept-phrase.mp3") &&
      numberSentence.readyState >= 3 &&
      numberSentence.ordered,
    "números: la frase del 17 se carga y recibe la orden",
    JSON.stringify(numberSentence)
  );

  await api.click('.number-card[data-say="dix-sept"]');
  const seventeen = await playedClip(api, "numeros", "dix-sept");
  check(
    Boolean(seventeen) && seventeen.src.endsWith("/numeros/assets/audio/dix-sept.mp3"),
    "números: la tarjeta del 17 pide su grabación",
    JSON.stringify(seventeen)
  );
  check(
    Boolean(seventeen) && seventeen.readyState >= 3 && seventeen.duration > 0.2,
    "números: la grabación del 17 se carga entera",
    JSON.stringify(seventeen)
  );
  check(
    Boolean(seventeen) && seventeen.ordered,
    "números: el navegador recibe la orden de reproducir «dix-sept»",
    JSON.stringify(seventeen)
  );

  // Quiz in both directions: one right, one wrong.
  await api.click('[data-action="home"]');
  await api.click('[data-action="quiz"]');
  await api.waitFor("!!document.querySelector('.option')", "el quiz de números arranca");
  const first = await api.evaluate(READ_NUMBER_ROUND);
  const target = numberTarget(first);
  check(Boolean(target), "números: la pregunta dice qué número pide", JSON.stringify(first));
  check(first.options.length === 4, "números: cuatro opciones", JSON.stringify(first.options));
  check(new Set(first.options).size === 4, "números: no repite opciones", JSON.stringify(first.options));
  check(first.options.includes(target), `números: ${target} está entre las opciones`);

  await api.click(`.option[data-value="${target}"]`);
  const right = await api.evaluate(READ_FEEDBACK);
  check(right.tone === "ok", "números: el acierto se marca bien", right.tone);
  check(right.blocked && right.next, "números: tras responder se bloquea y se puede seguir");
  check(
    Boolean(await api.text(".feedback__phrase")) &&
      (await api.text(".feedback__phrase")).includes(PHRASE_BY_WORD[target].fr),
    "números: la corrección trae la frase de ejemplo",
    await api.text(".feedback__phrase")
  );

  await api.click('[data-action="next"]');
  const second = await api.evaluate(READ_NUMBER_ROUND);
  const wrongTarget = numberTarget(second);
  await api.click(`.option[data-value="${second.options.find((value) => value !== wrongTarget)}"]`);
  const messed = await api.evaluate(READ_FEEDBACK);
  check(messed.tone === "bad", "números: el fallo se marca como error", messed.tone);
  check(
    (messed.message || "").includes(wrongTarget),
    "números: al fallar se enseña cómo se escribe",
    messed.message
  );
  await api.shot("numeros-03-quiz");
  await api.click('[data-action="home"]');

  // Writing: a miss, a hit with hyphens, a hit with spaces instead of hyphens.
  await api.click('[data-action="write"]');
  await api.waitFor("!!document.getElementById('write-input')", "el modo escribir arranca");

  const expected = WORDS[Number(await api.text(".prompt__number"))];
  await api.submitWrite("nada");
  await sleep(120);
  const failed = await api.evaluate(READ_FEEDBACK);
  check(failed.tone === "bad", "escribir: un fallo se avisa", failed.tone);
  check((failed.message || "").includes(expected), "escribir: el fallo enseña la palabra", failed.message);
  check(
    (await api.text(".feedback__phrase") || "").includes(PHRASE_BY_WORD[expected].fr),
    "escribir: la corrección trae la frase de ejemplo",
    await api.text(".feedback__phrase")
  );
  check(
    (await api.evaluate("document.getElementById('write-input').disabled")) === true,
    "escribir: tras comprobar el campo queda bloqueado"
  );
  await api.shot("numeros-04-escribir-fallo");

  await api.click('[data-action="next"]');
  const secondWord = WORDS[Number(await api.text(".prompt__number"))];
  await api.submitWrite(secondWord.toUpperCase());
  await sleep(120);
  check(
    /¡Bien escrito!/.test((await api.text(".feedback")) || ""),
    "escribir: las mayúsculas no cuentan",
    await api.text(".feedback")
  );

  await api.click('[data-action="next"]');
  const thirdWord = WORDS[Number(await api.text(".prompt__number"))];
  await api.submitWrite(thirdWord.replace(/-/g, " "));
  await sleep(120);
  check(
    /¡Bien escrito!/.test((await api.text(".feedback")) || ""),
    "escribir: los espacios valen por los guiones",
    `«${thirdWord.replace(/-/g, " ")}» → ${await api.text(".feedback")}`
  );

  await api.click('[data-action="next"]');
  check(
    (await api.evaluate("document.getElementById('write-input').value")) === "",
    "escribir: la siguiente pregunta empieza vacía"
  );
  check(
    (await api.evaluate("document.getElementById('stat-stars').textContent")) === "3",
    "escribir: suma las estrellas del quiz y de la escritura"
  );
  await api.click('[data-action="home"]');

  // Listen mode.
  await api.click('[data-action="listen"]');
  await api.waitFor("!!document.querySelector('[data-action=speak]')", "el modo escucha de números arranca");
  const listenRound = await api.evaluate(READ_NUMBER_ROUND);
  check(listenRound.say, "escucha: hay un número que suena", JSON.stringify(listenRound));
  const heardNumber = await playedClip(api, "numeros", listenRound.say);
  check(
    Boolean(heardNumber) && heardNumber.src.endsWith(`/numeros/assets/audio/${slug(listenRound.say)}.mp3`),
    "escucha: suena la grabación del número preguntado",
    JSON.stringify(heardNumber)
  );
  await api.click(`.option[data-value="${listenRound.say}"]`);
  check(
    /¡Bien!/.test((await api.evaluate(READ_FEEDBACK)).message || ""),
    "escucha: acertar un número se celebra"
  );
  await api.shot("numeros-05-escucha");
  await api.click('[data-action="home"]');
}

async function numbersPhrases(api) {
  await api.click('[data-action="phrase"]');
  await api.waitFor(
    "document.querySelector('.prompt__question')?.textContent.includes('la frase')",
    "el modo frases de números arranca"
  );

  const round = await api.evaluate(READ_NUMBER_ROUND);
  check(round.say && round.kind === "phrase", "frases: la ronda trae la frase grabada", JSON.stringify(round));
  check(
    round.question === "Escucha la frase y elige el número que nombra.",
    "frases: la consigna pide el número de la frase",
    round.question
  );
  check(
    round.options.length === 4 && round.options.includes(round.say),
    "frases: cuatro números y el correcto entre ellos",
    JSON.stringify(round.options)
  );

  const numerals = await api.evaluate("document.querySelectorAll('.option .option__number').length");
  check(numerals === 4, "frases: las opciones son números, no palabras", `${numerals}`);

  const heard = await playedClip(api, "numeros", round.say, "-phrase");
  check(
    Boolean(heard) && heard.src.endsWith(`/numeros/assets/audio/${slug(round.say)}-phrase.mp3`),
    "frases: suena la frase al empezar",
    JSON.stringify(heard)
  );
  await api.shot("numeros-06-frases");

  await api.click(`.option[data-value="${round.say}"]`);
  const answered = await api.evaluate(READ_FEEDBACK);
  check(/¡Bien!/.test(answered.message || ""), "frases: acertar se celebra", answered.message);
  check(
    (await api.text(".feedback__phrase") || "").includes(PHRASE_BY_WORD[round.say].fr),
    "frases: la corrección enseña la frase entera",
    await api.text(".feedback__phrase")
  );

  await api.click('[data-action="next"]');
  check(
    (await api.evaluate("document.querySelectorAll('.option .option__number').length")) === 4,
    "frases: la ronda siguiente sigue siendo de frases"
  );
  await api.click('[data-action="home"]');
}

/* ---------------------------------------------------------------- portal ---- */

async function portal(api) {
  await api.goto(PAGES.portal, "document.querySelectorAll('.subject').length === 2");

  const data = await api.evaluate(`(() => {
    const french = document.querySelector(".subject--fr");
    return {
      count: french.querySelector(".subject__count").textContent.trim(),
      cards: [...french.querySelectorAll(".activity")].map((node) => ({
        tag: node.tagName,
        title: node.querySelector(".activity__title").textContent.trim(),
        href: node.getAttribute("href"),
        soon: node.classList.contains("activity--soon")
      }))
    };
  })()`);

  check(data.count === "2 actividades", "portal: Francés cuenta 2 actividades", data.count);
  check(data.cards.length === 2, "portal: dos tarjetas en Francés", JSON.stringify(data.cards));
  check(data.cards.every((card) => card.tag === "A"), "portal: las dos tarjetas son enlaces");
  check(data.cards.every((card) => !card.soon), "portal: no queda ninguna tarjeta «Pronto»");
  check(
    data.cards.map((card) => card.title).join(",") === "Colores,Números del 1 al 30",
    "portal: los títulos son Colores y Números del 1 al 30",
    data.cards.map((card) => card.title).join(",")
  );
  check(
    data.cards[0].href === "primaria/5/frances/colores/index.html" &&
      data.cards[1].href === "primaria/5/frances/numeros/index.html",
    "portal: los enlaces apuntan a las páginas nuevas",
    JSON.stringify(data.cards.map((card) => card.href))
  );
  check(
    data.cards.every((card) => existsSync(join(root, card.href))),
    "portal: los ficheros enlazados existen"
  );
  await api.shot("portal-01-escritorio");

  await api.click(".subject--fr .activity");
  await api.waitFor("document.title.includes('colores')", "el enlace abre Colores");
  check(
    await api.evaluate("location.pathname.endsWith('/primaria/5/frances/colores/index.html')"),
    "portal: el enlace de Colores navega de verdad",
    await api.evaluate("location.pathname")
  );

  // El camino de vuelta: la cabecera de una actividad regresa al menú principal.
  await api.click(".brand");
  await api.waitFor("document.title.includes('Aprende como puedas')", "la cabecera vuelve al portal");
  check(
    (await api.evaluate("location.pathname.endsWith('/index.html') && !location.pathname.includes('/primaria/')")),
    "portal: la cabecera de una actividad regresa al menú principal",
    await api.evaluate("location.pathname")
  );
}

/* ----------------------------------------------------------------- móvil ---- */

async function mobile(api) {
  await api.viewport(390, 844);
  for (const [name, url, ready] of [
    ["colores", PAGES.colores, "document.querySelectorAll('.mode').length === 5"],
    ["numeros", PAGES.numeros, "document.querySelectorAll('.mode').length === 5"],
    ["portal", PAGES.portal, "document.querySelectorAll('.subject').length === 2"]
  ]) {
    await api.goto(url, ready);
    const box = await api.evaluate(`(() => ({
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth,
      wide: [...document.querySelectorAll("body *")]
        .filter((node) => node.getBoundingClientRect().width > window.innerWidth + 1)
        .slice(0, 3)
        .map((node) => node.className || node.tagName)
    }))()`);
    check(box.scroll <= box.width + 1, `${name}: en 390 px no hay scroll horizontal`, JSON.stringify(box));
    await api.shot(`${name}-movil`);
  }

  await api.goto(PAGES.numeros, "document.querySelectorAll('.mode').length === 5");
  await api.click('[data-action="study"]');
  await api.waitFor("document.querySelectorAll('.number-card').length === 30", "las 30 tarjetas en móvil");
  const grid = await api.evaluate(`(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
    columns: getComputedStyle(document.querySelector(".number-grid")).gridTemplateColumns.split(" ").length
  }))()`);
  check(grid.scroll <= grid.width + 1, "números en móvil: la rejilla no desborda", JSON.stringify(grid));
  check(grid.columns >= 3, "números en móvil: la rejilla usa varias columnas", JSON.stringify(grid));
  await api.shot("numeros-movil-tarjetas");

  await api.evaluate(`(() => { document.querySelector(".phrases-card").scrollIntoView(); return true; })()`);
  await sleep(150);
  await api.shot("numeros-movil-frases");
}

/* ------------------------------------------------------- sin grabaciones ---- */

async function withoutClips() {
  const api = await boot();
  try {
    // A copy without its assets folder: the fallback is what a half-copied
    // activity looks like. Chromium (snap) cannot read /tmp or hidden folders
    // in $HOME, so use a plain folder there and remove it afterwards.
    const scratch = await mkdtemp(join(homedir(), "frances-sin-audio-"));
    await copyFile(join(here, "colores/index.html"), join(scratch, "index.html"));
    await copyFile(join(here, "colores/datos.js"), join(scratch, "datos.js"));
    await api.goto(`file://${join(scratch, "index.html")}`, "document.querySelectorAll('.mode').length === 5");

    const state = await api.evaluate(`(() => ({
      disabled: document.querySelector(".mode--listen").disabled,
      banner: !!document.querySelector(".banner"),
      footnote: document.getElementById("footnote").textContent.trim(),
      cards: document.querySelectorAll(".color-card").length
    }))()`);
    check(state.disabled, "sin grabaciones: el modo Escucha queda apagado", JSON.stringify(state));
    check(state.banner, "sin grabaciones: se avisa en el menú", JSON.stringify(state));
    check(/grabaciones/i.test(state.footnote), "sin grabaciones: la nota lo explica", state.footnote);
    check(state.cards === 0, "sin grabaciones: el menú se dibuja sin tarjetas de colores");

    await api.click('[data-action="study"]');
    await api.click('.color-card__main[data-say="bleu"]');
    check(
      (await api.evaluate("document.querySelectorAll('.color-card').length")) === 11,
      "sin grabaciones: las tarjetas siguen funcionando"
    );

    await api.click('[data-action="home"]');
    await api.click('[data-action="quiz"]');
    await api.waitFor("!!document.querySelector('.option')", "el quiz funciona sin grabaciones");
    check(api.consoleErrors.length === 0, "sin grabaciones: ningún error de consola", JSON.stringify(api.consoleErrors.slice(0, 3)));
    await rm(scratch, { recursive: true, force: true });
  } finally {
    api.close();
  }
}

/* ------------------------------------------------------------------ main ---- */

const api = await boot();
try {
  await colors(api);
  await colorsPhrases(api);
  await numbers(api);
  await numbersPhrases(api);
  await portal(api);
  await mobile(api);
  check(
    api.consoleErrors.length === 0,
    "ninguna página lanza errores en consola",
    JSON.stringify(api.consoleErrors.slice(0, 4))
  );
} finally {
  api.close();
}

await withoutClips();

if (shotsDir) console.log(`\nCapturas en ${shotsDir}`);
console.log(`\n${passes.length} comprobaciones OK`);
if (failures.length) {
  console.log(`${failures.length} FALLOS:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Todo verde.");
}
