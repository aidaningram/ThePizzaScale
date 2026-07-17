import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homeAppealMovieGuides } from "../data/home-appeal-categories.js";
import { popularExpansionGuides } from "../data/popular-expansion-guides.js";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const seedPath = new URL("../data/movie-guides.seed.json", import.meta.url);
const rawSeed = await readFile(seedPath, "utf8");
const guides = [...JSON.parse(rawSeed), ...homeAppealMovieGuides, ...popularExpansionGuides];
const shouldWrite = process.argv.includes("--write");

if (!Array.isArray(guides)) {
  throw new Error("movie-guides.seed.json must contain an array.");
}

const normalizedGuides = guides.map(validateGuide);

if (!shouldWrite) {
  console.log(`Validated ${normalizedGuides.length} movie guide seed records. Use --write to seed Firestore.`);
  process.exit(0);
}

if (!normalizedGuides.length) {
  console.log("No movie guides to seed.");
  process.exit(0);
}

const { initializeApp, getApps, applicationDefault } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}

const db = getFirestore();
const batch = db.batch();

for (const guide of normalizedGuides) {
  batch.set(
    db.collection("movieGuides").doc(guide.id),
    {
      ...guide,
      seededAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

await batch.commit();
console.log(`Seeded ${normalizedGuides.length} movie guides into Firestore.`);

function validateGuide(guide, index) {
  const id = cleanString(guide.id || guide.imdbId);

  if (!id) {
    throw new Error(`Guide at index ${index} is missing id/imdbId.`);
  }

  const title = cleanString(guide.title);

  if (!title) {
    throw new Error(`Guide ${id} is missing title.`);
  }

  return {
    id,
    imdbId: cleanString(guide.imdbId || id),
    title,
    year: cleanString(guide.year),
    status: normalizeStatus(guide.status),
    guideVersion: cleanString(guide.guideVersion) || "pizza-guide-v1",
    sourceType: cleanString(guide.sourceType) || "ai-assisted",
    bestAgeRange: cleanString(guide.bestAgeRange),
    summary: cleanString(guide.summary),
    parentAppeal: normalizeScore(guide.parentAppeal, "parentAppeal", id),
    kidAppeal: normalizeScore(guide.kidAppeal, "kidAppeal", id),
    teenAppeal: normalizeScore(guide.teenAppeal, "teenAppeal", id),
    familyNightFit: normalizeScore(guide.familyNightFit, "familyNightFit", id),
    concernLevels: {
      scare: normalizeConcern(guide.concernLevels?.scare, "scare", id),
      violence: normalizeConcern(guide.concernLevels?.violence, "violence", id),
      language: normalizeConcern(guide.concernLevels?.language, "language", id),
      romanceNudity: normalizeConcern(guide.concernLevels?.romanceNudity, "romanceNudity", id),
      substances: normalizeConcern(guide.concernLevels?.substances, "substances", id),
    },
    toneTags: cleanList(guide.toneTags),
    goodFor: cleanList(guide.goodFor),
    mayNotFit: cleanList(guide.mayNotFit),
    watchOutFor: cleanList(guide.watchOutFor),
    conversationTopics: cleanList(guide.conversationTopics),
    matchSignals: cleanList(guide.matchSignals),
    concernDetails: normalizeConcernDetails(guide.concernDetails),
  };
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanList(value) {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean).slice(0, 12) : [];
}

function normalizeConcernDetails(value) {
  if (!value || typeof value !== "object") return {};

  return {
    scare: cleanList(value.scare),
    violence: cleanList(value.violence),
    language: cleanList(value.language),
    romanceNudity: cleanList(value.romanceNudity),
    substances: cleanList(value.substances),
  };
}

function normalizeStatus(value) {
  const status = cleanString(value);

  return ["draft", "ai-assisted", "verified"].includes(status) ? status : "draft";
}

function normalizeScore(value, field, id) {
  if (value === null || value === undefined || value === "") return null;

  const score = Number(value);

  if (!Number.isFinite(score) || score < 1 || score > 8) {
    throw new Error(`${id}.${field} must be a number from 1 to 8.`);
  }

  return score;
}

function normalizeConcern(value, field, id) {
  if (value === null || value === undefined || value === "") return null;

  const level = Number(value);

  if (!Number.isFinite(level) || level < 0 || level > 4) {
    throw new Error(`${id}.concernLevels.${field} must be a number from 0 to 4.`);
  }

  return level;
}
