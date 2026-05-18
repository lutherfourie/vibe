# Pawfall — Game Design Document

_Living document. Code is the source of truth where this doc and the implementation disagree — update the doc._

## One-line pitch

A cat knocks things off a shelf. You swipe to catch them before they break. Everything but the cat has an opinion about it.

## Design pillars

Structural, not aspirational. Every decision in the project exists to make these true.

1. **The cat is on every screen.** Splash, menu, gameplay, pause, wave clear, game over, settings, shop. Enforced via [CatPresence.cs](../src/Assets/_Pawfall/Scripts/Core/CatPresence.cs).
2. **Visual identity is locked.** See [src/Assets/_Pawfall/Art/README.md](../src/Assets/_Pawfall/Art/README.md). Mood board match, no deviation.
3. **The cat is a reactive antagonist — in behaviour, not expression.** Her _behaviour_ (target choice, push force, telegraph timing) reacts to the player's performance. Her _expression_ is on a separate clock (see core principles). Two channels, different rates.
4. **The swipe trail is a soft cushion, not a blade.** See the header in [SwipeTrail.cs](../src/Assets/_Pawfall/Scripts/Player/SwipeTrail.cs). Non-negotiable.
5. **Pawfall is one entry in a series.** Spree-shaped code goes in [Scripts/Spree/](../src/Assets/_Pawfall/Scripts/Spree/).
6. **The game captures itself.** Memeability is the virality thesis — the game must _hand the player the clip_. Self-capture is a subsystem, not a feature. See [Share loop](#share-loop).

## Core principles

Rules every design and content decision is checked against.

- **Monotonic derangement.** The cat's expression is wave-indexed: she starts neutral in wave 1 and ends fully unhinged in wave 6. One channel, one direction, six stops. Authored as keyframes (six faces, six body poses, six vocalisation registers); lerped on wave change. **Monotonic across waves, modulatable within a wave** — event-driven flashes (brief Smug on your combo break, brief Delighted on a shattered precious, Blissed under catnip) push expression above or below the current floor temporarily, but the wave's stop is where she returns. The arc lands regardless.
- **Path B mood — warm schadenfreude.** The cat is _enjoying this_. The game is laughing with her at the player's expense, like a friend watching you spill coffee. Supersedes the earlier "affectionate, not punishing" framing — fails are cathartic, not soft.
- **Meme-first filter.** Every element lives on one of three tiers and knows which:
  - _Joke elements_ carry the meme (cat face, labelled hero objects, fail gags, diegetic voice lines).
  - _Setup elements_ enable the joke (telegraph pause, camera push-in, audio duck).
  - _Infrastructure_ is invisible (score math, collision, input timing). Trying to make infrastructure memeable breaks the comedy.
- **The cat never speaks.** Pure chirps, mrrps, howls. The household speaks through static text channels. She is the one alien, non-verbal presence in a verbose world. This makes her character by contrast.
- **Earnest delivery.** The game never winks at the camera. Objects never acknowledge they're in a joke. Specificity carries comedy; self-awareness kills it.
- **One primary read per moment.** In any short gameplay window, one skill demand, one joke payload, and one threat cue may be primary. Every other channel - cat pose, text, particles, score pop, audio, background reaction - must support that read or stay quiet.

## Verb

**Swipe.** The player draws a short-lived ribbon — the _swipe trail_ — that intercepts falling objects. Canonical framing: **soft cushion, not blade.** Warm, sparkly, tonally opposite to Fruit Ninja.

**One verb, many micro-skills.** Same swipe reads differently per object:

- **Fragile items** (wine glass, ceramic) need slow approach — the trail's speed is tracked, fast swipes break them mid-catch.
- **Heavy items** (laptop) need the trail to hold still under them briefly — a _brace_.
- **Liquid-containing items** (open coffee, fishbowl) must be caught from below — entry direction matters. Top-down swipes spill them.

The trail is the load-bearing technical risk; see [SwipeTrail.cs](../src/Assets/_Pawfall/Scripts/Player/SwipeTrail.cs).

## The antagonist

An orange tabby on a shelf. By wave 6 she is a chaos god.

- **Mood vocabulary** (6 states, preserved as a flavour layer for brief event reactions, not as the primary character channel): Neutral, Annoyed, Smug, Delighted, Defeated, Focused. See [CatMood.cs](../src/Assets/_Pawfall/Scripts/Cat/CatMood.cs). Code architecture around this is overbuilt for the new design — see [Open questions](#open-questions).
- **Primary character channel: derangement index (0–5), wave-indexed.** Six authored faces, six body poses, six vocalisation registers. Round 1 sits like a cat; round 6 is hunched like a gargoyle, vibrating, howling.
- **Reactive behaviour.** Target selection, push force, telegraph timing, and fake-out probability all scale with performance. The cat targets the most precious object when the player is on a hot streak. Tuning per wave in [CatBrain.cs](../src/Assets/_Pawfall/Scripts/Cat/CatBrain.cs).
- **Telegraph is the hero animation.** The 2–3 second pause before a push is the most clippable moment in the game. Pause any telegraph frame — it should be screenshot-worthy.

## The cat has a plan - AI Director

The cat does not merely spawn objects. She chooses a **mischief intent**: an authored beat with a gameplay role, a joke role, and a pressure cost. The game stays one-verb-simple, but the run feels richer because the cat appears to adapt, bait, show off, back off, and escalate.

| Intent | Player read | Cat fantasy | Gameplay role |
| --- | --- | --- | --- |
| Teach | "This object wants a special catch." | Cat tests you gently. | First encounter, low pressure. |
| Taunt | "She is going for something embarrassing." | Cat knows this is funny. | Comedy beat, medium pressure. |
| Test | "This is mechanically hard." | Cat challenges competence. | Skill check. |
| Bait | "She may fake me out." | Cat manipulates attention. | Fake-out / lane switch. |
| Relieve | "I get a breather or power-up." | Cat gets distracted. | Prevent frustration spiral. |
| Celebrate | "The run reacts to my good play." | Cat is stunned or offended. | Reward mastery. |
| Escalate | "The world is getting less sane." | Cat becomes a chaos god. | Late-wave escalation. |
| Finale | "This is the clip." | Cat breaks reality. | Signature wave moment. |

Director rules:

- Every wave has a pressure budget curve. High-pressure cards spend from it; relief/teach cards restore readability.
- No more than one high-risk precious threat at a time.
- After a precious shatter, force at least one relief/filler beat before another high-risk beat.
- Repeated near-misses should soften target selection and lengthen or clarify telegraphs.
- Dominant play should increase bait, fake-out, and precision skill checks, but never make the trail feel worse.
- Use lightweight, deterministic, inspectable AI: utility scoring, finite-state presentation, fuzzy stress/mastery estimates, telemetry, and offline-authored content banks. No runtime LLM calls in gameplay.

## Run shape

**~72 seconds: 6 waves of ~12s each.** Each wave has a named backdrop, a _signature hero object_, a pool of filler objects, and a fixed derangement index for the cat.

### Six-wave schedule

| # | Backdrop | Signature object | Notes |
| --- | --- | --- | --- |
| 1 | Kitchen counter | Stack of plates | Establish normal. You are competent. Cat derangement: 0. |
| 2 | Home office | Laptop mid-Zoom call (diegetic audio keeps playing as it falls) | Dialogue enters the game. Derangement: 1. |
| 3 | Dining room | Wedding cake with lit sparklers, labelled "John & Sarah, June 2024" | Stakes escalate via specificity. Derangement: 2. |
| 4 | Living room | Urn labelled "IN LOVING MEMORY OF HAROLD" | The quintessential shareable frame. Derangement: 3. |
| 5 | Study | Fishbowl with a fish whose eyes track the player | Living cargo. Fish is fine if you catch upright; dry if you don't. Derangement: 4. |
| 6 | Reality breaks | The moon; a live grenade; the concept of Tuesday | The cat has lost her mind; the world bends to her madness. Unlike waves 1–5, she _summons_ objects here rather than pushing them off the shelf. Derangement: 5. |

Wave tuning lives in [WaveData.cs](../src/Assets/_Pawfall/Scripts/Waves/WaveData.cs); assets under [ScriptableObjects/Waves/](../src/Assets/_Pawfall/ScriptableObjects/Waves/). The current code supports a `List<WaveData>` — signature-object-per-wave can be layered on top by tagging one `ObjectData` as the wave's hero and adjusting spawn weights.

### Signature shatter per round

Each hero object's breaking is a **bespoke visual punchline**, not a generic shatter. One per round; designed to be the round's clip moment. Culturally-safe framing throughout — no religious imagery, no sacred ritual, just absurd specificity. Earnest delivery, zero wink.

| Round | Hero object | Signature shatter gag |
| --- | --- | --- |
| 1 | Stack of plates | Baseline ceramic shatter — _no_ gag. Establishes the normal so later rounds have contrast. |
| 2 | Laptop mid-Zoom | The Zoom call continues as a floating chat window drifting off-screen: _"Karen: hello? I can still hear you?"_ |
| 3 | Wedding cake (sparklers lit) | Tiny bride-and-groom toppers tumble out mid-embrace, still dancing in disbelief. Sparklers keep fizzing. |
| 4 | Harold urn | **The urn was mislabeled.** It shatters open to reveal it's been Pandora's urn all along — the petty annoyances of modern life escape as tiny labeled gremlins (UNPAIRED SOCK, JURY DUTY, MONDAY MEETINGS, EXPIRED MILK, WRONG WI-FI PASSWORD, PARKING TICKETS, UNREAD EMAIL…). Pool of ~20, 5–8 spawn randomly per shatter. At the bottom of the shards, faintly glowing: a tiny curled-up label reading **HOPE**, which stays behind. Chyron: _"BREAKING: MINOR INCONVENIENCES OF MODERN LIFE NOW AT LARGE."_ |
| 5 | Fishbowl | Fish flops forward, eyes locked on player. Water hangs in midair for a beat before splashing. The tracking stare intensifies. |
| 6 | Concept of Tuesday | Reality glitches. Chyron: _"404: TUESDAY NOT FOUND."_ The week resumes on Wednesday. |

**Mix concrete characters with abstract gags.** If every shatter releases a tiny person, the trick wears thin by round 3. The current mix (two character-releases in 3 and 5, three meta-gags in 2/4/6, baseline in 1) is the ceiling — don't push past three characters in total.

## Cross-object physics

A third joke channel alongside text (dialogue) and the cat's derangement arc (character). Objects on screen can affect each other visually or physically — _magnet warps the nearby CRT, water sparks the laptop, candle melts the ice cream mid-fall._ This is pantomime comedy: the joke lands silently, in one glance.

### The rule

**Physics-channel interactions must be self-legible.** If a bubble-caption is needed to explain the interaction, it failed. "Grandma gets it in half a second" is the bar. Interactions that need a narrator belong in the text channel.

### Seed list (all self-legible)

- Magnet → CRT: screen warps, colour bleeds, static hiss.
- Water → electronics (laptop, phone): sparks, glitch pixels.
- Candle / heat → ice cream: melt puddle mid-air.
- Heat → balloon: swells, pops early.
- Roomba → any falling object: bounces it sideways.
- Fan → light objects (feather, napkin): drifts unpredictably.
- Hot coffee → chocolate bar: softens, stretches in your catch.
- Lit sparkler → gunpowder keg: implied stakes; cat panics pre-emptively.

Reject anything needing explanation. "The vase remembers its past life" is a text-channel joke masquerading as physics.

### Attention-budget rule

Speech bubbles, chyron, cat derangement, falling objects, and cross-object FX can all fire simultaneously. Hard cap: **one physics-channel beat highlighted at a time.** Background FX still plays; one interaction per frame gets the hero treatment (zoom-in, slow-mo, or priority compositing). The rest live as ambient texture.

### Decorative-only in v1

Cross-object interactions are **purely visual** for v1 — shader warps, particle FX, drift modifications. No scoring implications, no required catch order, no rule changes. Players don't need to _understand_ these interactions to play correctly; they're pure delight.

Promote specific interactions to _mechanical_ (stakes, catch-order requirements, score effects) only if playtest shows the player actively wishing them to matter. Shipping decorative doesn't foreclose mechanical; it defers it to a later pass.

### Discovery gallery (optional, high-retention)

Each round seeds 1–2 cross-object interactions. Post-run, a "moments" gallery shows what the player discovered: _"You discovered: Magnet + CRT."_ Collectible across sessions; cheap retention mechanic patterned on Noita at casual-mobile scale.

### Implementation pattern

Receivers hold the logic, not emitters. A magnet is a tagged plain object. A CRT has a `MagnetReactor` component that detects nearby tagged objects and applies a shader warp. New interactions = new reactor component on the receiver. No N×N matrix; complexity localised per-object.

**Objects don't know about each other; receivers know what they react to.**

### Period cue

CRTs are nostalgic, not contemporary. This makes the household implicitly period-fuzzy — grandma's living room with a CRT next to a modern laptop. Either commit to the cosy generationally-blurry frame (likely the right call; it carries character for free) or normalise to a single era. Don't be accidentally inconsistent.

### Backgrounds react too

The physics channel extends to the environment. Each round has **one reactive background element** — a single asset with two or three states that responds to falling objects, cross-FX, or wave-progress events. Decorative-only, same rules as falling-object cross-FX. Same global event bus powers both.

| Round | Reactive background element |
| --- | --- |
| 1 | The fridge. Falling magnets stick; a collection accumulates across the wave. |
| 2 | A bulletin board. Papers blow off whenever objects whoosh past; bare by wave end. |
| 3 | A hanging pendant lamp. Heavy objects falling past make it sway; a wine glass glances off and spins. |
| 4 | A mantel of framed family photos. Each shatter-vibration tips one face-down. By wave end only the urn's spot remains upright. |
| 5 | A wall-mounted taxidermy deer. Its glass eyes slowly track the fishbowl; on shatter, the head turns away. |
| 6 | The background is the variable — starts as a composite of rooms 1–5, glitches progressively until it's pure TV static. |

**Budget: one reactive element per round, two–three states per asset.** No interactive environments, no combinatorial explosion. Scope discipline is the design.

## Objects

Three types, defined in [ObjectData.cs](../src/Assets/_Pawfall/Scripts/Objects/ObjectData.cs):

- **Catchable.** Filler. Mass, gravity, spin, catch radius tunable per object. Missing breaks combo but doesn't deduct score.
- **Precious.** Rare, high-value, high-risk. Wears a halo. Shatter deducts `shatterPenalty` and triggers the cat's Delighted beat.
- **Power-up.** Skips shatter lifecycle. On catch, calls `PowerUpData.Activate`.

**Design note: labels are the cheapest comedy.** "A plate" is not memeable; "A plate with a chip in the rim from Thanksgiving 2019" is. Every hero object gets a specificity detail — often a text label — that converts it from _object_ to _character_.

## Scoring

Specified in [ScoreManager.cs](../src/Assets/_Pawfall/Scripts/Scoring/ScoreManager.cs):

- **Catch:** `baseScore × multiplier`, added to score and combo.
- **Multiplier:** `1 + combo/5`, capped at 5×. Resets to 1× on combo break.
- **Miss** (catchable hits floor): combo breaks, no score change.
- **Precious shatter:** combo breaks, `shatterPenalty` deducted (default 100), fires `OnPreciousShattered` → cat Delighted beat.
- **Perfect wave bonus:** +800 if no misses and no shatters in the wave.
- **High score:** PlayerPrefs-persisted, crown + "New High Score!" on the Wave Clear screen.

**Snowball ceiling:** combo, power-up multipliers, Frenzy, and Bigger Trail must not combine into "danger disappears" runs. If score spread or catch radius scales too hard, convert one layer into capped additive/style bonuses and keep the leaderboard framed socially until validation proves the economy is stable.

## Failure

**There is no fail state.** Runs always complete all 6 waves. The score + the cat's derangement arc _is_ the win/loss — a perfect run ends with a fully deranged cat having Lost; a sloppy run ends with a fully deranged cat having Won. The arc lands regardless; only the emotional valence differs.

This is the Royal Match / cat-brushing casual-mobile frame. Revisit only if playtest shows runs feel consequence-free.

## Power-ups

Four in v1, stubbed in [Scripts/PowerUps/](../src/Assets/_Pawfall/Scripts/PowerUps/):

- **Cream** — 2× score multiplier. Fiction: cat distracted by the saucer.
- **Bigger Trail** — 2× effective catch radius.
- **Laser Pointer** — cat goes HYPER. Alert, body-tense, tracking the red dot. Mood snaps to Focused; she slows, redirects, or over-telegraphs instead of deleting threat entirely.
- **Catnip** — cat goes CHILL. Belly-up, half-lidded, paws batting at invisible things. Mood snaps to Blissed (a new register, sub-Neutral on the derangement arc); she becomes easier to read and less aggressive instead of simply stopping all pressure. Catch the catnip mid-fall to medicate her — she _sees it coming_ and her derangement spikes briefly with excitement before the cushion effect lands.

All duration-based. Activations stack cleanly (TODO: wire push/pop on activate/deactivate).

**Threat modulation, not threat cancellation.** Laser Pointer and Catnip can share the same broad "cat control" slot, but they should preserve visible danger. The reward is a more readable, more cinematic cat, not an empty shelf. Round 6 deranged-cat-on-catnip is particularly cinematic: fully unhinged, suddenly cosmic.

**Mood register update:** the enum in [CatMood.cs](../src/Assets/_Pawfall/Scripts/Cat/CatMood.cs) adds **Blissed** to the flavour layer.

## The household speaks — in text

The household communicates via on-screen text, not voice acting. This is a deliberate choice: silent clips are what spread on muted autoplay feeds, localisation becomes trivial, the audio mix stays clean, and typography folds into the existing visual identity lock.

### Text formats

Different visual languages are allowed only when they do different jobs.

- **Signature object set pieces → attached or embedded text.** Reserved for authored hero moments such as the Zoom laptop chat stream or a specific shatter gag. Not a generic event feed.
- **Chorus (the radio) → cable-news chyron.** Bottom-of-screen scrolling headline band, news-ticker aesthetic, ALL CAPS, "BREAKING:" prefix. The radio's line bank is about _other_ objects' events — it narrates what has happened elsewhere in the run. Voice character: earnest NPR newscaster delivering impossible facts. The more deadpan, the funnier.
  - _"BREAKING: THE MOON HAS VANISHED."_
  - _"LOCAL AUTHORITIES CONFIRM A GRENADE IS AIRBORNE OVER EAST HOLLYWOOD."_
  - _"THE CONCEPT OF TUESDAY WAS REPORTED MISSING AT 3:47 PM."_

**Why chyron specifically:** cable-news chyrons are already a native meme format. Screenshots of absurd chyron text are a pre-existing viral template. The game renders real-looking chyron frames during play; players share them without editing. Virality jackpot.

**Current v1 readability direction:** routine peer-object bubbles are deprecated by [feel-over-bubbles.md](feel-over-bubbles.md). Keep the chyron and authored signature text set pieces, but do not add combo-frequency bubbles for ordinary falls, catches, or shatters. Routine feedback should come from motion, particles, score pops, audio, and cat reactions.

### Rules

- **One chorus per round, max.** Two narrators competing is visual slop.
- **Chorus objects must read as decorative when silent.** If the radio is always on screen, its ambient design has to earn its pixels.
- **The cat stays silent _and_ textless.** The one wordless presence in a verbose, typographic world.
- **Caption-safe zone.** Reserve a fixed band (top or bottom quarter) for chyron and high-priority set-piece text. Players learn where to glance; falling objects don't get obscured.
- **Dwell.** Text lingers 3–4 seconds minimum before fading; rare lines can linger longer. Players need to read, screenshot, or mentally bank the line before it's gone.

### Persistence is a feature

If the radio carries across rounds, the newscaster becomes a character with its own arc — increasingly alarmed as derangement climbs. By round 6: _"WE ARE GOING LIVE TO OUR REPORTER AT THE SCENE OF REALITY ITSELF."_

### Content pipeline (provisional)

1. Enumerate objects × situations.
2. Prompt template → bulk LLM generation, 8–12 lines per situation.
3. Human vet filter for tonal drift — reject any line with meta-humour, self-awareness, "reddit voice." Earnest delivery only.
4. Typography pass — ALL CAPS for chyron, set-piece-specific casing for signature object text, punctuation restraint enforced (no exclamation-mark spam, em-dashes over ellipses for cut-offs).
5. Ship as static string data; no runtime LLM calls.

**Stress test round 6 first.** If you can't write 10 funny deadpan chyron lines about the moon disappearing, the concept needs work before the rest of the content pipeline spins up.

### Audio still matters — just not for dialogue

- **Shatter SFX** — the sensory payoff for fails; Path B makes these cathartic.
- **Catch SFX** — the soft-cushion swipe ribbon's whoosh + sparkle.
- **Cat vocalisations** — chirps, mrrps, howls, one register per derangement index. Picked at random during idle beats. Never a word.
- **Ambient background audio per round** — kitchen hum, office printer, wedding crowd murmur, funeral silence, aquarium bubbler, static void. Sets mood without competing with gameplay text.

## Share loop

Per design pillar #6, the game captures itself. Minimum bar for v1:

- **Auto-capture last 8 seconds** when any Precious shatters, and when a run ends.
- **One-tap share** from the post-run screen — _"You let Harold fall. Share this masterpiece."_
- **Clip gallery** across sessions — players rewatch the Harold moment tomorrow.
- **Watermark** — tiny logo + series hashtag, top corner, readable not begging.

Capture is a real subsystem, not a post-launch feature. Highest-leverage engineering investment if virality is the thesis.

## Cosmetics

- **Cat skins** — coat patterns, hats, collars. Orange tabby canonical; v2.
- **Trail skins** — warm-palette variants of the swipe trail.

## Art, audio, presentation

- Art direction: [art-direction.md](art-direction.md) → canonical lock at [src/Assets/_Pawfall/Art/README.md](../src/Assets/_Pawfall/Art/README.md).
- Audio direction: [src/Assets/_Pawfall/Audio/README.md](../src/Assets/_Pawfall/Audio/README.md), series [audio guide](../../../shared/design/audio-guide.md).
- Portrait 9:16, WebGL deployable. Desktop-class browsers are the supported WebGL baseline; mobile browsers require explicit device/browser validation before they are promised.
- Store-facing visual/audio assets must follow [asset-provenance.md](asset-provenance.md): source, license, AI assistance, human edit/overpaint, and final approver recorded before public submission.
- **Art-budget priority order:** (1) the round-6 cat face, (2) the other five cat faces, (3) the six signature hero objects, (4) everything else. The round-6 face is the trailer shot and the App Store screenshot — design the whole character backward from that one frame.

## The environment remembers

The household accumulates damage _across_ sessions, not just within a run. Break the urn in session 3; it comes back duct-taped in session 4. Break it again; it's been replaced by a thermos labelled "DEFINITELY NOT PANDORA'S URN." The environment is a record of the player's play history — physical, visual, diegetic. No stat menus, no counters; the damage itself is the memory.

### Scope — hero objects only (v1)

Persist damage state only for the **6 signature hero objects**. Filler catchables (plates, photo frames, tchotchkes) reset each run. This keeps the save payload tiny (6 slots × ~4 states each) and the visual language readable. Over-tracking becomes clutter; under-tracking loses the magic.

### Evolution chains per hero object

Each hero object has an authored evolution chain, 3–4 states deep, driven by cumulative break count:

- **0 breaks:** Pristine. The object as first introduced.
- **1 break:** Cracked and visibly repaired — glue lines, a single strip of duct tape, handwritten label ("DO NOT DROP 🙏").
- **2–3 breaks:** Chaotically patched — multiple tape layers, mismatched pieces, progressively desperate repair style.
- **4+ breaks:** Replaced with a budget / joke substitute — the wine glass becomes a solo cup; the urn becomes a thermos; the wedding cake becomes a store-bought cupcake. Still breaks. Still triggers the signature shatter gag (variant content, see below).

### The content-rotation problem

Signature shatter gags are one-shot jokes. **The first Pandora release is hilarious; the 20th is dead.** Two mitigations, both required:

- **Pandora gremlin pool scales to ~60 entries** (not 20). Each shatter pulls a random 5–8. Combinatorics carry replays.
- **The hero object itself evolves** (see chain above) — each state variant has its own shatter gag variant. Pristine urn releases the canonical gremlin pool; the thermos variant releases "off-brand" gremlins ("MISPLACED AIRPODS", "SAID 'YOU TOO' TO WAITER"); the mantel plaque variant releases a single apologetic ghost that mouths "sorry" before fading.

Applies to all six hero objects. ~18 hero-object variants total across the chain.

### Design rule — damage is character, not clutter

Every patch is a joke. Every duct-tape strip can carry a handwritten label, a date, a cartoon apologetic note. Repair style degrades visibly: first fix is neat masking tape; fifth fix is a cardboard box wrapped in Christmas lights. If a patch isn't earning a smile, it shouldn't be on screen.

### Afterlives — broken objects relocate

Beyond evolution chains, broken hero objects reappear **somewhere else in the world in a new role.** The shattered wine glass becomes an inverted dome covering a broken snowglobe on the mantel. The fishbowl is in the dustbin, upside-down, a dried algae silhouette where the fish used to be. This is the environment's long-term memory at its most diegetic — no menus, no counters; just props that shouldn't be where they are, earning their place through your history.

Seed list, three afterlives per hero object:

- **Wine glass** — dome over a broken snowglobe; upside-down in the drying rack with a "to re-glue" sticky; duct-taped as a pencil cup.
- **Fishbowl** — in the dustbin with a dried algae silhouette; desk dome for a tiny potted plant; kitchen sink overflowing with rubber ducks.
- **Laptop** — hinged backward as a tent on the coffee table; on the floor holding a door open; used as a cheese board.
- **Urn** — empty on the mantel with a "sorry" note taped over Harold's name; stuffed with ballpoint pens; repurposed as a pencil cup.
- **Wedding cake** — one surviving frosting-flower preserved under a glass cloche; the bride-and-groom topper alone on an empty plate, still dancing.
- **Moon** — hidden in a pillowcase on the couch labelled "DO NOT TELL NASA"; bedside nightlight; rolled under the sofa.

On spawn, each scene consults the break registry and fills authored afterlife slots with appropriate variants (randomised from the seed list).

### Composite tableaux — the surprise engine

Certain _pairs_ of broken objects unlock a specific combined set piece. Emergent, combinatoric, designed to be discovered accidentally. Ship ~10 pair-combos:

- **Wine glass + snowglobe** → inverted dome over the shards.
- **Laptop + coffee mug** → tented laptop with mug wedged in the keyboard. Label: "MISTAKES WERE MADE."
- **Urn + fishbowl** → urn filled with water holding a single goldfish. Plaque: "HAROLD HAS A FRIEND NOW."
- **Grenade + moon** → miniature diorama on the shelf, pin stuck in the moon.
- **Fishbowl + radio** → fishbowl inverted over the radio. Chyron: "STUDIO FLOODED, PLEASE STAND BY."
- **Wedding cake + laptop** → laptop displaying a "CONGRATULATIONS" image with frosting crumbs.

More pairs get added in post-launch drops (see content strategy below).

### Themed-world receptacles (future worlds)

Each future themed world gets **one canonical labelled receptacle prop** that collects broken hero items in a world-appropriate frame. The label is always the joke:

- **Lab:** _HAZARDOUS WASTE_ bin with a teleport gun sticking out at an angle, sticker "DO NOT USE."
- **Wizard convention:** _CURSED ITEMS_ padlocked chest with a dulled crystal ball visible through a vent.
- **Spaceship:** _AIRLOCK — AWAITING VENT_ chamber with items floating in zero-G.
- **Aquarium:** _QUARANTINE TANK_ with broken hero objects bobbing.

One receptacle per world = one authored prop = one joke label. Efficient content unit.

### Content strategy — author a lot, forget most

To engineer designer-level surprise: brainstorm content in dense, separated sittings, then don't review it for months. Targets:

- **Gremlin pool** (Pandora): 60 entries.
- **Afterlives:** 3+ per hero object, 18+ total for v1; expand to ~30 in post-launch drops.
- **Composite tableaux:** 10 for v1; +2–3 per content drop.
- **Chyron lines** (radio): 30+ for v1.

When the game shows you a configuration you forgot you authored, that's genuine surprise from authored content. This is the reliable path to designer-level delight — and it compounds over time for returning players.

### Scope pushback — don't ship everything at launch

The full content-pass is sizeable: ~72 hero-object variants × 3 afterlives × 10 composites × 6 themed receptacles × 60 gremlins × 30 chyrons. **Ship half for v1**; roll the rest as post-launch content drops. Returning players discover new configurations with each update — live-ops-by-design. The accumulation feature _benefits_ from being gradual; a player who sees the same afterlife library in session 50 as in session 3 has a staler game than one seeing new tableaux unlock monthly.

### Reset valve — "move to a new house"

By session 50, some players will want a fresh household. Offer an optional **"Move to a new house"** button in the settings menu. Preserves high score, clip gallery, unlocks; resets environment to pristine. Framed narratively: _"The landlord finally evicted you. You got a new place. The cat came along."_ Non-punishing, in-character, lets long-term players reset the visual state without losing meaningful progress.

### Subsystem requirements

- **Structured save** (JSON blob or equivalent) — per-hero-object break counts, per-session history counters. PlayerPrefs is sufficient for MVP; upgrade path to proper file storage.
- **Web storage durability** — Pawfall is WebGL-deployable; browser `localStorage` can be wiped. Plan for cloud save (v2).
- **Onboarding tip on session 2 or 3** — a one-time text overlay: _"Your household remembers what you've broken."_ Shown once, then never again.

## Roadmap — themed worlds (post-v1)

The household is World 1. Future content direction: additional themed worlds (science lab, wizard convention, spaceship, etc.) featuring the same cat, same verb, same monotonic derangement structure — different setting, different hero objects, different chorus character.

**Business decision deferred:** are themed worlds (a) expansions to Pawfall (franchise model, content packs post-launch) or (b) separate entries in the Cat Cafe spree (series-anchored, unified by brand not engine)? Series concept currently says each entry is standalone, which leans toward (b); world-hopping Pawfall would be a soft break. Decide with data after the household ships and validates the virality thesis.

**What to do now to keep the option open:** name the household "World 1" internally in code/docs; keep `WaveData` shaped so a future refactor can group 6 waves into a "World" container. Don't build the container yet — that's premature architecture until (a) or (b) is decided.

## Open questions

1. **The 6-mood code architecture is overbuilt for the new design.** [CatMood.cs](../src/Assets/_Pawfall/Scripts/Cat/CatMood.cs), the mood-library array in [CatController.cs](../src/Assets/_Pawfall/Scripts/Cat/CatController.cs), and the event-driven mood wiring fight the derangement-index principle. Needs a re-spec: keep mood enum as a brief flash-reaction layer; replace the primary expression channel with a simple `derangementIndex` driven by `WaveManager`. Deferred until prototype play feels settled.
2. **Liquids implementation.** Entry-direction-matters (catch-from-below for liquids) is the cleanest of the three options considered (implicit / brace / physics invention). Not yet prototyped — confirm feel before committing.
3. **Round 6 structure.** _Cat summons_ rather than pushes is a mechanical break from waves 1–5. Should this be part of the main run (earned absurdity) or an unlockable post-victory mode (preserves grounded fiction of the main run)? Current direction: ship as round 6 of the main run with the "cat has lost her mind" framing.
4. **Failure model revisit.** Currently no fail state (see [Failure](#failure)). Revisit after first playtest.
5. **Precious penalty tuning.** −100 on shatter vs. +800 perfect bonus means one precious break nets −100 from a perfect run. Tune after playtest; consider pairing with a mood-arc close-up so the loss feels narrative rather than numeric.
6. **HUD contents.** Implied: score, combo, wave indicator, high-score crown. Not decided: active power-up timers, caption-safe negative space for share-clip captions, pause button placement.
