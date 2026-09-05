# Sonus Umbrae 0.5.0

Sonus Umbrae 0.5.0 consolidates the language and runtime around a cleaner, more declarative model while adding a first synthesized drum system and improving live-performance behavior.

## Highlights

- Added `DRUMKIT` with reusable `KIT` values and the built-in `sonus606` kit.
- Added synthesized kick, snare, clap, hi-hat, open hi-hat, low tom and high tom voices.
- Added per-slot drum parameters including level, pan, tune, decay and model-specific controls.
- Added `humanize` for downward-only per-trigger level variation while preserving the configured level as the ceiling.
- Added Euclidean drum triggering with clock-derived subdivision support and rotation.
- Added local and global KIT definitions, KIT inheritance/override and aliases.
- Added live `_DRUMKIT` disable support with muted editor rendering.
- Reworked audio routing around unified `OUT` declarations, usable inside objects or at top level.
- Added serial routing with repeated `TO`, parallel routing with multiple `OUT` declarations, route levels with `AT`, implicit primary ports and explicit secondary ports.
- Added automatic routing of unconnected audio objects to `MAIN`.
- Added duplicate-route detection after route normalization.
- Cleaned up timing semantics so `WITH` modifies values, `EVERY` schedules events and `ON` modifies timing.
- Standardized derived-clock timing for beat subdivisions instead of fractional `EVERY` beat syntax.
- Simplified Euclidean timing semantics around ticks of the selected clock.
- Removed obsolete/legacy routing and timing forms that are no longer part of the public language.
- Continued the typed `SET` model for structured values.
- Updated editor normalization and syntax handling to match the canonical language.
- Updated the public language documentation and project README.
- GitHub Pages remains the public browser preview for the `main` branch.

## Notes

The language is still experimental. This release intentionally removes obsolete syntax rather than maintaining backward-compatibility aliases, because the project is not yet targeting compatibility with external user scripts.

For the current language contract, see `docs/LANGUAGE.md`.
