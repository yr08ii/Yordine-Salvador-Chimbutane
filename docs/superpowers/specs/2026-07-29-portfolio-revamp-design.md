# Portfolio revamp — design

Date: 2026-07-29
Repo: `yr08ii/portfolio` (static site, no build step)

## Goal

Move the portfolio from a dark, effect-heavy layout to a light, direct, editorial
presentation. Reduce prose volume across all project and experience copy in favour of
concrete technical statements. Add a per-project photo gallery.

Reference point supplied by the site owner: <https://ileanapal.github.io/index.html> —
valued for being scannable and unembellished from an employer's point of view.

## Decisions

| Question | Decision |
|---|---|
| Palette | Warm off-white, near-monochrome, one restrained accent |
| Projects layout | Keep the horizontal drag-scroll card rail |
| Two FLOAT entries | Keep separate; rewrite so they no longer duplicate each other |
| Gallery source images | Convert HEIC → JPEG; leave FLOAT gallery empty until photos exist |
| `.MOV` poster frames | Not extracted |

## Visual system

```
--paper    #FAF9F7   page background
--paper-2  #F3F1EC   recessed surfaces
--ink      #16150F   body text
--muted    #6B6B63   metadata
--rule     #E3E0D8   hairlines
--accent   #B23A28   links, counters, active state only
```

The previous accent (`#d72626`) is a saturated pure red that vibrates against a light
background. Desaturated to brick it reads as chosen rather than default.

Type roles:

- **Instrument Serif** — display headings. Italic used for the qualifier inside an
  otherwise upright headline (mixed-type headline).
- **DM Sans** — body and UI.
- **JetBrains Mono** — metadata only: dates, section counters, tags. Not body copy.

Removed: SVG grain overlay, accent glow tokens, drop shadows, Bebas Neue. On paper-white
these read as noise rather than texture.

Retained taste moves: numbered section rhythm, single deliberate accent, monospace
reserved for metadata. Explicitly avoided: gradient/glow hero, centred-everything layout.

## Structural fixes

1. Every section is currently nested inside `<section class="hero">`, which never closes
   until `</main>`. Sections become siblings.
2. Hero and one project card reference `assets/images/Projects/…`, a directory that no
   longer exists — these render broken today. Repointed at `assets/`.
3. The 2500×2500 portrait is served at display size.

## Project galleries

A horizontal scroll strip at the foot of each expanded case study. Fixed height, auto
width, `scroll-snap-type: x proximity`, native scrolling — no drag JS. Keyboard reachable.
Renders only when the project has images, so the empty FLOAT folder produces no markup
rather than broken frames.

Source conversion: `sips -s format jpeg -s formatOptions 80 -Z 1600`, output to
`assets/gallery/<project>/web/`. Originals untouched.

Four images were stored rotated 90° and were corrected with `sips -r 90`. Three files were
dropped: one phone-UI screenshot and two duplicates.

## Copy rules

Applied to every project and experience entry:

- Delete category label prefixes ("Technical Leadership as PIC:", "Multidisciplinary
  Engineering:").
- Delete intensifiers: *spearheaded, seamlessly, rigorous, drastically, relentless,
  successfully, comprehensive*.
- Lead with the verb; close on the measurable outcome.
- Metadata (dates, tools, role) moves out of prose into mono-set fields.

Target: roughly a 45% word reduction. About section goes from three dense paragraphs to
approximately eight lines.

## FIRST Global entry

The existing card body is a verbatim copy of the FLOAT project — the placeholder to
replace. LinkedIn was unreachable (HTTP 999 login wall), so content is grounded in:

- The owner's résumé: Mechanical Team Captain and primary robot driver, Team Mozambique,
  youngest member of the delegation.
- Facts legible in the supplied photographs: venue barrier reading "FIRST GLOBAL CHALLENGE
  ATHENS"; a lanyard badge reading DRIVE TEAM; a broadcast frame showing Match 42, Field 3,
  with Mozambique allied to Latvia and Timor-Leste; REV Control Hub, REV Expansion Hub and
  HD Hex Motors visible in the robot.

Consequences: the existing "Scratch Programming" tag is not supportable — the FGC kit runs
on the REV Control Hub — and is replaced. Résumé dates (Sep 2024 – Jun 2025) supersede the
site's Oct–Nov 2024.

No placement, match record, or award is asserted. Anything unverified is left as a marked
`TODO` comment in the HTML rather than guessed at.

## Out of scope

- No framework, bundler, or dependency is introduced. The site stays three files.
- No changes to résumé PDFs.
