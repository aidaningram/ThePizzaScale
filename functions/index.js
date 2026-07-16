import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

initializeApp();

const db = getFirestore();
const INVITE_CODE_LENGTH = 8;
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SITE_URL = "https://thepizzascale.pizza";
const INVITE_IMAGE_URL = `${SITE_URL}/PizzaLogo.png`;
const WATCH_PROVIDER_CACHE_MS = 12 * 60 * 60 * 1000;
const WATCH_PROVIDER_CACHE_VERSION = "v2";
const DEFAULT_WATCH_REGION = "US";

export const familyInvite = onRequest(
  {
    region: "us-central1",
  },
  async (request, response) => {
    const inviteCode = normalizeInviteCode(request.query.code);
    const siteInviteUrl = inviteCode ? `${SITE_URL}/?familyCode=${inviteCode}` : SITE_URL;
    let senderName =
      String(request.query.from || "")
        .trim()
        .slice(0, 80) || "Someone";

    if (inviteCode) {
      const inviteSnapshot = await db.collection("familyInvites").doc(inviteCode).get();

      if (inviteSnapshot.exists && inviteSnapshot.data()?.status === "active") {
        const invite = inviteSnapshot.data();
        senderName =
          String(invite.createdByName || invite.inviterName || "")
            .trim()
            .slice(0, 80) || senderName;
      }
    }

    const title = `${senderName} has invited you to join their family`;
    const description =
      "Join their family group on The Pizza Scale to rate movies together and build better family recommendations.";

    response
      .status(200)
      .set("Cache-Control", "public, max-age=300, s-maxage=300")
      .type("html")
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:site_name" content="The Pizza Scale">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(siteInviteUrl)}">
    <meta property="og:image" content="${INVITE_IMAGE_URL}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${INVITE_IMAGE_URL}">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(siteInviteUrl)}">
  </head>
  <body>
    <p><a href="${escapeHtml(siteInviteUrl)}">${escapeHtml(title)}</a></p>
    <script>window.location.replace(${JSON.stringify(siteInviteUrl)});</script>
  </body>
</html>`);
  },
);

export const aggregateMovieRating = onDocumentWritten(
  {
    document: "reviews/{reviewId}",
    region: "us-central1",
  },
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    const movieId = after?.movieId || before?.movieId;

    if (!movieId) return;

    const movieRef = db.collection("movies").doc(movieId);
    const movieSnapshot = await movieRef.get();
    const movie = movieSnapshot.exists ? movieSnapshot.data() : {};
    const reviewsSnapshot = await db
      .collection("reviews")
      .where("movieId", "==", movieId)
      .get();
    const reviewScores = reviewsSnapshot.docs
      .map((reviewDoc) => Number(reviewDoc.data().pizzaScore))
      .filter((score) => Number.isFinite(score));
    const reviewCount = reviewScores.length;
    const totalPizzaScore = reviewScores.reduce((total, score) => total + score, 0);
    const avgPizzaScore =
      reviewCount > 0 ? Number((totalPizzaScore / reviewCount).toFixed(2)) : null;
    const familyMatch = avgPizzaScore ? Math.round((avgPizzaScore / 8) * 100) : null;
    const movieSource = after || before || {};

    await movieRef.set(
      {
        imdbId: movieSource.imdbId || movie.imdbId || movieId,
        title: movieSource.movieTitle || movie.title || "Untitled movie",
        year: movieSource.movieYear || movie.year || "",
        rated: movieSource.movieRated || movie.rated || "",
        runtime: movieSource.movieRuntime || movie.runtime || "",
        genre: movieSource.movieGenre || movie.genre || "",
        posterUrl: movieSource.moviePosterUrl || movie.posterUrl || "",
        plot: movieSource.moviePlot || movie.plot || "",
        reviewCount,
        totalPizzaScore: Number(totalPizzaScore.toFixed(2)),
        avgPizzaScore,
        familyMatch,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  },
);

export const getWatchProviders = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    const imdbId = String(request.data?.imdbId || request.data?.movieId || "")
      .trim()
      .slice(0, 24);
    const movieTitle = String(request.data?.title || "")
      .trim()
      .slice(0, 140);
    const movieYear = String(request.data?.year || "")
      .trim()
      .replace(/[^0-9]/g, "")
      .slice(0, 4);
    const region = normalizeWatchRegion(request.data?.region);

    if (!/^tt\d{5,12}$/.test(imdbId)) {
      throw new HttpsError("invalid-argument", "A valid IMDb movie id is required.");
    }

    const cacheRef = db
      .collection("watchProviders")
      .doc(`${WATCH_PROVIDER_CACHE_VERSION}_${region}_${imdbId}`);
    const cacheSnapshot = await cacheRef.get();
    const cached = cacheSnapshot.exists ? cacheSnapshot.data() : null;
    const cachedAtMillis = getMillis(cached?.checkedAt);

    if (cached && Date.now() - cachedAtMillis < WATCH_PROVIDER_CACHE_MS) {
      return stripWatchProviderCacheFields(cached);
    }

    const apiKey = process.env.WATCHMODE_API_KEY || process.env.WATCHMODE_KEY;

    if (!apiKey) {
      return {
        status: "unavailable",
        reason: "missing-key",
        region,
        providers: emptyWatchProviderGroups(),
        message: "Watch availability needs backend setup.",
      };
    }

    try {
      const watchmodeTitle =
        (await findWatchmodeTitleByImdbId({ apiKey, imdbId })) ||
        (await findWatchmodeTitleByName({ apiKey, movieTitle, movieYear }));

      if (!watchmodeTitle?.id) {
        const unavailablePayload = {
          status: "unavailable",
          reason: "not-found",
          imdbId,
          region,
          providers: emptyWatchProviderGroups(),
          message: "Watch availability is unavailable for this movie.",
          checkedAt: FieldValue.serverTimestamp(),
        };
        await cacheRef.set(unavailablePayload, { merge: true });
        return stripWatchProviderCacheFields(unavailablePayload);
      }

      const sources = await fetchWatchmodeSources({
        apiKey,
        watchmodeId: watchmodeTitle.id,
        region,
      });
      const sourceCatalog = await fetchWatchmodeSourceCatalog({ apiKey, region });
      const payload = {
        status: "ready",
        imdbId,
        region,
        watchmodeId: watchmodeTitle.id,
        providers: groupWatchProviders(sources, sourceCatalog),
        checkedAt: FieldValue.serverTimestamp(),
      };

      await cacheRef.set(payload, { merge: true });
      return stripWatchProviderCacheFields(payload);
    } catch (error) {
      console.error("Watch provider lookup failed", {
        imdbId,
        region,
        message: error?.message,
      });

      return {
        status: "unavailable",
        reason: error?.watchProviderReason || "request-failed",
        region,
        providers: emptyWatchProviderGroups(),
        message: "Watch availability is unavailable right now.",
      };
    }
  },
);

export const getMovieScaleSummary = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    const imdbId = String(request.data?.imdbId || request.data?.movieId || "")
      .trim()
      .slice(0, 24);
    const familyId = String(request.data?.familyId || "").trim().slice(0, 80);

    if (!/^tt\d{5,12}$/.test(imdbId)) {
      throw new HttpsError("invalid-argument", "A valid IMDb movie id is required.");
    }

    const [movieSnapshot, guideSnapshot] = await Promise.all([
      db.collection("movies").doc(imdbId).get(),
      db.collection("movieGuides").doc(imdbId).get(),
    ]);
    let familyReview = null;

    if (request.auth && familyId) {
      const familySnapshot = await db.collection("families").doc(familyId).get();
      const family = familySnapshot.exists ? familySnapshot.data() : {};
      const isFamilyMember =
        Array.isArray(family.memberUserIds) && family.memberUserIds.includes(request.auth.uid);

      if (isFamilyMember) {
        const reviewSnapshot = await db.collection("reviews").doc(`${familyId}_${imdbId}`).get();
        familyReview = reviewSnapshot.exists ? summarizeFamilyReview(reviewSnapshot.data()) : null;
      }
    }

    return {
      imdbId,
      movie: movieSnapshot.exists ? summarizeMovie(movieSnapshot.data()) : null,
      guide: guideSnapshot.exists ? summarizeMovieGuide(guideSnapshot.data()) : null,
      familyReview,
    };
  },
);

export const createFamily = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before creating a family.");
    }

    const familyName = String(request.data?.familyName || "").trim().slice(0, 90);
    const leadName = String(request.data?.leadName || "").trim().slice(0, 80);
    const leadBirthDate = String(request.data?.leadBirthDate || "").trim().slice(0, 10);
    const leadGender = String(request.data?.leadGender || "").trim().slice(0, 40);
    const rawMembers = Array.isArray(request.data?.members) ? request.data.members : [];

    if (!familyName || !leadName || !leadBirthDate || !leadGender) {
      throw new HttpsError(
        "invalid-argument",
        "Family name, your first name, your birthday, and your gender are required.",
      );
    }

    const inviteCode = await createUniqueInviteCode();
    const familyRef = db.collection("families").doc();
    const familyPayload = {
      displayName: familyName,
      leadAdultUserId: request.auth.uid,
      createdByUserId: request.auth.uid,
      memberUserIds: [request.auth.uid],
      ratingAdultUserIds: [request.auth.uid],
      inviteCode,
      familyCode: inviteCode,
      publicAgeDisplayMode: "ranges",
      createdAt: FieldValue.serverTimestamp(),
    };
    const cleanedMembers = [
      {
        firstNameOrNickname: leadName,
        userId: request.auth.uid,
        role: "adult",
        birthDate: leadBirthDate,
        gender: leadGender,
        permission: "lead",
        isLeadAdult: true,
      },
      ...rawMembers
        .map(cleanFamilyMemberInput)
        .filter((member) => member.firstNameOrNickname),
    ];
    const batch = db.batch();
    const savedMembers = cleanedMembers.map((member) => {
      const memberRef = db.collection("familyMembers").doc();
      const memberPayload = {
        ...member,
        familyId: familyRef.id,
        createdAt: FieldValue.serverTimestamp(),
      };
      batch.set(memberRef, memberPayload);

      return {
        id: memberRef.id,
        ...member,
        familyId: familyRef.id,
      };
    });

    batch.set(familyRef, familyPayload);
    batch.set(db.collection("familyInvites").doc(inviteCode), {
      code: inviteCode,
      familyCode: inviteCode,
      familyId: familyRef.id,
      familyName,
      createdByUserId: request.auth.uid,
      createdByName: await getInviteSenderName(request.auth.uid),
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return {
      id: familyRef.id,
      displayName: familyName,
      leadAdultUserId: request.auth.uid,
      createdByUserId: request.auth.uid,
      memberUserIds: [request.auth.uid],
      ratingAdultUserIds: [request.auth.uid],
      inviteCode,
      familyCode: inviteCode,
      publicAgeDisplayMode: "ranges",
      members: savedMembers,
    };
  },
);

export const joinFamilyByInvite = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before joining a family.");
    }

    const inviteCode = normalizeInviteCode(request.data?.inviteCode);
    const displayName = String(request.data?.displayName || "").trim().slice(0, 80);
    const claimMemberId = String(request.data?.claimMemberId || "").trim();
    const createNewProfile = Boolean(request.data?.createNewProfile);

    if (!inviteCode) {
      throw new HttpsError("invalid-argument", "Enter a valid family invite code.");
    }

    if (!displayName) {
      throw new HttpsError("invalid-argument", "Enter your first name before joining a family.");
    }

    const inviteRef = db.collection("familyInvites").doc(inviteCode);
    const inviteSnapshot = await inviteRef.get();

    if (!inviteSnapshot.exists || inviteSnapshot.data()?.status !== "active") {
      throw new HttpsError("not-found", "That family invite code was not found.");
    }

    const invite = inviteSnapshot.data();
    const familyRef = db.collection("families").doc(invite.familyId);
    const familySnapshot = await familyRef.get();

    if (!familySnapshot.exists) {
      throw new HttpsError("not-found", "That family no longer exists.");
    }

    const userId = request.auth.uid;
    const family = familySnapshot.data();
    const memberUserIds = Array.isArray(family.memberUserIds) ? family.memberUserIds : [];
    const shouldAddUserToFamily = !memberUserIds.includes(userId);

    const membersSnapshot = await db
      .collection("familyMembers")
      .where("familyId", "==", invite.familyId)
      .get();
    const familyMembers = membersSnapshot.docs.map((memberDoc) => ({
      id: memberDoc.id,
      ref: memberDoc.ref,
      ...memberDoc.data(),
    }));
    const existingMemberSnapshot = await db
      .collection("familyMembers")
      .where("familyId", "==", invite.familyId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (existingMemberSnapshot.empty) {
      const matchingMembers = familyMembers.filter(
        (member) =>
          !member.userId &&
          normalizeName(member.firstNameOrNickname) === normalizeName(displayName),
      );

      if (claimMemberId) {
        const claimedMember = matchingMembers.find((member) => member.id === claimMemberId);

        if (!claimedMember) {
          throw new HttpsError("not-found", "That family profile could not be linked.");
        }

        await claimedMember.ref.update({
          userId,
          joinedWithInviteCode: inviteCode,
          linkedAccountUserId: userId,
          linkedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (shouldAddUserToFamily) {
          await familyRef.update({
            memberUserIds: FieldValue.arrayUnion(userId),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        if (canMemberRate(claimedMember)) {
          await familyRef.update({
            ratingAdultUserIds: FieldValue.arrayUnion(userId),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        await inviteRef.update({
          lastUsedAt: FieldValue.serverTimestamp(),
        });
      } else if (matchingMembers.length > 0 && !createNewProfile) {
        return {
          requiresMemberConfirmation: true,
          familyId: invite.familyId,
          familyName: family.displayName,
          inviteCode,
          matchedMembers: matchingMembers.slice(0, 3).map((member) => ({
            id: member.id,
            firstNameOrNickname: member.firstNameOrNickname,
            role: member.role || "member",
            birthDate: member.birthDate || "",
            age: member.age || "",
            gender: member.gender || "",
          })),
        };
      } else {
        const userProfileSnapshot = await db.collection("userProfiles").doc(userId).get();
        const userProfile = userProfileSnapshot.exists ? userProfileSnapshot.data() : {};

        await db.collection("familyMembers").add({
          familyId: invite.familyId,
          firstNameOrNickname: displayName,
          userId,
          role: "adult",
          birthDate: userProfile.birthDate || "",
          gender: userProfile.gender || "",
          permission: "member",
          isLeadAdult: false,
          joinedWithInviteCode: inviteCode,
          linkedAccountUserId: userId,
          linkedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });
        await inviteRef.update({
          lastUsedAt: FieldValue.serverTimestamp(),
        });

        if (shouldAddUserToFamily) {
          await familyRef.update({
            memberUserIds: FieldValue.arrayUnion(userId),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    } else if (shouldAddUserToFamily) {
      await familyRef.update({
        memberUserIds: FieldValue.arrayUnion(userId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const nextMembersSnapshot = await db
      .collection("familyMembers")
      .where("familyId", "==", invite.familyId)
      .get();
    const nextFamilySnapshot = await familyRef.get();

    return {
      id: invite.familyId,
      ...nextFamilySnapshot.data(),
      members: nextMembersSnapshot.docs.map((memberDoc) => ({
        id: memberDoc.id,
        ...memberDoc.data(),
      })),
    };
  },
);

export const deleteFamily = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before deleting a family.");
    }

    const familyId = String(request.data?.familyId || "").trim();

    if (!familyId) {
      throw new HttpsError("invalid-argument", "Choose a family to delete.");
    }

    const familyRef = db.collection("families").doc(familyId);
    const familySnapshot = await familyRef.get();

    if (!familySnapshot.exists) {
      throw new HttpsError("not-found", "That family no longer exists.");
    }

    const family = familySnapshot.data();
    const creatorUserId = family.createdByUserId || family.leadAdultUserId;

    if (creatorUserId !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Only the person who created this family can delete it.",
      );
    }

    await deleteCollectionDocumentsByFamilyId("familyMembers", familyId);
    await deleteCollectionDocumentsByFamilyId("familyInvites", familyId);
    await deleteCollectionDocumentsByFamilyId("reviews", familyId);
    await deleteCollectionDocumentsByFamilyId("publicReviews", familyId);
    await familyRef.delete();

    return { deleted: true, familyId };
  },
);

function normalizeInviteCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanFamilyMemberInput(member) {
  const role = ["child", "teen", "adult"].includes(member?.role) ? member.role : "child";

  return {
    firstNameOrNickname: String(member?.name || member?.firstNameOrNickname || "")
      .trim()
      .slice(0, 80),
    role,
    birthDate: String(member?.birthDate || "").trim().slice(0, 10),
    gender: String(member?.gender || "").trim().slice(0, 40),
    permission: normalizeMemberPermission(role, member?.permission),
    isLeadAdult: false,
  };
}

function normalizeMemberPermission(role, permission) {
  const cleanPermission = String(permission || "").trim();

  if (cleanPermission === "rate" && role !== "adult") {
    return "guided";
  }

  return ["lead", "colead", "co-lead", "manage", "rate", "member", "guided", "suggest"].includes(
    cleanPermission,
  )
    ? cleanPermission
    : "guided";
}

function canMemberRate(member) {
  return (
    (member.role === "adult" || member.isLeadAdult) &&
    ["lead", "colead", "co-lead", "manage", "rate"].includes(member.permission || "")
  );
}

async function getInviteSenderName(userId) {
  if (!userId) return "";

  const userProfileSnapshot = await db.collection("userProfiles").doc(userId).get();
  const userProfile = userProfileSnapshot.exists ? userProfileSnapshot.data() : {};

  return String(userProfile.firstName || userProfile.displayName || "")
    .trim()
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWatchRegion(value) {
  const region = String(value || DEFAULT_WATCH_REGION)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);

  return region || DEFAULT_WATCH_REGION;
}

function summarizeMovie(movie = {}) {
  return {
    title: movie.title || "",
    year: movie.year || "",
    rated: movie.rated || "",
    runtime: movie.runtime || "",
    genre: movie.genre || "",
    posterUrl: movie.posterUrl || "",
    pizzaScore: typeof movie.avgPizzaScore === "number" ? movie.avgPizzaScore : null,
    familyMatch: typeof movie.familyMatch === "number" ? movie.familyMatch : null,
    reviewCount: typeof movie.reviewCount === "number" ? movie.reviewCount : 0,
  };
}

function summarizeMovieGuide(guide = {}) {
  return {
    status: guide.status || "",
    summary: guide.summary || "",
    bestAgeRange: guide.bestAgeRange || "",
    parentAppeal: numberOrNull(guide.parentAppeal),
    kidAppeal: numberOrNull(guide.kidAppeal),
    teenAppeal: numberOrNull(guide.teenAppeal),
    concernLevels: guide.concernLevels || {},
    watchOutFor: Array.isArray(guide.watchOutFor) ? guide.watchOutFor.slice(0, 5) : [],
  };
}

function summarizeFamilyReview(review = {}) {
  return {
    pizzaScore: numberOrNull(review.pizzaScore),
    parentScore: numberOrNull(review.parentScore),
    kidScore: numberOrNull(review.kidScore),
    visibility: review.visibility || "aggregate",
    ratedAt: review.createdAt || review.updatedAt || null,
  };
}

function numberOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;

  return 0;
}

function emptyWatchProviderGroups() {
  return {
    stream: [],
    rent: [],
    buy: [],
  };
}

function stripWatchProviderCacheFields(payload) {
  return {
    status: payload.status || "unavailable",
    region: payload.region || DEFAULT_WATCH_REGION,
    providers: payload.providers || emptyWatchProviderGroups(),
    message: payload.message || "",
  };
}

async function findWatchmodeTitleByImdbId({ apiKey, imdbId }) {
  const url = new URL("https://api.watchmode.com/v1/search/");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("search_field", "imdb_id");
  url.searchParams.set("search_value", imdbId);

  const response = await fetchJson(url);
  const titleResults = Array.isArray(response?.title_results) ? response.title_results : [];

  return titleResults.find((title) => title?.imdb_id === imdbId) || titleResults[0] || null;
}

async function findWatchmodeTitleByName({ apiKey, movieTitle, movieYear }) {
  if (!movieTitle) return null;

  const url = new URL("https://api.watchmode.com/v1/search/");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("search_field", "name");
  url.searchParams.set("search_value", movieTitle);
  url.searchParams.set("types", "movie");

  const response = await fetchJson(url);
  const titleResults = Array.isArray(response?.title_results) ? response.title_results : [];
  const movieResults = titleResults.filter((title) => title?.type === "movie");

  if (movieYear) {
    const exactYearMatch = movieResults.find(
      (title) => String(title.year || "") === movieYear,
    );

    if (exactYearMatch) return exactYearMatch;
  }

  return movieResults[0] || titleResults[0] || null;
}

async function fetchWatchmodeSources({ apiKey, watchmodeId, region }) {
  const url = new URL(`https://api.watchmode.com/v1/title/${watchmodeId}/sources/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", region);

  const response = await fetchJson(url);

  return Array.isArray(response) ? response : [];
}

async function fetchWatchmodeSourceCatalog({ apiKey, region }) {
  const url = new URL("https://api.watchmode.com/v1/sources/");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", region);

  try {
    const response = await fetchJson(url);
    const sources = Array.isArray(response) ? response : [];

    return new Map(
      sources.flatMap((source) => {
        const provider = normalizeWatchProvider(source);
        const keys = [
          source.source_id,
          source.id,
          provider.id,
          provider.name,
          provider.name.toLowerCase(),
        ]
          .map((key) => String(key || "").trim())
          .filter(Boolean);

        return keys.map((key) => [key, provider]);
      }),
    );
  } catch (error) {
    console.error("Watchmode source catalog lookup failed", {
      region,
      message: error?.message,
    });

    return new Map();
  }
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(`Watchmode responded with ${response.status}`);
    error.watchProviderReason = [401, 402, 403, 429].includes(response.status)
      ? "quota-or-key"
      : "request-failed";
    throw error;
  }

  return response.json();
}

function groupWatchProviders(sources, sourceCatalog = new Map()) {
  const groups = emptyWatchProviderGroups();
  const seen = new Set();

  for (const source of sources) {
    const groupKey = getWatchProviderGroup(source?.type);

    if (!groupKey) continue;

    const provider = enrichWatchProvider(normalizeWatchProvider(source), sourceCatalog, source);
    const dedupeKey = `${groupKey}:${provider.id || provider.name}`;

    if (!provider.name || isIndirectWatchProvider(provider) || seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    groups[groupKey].push(provider);
  }

  return Object.fromEntries(
    Object.entries(groups).map(([key, providers]) => [
      key,
      providers
        .sort((first, second) => first.name.localeCompare(second.name))
        .slice(0, 12),
    ]),
  );
}

function enrichWatchProvider(provider, sourceCatalog, source) {
  const catalogProvider =
    sourceCatalog.get(String(source?.source_id || "").trim()) ||
    sourceCatalog.get(String(source?.id || "").trim()) ||
    sourceCatalog.get(provider.id) ||
    sourceCatalog.get(provider.name) ||
    sourceCatalog.get(provider.name.toLowerCase());

  if (!catalogProvider) return provider;

  return {
    ...provider,
    id: provider.id || catalogProvider.id,
    logoUrl: provider.logoUrl || catalogProvider.logoUrl,
    webUrl: provider.webUrl || catalogProvider.webUrl,
  };
}

function getWatchProviderGroup(type) {
  const normalizedType = String(type || "").toLowerCase();

  if (["sub", "free", "tve"].includes(normalizedType)) return "stream";
  if (normalizedType === "rent") return "rent";
  if (normalizedType === "buy") return "buy";

  return "";
}

function normalizeWatchProvider(source) {
  return {
    id: source.source_id || source.id || "",
    name: String(source.name || source.source_name || "").trim().slice(0, 80),
    type: String(source.type || "").trim().slice(0, 24),
    logoUrl: String(
      source.logo_100px ||
        source.logo_50px ||
        source.logo_url ||
        source.icon_url ||
        "",
    )
      .trim()
      .slice(0, 500),
    webUrl: String(source.web_url || "").trim().slice(0, 500),
  };
}

function isIndirectWatchProvider(provider) {
  return /\(\s*via\b/i.test(String(provider?.name || ""));
}

async function createUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let inviteCode = "";

    for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
      inviteCode += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
    }

    const inviteSnapshot = await db.collection("familyInvites").doc(inviteCode).get();

    if (!inviteSnapshot.exists) {
      return inviteCode;
    }
  }

  throw new HttpsError("internal", "Family code could not be created. Please try again.");
}

async function deleteCollectionDocumentsByFamilyId(collectionName, familyId) {
  const batchSize = 450;

  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where("familyId", "==", familyId)
      .limit(batchSize)
      .get();

    if (snapshot.empty) return;

    const batch = db.batch();
    snapshot.docs.forEach((documentSnapshot) => {
      batch.delete(documentSnapshot.ref);
    });
    await batch.commit();
  }
}
