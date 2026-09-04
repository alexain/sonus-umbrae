# Third-party notices

## Audible Instruments / Ripples virtual-analog model

The `liquid.mono` DSP backend is an adaptation of the Mutable Instruments
Ripples emulation by Tyler Coy, distributed in VCV Rack's Audible Instruments
under GPL-3.0-or-later.

Source: https://github.com/VCVRack/AudibleInstruments

The Sonus Umbrae adaptation removes VCV Rack and SIMD dependencies and exposes
a WebAssembly C ABI, while preserving the virtual-analog filter topology and
the LP12/BP12/LP24 output model.

## Ghost Note Audio CloudSeedCore

The `sky` FX backend uses Ghost Note Audio's CloudSeedCore reverb algorithm. The upstream source is fetched by `npm run dsp:setup` into `vendor/cloudseed-core/` and compiled into its own `sky.wasm` WebAssembly backend.

CloudSeedCore is MIT licensed. Copyright remains with Ghost Note Engineering Ltd / Ghost Note Audio. Sonus Umbrae uses the name `sky` for its public model and does not present itself as an official Cloud Seed product.

Upstream: https://github.com/GhostNoteAudio/CloudSeedCore
