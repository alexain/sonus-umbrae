# Third-party notices

## Audible Instruments / Ripples virtual-analog model

The `liquid.mono` DSP backend is an adaptation of the Mutable Instruments
Ripples emulation by Tyler Coy, distributed in VCV Rack's Audible Instruments
under GPL-3.0-or-later.

Source: https://github.com/VCVRack/AudibleInstruments

The Sonus Umbrae adaptation removes VCV Rack and SIMD dependencies and exposes
a WebAssembly C ABI, while preserving the virtual-analog filter topology and
the LP12/BP12/LP24 output model.


## Valley Plateau

The `vast` FX backend uses the original `Dattorro` DSP core from ValleyAudio's ValleyRackFree Plateau module. The upstream source is fetched by `npm run dsp:setup` into `vendor/valley-rack-free/` and compiled into its own `vast.wasm` WebAssembly backend. Mist/Clouds remains a separate SuperParasites backend; Rack module/UI code is not compiled.

ValleyRackFree is GPL-3.0 licensed and identifies Plateau as a plate reverb based on Jon Dattorro's 1997 reverberator algorithm. Copyright and GPL terms remain with the upstream project.

Upstream: https://github.com/ValleyAudio/ValleyRackFree
