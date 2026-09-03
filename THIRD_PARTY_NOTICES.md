# Third-party notices

## Audible Instruments / Ripples virtual-analog model

The `liquid.mono` DSP backend is an adaptation of the Mutable Instruments
Ripples emulation by Tyler Coy, distributed in VCV Rack's Audible Instruments
under GPL-3.0-or-later.

Source: https://github.com/VCVRack/AudibleInstruments

The Sonus Umbrae adaptation removes VCV Rack and SIMD dependencies and exposes
a WebAssembly C ABI, while preserving the virtual-analog filter topology and
the LP12/BP12/LP24 output model.
