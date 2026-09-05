# Third-party notices

## Ghost Note Audio CloudSeedCore

The Sonus Umbrae `sky` reverb uses the CloudSeedCore reverb algorithm by **Ghost Note Audio / Ghost Note Engineering Ltd**, distributed under the MIT License. Upstream license notice: **Copyright (c) 2024 Ghost Note Audio**.

Upstream: https://github.com/GhostNoteAudio/CloudSeedCore

Ghost Note Audio is the original author of the CloudSeedCore code used by this backend. The upstream project permits free and commercial use and requests attribution to Ghost Note Audio. Sonus Umbrae exposes the algorithm under the model name `sky`. Sonus Umbrae is an independent project and is **not created by, sponsored by, or affiliated with Ghost Note Audio**. Any reference to “Cloud Seed” in project documentation refers to the upstream algorithm and must not imply otherwise.

## Electrosmith DaisySP

The Sonus Umbrae `svf` filter backend uses DaisySP code by **Electrosmith, Corp.**, distributed under the MIT License.

Upstream: https://github.com/electro-smith/DaisySP

The current `daisy-filters.wasm` build uses DaisySP's double-sampled stable state-variable filter implementation. Sonus Umbrae currently exposes the simultaneous low-pass, high-pass, band-pass and notch responses as `lp`, `hp`, `bp` and `np`; DaisySP's peak response remains internal to the backend.

## Mutable Instruments STM32F DSP

Selected Sonus synthesis and modulation engines are derived from MIT-licensed STM32F DSP code by **Emilie Gillet / Mutable Instruments**, including DSP from Plaits, Elements, Rings and Tides 2018.

Upstream: https://github.com/pichenettes/eurorack

Mutable Instruments is a registered trademark. Sonus Umbrae is independent and is not affiliated with or endorsed by Mutable Instruments.

## SuperParasites

The `mist.*` FX family uses MIT-licensed STM32F DSP from **Patrick Dowling's SuperParasites** project and its permissively licensed upstream lineage.

Upstream: https://github.com/patrickdowling/superparasites

## DSPark

The creative delay uses DSPark by Cristian Moresi as its forward delay DSP core. DSPark is distributed under the MIT License. The build setup fetches the upstream v1.7.0 source from https://github.com/CristianMoresi/DSPark. Sonus Umbrae adds its own multi-line routing and reverse-window processing layer around that core.

## Mutable Instruments Marbles random-voltage core

Sonus Umbrae uses selected MIT-licensed Marbles random-voltage components for the `MOD dices` backend. Original code copyright Emilie Gillet. The Sonus integration intentionally omits the Marbles T/gate section and musical quantizer.
