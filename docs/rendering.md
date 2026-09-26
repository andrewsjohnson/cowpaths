# Rendering notes

## Visual intent

The reference is a square editorial print with a near-black green atmosphere, a compact asymmetric spiral, curving outward streams, fine branching detail, mint/citron/ivory light, selective glow and foreground defocus. The artwork is generated procedurally; the reference is not embedded and no generated background image is used.

The revised geometry replaces the large central spiral with a small curl that gradually unwinds into the upper-right stream. Branches follow that stream before separating. Recent activity adds density along its later stretch. There are no fixed destination corridors pulling strands back across their parent flow.

Renderer 1.2 adds three seeded flow groups with opposing sweeps, variable curl onset and strand reach, and stronger depth separation. Smooth release preserves the inherited heading at every junction. Fine secondary branches overlap broad arcs with different lengths, breaking up the single dominant plume. These flow groups are composition choices, not measured business categories. No extra submissions or branches are invented.

## Geometry

Each clinic follows its own chronological lane, from joining through the selected cutoff. Lane radii stay positive and expand, so inner lanes cannot fold across the origin. Each submission starts at an interpolated point on its clinic's actual drawn path.

Every branch, including submissions, inherits the exact parent segment's forward heading. It initially follows the parent's curvature, then smoothly releases into its own curl. The curvature transition uses an integrated smoothstep; the first edge has no angular jump. Pharmacy, recipient and medication branches use the same rule. Pharmacy keys affect fulfillment curvature. Medication counts modestly influence reach as well as the explicit number of leaves.

The first-order light and first milestone attach to the first matching submission instead of a disconnected fixed center point.
Every entity uses its own seeded random generator. Reordering clinics, pharmacies or submissions does not change the geometry. Direct-JSON fulfillment and recipient array order is part of the input; preserve it to reproduce a study. The renderer does not accumulate frames, so export output is independent of how long the app has been open.

## Light and depth

The compositor combines constant-width cores, low-opacity halo passes, seeded point lights along those curves, decorative grain and a vignette. Solid/dashed core texture distinguishes patient and stock submissions. Paths have butt ends rather than opacity tapers. Geometry remains visible with bloom off.

Depth is a stylized cue that softens selected traces and enlarges their lights. **It is not a physical thin-lens or path-traced depth-of-field simulation.** Depth, palette, point lights and atmospheric grain do not encode extra business facts.

## Exports

The master is square. The poster reserves its bottom 16% for reading instructions, chronology and provenance. Art-only mode expands the geometry vertically and removes poster typography; milestone labels are separately optional. Synthetic and sampling notices remain visible when applicable.

Exports redraw the same paths and lights at the selected resolution, not an enlarged screenshot. PNG `pHYs` metadata specifies 300 dpi. A 7,200-pixel image is 24 inches at 300 dpi or 30 inches at 240 dpi. The browser produces RGB PNG, not a printer-specific color separation. Verify a proof with the intended paper and printing service. The largest export may exceed a mobile browser's memory, so smaller export options remain available.

New projects use renderer 1.2.0. Saved 1.0.0 and 1.1.0 projects retain their original geometry; **Reset style** adopts the current renderer. Project files reproduce geometry and settings for the indicated renderer version. Font rasterization and Canvas antialiasing can vary by browser and operating system; byte-identical PNGs across engines are not promised. System sans-serif fonts are used without network font requests.

## Verification

Node tests check exact multi-pharmacy hierarchy counts, finite positions, exact parent/child attachment and forward departure angles at every branch level, positive expanding clinic lanes, deterministic geometry, timeline cutoff, sampling disclosure, medication-count counterfactuals, rejected input, current and legacy project round trips, CSV grouping/key removal and PNG density metadata.

The optional browser script exercises real imports, seed changes, project save/reopen, PNG downloads, main-thread fallback, worker rendering, mobile layout and full-size export. The browser report records the tested environment and external network requests. Preview and test fixtures use synthetic data exclusively.
