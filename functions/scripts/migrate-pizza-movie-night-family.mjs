import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const mergeMode = args.has("--merge");
const planPath = getArgValue("--plan") || path.resolve(
  process.cwd(),
  "../migration/pizza-movie-night-family.plan.json",
);

if (!fs.existsSync(planPath)) {
  fail(`Migration plan not found: ${planPath}`);
}

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const projectId = String(plan.projectId || "the-pizza-scale").trim();
const familyId = cleanId(plan.familyId || "pizza-movie-night");
const familyName = cleanString(plan.familyName || "The Ingram Family", 90);
const familyCode = normalizeCode(plan.familyCode || "dogcatpig3");
const pizzaMovieNightJoinCode = cleanString(plan.pizzaMovieNightJoinCode || plan.familyCode || "dogcatpig3", 80);

if (!projectId || !familyId || !familyName || !familyCode) {
  fail("projectId, familyId, familyName, and familyCode are required.");
}

initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();
const auth = getAuth();

const exportedAccounts = loadExportedAccounts(plan.accountExportPath);
const rawMembers = Array.isArray(plan.members) ? plan.members : [];
if (!rawMembers.length) fail("Plan must include at least one family member.");

const authUsersByEmail = new Map();
const resolvedMembers = [];

for (const rawMember of rawMembers) {
  const member = normalizeMember(rawMember);
  if (member.userId) {
    if (member.email) authUsersByEmail.set(member.email.toLowerCase(), member.userId);
  } else if (member.email) {
    member.userId = await resolveUidForEmail(member.email, exportedAccounts);
    authUsersByEmail.set(member.email.toLowerCase(), member.userId);
  }
  resolvedMembers.push(member);
}

const leadAdultEmail = cleanEmail(plan.leadAdultEmail || "");
let leadAdultUserId = leadAdultEmail ? authUsersByEmail.get(leadAdultEmail.toLowerCase()) : "";
if (!leadAdultUserId) {
  const explicitLead = resolvedMembers.find((member) => member.permission === "lead" && member.userId);
  leadAdultUserId = explicitLead?.userId || resolvedMembers.find((member) => member.userId)?.userId || "";
}
if (!leadAdultUserId) {
  fail("At least one member needs an email that resolves to an imported Firebase Auth user.");
}

const memberUserIds = unique(resolvedMembers.map((member) => member.userId).filter(Boolean));
const coLeaderUserIds = resolveEmailList(plan.coLeaderEmails, authUsersByEmail);
const ratingAdultUserIds = unique([
  leadAdultUserId,
  ...resolveEmailList(plan.ratingAdultEmails, authUsersByEmail),
  ...resolvedMembers
    .filter((member) => member.canRate && member.userId && member.role === "adult")
    .map((member) => member.userId),
]);

const familyRef = db.collection("families").doc(familyId);
const inviteRef = db.collection("familyInvites").doc(familyCode);
const appStateRef = db.collection("pizzaMovieNightFamilies").doc(familyId);

const [familySnap, inviteSnap, appStateSnap] = await readExistingMigrationDocs();

if (familySnap.exists && !mergeMode) {
  fail(`families/${familyId} already exists. Re-run with --merge if you intend to update it.`);
}

if (inviteSnap.exists && inviteSnap.data()?.familyId !== familyId) {
  fail(`familyInvites/${familyCode} already belongs to another family.`);
}

const now = FieldValue.serverTimestamp();
const familyPayload = {
  displayName: familyName,
  leadAdultUserId,
  createdByUserId: familySnap.exists ? familySnap.data().createdByUserId || leadAdultUserId : leadAdultUserId,
  memberUserIds,
  ratingAdultUserIds,
  coLeaderUserIds,
  inviteCode: familyCode,
  familyCode,
  publicAgeDisplayMode: "ranges",
  migratedFrom: "PizzaMovieNight",
  updatedAt: now,
};
if (!familySnap.exists) familyPayload.createdAt = now;

const familyMemberWrites = resolvedMembers.map((member) => {
  const memberId = member.userId ? `${familyId}_${member.userId}` : `${familyId}_${slug(member.firstNameOrNickname)}`;
  return {
    ref: db.collection("familyMembers").doc(memberId),
    payload: {
      familyId,
      firstNameOrNickname: member.firstNameOrNickname,
      userId: member.userId || "",
      role: member.role,
      birthDate: member.birthDate,
      gender: member.gender,
      permission: member.permission,
      isLeadAdult: member.userId === leadAdultUserId,
      canRate: Boolean(member.canRate && member.role === "adult"),
      linkedAccountUserId: member.userId || "",
      migratedFrom: "PizzaMovieNight",
      updatedAt: now,
      createdAt: now,
    },
  };
});

const invitePayload = {
  code: familyCode,
  familyCode,
  familyId,
  familyName,
  createdByUserId: leadAdultUserId,
  createdByName: displayNameForUid(resolvedMembers, leadAdultUserId),
  status: "active",
  migratedFrom: "PizzaMovieNight",
  updatedAt: now,
};
if (!inviteSnap.exists) invitePayload.createdAt = now;

const pizzaMovieNightState = normalizePizzaMovieNightState(plan.pizzaMovieNightState, {
  familyId,
  familyName,
  joinCode: pizzaMovieNightJoinCode,
  leadAdultUserId,
});

printPreview({
  projectId,
  writeMode,
  mergeMode,
  familyPath: familyRef.path,
  familyExists: familySnap.exists,
  invitePath: inviteRef.path,
  inviteExists: inviteSnap.exists,
  appStatePath: appStateRef.path,
  appStateExists: appStateSnap.exists,
  memberCount: resolvedMembers.length,
  accountMemberCount: memberUserIds.length,
  leadAdultUserId,
  memberUserIds,
  ratingAdultUserIds,
});

if (!writeMode) {
  console.log("\nPreview only. Re-run with --write after checking the plan.");
  process.exit(0);
}

const batch = db.batch();
batch.set(familyRef, familyPayload, { merge: true });
batch.set(inviteRef, invitePayload, { merge: true });

for (const write of familyMemberWrites) {
  batch.set(write.ref, write.payload, { merge: true });
}

if (!appStateSnap.exists || mergeMode) {
  batch.set(appStateRef, {
    ...pizzaMovieNightState,
    updatedAt: now,
    createdAt: appStateSnap.exists ? appStateSnap.data().createdAt || now : now,
  }, { merge: true });
}

await batch.commit();
console.log(`\nMigration write completed for ${familyRef.path}.`);

async function readExistingMigrationDocs() {
  try {
    return await Promise.all([
      familyRef.get(),
      inviteRef.get(),
      appStateRef.get(),
    ]);
  } catch (error) {
    if (isMissingCredentialsError(error)) {
      fail([
        "Firebase Admin credentials are missing on this computer.",
        "Create a Firebase service account key for the-pizza-scale, save it outside Git, then run:",
        "GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/the-key.json npm run migrate:pizza-movie-night:check",
        "Use the same GOOGLE_APPLICATION_CREDENTIALS prefix for the final write command.",
      ].join("\n"));
    }
    throw error;
  }
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : "";
}

function loadExportedAccounts(accountExportPath) {
  const cleanedPath = String(accountExportPath || "").trim();
  if (!cleanedPath) return new Map();
  const absolutePath = path.resolve(cleanedPath);
  if (!fs.existsSync(absolutePath)) fail(`Auth export file not found: ${absolutePath}`);

  const data = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const users = Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : [];
  return new Map(
    users
      .map((user) => [cleanEmail(user.email || ""), user.localId || user.uid || ""])
      .filter(([email, uid]) => email && uid),
  );
}

async function resolveUidForEmail(email, exportedAccounts) {
  const exportedUid = exportedAccounts.get(email.toLowerCase());
  if (exportedUid) return exportedUid;

  try {
    const user = await auth.getUserByEmail(email);
    return user.uid;
  } catch (error) {
    fail(`Could not find imported Firebase Auth user for ${email}. Import accounts first, or set accountExportPath.`);
  }
}

function normalizeMember(rawMember) {
  const firstNameOrNickname = cleanString(rawMember.firstNameOrNickname || rawMember.firstName || rawMember.name, 80);
  const email = cleanEmail(rawMember.email || "");
  const userId = cleanString(rawMember.userId || rawMember.uid || "", 128);
  const role = normalizeRole(rawMember.role);
  const birthDate = cleanString(rawMember.birthDate || rawMember.birthday || "", 10);
  const gender = cleanString(rawMember.gender || "", 40);
  const permission = normalizePermission(rawMember.permission, role);
  const canRate = Boolean(rawMember.canRate) && role === "adult";

  if (!firstNameOrNickname) fail("Every member needs firstNameOrNickname.");
  if (!birthDate) fail(`${firstNameOrNickname} needs a birthDate in YYYY-MM-DD format.`);
  if (!gender) fail(`${firstNameOrNickname} needs a gender.`);

  return {
    firstNameOrNickname,
    email,
    role,
    birthDate,
    gender,
    permission,
    canRate,
    userId,
  };
}

function normalizePizzaMovieNightState(rawState = {}, defaults) {
  return {
    id: defaults.familyId,
    familyId: defaults.familyId,
    name: defaults.familyName,
    familyDisplayName: defaults.familyName,
    joinCode: defaults.joinCode,
    round: Number(rawState.round || 1),
    members: rawState.members && typeof rawState.members === "object" ? rawState.members : {},
    movies: Array.isArray(rawState.movies) ? rawState.movies : [],
    roundPicks: rawState.roundPicks && typeof rawState.roundPicks === "object" ? rawState.roundPicks : {},
    spinReady: rawState.spinReady && typeof rawState.spinReady === "object" ? rawState.spinReady : {},
    spinState: rawState.spinState || null,
    movieList: Array.isArray(rawState.movieList) ? rawState.movieList : [],
    history: Array.isArray(rawState.history) ? rawState.history : [],
    migratedFrom: "PizzaMovieNight",
  };
}

function resolveEmailList(emails, authUsersByEmail) {
  return unique((Array.isArray(emails) ? emails : [])
    .map((email) => authUsersByEmail.get(cleanEmail(email).toLowerCase()))
    .filter(Boolean));
}

function normalizeCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function cleanId(value) {
  return String(value || "").trim().replace(/[^\w.-]/g, "-").slice(0, 80);
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (["adult", "parent"].includes(role)) return "adult";
  if (["teen", "child"].includes(role)) return role;
  return "member";
}

function normalizePermission(value, role) {
  const permission = String(value || "").trim().toLowerCase();
  if (permission === "lead") return "lead";
  if (permission === "colead" || permission === "coleader" || permission === "co-leader") return "colead";
  if (role !== "adult") return "profile";
  if (permission === "rate" || permission === "rater") return "rate";
  return "member";
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "member";
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function displayNameForUid(members, uid) {
  return members.find((member) => member.userId === uid)?.firstNameOrNickname || "Family leader";
}

function printPreview(summary) {
  console.log(JSON.stringify(summary, null, 2));
}

function fail(message) {
  console.error(`Migration stopped: ${message}`);
  process.exit(1);
}

function isMissingCredentialsError(error) {
  const message = String(error?.message || error || "");
  return message.includes("Could not load the default credentials")
    || message.includes("Could not load the default credentials")
    || message.includes("MetadataLookupWarning")
    || message.includes("computeMetadata");
}
