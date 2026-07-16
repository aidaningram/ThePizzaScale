import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const importArena = !args.has("--skip-arena");
const familyId = getArgValue("--family") || "pizza-movie-night";
const oldProjectId = "pizzamovienight";
const newProjectId = "the-pizza-scale";
const oldApiKey = "AIzaSyDRC5TEFx5lU_u8P6hCI1B-AlfhTX9HcEw";
const backupPath = getArgValue("--arena-backup") || "/Users/aidaningram/Documents/Codex/firebase-backups/pizza-movie-night-rtdb-family.json";

initializeApp({
  credential: applicationDefault(),
  projectId: newProjectId,
  databaseURL: "https://the-pizza-scale-default-rtdb.firebaseio.com",
});

const db = getFirestore();
const rtdb = getDatabase();

const credentials = await promptForOldFirebaseLogin();
const idToken = await signInToOldFirebase(credentials.email, credentials.password);

const oldAppState = await readOldFirestoreDoc(idToken, `pizzaMovieNightFamilies/${familyId}`);
const oldFamilyDoc = await readOldFirestoreDoc(idToken, `families/${familyId}`);
const sourceState = chooseAppState(oldAppState, oldFamilyDoc);
const arenaState = importArena ? readArenaBackup(backupPath) : null;

const summary = {
  writeMode,
  familyId,
  oldAppStateExists: Boolean(oldAppState),
  oldFamilyDocExists: Boolean(oldFamilyDoc),
  movieCount: sourceState.movies.length,
  movieListCount: sourceState.movieList.length,
  historyCount: sourceState.history.length,
  memberCount: Object.keys(sourceState.members).length,
  arenaBackupExists: Boolean(arenaState),
};

console.log(JSON.stringify(summary, null, 2));

if (!writeMode) {
  console.log("\nPreview only. Re-run with --write if the counts look right.");
  process.exit(0);
}

const appStateRef = db.collection("pizzaMovieNightFamilies").doc(familyId);
await appStateRef.set({
  ...sourceState,
  id: familyId,
  familyId,
  migratedFromOldPizzaMovieNightProject: true,
  importedAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

if (arenaState) {
  await rtdb.ref(`families/${familyId}/gameArena`).set({
    ...arenaState,
    migratedFromOldPizzaMovieNightProject: true,
    updatedAt: Date.now(),
  });
}

console.log(`\nImported PizzaMovieNight state for ${familyId}.`);

async function promptForOldFirebaseLogin() {
  const rl = readline.createInterface({ input, output });
  try {
    const email = (await question(rl, "Old PizzaMovieNight account email: ")).trim();
    const password = await hiddenQuestion(rl, "Old PizzaMovieNight account password: ");
    if (!email || !password) fail("Email and password are required to read the old project.");
    return { email, password };
  } finally {
    rl.close();
  }
}

function question(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function hiddenQuestion(rl, prompt) {
  const originalWriteToOutput = rl._writeToOutput;
  rl._writeToOutput = function writeHidden(value) {
    if (rl.stdoutMuted) {
      rl.output.write(value.includes("\n") ? "\n" : "");
      return;
    }
    originalWriteToOutput.call(rl, value);
  };

  rl.stdoutMuted = true;
  return question(rl, prompt).finally(() => {
    rl.stdoutMuted = false;
    rl._writeToOutput = originalWriteToOutput;
    rl.output.write("\n");
  });
}

async function signInToOldFirebase(email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${oldApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    fail(`Could not sign in to old PizzaMovieNight Firebase: ${payload?.error?.message || response.statusText}`);
  }
  return payload.idToken;
}

async function readOldFirestoreDoc(idToken, docPath) {
  const encodedPath = docPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${oldProjectId}/databases/(default)/documents/${encodedPath}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (response.status === 404) return null;

  const payload = await response.json();
  if (!response.ok) {
    fail(`Could not read old Firestore document ${docPath}: ${payload?.error?.message || response.statusText}`);
  }

  return decodeFirestoreFields(payload.fields || {});
}

function chooseAppState(oldAppState, oldFamilyDoc) {
  const raw = oldAppState || oldFamilyDoc || {};
  return {
    name: raw.name || raw.familyDisplayName || raw.displayName || "The Ingram Family",
    familyDisplayName: raw.familyDisplayName || raw.name || raw.displayName || "The Ingram Family",
    joinCode: raw.joinCode || raw.familyCode || raw.inviteCode || "dogcatpig3",
    round: Number(raw.round || 1),
    members: isPlainObject(raw.members) ? raw.members : {},
    movies: Array.isArray(raw.movies) ? raw.movies : [],
    roundPicks: isPlainObject(raw.roundPicks) ? raw.roundPicks : {},
    spinReady: isPlainObject(raw.spinReady) ? raw.spinReady : {},
    spinState: raw.spinState || null,
    movieList: Array.isArray(raw.movieList) ? raw.movieList : [],
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

function readArenaBackup(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return null;

  const backup = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  return isPlainObject(backup.gameArena) ? backup.gameArena : null;
}

function decodeFirestoreFields(fields) {
  const decoded = {};
  for (const [key, value] of Object.entries(fields || {})) {
    decoded[key] = decodeFirestoreValue(value);
  }
  return decoded;
}

function decodeFirestoreValue(value) {
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, "arrayValue")) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if (Object.prototype.hasOwnProperty.call(value, "mapValue")) {
    return decodeFirestoreFields(value.mapValue.fields || {});
  }
  return null;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  console.error(`\nImport stopped: ${message}`);
  process.exit(1);
}
