#!/usr/bin/env node
/*
 * Browser check for the two French activities and their portal entries.
 *
 *   node primaria/5/frances/verificar.mjs [--shots <dir>]
 *
 * It boots headless Chromium through the DevTools protocol, with no test
 * framework and no npm install, and checks the content and the game flow of
 * both pages plus the portal links. Before each page loads it injects a fake
 * French voice, so the "Escucha" mode can be played without speakers; at the
 * end it reloads the colours page without that voice and checks the fallback.
 *
 * --shots saves PNG screenshots so a human can eyeball the design.
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

const COLORS = [
  { fr: "rouge", es: "rojo" },
  { fr: "bleu", es: "azul" },
  { fr: "vert", es: "verde" },
  { fr: "jaune", es: "amarillo" },
  { fr: "orange", es: "naranja" },
  { fr: "violet", es: "violeta" },
  { fr: "rose", es: "rosa" },
  { fr: "marron", es: "marrón" },
  { fr: "gris", es: "gris" },
  { fr: "noir", es: "negro" },
  { fr: "blanc", es: "blanco" }
];

const WORDS = {
  1: "un", 2: "deux", 3: "trois", 4: "quatre", 5: "cinq", 6: "six", 7: "sept",
  8: "huit", 9: "neuf", 10: "dix", 11: "onze", 12: "douze", 13: "treize",
  14: "quatorze", 15: "quinze", 16: "seize", 17: "dix-sept", 18: "dix-huit",
  19: "dix-neuf", 20: "vingt", 21: "vingt et un", 22: "vingt-deux",
  23: "vingt-trois", 24: "vingt-quatre", 25: "vingt-cinq", 26: "vingt-six",
  27: "vingt-sept", 28: "vingt-huit", 29: "vingt-neuf", 30: "trente"
};

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

const VOICE_STUB = `
(() => {
  const voices = [{ name: "Français (prueba)", lang: "fr-FR", default: true, localService: true, voiceURI: "stub:fr" }];
  const spoken = [];
  window.__spoken = spoken;
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => voices,
    speak: (utterance) => { spoken.push({ text: utterance.text, lang: utterance.lang }); },
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    addEventListener: (type, handler) => { if (type === "voiceschanged") setTimeout(handler, 0); },
    removeEventListener: () => {}
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text;
    this.lang = "";
    this.voice = null;
    this.rate = 1;
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

async function boot(withVoice) {
  const profile = await mkdtemp(join(tmpdir(), "frances-check-"));
  const port = 9500 + (process.pid % 300) + (withVoice ? 0 : 40);
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
  if (withVoice) await send("Page.addScriptToEvaluateOnNewDocument", { source: VOICE_STUB });
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
  await api.goto(PAGES.colores, "document.querySelectorAll('.mode').length === 4");

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
    home.modes.join(",") === "study,quiz,memory,listen",
    "colores: ofrece tarjetas, quiz, parejas y escucha",
    home.modes.join(",")
  );
  check(home.brand === "../../../index.html", "colores: vuelve al menú del portal", home.brand);
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

  await api.click('.color-card[data-say="rouge"]');
  const spoken = await api.evaluate("window.__spoken.map((item) => item.text)");
  check(spoken.includes("rouge"), "colores: la tarjeta se puede escuchar", JSON.stringify(spoken));

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
  const spokenNow = await api.evaluate("window.__spoken.map((item) => item.text)");
  check(
    spokenNow[spokenNow.length - 1] === listenRound.say,
    "escucha: el color suena al empezar",
    JSON.stringify(spokenNow.slice(-2))
  );
  await api.click(`.option[data-value="${listenRound.say}"]`);
  check(
    /¡Bien!/.test((await api.evaluate(READ_FEEDBACK)).message || ""),
    "escucha: acertar se celebra"
  );
  await api.shot("colores-06-escucha");
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
    question: prompt.querySelector(".prompt__question").textContent.trim(),
    options: [...document.querySelectorAll(".option")].map((node) => node.dataset.value)
  };
})()`;

function numberTarget(round) {
  if (round.number) return WORDS[round.number];
  return round.word || round.say || null;
}

async function numbers(api) {
  await api.goto(PAGES.numeros, "document.querySelectorAll('.mode').length === 4");

  const home = await api.evaluate(`(() => ({
    title: document.title,
    heading: document.querySelector("h1").textContent.replace(/\\s+/g, " ").trim(),
    modes: [...document.querySelectorAll(".mode")].map((node) => node.dataset.action),
    brand: document.querySelector(".brand").getAttribute("href")
  }))()`);
  check(/números del 1 al 30/i.test(home.title), "números: el título nombra el 1 al 30", home.title);
  check(home.heading === "Del 1 al 30", "números: el título grande es «Del 1 al 30»", home.heading);
  check(
    home.modes.join(",") === "study,quiz,write,listen",
    "números: ofrece tarjetas, quiz, escribir y escucha",
    home.modes.join(",")
  );
  check(home.brand === "../../../index.html", "números: vuelve al menú del portal", home.brand);
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

  await api.click('.number-card[data-say="dix-sept"]');
  check(
    (await api.evaluate("window.__spoken.map((item) => item.text)")).includes("dix-sept"),
    "números: la tarjeta del 17 se puede escuchar"
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
  await api.click(`.option[data-value="${listenRound.say}"]`);
  check(
    /¡Bien!/.test((await api.evaluate(READ_FEEDBACK)).message || ""),
    "escucha: acertar un número se celebra"
  );
  await api.shot("numeros-05-escucha");
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
}

/* ----------------------------------------------------------------- móvil ---- */

async function mobile(api) {
  await api.viewport(390, 844);
  for (const [name, url, ready] of [
    ["colores", PAGES.colores, "document.querySelectorAll('.mode').length === 4"],
    ["numeros", PAGES.numeros, "document.querySelectorAll('.mode').length === 4"],
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

  await api.goto(PAGES.numeros, "document.querySelectorAll('.mode').length === 4");
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
}

/* -------------------------------------------------------- sin voz en el equipo ---- */

async function withoutVoice() {
  const api = await boot(false);
  try {
    await api.goto(PAGES.colores, "document.querySelectorAll('.mode').length === 4");
    const state = await api.evaluate(`(() => ({
      disabled: document.querySelector(".mode--listen").disabled,
      banner: !!document.querySelector(".banner"),
      footnote: document.getElementById("footnote").textContent.trim()
    }))()`);
    check(state.disabled, "sin voz: el modo Escucha queda apagado", JSON.stringify(state));
    check(state.banner, "sin voz: se avisa en el menú", JSON.stringify(state));
    check(/voz en francés/i.test(state.footnote), "sin voz: la nota lo explica", state.footnote);

    await api.click('[data-action="study"]');
    await api.click('.color-card[data-say="bleu"]');
    check(
      (await api.evaluate("document.querySelectorAll('.color-card').length")) === 11,
      "sin voz: las tarjetas siguen funcionando"
    );

    await api.click('[data-action="home"]');
    await api.click('[data-action="quiz"]');
    await api.waitFor("!!document.querySelector('.option')", "el quiz funciona sin voz");
    check(api.consoleErrors.length === 0, "sin voz: ningún error de consola", JSON.stringify(api.consoleErrors.slice(0, 3)));
  } finally {
    api.close();
  }
}

/* ------------------------------------------------------------------ main ---- */

const api = await boot(true);
try {
  await colors(api);
  await numbers(api);
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

await withoutVoice();

if (shotsDir) console.log(`\nCapturas en ${shotsDir}`);
console.log(`\n${passes.length} comprobaciones OK`);
if (failures.length) {
  console.log(`${failures.length} FALLOS:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Todo verde.");
}
