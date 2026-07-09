const OMDB_BASE_URL = "https://www.omdbapi.com/";

export async function searchOmdbMovies(query) {
  const apiKey = import.meta.env.VITE_OMDB_API_KEY;
  const response = await fetch(
    `${OMDB_BASE_URL}?apikey=${apiKey}&type=movie&s=${encodeURIComponent(query)}`,
  );
  const payload = await response.json();

  if (!response.ok || payload.Response === "False") {
    return [];
  }

  return payload.Search.map((movie) => ({
    imdbId: movie.imdbID,
    title: movie.Title,
    year: movie.Year,
    posterUrl: movie.Poster,
  }));
}

export async function getOmdbMovie(imdbId) {
  const apiKey = import.meta.env.VITE_OMDB_API_KEY;
  const response = await fetch(`${OMDB_BASE_URL}?apikey=${apiKey}&i=${imdbId}&plot=short`);
  const movie = await response.json();

  if (!response.ok || movie.Response === "False") {
    throw new Error(movie.Error || "Movie details could not be loaded.");
  }

  return {
    imdbId: movie.imdbID,
    id: movie.imdbID,
    title: movie.Title,
    year: movie.Year,
    rated: movie.Rated,
    runtime: movie.Runtime,
    genre: movie.Genre,
    posterUrl: movie.Poster,
    plot: movie.Plot,
    omdbPayload: movie,
  };
}
