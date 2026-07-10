import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
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

    await db.runTransaction(async (transaction) => {
      const movieSnapshot = await transaction.get(movieRef);
      const movie = movieSnapshot.exists ? movieSnapshot.data() : {};
      const previousCount = Number(movie.reviewCount || 0);
      const previousTotal = Number(movie.totalPizzaScore || 0);
      const beforeScore = Number(before?.pizzaScore || 0);
      const afterScore = Number(after?.pizzaScore || 0);
      let nextCount = previousCount;
      let nextTotal = previousTotal;

      if (!before && after) {
        nextCount += 1;
        nextTotal += afterScore;
      } else if (before && after) {
        nextTotal = nextTotal - beforeScore + afterScore;
      } else if (before && !after) {
        nextCount = Math.max(0, nextCount - 1);
        nextTotal = Math.max(0, nextTotal - beforeScore);
      }

      const avgPizzaScore =
        nextCount > 0 ? Number((nextTotal / nextCount).toFixed(2)) : null;
      const familyMatch = avgPizzaScore ? Math.round((avgPizzaScore / 8) * 100) : null;
      const movieSource = after || before || {};

      transaction.set(
        movieRef,
        {
          imdbId: movieSource.imdbId || movie.imdbId || movieId,
          title: movieSource.movieTitle || movie.title || "Untitled movie",
          year: movieSource.movieYear || movie.year || "",
          rated: movieSource.movieRated || movie.rated || "",
          runtime: movieSource.movieRuntime || movie.runtime || "",
          genre: movieSource.movieGenre || movie.genre || "",
          posterUrl: movieSource.moviePosterUrl || movie.posterUrl || "",
          plot: movieSource.moviePlot || movie.plot || "",
          reviewCount: nextCount,
          totalPizzaScore: Number(nextTotal.toFixed(2)),
          avgPizzaScore,
          familyMatch,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  },
);
