import { createGunzip } from "node:zlib";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import readline from "node:readline";

const root = new URL("../", import.meta.url);
const dataDir = new URL("data/", root);
const cacheDir = new URL(".cache/imdb/", root);
const outputPath = new URL("popular-guide-backlog.json", dataDir);
const seedPath = new URL("data/movie-guides.seed.json", root);
const homeCategoriesPath = new URL("data/home-appeal-categories.js", root);
const popularExpansionPath = new URL("data/popular-expansion-guides.js", root);

const DATASETS = {
  basics: "https://datasets.imdbws.com/title.basics.tsv.gz",
  ratings: "https://datasets.imdbws.com/title.ratings.tsv.gz",
};

await mkdir(cacheDir, { recursive: true });

const [basicsPath, ratingsPath] = await Promise.all([
  downloadDataset(DATASETS.basics, new URL("title.basics.tsv.gz", cacheDir)),
  downloadDataset(DATASETS.ratings, new URL("title.ratings.tsv.gz", cacheDir)),
]);

const [ratings, existingGuideIds] = await Promise.all([
  readRatings(ratingsPath),
  readExistingGuideIds(),
]);

const movies = await readPopularMovies(basicsPath, ratings);
movies.sort((a, b) => b.numVotes - a.numVotes || b.averageRating - a.averageRating);

const backlog = {
  source: {
    name: "IMDb non-commercial datasets",
    url: "https://datasets.imdbws.com/",
    selection: "Feature films sorted by number of IMDb user votes.",
    generatedBy: "scripts/build-popular-guide-backlog.mjs",
  },
  totalCandidates: 250,
  existingGuideCount: movies.slice(0, 250).filter((movie) => existingGuideIds.has(movie.id)).length,
  movies: movies.slice(0, 250).map((movie, index) => ({
    rank: index + 1,
    ...movie,
    hasPizzaScaleGuide: existingGuideIds.has(movie.id),
    guideStatus: existingGuideIds.has(movie.id) ? "existing" : "needs-source-checked-guide",
  })),
};

await writeFile(outputPath, `${JSON.stringify(backlog, null, 2)}\n`);

console.log(
  `Wrote ${backlog.movies.length} popular movie candidates to ${fileURLToPath(outputPath)}.`,
);
console.log(`${backlog.existingGuideCount} already have Pizza Scale guides.`);
console.log(`${backlog.movies.length - backlog.existingGuideCount} need source-checked guides.`);

async function downloadDataset(url, destinationUrl) {
  try {
    const stat = await import("node:fs/promises").then(({ stat }) => stat(destinationUrl));
    if (stat.size > 0) return fileURLToPath(destinationUrl);
  } catch {
    // Download below.
  }

  await mkdir(dirname(fileURLToPath(destinationUrl)), { recursive: true });
  const tempUrl = new URL(`${destinationUrl.pathname}.tmp`, destinationUrl);
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${url}: ${response.status} ${response.statusText}`);
  }

  await pipeline(response.body, createWriteStream(tempUrl));
  await rename(tempUrl, destinationUrl);

  return fileURLToPath(destinationUrl);
}

async function readRatings(path) {
  const ratings = new Map();
  const lines = readline.createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of lines) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    const [id, averageRating, numVotes] = line.split("\t");
    ratings.set(id, {
      averageRating: Number(averageRating),
      numVotes: Number(numVotes),
    });
  }

  return ratings;
}

async function readPopularMovies(path, ratings) {
  const movies = [];
  const lines = readline.createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of lines) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    const [
      id,
      titleType,
      title,
      originalTitle,
      isAdult,
      year,
      endYear,
      runtimeMinutes,
      genres,
    ] = line.split("\t");

    if (titleType !== "movie" || isAdult !== "0" || year === "\\N") continue;

    const rating = ratings.get(id);
    if (!rating || !Number.isFinite(rating.numVotes)) continue;

    movies.push({
      id,
      title,
      year,
      runtimeMinutes: runtimeMinutes === "\\N" ? "" : runtimeMinutes,
      genres: genres === "\\N" ? "" : genres,
      averageRating: rating.averageRating,
      numVotes: rating.numVotes,
    });
  }

  return movies;
}

async function readExistingGuideIds() {
  const seed = JSON.parse(await readFile(seedPath, "utf8"));
  const [homeCategories, popularExpansion] = await Promise.all([
    readFile(homeCategoriesPath, "utf8"),
    readFile(popularExpansionPath, "utf8").catch(() => ""),
  ]);
  const ids = new Set(seed.map((guide) => guide.id || guide.imdbId).filter(Boolean));

  for (const match of `${homeCategories}\n${popularExpansion}`.matchAll(/tt\d{7,9}/g)) {
    ids.add(match[0]);
  }

  return ids;
}
