import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Film,
  Lock,
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
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import { getOmdbMovie, searchOmdbMovies } from "./movieProvider";
import pizzaWordmark from "./assets/PizzaScaleWordmark.png";
import "./styles.css";

const posterThemes = ["marmalade", "neon", "stage", "woodland"];
const PROFILE_PHOTOS_STORAGE_KEY = "pizzaScaleProfilePhotos";
const MAX_PROFILE_PHOTO_SOURCE_BYTES = 15 * 1024 * 1024;
const PROFILE_PHOTO_OUTPUT_SIZE = 512;
const PROFILE_PHOTO_OUTPUT_QUALITY = 0.82;

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
];

const blankMember = {
  name: "",
  age: "",
  gender: "",
  role: "child",
  permission: "guided",
};

function App() {
  const [page, setPage] = useState("home");
  const [movieBackPage, setMovieBackPage] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [featuredCatalog, setFeaturedCatalog] = useState(featuredMovies);
  const [movieResults, setMovieResults] = useState(featuredMovies);
  const [selectedMovie, setSelectedMovie] = useState(featuredMovies[0]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [user, setUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [profilePhotos, setProfilePhotos] = useState(() => readStoredProfilePhotos());
  const [familyProfile, setFamilyProfile] = useState(null);
  const [familyLoadStatus, setFamilyLoadStatus] = useState("idle");
  const [publicReviews, setPublicReviews] = useState([]);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewSaveStatus, setReviewSaveStatus] = useState("idle");
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
          setFamilyProfile(null);
          setFamilyLoadStatus("idle");
        }
      }),
    [],
  );

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
    let isCurrent = true;

    async function loadFeaturedPosters() {
      const hydratedMovies = await Promise.all(
        featuredMovies.map(async (movie, index) => {
          try {
            return normalizeOmdbMovie(await getOmdbMovie(movie.imdbId), index);
          } catch {
            return movie;
          }
        }),
      );
      const moviesWithStats = await hydrateMoviesWithStats(hydratedMovies);

      if (!isCurrent) return;

      setFeaturedCatalog(moviesWithStats);
      setMovieResults((currentResults) =>
        currentResults === featuredMovies ? moviesWithStats : currentResults,
      );
      setSelectedMovie((currentMovie) =>
        currentMovie.id === featuredMovies[0].id ? moviesWithStats[0] : currentMovie,
      );
    }

    loadFeaturedPosters();

    return () => {
      isCurrent = false;
    };
  }, []);

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
            collection(db, "reviews"),
            where("movieId", "==", selectedMovie.id),
            where("visibility", "==", "public"),
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

  async function handleGoogleSignIn({ promptForFamily = true } = {}) {
    setAuthMessage("");

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const isNewUser =
        result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
      setPage(promptForFamily && isNewUser ? "family-prompt" : "home");
    } catch (error) {
      setAuthMessage(
        error.code === "auth/operation-not-allowed"
          ? "Google sign-in needs to be enabled in Firebase Authentication."
          : "Google sign-in could not be completed. Please try again.",
      );
    }
  }

  async function handleEmailAuth({ mode, email, password, displayName, photoURL }) {
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
          setAuthMessage("Please add your name so your profile can be created.");
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
        setPage("family-prompt");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setPage("home");
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
    setMovieBackPage(backPage === "movie" ? "home" : backPage);
    setPage("movie");
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

    if (!canManageFamilyProfile(familyProfile, user)) {
      setReviewSaveStatus("error");
      setReviewMessage("Only a family leader or co-leader can save ratings for the family.");
      return;
    }

    const parentScore = Number(review.parentScore);
    const kidScore = Number(review.kidScore);
    const pizzaScore = (parentScore + kidScore) / 2;
    const movieId = selectedMovie.id;
    const reviewId = `${familyProfile.id}_${movieId}`;
    const reviewRef = doc(db, "reviews", reviewId);

    setReviewSaveStatus("saving");
    setReviewMessage("Saving rating...");

    try {
      const existingReviewSnapshot = await getDoc(reviewRef);
      const existingReview = existingReviewSnapshot.exists()
        ? existingReviewSnapshot.data()
        : null;

      await setDoc(
        reviewRef,
        {
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
          visibility: review.visibility,
          writtenReview: review.writtenReview.trim(),
          showAgeShape: review.showAgeShape,
          createdAt: existingReview?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (review.visibility === "public") {
        setPublicReviews((reviews) => [
          {
            id: reviewId,
            familyName: familyProfile.displayName,
            pizzaScore,
            writtenReview: review.writtenReview.trim(),
            parentScore,
            kidScore,
          },
          ...reviews.filter((publicReview) => publicReview.id !== reviewId),
        ]);
      }

      setReviewSaveStatus("ready");
      setReviewMessage("Rating saved. Pizza Score totals will update shortly.");
    } catch {
      setReviewSaveStatus("error");
      setReviewMessage("The rating could not be saved yet. Check Firebase rules and try again.");
    }
  }

  async function handleUpdateFamily(nextFamilyProfile) {
    if (!user || !canManageFamilyProfile(familyProfile, user)) {
      throw new Error("Only a family leader or co-leader can update family settings.");
    }

    await updateDoc(doc(db, "families", nextFamilyProfile.id), {
      displayName: nextFamilyProfile.displayName,
      updatedAt: serverTimestamp(),
    });

    await Promise.all(
      nextFamilyProfile.members
        .filter((member) => member.id)
        .map((member) =>
          updateDoc(doc(db, "familyMembers", member.id), {
            role: member.role || "member",
            permission: member.permission || "guided",
            updatedAt: serverTimestamp(),
          }),
        ),
    );

    setFamilyProfile(nextFamilyProfile);
  }

  async function handleUpdateAccount({ displayName, photoURL }) {
    if (!auth.currentUser) {
      throw new Error("Please sign in before updating your account.");
    }

    const cleanDisplayName = displayName.trim();

    if (!cleanDisplayName) {
      throw new Error("Display name cannot be empty.");
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
          onSettings={() => {
            setMenuOpen(false);
            setAuthMessage("");
            setPage("settings");
          }}
        />
      )}

      {authMessage && page !== "signin" && <div className="auth-banner error">{authMessage}</div>}

      {page === "home" && (
        <HomePage
          movieResults={featuredCatalog}
          selectedMovie={selectedMovie}
          onOpenMovie={(movie) => openMovieStats(movie, "home")}
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
          review={review}
          setReview={setReview}
          user={user}
          familyProfile={familyProfile}
          publicReviews={publicReviews}
          reviewMessage={reviewMessage}
          reviewSaveStatus={reviewSaveStatus}
          onSaveReview={handleSaveReview}
          onSignIn={() => openSignIn("login")}
          onBack={() => setPage(movieBackPage)}
        />
      )}

      {page === "signin" && (
        <SignInPage
          initialMode={authMode}
          authMessage={authMessage}
          onEmailAuth={handleEmailAuth}
          onGoogleSignIn={() => handleGoogleSignIn({ promptForFamily: true })}
          onBack={goHome}
        />
      )}

      {page === "family-prompt" && (
        <FamilyPromptPage
          onSkip={goHome}
          onCreateFamily={() => setPage("family-setup")}
        />
      )}

      {page === "family-setup" && (
        <FamilySetupPage
          user={user}
          onSaved={(family) => {
            setFamilyProfile(family);
            setPage("home");
          }}
          onBack={() => setPage("family-prompt")}
        />
      )}

      {page === "recommendations" && (
        <RecommendationsPage user={user} onSignIn={() => openSignIn("login")} />
      )}

      {page === "settings" && (
        <SettingsPage
          user={user}
          profilePhoto={user ? profilePhotos[user.uid] : ""}
          familyProfile={familyProfile}
          onUpdateAccount={handleUpdateAccount}
          onUpdateFamily={handleUpdateFamily}
          onSignOut={requestSignOut}
          onBack={goHome}
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
        const movieSnapshot = await getDoc(doc(db, "movies", movie.id));

        if (!movieSnapshot.exists()) return movie;

        return mergeMovieStats(movie, movieSnapshot.data());
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

function canManageFamilyProfile(familyProfile, user) {
  if (!familyProfile || !user) return false;
  if (familyProfile.leadAdultUserId === user.uid) return true;
  if (familyProfile.coLeaderUserIds?.includes(user.uid)) return true;

  const currentMember = familyProfile.members?.find((member) => member.userId === user.uid);
  return ["lead", "colead", "co-lead", "manage"].includes(currentMember?.permission);
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
        <p className="eyebrow">Profile picture</p>
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
        <p>
          We will save this as a compressed square avatar so normal phone photos work without
          slowing down the site.
        </p>
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

function RecommendationsPage({ user, onSignIn }) {
  return (
    <section className="recommendations-page">
      <div className="recommendations-card">
        <p className="eyebrow">Tailored recommendations</p>
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
        ) : (
          <div className="recommendation-empty-state">
            <strong>Not enough data yet</strong>
            <p>
              We do not have enough family ratings to make reliable tailored recommendations yet.
              Once more families rate movies, this page will surface matches based on household
              makeup and shared preferences.
            </p>
          </div>
        )}
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

        {hasResults && (
          <>
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
            <section className="search-detail-panel">
              <PosterTile movie={selectedMovie} />
              <div>
                <p className="eyebrow">
                  {selectedMovie.rated || "NR"} · {selectedMovie.runtime || "Runtime TBD"}
                </p>
                <h2>{selectedMovie.title}</h2>
                <p className="plot">{selectedMovie.plot}</p>
                <div className="score-row">
                  <PizzaScore score={selectedMovie.pizzaScore} />
                  <FamilyMatch value={selectedMovie.familyMatch} />
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </section>
  );
}

function HomePage({
  movieResults,
  selectedMovie,
  onOpenMovie,
}) {
  const movieCategories = [
    {
      id: "movies-to-try",
      title: "Movies to Try",
      description: "Starter picks while The Pizza Scale gathers real family ratings.",
      movies: movieResults,
    },
  ];

  return (
    <>
      <section className="hero-band">
        <div className="home-hero-copy">
          <h1>Find the movie your whole family can agree on.</h1>
          <div className="metric-strip" aria-label="Pizza Scale summary">
            <Metric label="Movies Rated" value="0" />
            <Metric label="Family Reviews" value="0" />
          </div>
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
  review,
  setReview,
  user,
  familyProfile,
  publicReviews,
  reviewMessage,
  reviewSaveStatus,
  onSaveReview,
  onSignIn,
  onBack,
}) {
  const overallScore = (Number(review.parentScore) + Number(review.kidScore)) / 2;

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
          </div>
        </div>

        <div className="review-grid">
          <form className="review-form">
            <div className="section-heading">
              <Star size={20} />
              <h2>Rate as Lead Adult</h2>
            </div>

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
                icon={<Lock size={18} />}
                label="Private history"
                value="private"
                selected={review.visibility}
                onChange={(visibility) => setReview({ ...review, visibility })}
              />
              <VisibilityChoice
                icon={<ShieldCheck size={18} />}
                label="Anonymous aggregate"
                value="aggregate"
                selected={review.visibility}
                onChange={(visibility) => setReview({ ...review, visibility })}
              />
              <VisibilityChoice
                icon={<Eye size={18} />}
                label="Public family review"
                value="public"
                selected={review.visibility}
                onChange={(visibility) => setReview({ ...review, visibility })}
              />
            </fieldset>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={review.showAgeShape}
                onChange={(event) => setReview({ ...review, showAgeShape: event.target.checked })}
              />
              <span>Allow public review to show broad child age range</span>
            </label>

            {reviewMessage && (
              <p className={`form-status ${reviewSaveStatus}`}>{reviewMessage}</p>
            )}
            <button
              className="primary-button"
              type="button"
              onClick={user ? onSaveReview : onSignIn}
              disabled={reviewSaveStatus === "saving"}
            >
              {!user
                ? "Sign in to Save Rating"
                : familyProfile
                  ? "Save Rating"
                  : "Create a Family to Save"}
            </button>
          </form>

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
                {movie.reviewCount > 0
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

function SignInPage({ initialMode, authMessage, onEmailAuth, onGoogleSignIn, onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [displayName, setDisplayName] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileImageName, setProfileImageName] = useState("");
  const [profileImageError, setProfileImageError] = useState("");
  const [pendingProfileImage, setPendingProfileImage] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
            Your name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Aidan"
            />
          </label>
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
        <button
          className="primary-button"
          type="button"
          onClick={() =>
            onEmailAuth({
              mode: isCreateMode ? "create" : "login",
              email,
              password,
              displayName,
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

function FamilySetupPage({ user, onSaved, onBack }) {
  const [familyName, setFamilyName] = useState("");
  const [leadName, setLeadName] = useState(user?.displayName || "");
  const [members, setMembers] = useState([{ ...blankMember }]);
  const [saveMessage, setSaveMessage] = useState("");

  function updateMember(index, key, value) {
    setMembers((currentMembers) =>
      currentMembers.map((member, memberIndex) =>
        memberIndex === index ? { ...member, [key]: value } : member,
      ),
    );
  }

  async function saveFamily() {
    if (!user) {
      setSaveMessage("Please sign in before creating a family.");
      return;
    }

    if (!familyName.trim() || !leadName.trim()) {
      setSaveMessage("Family name and your name are required.");
      return;
    }

    const familyPayload = {
      displayName: familyName.trim(),
      leadAdultUserId: user.uid,
      memberUserIds: [user.uid],
      publicAgeDisplayMode: "ranges",
      createdAt: serverTimestamp(),
    };

    try {
      const familyDoc = await addDoc(collection(db, "families"), familyPayload);
      const cleanedMembers = [
        {
          firstNameOrNickname: leadName.trim(),
          userId: user.uid,
          role: "adult",
          age: "",
          gender: "",
          permission: "lead",
          isLeadAdult: true,
        },
        ...members
          .filter((member) => member.name.trim())
          .map((member) => ({
            firstNameOrNickname: member.name.trim(),
            role: member.role,
            age: member.age,
            gender: member.gender,
            permission: member.permission,
            isLeadAdult: false,
          })),
      ];

      const savedMembers = await Promise.all(
        cleanedMembers.map(async (member) => {
          const memberDoc = await addDoc(collection(db, "familyMembers"), {
            ...member,
            familyId: familyDoc.id,
            createdAt: serverTimestamp(),
          });

          return { id: memberDoc.id, ...member, familyId: familyDoc.id };
        }),
      );

      onSaved({
        id: familyDoc.id,
        displayName: familyPayload.displayName,
        leadAdultUserId: user.uid,
        memberUserIds: [user.uid],
        members: savedMembers,
      });
    } catch {
      setSaveMessage("The family could not be saved yet. Please check Firebase permissions.");
    }
  }

  return (
    <section className="family-page">
      <div className="family-card">
        <p className="eyebrow">Family group</p>
        <h2>Name your household</h2>
        {saveMessage && <p className="form-error">{saveMessage}</p>}
        <div className="family-grid">
          <label className="field-label">
            Family display name
            <input
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              placeholder="The Ingram Family"
            />
          </label>
          <label className="field-label">
            Your name
            <input
              value={leadName}
              onChange={(event) => setLeadName(event.target.value)}
              placeholder="Lead adult name"
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
                Name
                <input
                  value={member.name}
                  onChange={(event) => updateMember(index, "name", event.target.value)}
                />
              </label>
              <label className="field-label">
                Age
                <input
                  value={member.age}
                  onChange={(event) => updateMember(index, "age", event.target.value)}
                  inputMode="numeric"
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
                  <option value="adult">Adult</option>
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
                  <option value="rate">Can add ratings</option>
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

        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onBack}>
            Back
          </button>
          <button className="primary-button" type="button" onClick={saveFamily}>
            Save family
          </button>
        </div>
      </div>
    </section>
  );
}

function SettingsPage({
  user,
  profilePhoto,
  familyProfile,
  onUpdateAccount,
  onUpdateFamily,
  onSignOut,
  onBack,
}) {
  const [activeSection, setActiveSection] = useState("account");
  const [accountDisplayName, setAccountDisplayName] = useState(user?.displayName || "");
  const [accountPhoto, setAccountPhoto] = useState("");
  const [accountPhotoName, setAccountPhotoName] = useState("");
  const [accountPhotoError, setAccountPhotoError] = useState("");
  const [pendingAccountPhoto, setPendingAccountPhoto] = useState(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountSaveStatus, setAccountSaveStatus] = useState("idle");
  const [familyName, setFamilyName] = useState(familyProfile?.displayName || "");
  const [editableMembers, setEditableMembers] = useState(familyProfile?.members || []);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsSaveStatus, setSettingsSaveStatus] = useState("idle");
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

  useEffect(() => {
    setAccountDisplayName(user?.displayName || "");
    setAccountPhoto("");
    setAccountPhotoName("");
    setAccountPhotoError("");
    setPendingAccountPhoto(null);
    setAccountMessage("");
    setAccountSaveStatus("idle");
  }, [user]);

  useEffect(() => {
    setFamilyName(familyProfile?.displayName || "");
    setEditableMembers(familyProfile?.members || []);
    setSettingsMessage("");
    setSettingsSaveStatus("idle");
  }, [familyProfile]);

  function updateEditableMember(index, key, value) {
    setEditableMembers((members) =>
      members.map((member, memberIndex) =>
        memberIndex === index ? { ...member, [key]: value } : member,
      ),
    );
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
      });
      setSettingsSaveStatus("ready");
      setSettingsMessage("Family settings saved.");
    } catch (error) {
      setSettingsSaveStatus("error");
      setSettingsMessage(error.message || "Family settings could not be saved.");
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
                Display name
                <input
                  value={accountDisplayName}
                  onChange={(event) => setAccountDisplayName(event.target.value)}
                  disabled={!user || accountSaveStatus === "saving"}
                />
              </label>
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
                  className="primary-button"
                  type="button"
                  onClick={saveAccountSettings}
                  disabled={accountSaveStatus === "saving" || !accountDisplayName.trim()}
                >
                  Save account settings
                </button>
              )}
              {user && (
                <button className="primary-button" type="button" onClick={onSignOut}>
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
                    Family settings and child permissions will appear here once a family is
                    created or joined.
                  </p>
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
                  <div className="settings-panel">
                    <strong>Members</strong>
                    <div className="settings-member-list">
                      {editableMembers.map((member, index) => (
                        <div
                          className="settings-member-row"
                          key={`${member.firstNameOrNickname}-${index}`}
                        >
                          <span>{member.firstNameOrNickname}</span>
                          {member.isLeadAdult ? (
                            <small>Family leader</small>
                          ) : (
                            <div className="settings-member-controls">
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
                                  <option value="adult">Adult</option>
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
                                  <option value="guided">Guided browsing</option>
                                  <option value="suggest">Can suggest movies</option>
                                  <option value="rate">Can add ratings</option>
                                  <option value="manage">Can help manage family</option>
                                </select>
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="settings-panel">
                    <strong>Child permissions</strong>
                    <p>
                      Permission controls will let leaders decide who can browse, suggest movies,
                      rate movies, and help manage the family.
                    </p>
                  </div>
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

function VisibilityChoice({ icon, label, value, selected, onChange }) {
  return (
    <label className={`visibility-choice ${selected === value ? "selected" : ""}`}>
      <input
        type="radio"
        name="visibility"
        value={value}
        checked={selected === value}
        onChange={() => onChange(value)}
      />
      {icon}
      <span>{label}</span>
    </label>
  );
}

createRoot(document.getElementById("root")).render(<App />);
