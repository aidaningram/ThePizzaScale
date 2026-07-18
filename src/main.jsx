import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Eye,
  EyeOff,
  Film,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { auth, db, functions, storage } from "./firebase";
import { getOmdbMovie, searchOmdbMovies } from "./movieProvider";
import pizzaWordmark from "./assets/PizzaScaleWordmark.png";
import {
  homeAppealMovieCatalog,
  homeAppealMovieGuides,
} from "../data/home-appeal-categories.js";
import seededMovieGuides from "../data/movie-guides.seed.json";
import "./styles.css";

const posterThemes = ["marmalade", "neon", "stage", "woodland"];
const PROFILE_PHOTOS_STORAGE_KEY = "pizzaScaleProfilePhotos";
const MAX_PROFILE_PHOTO_SOURCE_BYTES = 15 * 1024 * 1024;
const PROFILE_PHOTO_OUTPUT_SIZE = 512;
const PROFILE_PHOTO_OUTPUT_QUALITY = 0.82;
const INVITE_CODE_LENGTH = 8;
const defaultFamilyPreferences = {
  scareTolerance: "moderate",
  violenceTolerance: "moderate",
  languageTolerance: "moderate",
  romanceNudityTolerance: "low",
  preferredEnergy: "balanced",
  preferredRuntime: "flexible",
  wantsParentAppeal: true,
};

const toleranceOptions = [
  { value: "low", label: "Keep it low" },
  { value: "moderate", label: "Some is okay" },
  { value: "high", label: "Flexible" },
];

const toleranceCeilings = {
  low: 1,
  moderate: 2.35,
  high: 4,
};

const familyFitDescription =
  "Personalized for your family using your preferences, family dynamic, and prior movie preferences. It will get smarter as your family rates more movies.";

const guideConcernLabels = {
  scare: "Scary moments",
  violence: "Violence",
  language: "Language",
  romanceNudity: "Romance/nudity",
  substances: "Substances",
};

const seededMovieGuideMap = new Map(
  [...seededMovieGuides, ...homeAppealMovieGuides].map((guide) => [
    guide.id || guide.imdbId,
    guide,
  ]),
);

const featuredMovies = [
  {
    id: "tt4468740",
    imdbId: "tt4468740",
    title: "Paddington 2",
    year: "2017",
    rated: "PG",
    runtime: "103 min",
    genre: "Adventure, Comedy, Family",
    posterTheme: "marmalade",
    plot:
      "Paddington picks up odd jobs to buy a gift for Aunt Lucy, only to be framed for a theft he did not commit.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt4633694",
    imdbId: "tt4633694",
    title: "Spider-Man: Into the Spider-Verse",
    year: "2018",
    rated: "PG",
    runtime: "117 min",
    genre: "Animation, Action, Adventure",
    posterTheme: "neon",
    plot:
      "Teen Miles Morales becomes Spider-Man and joins heroes from other dimensions to save his city.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0332379",
    imdbId: "tt0332379",
    title: "School of Rock",
    year: "2003",
    rated: "PG-13",
    runtime: "109 min",
    genre: "Comedy, Music",
    posterTheme: "stage",
    plot:
      "A struggling musician poses as a substitute teacher and turns a class into a rock band.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0432283",
    imdbId: "tt0432283",
    title: "Fantastic Mr. Fox",
    year: "2009",
    rated: "PG",
    runtime: "87 min",
    genre: "Animation, Adventure, Comedy",
    posterTheme: "woodland",
    plot:
      "A clever fox risks the safety of his family and friends when he returns to stealing from nearby farms.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0114709",
    imdbId: "tt0114709",
    title: "Toy Story",
    year: "1995",
    rated: "G",
    runtime: "81 min",
    genre: "Animation, Adventure, Comedy",
    posterTheme: "marmalade",
    plot:
      "A cowboy doll feels threatened when a flashy new space ranger becomes a child's favorite toy.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0266543",
    imdbId: "tt0266543",
    title: "Finding Nemo",
    year: "2003",
    rated: "G",
    runtime: "100 min",
    genre: "Animation, Adventure, Comedy",
    posterTheme: "neon",
    plot:
      "A cautious clownfish crosses the ocean with a forgetful friend to find his missing son.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0317705",
    imdbId: "tt0317705",
    title: "The Incredibles",
    year: "2004",
    rated: "PG",
    runtime: "115 min",
    genre: "Animation, Action, Adventure",
    posterTheme: "stage",
    plot:
      "A family of undercover superheroes is pulled back into action when a new threat appears.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0382932",
    imdbId: "tt0382932",
    title: "Ratatouille",
    year: "2007",
    rated: "G",
    runtime: "111 min",
    genre: "Animation, Adventure, Comedy",
    posterTheme: "woodland",
    plot:
      "A rat with a gift for cooking teams up with a young kitchen worker in a famous Paris restaurant.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0910970",
    imdbId: "tt0910970",
    title: "WALL-E",
    year: "2008",
    rated: "G",
    runtime: "98 min",
    genre: "Animation, Adventure, Family",
    posterTheme: "marmalade",
    plot:
      "A lonely trash-collecting robot discovers a new purpose after meeting a sleek probe from space.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt2380307",
    imdbId: "tt2380307",
    title: "Coco",
    year: "2017",
    rated: "PG",
    runtime: "105 min",
    genre: "Animation, Adventure, Drama",
    posterTheme: "neon",
    plot:
      "A young musician journeys into the Land of the Dead to uncover his family's hidden story.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt1490017",
    imdbId: "tt1490017",
    title: "The Lego Movie",
    year: "2014",
    rated: "PG",
    runtime: "100 min",
    genre: "Animation, Action, Adventure",
    posterTheme: "stage",
    plot:
      "An ordinary construction worker is mistaken for the hero who can save a world made of bricks.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0093779",
    imdbId: "tt0093779",
    title: "The Princess Bride",
    year: "1987",
    rated: "PG",
    runtime: "98 min",
    genre: "Adventure, Comedy, Family",
    posterTheme: "woodland",
    plot:
      "A fairy-tale adventure follows true love through sword fights, schemes, and unexpected allies.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0083866",
    imdbId: "tt0083866",
    title: "E.T. the Extra-Terrestrial",
    year: "1982",
    rated: "PG",
    runtime: "115 min",
    genre: "Adventure, Family, Sci-Fi",
    posterTheme: "marmalade",
    plot:
      "A lonely child befriends a stranded alien and helps him find a way home.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
  {
    id: "tt0097814",
    imdbId: "tt0097814",
    title: "Kiki's Delivery Service",
    year: "1989",
    rated: "G",
    runtime: "103 min",
    genre: "Animation, Adventure, Family",
    posterTheme: "neon",
    plot:
      "A young witch moves to a seaside town and starts a delivery service while learning independence.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Awaiting family ratings",
  },
];

const blankMember = {
  name: "",
  birthDate: "",
  gender: "",
  role: "child",
  permission: "guided",
};

function createInviteCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
}

function normalizeInviteCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function normalizeMemberPermission(role, permission) {
  if (permission === "rate" && role !== "adult") {
    return "guided";
  }

  return permission || "guided";
}

function getAgeFromBirthDate(birthDate, referenceDate = new Date()) {
  if (!birthDate) return "";

  const [yearValue, monthValue, dayValue] = String(birthDate).split("-").map(Number);

  if (!yearValue || !monthValue || !dayValue) return "";

  let age = referenceDate.getFullYear() - yearValue;
  const hasHadBirthdayThisYear =
    referenceDate.getMonth() + 1 > monthValue ||
    (referenceDate.getMonth() + 1 === monthValue && referenceDate.getDate() >= dayValue);

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? String(age) : "";
}

function buildFamilySnapshotForReview(familyProfile, user) {
  const reviewDate = new Date();
  const members = (familyProfile?.members || []).map((member) => {
    const ageAtReview = getAgeFromBirthDate(member.birthDate, reviewDate) || member.age || "";

    return {
      id: member.id || "",
      hasAccount: Boolean(member.userId),
      isReviewer: Boolean(member.userId && member.userId === user?.uid),
      isLeadAdult: Boolean(member.isLeadAdult),
      role: member.role || "member",
      age: ageAtReview,
      gender: member.gender || "",
      permission: member.permission || "member",
    };
  });
  const numericAges = members
    .map((member) => Number(member.age))
    .filter((age) => Number.isFinite(age));
  const roleCounts = members.reduce(
    (counts, member) => ({
      ...counts,
      [member.role]: (counts[member.role] || 0) + 1,
    }),
    {},
  );

  return {
    familyId: familyProfile.id,
    familyName: familyProfile.displayName,
    leadAdultUserId: familyProfile.leadAdultUserId,
    reviewerUserId: user?.uid || "",
    memberCount: members.length,
    accountMemberCount: members.filter((member) => member.hasAccount).length,
    childCount: members.filter((member) => member.role === "child").length,
    teenCount: members.filter((member) => member.role === "teen").length,
    adultCount: members.filter((member) => member.role === "adult").length,
    roleCounts,
    youngestAge: numericAges.length ? Math.min(...numericAges) : null,
    oldestAge: numericAges.length ? Math.max(...numericAges) : null,
    members,
  };
}

function calculatePersonalizedFamilyFit({ guide, familyProfile, familyMovieReview, movie }) {
  if (!guide || !familyProfile?.members?.length) return null;

  const familyShape = getFamilyShape(familyProfile);
  const preferences = {
    ...defaultFamilyPreferences,
    ...(familyProfile.preferences || {}),
  };
  const startingScore = calculateFamilyFitStartingScore(guide, familyShape, preferences);
  const adjustments = [
    getAgeRangeFitAdjustment(guide.bestAgeRange, familyShape),
    getConcernFitAdjustment(guide.concernLevels, preferences),
    getRuntimeFitAdjustment(movie?.runtime, preferences),
    getEnergyFitAdjustment(guide, preferences),
    getTasteSignalAdjustment(guide, familyProfile),
  ];
  const preferenceScore = clampGuideScore(
    startingScore + adjustments.reduce((total, adjustment) => total + adjustment, 0),
  );
  const similarFamilyScore = getSimilarFamilyScore(movie, guide);
  const ownFamilyScore = getOwnFamilyScore(familyMovieReview, movie);

  let blendedScore = preferenceScore;

  if (Number.isFinite(similarFamilyScore)) {
    blendedScore = weightedAverage([
      [blendedScore, 0.82],
      [similarFamilyScore, 0.18],
    ]);
  }

  if (Number.isFinite(ownFamilyScore)) {
    blendedScore = weightedAverage([
      [blendedScore, 0.55],
      [ownFamilyScore, 0.45],
    ]);
  }

  return Number(clampGuideScore(blendedScore).toFixed(1));
}

const familyPreferenceKeys = [
  "scareTolerance",
  "violenceTolerance",
  "languageTolerance",
  "romanceNudityTolerance",
  "preferredEnergy",
  "preferredRuntime",
  "wantsParentAppeal",
];

function hasCompleteFamilyPreferences(familyProfile) {
  const preferences = familyProfile?.preferences || {};

  return Boolean(
    familyProfile?.id &&
      familyProfile?.members?.length &&
      familyPreferenceKeys.every((key) =>
        key === "wantsParentAppeal" ? typeof preferences[key] === "boolean" : Boolean(preferences[key]),
      ),
  );
}

function buildGuidedMoviePool({ featuredCatalog = [], appealCatalog = [], guideCatalog = [] }) {
  const movieMap = new Map();
  const addMovie = (movie) => {
    if (!movie?.id && !movie?.imdbId) return;

    const movieId = movie.id || movie.imdbId;
    const guide = movie.familyGuide || seededMovieGuideMap.get(movieId);
    const existingMovie = movieMap.get(movieId) || {};

    movieMap.set(movieId, {
      ...existingMovie,
      ...movie,
      id: movieId,
      imdbId: movie.imdbId || movieId,
      familyGuide: movie.familyGuide || (guide ? normalizeMovieGuide(guide) : existingMovie.familyGuide),
    });
  };
  const addGuide = (guide) => {
    if (!guide?.id && !guide?.imdbId) return;

    const movieId = guide.id || guide.imdbId;
    const existingMovie = movieMap.get(movieId) || {};
    movieMap.set(movieId, {
      ...createMovieFromGuide(guide),
      ...existingMovie,
      id: movieId,
      imdbId: guide.imdbId || existingMovie.imdbId || movieId,
      familyGuide: existingMovie.familyGuide || normalizeMovieGuide(guide),
    });
  };

  seededMovieGuides.forEach(addGuide);
  homeAppealMovieGuides.forEach(addGuide);
  guideCatalog.forEach(addGuide);
  featuredCatalog.forEach(addMovie);
  appealCatalog.flatMap((category) => category.movies || []).forEach(addMovie);

  return Array.from(movieMap.values()).filter((movie) => movie.familyGuide);
}

function createMovieFromGuide(guide) {
  const movieId = guide.id || guide.imdbId;

  return {
    id: movieId,
    imdbId: guide.imdbId || movieId,
    title: guide.title || "Untitled movie",
    year: guide.year || "",
    rated: guide.rated || "NR",
    runtime: guide.runtime || "Runtime TBD",
    genre: guide.genre || "Guide available",
    posterUrl: guide.posterUrl || "",
    posterTheme: "marmalade",
    plot: guide.summary || "This movie has a Pizza Scale Guide.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: guide.bestAgeRange || "Guide available",
    familyGuide: normalizeMovieGuide(guide),
  };
}

function buildFamilyTasteProfileFromReviews(familyReviews = [], guidedMovies = []) {
  const guidedMovieMap = new Map(guidedMovies.map((movie) => [movie.id, movie]));
  const weightedSignals = {
    likedGenres: new Map(),
    dislikedGenres: new Map(),
    likedToneTags: new Map(),
    dislikedToneTags: new Map(),
    likedSignals: new Map(),
    avoidedSignals: new Map(),
  };

  familyReviews.forEach((review) => {
    const score = Number(review.pizzaScore);
    if (!Number.isFinite(score)) return;

    const movie = guidedMovieMap.get(review.movieId) || guidedMovieMap.get(review.imdbId);
    const guide = movie?.familyGuide;
    const isLiked = score >= 6.5;
    const isDisliked = score <= 4;

    if (!isLiked && !isDisliked) return;

    const weight = isLiked ? Math.max(0.5, score - 6) : Math.max(0.5, 4.5 - score);
    const genreBucket = isLiked ? weightedSignals.likedGenres : weightedSignals.dislikedGenres;
    const toneBucket = isLiked ? weightedSignals.likedToneTags : weightedSignals.dislikedToneTags;
    const signalBucket = isLiked ? weightedSignals.likedSignals : weightedSignals.avoidedSignals;

    splitGenreList(review.movieGenre || movie?.genre).forEach((genre) =>
      addWeightedSignal(genreBucket, genre, weight),
    );
    normalizeStringList(guide?.toneTags).forEach((tag) => addWeightedSignal(toneBucket, tag, weight));
    normalizeStringList(guide?.matchSignals).forEach((signal) =>
      addWeightedSignal(signalBucket, signal, weight),
    );
  });

  return Object.fromEntries(
    Object.entries(weightedSignals).map(([key, value]) => [key, getTopWeightedSignals(value)]),
  );
}

function addWeightedSignal(signalMap, signal, weight = 1) {
  const normalizedSignal = String(signal || "").trim();
  if (!normalizedSignal) return;

  signalMap.set(normalizedSignal, (signalMap.get(normalizedSignal) || 0) + weight);
}

function getTopWeightedSignals(signalMap) {
  return Array.from(signalMap.entries())
    .sort((first, second) => second[1] - first[1])
    .slice(0, 8)
    .map(([signal]) => signal);
}

function splitGenreList(value) {
  return String(value || "")
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
}

function rankGuidedRecommendations({ movies = [], familyProfile, familyReviews = [] }) {
  if (!hasCompleteFamilyPreferences(familyProfile)) return [];

  const reviewMap = new Map(
    familyReviews.flatMap((review) => [
      [review.movieId, review],
      [review.imdbId, review],
    ]),
  );
  const tasteProfile = buildFamilyTasteProfileFromReviews(familyReviews, movies);
  const familyProfileWithTaste = {
    ...familyProfile,
    tasteProfile,
  };

  return movies
    .map((movie) => {
      const familyMovieReview = reviewMap.get(movie.id) || reviewMap.get(movie.imdbId);
      const familyFitScore = calculatePersonalizedFamilyFit({
        guide: movie.familyGuide,
        familyProfile: familyProfileWithTaste,
        familyMovieReview,
        movie,
      });

      if (!Number.isFinite(familyFitScore)) return null;

      const rankingScore = familyFitScore + getRecommendationTasteBoost(movie, tasteProfile);

      return {
        ...movie,
        familyFitScore,
        recommendationScore: Number(rankingScore.toFixed(2)),
      };
    })
    .filter(Boolean)
    .sort((first, second) => {
      if (second.recommendationScore !== first.recommendationScore) {
        return second.recommendationScore - first.recommendationScore;
      }

      return String(first.title).localeCompare(String(second.title));
    });
}

function getRecommendationTasteBoost(movie, tasteProfile = {}) {
  const likedGenres = normalizeStringList(tasteProfile.likedGenres).map((signal) =>
    signal.toLowerCase(),
  );
  const dislikedGenres = normalizeStringList(tasteProfile.dislikedGenres).map((signal) =>
    signal.toLowerCase(),
  );
  const likedStyles = normalizeStringList([
    ...(tasteProfile.likedToneTags || []),
    ...(tasteProfile.likedSignals || []),
  ]).map((signal) => signal.toLowerCase());
  const avoidedStyles = normalizeStringList([
    ...(tasteProfile.dislikedToneTags || []),
    ...(tasteProfile.avoidedSignals || []),
  ]).map((signal) => signal.toLowerCase());
  const movieGenres = splitGenreList(movie.genre).map((genre) => genre.toLowerCase());
  const guideSignals = normalizeStringList([
    ...(movie.familyGuide?.toneTags || []),
    ...(movie.familyGuide?.matchSignals || []),
    ...(movie.familyGuide?.goodFor || []),
  ])
    .join(" ")
    .toLowerCase();
  const guideWarnings = normalizeStringList([
    ...(movie.familyGuide?.mayNotFit || []),
    ...(movie.familyGuide?.watchOutFor || []),
  ])
    .join(" ")
    .toLowerCase();
  const genreBoost = movieGenres.filter((genre) => likedGenres.includes(genre)).length * 0.28;
  const styleBoost =
    likedStyles.filter((signal) => signal.length > 2 && guideSignals.includes(signal)).length *
    0.18;
  const genrePenalty = movieGenres.filter((genre) => dislikedGenres.includes(genre)).length * 0.32;
  const stylePenalty =
    avoidedStyles.filter(
      (signal) =>
        signal.length > 2 && (guideSignals.includes(signal) || guideWarnings.includes(signal)),
    ).length * 0.2;

  return Math.min(1.2, genreBoost + styleBoost) - Math.min(1.1, genrePenalty + stylePenalty);
}

function filterRecommendedMovies(movies, filters) {
  return movies.filter((movie) => {
    const genres = splitGenreList(movie.genre);
    const runtimeMinutes = getRuntimeMinutes(movie.runtime);

    if (filters.genre !== "all" && !genres.includes(filters.genre)) return false;
    if (filters.rating !== "all" && movie.rated !== filters.rating) return false;
    if (filters.duration === "short" && (!Number.isFinite(runtimeMinutes) || runtimeMinutes >= 95)) {
      return false;
    }
    if (
      filters.duration === "medium" &&
      (!Number.isFinite(runtimeMinutes) || runtimeMinutes < 95 || runtimeMinutes > 120)
    ) {
      return false;
    }
    if (filters.duration === "long" && (!Number.isFinite(runtimeMinutes) || runtimeMinutes <= 120)) {
      return false;
    }

    return true;
  });
}

function getRuntimeMinutes(runtime) {
  const minutes = Number(String(runtime || "").match(/\d+/)?.[0]);
  return Number.isFinite(minutes) ? minutes : null;
}

function getFamilyShape(familyProfile) {
  const members = (familyProfile?.members || []).map((member) => {
    const age = Number(getAgeFromBirthDate(member.birthDate) || member.age);
    const role = member.role || (Number.isFinite(age) && age >= 18 ? "adult" : "child");

    return {
      ...member,
      age: Number.isFinite(age) ? age : null,
      role,
    };
  });
  const childrenAndTeens = members.filter((member) => ["child", "teen"].includes(member.role));
  const adults = members.filter((member) => member.role === "adult");
  const kids = members.filter((member) => member.role === "child");
  const teens = members.filter((member) => member.role === "teen");
  const ages = childrenAndTeens.map((member) => member.age).filter(Number.isFinite);

  return {
    members,
    adults,
    kids,
    teens,
    childAndTeenCount: childrenAndTeens.length,
    youngestViewerAge: ages.length ? Math.min(...ages) : null,
    oldestViewerAge: ages.length ? Math.max(...ages) : null,
  };
}

function calculateFamilyFitStartingScore(guide, familyShape, preferences) {
  const appealScores = [
    [guide.familyNightFit, 1],
    [guide.parentAppeal, familyShape.adults.length || preferences.wantsParentAppeal ? 0.9 : 0.35],
    [guide.kidAppeal, Math.max(0.35, familyShape.kids.length)],
    [guide.teenAppeal, Math.max(0.35, familyShape.teens.length)],
  ];

  return weightedAverage(appealScores) || guide.familyNightFit || 5;
}

function getAgeRangeFitAdjustment(bestAgeRange, familyShape) {
  if (!bestAgeRange || familyShape.youngestViewerAge == null) return 0;

  const range = parseGuideAgeRange(bestAgeRange);
  if (!range) return 0;

  let adjustment = 0;

  if (Number.isFinite(range.min) && familyShape.youngestViewerAge < range.min) {
    adjustment -= Math.min(1.4, (range.min - familyShape.youngestViewerAge) * 0.28);
  }

  if (Number.isFinite(range.max) && familyShape.oldestViewerAge > range.max + 2) {
    adjustment -= Math.min(0.7, (familyShape.oldestViewerAge - range.max - 2) * 0.14);
  }

  if (
    Number.isFinite(range.min) &&
    familyShape.youngestViewerAge >= range.min &&
    (!Number.isFinite(range.max) || familyShape.oldestViewerAge <= range.max + 2)
  ) {
    adjustment += 0.25;
  }

  return adjustment;
}

function parseGuideAgeRange(bestAgeRange) {
  const text = String(bestAgeRange).toLowerCase();
  const rangeMatch = text.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }

  const plusMatch = text.match(/(\d{1,2})\s*\+/);
  if (plusMatch) {
    return { min: Number(plusMatch[1]), max: null };
  }

  const firstAge = text.match(/(\d{1,2})/);
  return firstAge ? { min: Number(firstAge[1]), max: null } : null;
}

function getConcernFitAdjustment(concernLevels = {}, preferences = {}) {
  const concernPreferences = {
    scare: preferences.scareTolerance,
    violence: preferences.violenceTolerance,
    language: preferences.languageTolerance,
    romanceNudity: preferences.romanceNudityTolerance,
    substances: preferences.substancesTolerance || preferences.languageTolerance || "moderate",
  };

  return Object.entries(concernPreferences).reduce((total, [concernKey, tolerance]) => {
    const concernLevel = Number(concernLevels?.[concernKey]);
    if (!Number.isFinite(concernLevel)) return total;

    const ceiling = toleranceCeilings[tolerance] ?? toleranceCeilings.moderate;
    const excess = Math.max(0, concernLevel - ceiling);
    const comfort = Math.max(0, ceiling - concernLevel);

    return total - excess * 0.42 + Math.min(0.18, comfort * 0.05);
  }, 0);
}

function getRuntimeFitAdjustment(runtime, preferences = {}) {
  const minutes = Number(String(runtime || "").match(/\d+/)?.[0]);
  if (!Number.isFinite(minutes)) return 0;

  if (preferences.preferredRuntime === "short") {
    if (minutes > 120) return -0.9;
    if (minutes > 105) return -0.45;
  }

  if (preferences.preferredRuntime === "long" && minutes < 85) {
    return -0.15;
  }

  return 0;
}

function getEnergyFitAdjustment(guide, preferences = {}) {
  const preferredEnergy = preferences.preferredEnergy || "balanced";
  if (preferredEnergy === "balanced") return 0;

  const signals = [
    ...(guide.toneTags || []),
    ...(guide.goodFor || []),
    ...(guide.mayNotFit || []),
    ...(guide.matchSignals || []),
  ]
    .join(" ")
    .toLowerCase();

  const highEnergy = /action|intense|fast|chaotic|thrill|superhero|adventure|loud/.test(signals);
  const gentleEnergy = /gentle|calm|quiet|cozy|low-stress|comfort|slow/.test(signals);

  if (preferredEnergy === "gentle") {
    return highEnergy ? -0.45 : gentleEnergy ? 0.25 : 0;
  }

  if (preferredEnergy === "high-energy") {
    return gentleEnergy && !highEnergy ? -0.25 : highEnergy ? 0.2 : 0;
  }

  return 0;
}

function getTasteSignalAdjustment(guide, familyProfile) {
  const tasteProfile = familyProfile?.tasteProfile || familyProfile?.preferenceSignals || {};
  const likedSignals = normalizeStringList([
    ...(tasteProfile.likedGenres || []),
    ...(tasteProfile.likedToneTags || []),
    ...(tasteProfile.likedSignals || []),
  ]).map((signal) => signal.toLowerCase());
  const avoidedSignals = normalizeStringList([
    ...(tasteProfile.dislikedGenres || []),
    ...(tasteProfile.dislikedToneTags || []),
    ...(tasteProfile.avoidedSignals || []),
  ]).map((signal) => signal.toLowerCase());
  const guideSignals = normalizeStringList([
    ...(guide.toneTags || []),
    ...(guide.goodFor || []),
    ...(guide.matchSignals || []),
  ])
    .join(" ")
    .toLowerCase();
  const guideWarnings = normalizeStringList([
    ...(guide.mayNotFit || []),
    ...(guide.watchOutFor || []),
  ])
    .join(" ")
    .toLowerCase();
  const likedMatches = likedSignals.filter((signal) => guideSignals.includes(signal)).length;
  const avoidedMatches = avoidedSignals.filter(
    (signal) => guideSignals.includes(signal) || guideWarnings.includes(signal),
  ).length;

  return Math.min(0.6, likedMatches * 0.15) - Math.min(0.9, avoidedMatches * 0.22);
}

function getSimilarFamilyScore(movie, guide) {
  const signals = movie?.familyFitSignals || guide?.familyFitSignals || {};
  const score =
    signals.similarFamilyPizzaScore ??
    signals.similarFamilyFit ??
    movie?.similarFamilyPizzaScore ??
    guide?.similarFamilyPizzaScore;

  return normalizeGuideScore(score);
}

function getOwnFamilyScore(familyMovieReview, movie) {
  return normalizeGuideScore(
    familyMovieReview?.pizzaScore ??
      movie?.familyFitSignals?.ownFamilyPizzaScore ??
      movie?.ownFamilyPizzaScore,
  );
}

function weightedAverage(weightedValues) {
  const validValues = weightedValues.filter(
    ([value, weight]) => Number.isFinite(Number(value)) && Number(weight) > 0,
  );
  const totalWeight = validValues.reduce((total, [, weight]) => total + Number(weight), 0);

  if (!totalWeight) return null;

  return (
    validValues.reduce((total, [value, weight]) => total + Number(value) * Number(weight), 0) /
    totalWeight
  );
}

function clampGuideScore(value) {
  return Math.max(1, Math.min(8, Number(value)));
}

function getBroadChildAgeRanges(familySnapshot) {
  return (familySnapshot?.members || [])
    .filter((member) => ["child", "teen"].includes(member.role))
    .map((member) => Number(member.age))
    .filter((age) => Number.isFinite(age))
    .map((age) => {
      if (age <= 5) return "0-5";
      if (age <= 8) return "6-8";
      if (age <= 12) return "9-12";
      if (age <= 15) return "13-15";
      return "16-17";
    })
    .filter((range, index, ranges) => ranges.indexOf(range) === index);
}

function getRatingAdultUserIds(members, leadAdultUserId) {
  const ratingUserIds = (members || [])
    .filter(
      (member) =>
        member.userId &&
        (member.role === "adult" || member.isLeadAdult) &&
        ["lead", "colead", "co-lead", "manage", "rate"].includes(member.permission || ""),
    )
    .map((member) => member.userId);

  return Array.from(new Set([leadAdultUserId, ...ratingUserIds].filter(Boolean)));
}

function getInitialJoinCode() {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    return normalizeInviteCode(
      searchParams.get("familyCode") || searchParams.get("invite") || searchParams.get("code") || "",
    );
  } catch {
    return "";
  }
}

function getMovieDeepLink() {
  try {
    const hash = window.location.hash || "";
    const [hashRoute, hashQuery = ""] = hash.replace(/^#/, "").split("?");
    const hashParams = new URLSearchParams(hashQuery);
    const searchParams = new URLSearchParams(window.location.search);
    const imdbId = (hashParams.get("imdbId") || searchParams.get("imdbId") || "").trim();

    if (!/^tt\d{5,12}$/.test(imdbId)) return null;

    return {
      imdbId,
      title: (hashParams.get("title") || searchParams.get("title") || "").trim(),
      page: hashRoute === "/rate-movie" ? "rate-movie" : "movie",
    };
  } catch {
    return null;
  }
}

function buildFamilyInviteLink(inviteCode, inviterName = "") {
  if (!inviteCode) return "";

  const searchParams = new URLSearchParams({ familyCode: inviteCode });

  if (inviterName.trim()) {
    searchParams.set("from", inviterName.trim());
  }

  return `${window.location.origin}${window.location.pathname}?${searchParams.toString()}`;
}

async function copyTextToClipboard(text) {
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

async function createUniqueInviteCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteCode = createInviteCode();
    const inviteSnapshot = await getDoc(doc(db, "familyInvites", inviteCode));

    if (!inviteSnapshot.exists()) {
      return inviteCode;
    }
  }

  throw new Error("Invite code could not be created. Please try again.");
}

function App() {
  const [page, setPage] = useState("home");
  const [movieBackPage, setMovieBackPage] = useState("home");
  const [familySetupReturnPage, setFamilySetupReturnPage] = useState("home");
  const [settingsInitialSection, setSettingsInitialSection] = useState("account");
  const [pendingJoinCode, setPendingJoinCode] = useState(() => getInitialJoinCode());
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [featuredCatalog, setFeaturedCatalog] = useState(featuredMovies);
  const [appealCatalog, setAppealCatalog] = useState(homeAppealMovieCatalog);
  const [guideCatalog, setGuideCatalog] = useState([]);
  const [movieResults, setMovieResults] = useState(featuredMovies);
  const [selectedMovie, setSelectedMovie] = useState(featuredMovies[0]);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [user, setUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [profilePhotos, setProfilePhotos] = useState(() => readStoredProfilePhotos());
  const [userProfile, setUserProfile] = useState(null);
  const [familyProfile, setFamilyProfile] = useState(null);
  const [familyLoadStatus, setFamilyLoadStatus] = useState("idle");
  const [publicReviews, setPublicReviews] = useState([]);
  const [familyMovieReview, setFamilyMovieReview] = useState(null);
  const [familyReviews, setFamilyReviews] = useState([]);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewSaveStatus, setReviewSaveStatus] = useState("idle");
  const [selectedConcernKey, setSelectedConcernKey] = useState("scare");
  const [review, setReview] = useState({
    parentScore: 7,
    kidScore: 8,
    visibility: "aggregate",
    writtenReview: "",
    showAgeShape: true,
  });

  useEffect(
    () =>
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);

        if (!currentUser) {
          setUserProfile(null);
          setFamilyProfile(null);
          setFamilyLoadStatus("idle");
        }
      }),
    [],
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadUserProfile() {
      if (!user) return;

      try {
        const profileSnapshot = await getDoc(doc(db, "userProfiles", user.uid));

        if (!isCurrent) return;
        setUserProfile(profileSnapshot.exists() ? profileSnapshot.data() : null);
      } catch {
        if (!isCurrent) return;
        setUserProfile(null);
      }
    }

    loadUserProfile();

    return () => {
      isCurrent = false;
    };
  }, [user]);

  useEffect(() => {
    if (!pendingJoinCode) return;

    setMenuOpen(false);
    setAuthMessage("");
    setSettingsInitialSection("family");

    if (user) {
      setPage("settings");
    } else {
      setAuthMode("create");
      setPage("signin");
    }
  }, [pendingJoinCode, user]);

  useEffect(() => {
    let isCurrent = true;

    async function loadFamilyProfile() {
      if (!user) return;

      setFamilyLoadStatus("loading");

      try {
        const familiesSnapshot = await getDocs(
          firestoreQuery(
            collection(db, "families"),
            where("memberUserIds", "array-contains", user.uid),
            limit(1),
          ),
        );

        if (!isCurrent) return;

        if (familiesSnapshot.empty) {
          setFamilyProfile(null);
          setFamilyLoadStatus("empty");
          return;
        }

        const familyDoc = familiesSnapshot.docs[0];
        const membersSnapshot = await getDocs(
          firestoreQuery(
            collection(db, "familyMembers"),
            where("familyId", "==", familyDoc.id),
          ),
        );

        if (!isCurrent) return;

        setFamilyProfile({
          id: familyDoc.id,
          ...familyDoc.data(),
          members: membersSnapshot.docs.map((memberDoc) => ({
            id: memberDoc.id,
            ...memberDoc.data(),
          })),
        });
        setFamilyLoadStatus("ready");
      } catch {
        if (!isCurrent) return;
        setFamilyLoadStatus("error");
      }
    }

    loadFamilyProfile();

    return () => {
      isCurrent = false;
    };
  }, [user]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      firestoreQuery(collection(db, "movieGuides"), limit(500)),
      (guideSnapshot) => {
        setGuideCatalog(
          guideSnapshot.docs.map((guideDoc) => ({
            id: guideDoc.id,
            ...guideDoc.data(),
          })),
        );
      },
      () => {
        setGuideCatalog([]);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function loadFeaturedPosters() {
      const hydrateSeedMovies = async (movies) => {
        const hydratedMovies = await Promise.all(
          movies.map(async (movie, index) => {
            try {
              return {
                ...movie,
                ...normalizeOmdbMovie(await getOmdbMovie(movie.imdbId), index),
              };
            } catch {
              return movie;
            }
          }),
        );

        return hydrateMoviesWithStats(hydratedMovies);
      };

      const hydratedAppealCatalog = await Promise.all(
        homeAppealMovieCatalog.map(async (category) => ({
          ...category,
          movies: await hydrateSeedMovies(category.movies),
        })),
      );
      const hydratedMovies = await hydrateSeedMovies(featuredMovies);

      if (!isCurrent) return;

      setFeaturedCatalog(hydratedMovies);
      setAppealCatalog(hydratedAppealCatalog);
      setMovieResults((currentResults) =>
        currentResults === featuredMovies ? hydratedMovies : currentResults,
      );
      setSelectedMovie((currentMovie) =>
        currentMovie.id === featuredMovies[0].id ? hydratedMovies[0] : currentMovie,
      );
    }

    loadFeaturedPosters();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (deepLinkHandled) return;

    const deepLink = getMovieDeepLink();
    if (!deepLink?.imdbId) {
      setDeepLinkHandled(true);
      return;
    }

    let isCurrent = true;

    async function openDeepLinkedMovie() {
      const catalogMovies = [
        ...featuredCatalog,
        ...appealCatalog.flatMap((category) => category.movies || []),
      ];
      const catalogMovie = catalogMovies.find(
        (movie) => movie.id === deepLink.imdbId || movie.imdbId === deepLink.imdbId,
      );
      const seededGuide = seededMovieGuideMap.get(deepLink.imdbId);
      let movie =
        catalogMovie ||
        normalizeOmdbMovie(
          {
            imdbId: deepLink.imdbId,
            title: deepLink.title || seededGuide?.title || "Selected movie",
            year: "",
          },
          0,
        );

      try {
        movie = normalizeOmdbMovie(await getOmdbMovie(deepLink.imdbId), 0);
      } catch {
        // The fallback movie still lets the guide open if OMDb is unavailable.
      }

      const [hydratedMovie] = await hydrateMoviesWithStats([movie]);

      if (!isCurrent) return;

      setSelectedMovie(hydratedMovie);
      setMovieResults((currentResults) =>
        currentResults.some((currentMovie) => currentMovie.id === hydratedMovie.id)
          ? currentResults
          : [hydratedMovie, ...currentResults],
      );
      setMovieBackPage("home");
      setPage(deepLink.page);
      setDeepLinkHandled(true);
    }

    openDeepLinkedMovie();

    return () => {
      isCurrent = false;
    };
  }, [appealCatalog, deepLinkHandled, featuredCatalog]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    let isCurrent = true;

    if (normalizedQuery.length < 2) {
      setMovieResults(featuredCatalog);
      setSelectedMovie((currentMovie) =>
        featuredCatalog.some((movie) => movie.id === currentMovie.id)
          ? currentMovie
          : featuredCatalog[0],
      );
      setSearchStatus("idle");
      setSearchMessage("");
      return () => {
        isCurrent = false;
      };
    }

    setSearchStatus("loading");
    setSearchMessage("Searching OMDb...");

    const searchTimer = window.setTimeout(async () => {
      try {
        const results = await searchOmdbMovies(normalizedQuery);
        const detailResults = await Promise.all(
          results.slice(0, 6).map(async (movie, index) => {
            try {
              return normalizeOmdbMovie(await getOmdbMovie(movie.imdbId), index);
            } catch {
              return normalizeOmdbMovie(movie, index);
            }
          }),
        );
        const detailResultsWithStats = await hydrateMoviesWithStats(detailResults);

        if (!isCurrent) return;

        setMovieResults(detailResultsWithStats);
        setSelectedMovie(detailResultsWithStats[0] || featuredCatalog[0]);
        setSearchStatus(detailResultsWithStats.length ? "ready" : "empty");
        setSearchMessage(
          detailResultsWithStats.length ? "Live results from OMDb" : "No movies found",
        );
      } catch (error) {
        if (!isCurrent) return;

        setMovieResults(featuredCatalog);
        setSelectedMovie(featuredCatalog[0]);
        setSearchStatus("error");
        setSearchMessage(error.message || "Movie search is unavailable right now");
      }
    }, 350);

    return () => {
      isCurrent = false;
      window.clearTimeout(searchTimer);
    };
  }, [featuredCatalog, query]);

  useEffect(() => {
    let isCurrent = true;

    async function loadPublicReviews() {
      if (!selectedMovie?.id) {
        setPublicReviews([]);
        return;
      }

      try {
        const reviewSnapshot = await getDocs(
          firestoreQuery(
            collection(db, "publicReviews"),
            where("movieId", "==", selectedMovie.id),
            limit(8),
          ),
        );

        if (!isCurrent) return;

        setPublicReviews(
          reviewSnapshot.docs.map((reviewDoc) => ({
            id: reviewDoc.id,
            ...reviewDoc.data(),
          })),
        );
      } catch {
        if (!isCurrent) return;
        setPublicReviews([]);
      }
    }

    loadPublicReviews();

    return () => {
      isCurrent = false;
    };
  }, [selectedMovie]);

  useEffect(() => {
    if (!familyProfile?.id) {
      setFamilyReviews([]);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      firestoreQuery(
        collection(db, "reviews"),
        where("familyId", "==", familyProfile.id),
        limit(200),
      ),
      (reviewSnapshot) => {
        setFamilyReviews(
          reviewSnapshot.docs.map((reviewDoc) => ({
            id: reviewDoc.id,
            ...reviewDoc.data(),
          })),
        );
      },
      () => {
        setFamilyReviews([]);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [familyProfile?.id]);

  useEffect(() => {
    let isCurrent = true;

    async function loadFamilyMovieReview() {
      if (!familyProfile?.id || !selectedMovie?.id) {
        setFamilyMovieReview(null);
        return;
      }

      try {
        const reviewSnapshot = await getDoc(
          doc(db, "reviews", `${familyProfile.id}_${selectedMovie.id}`),
        );

        if (!isCurrent) return;

        setFamilyMovieReview(
          reviewSnapshot.exists()
            ? {
                id: reviewSnapshot.id,
                ...reviewSnapshot.data(),
              }
            : null,
        );
      } catch {
        if (!isCurrent) return;
        setFamilyMovieReview(null);
      }
    }

    loadFamilyMovieReview();

    return () => {
      isCurrent = false;
    };
  }, [familyProfile?.id, selectedMovie]);

  useEffect(() => {
    let isCurrent = true;

    async function loadFamilyFitSignals() {
      if (!user || !familyProfile?.id || !selectedMovie?.id) return;

      try {
        const getMovieScaleSummary = httpsCallable(functions, "getMovieScaleSummary");
        const result = await getMovieScaleSummary({
          imdbId: selectedMovie.id,
          familyId: familyProfile.id,
        });
        const summary = result.data || {};

        if (!isCurrent) return;

        setSelectedMovie((currentMovie) => {
          if (currentMovie.id !== selectedMovie.id) return currentMovie;

          const movieWithSignals = {
            ...currentMovie,
            familyFitSignals: summary.familyFitSignals || null,
          };

          return summary.guide && !currentMovie.familyGuide
            ? mergeMovieGuide(movieWithSignals, summary.guide)
            : movieWithSignals;
        });

        if (summary.familyReview) {
          setFamilyMovieReview((currentReview) => currentReview || summary.familyReview);
        }
      } catch {
        // Family Fit can still be calculated from the guide and saved preferences.
      }
    }

    loadFamilyFitSignals();

    return () => {
      isCurrent = false;
    };
  }, [familyProfile?.id, selectedMovie?.id, user]);

  async function handleGoogleSignIn({ promptForFamily = true } = {}) {
    setAuthMessage("");

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const isNewUser =
        result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
      if (pendingJoinCode) {
        setSettingsInitialSection("family");
        setPage("settings");
      } else {
        setPage(promptForFamily && isNewUser ? "family-prompt" : "home");
      }
    } catch (error) {
      setAuthMessage(
        error.code === "auth/operation-not-allowed"
          ? "Google sign-in needs to be enabled in Firebase Authentication."
          : "Google sign-in could not be completed. Please try again.",
      );
    }
  }

  async function handleEmailAuth({
    mode,
    email,
    password,
    displayName,
    birthDate,
    gender,
    photoURL,
  }) {
    setAuthMessage("");

    try {
      if (!email.trim()) {
        setAuthMessage("Please enter an email address.");
        return;
      }

      if (!password) {
        setAuthMessage("Please enter a password.");
        return;
      }

      if (mode === "create") {
        const cleanDisplayName = displayName.trim();

        if (!cleanDisplayName) {
          setAuthMessage("Please add your first name so your profile can be created.");
          return;
        }

        if (!birthDate || !gender) {
          setAuthMessage("Please add your birthday and gender so your profile can be created.");
          return;
        }

        const result = await createUserWithEmailAndPassword(auth, email, password);
        const uploadedPhotoURL = photoURL
          ? await uploadProfilePhoto(result.user.uid, photoURL)
          : "";
        await updateProfile(result.user, {
          displayName: cleanDisplayName,
          ...(uploadedPhotoURL ? { photoURL: uploadedPhotoURL } : {}),
        });
        await setDoc(doc(db, "userProfiles", result.user.uid), {
          firstName: cleanDisplayName,
          birthDate,
          gender,
          photoURL: uploadedPhotoURL || photoURL || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (photoURL) {
          setProfilePhotos((currentPhotos) => {
            const nextPhotos = { ...currentPhotos, [result.user.uid]: uploadedPhotoURL || photoURL };
            writeStoredProfilePhotos(nextPhotos);
            return nextPhotos;
          });
        }
        setUser({
          uid: result.user.uid,
          displayName: cleanDisplayName,
          email: result.user.email,
          photoURL: uploadedPhotoURL || photoURL,
        });
        setUserProfile({
          firstName: cleanDisplayName,
          birthDate,
          gender,
          photoURL: uploadedPhotoURL || photoURL || "",
        });
        if (pendingJoinCode) {
          setSettingsInitialSection("family");
          setPage("settings");
        } else {
          setPage("family-prompt");
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        if (pendingJoinCode) {
          setSettingsInitialSection("family");
          setPage("settings");
        } else {
          setPage("home");
        }
      }
    } catch (error) {
      setAuthMessage(getEmailAuthErrorMessage(error, mode));
    }
  }

  async function handleSignOut() {
    setMenuOpen(false);
    setAuthMessage("");
    setConfirmingSignOut(false);
    await signOut(auth);
    setPage("home");
  }

  function requestSignOut() {
    setMenuOpen(false);
    setConfirmingSignOut(true);
  }

  function goHome() {
    setMenuOpen(false);
    setAuthMessage("");
    setQuery("");
    setMovieResults(featuredCatalog);
    setSelectedMovie(featuredCatalog[0]);
    setPage("home");
  }

  function openSignIn(mode = "login") {
    setMenuOpen(false);
    setAuthMessage("");
    setAuthMode(mode);
    setPage("signin");
  }

  function handleHeaderSearchChange(nextQuery) {
    setQuery(nextQuery);

    if (nextQuery.trim()) {
      setMenuOpen(false);
      setAuthMessage("");
      setPage("search");
    }
  }

  function openMovieStats(movie, backPage = page) {
    setSelectedMovie(movie);
    setAuthMessage("");
    setReviewMessage("");
    setReviewSaveStatus("idle");
    setMovieBackPage(backPage === "movie" ? "home" : backPage);
    setPage("movie");
  }

  function openMovieRating() {
    setAuthMessage("");
    setReviewMessage("");
    setReviewSaveStatus("idle");
    setPage("rate-movie");
  }

  function openConcernDetail(concernKey) {
    setSelectedConcernKey(concernKey);
    setAuthMessage("");
    setPage("concern-detail");
  }

  async function handleSaveReview() {
    setReviewMessage("");

    if (!user) {
      openSignIn("login");
      return;
    }

    if (!familyProfile) {
      setReviewSaveStatus("error");
      setReviewMessage("Create or join a family before saving Pizza Scale ratings.");
      return;
    }

    if (!canRateForFamilyProfile(familyProfile, user)) {
      setReviewSaveStatus("error");
      setReviewMessage("Only an adult with rating permission can save family ratings.");
      return;
    }

    const parentScore = Number(review.parentScore);
    const kidScore = Number(review.kidScore);
    const pizzaScore = (parentScore + kidScore) / 2;
    const reviewVisibility = review.visibility === "public" ? "public" : "aggregate";
    const movieId = selectedMovie.id;
    const reviewId = `${familyProfile.id}_${movieId}`;
    const reviewRef = doc(db, "reviews", reviewId);
    const publicReviewRef = doc(db, "publicReviews", reviewId);
    const familySnapshotAtReview = buildFamilySnapshotForReview(familyProfile, user);
    const publicChildAgeRanges = review.showAgeShape
      ? getBroadChildAgeRanges(familySnapshotAtReview)
      : [];

    setReviewSaveStatus("saving");
    setReviewMessage("Saving rating...");

    try {
      const existingReviewSnapshot = await getDoc(reviewRef);
      const existingReview = existingReviewSnapshot.exists()
        ? existingReviewSnapshot.data()
        : null;

      if (existingReview) {
        setFamilyMovieReview({
          id: reviewId,
          ...existingReview,
        });
        setReviewSaveStatus("error");
        setReviewMessage("Your family has already rated this movie.");
        return;
      }

      const reviewPayload = {
        familyId: familyProfile.id,
        familyName: familyProfile.displayName,
        leadAdultUserId: familyProfile.leadAdultUserId,
        userId: user.uid,
        movieId,
        imdbId: selectedMovie.imdbId || movieId,
        movieTitle: selectedMovie.title,
        movieYear: selectedMovie.year,
        movieRated: selectedMovie.rated,
        movieRuntime: selectedMovie.runtime,
        movieGenre: selectedMovie.genre,
        moviePosterUrl: selectedMovie.posterUrl || "",
        moviePlot: selectedMovie.plot,
        parentScore,
        kidScore,
        pizzaScore,
        visibility: reviewVisibility,
        writtenReview: review.writtenReview.trim(),
        showAgeShape: review.showAgeShape,
        familySnapshotAtReview,
        reviewerSnapshotAtReview:
          familySnapshotAtReview.members.find((member) => member.isReviewer) || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(
        reviewRef,
        reviewPayload,
        { merge: true },
      );

      if (reviewVisibility === "public") {
        await setDoc(
          publicReviewRef,
          {
            familyId: familyProfile.id,
            familyName: familyProfile.displayName,
            movieId,
            imdbId: selectedMovie.imdbId || movieId,
            movieTitle: selectedMovie.title,
            movieYear: selectedMovie.year,
            pizzaScore,
            parentScore,
            kidScore,
            writtenReview: review.writtenReview.trim(),
            showAgeShape: review.showAgeShape,
            publicChildAgeRanges,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      setFamilyMovieReview({
        id: reviewId,
        ...reviewPayload,
      });
      setFamilyReviews((reviews) => [
        {
          id: reviewId,
          ...reviewPayload,
        },
        ...reviews.filter((savedReview) => savedReview.id !== reviewId),
      ]);

      if (reviewVisibility === "public") {
        setPublicReviews((reviews) => [
          {
            id: reviewId,
            familyName: familyProfile.displayName,
            pizzaScore,
            writtenReview: review.writtenReview.trim(),
            parentScore,
            kidScore,
            publicChildAgeRanges,
          },
          ...reviews.filter((publicReview) => publicReview.id !== reviewId),
        ]);
      }

      setReviewSaveStatus("ready");
      setReviewMessage("Rating saved. Pizza Score totals will update shortly.");
      setPage("movie");
    } catch {
      setReviewSaveStatus("error");
      setReviewMessage("The rating could not be saved yet. Check Firebase rules and try again.");
    }
  }

  async function handleUpdateFamily(nextFamilyProfile) {
    if (!user || !canManageFamilyProfile(familyProfile, user)) {
      throw new Error("Only a family leader or co-leader can update family settings.");
    }

    const ratingAdultUserIds = getRatingAdultUserIds(
      nextFamilyProfile.members,
      nextFamilyProfile.leadAdultUserId,
    );

    await updateDoc(doc(db, "families", nextFamilyProfile.id), {
      displayName: nextFamilyProfile.displayName,
      ratingAdultUserIds,
      preferences: {
        ...defaultFamilyPreferences,
        ...(nextFamilyProfile.preferences || {}),
      },
      updatedAt: serverTimestamp(),
    });

    const savedMembers = await Promise.all(
      nextFamilyProfile.members
        .filter((member) => member.firstNameOrNickname?.trim())
        .map(async (member) => {
          const memberPayload = {
            firstNameOrNickname: member.firstNameOrNickname.trim(),
            role: member.role || "child",
            birthDate: member.birthDate || "",
            gender: member.gender || "",
            permission: normalizeMemberPermission(member.role || "child", member.permission),
            updatedAt: serverTimestamp(),
          };

          if (member.id) {
            await updateDoc(doc(db, "familyMembers", member.id), memberPayload);
            return { ...member, ...memberPayload };
          }

          const memberDoc = await addDoc(collection(db, "familyMembers"), {
            ...memberPayload,
            familyId: nextFamilyProfile.id,
            isLeadAdult: false,
            createdAt: serverTimestamp(),
          });

          return {
            id: memberDoc.id,
            ...member,
            ...memberPayload,
            familyId: nextFamilyProfile.id,
            isLeadAdult: false,
          };
        }),
    );

    setFamilyProfile({
      ...nextFamilyProfile,
      ratingAdultUserIds,
      preferences: {
        ...defaultFamilyPreferences,
        ...(nextFamilyProfile.preferences || {}),
      },
      members: savedMembers,
    });
  }

  async function handleDeleteFamily() {
    if (!user || !canDeleteFamilyProfile(familyProfile, user)) {
      throw new Error("Only the person who created this family can delete it.");
    }

    const familyId = familyProfile.id;
    const deleteFamily = httpsCallable(functions, "deleteFamily");
    await deleteFamily({ familyId });

    setFamilyProfile(null);
    setFamilyMovieReview(null);
    setPublicReviews((reviews) =>
      reviews.filter(
        (reviewItem) =>
          reviewItem.familyId !== familyId && !String(reviewItem.id || "").startsWith(`${familyId}_`),
      ),
    );
    setSettingsInitialSection("family");
  }

  async function handleCreateInviteCode() {
    if (!user || !canManageFamilyProfile(familyProfile, user)) {
      throw new Error("Only a family leader or co-leader can create invite codes.");
    }

    if (familyProfile?.familyCode || familyProfile?.inviteCode) {
      throw new Error("This family already has a permanent join code.");
    }

    const inviteCode = await createUniqueInviteCode();

    await setDoc(doc(db, "familyInvites", inviteCode), {
      code: inviteCode,
      familyCode: inviteCode,
      familyId: familyProfile.id,
      familyName: familyProfile.displayName,
      createdByUserId: user.uid,
      createdByName: userProfile?.firstName || user.displayName || "Someone",
      status: "active",
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "families", familyProfile.id), {
      inviteCode,
      familyCode: inviteCode,
      updatedAt: serverTimestamp(),
    });

    setFamilyProfile({ ...familyProfile, inviteCode, familyCode: inviteCode });
    return inviteCode;
  }

  async function handleJoinFamily({ inviteCode, displayName, claimMemberId, createNewProfile }) {
    if (!user) {
      throw new Error("Sign in before joining a family.");
    }

    const joinFamily = httpsCallable(functions, "joinFamilyByInvite");
    const result = await joinFamily({
      inviteCode: normalizeInviteCode(inviteCode),
      displayName,
      claimMemberId,
      createNewProfile,
    });

    if (result.data?.requiresMemberConfirmation) {
      return result.data;
    }

    setFamilyProfile(result.data);
    setPendingJoinCode("");
    return result.data;
  }

  async function handleUpdateAccount({ displayName, birthDate, gender, photoURL }) {
    if (!auth.currentUser) {
      throw new Error("Please sign in before updating your account.");
    }

    const cleanDisplayName = displayName.trim();

    if (!cleanDisplayName) {
      throw new Error("First name cannot be empty.");
    }

    if (!birthDate || !gender) {
      throw new Error("Birthday and gender are required.");
    }

    const uploadedPhotoURL = photoURL
      ? await uploadProfilePhoto(auth.currentUser.uid, photoURL)
      : "";
    const nextPhotoURL =
      uploadedPhotoURL || photoURL || profilePhotos[auth.currentUser.uid] || user?.photoURL || "";

    await updateProfile(auth.currentUser, {
      displayName: cleanDisplayName,
      ...(uploadedPhotoURL ? { photoURL: uploadedPhotoURL } : {}),
    });
    await setDoc(
      doc(db, "userProfiles", auth.currentUser.uid),
      {
        firstName: cleanDisplayName,
        birthDate,
        gender,
        ...(nextPhotoURL ? { photoURL: nextPhotoURL } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    if (nextPhotoURL) {
      setProfilePhotos((currentPhotos) => {
        const nextPhotos = { ...currentPhotos, [auth.currentUser.uid]: nextPhotoURL };
        writeStoredProfilePhotos(nextPhotos);
        return nextPhotos;
      });
    }

    setUser({
      ...auth.currentUser,
      displayName: cleanDisplayName,
      photoURL: nextPhotoURL || auth.currentUser.photoURL,
    });
    setUserProfile((profile) => ({
      ...(profile || {}),
      firstName: cleanDisplayName,
      birthDate,
      gender,
      ...(nextPhotoURL ? { photoURL: nextPhotoURL } : {}),
    }));
  }

  async function handlePasswordReset(email) {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      throw new Error("Enter your email address first.");
    }

    await sendPasswordResetEmail(auth, cleanEmail);
  }

  return (
    <main className="app-shell">
      {page !== "signin" && (
        <SiteHeader
          user={user}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          query={query}
          setQuery={handleHeaderSearchChange}
          showHeaderSearch={page !== "search"}
          profilePhoto={user ? profilePhotos[user.uid] : ""}
          onHome={goHome}
          onSignIn={() => openSignIn("login")}
          onSignUp={() => openSignIn("create")}
          onSignOut={requestSignOut}
          onSearch={() => {
            setMenuOpen(false);
            setAuthMessage("");
            setPage("search");
          }}
          onRecommendations={() => {
            setMenuOpen(false);
            setAuthMessage("");
            setPage("recommendations");
          }}
          onAbout={() => {
            setMenuOpen(false);
            setAuthMessage("");
            setPage("about");
          }}
          onSettings={() => {
            setMenuOpen(false);
            setAuthMessage("");
            setSettingsInitialSection("account");
            setPage("settings");
          }}
        />
      )}

      {authMessage && page !== "signin" && <div className="auth-banner error">{authMessage}</div>}

      {page === "home" && (
        <HomePage
          movieResults={featuredCatalog}
          appealCategories={appealCatalog}
          guideCatalog={guideCatalog}
          familyProfile={familyProfile}
          familyReviews={familyReviews}
          selectedMovie={selectedMovie}
          onOpenMovie={(movie) => openMovieStats(movie, "home")}
          onSeeRecommendations={() => setPage("recommendations")}
        />
      )}

      {page === "search" && (
        <SearchPage
          query={query}
          setQuery={setQuery}
          movieResults={movieResults}
          selectedMovie={selectedMovie}
          setSelectedMovie={(movie) => openMovieStats(movie, "search")}
          searchMessage={searchMessage}
          searchStatus={searchStatus}
        />
      )}

      {page === "movie" && (
        <MovieStatsPage
          selectedMovie={selectedMovie}
          user={user}
          familyProfile={familyProfile}
          familyMovieReview={familyMovieReview}
          canRateForFamily={canRateForFamilyProfile(familyProfile, user)}
          publicReviews={publicReviews}
          reviewMessage={reviewMessage}
          reviewSaveStatus={reviewSaveStatus}
          onRateMovie={openMovieRating}
          onOpenConcern={openConcernDetail}
          onBack={() => setPage(movieBackPage)}
        />
      )}

      {page === "concern-detail" && (
        <ConcernDetailPage
          selectedMovie={selectedMovie}
          concernKey={selectedConcernKey}
          onBack={() => setPage("movie")}
        />
      )}

      {page === "rate-movie" && (
        <MovieRatingPage
          selectedMovie={selectedMovie}
          review={review}
          setReview={setReview}
          user={user}
          familyProfile={familyProfile}
          familyMovieReview={familyMovieReview}
          canRateForFamily={canRateForFamilyProfile(familyProfile, user)}
          reviewMessage={reviewMessage}
          reviewSaveStatus={reviewSaveStatus}
          onSaveReview={handleSaveReview}
          onSignIn={() => openSignIn("login")}
          onBack={() => setPage("movie")}
        />
      )}

      {page === "signin" && (
        <SignInPage
          initialMode={authMode}
          authMessage={authMessage}
          onEmailAuth={handleEmailAuth}
          onGoogleSignIn={() => handleGoogleSignIn({ promptForFamily: true })}
          onPasswordReset={handlePasswordReset}
          onBack={goHome}
        />
      )}

      {page === "family-prompt" && (
        <FamilyPromptPage
          onSkip={goHome}
          onCreateFamily={() => {
            setFamilySetupReturnPage("home");
            setPage("family-setup");
          }}
        />
      )}

      {page === "family-setup" && (
        <FamilySetupPage
          user={user}
          userProfile={userProfile}
          onSaved={(family) => {
            setFamilyProfile(family);
            setPage(familySetupReturnPage);
          }}
          onBack={() =>
            setPage(familySetupReturnPage === "settings" ? "settings" : "family-prompt")
          }
        />
      )}

      {page === "recommendations" && (
        <RecommendationsPage
          user={user}
          familyProfile={familyProfile}
          familyReviews={familyReviews}
          featuredCatalog={featuredCatalog}
          appealCatalog={appealCatalog}
          guideCatalog={guideCatalog}
          selectedMovie={selectedMovie}
          onOpenMovie={(movie) => openMovieStats(movie, "recommendations")}
          onSignIn={() => openSignIn("login")}
          onOpenSettings={() => {
            setSettingsInitialSection("family");
            setPage("settings");
          }}
        />
      )}

      {page === "about" && <AboutPage onSearch={() => setPage("search")} />}

      {page === "settings" && (
        <SettingsPage
          user={user}
          userProfile={userProfile}
          profilePhoto={user ? profilePhotos[user.uid] : ""}
          familyProfile={familyProfile}
          initialSection={settingsInitialSection}
          initialJoinCode={pendingJoinCode}
          onUpdateAccount={handleUpdateAccount}
          onUpdateFamily={handleUpdateFamily}
          onDeleteFamily={handleDeleteFamily}
          onCreateInviteCode={handleCreateInviteCode}
          onJoinFamily={handleJoinFamily}
          onSignOut={requestSignOut}
          onBack={goHome}
          onCreateFamily={() => {
            setFamilySetupReturnPage("settings");
            setSettingsInitialSection("family");
            setPage("family-setup");
          }}
        />
      )}

      {confirmingSignOut && (
        <SignOutConfirmDialog
          onCancel={() => setConfirmingSignOut(false)}
          onConfirm={handleSignOut}
        />
      )}
    </main>
  );
}

function readStoredProfilePhotos() {
  try {
    return JSON.parse(window.localStorage.getItem(PROFILE_PHOTOS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStoredProfilePhotos(profilePhotos) {
  try {
    window.localStorage.setItem(PROFILE_PHOTOS_STORAGE_KEY, JSON.stringify(profilePhotos));
  } catch {
    // Profile photos are cosmetic; account creation should still succeed if storage is full.
  }
}

async function uploadProfilePhoto(userId, dataUrl) {
  try {
    const photoRef = ref(storage, `profilePhotos/${userId}/avatar`);
    await uploadString(photoRef, dataUrl, "data_url");
    return await getDownloadURL(photoRef);
  } catch {
    return "";
  }
}

async function hydrateMoviesWithStats(movies) {
  return Promise.all(
    movies.map(async (movie) => {
      try {
        const [movieSnapshot, guideSnapshot] = await Promise.all([
          getDoc(doc(db, "movies", movie.id)),
          getDoc(doc(db, "movieGuides", movie.id)),
        ]);
        let hydratedMovie = movie;

        if (movieSnapshot.exists()) {
          hydratedMovie = mergeMovieStats(hydratedMovie, movieSnapshot.data());
        }

        if (guideSnapshot.exists()) {
          hydratedMovie = mergeMovieGuide(hydratedMovie, guideSnapshot.data());
        } else if (seededMovieGuideMap.has(movie.id)) {
          hydratedMovie = mergeMovieGuide(hydratedMovie, seededMovieGuideMap.get(movie.id));
        }

        return hydratedMovie;
      } catch {
        return movie;
      }
    }),
  );
}

function mergeMovieStats(movie, stats) {
  const pizzaScore = typeof stats.avgPizzaScore === "number" ? stats.avgPizzaScore : null;
  const reviewCount = typeof stats.reviewCount === "number" ? stats.reviewCount : 0;

  return {
    ...movie,
    pizzaScore,
    familyMatch:
      typeof stats.familyMatch === "number"
        ? stats.familyMatch
        : pizzaScore
          ? Math.round((pizzaScore / 8) * 100)
          : null,
    reviewCount,
    ageFit: reviewCount > 0 ? "Family reviewed" : movie.ageFit,
  };
}

function mergeMovieGuide(movie, guide) {
  const normalizedGuide = normalizeMovieGuide(guide);

  if (!normalizedGuide) return movie;

  return {
    ...movie,
    familyGuide: normalizedGuide,
    guideStatus: normalizedGuide.status,
    ageFit:
      movie.reviewCount > 0
        ? movie.ageFit
        : normalizedGuide.bestAgeRange || movie.ageFit || "Guide pending",
  };
}

function normalizeMovieGuide(guide) {
  if (!guide || guide.status === "empty") return null;

  return {
    status: guide.status || "draft",
    guideVersion: guide.guideVersion || "pizza-guide-v1",
    sourceType: guide.sourceType || "pizza-scale-guide",
    summary: String(guide.summary || "").trim(),
    bestAgeRange: String(guide.bestAgeRange || "").trim(),
    parentAppeal: normalizeGuideScore(guide.parentAppeal),
    kidAppeal: normalizeGuideScore(guide.kidAppeal),
    teenAppeal: normalizeGuideScore(guide.teenAppeal),
    familyNightFit: normalizeGuideScore(guide.familyNightFit),
    concernLevels: {
      scare: normalizeConcernLevel(guide.concernLevels?.scare),
      violence: normalizeConcernLevel(guide.concernLevels?.violence),
      language: normalizeConcernLevel(guide.concernLevels?.language),
      romanceNudity: normalizeConcernLevel(guide.concernLevels?.romanceNudity),
      substances: normalizeConcernLevel(guide.concernLevels?.substances),
    },
    toneTags: normalizeStringList(guide.toneTags),
    goodFor: normalizeStringList(guide.goodFor),
    mayNotFit: normalizeStringList(guide.mayNotFit),
    conversationTopics: normalizeStringList(guide.conversationTopics),
    watchOutFor: normalizeStringList(guide.watchOutFor),
    matchSignals: normalizeStringList(guide.matchSignals),
    concernDetails: normalizeConcernDetails(guide.concernDetails),
    reviewedAt: guide.reviewedAt || null,
  };
}

function normalizeGuideScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) return null;

  return Math.max(1, Math.min(8, score));
}

function normalizeConcernLevel(value) {
  const level = Number(value);

  if (!Number.isFinite(level)) return null;

  return Math.max(0, Math.min(4, level));
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];
}

function normalizeConcernDetails(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.keys(guideConcernLabels).map((key) => [
      key,
      normalizeStringList(value[key]).slice(0, 6),
    ]),
  );
}

function emptyWatchProviderGroups() {
  return {
    stream: [],
    rent: [],
    buy: [],
  };
}

function normalizeWatchProviderGroups(value) {
  const groups = emptyWatchProviderGroups();

  return Object.fromEntries(
    Object.keys(groups).map((key) => [
      key,
      Array.isArray(value?.[key])
        ? value[key]
            .map((provider) => ({
              id: String(provider?.id || provider?.name || "").trim(),
              name: String(provider?.name || "").trim(),
              logoUrl: String(provider?.logoUrl || "").trim(),
              webUrl: String(provider?.webUrl || "").trim(),
            }))
            .filter((provider) => provider.name && !isHiddenWatchProvider(provider))
            .slice(0, 12)
        : [],
    ]),
  );
}

function isHiddenWatchProvider(provider) {
  const name = String(provider?.name || "");
  return /\(\s*via\b/i.test(name) || /^kanopy$/i.test(name.trim());
}

function getProviderCount(groups) {
  return Object.values(groups || {}).reduce(
    (total, providers) => total + (Array.isArray(providers) ? providers.length : 0),
    0,
  );
}

function getUniqueWatchProviders(groups) {
  const providers = [];
  const seen = new Set();

  Object.values(groups || {}).forEach((groupProviders) => {
    if (!Array.isArray(groupProviders)) return;

    groupProviders.forEach((provider) => {
      const key = provider.id || provider.name;

      if (!key || seen.has(key)) return;

      seen.add(key);
      providers.push(provider);
    });
  });

  return providers;
}

function getProviderInitials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getWatchProviderSummary(watchState) {
  if (watchState.status === "loading") return "Checking watch availability";
  if (watchState.status === "unavailable") return "Watch availability unavailable";

  return `${getProviderCount(watchState.providers)} watch options available`;
}

function getWatchProviderMessage(data) {
  if (data?.reason === "missing-key") {
    return "Watch availability needs backend setup.";
  }

  if (data?.reason === "quota-or-key") {
    return "Watch availability is unavailable right now.";
  }

  return data?.message || "";
}

function getWatchProviderErrorMessage(error) {
  if (error?.code === "functions/not-found") {
    return "Watch availability will appear after the backend function is deployed.";
  }

  if (error?.code === "functions/unauthenticated" || error?.code === "functions/permission-denied") {
    return "Watch availability is unavailable right now.";
  }

  if (error?.code === "functions/unavailable" || error?.code === "functions/deadline-exceeded") {
    return "Watch availability is temporarily unavailable.";
  }

  return "Watch availability is unavailable right now.";
}

function canManageFamilyProfile(familyProfile, user) {
  if (!familyProfile || !user) return false;
  if (familyProfile.leadAdultUserId === user.uid) return true;
  if (familyProfile.coLeaderUserIds?.includes(user.uid)) return true;

  const currentMember = familyProfile.members?.find((member) => member.userId === user.uid);
  return ["lead", "colead", "co-lead", "manage"].includes(currentMember?.permission);
}

function canDeleteFamilyProfile(familyProfile, user) {
  if (!familyProfile || !user) return false;

  return (familyProfile.createdByUserId || familyProfile.leadAdultUserId) === user.uid;
}

function canRateForFamilyProfile(familyProfile, user) {
  if (!familyProfile || !user) return false;
  if (familyProfile.leadAdultUserId === user.uid) return true;

  const currentMember = familyProfile.members?.find(
    (member) =>
      member.userId === user.uid ||
      (member.isLeadAdult && familyProfile.leadAdultUserId === user.uid),
  );
  const role = currentMember?.role || "";
  const permission = currentMember?.permission || "";
  const isAdult = role === "adult" || currentMember?.isLeadAdult;

  if (!isAdult) return false;
  if (familyProfile.coLeaderUserIds?.includes(user.uid)) return true;

  return ["lead", "colead", "co-lead", "manage", "rate"].includes(permission);
}

function SignOutConfirmDialog({ onCancel, onConfirm }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-out-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Account</p>
        <h2 id="sign-out-title">Sign out?</h2>
        <p>You will need to sign back in before saving ratings or managing your family.</p>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Stay signed in
          </button>
          <button className="primary-button" type="button" onClick={onConfirm}>
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}

function SiteHeader({
  user,
  menuOpen,
  setMenuOpen,
  query,
  setQuery,
  showHeaderSearch = true,
  profilePhoto,
  onHome,
  onSignIn,
  onSignUp,
  onSignOut,
  onSearch,
  onRecommendations,
  onAbout,
  onSettings,
}) {
  return (
    <header className="site-header">
      <div className="header-left">
        <button
          className={`menu-button ${menuOpen ? "open" : ""}`}
          type="button"
          aria-label={menuOpen ? "Close site menu" : "Open site menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className="account-menu site-menu">
            <div className="menu-links">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSearch();
                }}
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRecommendations();
                }}
              >
                Recommendations
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onAbout();
                }}
              >
                About
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSettings();
                  }}
                >
                  Settings
                </button>
              )}
            </div>
            <div className="menu-auth-actions">
              {!user ? (
                <>
                  <button className="menu-auth-button dark" type="button" onClick={onSignIn}>
                    Sign in
                  </button>
                  <button className="menu-auth-button light" type="button" onClick={onSignUp}>
                    Sign up
                  </button>
                </>
              ) : (
                <button className="menu-auth-button light" type="button" onClick={onSignOut}>
                  Sign out
                </button>
              )}
            </div>
          </div>
        )}
        <button
          className="brand-mark"
          type="button"
          aria-label="The Pizza Scale home"
          onClick={onHome}
        >
          <img src={pizzaWordmark} alt="" aria-hidden="true" />
        </button>
      </div>
      <div>
        {showHeaderSearch && (
          <label className="search-label header-search" htmlFor="site-movie-search">
            <Search size={18} />
            <input
              id="site-movie-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search family-tested movies"
            />
          </label>
        )}
      </div>
      <div className="account-actions">
        {!user ? (
          <button className="sign-in-button" type="button" onClick={onSignIn}>
            <Users size={18} />
            Sign in
          </button>
        ) : (
          <button
            className="avatar-button"
            type="button"
            aria-label="Open account settings"
            onClick={onSettings}
          >
            <ProfileAvatar user={user} photoURL={profilePhoto} />
          </button>
        )}
      </div>
    </header>
  );
}

function ProfileAvatar({ user, name, photoURL }) {
  const source = photoURL || user?.photoURL || "";
  const label = name || user?.displayName || user?.email || "P";
  const initial = label.trim().charAt(0).toUpperCase() || "P";

  if (source) {
    return <img className="profile-avatar" src={source} alt="" />;
  }

  return <span className="profile-avatar initial-avatar">{initial}</span>;
}

function ProfilePhotoCropper({ source, fileName, onCancel, onApply }) {
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const previewStyle = {
    transform: `translate(${offsetX / 2}%, ${offsetY / 2}%) scale(${zoom})`,
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  async function applyCrop() {
    setIsProcessing(true);

    try {
      const dataUrl = await createCompressedProfilePhoto(source, { zoom, offsetX, offsetY });
      onApply({ dataUrl, fileName });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-photo-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="crop-photo-title">Crop your photo</h2>
        <div className="crop-preview" aria-label="Profile picture crop preview">
          <img src={source} alt="" style={previewStyle} />
        </div>
        <label className="crop-control">
          Zoom
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <div className="crop-control-grid">
          <label className="crop-control">
            Move sideways
            <input
              type="range"
              min="-100"
              max="100"
              value={offsetX}
              onChange={(event) => setOffsetX(Number(event.target.value))}
            />
          </label>
          <label className="crop-control">
            Move up/down
            <input
              type="range"
              min="-100"
              max="100"
              value={offsetY}
              onChange={(event) => setOffsetY(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={applyCrop}
            disabled={isProcessing}
          >
            {isProcessing ? "Preparing..." : "Use photo"}
          </button>
        </div>
      </section>
    </div>
  );
}

function readProfilePhotoFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be loaded."));
    image.src = source;
  });
}

async function createCompressedProfilePhoto(source, crop) {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const outputSize = PROFILE_PHOTO_OUTPUT_SIZE;
  const context = canvas.getContext("2d");

  canvas.width = outputSize;
  canvas.height = outputSize;
  context.fillStyle = "#fff7e7";
  context.fillRect(0, 0, outputSize, outputSize);

  const baseScale = Math.max(outputSize / image.naturalWidth, outputSize / image.naturalHeight);
  const scale = baseScale * crop.zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const maxShiftX = Math.max(0, (drawWidth - outputSize) / 2);
  const maxShiftY = Math.max(0, (drawHeight - outputSize) / 2);
  const drawX = (outputSize - drawWidth) / 2 + maxShiftX * (crop.offsetX / 100);
  const drawY = (outputSize - drawHeight) / 2 + maxShiftY * (crop.offsetY / 100);

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return canvas.toDataURL("image/jpeg", PROFILE_PHOTO_OUTPUT_QUALITY);
}

function getEmailAuthErrorMessage(error, mode) {
  switch (error.code) {
    case "auth/operation-not-allowed":
      return "Email/password sign-in needs to be enabled in Firebase Authentication.";
    case "auth/email-already-in-use":
      return "That email already has an account. Try logging in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Please use a stronger password with at least 6 characters.";
    case "auth/missing-password":
      return "Please enter a password.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "That email and password do not match an account.";
    case "auth/network-request-failed":
      return "The network request failed. Check your connection and try again.";
    default:
      return mode === "create"
        ? "Account could not be created. Please check your details and try again."
        : "Sign-in could not be completed. Check your email and password.";
  }
}

function RecommendationsPage({
  user,
  familyProfile,
  familyReviews,
  featuredCatalog,
  appealCatalog,
  guideCatalog,
  selectedMovie,
  onOpenMovie,
  onSignIn,
  onOpenSettings,
}) {
  const [filters, setFilters] = useState({
    genre: "all",
    rating: "all",
    duration: "all",
  });
  const guidedMovies = buildGuidedMoviePool({
    featuredCatalog,
    appealCatalog,
    guideCatalog,
  });
  const rankedMovies = rankGuidedRecommendations({
    movies: guidedMovies,
    familyProfile,
    familyReviews,
  });
  const filteredMovies = filterRecommendedMovies(rankedMovies, filters);
  const genreOptions = Array.from(
    new Set(rankedMovies.flatMap((movie) => splitGenreList(movie.genre))),
  ).sort();
  const ratingOptions = Array.from(
    new Set(rankedMovies.map((movie) => movie.rated).filter(Boolean)),
  ).sort();

  return (
    <section className="recommendations-page">
      <div className="recommendations-card">
        <p className="eyebrow">Recommendations</p>
        <h2>Movies picked for your family</h2>
        {!user ? (
          <div className="recommendation-empty-state">
            <strong>Sign in to get recommendations</strong>
            <p>
              The Pizza Scale needs your account and family profile before it can shape movie
              suggestions around your household.
            </p>
            <button className="sign-in-button" type="button" onClick={onSignIn}>
              <Users size={18} />
              Sign in
            </button>
          </div>
        ) : !hasCompleteFamilyPreferences(familyProfile) ? (
          <div className="recommendation-empty-state">
            <strong>Finish your family preferences</strong>
            <p>
              Recommendations use your family profile and preferences to sort movies with Pizza
              Scale Guides.
            </p>
            <button className="secondary-button" type="button" onClick={onOpenSettings}>
              Open family settings
            </button>
          </div>
        ) : (
          <>
            <p className="recommendations-intro">
              Ranked by Family Fit, with extra weight for genres and styles your family has rated
              highly.
            </p>
            <div className="recommendation-filters" aria-label="Recommendation filters">
              <label>
                Genre
                <select
                  value={filters.genre}
                  onChange={(event) => setFilters({ ...filters, genre: event.target.value })}
                >
                  <option value="all">All genres</option>
                  {genreOptions.map((genre) => (
                    <option value={genre} key={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Age rating
                <select
                  value={filters.rating}
                  onChange={(event) => setFilters({ ...filters, rating: event.target.value })}
                >
                  <option value="all">All ratings</option>
                  {ratingOptions.map((rating) => (
                    <option value={rating} key={rating}>
                      {rating}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Duration
                <select
                  value={filters.duration}
                  onChange={(event) => setFilters({ ...filters, duration: event.target.value })}
                >
                  <option value="all">Any length</option>
                  <option value="short">Under 95 min</option>
                  <option value="medium">95-120 min</option>
                  <option value="long">Over 120 min</option>
                </select>
              </label>
            </div>
            {filteredMovies.length ? (
              <div className="recommendation-results-grid">
                {filteredMovies.map((movie) => (
                  <button
                    className={`recommendation-result-card ${
                      selectedMovie?.id === movie.id ? "active" : ""
                    }`}
                    type="button"
                    key={movie.id}
                    onClick={() => onOpenMovie(movie)}
                  >
                    <PosterTile movie={movie} />
                    <span>
                      <strong>{movie.title}</strong>
                      <small>
                        {movie.year} · {movie.rated || "NR"} · {movie.runtime || "Runtime TBD"}
                      </small>
                      <small>{splitGenreList(movie.genre).slice(0, 3).join(", ")}</small>
                      <span className="recommendation-card-score">
                        <PizzaFill value={movie.familyFitScore} />
                        <b>{Number(movie.familyFitScore).toFixed(1)} / 8 Family Fit</b>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="recommendation-empty-state">
                <strong>No guided movies match those filters</strong>
                <p>Try widening the filters to see more Pizza Scale Guide recommendations.</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AboutPage({ onSearch }) {
  const steps = [
    {
      title: "Find a movie",
      body:
        "Search for a movie from OMDb, open its statistics page, and see whether a Pizza Scale Guide or family ratings exist yet.",
    },
    {
      title: "Read the guide",
      body:
        "Pizza Scale Guides are family-centered movie profiles with age fit, appeal, content concerns, and conversation notes. They stay separate from real family ratings.",
    },
    {
      title: "Rate as a family",
      body:
        "A family leader or co-leader gives a parent slice score and a kids slice score. The overall score is the average out of 8 slices.",
    },
    {
      title: "Choose what is public",
      body:
        "Ratings can help the anonymous aggregate, or they can be shared as a public family review using only the family display name.",
    },
    {
      title: "Build better matches",
      body:
        "Your family preferences and future ratings will help The Pizza Scale explain which movies fit your household.",
    },
  ];

  return (
    <section className="about-page">
      <div className="about-card">
        <p className="eyebrow">About</p>
        <h1>How The Pizza Scale works</h1>
        <p className="about-intro">
          The Pizza Scale is a family-centered movie rating site. Instead of asking one person
          whether a movie was good, it captures how the movie worked for the whole household.
        </p>
        <div className="about-steps">
          {steps.map((step, index) => (
            <article className="about-step" key={step.title}>
              <span>{index + 1}</span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="settings-panel">
          <strong>Privacy basics</strong>
          <p>
            Children&apos;s names are not shown publicly. Public reviews use the family display
            name, and broad child age ranges are only included when the family allows it.
          </p>
        </div>
        <div className="settings-panel">
          <strong>Guides first, ratings over time</strong>
          <p>
            The site can become useful before thousands of families have rated movies by adding
            clearly marked Pizza Scale Guides. Real family ratings will still remain separate and
            will make scores and recommendations stronger over time.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={onSearch}>
          Search movies
        </button>
      </div>
    </section>
  );
}

function SearchPage({
  query,
  setQuery,
  movieResults,
  selectedMovie,
  setSelectedMovie,
  searchMessage,
  searchStatus,
}) {
  const normalizedQuery = query.trim();
  const shouldShowResults = normalizedQuery.length >= 2;
  const hasResults = shouldShowResults && movieResults.length > 0 && searchStatus !== "loading";

  return (
    <section className="search-page">
      <div className="search-page-card">
        <div className="search-page-heading">
          <p className="eyebrow">Movie search</p>
          <h1>Search the movie shelf.</h1>
        </div>
        <label className="search-label search-page-input" htmlFor="search-page-movie-search">
          <Search size={20} />
          <input
            id="search-page-movie-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a movie title"
            autoFocus
          />
        </label>

        {!shouldShowResults && (
          <div className="empty-state search-empty-state">
            <strong>Search for a movie to begin</strong>
            <p>
              Results will appear here from OMDb. Pizza Scale ratings will stay empty until real
              family reviews are submitted.
            </p>
          </div>
        )}

        {shouldShowResults && searchMessage && (
          <p className={`search-status ${searchStatus}`}>{searchMessage}</p>
        )}

        {shouldShowResults && searchStatus === "empty" && (
          <div className="empty-state search-empty-state">
            <strong>No movies found</strong>
            <p>
              Try a different title or a shorter search. Pizza Scale can only show movies OMDb can
              find.
            </p>
          </div>
        )}

        {hasResults && (
          <div className="search-results-grid">
            {movieResults.map((movie) => (
              <button
                className={`search-result-card ${selectedMovie.id === movie.id ? "active" : ""}`}
                key={movie.id}
                type="button"
                onClick={() => setSelectedMovie(movie)}
              >
                <PosterTile movie={movie} />
                <span>
                  <strong>{movie.title}</strong>
                  <small>
                    {movie.year} · {movie.rated || "NR"}
                  </small>
                  <small>{movie.genre}</small>
                  <small>
                    {movie.reviewCount > 0
                      ? `${Number(movie.pizzaScore).toFixed(1)} / 8 Pizza Score`
                      : "No Pizza Scale ratings yet"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HomePage({
  movieResults,
  appealCategories,
  guideCatalog,
  familyProfile,
  familyReviews,
  selectedMovie,
  onOpenMovie,
  onSeeRecommendations,
}) {
  const guidedMovies = buildGuidedMoviePool({
    featuredCatalog: movieResults,
    appealCatalog: appealCategories,
    guideCatalog,
  });
  const recommendationMovies = rankGuidedRecommendations({
    movies: guidedMovies,
    familyProfile,
    familyReviews,
  }).slice(0, 10);
  const movieCategories = [
    ...(recommendationMovies.length
      ? [
          {
            id: "recommendations",
            title: "Recommendations",
            description: "Movies with high Family Fit for your household.",
            movies: recommendationMovies,
            actionLabel: "See more",
            onAction: onSeeRecommendations,
            showFamilyFit: true,
          },
        ]
      : []),
    {
      id: "movies-to-try",
      title: "Movies to Try",
      description: "Starter picks while The Pizza Scale gathers real family ratings.",
      movies: movieResults,
    },
    ...appealCategories,
  ];

  return (
    <>
      <section className="hero-band">
        <div className="home-hero-copy">
          <h1>Find the movie your whole family can agree on.</h1>
        </div>
      </section>

      <section className="home-browse" aria-label="Pizza Scale movie categories">
        {movieCategories.map((category) => (
          <MovieCategoryRow
            category={category}
            key={category.id}
            selectedMovie={selectedMovie}
            onSelectMovie={onOpenMovie}
          />
        ))}
      </section>
    </>
  );
}

function MovieStatsPage({
  selectedMovie,
  user,
  familyProfile,
  familyMovieReview,
  canRateForFamily,
  publicReviews,
  reviewMessage,
  reviewSaveStatus,
  onRateMovie,
  onOpenConcern,
  onBack,
}) {
  const savedFamilyScore = Number(familyMovieReview?.pizzaScore || 0);
  const ratingUnavailableReason = getRatingUnavailableReason({
    user,
    familyProfile,
    familyMovieReview,
    canRateForFamily,
  });
  const canOpenRating = !ratingUnavailableReason;

  return (
    <section className="movie-stats-page" aria-label={`${selectedMovie.title} statistics`}>
      <button className="back-button visible" type="button" onClick={onBack}>
        <ChevronLeft size={18} />
        Back to movies
      </button>
      <section className="detail-panel">
        <div className="movie-detail">
          <PosterTile movie={selectedMovie} />
          <div className="movie-copy">
            <p className="eyebrow">
              {selectedMovie.rated || "NR"} · {selectedMovie.runtime || "Runtime TBD"}
            </p>
            <h2>{selectedMovie.title}</h2>
            <p className="plot">{selectedMovie.plot}</p>
            <div className="score-row">
              <PizzaScore score={selectedMovie.pizzaScore} />
              <FamilyMatch value={selectedMovie.familyMatch} />
            </div>
            <div className="tags">
              <span>{selectedMovie.genre}</span>
              <span>{selectedMovie.ageFit}</span>
              <span>
                {selectedMovie.reviewCount > 0
                  ? `${selectedMovie.reviewCount} family ratings`
                  : "No Pizza Scale reviews yet"}
              </span>
            </div>
            <WhereToWatch movie={selectedMovie} />
          </div>
        </div>

        <PizzaGuidePanel
          guide={selectedMovie.familyGuide}
          movieTitle={selectedMovie.title}
          movie={selectedMovie}
          familyProfile={familyProfile}
          familyMovieReview={familyMovieReview}
          canShowFamilyFit={Boolean(familyProfile?.id && familyProfile?.members?.length)}
          onOpenConcern={onOpenConcern}
        />

        <div className="review-grid">
          <section className="review-form family-rating-summary">
            <div className="section-heading">
              <Star size={20} />
              <h2>{familyMovieReview ? "Your family rating" : "Rate this movie"}</h2>
            </div>

            {familyMovieReview ? (
              <>
                <div className="calculated-score">
                  <div className="calculated-score-pizza">
                    <PizzaFill value={savedFamilyScore} />
                  </div>
                  <div className="calculated-score-copy">
                    <span>Family rating</span>
                    <strong>{savedFamilyScore.toFixed(1)} / 8 slices</strong>
                  </div>
                </div>
                <div className="family-rating-breakdown">
                  <span>
                    Parent score: {Number(familyMovieReview.parentScore || 0).toFixed(1)} / 8
                  </span>
                  <span>
                    Kids score: {Number(familyMovieReview.kidScore || 0).toFixed(1)} / 8
                  </span>
                  <span>
                    Visibility:{" "}
                    {familyMovieReview.visibility === "public"
                      ? "Public family review"
                      : "Anonymous aggregate"}
                  </span>
                </div>
                {familyMovieReview.writtenReview && (
                  <div className="settings-panel">
                    <strong>Your written review</strong>
                    <p>{familyMovieReview.writtenReview}</p>
                  </div>
                )}
                <p className="form-status ready">
                  Each family can submit one Pizza Scale rating per movie.
                </p>
              </>
            ) : (
              <>
                <p className="rating-action-copy">
                  Submit one family rating for this movie with separate parent and kids slice
                  scores.
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={onRateMovie}
                  disabled={!canOpenRating}
                >
                  Rate this movie
                </button>
              </>
            )}

            {!familyMovieReview && ratingUnavailableReason && (
              <p className="form-status error">{ratingUnavailableReason}</p>
            )}
            {reviewMessage && (
              <p className={`form-status ${reviewSaveStatus}`}>{reviewMessage}</p>
            )}
          </section>

          <aside className="public-reviews">
            <div className="section-heading">
              <EyeOff size={20} />
              <h2>Public Family Reviews</h2>
            </div>
            {publicReviews.length > 0 ? (
              publicReviews.map((publicReview) => (
                <article className="public-review" key={publicReview.id}>
                  <div>
                    <strong>{publicReview.familyName || "A Pizza Scale family"}</strong>
                    <span>{Number(publicReview.pizzaScore || 0).toFixed(1)} / 8 slices</span>
                  </div>
                  {publicReview.publicChildAgeRanges?.length > 0 && (
                    <small>
                      Kids/teens in family: {publicReview.publicChildAgeRanges.join(", ")}
                    </small>
                  )}
                  {publicReview.writtenReview ? (
                    <p>{publicReview.writtenReview}</p>
                  ) : (
                    <p>This family submitted a slice score without a written review.</p>
                  )}
                </article>
              ))
            ) : (
              <div className="empty-state">
                <strong>No public family reviews yet</strong>
                <p>
                  The Pizza Scale is brand new. Once real families submit public reviews, they
                  will appear here.
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </section>
  );
}

function WhereToWatch({ movie }) {
  const [watchState, setWatchState] = useState({
    status: "idle",
    providers: emptyWatchProviderGroups(),
    message: "",
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const imdbId = movie?.imdbId || movie?.id;

  useEffect(() => {
    let isCurrent = true;

    async function loadWatchProviders() {
      if (!imdbId) {
        setWatchState({
          status: "unavailable",
          providers: emptyWatchProviderGroups(),
          message: "Watch availability is unavailable for this movie.",
        });
        return;
      }

      setWatchState((current) => ({
        ...current,
        status: "loading",
        message: "",
      }));

      try {
        const getWatchProviders = httpsCallable(functions, "getWatchProviders");
        const result = await getWatchProviders({
          imdbId,
          title: movie.title,
          year: movie.year,
          region: "US",
        });
        const providers = normalizeWatchProviderGroups(result.data?.providers);
        const hasProviders = getProviderCount(providers) > 0;

        if (!isCurrent) return;

        setWatchState({
          status: result.data?.status === "ready" && hasProviders ? "ready" : "unavailable",
          providers,
          message:
            getWatchProviderMessage(result.data) ||
            (hasProviders
              ? ""
              : "Watch availability is unavailable for this movie right now."),
        });
      } catch (error) {
        if (!isCurrent) return;

        setWatchState({
          status: "unavailable",
          providers: emptyWatchProviderGroups(),
          message: getWatchProviderErrorMessage(error),
        });
      }
    }

    setIsExpanded(false);
    loadWatchProviders();

    return () => {
      isCurrent = false;
    };
  }, [imdbId]);

  const providerCount = getProviderCount(watchState.providers);
  const iconProviders = getUniqueWatchProviders({ stream: watchState.providers.stream }).slice(0, 8);
  const isUnavailable = watchState.status === "unavailable";

  return (
    <section className="where-to-watch" aria-label={`Where to watch ${movie.title}`}>
      <button
        className="watch-summary"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        disabled={watchState.status === "loading"}
        aria-expanded={isExpanded}
      >
        <span className="watch-title">Where to watch</span>
        <span className="watch-provider-strip" aria-label={getWatchProviderSummary(watchState)}>
          {watchState.status === "loading" ? (
            <span className="watch-loading">Checking...</span>
          ) : isUnavailable ? (
            <span className="watch-unavailable">Unavailable</span>
          ) : iconProviders.length ? (
            iconProviders.map((provider) => (
              <WatchProviderIcon provider={provider} key={`${provider.id}-${provider.name}`} />
            ))
          ) : (
            <span className="watch-unavailable">Rent/buy available</span>
          )}
        </span>
        {providerCount > 0 && (
          <ChevronDown
            className={`watch-chevron ${isExpanded ? "expanded" : ""}`}
            size={18}
            aria-hidden="true"
          />
        )}
      </button>

      {isExpanded && providerCount > 0 && (
        <div className="watch-details">
          <WatchProviderGroup title="Stream" providers={watchState.providers.stream} />
          <WatchProviderGroup title="Rent" providers={watchState.providers.rent} />
          <WatchProviderGroup title="Buy" providers={watchState.providers.buy} />
        </div>
      )}

      {isUnavailable && watchState.message && <p className="watch-note">{watchState.message}</p>}
    </section>
  );
}

function WatchProviderIcon({ provider }) {
  return (
    <span className="watch-provider-icon" title={provider.name}>
      {provider.logoUrl ? (
        <img src={provider.logoUrl} alt="" loading="lazy" />
      ) : (
        <span>{getProviderInitials(provider.name)}</span>
      )}
    </span>
  );
}

function WatchProviderGroup({ title, providers }) {
  if (!providers.length) return null;

  return (
    <div className="watch-provider-group">
      <strong>{title}</strong>
      <div>
        {providers.map((provider) =>
          provider.webUrl ? (
            <a
              href={provider.webUrl}
              target="_blank"
              rel="noreferrer"
              key={`${title}-${provider.id}-${provider.name}`}
            >
              <WatchProviderIcon provider={provider} />
              {provider.name}
            </a>
          ) : (
            <span key={`${title}-${provider.id}-${provider.name}`}>
              <WatchProviderIcon provider={provider} />
              {provider.name}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function MovieRatingPage({
  selectedMovie,
  review,
  setReview,
  user,
  familyProfile,
  familyMovieReview,
  canRateForFamily,
  reviewMessage,
  reviewSaveStatus,
  onSaveReview,
  onSignIn,
  onBack,
}) {
  const overallScore = (Number(review.parentScore) + Number(review.kidScore)) / 2;
  const selectedVisibility = review.visibility === "public" ? "public" : "aggregate";
  const ratingUnavailableReason = getRatingUnavailableReason({
    user,
    familyProfile,
    familyMovieReview,
    canRateForFamily,
  });

  return (
    <section className="movie-stats-page" aria-label={`Rate ${selectedMovie.title}`}>
      <button className="back-button visible" type="button" onClick={onBack}>
        <ChevronLeft size={18} />
        Back to movie
      </button>

      <section className="detail-panel rating-page-panel">
        <div className="movie-detail compact">
          <PosterTile movie={selectedMovie} />
          <div className="movie-copy">
            <h2>Rate {selectedMovie.title}</h2>
            <p className="plot">
              Add your family&apos;s parent and kids slice scores. Your rating reflects your
              entire family&apos;s opinions of the movie.
            </p>
          </div>
        </div>

        <form className="review-form rating-page-form">
          <div className="section-heading">
            <Star size={20} />
            <h2>Family slice score</h2>
          </div>

          {ratingUnavailableReason && (
            <p className="form-status error">{ratingUnavailableReason}</p>
          )}

          <SliceInput
            label="Parent slice score"
            value={review.parentScore}
            onChange={(parentScore) => setReview({ ...review, parentScore })}
          />
          <SliceInput
            label="Kids slice score"
            value={review.kidScore}
            onChange={(kidScore) => setReview({ ...review, kidScore })}
          />

          <div className="calculated-score">
            <div className="calculated-score-pizza">
              <PizzaFill value={overallScore} />
            </div>
            <div className="calculated-score-copy">
              <span>Calculated overall</span>
              <strong>{overallScore.toFixed(1)} / 8 slices</strong>
            </div>
          </div>

          <label className="text-area-label">
            Optional public review
            <textarea
              value={review.writtenReview}
              onChange={(event) => setReview({ ...review, writtenReview: event.target.value })}
              placeholder="What should another family know before movie night?"
            />
          </label>

          <fieldset className="visibility-group">
            <legend>Review visibility</legend>
            <VisibilityChoice
              icon={<ShieldCheck size={18} />}
              label="Anonymous aggregate"
              value="aggregate"
              selected={selectedVisibility}
              onChange={(visibility) => setReview({ ...review, visibility })}
              description={
                "Your slice scores help shape Pizza Scale totals, but your family name and written review will not be shown publicly."
              }
            />
            <VisibilityChoice
              icon={<Eye size={18} />}
              label="Public family review"
              value="public"
              selected={selectedVisibility}
              onChange={(visibility) => setReview({ ...review, visibility })}
              description={
                "Your family name, slice score, and optional written review can appear for other families."
              }
            />
          </fieldset>

          {selectedVisibility === "public" && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={review.showAgeShape}
                onChange={(event) => setReview({ ...review, showAgeShape: event.target.checked })}
              />
              <span>Allow public review to show broad child age range</span>
            </label>
          )}

          {reviewMessage && <p className={`form-status ${reviewSaveStatus}`}>{reviewMessage}</p>}
          <button
            className="primary-button"
            type="button"
            onClick={user ? onSaveReview : onSignIn}
            disabled={reviewSaveStatus === "saving" || Boolean(ratingUnavailableReason)}
          >
            {reviewSaveStatus === "saving" ? "Saving..." : "Save Rating"}
          </button>
        </form>
      </section>
    </section>
  );
}

function ConcernDetailPage({ selectedMovie, concernKey, onBack }) {
  const guide = selectedMovie.familyGuide;
  const concernLabel = guideConcernLabels[concernKey] || "Concern";
  const concernValue = guide?.concernLevels?.[concernKey];
  const details = getConcernDetailItems(guide, concernKey);
  const hasSceneDetails = Boolean(guide?.concernDetails?.[concernKey]?.length);

  return (
    <section className="movie-stats-page" aria-label={`${concernLabel} details`}>
      <button className="back-button visible" type="button" onClick={onBack}>
        <ChevronLeft size={18} />
        Back to movie
      </button>
      <section className="detail-panel concern-detail-panel">
        <div className="concern-detail-hero">
          <PosterTile movie={selectedMovie} />
          <div className="movie-copy">
            <p className="eyebrow">{selectedMovie.title}</p>
            <h2>{concernLabel}</h2>
            <div className="guide-status-row">
              <span>{formatConcernLevel(concernValue)}</span>
              {guide?.bestAgeRange && <span>Best for {guide.bestAgeRange}</span>}
            </div>
            <p className="plot">
              {hasSceneDetails
                ? `These notes explain the kinds of ${concernLabel.toLowerCase()} moments families may want to know about before watching.`
                : "This guide has a basic concern rating, but a full scene-by-scene breakdown has not been written yet."}
            </p>
          </div>
        </div>

        <div className="concern-detail-card">
          <strong>What families should know</strong>
          <div className="concern-detail-list">
            {details.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        {!hasSceneDetails && (
          <div className="empty-state">
            <strong>More detail still needed</strong>
            <p>
              This page is ready for deeper Pizza Scale notes. For now, it shows the movie&apos;s
              guide-level watch-outs instead of exact timestamps or exhaustive scene descriptions.
            </p>
          </div>
        )}

      </section>
    </section>
  );
}

function getConcernDetailItems(guide, concernKey) {
  const concernDetails = guide?.concernDetails?.[concernKey] || [];

  if (concernDetails.length) return concernDetails;

  const level = guide?.concernLevels?.[concernKey];
  const label = (guideConcernLabels[concernKey] || "This concern").toLowerCase();
  const levelText = formatConcernLevel(level).toLowerCase();
  const watchOuts = guide?.watchOutFor || [];

  if (!Number.isFinite(level) || level <= 0) {
    return [`The current guide does not note meaningful ${label} concerns for this movie.`];
  }

  if (watchOuts.length) {
    return [
      `The current guide marks ${label} as ${levelText}.`,
      ...watchOuts.slice(0, 4),
    ];
  }

  return [
    `The current guide marks ${label} as ${levelText}, but detailed moment notes have not been added yet.`,
  ];
}

function PizzaGuidePanel({
  guide,
  movieTitle,
  movie,
  familyProfile,
  familyMovieReview,
  canShowFamilyFit = false,
  onOpenConcern = () => {},
}) {
  if (!guide) {
    return (
      <section className="pizza-guide-panel">
        <div className="section-heading">
          <Film size={20} />
          <h2>Pizza Scale Guide</h2>
        </div>
        <div className="empty-state">
          <strong>Family guide not created yet</strong>
          <p>
            This space will hold Pizza Scale&apos;s family-centered movie guide for {movieTitle}.
            Guides will be separate from real family ratings and marked clearly when they are
            AI-assisted or reviewed.
          </p>
        </div>
      </section>
    );
  }

  const concernEntries = Object.entries(guide.concernLevels || {}).filter(([, value]) =>
    Number.isFinite(value),
  );
  const familyFitScore = calculatePersonalizedFamilyFit({
    guide,
    familyProfile,
    familyMovieReview,
    movie,
  });

  return (
    <section className="pizza-guide-panel">
      <div className="section-heading">
        <Film size={20} />
        <h2>Pizza Scale Guide</h2>
      </div>
      <div className="guide-status-row">
        <span>{formatGuideStatus(guide.status)}</span>
        {guide.bestAgeRange && <span>Best for {guide.bestAgeRange}</span>}
      </div>
      {guide.summary && <p className="guide-summary">{guide.summary}</p>}
      <div className="guide-score-grid">
        <GuideScore
          label="Family Fit"
          value={familyFitScore}
          isLocked={!canShowFamilyFit}
          lockedText="Join or create a family to calculate your personalized fit."
          description={canShowFamilyFit ? familyFitDescription : ""}
        />
        <GuideScore label="Parent appeal" value={guide.parentAppeal} />
        <GuideScore label="Kid appeal" value={guide.kidAppeal} />
        <GuideScore label="Teen appeal" value={guide.teenAppeal} />
      </div>
      {concernEntries.length > 0 && (
        <div className="guide-concerns">
          {concernEntries.map(([key, value]) => (
            <button
              className="guide-concern-chip"
              key={key}
              type="button"
              onClick={() => onOpenConcern(key)}
            >
              {guideConcernLabels[key] || key}: {formatConcernLevel(value)}
            </button>
          ))}
        </div>
      )}
      <GuideList title="Good for" items={guide.goodFor} variant="good" />
      <GuideList
        title="May not fit"
        items={guide.mayNotFit}
        variant="caution"
      />
      <GuideList title="Watch out for" items={guide.watchOutFor} variant="watch" />
      <GuideList
        title="Conversation starters"
        items={guide.conversationTopics}
        variant="conversation"
      />
    </section>
  );
}

function GuideScore({ label, value, isLocked = false, lockedText = "", description = "" }) {
  const hasValue = Number.isFinite(value) && !isLocked;

  return (
    <div className={`guide-score-card ${isLocked ? "locked" : ""}`}>
      <span>{label}</span>
      {hasValue ? <PizzaFill value={value} /> : <div className="guide-score-placeholder" />}
      <strong>{hasValue ? `${Number(value).toFixed(1)} / 8` : "Not ready yet"}</strong>
      {description && <small>{description}</small>}
      {isLocked && <small>{lockedText}</small>}
    </div>
  );
}

function GuideList({ title, items, variant = "" }) {
  if (!items?.length) return null;

  return (
    <div className={`guide-list ${variant}`}>
      <strong>{title}</strong>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function formatGuideStatus(status) {
  switch (status) {
    case "verified":
      return "Verified family guide";
    case "ai-assisted":
      return "AI-assisted guide";
    case "draft":
      return "Draft guide";
    default:
      return "Pizza Scale guide";
  }
}

function formatConcernLevel(value) {
  if (!Number.isFinite(value)) return "Not noted";
  if (value <= 0) return "None noted";
  if (value === 1) return "Very mild";
  if (value === 2) return "Mild";
  if (value === 3) return "Moderate";
  return "High";
}

function getRatingUnavailableReason({ user, familyProfile, familyMovieReview, canRateForFamily }) {
  if (familyMovieReview) {
    return "Your family has already rated this movie. Each family can submit one Pizza Scale rating per movie.";
  }

  if (!user) {
    return "Sign in and join or create a family group before rating movies.";
  }

  if (!familyProfile) {
    return "Create or join a family group before rating movies.";
  }

  if (!canRateForFamily) {
    return "Only a parent/adult with rating permission can save family ratings.";
  }

  return "";
}

function MovieCategoryRow({ category, selectedMovie, onSelectMovie }) {
  return (
    <section className="movie-category-row" aria-labelledby={`${category.id}-title`}>
      <div className="category-heading">
        <div>
          <div className="section-heading">
            <Film size={20} />
            <h2 id={`${category.id}-title`}>{category.title}</h2>
          </div>
          <p>{category.description}</p>
        </div>
        {category.actionLabel && category.onAction && (
          <button className="category-action-button" type="button" onClick={category.onAction}>
            {category.actionLabel}
          </button>
        )}
      </div>
      <div className="movie-rail" tabIndex={0} aria-label={`${category.title} movies`}>
        {category.movies.map((movie) => (
          <button
            className={`rail-movie-card ${selectedMovie.id === movie.id ? "active" : ""}`}
            key={movie.id}
            type="button"
            onClick={() => onSelectMovie(movie)}
          >
            <PosterTile movie={movie} />
            <span>
              <strong>{movie.title}</strong>
              <small>
                {movie.year} · {movie.rated || "NR"}
              </small>
              <small>
                {category.showFamilyFit && Number.isFinite(movie.familyFitScore)
                  ? `${Number(movie.familyFitScore).toFixed(1)} / 8 Family Fit`
                  : movie.reviewCount > 0
                    ? `${Number(movie.pizzaScore).toFixed(1)} / 8 slices`
                    : "No ratings yet"}
              </small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SignInPage({
  initialMode,
  authMessage,
  onEmailAuth,
  onGoogleSignIn,
  onPasswordReset,
  onBack,
}) {
  const [mode, setMode] = useState(initialMode);
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileImageName, setProfileImageName] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [pendingProfileImage, setPendingProfileImage] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetStatus, setResetStatus] = useState("idle");
  const isCreateMode = mode === "create";

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  async function handleProfileImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileImageError("Please choose an image file.");
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_SOURCE_BYTES) {
      setProfileImageError("Please choose an image smaller than 15 MB.");
      return;
    }

    try {
      const source = await readProfilePhotoFile(file);
      setPendingProfileImage({ source, fileName: file.name });
      setProfileImageError("");
    } catch (error) {
      setProfileImageError(error.message || "The image could not be opened.");
    }
  }

  async function sendResetEmail() {
    setResetMessage("");
    setResetStatus("sending");

    try {
      await onPasswordReset(email);
      setResetStatus("ready");
      setResetMessage("Password reset email sent. Check your inbox.");
    } catch (error) {
      setResetStatus("error");
      setResetMessage(error.message || "Password reset email could not be sent.");
    }
  }

  return (
    <section className="account-page sign-in-page">
      <button className="auth-back-button" type="button" onClick={onBack}>
        <ChevronLeft size={20} />
        Back
      </button>
      <div className="account-card sign-in-card">
        <p className="eyebrow">Account</p>
        <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
        <div className="segmented-control">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            className={mode === "create" ? "active" : ""}
            type="button"
            onClick={() => setMode("create")}
          >
            Create
          </button>
        </div>
        {authMessage && <p className="form-error">{authMessage}</p>}
        {isCreateMode && (
          <div className="profile-setup-row">
            <ProfileAvatar name={displayName || email} photoURL={profileImage} />
            <div>
              <strong>Profile picture</strong>
              <p>
                {profileImageName ||
                  "Choose a preview photo, or keep the default initial avatar."}
              </p>
              <label className="choose-photo-button">
                Choose photo
                <input type="file" accept="image/*" onChange={handleProfileImageChange} />
              </label>
              {profileImageError && <small className="inline-error">{profileImageError}</small>}
            </div>
          </div>
        )}
        {isCreateMode && (
          <label className="field-label">
            Your first name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Aidan"
            />
          </label>
        )}
        {isCreateMode && (
          <div className="family-grid">
            <label className="field-label">
              Birthday
              <input
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                type="date"
              />
            </label>
            <label className="field-label">
              Gender
              <select value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="">Choose one</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="nonbinary">Nonbinary</option>
                <option value="self-described">Self-described</option>
                <option value="prefer-not">Prefer not to say</option>
              </select>
            </label>
          </div>
        )}
        <label className="field-label">
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
        <label className="field-label">
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
          />
        </label>
        {!isCreateMode && (
          <>
            <button className="text-button" type="button" onClick={sendResetEmail}>
              Forgot password?
            </button>
            {resetMessage && <p className={`form-status ${resetStatus}`}>{resetMessage}</p>}
          </>
        )}
        <button
          className="primary-button"
          type="button"
          onClick={() =>
            onEmailAuth({
              mode: isCreateMode ? "create" : "login",
              email,
              password,
              displayName,
              birthDate,
              gender,
              photoURL: profileImage,
            })
          }
        >
          {isCreateMode ? "Create account" : "Log in"}
        </button>
        <button className="secondary-button" type="button" onClick={onGoogleSignIn}>
          Continue with Google
        </button>
      </div>
      {pendingProfileImage && (
        <ProfilePhotoCropper
          source={pendingProfileImage.source}
          fileName={pendingProfileImage.fileName}
          onCancel={() => setPendingProfileImage(null)}
          onApply={({ dataUrl, fileName }) => {
            setProfileImage(dataUrl);
            setProfileImageName(fileName);
            setPendingProfileImage(null);
          }}
        />
      )}
    </section>
  );
}

function FamilyPromptPage({ onSkip, onCreateFamily }) {
  return (
    <section className="account-page">
      <div className="account-card">
        <p className="eyebrow">Family setup</p>
        <h2>Create a family?</h2>
        <p>
          A family group lets The Pizza Scale learn who is watching together and later tune
          reviews, recommendations, and permissions to your household.
        </p>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onSkip}>
            Not now
          </button>
          <button className="primary-button" type="button" onClick={onCreateFamily}>
            Create family
          </button>
        </div>
      </div>
    </section>
  );
}

function FamilySetupPage({ user, userProfile, onSaved, onBack }) {
  const [familyName, setFamilyName] = useState("");
  const [members, setMembers] = useState([{ ...blankMember }]);
  const [setupStep, setSetupStep] = useState(0);
  const [preferenceAnswers, setPreferenceAnswers] = useState({});
  const [saveMessage, setSaveMessage] = useState("");
  const [createStatus, setCreateStatus] = useState("idle");
  const leadFirstName = userProfile?.firstName || user?.displayName || "";
  const leadBirthDate = userProfile?.birthDate || "";
  const leadGender = userProfile?.gender || "";
  const preferenceSteps = [
    {
      key: "scareTolerance",
      title: "Scary moments",
      description: "How sensitive is your family to suspense, peril, or frightening scenes?",
      options: toleranceOptions,
    },
    {
      key: "violenceTolerance",
      title: "Violence",
      description: "How much action violence or fighting is usually okay for movie night?",
      options: toleranceOptions,
    },
    {
      key: "languageTolerance",
      title: "Language",
      description: "How flexible should recommendations be around swearing or rude language?",
      options: toleranceOptions,
    },
    {
      key: "romanceNudityTolerance",
      title: "Romance/nudity",
      description: "How cautious should The Pizza Scale be with romance, suggestive content, or nudity?",
      options: toleranceOptions,
    },
    {
      key: "preferredEnergy",
      title: "Movie energy",
      description: "What kind of pacing usually works best for your household?",
      options: [
        { value: "gentle", label: "Gentle and calm" },
        { value: "balanced", label: "Balanced" },
        { value: "high-energy", label: "High energy" },
      ],
    },
    {
      key: "preferredRuntime",
      title: "Runtime",
      description: "How long do movies usually need to be to work well for your family?",
      options: [
        { value: "short", label: "Usually under 95 minutes" },
        { value: "flexible", label: "Flexible" },
        { value: "long", label: "Long movies are okay" },
      ],
    },
    {
      key: "wantsParentAppeal",
      title: "Adult appeal",
      description: "Should recommendations prioritize movies adults can enjoy too?",
      options: [
        { value: "true", label: "Yes, prioritize parent appeal" },
        { value: "false", label: "No, kid appeal can lead" },
      ],
    },
  ];
  const totalSetupSteps = preferenceSteps.length + 2;
  const currentPreferenceStep = preferenceSteps[setupStep - 1];
  const isMemberStep = setupStep === 0;
  const isReviewStep = setupStep === totalSetupSteps - 1;

  function updateMember(index, key, value) {
    setMembers((currentMembers) =>
      currentMembers.map((member, memberIndex) =>
        memberIndex === index
          ? {
              ...member,
              [key]: value,
              ...(key === "role"
                ? { permission: normalizeMemberPermission(value, member.permission) }
                : {}),
            }
          : member,
      ),
    );
  }

  function updatePreferenceAnswer(key, value) {
    setPreferenceAnswers((answers) => ({
      ...answers,
      [key]: key === "wantsParentAppeal" ? value === "true" : value,
    }));
  }

  function getPreferencePayload() {
    if (!familyPreferenceKeys.every((key) => Object.prototype.hasOwnProperty.call(preferenceAnswers, key))) {
      return null;
    }

    return {
      ...preferenceAnswers,
      wantsParentAppeal: Boolean(preferenceAnswers.wantsParentAppeal),
    };
  }

  function goToNextStep() {
    setSaveMessage("");

    if (isMemberStep && !familyName.trim()) {
      setSaveMessage("Family display name is required.");
      return;
    }

    if (currentPreferenceStep && !Object.prototype.hasOwnProperty.call(preferenceAnswers, currentPreferenceStep.key)) {
      setSaveMessage("Choose an answer or use Fill out later.");
      return;
    }

    setSetupStep((step) => Math.min(step + 1, totalSetupSteps - 1));
  }

  function goToPreviousStep() {
    setSaveMessage("");
    setSetupStep((step) => Math.max(step - 1, 0));
  }

  async function saveFamily({ skipPreferences = false } = {}) {
    if (createStatus === "saving") return;

    setSaveMessage("");

    if (!user) {
      setSaveMessage("Please sign in before creating a family.");
      return;
    }

    if (!familyName.trim()) {
      setSaveMessage("Family display name is required.");
      return;
    }

    if (!leadFirstName.trim() || !leadBirthDate || !leadGender) {
      setSaveMessage(
        "Add your first name, birthday, and gender in Account settings before creating a family.",
      );
      return;
    }

    try {
      setCreateStatus("saving");
      const createFamily = httpsCallable(functions, "createFamily");
      const result = await createFamily({
        familyName: familyName.trim(),
        leadName: leadFirstName.trim(),
        leadBirthDate,
        leadGender,
        members,
        ...(skipPreferences ? {} : { preferences: getPreferencePayload() }),
      });

      onSaved(result.data);
    } catch (error) {
      setSaveMessage(error.message || "The family could not be created yet. Please try again.");
      setCreateStatus("idle");
    }
  }

  return (
    <section className="family-page">
      <div className="family-card">
        <div className="onboarding-topline">
          <div>
            <p className="eyebrow">Family setup</p>
            <h2>
              {isMemberStep
                ? "Add your family"
                : isReviewStep
                  ? "Ready to create your family"
                  : currentPreferenceStep.title}
            </h2>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => saveFamily({ skipPreferences: true })}
            disabled={createStatus === "saving"}
          >
            Fill out later
          </button>
        </div>
        <div className="onboarding-progress" aria-label="Family setup progress">
          <span style={{ width: `${((setupStep + 1) / totalSetupSteps) * 100}%` }} />
        </div>
        {saveMessage && <p className="form-error">{saveMessage}</p>}

        {isMemberStep && (
          <>
            <div className="settings-panel family-guidance-panel">
              <strong>Two ways to add people</strong>
              <p>
                Add every person who affects movie night here, including kids who will not have
                accounts. After the family is created, you can share the family code or invite link
                with anyone who should sign in. If their account first name matches a profile you
                created, they can link to that profile and keep the birthday, gender, role, and
                permissions you already set.
              </p>
            </div>
            <div className="family-grid">
              <label className="field-label">
                Family display name
                <input
                  value={familyName}
                  onChange={(event) => setFamilyName(event.target.value)}
                  placeholder="The Ingram Family"
                />
              </label>
            </div>

            <div className="section-heading family-members-heading">
              <Users size={20} />
              <h2>Family members</h2>
            </div>

            <div className="family-member-list">
              {members.map((member, index) => (
                <div className="family-member-row" key={index}>
                  <label className="field-label">
                    First name
                    <input
                      value={member.name}
                      onChange={(event) => updateMember(index, "name", event.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    Birthday
                    <input
                      value={member.birthDate}
                      onChange={(event) => updateMember(index, "birthDate", event.target.value)}
                      type="date"
                    />
                  </label>
                  <label className="field-label">
                    Gender
                    <select
                      value={member.gender}
                      onChange={(event) => updateMember(index, "gender", event.target.value)}
                    >
                      <option value="">Prefer not to say</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="nonbinary">Nonbinary</option>
                      <option value="self-described">Self-described</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Role
                    <select
                      value={member.role}
                      onChange={(event) => updateMember(index, "role", event.target.value)}
                    >
                      <option value="child">Child</option>
                      <option value="teen">Teen</option>
                      <option value="adult">Parent/adult</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Permission
                    <select
                      value={member.permission}
                      onChange={(event) => updateMember(index, "permission", event.target.value)}
                    >
                      <option value="guided">Guided browsing</option>
                      <option value="suggest">Can suggest movies</option>
                      {member.role === "adult" && <option value="rate">Can add ratings</option>}
                      <option value="manage">Can help manage family</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>

            <button
              className="secondary-button add-member-button"
              type="button"
              onClick={() => setMembers([...members, { ...blankMember }])}
            >
              <Plus size={18} />
              Add family member
            </button>
          </>
        )}

        {currentPreferenceStep && (
          <div className="onboarding-question-card">
            <p>{currentPreferenceStep.description}</p>
            <label className="field-label">
              Choose one
              <select
                value={
                  currentPreferenceStep.key === "wantsParentAppeal"
                    ? String(preferenceAnswers[currentPreferenceStep.key] ?? "")
                    : preferenceAnswers[currentPreferenceStep.key] || ""
                }
                onChange={(event) =>
                  updatePreferenceAnswer(currentPreferenceStep.key, event.target.value)
                }
              >
                <option value="">Choose one</option>
                {currentPreferenceStep.options.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {isReviewStep && (
          <div className="settings-panel onboarding-review-panel">
            <strong>Family setup summary</strong>
            <p>
              Your family members and preference answers are ready. You can update all of this
              later from Family settings.
            </p>
            <div className="onboarding-summary-list">
              <span>{familyName || "Family name not set"}</span>
              <span>{members.filter((member) => member.name.trim()).length + 1} people included</span>
              <span>Preferences completed</span>
            </div>
          </div>
        )}

        <div className="button-row">
          <button
            className="secondary-button"
            type="button"
            onClick={setupStep === 0 ? onBack : goToPreviousStep}
          >
            {setupStep === 0 ? "Back" : "Previous"}
          </button>
          {isReviewStep ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => saveFamily()}
              disabled={createStatus === "saving"}
            >
              {createStatus === "saving" ? "Creating..." : "Create family"}
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={goToNextStep}>
              Next
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsPage({
  user,
  userProfile,
  profilePhoto,
  familyProfile,
  initialSection = "account",
  initialJoinCode = "",
  onUpdateAccount,
  onUpdateFamily,
  onDeleteFamily,
  onCreateInviteCode,
  onJoinFamily,
  onSignOut,
  onBack,
  onCreateFamily,
}) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [accountDisplayName, setAccountDisplayName] = useState(
    userProfile?.firstName || user?.displayName || "",
  );
  const [accountBirthDate, setAccountBirthDate] = useState(userProfile?.birthDate || "");
  const [accountGender, setAccountGender] = useState(userProfile?.gender || "");
  const [accountPhoto, setAccountPhoto] = useState("");
  const [accountPhotoName, setAccountPhotoName] = useState("");
  const [accountPhotoError, setAccountPhotoError] = useState("");
  const [pendingAccountPhoto, setPendingAccountPhoto] = useState(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountSaveStatus, setAccountSaveStatus] = useState("idle");
  const [familyName, setFamilyName] = useState(familyProfile?.displayName || "");
  const [editableMembers, setEditableMembers] = useState(familyProfile?.members || []);
  const [familyPreferences, setFamilyPreferences] = useState({
    ...defaultFamilyPreferences,
    ...(familyProfile?.preferences || {}),
  });
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsSaveStatus, setSettingsSaveStatus] = useState("idle");
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);
  const [deleteStatus, setDeleteStatus] = useState("idle");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState(user?.displayName || "");
  const [joinMessage, setJoinMessage] = useState("");
  const [joinStatus, setJoinStatus] = useState("idle");
  const [pendingMemberMatch, setPendingMemberMatch] = useState(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteStatus, setInviteStatus] = useState("idle");
  const [inviteCopyStatus, setInviteCopyStatus] = useState("idle");
  const currentMember = familyProfile?.members?.find(
    (member) =>
      member.userId === user?.uid ||
      (member.isLeadAdult && familyProfile.leadAdultUserId === user?.uid),
  );
  const currentPermission = currentMember?.permission || (familyProfile ? "member" : "");
  const canManageFamily =
    Boolean(familyProfile) &&
    (familyProfile.leadAdultUserId === user?.uid ||
      ["lead", "colead", "co-lead", "manage"].includes(currentPermission));
  const familyFieldsDisabled = Boolean(familyProfile) && !canManageFamily;
  const canDeleteFamily = canDeleteFamilyProfile(familyProfile, user);
  const savedAccountDisplayName = userProfile?.firstName || user?.displayName || "";
  const savedAccountBirthDate = userProfile?.birthDate || "";
  const savedAccountGender = userProfile?.gender || "";
  const accountHasChanges =
    accountDisplayName.trim() !== savedAccountDisplayName.trim() ||
    accountBirthDate !== savedAccountBirthDate ||
    accountGender !== savedAccountGender ||
    Boolean(accountPhoto);

  useEffect(() => {
    setAccountDisplayName(userProfile?.firstName || user?.displayName || "");
    setAccountBirthDate(userProfile?.birthDate || "");
    setAccountGender(userProfile?.gender || "");
    setAccountPhoto("");
    setAccountPhotoName("");
    setAccountPhotoError("");
    setPendingAccountPhoto(null);
    setAccountMessage("");
    setAccountSaveStatus("idle");
    setJoinDisplayName(user?.displayName || "");
  }, [user, userProfile]);

  useEffect(() => {
    setFamilyName(familyProfile?.displayName || "");
    setEditableMembers(familyProfile?.members || []);
    setFamilyPreferences({
      ...defaultFamilyPreferences,
      ...(familyProfile?.preferences || {}),
    });
    setSettingsMessage("");
    setSettingsSaveStatus("idle");
    setDeleteConfirmStep(0);
    setDeleteStatus("idle");
    setDeleteMessage("");
    setInviteMessage("");
    setInviteStatus("idle");
    setInviteCopyStatus("idle");
  }, [familyProfile]);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (initialJoinCode) {
      setInviteCodeInput(initialJoinCode);
    }
  }, [initialJoinCode]);

  function updateEditableMember(index, key, value) {
    setEditableMembers((members) =>
      members.map((member, memberIndex) =>
        memberIndex === index
          ? {
              ...member,
              [key]: value,
              ...(key === "role"
                ? { permission: normalizeMemberPermission(value, member.permission) }
                : {}),
            }
          : member,
      ),
    );
  }

  function addEditableMember() {
    setEditableMembers((members) => [
      ...members,
      {
        firstNameOrNickname: "",
        role: "child",
        birthDate: "",
        gender: "",
        permission: "guided",
        isLeadAdult: false,
      },
    ]);
  }

  function updateFamilyPreference(key, value) {
    setFamilyPreferences((preferences) => ({
      ...preferences,
      [key]: value,
    }));
  }

  async function handleAccountPhotoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAccountPhotoError("Please choose an image file.");
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_SOURCE_BYTES) {
      setAccountPhotoError("Please choose an image smaller than 15 MB.");
      return;
    }

    try {
      const source = await readProfilePhotoFile(file);
      setPendingAccountPhoto({ source, fileName: file.name });
      setAccountPhotoError("");
    } catch (error) {
      setAccountPhotoError(error.message || "The image could not be opened.");
    }
  }

  async function saveAccountSettings() {
    setAccountMessage("");
    setAccountSaveStatus("saving");

    try {
      await onUpdateAccount({
        displayName: accountDisplayName,
        birthDate: accountBirthDate,
        gender: accountGender,
        photoURL: accountPhoto,
      });
      setAccountSaveStatus("ready");
      setAccountMessage("Account settings saved.");
      setAccountPhoto("");
      setAccountPhotoName("");
    } catch (error) {
      setAccountSaveStatus("error");
      setAccountMessage(error.message || "Account settings could not be saved.");
    }
  }

  async function saveFamilySettings() {
    setSettingsMessage("");
    setSettingsSaveStatus("saving");

    try {
      await onUpdateFamily({
        ...familyProfile,
        displayName: familyName.trim(),
        members: editableMembers,
        preferences: familyPreferences,
      });
      setSettingsSaveStatus("ready");
      setSettingsMessage("Family settings saved.");
    } catch (error) {
      setSettingsSaveStatus("error");
      setSettingsMessage(error.message || "Family settings could not be saved.");
    }
  }

  async function joinFamily(joinOptions = {}) {
    setJoinMessage("");
    setJoinStatus("joining");

    if (!user) {
      setJoinStatus("error");
      setJoinMessage("Sign in before joining a family.");
      return;
    }

    if (!normalizeInviteCode(inviteCodeInput)) {
      setJoinStatus("error");
      setJoinMessage("Enter the invite code from your family leader.");
      return;
    }

    if (!joinDisplayName.trim()) {
      setJoinStatus("error");
      setJoinMessage("Enter your first name before joining a family.");
      return;
    }

    try {
      const family = await onJoinFamily({
        inviteCode: inviteCodeInput,
        displayName: joinDisplayName.trim(),
        ...joinOptions,
      });

      if (family.requiresMemberConfirmation) {
        setPendingMemberMatch(family);
        setJoinStatus("idle");
        setJoinMessage("");
        return;
      }

      setJoinStatus("ready");
      setJoinMessage(`Joined ${family.displayName}.`);
      setPendingMemberMatch(null);
      setInviteCodeInput("");
    } catch (error) {
      setJoinStatus("error");
      setJoinMessage(error.message || "That invite code could not be used yet.");
    }
  }

  function startFamilyCreation() {
    if (!user) {
      setSettingsSaveStatus("error");
      setSettingsMessage("Sign in before creating a family.");
      return;
    }

    onCreateFamily();
  }

  async function createNewInviteCode() {
    setInviteMessage("");
    setInviteStatus("saving");
    setInviteCopyStatus("idle");

    if (familyProfile?.familyCode || familyProfile?.inviteCode) {
      setInviteStatus("ready");
      setInviteMessage("This family code is permanent.");
      return;
    }

    try {
      const inviteCode = await onCreateInviteCode();
      setInviteStatus("ready");
      setInviteMessage(`Family code ready: ${inviteCode}`);
    } catch (error) {
      setInviteStatus("error");
      setInviteMessage(error.message || "Invite code could not be created.");
    }
  }

  async function copyInviteLink() {
    const inviteCode = familyProfile?.familyCode || familyProfile?.inviteCode || "";
    const inviteLink = buildFamilyInviteLink(
      inviteCode,
      userProfile?.firstName || user?.displayName || "",
    );

    if (!inviteLink) return;

    try {
      await copyTextToClipboard(inviteLink);
      setInviteCopyStatus("copied");
      setInviteMessage("Invite link copied.");
      setInviteStatus("ready");
      window.setTimeout(() => setInviteCopyStatus("idle"), 1800);
    } catch {
      setInviteCopyStatus("idle");
      setInviteMessage("The invite link could not be copied automatically.");
      setInviteStatus("error");
    }
  }

  async function deleteFamilyPermanently() {
    setDeleteMessage("");
    setDeleteStatus("deleting");

    try {
      await onDeleteFamily();
      setDeleteStatus("ready");
      setDeleteConfirmStep(0);
      setDeleteMessage("Family deleted.");
    } catch (error) {
      setDeleteStatus("error");
      setDeleteMessage(error.message || "Family could not be deleted.");
    }
  }

  return (
    <section className="settings-page">
      <div className="settings-layout">
        <aside className="settings-sidebar" aria-label="Settings sections">
          <p className="eyebrow">Settings</p>
          <button
            className={activeSection === "account" ? "active" : ""}
            type="button"
            onClick={() => setActiveSection("account")}
          >
            Account
          </button>
          <button
            className={activeSection === "family" ? "active" : ""}
            type="button"
            onClick={() => setActiveSection("family")}
          >
            Family
          </button>
          <button className="settings-back-button" type="button" onClick={onBack}>
            Back to site
          </button>
        </aside>

        <div className="settings-content">
          {activeSection === "account" && (
            <section className="settings-card">
              <p className="eyebrow">Account</p>
              <h2>Your account</h2>
              <div className="settings-profile-row">
                <ProfileAvatar user={user} photoURL={accountPhoto || profilePhoto} />
                <div>
                  <strong>{user?.displayName || "Pizza Scale member"}</strong>
                  <p>{user?.email || "You are not signed in."}</p>
                </div>
              </div>
              <label className="field-label">
                First name
                <input
                  value={accountDisplayName}
                  onChange={(event) => setAccountDisplayName(event.target.value)}
                  disabled={!user || accountSaveStatus === "saving"}
                />
              </label>
              <div className="family-grid">
                <label className="field-label">
                  Birthday
                  <input
                    value={accountBirthDate}
                    onChange={(event) => setAccountBirthDate(event.target.value)}
                    disabled={!user || accountSaveStatus === "saving"}
                    type="date"
                  />
                </label>
                <label className="field-label">
                  Gender
                  <select
                    value={accountGender}
                    onChange={(event) => setAccountGender(event.target.value)}
                    disabled={!user || accountSaveStatus === "saving"}
                  >
                    <option value="">Choose one</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="nonbinary">Nonbinary</option>
                    <option value="self-described">Self-described</option>
                    <option value="prefer-not">Prefer not to say</option>
                  </select>
                </label>
              </div>
              <div className="settings-panel account-photo-panel">
                <ProfileAvatar user={user} photoURL={accountPhoto || profilePhoto} />
                <div>
                  <strong>Profile picture</strong>
                  <p>{accountPhotoName || "Choose a new profile photo from your device."}</p>
                  <label className="choose-photo-button">
                    Choose photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAccountPhotoChange}
                      disabled={!user || accountSaveStatus === "saving"}
                    />
                  </label>
                  {accountPhotoError && <small className="inline-error">{accountPhotoError}</small>}
                </div>
              </div>
              {accountMessage && (
                <p className={`form-status ${accountSaveStatus}`}>{accountMessage}</p>
              )}
              {user && (
                <button
                  className="primary-button account-save-button"
                  type="button"
                  onClick={saveAccountSettings}
                  disabled={
                    accountSaveStatus === "saving" ||
                    !accountHasChanges ||
                    !accountDisplayName.trim() ||
                    !accountBirthDate ||
                    !accountGender
                  }
                >
                  Save account settings
                </button>
              )}
              {user && (
                <button className="settings-sign-out-button" type="button" onClick={onSignOut}>
                  Sign out
                </button>
              )}
            </section>
          )}

          {activeSection === "family" && (
            <section className={`settings-card ${familyFieldsDisabled ? "disabled" : ""}`}>
              <p className="eyebrow">Family</p>
              <h2>Family settings</h2>
              {!familyProfile ? (
                <div className="settings-panel">
                  <strong>No family connected yet</strong>
                  <p>
                    Create a family if you are organizing the household. Join with a family code
                    if someone already created the group and invited you.
                  </p>
                  <label className="field-label">
                    Your first name
                    <input
                      value={joinDisplayName}
                      onChange={(event) => setJoinDisplayName(event.target.value)}
                      placeholder="First name inside the family"
                      disabled={joinStatus === "joining"}
                    />
                  </label>
                  <label className="field-label">
                    Family code
                    <input
                      value={inviteCodeInput}
                      onChange={(event) =>
                        setInviteCodeInput(normalizeInviteCode(event.target.value))
                      }
                      placeholder="ABCD2345"
                      disabled={joinStatus === "joining"}
                    />
                  </label>
                  {pendingMemberMatch && (
                    <div className="member-match-panel">
                      <strong>Is this you?</strong>
                      <p>
                        This family already has a profile with your first name. Linking keeps the
                        birthday, gender, role, and permissions that were already set for that
                        person.
                      </p>
                      {pendingMemberMatch.matchedMembers.map((member) => (
                        <div className="member-match-row" key={member.id}>
                          <span>
                            {member.firstNameOrNickname} · {member.role || "member"}
                            {member.birthDate
                              ? ` · age ${getAgeFromBirthDate(member.birthDate)}`
                              : member.age
                                ? ` · age ${member.age}`
                                : ""}
                          </span>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => joinFamily({ claimMemberId: member.id })}
                          >
                            Yes, link me
                          </button>
                        </div>
                      ))}
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => joinFamily({ createNewProfile: true })}
                      >
                        No, create a new profile
                      </button>
                    </div>
                  )}
                  <div className="family-join-action">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={joinFamily}
                      disabled={joinStatus === "joining"}
                    >
                      Join family
                    </button>
                  </div>
                  <div className="choice-divider" aria-hidden="true">
                    <span>OR</span>
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={startFamilyCreation}
                  >
                    Create family
                  </button>
                  {joinMessage && (
                    <p className={`form-status ${joinStatus}`}>{joinMessage}</p>
                  )}
                </div>
              ) : (
                <>
                  {familyFieldsDisabled && (
                    <div className="permission-notice">
                      <strong>View only</strong>
                      <p>
                        You are a member of this family, but only a family leader or co-leader can
                        change family settings.
                      </p>
                    </div>
                  )}
                  <label className="field-label">
                    Family display name
                    <input
                      value={familyName}
                      onChange={(event) => setFamilyName(event.target.value)}
                      disabled={familyFieldsDisabled}
                    />
                  </label>
                  {canManageFamily && (
                    <div className="settings-panel invite-code-panel">
                      <strong>Family code and invite link</strong>
                      <p>
                        Share the code or link with someone who should sign in. If their first name
                        matches a profile you already created, they can link their account to that
                        profile.
                      </p>
                      <div className="invite-code-row">
                        <code>{familyProfile.familyCode || familyProfile.inviteCode || "No code yet"}</code>
                        {!(familyProfile.familyCode || familyProfile.inviteCode) && (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={createNewInviteCode}
                            disabled={inviteStatus === "saving"}
                          >
                            Create code
                          </button>
                        )}
                      </div>
                      {(familyProfile.familyCode || familyProfile.inviteCode) && (
                        <label className="field-label">
                          Invite link
                          <div className="invite-link-row">
                            <input
                              value={buildFamilyInviteLink(
                                familyProfile.familyCode || familyProfile.inviteCode,
                                userProfile?.firstName || user?.displayName || "",
                              )}
                              readOnly
                            />
                            <button
                              className="secondary-button copy-link-button"
                              type="button"
                              onClick={copyInviteLink}
                            >
                              {inviteCopyStatus === "copied" ? (
                                <Check size={18} />
                              ) : (
                                <Copy size={18} />
                              )}
                              {inviteCopyStatus === "copied" ? "Copied" : "Copy link"}
                            </button>
                          </div>
                        </label>
                      )}
                      {inviteMessage && (
                        <p className={`form-status ${inviteStatus}`}>{inviteMessage}</p>
                      )}
                    </div>
                  )}
                  <div className="settings-panel">
                    <strong>Members</strong>
                    <p>
                      Add adults, teens, or kids here even when they do not need their own sign-in.
                      These profiles help family ratings and future recommendations understand who
                      is watching. If someone later joins with the family code and their first name
                      matches one of these profiles, they can link their account to it.
                    </p>
                    <div className="settings-member-list">
                      {editableMembers.map((member, index) => (
                        <div
                          className="settings-member-row"
                          key={`${member.firstNameOrNickname}-${index}`}
                        >
                          <label>
                            First name
                            <input
                              value={member.firstNameOrNickname || ""}
                              onChange={(event) =>
                                updateEditableMember(
                                  index,
                                  "firstNameOrNickname",
                                  event.target.value,
                                )
                              }
                              disabled={familyFieldsDisabled || member.isLeadAdult}
                              placeholder="First name or nickname"
                            />
                            <small>{member.userId ? "Linked account" : "Profile only"}</small>
                          </label>
                          <div className="settings-member-controls">
                            <label>
                              Birthday
                              <input
                                value={member.birthDate || ""}
                                onChange={(event) =>
                                  updateEditableMember(index, "birthDate", event.target.value)
                                }
                                disabled={familyFieldsDisabled}
                                type="date"
                              />
                            </label>
                            <label>
                              Gender
                              <select
                                value={member.gender || ""}
                                onChange={(event) =>
                                  updateEditableMember(index, "gender", event.target.value)
                                }
                                disabled={familyFieldsDisabled}
                              >
                                <option value="">Prefer not to say</option>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                                <option value="nonbinary">Nonbinary</option>
                                <option value="self-described">Self-described</option>
                              </select>
                            </label>
                            {member.isLeadAdult ? (
                              <small>Family leader</small>
                            ) : (
                              <>
                                <label>
                                  Role
                                  <select
                                    value={member.role || "child"}
                                    onChange={(event) =>
                                      updateEditableMember(index, "role", event.target.value)
                                    }
                                    disabled={familyFieldsDisabled}
                                  >
                                    <option value="child">Child</option>
                                    <option value="teen">Teen</option>
                                    <option value="adult">Parent/adult</option>
                                  </select>
                                </label>
                                <label>
                                  Permission
                                  <select
                                    value={member.permission || "guided"}
                                    onChange={(event) =>
                                      updateEditableMember(index, "permission", event.target.value)
                                    }
                                    disabled={familyFieldsDisabled}
                                  >
                                    <option value="member">Family member</option>
                                    <option value="guided">Guided browsing</option>
                                    <option value="suggest">Can suggest movies</option>
                                    {member.role === "adult" && (
                                      <option value="rate">Can add ratings</option>
                                    )}
                                    <option value="manage">Can help manage family</option>
                                  </select>
                                </label>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {canManageFamily && (
                      <button
                        className="secondary-button add-member-button"
                        type="button"
                        onClick={addEditableMember}
                      >
                        <Plus size={18} />
                        Add family member
                      </button>
                    )}
                  </div>
                  <div className="settings-panel">
                    <strong>Child permissions</strong>
                    <p>
                      Permission controls will let leaders decide who can browse, suggest movies,
                      rate movies, and help manage the family.
                    </p>
                  </div>
                  <div className="settings-panel">
                    <strong>Movie preferences</strong>
                    <p>
                      These settings will help future Pizza Scale Guides explain which movies fit
                      your family and which content concerns might get in the way.
                    </p>
                    <div className="preference-grid">
                      <label className="field-label">
                        Scary moments
                        <select
                          value={familyPreferences.scareTolerance}
                          onChange={(event) =>
                            updateFamilyPreference("scareTolerance", event.target.value)
                          }
                          disabled={familyFieldsDisabled}
                        >
                          {toleranceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Violence
                        <select
                          value={familyPreferences.violenceTolerance}
                          onChange={(event) =>
                            updateFamilyPreference("violenceTolerance", event.target.value)
                          }
                          disabled={familyFieldsDisabled}
                        >
                          {toleranceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Language
                        <select
                          value={familyPreferences.languageTolerance}
                          onChange={(event) =>
                            updateFamilyPreference("languageTolerance", event.target.value)
                          }
                          disabled={familyFieldsDisabled}
                        >
                          {toleranceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Romance/nudity
                        <select
                          value={familyPreferences.romanceNudityTolerance}
                          onChange={(event) =>
                            updateFamilyPreference("romanceNudityTolerance", event.target.value)
                          }
                          disabled={familyFieldsDisabled}
                        >
                          {toleranceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Movie energy
                        <select
                          value={familyPreferences.preferredEnergy}
                          onChange={(event) =>
                            updateFamilyPreference("preferredEnergy", event.target.value)
                          }
                          disabled={familyFieldsDisabled}
                        >
                          <option value="gentle">Gentle and calm</option>
                          <option value="balanced">Balanced</option>
                          <option value="high-energy">High energy</option>
                        </select>
                      </label>
                      <label className="field-label">
                        Runtime
                        <select
                          value={familyPreferences.preferredRuntime}
                          onChange={(event) =>
                            updateFamilyPreference("preferredRuntime", event.target.value)
                          }
                          disabled={familyFieldsDisabled}
                        >
                          <option value="short">Usually under 95 minutes</option>
                          <option value="flexible">Flexible</option>
                          <option value="long">Long movies are okay</option>
                        </select>
                      </label>
                    </div>
                    <label className="checkbox-row preference-checkbox">
                      <input
                        type="checkbox"
                        checked={familyPreferences.wantsParentAppeal}
                        onChange={(event) =>
                          updateFamilyPreference("wantsParentAppeal", event.target.checked)
                        }
                        disabled={familyFieldsDisabled}
                      />
                      <span>Prioritize movies adults can enjoy too</span>
                    </label>
                  </div>
                  {canDeleteFamily && (
                    <div className="settings-panel danger-panel">
                      <strong>Delete family</strong>
                      <p>
                        Only the person who created this family can delete it. Deleting removes the
                        family group, member profiles, invite codes, private ratings, and public
                        family reviews connected to this family. This cannot be undone.
                      </p>
                      {deleteConfirmStep === 0 && (
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => {
                            setDeleteMessage("");
                            setDeleteConfirmStep(1);
                          }}
                        >
                          Delete family
                        </button>
                      )}
                      {deleteConfirmStep === 1 && (
                        <div className="delete-confirm-panel">
                          <strong>First confirmation</strong>
                          <p>
                            This will permanently erase {familyProfile.displayName} and disconnect
                            every account linked to it.
                          </p>
                          <div className="dialog-actions">
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => setDeleteConfirmStep(0)}
                              disabled={deleteStatus === "deleting"}
                            >
                              Cancel
                            </button>
                            <button
                              className="danger-button"
                              type="button"
                              onClick={() => setDeleteConfirmStep(2)}
                              disabled={deleteStatus === "deleting"}
                            >
                              I understand
                            </button>
                          </div>
                        </div>
                      )}
                      {deleteConfirmStep === 2 && (
                        <div className="delete-confirm-panel">
                          <strong>Final confirmation</strong>
                          <p>
                            Last chance: deleting this family removes the family ratings that help
                            Pizza Scale understand your household. The site cannot restore it
                            afterward.
                          </p>
                          <div className="dialog-actions">
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => setDeleteConfirmStep(0)}
                              disabled={deleteStatus === "deleting"}
                            >
                              Keep family
                            </button>
                            <button
                              className="danger-button"
                              type="button"
                              onClick={deleteFamilyPermanently}
                              disabled={deleteStatus === "deleting"}
                            >
                              {deleteStatus === "deleting" ? "Deleting..." : "Permanently delete"}
                            </button>
                          </div>
                        </div>
                      )}
                      {deleteMessage && (
                        <p className={`form-status ${deleteStatus}`}>{deleteMessage}</p>
                      )}
                    </div>
                  )}
                  {settingsMessage && (
                    <p className={`form-status ${settingsSaveStatus}`}>{settingsMessage}</p>
                  )}
                  {canManageFamily && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={saveFamilySettings}
                      disabled={settingsSaveStatus === "saving" || !familyName.trim()}
                    >
                      Save family settings
                    </button>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </div>
      {pendingAccountPhoto && (
        <ProfilePhotoCropper
          source={pendingAccountPhoto.source}
          fileName={pendingAccountPhoto.fileName}
          onCancel={() => setPendingAccountPhoto(null)}
          onApply={({ dataUrl, fileName }) => {
            setAccountPhoto(dataUrl);
            setAccountPhotoName(fileName);
            setPendingAccountPhoto(null);
          }}
        />
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function normalizeOmdbMovie(movie, index) {
  return {
    id: movie.imdbId || `${movie.title}-${movie.year}`,
    imdbId: movie.imdbId,
    title: movie.title,
    year: movie.year,
    rated: cleanOmdbValue(movie.rated) || "NR",
    runtime: cleanOmdbValue(movie.runtime) || "Runtime TBD",
    genre: cleanOmdbValue(movie.genre) || "Genre pending",
    posterUrl: cleanOmdbValue(movie.posterUrl),
    posterTheme: posterThemes[index % posterThemes.length],
    plot:
      cleanOmdbValue(movie.plot) ||
      "This movie is ready to be reviewed by families on The Pizza Scale.",
    pizzaScore: null,
    familyMatch: null,
    reviewCount: 0,
    ageFit: "Needs family ratings",
  };
}

function cleanOmdbValue(value) {
  if (!value || value === "N/A") return "";
  return value;
}

function PosterTile({ movie, compact = false }) {
  const hasPoster = Boolean(movie.posterUrl);

  return (
    <div
      className={`poster-tile ${movie.posterTheme} ${hasPoster ? "has-poster" : ""} ${
        compact ? "compact" : ""
      }`}
    >
      {hasPoster && (
        <img
          src={movie.posterUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.remove();
          }}
        />
      )}
      <span className="poster-slice" aria-hidden="true" />
      {!hasPoster && (
        <>
          <strong>{compact ? movie.title.charAt(0) : movie.title}</strong>
          {!compact && <small>{movie.year}</small>}
        </>
      )}
    </div>
  );
}

function PizzaScore({ score, compact = false }) {
  if (score == null) {
    return (
      <div className={`pizza-score empty ${compact ? "compact" : ""}`}>
        <PizzaFill value={0} />
        <strong>No rating yet</strong>
      </div>
    );
  }

  return (
    <div className={`pizza-score ${compact ? "compact" : ""}`}>
      <PizzaFill value={score} />
      <strong>{score.toFixed(1)} / 8</strong>
    </div>
  );
}

function PizzaFill({ value }) {
  const fillAngle = Math.max(0, Math.min(360, (value / 8) * 360));

  return (
    <div
      className="pizza-fill"
      aria-label={`${value.toFixed(1)} out of 8 pizza slices`}
      style={{ "--pizza-fill-angle": `${fillAngle}deg` }}
    >
      <span className="single-pizza-base" aria-hidden="true" />
      <span className="single-pizza-fill" aria-hidden="true" />
      <span className="single-pizza-lines" aria-hidden="true" />
    </div>
  );
}

function FamilyMatch({ value }) {
  if (value == null) {
    return (
      <div className="family-match empty">
        <span>--</span>
        <small>Not enough family data yet</small>
      </div>
    );
  }

  return (
    <div className="family-match">
      <span>{value}%</span>
      <small>Family Match</small>
    </div>
  );
}

function SliceInput({ label, value, onChange }) {
  return (
    <label className="slice-input">
      <span>{label}</span>
      <input
        type="range"
        min="1"
        max="8"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{value} slices</strong>
    </label>
  );
}

function VisibilityChoice({ icon, label, value, selected, onChange, description }) {
  const isSelected = selected === value;

  return (
    <label className={`visibility-choice ${isSelected ? "selected" : ""}`}>
      <input
        type="radio"
        name="visibility"
        value={value}
        checked={isSelected}
        onChange={() => onChange(value)}
      />
      {icon}
      <span>{label}</span>
      {isSelected && description && <small>{description}</small>}
    </label>
  );
}

createRoot(document.getElementById("root")).render(<App />);
