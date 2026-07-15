# PizzaMovieNight to Pizza Scale migration

This migration keeps the original PizzaMovieNight Firebase project intact while creating the shared family record in the Pizza Scale Firebase project.

## What stays safe

- The old PizzaMovieNight Firebase project remains untouched except for the bridge rules already deployed there.
- The Realtime Database Arena backup is saved at:
  `/Users/aidaningram/Documents/Codex/firebase-backups/pizza-movie-night-rtdb-family.json`
- The PizzaMovieNight app-state is stored separately from the Pizza Scale family profile at:
  `pizzaMovieNightFamilies/pizza-movie-night`

## Target shared records

The shared family should use this stable ID:

```text
families/pizza-movie-night
```

That lets both apps agree on the same family without guessing.

The migration writer creates or updates:

- `families/pizza-movie-night`
- `familyMembers/{member docs}`
- `familyInvites/{family code}`
- `pizzaMovieNightFamilies/pizza-movie-night`

It does not write movie ratings or public reviews.

## Required before writing

1. Import the PizzaMovieNight Auth users into the Pizza Scale Firebase project.
2. Copy the template:

```bash
cp migration/pizza-movie-night-family.template.json migration/pizza-movie-night-family.plan.json
```

3. Fill in:

- `leadAdultEmail`
- each member's first name
- each member's email, if they have an account
- birth dates in `YYYY-MM-DD`
- gender
- role
- whether the adult can rate for the family

Kids without accounts should leave `email` blank.

## Preview

Run this first. It does not write data.

```bash
npm run migrate:pizza-movie-night:check
```

## Write

Only after the preview looks right:

```bash
npm run migrate:pizza-movie-night
```

If the family already exists and you intentionally want to update it:

```bash
cd functions
node scripts/migrate-pizza-movie-night-family.mjs --write --merge
```

## After migration

Only after Pizza Scale contains the shared family and the 5 Auth users can sign in there:

1. Switch PizzaMovieNight's Firebase config to the Pizza Scale Firebase project.
2. Deploy Pizza Scale rules/functions/database rules.
3. Deploy or push PizzaMovieNight.
4. Test both apps with the same family account.

Do not switch PizzaMovieNight first. If the accounts are not in Pizza Scale Auth yet, users will be locked out of the migrated app.
