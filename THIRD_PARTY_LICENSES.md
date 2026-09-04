# Third-party software and licenses

Sonus Umbrae is released under the MIT License, but it can download, build, or depend on third-party software with independent copyright and license terms.

This file is informational and does not replace the authoritative license files distributed by each upstream project.

## Mutable Instruments Eurorack DSP

Current use: DSP implementations behind the Sonus Umbrae `VOICE` macro-engine family, the `matter` physical-modeling engine (Elements), and the `resonator.*` family (Rings).

Upstream project:

- Repository: `pichenettes/eurorack`
- Original author: Emilie Gillet / Mutable Instruments
- Related utility library: `pichenettes/stmlib`

The upstream Eurorack repository states:

- AVR project code: GPL-3.0
- STM32F project code: MIT
- Hardware files: CC BY-SA 3.0

Sonus Umbrae currently builds Plaits, Elements, and Rings DSP code from the STM32F portion of that repository. The source is fetched by `npm run dsp:setup` into `vendor/eurorack/` and is intentionally not vendored in this repository.

The original Plaits source files carry the MIT license notice. The original copyright and license terms remain applicable to that code and to substantial portions derived from it.

Mutable Instruments is a registered trademark. Sonus Umbrae is an independent project and is not affiliated with or endorsed by Mutable Instruments. The Sonus Umbrae language intentionally exposes this DSP through its own `VOICE` engine names rather than using Mutable Instruments product names as product branding.

Upstream references:

- https://github.com/pichenettes/eurorack
- https://github.com/pichenettes/stmlib


## Ghost Note Audio CloudSeedCore

The Sonus Umbrae `sky` FX model uses the CloudSeedCore algorithm by Ghost Note Audio / Ghost Note Engineering Ltd. The source is fetched by `npm run dsp:setup` into `vendor/cloudseed-core/` and compiled to a separate `sky.wasm` artifact.

CloudSeedCore is released under the MIT License. Sonus Umbrae retains the upstream copyright and license notices and exposes the algorithm under its own `sky` model name.

Upstream repository:

- https://github.com/GhostNoteAudio/CloudSeedCore

## Emscripten

Emscripten is used as a development tool to compile C/C++ DSP code to WebAssembly. It is not vendored in the Sonus Umbrae repository.

- Project: https://emscripten.org/
- Repository: https://github.com/emscripten-core/emscripten

Consult the upstream project for its current license terms.

## Node.js development dependencies

Sonus Umbrae currently uses npm development dependencies including TypeScript and Vite. Their packages and transitive dependencies retain their own licenses.

Consult `package-lock.json` and the corresponding upstream projects for authoritative dependency versions and license information.

## Fonts

The current UI prefers Departure Mono when it is available on the system. The font binary is not distributed by this repository.

If Sonus Umbrae later bundles fonts or additional DSP engines, their license notices should be added to this file before distribution.


## Mutable Instruments Tides 2018 DSP

The current `MOD` backend, internally named Swell, uses DSP source code from the `tides2` directory of the Mutable Instruments Eurorack repository.

The Tides 2018 firmware source is released under the MIT License. The public language exposes this functionality as `MOD`; the internal Swell name is an implementation detail. Sonus Umbrae does not use Mutable Instruments or Tides as product branding.

The upstream source is downloaded by the DSP setup process and is not authored by the Sonus Umbrae project.



## SuperParasites

The current eight-mode Mist backend used by Sonus Umbrae `FX` objects uses DSP code from Patrick Dowling's SuperParasites project, itself based on Mutable Instruments Clouds, Parasites, and Beat Repeat.

SuperParasites' STM32F code is distributed under the MIT License. The public language exposes these processors through Sonus Umbrae `mist.*` model names inside `FX` objects rather than upstream product branding.

The upstream source is fetched into `vendor/superparasites` by `npm run dsp:setup` and is not vendored into this repository.
