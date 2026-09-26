# Rendering notes

## Visual intent

The original VITL reference establishes a near-black green atmosphere, fine luminous strands, mint/citron/ivory light and an editorial print layout. The later flow references emphasize coherent sheets, broad folds, overlaid loops, narrow passages and deliberate negative space. The artwork is generated procedurally; reference images are not embedded and no generated background image is used.

Renderer 1.3 replaces independently curling plumes with a shared, folded ribbon surface. Long strands and short branches travel through the same larger bends. The surface twists in depth and alternates between narrow and broad regions; detail stays near those regions rather than spreading uniformly across the image. Three softly overlapping lane groups and seeded offsets vary the sheet's density without adding entities. The macro form is an artistic composition, not a measured business shape.

## Geometry

A C2 natural cubic guide defines the main form. Each clinic has a separate lane along it, starting at its joining month and ending at the selected cutoff. The ribbon's cross-section rotates in 3D, so projected strands can cross or compress while remaining separate in space.

Every submission begins at its actual clinic polyline. Pharmacy, recipient and medication branches begin at interpolated positions on their actual parent. A quintic release eases each child into a nearby lane on the same surface. A small local correction matches the first drawn edge exactly to its parent's forward tangent. Descendants inherit their parent's lane changes, so the branching hierarchy stays spatially coherent.

Submission months determine where branches begin along the clinic path. Child length and continuation along the ribbon are artistic choices; they do not represent future events or additional elapsed time. Medication counts determine the explicit number of leaves. Pharmacy keys affect local lane separation. All supplied entities still have their own trajectories, subject to the disclosed submission budget.

Every entity uses its own seeded random generator. Reordering clinics, pharmacies or submissions does not change the geometry. Direct-JSON fulfillment and recipient array order is part of the input; preserve it to reproduce a study. The renderer does not accumulate frames, so export output is independent of how long the app has been open.

## Local detail and trail attractors (1.4)

The **Branch detail** control adds seeded wave packets at several scales: submissions have the broadest departures, pharmacy branches have smaller ones, and recipient and medication branches add finer detail. Descendants inherit their ancestors' packets. All perturbations use the ribbon's local 3D orientation and preserve exact parent attachment and forward departure.

Up to 32 existing submission trails become weak attractor guides, chosen deterministically by seed and key. These source trails retain their diverged geometry while their neighbors respond. Sources span three reach scales (0.4, 0.8 and 1.4 times **Attractor reach**). Each starts with exactly zero strength, eases up over its first 22%, and eases back to zero over its final 32%, using a quintic envelope with smooth first and second derivatives. **Attractor strength** controls their influence.

The field combines a radial pull and a small tangential component. Its compact 3D support fades to zero at the reach boundary; strands that cross only in projection do not necessarily interact. Damped displacement, normalized overlapping influences and a displacement cap keep the larger ribbon form coherent. Child paths inherit their parent's displacement at their junction.

Lifetime here means progress along the source trail, not wall-clock simulation. The result remains reproducible as a still image. These effects are artistic structure and introduce no extra submissions or business measurements. Setting both Branch detail and Attractor strength to zero exactly restores renderer 1.3 geometry. Compare [the same seed with and without local detail](detail-comparison.jpg).

## History, quiet regions and momentum (1.5)

**Composition seed** controls the base branch arrangement; **Detail & light seed** independently controls wave packets, attractor selection, quiet-region placement and sparkle. Changing detail leaves the shared guide, base lane changes, topology and attachment fractions intact. The prior approved synthetic study is saved as [a renderer 1.4 project](../examples/vitl-ribbon-baseline.project.json); import it to reproduce that baseline.

**History influence** blends in two existing input signals. Medication item count sets source strength relative to the median visible submission, using a logarithmic ratio capped between 0.5 and 2. Pharmacy-group keys deterministically set modest reach variation and circulation direction; these are categorical signatures, not measured pharmacy distances. At zero influence, source strengths use only the artistic variation. Formulary categories are not currently in the schema. Relative strength can change with the timeline cutoff or sample because the reference median changes.

**Attractor frequency** controls the number of selected sources (up to 32); zero disables the field. **Quiet regions** adds broad, smooth variation in detail activity along the ribbon and modulates source strength, creating calmer passages beside complex ones. It does not remove business trajectories.

The default **Guided ribbons** mode uses damped displacement. **Particle advection · experimental** integrates a second-order displacement with velocity, restoring force toward the moving guide, drag and arc-length substeps. This allows momentum and overshoot while retaining bounded influence and exact branch attachment. It is a guide-constrained particle model, not a fluid solver or time-based interaction among independently moving orders. Source lifetime still follows progress along a trail. No new business entities are generated.

## Print inspection

**Inspect print detail** renders a 900-pixel crop at the selected export resolution. Position controls move the crop; it is shown at one image pixel per CSS pixel with scrolling. Translation and canvas clipping can produce minor antialiasing differences from the equivalent full-export pixels. Intended widths of 24, 30 and 40 inches report effective pixels per inch and the physical paper area covered by the crop. Browser zoom and screen density prevent this from being an automatically calibrated physical-size display. It does not simulate paper, ink, gamut or a printer profile. Export metadata remains 300 dpi; specify the intended dimensions in the printing workflow.

## Light and depth

The compositor combines constant-width cores, low-opacity halo passes, seeded point lights along those curves, decorative grain and a vignette. Solid/dashed core texture distinguishes patient and stock submissions. Paths have butt ends rather than opacity tapers. Geometry remains visible with bloom off.

Depth is a stylized cue that softens traces and enlarges their lights. Renderer 1.3 evaluates line softness along short sections of each path, allowing a folded strand to pass through focus. Dashed stock paths maintain their dash phase across sections. **It is not a physical thin-lens or path-traced depth-of-field simulation.** Depth, palette, point lights and atmospheric grain do not encode extra business facts.

## Exports

The master is square. The poster reserves its bottom 16% for reading instructions, chronology and provenance. Art-only mode expands the geometry vertically and removes poster typography; milestone labels are separately optional. Synthetic and sampling notices remain visible when applicable.

Exports redraw the same paths and lights at the selected resolution, not an enlarged screenshot. PNG `pHYs` metadata specifies 300 dpi. A 7,200-pixel image is 24 inches at 300 dpi or 30 inches at 240 dpi. The browser produces RGB PNG, not a printer-specific color separation. Verify a proof with the intended paper and printing service. The largest export may exceed a mobile browser's memory, so smaller export options remain available.

New projects use renderer 1.5.0. Saved 1.0.0, 1.1.0, 1.2.0, 1.3.0 and 1.4.0 projects retain their original geometry; **Reset style** adopts the current renderer. Project files reproduce geometry and settings for the indicated renderer version. Font rasterization and Canvas antialiasing can vary by browser and operating system; byte-identical PNGs across engines are not promised. System sans-serif fonts are used without network font requests.

## Verification

Node tests check exact multi-pharmacy hierarchy counts, finite positions, exact parent/child attachment and forward departure angles at every branch level, a framed ribbon silhouette and separate clinic lanes in 3D, deterministic geometry, timeline cutoff, sampling disclosure, medication-count counterfactuals, rejected input, current and legacy project round trips, CSV grouping/key removal and PNG density metadata.

Additional tests cover attractor lifetimes, compact 3D locality, bounded influence, exact zero-detail compatibility and persisted controls.

The optional browser script exercises real imports, seed changes, project save/reopen, PNG downloads, main-thread fallback, worker rendering, mobile layout and full-size export. The browser report records the tested environment and external network requests. Preview and test fixtures use synthetic data exclusively.
