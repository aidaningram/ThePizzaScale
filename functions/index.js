import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

initializeApp();

const db = getFirestore();

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
      throw new HttpsError("invalid-argument", "Enter your name before joining a family.");
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
            age: member.age || "",
            gender: member.gender || "",
          })),
        };
      } else {
        await db.collection("familyMembers").add({
          familyId: invite.familyId,
          firstNameOrNickname: displayName,
          userId,
          role: "adult",
          age: "",
          gender: "",
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

function canMemberRate(member) {
  return (
    (member.role === "adult" || member.isLeadAdult) &&
    ["lead", "colead", "co-lead", "manage", "rate"].includes(member.permission || "")
  );
}
