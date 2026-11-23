/*
 * Colour dataset for the activity.
 *
 * Every entry needs:
 *   fr      - the colour in French
 *   es      - Spanish translation
 *   hex     - the colour itself, so the card can paint it
 *   phrase  - one short sentence that uses the colour in context:
 *               fr  - French sentence (agreement already applied)
 *               es  - Spanish translation
 *
 * The audio generator (scripts/generate-audio.mjs) records words and
 * sentences from this file, and the page shows the same text, so the two can
 * never drift apart.
 */
const COLORS = [
  {
    fr: "rouge",
    es: "rojo",
    hex: "#ef4444",
    phrase: { fr: "Le camion est rouge.", es: "El camión es rojo." }
  },
  {
    fr: "bleu",
    es: "azul",
    hex: "#3b82f6",
    phrase: { fr: "Le ciel est bleu.", es: "El cielo es azul." }
  },
  {
    fr: "vert",
    es: "verde",
    hex: "#22c55e",
    phrase: { fr: "L'herbe est verte.", es: "La hierba es verde." }
  },
  {
    fr: "jaune",
    es: "amarillo",
    hex: "#facc15",
    phrase: { fr: "Le soleil est jaune.", es: "El sol es amarillo." }
  },
  {
    fr: "orange",
    es: "naranja",
    hex: "#fb923c",
    phrase: { fr: "La balle est orange.", es: "La pelota es naranja." }
  },
  {
    fr: "violet",
    es: "violeta",
    hex: "#a855f7",
    phrase: { fr: "Le raisin est violet.", es: "La uva es violeta." }
  },
  {
    fr: "rose",
    es: "rosa",
    hex: "#f472b6",
    phrase: { fr: "Le cochon est rose.", es: "El cerdo es rosa." }
  },
  {
    fr: "marron",
    es: "marrón",
    hex: "#8a5a2b",
    phrase: { fr: "L'ours est marron.", es: "El oso es marrón." }
  },
  {
    fr: "gris",
    es: "gris",
    hex: "#9ca3af",
    phrase: { fr: "L'éléphant est gris.", es: "El elefante es gris." }
  },
  {
    fr: "noir",
    es: "negro",
    hex: "#1f2937",
    phrase: { fr: "Le chat est noir.", es: "El gato es negro." }
  },
  {
    fr: "blanc",
    es: "blanco",
    hex: "#f8fafc",
    phrase: { fr: "La neige est blanche.", es: "La nieve es blanca." }
  }
];

if (typeof module !== "undefined" && module.exports) module.exports = COLORS;
