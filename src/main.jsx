import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Film,
  Lock,
  Menu,
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
} from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getOmdbMovie, searchOmdbMovies } from "./movieProvider";
import pizzaLogo from "./assets/PizzaLogo.png";
import "./styles.css";

const posterThemes = ["marmalade", "neon", "stage", "woodland"];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [featuredCatalog, setFeaturedCatalog] = useState(featuredMovies);
  const [movieResults, setMovieResults] = useState(featuredMovies);
  const [selectedMovie, setSelectedMovie] = useState(featuredMovies[0]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [user, setUser] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [familyProfile, setFamilyProfile] = useState(null);
  const [review, setReview] = useState({
    parentScore: 7,
    kidScore: 8,
    visibility: "aggregate",
    writtenReview: "",
    showAgeShape: true,
  });

  useEffect(() => onAuthStateChanged(auth, setUser), []);

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

      if (!isCurrent) return;

      setFeaturedCatalog(hydratedMovies);
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

        if (!isCurrent) return;

        setMovieResults(detailResults);
        setSelectedMovie(detailResults[0] || featuredCatalog[0]);
        setSearchStatus(detailResults.length ? "ready" : "empty");
        setSearchMessage(detailResults.length ? "Live results from OMDb" : "No movies found");
      } catch {
        if (!isCurrent) return;

        setMovieResults(featuredCatalog);
        setSelectedMovie(featuredCatalog[0]);
        setSearchStatus("error");
        setSearchMessage("Movie search is unavailable right now");
      }
    }, 350);

    return () => {
      isCurrent = false;
      window.clearTimeout(searchTimer);
    };
  }, [featuredCatalog, query]);

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

  async function handleEmailAuth({ mode, email, password }) {
    setAuthMessage("");

    try {
      if (mode === "create") {
        await createUserWithEmailAndPassword(auth, email, password);
        setPage("family-prompt");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setPage("home");
      }
    } catch (error) {
      const providerDisabled =
        error.code === "auth/operation-not-allowed" ||
        error.message.toLowerCase().includes("password");
      setAuthMessage(
        providerDisabled
          ? "Email/password sign-in needs to be enabled in Firebase Authentication."
          : "Sign-in could not be completed. Check your email and password.",
      );
    }
  }

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut(auth);
    setPage("home");
  }

  function goHome() {
    setMenuOpen(false);
    setPage("home");
  }

  return (
    <main className="app-shell">
      <SiteHeader
        user={user}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onHome={goHome}
        onSignIn={() => setPage("signin")}
        onSettings={() => {
          setMenuOpen(false);
          setPage("settings");
        }}
      />

      {authMessage && <div className="auth-banner error">{authMessage}</div>}

      {page === "home" && (
        <HomePage
          query={query}
          setQuery={setQuery}
          movieResults={movieResults}
          selectedMovie={selectedMovie}
          setSelectedMovie={setSelectedMovie}
          searchMessage={searchMessage}
          searchStatus={searchStatus}
          review={review}
          setReview={setReview}
          user={user}
          onSignIn={() => setPage("signin")}
        />
      )}

      {page === "signin" && (
        <SignInPage
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

      {page === "settings" && (
        <SettingsPage
          user={user}
          familyProfile={familyProfile}
          onSignOut={handleSignOut}
          onBack={goHome}
        />
      )}
    </main>
  );
}

function SiteHeader({ user, menuOpen, setMenuOpen, onHome, onSignIn, onSettings }) {
  return (
    <header className="site-header">
      <button className="brand-mark" type="button" aria-label="The Pizza Scale home" onClick={onHome}>
        <img src={pizzaLogo} alt="" aria-hidden="true" />
      </button>
      <div>
        <p className="eyebrow">The Pizza Scale</p>
        <h1>Find the movie your whole family can agree on.</h1>
      </div>
      <div className="account-actions">
        {!user ? (
          <button className="sign-in-button" type="button" onClick={onSignIn}>
            <Users size={18} />
            Sign in
          </button>
        ) : (
          <>
            <button
              className="menu-button"
              type="button"
              aria-label="Open account menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Menu size={22} />
            </button>
            {menuOpen && (
              <div className="account-menu">
                <button type="button" onClick={onSettings}>
                  Settings
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
}

function HomePage({
  query,
  setQuery,
  movieResults,
  selectedMovie,
  setSelectedMovie,
  searchMessage,
  searchStatus,
  review,
  setReview,
  user,
  onSignIn,
}) {
  const overallScore = (Number(review.parentScore) + Number(review.kidScore)) / 2;

  return (
    <>
      <section className="hero-band">
        <div className="search-panel">
          <label className="search-label" htmlFor="movie-search">
            <Search size={18} />
            <input
              id="movie-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search family-tested movies"
            />
          </label>
          <div className="metric-strip" aria-label="Pizza Scale summary">
            <Metric label="Movies Rated" value="0" />
            <Metric label="Family Reviews" value="0" />
            <Metric label="Scale" value="8 slices" />
          </div>
        </div>
      </section>

      <section className="content-grid" aria-label="Pizza Scale movie explorer">
        <aside className="movie-column">
          <div className="section-heading">
            <Film size={20} />
            <h2>{query.trim().length >= 2 ? "Movie Search Results" : "Movies to Try"}</h2>
          </div>
          {searchMessage && <p className={`search-status ${searchStatus}`}>{searchMessage}</p>}
          <div className="movie-list">
            {movieResults.map((movie) => (
              <button
                className={`movie-card ${selectedMovie.id === movie.id ? "active" : ""}`}
                key={movie.id}
                type="button"
                onClick={() => setSelectedMovie(movie)}
              >
                <PosterTile movie={movie} compact />
                <span>
                  <strong>{movie.title}</strong>
                  <small>
                    {movie.year} · {movie.rated || "NR"} ·{" "}
                    {movie.reviewCount > 0 ? `${movie.familyMatch}% match` : "No ratings yet"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="detail-panel">
          <button className="back-button" type="button">
            <ChevronLeft size={18} />
            Browse
          </button>
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
                  onChange={(event) =>
                    setReview({ ...review, writtenReview: event.target.value })
                  }
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
                  onChange={(event) =>
                    setReview({ ...review, showAgeShape: event.target.checked })
                  }
                />
                <span>Allow public review to show broad child age range</span>
              </label>

              <button className="primary-button" type="button" onClick={!user ? onSignIn : undefined}>
                {user ? "Save Rating" : "Sign in to Save Rating"}
              </button>
            </form>

            <aside className="public-reviews">
              <div className="section-heading">
                <EyeOff size={20} />
                <h2>Public Family Reviews</h2>
              </div>
              <div className="empty-state">
                <strong>No public family reviews yet</strong>
                <p>
                  The Pizza Scale is brand new. Once real families submit reviews, they will
                  appear here.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </section>
    </>
  );
}

function SignInPage({ authMessage, onEmailAuth, onGoogleSignIn, onBack }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <section className="account-page">
      <div className="account-card">
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
          onClick={() => onEmailAuth({ mode: mode === "create" ? "create" : "login", email, password })}
        >
          {mode === "login" ? "Log in" : "Create account"}
        </button>
        <button className="secondary-button" type="button" onClick={onGoogleSignIn}>
          Continue with Google
        </button>
        <button className="text-button" type="button" onClick={onBack}>
          Back to movies
        </button>
      </div>
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

      await Promise.all(
        cleanedMembers.map((member) =>
          addDoc(collection(db, "familyMembers"), {
            ...member,
            familyId: familyDoc.id,
            createdAt: serverTimestamp(),
          }),
        ),
      );

      onSaved({ id: familyDoc.id, displayName: familyPayload.displayName, members: cleanedMembers });
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

function SettingsPage({ user, familyProfile, onSignOut, onBack }) {
  return (
    <section className="account-page">
      <div className="account-card">
        <p className="eyebrow">Settings</p>
        <h2>Account settings</h2>
        <p>{user ? `Signed in as ${user.displayName || user.email}` : "You are not signed in."}</p>
        <div className="settings-panel">
          <strong>Family</strong>
          <p>
            {familyProfile
              ? `${familyProfile.displayName} is set up. Permissions can be adjusted here later.`
              : "Family settings and child permissions will appear here once a family is created."}
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          Back to site
        </button>
        {user && (
          <button className="primary-button" type="button" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
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
