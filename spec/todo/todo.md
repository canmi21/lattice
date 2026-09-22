# Deferred: what is known and not decided

An entry here is a finding, not a plan. It says what was found, what the evidence is, and what
deciding it would cost -- and it stops there, because the ordinary rule for a list of known
problems applies: one item at a time, proposed and explicitly accepted before anything is written.
The workspace's `agent-protocol.md` says why, and the reason bites hardest on a list like this one,
where every entry was judged once already by whoever wrote it.

Anyone who finds one adds it. Nobody works an entry as a side effect of the work that found it.

**A finding is anything that is a defect in where a decision lives rather than in what it decided.**
The CSS migration is where this list started and not what it is limited to; the rules hold whatever
the language.

This file is the index. An entry lives in the file for the area it is about, and this file says
which areas exist and which entries are worth reaching for first.

| area                     | entries | what it holds                                             |
| ------------------------ | ------- | --------------------------------------------------------- |
| [css.md](css.md)         | 49      | the layer migration's leftovers                           |
| [site.md](site.md)       | 8       | routing, rendering, the article page, the tests           |
| [cms.md](cms.md)         | 3       | the compiler's home, and what the CMS cannot yet offer    |
| [tooling.md](tooling.md) | 3       | the files that describe the repository rather than run it |

## Ranking, and what it is not

**Nothing here is ranked by how bad it is.** The order below is what the current work is blocked on,
and it changes when the work does. An entry not named here is not judged unimportant; it is
unranked, which is what every entry is until somebody has a reason to reach for it.

### Reached for first

These block the authoring side, which is where the work is. Each is in the file named beside it.

- The compiler still lives in the application that stopped using it -- [cms.md](cms.md)
- Publishing is a mise task and cannot become a CMS button -- [cms.md](cms.md)
- A clip is the one resource reference the compiler still resolves into bytes -- [cms.md](cms.md)
- A wrap policy is one decision per language, and the paragraph is where it is wanted -- [site.md](site.md)

### Reached for when the page they are on is next edited

Everything in [css.md](css.md). The migration's own rule is that nobody works one of these as part
of the component that found it, so they are worked when that component is opened again for its own
reasons.

## What each area holds

### [css.md](css.md)

- The named layer in CSS is the visual layer, written before there was one
- Geometry is derived through a cascade of custom properties
- The article body's typography reaches elements no component renders
- The floating surfaces are styled from the component that summons them
- `libs/svg-canvas` is a 527-line global stylesheet
- The CMS has no third layer
- Ancestor state reaches the visual layer only through a marker nobody owns
- `truncate` is one utility and two layers
- A shared visual vocabulary, arrived at by two people writing it separately
- Layout sits in the selector layer, in nearly every block that has one
- A directory row asks for a focus ring and every rule that could draw one declines
- Two conditions on one property are ranked differently by the two layers
- A keyframe holds the resting values the visual layer now owns
- An unlayered utility swallows a transition the markup still carries
- The gate compares a list, and a list is not a test
- An SVG presentation attribute is a fourth writer, and it sits below every layer
- A shadow is one utility, two declarations and four variables the visual layer cannot restate
- Two of the site's colours are not the token layer's, and cannot be read from it
- A style that is only ever conditional cannot be merged into a class attribute
- A wrapping floor moved and the language override on top of it could not
- A data attribute on the element itself is a condition the visual layer cannot state
- A portalled surface is out of Svelte's reach and not out of the visual layer's
- An attribute condition is one `:is()` away from the visual layer after all
- Tokei draws from a palette of its own, and it is the third one
- A `transition` shorthand sets five lists and the migrated form writes three
- An arrowhead is a shape made of borders, and the test cannot cut it in half
- One border, two spellings, and the migration is what put them side by side
- Nothing in the tree asks whether a declaration moved
- A line height with no reason behind it is a lookup, not a name
- A reduced-motion answer is three declarations that only mean anything together
- One property has a measured policy in one layer and a flat assertion in the other
- A value is written twice on one element, once as a class and once in the visual layer
- The border strengthens when a control is engaged, and the site spells that two ways
- The swallowed transition returns the moment the transition is given a name
- The extraction threshold counts one layer and the vocabulary lives in three
- The visual layer has two filename conventions and only one of them is the compiler's
- Two named surfaces disagree about what a hairline is, and each is internally consistent
- A declaration can nest two ways, and a sweep that reads one level finds neither
- The page ground is now one name, and the repair it is standing in for is one line on `body`
- The vocabulary counts components and a recipe is not one
- A recipe's other half is a convention and nothing checks that a call site kept it
- Whether a clip and a picture should draw one frame is a question about `blockFrame`'s users
- The dissolution section's argument stopped following from its premise
- `libs/tokens` is where a `:root` block goes, and only one kind has been tested there
- The three-component threshold is a memory, and nothing counts the components
- The enumeration is normative and the code has drifted from it
- The `// unnamed:` ledger has no entries and no counter
- A keyframe in the vocabulary empties a StyleX layer, and no gate sees it
- The scoped census does not descend into `:not()`

### [site.md](site.md)

- A total function answers for input it does not know, and is wrong instead of failing
- The homepage lists every article, and will not be able to for long
- The licence surface is eight addresses and one baked record
- The site's non-page routes are SvelteKit's, and every other worker's are hono's
- The resolution path on the site has no tests, because the site's modules do not resolve under vitest
- An article written in English is told it has no English version
- A table head wants a ground that stays the darker one in both themes
- A wrap policy is one decision per language, and the paragraph is where it is wanted

### [cms.md](cms.md)

- The compiler still lives in the application that stopped using it
- Publishing is a mise task and cannot become a CMS button
- A clip is the one resource reference the compiler still resolves into bytes

### [tooling.md](tooling.md)

- `.gitattributes` is a list nothing keeps complete
- A commit said less than it carried, because the paths were a directory
- A commit subject says sixteen rules where twelve were moved
