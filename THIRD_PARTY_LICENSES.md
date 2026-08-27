# Third-party software and licenses

Sonus Umbrae is released under the MIT License, but it can download, build, or depend on third-party software with independent copyright and license terms.

This file is informational and does not replace the authoritative license files distributed by each upstream project.

## Mutable Instruments Eurorack DSP

Current use: DSP implementation behind Sonus Umbrae `Voice()`.

Upstream project:

- Repository: `pichenettes/eurorack`
- Original author: Emilie Gillet / Mutable Instruments
- Related utility library: `pichenettes/stmlib`

The upstream Eurorack repository states:

- AVR project code: GPL-3.0
- STM32F project code: MIT
- Hardware files: CC BY-SA 3.0

Sonus Umbrae currently builds the Plaits DSP from the STM32F portion of that repository. The source is fetched by `npm run dsp:setup` into `vendor/eurorack/` and is intentionally not vendored in this repository.

The original Plaits source files carry the MIT license notice. The original copyright and license terms remain applicable to that code and to substantial portions derived from it.

Mutable Instruments is a registered trademark. Sonus Umbrae is an independent project and is not affiliated with or endorsed by Mutable Instruments. The Sonus Umbrae language intentionally exposes the engine under its own `Voice()` API rather than using Mutable Instruments product names as product branding.

Upstream references:

- https://github.com/pichenettes/eurorack
- https://github.com/pichenettes/stmlib

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
