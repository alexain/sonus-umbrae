# Third-party software and licenses

Sonus Umbrae is released under the MIT License. Selected DSP implementations are built from upstream projects whose copyright and license terms remain applicable to those components.

The active DSP build is intentionally limited to permissively licensed code.

## Mutable Instruments Eurorack STM32F DSP

Current use: macro synthesis (`macro.*` / Plaits DSP), `matter` physical modelling (Elements), `resonator.*` (Rings), the four-output modulation backend (Tides 2018), and selected Marbles random-voltage components used by `MOD dices`.

- Original author: Emilie Gillet / Mutable Instruments
- Upstream: https://github.com/pichenettes/eurorack
- Utility library: https://github.com/pichenettes/stmlib
- License of the STM32F project code used by Sonus Umbrae: MIT

Sonus Umbrae builds only the relevant permissively licensed STM32F DSP portions. Mutable Instruments is a registered trademark; Sonus Umbrae is independent and is not affiliated with or endorsed by Mutable Instruments. The public language uses Sonus model names rather than upstream product names as product branding.

## SuperParasites

Current use: the `mist.*` stereo FX family.

- Author/project: Patrick Dowling / SuperParasites
- Upstream: https://github.com/patrickdowling/superparasites
- License for the STM32F project code used by Sonus Umbrae: MIT

SuperParasites incorporates work derived from the Mutable Instruments Clouds/Parasites ecosystem. Sonus Umbrae compiles the required permissively licensed DSP portions into its own WebAssembly backend.

## Ghost Note Audio CloudSeedCore

Current use: the Sonus `sky` ambient reverb.

- Original author: Ghost Note Audio / Ghost Note Engineering Ltd
- Upstream: https://github.com/GhostNoteAudio/CloudSeedCore
- License: MIT

CloudSeedCore is fetched into `vendor/cloudseed-core/` and compiled into the independent `sky.wasm` backend. Sonus Umbrae uses `sky` as the public model name and is not created, sponsored or endorsed by Ghost Note Audio.

Ghost Note Audio's upstream README explicitly permits both free and commercial use, asks integrations to credit Ghost Note Audio as the original author, and asks that any use of the name “Cloud Seed” make clear that the integrating product is not created by Ghost Note Audio. The corresponding attribution is retained in `THIRD_PARTY_NOTICES.md`.

## Electrosmith DaisySP

Current use: the `svf` multimode FILTER backend. The build currently compiles only DaisySP's state-variable-filter implementation into `daisy-filters.wasm`.

- Copyright: Electrosmith, Corp.
- Upstream: https://github.com/electro-smith/DaisySP
- License: MIT

The DaisySP repository is fetched into `vendor/daisysp/`. Sonus Umbrae keeps DaisySP DSP areas in separate WebAssembly modules so additional permissively licensed filter, effect, synthesis or utility modules can be added without forcing one monolithic DSP binary.

## Emscripten

Emscripten is a development tool used to compile C/C++ DSP code to WebAssembly and is not vendored in the Sonus Umbrae source repository.

- https://emscripten.org/
- https://github.com/emscripten-core/emscripten

## Node.js development dependencies

TypeScript, Vite and their transitive npm dependencies retain their own licenses. See `package-lock.json` and the corresponding upstream projects for authoritative versions and terms.

## Fonts

The UI may prefer locally installed fonts such as Departure Mono. Font binaries are not distributed by this repository.

## DSPark

DSPark is licensed under the MIT License. Copyright (c) Cristian Moresi. See the upstream `vendor/dspark/LICENSE` after running `npm run dsp:setup` for the complete license text retained with the fetched source.


<!-- SONUS-0.3.0-MARBLES-LICENSE -->
## Mutable Instruments Marbles / stmlib — Dices

Current use: selected random-voltage and lag-processing components for the Sonus `MOD dices` backend.

- Original author: Emilie Gillet / Mutable Instruments
- Upstream: https://github.com/pichenettes/eurorack
- Utility library: https://github.com/pichenettes/stmlib
- License of the source portions used by Sonus Umbrae: MIT

Sonus Umbrae does not expose the complete Marbles module. The Dices integration intentionally omits the T/gate section and Marbles' internal musical quantizer. Sonus supplies its own timing, routing, language, view and control abstractions around the selected random-voltage algorithms.
