#!/usr/bin/env node
/*
 * Generates the recordings of the two French activities with Microsoft Edge
 * neural voices (via the msedge-tts package) and compresses them with ffmpeg.
 *
 *   npm install                (once, needs internet)
 *   node scripts/generate-audio.mjs                 # everything missing
 *   node scripts/generate-audio.mjs --force rouge   # regenerate one word
 *   node scripts/generate-audio.mjs --list          # show what would be generated
 *
 * Every item gets two clips: the word and one short sentence that uses it:
 *
 *   colores/assets/audio/rouge.mp3
 *   colores/assets/audio/rouge-phrase.mp3
 *   numeros/assets/audio/vingt-et-un.mp3
 *   numeros/assets/audio/vingt-et-un-phrase.mp3
 *
 * The words and sentences are read from each activity's datos.js, the same
 * file the page uses, so the recordings can never drift from what is shown.
 *
 * The speech is requested at a slightly slower rate, which reads better for a
 * child. ffmpeg then converts to mono 32 kbps MP3 with loudness normalisation
 * and silence trimming, exactly like the English activity.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const activityRoot = resolve(here, "..");
const requireFrom = createRequire(join(activityRoot, "noop.js"));

let MsEdgeTTS, OUTPUT_FORMAT;
try {
  ({ MsEdgeTTS, OUTPUT_FORMAT } = requireFrom("msedge-tts"));
} catch {
  console.error(
    "Falta la dependencia msedge-tts. Instálala desde primaria/5/frances\n" +
      "(necesita internet, una sola vez):\n" +
      "  npm install"
  );
  process.exit(1);
}

const COLOR_LIST = requireFrom(join(activityRoot, "colores", "datos.js"));
const NUMBER_LIST = requireFrom(join(activityRoot, "numeros", "datos.js"));

/** Items of one activity, with the two clips every item needs. */
const ACTIVITIES = [
  { name: "colores", items: COLOR_LIST },
  { name: "numeros", items: NUMBER_LIST }
];

const VOICE = process.env.TTS_VOICE || "fr-FR-DeniseNeural";
const RATE = "-8%";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

const slug = (word) => word.replace(/\s+/g, "-");

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const forceIndex = args.indexOf("--force");
const forceTargets = forceIndex > -1
  ? args.slice(forceIndex + 1).filter((arg) => !arg.startsWith("--"))
  : [];

const ffmpegAvailable = (() => {
  try {
    execFileSync(FFMPEG, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
if (!ffmpegAvailable) {
  console.error("No se encontró ffmpeg (instálalo o define FFMPEG_PATH).");
  process.exit(1);
}

/** The word and the sentence of one item. */
const clipsFor = (item) => [
  { file: `${slug(item.fr)}.mp3`, text: item.fr, kind: "palabra" },
  { file: `${slug(item.fr)}-phrase.mp3`, text: item.phrase.fr, kind: "frase" }
];

const jobs = [];
for (const activity of ACTIVITIES) {
  const dir = join(activityRoot, activity.name, "assets", "audio");
  for (const item of activity.items) {
    for (const clip of clipsFor(item)) {
      const target = join(dir, clip.file);
      const forced =
        forceTargets.length === 0 ||
        forceTargets.includes(slug(item.fr)) ||
        forceTargets.includes(item.fr) ||
        forceTargets.includes(clip.file);
      if (forced && !existsSync(target)) {
        jobs.push({ activity, item, clip, target, dir });
      }
    }
  }
}

const countAudio = (dir) => {
  if (!existsSync(dir)) return { clips: 0, bytes: 0 };
  let clips = 0;
  let bytes = 0;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".mp3")) continue;
    clips += 1;
    bytes += statSync(join(dir, file)).size;
  }
  return { clips, bytes };
};

const totalClips = ACTIVITIES.reduce((sum, activity) => sum + activity.items.length * 2, 0);
console.log(`Voz: ${VOICE} · clips previstos: ${totalClips} · a generar: ${jobs.length}`);

if (listOnly) {
  for (const job of jobs.slice(0, 12)) {
    console.log(`  ${job.activity.name}/${job.clip.file}  "${job.clip.text}"`);
  }
  if (jobs.length > 12) console.log(`  … y ${jobs.length - 12} más`);
  for (const activity of ACTIVITIES) {
    const found = countAudio(join(activityRoot, activity.name, "assets", "audio"));
    console.log(
      `  ${activity.name}: ${found.clips}/${activity.items.length * 2} clips, ` +
        `${(found.bytes / 1024).toFixed(0)} KB`
    );
  }
  process.exit(0);
}

if (jobs.length === 0) {
  console.log("Nada que generar: todos los clips existen (usa --force <palabra> para regenerar).");
  process.exit(0);
}

const tts = new MsEdgeTTS();
await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

let done = 0;
const failed = [];
const started = Date.now();

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function synthesize(text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { audioStream } = tts.toStream(text, { rate: RATE });
      const chunks = [];
      await new Promise((resolveStream, rejectStream) => {
        audioStream.on("data", (chunk) => chunks.push(chunk));
        audioStream.on("close", resolveStream);
        audioStream.on("error", rejectStream);
        setTimeout(() => rejectStream(new Error("sin respuesta en 20s")), 20000);
      });
      const raw = Buffer.concat(chunks);
      if (raw.length > 500) return raw;
      throw new Error(`respuesta sospechosamente corta (${raw.length} bytes)`);
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(1200 * attempt);
      // A broken socket sometimes only recovers after renegotiating the session.
      try {
        tts.close();
      } catch {}
      await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    }
  }
  throw new Error("unreachable");
}

for (const job of jobs) {
  const { activity, clip, target, dir } = job;
  try {
    mkdirSync(dir, { recursive: true });
    const raw = await synthesize(clip.text);

    execFileSync(
      FFMPEG,
      [
        "-v", "error",
        "-y",
        "-i", "pipe:0",
        "-ac", "1",
        "-ar", "22050",
        "-b:a", "32k",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11, silenceremove=start_periods=1:start_threshold=-45dB, areverse, silenceremove=start_periods=1:start_threshold=-45dB, areverse",
        "-write_xing", "0",
        "-id3v2_version", "0",
        target
      ],
      { input: raw, stdio: ["pipe", "ignore", "pipe"], maxBuffer: 10 * 1024 * 1024 }
    );

    done += 1;
    console.log(`  ${done}/${jobs.length} ${activity.name}/${clip.file} (${clip.kind})`);
  } catch (error) {
    failed.push(`${activity.name}/${clip.file}: ${error.message}`);
  }
}

tts.close();

console.log(`\nGenerados: ${done} clips · errores: ${failed.length}`);
for (const failure of failed) console.error(`  - ${failure}`);
for (const activity of ACTIVITIES) {
  const found = countAudio(join(activityRoot, activity.name, "assets", "audio"));
  console.log(
    `  ${activity.name}: ${found.clips}/${activity.items.length * 2} clips, ` +
      `${(found.bytes / 1024 / 1024).toFixed(2)} MB`
  );
}
if (done) console.log(`  (${((Date.now() - started) / 1000).toFixed(0)}s)`);
