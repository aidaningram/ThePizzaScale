import process from "node:process";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const familyId = getArgValue("--family") || "pizza-movie-night";
const projectId = "the-pizza-scale";

initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();
const appStateRef = db.collection("pizzaMovieNightFamilies").doc(familyId);
const appStateSnap = await appStateRef.get();

if (!appStateSnap.exists) {
  fail(`pizzaMovieNightFamilies/${familyId} does not exist.`);
}

const appState = appStateSnap.data() || {};
const appMembers = isPlainObject(appState.members) ? appState.members : {};
const sharedMembersSnap = await db.collection("familyMembers").where("familyId", "==", familyId).get();
const sharedNames = new Set();
const sharedKeys = new Set();

sharedMembersSnap.docs.forEach((memberDoc) => {
  const member = memberDoc.data() || {};
  const memberKey = member.userId || member.linkedAccountUserId || memberDoc.id;
  sharedKeys.add(memberKey);
  const nameKey = memberNameKey(member);
  if (nameKey) sharedNames.add(nameKey);
});

const cleanedMembers = {};
const removedMembers = [];

Object.entries(appMembers).forEach(([uid, member]) => {
  const nameKey = memberNameKey(member);
  const isDuplicateOfSharedProfile = nameKey && sharedNames.has(nameKey) && !sharedKeys.has(uid);
  const hasAccount = memberHasAccount(uid, member);

  if (isDuplicateOfSharedProfile || !hasAccount) {
    removedMembers.push({
      uid,
      name: member.name || member.firstNameOrNickname || "",
      email: member.email || "",
      reason: isDuplicateOfSharedProfile ? "duplicate shared profile" : "no linked account or email",
    });
    return;
  }

  cleanedMembers[uid] = member;
});

console.log(JSON.stringify({
  projectId,
  writeMode,
  familyId,
  appMemberCountBefore: Object.keys(appMembers).length,
  sharedMemberCount: sharedMembersSnap.size,
  removedMemberCount: removedMembers.length,
  removedMembers,
  appMemberCountAfter: Object.keys(cleanedMembers).length,
}, null, 2));

if (!writeMode) {
  console.log("\nPreview only. Re-run with --write if those duplicates are correct.");
  process.exit(0);
}

await appStateRef.set({
  members: cleanedMembers,
  updatedAt: new Date(),
}, { merge: true });

console.log(`\nCleaned duplicate PizzaMovieNight members for ${familyId}.`);

function memberNameKey(member = {}) {
  return String(member.name || member.firstNameOrNickname || member.displayName || member.email || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function memberHasAccount(uid, member = {}) {
  return Boolean(
    member.email ||
    member.userId ||
    member.uid ||
    member.linkedAccountUserId ||
    sharedKeys.has(uid)
  );
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
  console.error(`\nCleanup stopped: ${message}`);
  process.exit(1);
}
