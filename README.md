# The Pizza Scale

A public family-centered movie rating site built around 8-slice scores and family-specific match recommendations.

## Local Setup

1. Install dependencies.
2. Copy `.env.example` to `.env.local`.
3. Add Firebase project values and an OMDb API key.
4. Run the dev server.

```bash
npm install
npm run dev
```

## First Product Direction

The public site comes first: browse movies, see Pizza Scores, read public family reviews, and understand how well a movie works for families.

Account features are layered in next: family creation, lead adult review controls, privacy settings, and personalized Family Match scoring.

## Backend Aggregation

Pizza Score aggregation is handled by a Firebase Cloud Function in `functions/`. The website writes family review documents, and the backend updates `movies/{movieId}` totals so users cannot directly edit public aggregate scores from the browser.

Deploying Functions requires the Firebase project to be on the Blaze plan. Early usage should stay inside Firebase/Google Cloud no-cost allowances, but set a budget alert before deploying.

```bash
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,storage,functions
```
