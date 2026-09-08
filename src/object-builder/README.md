# Object Builder metadata

This directory is intentionally isolated from the current Sonus Umbrae UI.
Nothing in `src/object-builder/` is imported by the live editor yet.

`catalog.ts` is the first machine-readable inventory for the future visual
Object Builder. It describes the currently implemented object families, models,
parameters, ports, routing defaults and useful static preview types.

The catalog is intended to become shared metadata for:

- the `+ Add Object` dialog;
- context-aware destination/source pickers;
- inline object/expression insertion;
- autocomplete and contextual help;
- static previews for envelopes, LFOs, logic, samples and sequencers.

The generated Sonus source remains the canonical representation. The builder
must never create a parallel session format or hidden graph.

## Implementation order

1. Keep the catalog synchronized with the language/runtime registries.
2. Add the builder shell and object chooser without changing existing editor behaviour.
3. Implement CLOCK, ENV and MOD/LFO as the first parameter panels.
4. Add routing discovery from the current parsed program.
5. Add VOICE/FX/SAMPLE and SEQ specialised editors.
6. Reuse the same metadata for autocomplete and `Edit Object`.

Some rich grammar constructs are represented initially as `expression`,
`pattern`, `pitch` or `routing` controls rather than decomposed into every
sub-token. These are deliberate extension points for specialised editors.
