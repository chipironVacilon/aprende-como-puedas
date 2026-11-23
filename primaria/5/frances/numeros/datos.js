/*
 * Number dataset for the activity.
 *
 * Every entry needs:
 *   n       - the number, shown big on the card and in the questions
 *   fr      - how the number is written in French
 *   phrase  - one short sentence that uses the number in context:
 *               fr  - French sentence (agreement already applied)
 *               es  - Spanish translation
 *
 * The sentences alternate between "J'ai …" (I have …) and "Il y a …"
 * (there is / there are …), so the same number shows up in two frames.
 *
 * The audio generator (scripts/generate-audio.mjs) records words and
 * sentences from this file, and the page shows the same text, so the two can
 * never drift apart.
 */
const NUMBERS = [
  { n: 1, fr: "un", phrase: { fr: "J'ai un chat.", es: "Tengo un gato." } },
  { n: 2, fr: "deux", phrase: { fr: "Il y a deux pommes.", es: "Hay dos manzanas." } },
  { n: 3, fr: "trois", phrase: { fr: "J'ai trois frères.", es: "Tengo tres hermanos." } },
  { n: 4, fr: "quatre", phrase: { fr: "Il y a quatre chaises.", es: "Hay cuatro sillas." } },
  { n: 5, fr: "cinq", phrase: { fr: "J'ai cinq doigts.", es: "Tengo cinco dedos." } },
  { n: 6, fr: "six", phrase: { fr: "Il y a six oiseaux.", es: "Hay seis pájaros." } },
  { n: 7, fr: "sept", phrase: { fr: "J'ai sept crayons.", es: "Tengo siete lápices." } },
  { n: 8, fr: "huit", phrase: { fr: "Il y a huit fleurs.", es: "Hay ocho flores." } },
  { n: 9, fr: "neuf", phrase: { fr: "J'ai neuf ans.", es: "Tengo nueve años." } },
  { n: 10, fr: "dix", phrase: { fr: "Il y a dix livres.", es: "Hay diez libros." } },
  { n: 11, fr: "onze", phrase: { fr: "J'ai onze billes.", es: "Tengo once canicas." } },
  { n: 12, fr: "douze", phrase: { fr: "Il y a douze mois.", es: "Hay doce meses." } },
  { n: 13, fr: "treize", phrase: { fr: "J'ai treize cartes.", es: "Tengo trece cartas." } },
  { n: 14, fr: "quatorze", phrase: { fr: "Il y a quatorze jours.", es: "Hay catorce días." } },
  { n: 15, fr: "quinze", phrase: { fr: "J'ai quinze images.", es: "Tengo quince imágenes." } },
  { n: 16, fr: "seize", phrase: { fr: "Il y a seize élèves.", es: "Hay dieciséis alumnos." } },
  { n: 17, fr: "dix-sept", phrase: { fr: "J'ai dix-sept autocollants.", es: "Tengo diecisiete pegatinas." } },
  { n: 18, fr: "dix-huit", phrase: { fr: "Il y a dix-huit fenêtres.", es: "Hay dieciocho ventanas." } },
  { n: 19, fr: "dix-neuf", phrase: { fr: "J'ai dix-neuf timbres.", es: "Tengo diecinueve sellos." } },
  { n: 20, fr: "vingt", phrase: { fr: "Il y a vingt enfants.", es: "Hay veinte niños." } },
  { n: 21, fr: "vingt et un", phrase: { fr: "J'ai vingt et un crayons.", es: "Tengo veintiún lápices." } },
  { n: 22, fr: "vingt-deux", phrase: { fr: "Il y a vingt-deux pommes.", es: "Hay veintidós manzanas." } },
  { n: 23, fr: "vingt-trois", phrase: { fr: "J'ai vingt-trois cartes.", es: "Tengo veintitrés cartas." } },
  { n: 24, fr: "vingt-quatre", phrase: { fr: "Il y a vingt-quatre heures.", es: "Hay veinticuatro horas." } },
  { n: 25, fr: "vingt-cinq", phrase: { fr: "J'ai vingt-cinq billes.", es: "Tengo veinticinco canicas." } },
  { n: 26, fr: "vingt-six", phrase: { fr: "Il y a vingt-six lettres.", es: "Hay veintiséis letras." } },
  { n: 27, fr: "vingt-sept", phrase: { fr: "J'ai vingt-sept images.", es: "Tengo veintisiete imágenes." } },
  { n: 28, fr: "vingt-huit", phrase: { fr: "Il y a vingt-huit jours.", es: "Hay veintiocho días." } },
  { n: 29, fr: "vingt-neuf", phrase: { fr: "J'ai vingt-neuf autocollants.", es: "Tengo veintinueve pegatinas." } },
  { n: 30, fr: "trente", phrase: { fr: "Il y a trente élèves.", es: "Hay treinta alumnos." } }
];

if (typeof module !== "undefined" && module.exports) module.exports = NUMBERS;
