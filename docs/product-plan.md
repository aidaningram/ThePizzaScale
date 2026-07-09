# The Pizza Scale Product Plan

The Pizza Scale starts as a public movie-rating site, then layers in family accounts and personalized recommendations.

## Version 1

- Public movie search and movie detail pages.
- 8-slice Pizza Score for every rated movie.
- Family Match percentage for signed-in families.
- Lead adult creates and manages the family.
- Lead adult submits reviews for the family.
- Reviews collect parent slice score and kids slice score.
- Overall score is calculated as the average of parent and kids scores.
- Written public reviews are optional.
- Review visibility can be private, anonymous aggregate, or public.
- Public identity is limited to the chosen family display name.
- Children's names are never public.
- Child age display is controlled by the lead adult.

## Data Shape

### families

- displayName
- leadAdultUserId
- memberUserIds
- publicAgeDisplayMode: hidden | ranges | exact
- createdAt

### familyMembers

- familyId
- firstNameOrNickname
- role: adult | child
- age
- gender
- isLeadAdult

### movies

- imdbId
- title
- year
- rated
- runtime
- genre
- posterUrl
- plot
- omdbPayload

### reviews

- familyId
- movieId
- parentSliceScore
- kidSliceScore
- overallSliceScore
- overallPercent
- writtenReview
- visibility: private | aggregate | public
- publicFamilyDisplayName
- publicAgeSnapshot
- createdAt

## Recommendation Path

The first Family Match score can be a weighted estimate:

- family age fit
- movie rating
- genre preferences from past ratings
- similar-family aggregate ratings
- broad popularity among families

As data grows, this can move toward collaborative filtering based on family profiles and rating patterns.
