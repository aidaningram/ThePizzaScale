import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "src/main.jsx",
  "src/movieProvider.js",
  "src/firebase.js",
  "src/styles.css",
  "firestore.rules",
  "storage.rules",
  "firebase.json",
  "functions/index.js",
  "functions/package.json",
  "data/movie-guides.seed.json",
  "data/movie-guide.schema.example.json",
  "scripts/seed-movie-guides.mjs",
];

const requiredMainSnippets = [
  "handleSaveReview",
  "handleUpdateFamily",
  "loadFamilyProfile",
  "hydrateMoviesWithStats",
  "PizzaGuidePanel",
  "familyPreferences",
  "SearchPage",
  "SettingsPage",
];

async function assertFileExists(path) {
  try {
    await access(path);
  } catch {
    throw new Error(`Missing required file: ${path}`);
  }
}

for (const file of requiredFiles) {
  await assertFileExists(file);
}

const mainSource = await readFile("src/main.jsx", "utf8");
const missingSnippet = requiredMainSnippets.find((snippet) => !mainSource.includes(snippet));

if (missingSnippet) {
  throw new Error(`Missing expected app flow: ${missingSnippet}`);
}

const firestoreRules = await readFile("firestore.rules", "utf8");

if (
  !firestoreRules.includes("canManageFamily") ||
  !firestoreRules.includes("match /reviews") ||
  !firestoreRules.includes("match /movieGuides")
) {
  throw new Error("Firestore rules are missing family management or review rules.");
}

const storageRules = await readFile("storage.rules", "utf8");

if (!storageRules.includes("profilePhotos")) {
  throw new Error("Storage rules are missing profile photo access.");
}

const functionsSource = await readFile("functions/index.js", "utf8");

if (
  !functionsSource.includes("aggregateMovieRating") ||
  !functionsSource.includes("onDocumentWritten") ||
  !functionsSource.includes("totalPizzaScore")
) {
  throw new Error("Functions aggregation trigger is missing expected review logic.");
}

console.log("Smoke check passed.");
