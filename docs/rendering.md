# Rendering notes

## Visual intent

The reference is a square editorial print with a near-black green atmosphere, a compact asymmetric spiral, curving outward streams, fine branching detail, mint/citron/ivory light, selective glow and foreground defocus. The artwork is generated procedurally; the reference is not embedded and no generated background image is used.

Initial development renders were rejected for resembling a broad wheel and a uniform radial spray. The composition instead uses a tighter chronology and five broad flow corridors, with a minority of loose curling paths crossing the negative space. Recent history flows toward the upper-right plume, so later activity increases density there. Corridors are artistic composition choices, not five measured business categories.

## Geometry

Each clinic follows an offset lane on an asymmetric chronological spiral, from joining through the selected cutoff. Each submission starts on its clinic's analytic path. Most submissions use a smooth cubic steering path and terminal curl; a minority integrate a decaying curvature field. Pharmacy, recipient and medication branches interpolate their exact parent path and inherit its tangent. Pharmacy keys affect fulfillment curvature. Medication counts modestly influence reach as well as the explicit number of leaves.

Every entity uses its own seeded random generator. Reordering clinics, pharmacies or submissions does not change the geometry. Direct-JSON fulfillment and recipient array order is part of the input; preserve it to reproduce a study. The renderer does not accumulate frames, so export output is independent of how long the app has been open.

## Light and depth

The compositor combines constant-width cores, low-opacity halo passes, seeded point lights along those curves, decorative grain and a vignette. Solid/dashed core texture distinguishes patient and stock submissions. Paths have butt ends rather than opacity tapers. Geometry remains visible with bloom off.

Depth is a stylized cue that softens selected traces and enlarges their lights. **It is not a physical thin-lens or path-traced depth-of-field simulation.** Depth, palette, point lights and atmospheric grain do not encode extra business facts.

## Exports

The master is square. The poster reserves its bottom 16% for reading instructions, chronology and provenance. Art-only mode expands the geometry vertically and removes poster typography; milestone labels are separately optional. Synthetic and sampling notices remain visible when applicable.

Exports redraw the same paths and lights at the selected resolution, not an enlarged screenshot. PNG `pHYs` metadata specifies 300 dpi. A 7,200-pixel image is 24 inches at 300 dpi or 30 inches at 240 dpi. The browser produces RGB PNG, not a printer-specific color separation. Verify a proof with the intended paper and printing service. The largest export may exceed a mobile browser's memory, so smaller export options remain available.

Project files reproduce geometry and settings for the indicated renderer version. Font rasterization and Canvas antialiasing can vary by browser and operating system; byte-identical PNGs across engines are not promised. System sans-serif fonts are used without network font requests.

## Verification

Node tests check exact multi-pharmacy hierarchy counts, finite positions, parent/child continuity, deterministic geometry, timeline cutoff, sampling disclosure, medication-count counterfactuals, rejected input, project round trips, CSV grouping/key removal and PNG density metadata.

The optional browser script exercises real imports, seed changes, project save/reopen, PNG downloads, main-thread fallback, worker rendering, mobile layout and full-size export. The browser report records the tested environment and external network requests. Preview and test fixtures use synthetic data exclusively.
