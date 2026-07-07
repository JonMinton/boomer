# Boomer — Feature Log

Abbreviated entries appear in-game under **What's New** on the main menu
(`js/changelog.js` — keep the two in sync). The July 2026 feature
programme was designed and playtested in the sibling repo
[`boomerworld`](https://github.com/JonMinton/boomerworld) (see its
`FEATURES.md` for rationale, prioritisation and playtest records);
features that make sense on flat terrain are ported here.

## Ported from the boomerworld programme

### Headshots ✅
A direct hit whose impact point lands in the top 37.5% of the body box
deals **1.4×** damage with a gold oversized number and HEADSHOT caption
(sniper 65 → 91, still not a one-shot from full health). Blast splash
never qualifies, so explosive spam gains nothing. The AI aims at body
centre, so the bonus rewards human precision. This was a long-standing
TODO stretch goal.

### Med-kit crates ✅
35% of parachute drops are white red-cross med-kits healing +35 HP
(capped at max) with a green heal number, instead of ammo. Same
parachute rules — shoot the chute and the kit smashes. Crate collection
now emits typed events (`pickups.events`) drained by game.js, replacing
the count-comparison hack for the pickup sound.

## Not ported (boomerworld-specific for now)

- **Grapple hook** — the pendulum feel depends on radial gravity and
  ring-scale swings; a flat-world port would need its own tuning pass.
  Candidate for a future iteration.
- **Meteor storms** — falling-from-space framing belongs to the ring
  world; flat Boomer's equivalent would want a different fiction
  (artillery barrage?). Logged as an idea, not scheduled.
