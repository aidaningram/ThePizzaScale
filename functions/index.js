import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

initializeApp();

const db = getFirestore();
const INVITE_CODE_LENGTH = 8;
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
