# Building Sonus Umbrae

This document describes the current development setup. Sonus Umbrae is still pre-alpha, so the toolchain may change.

## Requirements

For the web application:

- Git
- Node.js 24 LTS
- npm

For building the current WebAssembly DSP engines (`VOICE`, `MOD`, `FX`, Matter, Resonator, and Sky):

- Emscripten SDK (`emsdk`)
- a C/C++ toolchain suitable for Emscripten

On macOS, `nvm` is recommended for managing Node.js.

## 1. Node.js

With `nvm`:

```bash
nvm install 24
nvm use 24
```

The repository includes `.nvmrc`, so after the initial installation you can normally run:

```bash
nvm use
```

Verify the tools:

```bash
node -v
npm -v
```

## 2. Install JavaScript dependencies

From the repository root:

```bash
npm install
```

## 3. Install Emscripten

A pinned `emsdk` installation is preferred over relying on a system-wide Emscripten package.

Example setup on macOS:

```bash
cd ~/Developer
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

The last command configures the current shell. Run it again in a new shell before building DSP code, unless you have configured `emsdk` permanently.

Verify:

```bash
em++ --version
```

## 4. Fetch the DSP sources

From the Sonus Umbrae repository:

```bash
npm run dsp:setup
```

This downloads the required upstream DSP sources under `vendor/`, including:

```text
vendor/eurorack/
vendor/superparasites/
vendor/cloudseed-core/
vendor/daisysp/
```

`cloudseed-core` is Ghost Note Audio's MIT-licensed CloudSeedCore algorithm used by the Sonus `sky` reverb. `daisysp` is Electrosmith's MIT-licensed DSP library; the current build uses only its SVF filter implementation. Vendor directories are intentionally ignored by Git and upstream source code is not copied into the Sonus Umbrae repository.

## 5. Build the WebAssembly DSP

Make sure the Emscripten environment is active, then run:

```bash
npm run dsp:build
```

The generated WASM artifacts are written to:

```text
public/dsp/voice.wasm
public/dsp/swell.wasm
public/dsp/mist.wasm
public/dsp/matter.wasm
public/dsp/resonator.wasm
public/dsp/sky.wasm
public/dsp/daisy-filters.wasm
```

`voice.wasm` provides the current macro-oscillator `VOICE` backend, `swell.wasm` provides the four-output modulation backend used by `MOD`, and `mist.wasm` provides the current Mist stereo `FX` backend. `sky.wasm` provides the ambient `sky` reverb backed by CloudSeedCore. `matter.wasm` and `resonator.wasm` provide the physical-model and resonator engines. `daisy-filters.wasm` is a separate DaisySP filter-area module; it currently contains only the SVF backend.

Generated WASM files are ignored by Git and should be rebuilt locally.

A warning about `PAGE_SIZE` being redefined by the upstream Plaits headers and the Emscripten sysroot may currently appear. If the build ends with:

```text
Built .../public/dsp/voice.wasm
```

then the build completed successfully.

## 6. Start the development server

```bash
npm run dev
```

The development server is intentionally fixed to:

```text
http://localhost:5173/
```

If port 5173 is already occupied, Vite exits instead of selecting another port.

To stop the server use `Ctrl+C`. Do not use `Ctrl+Z`, which suspends the process and leaves the port occupied.

To find a process using the development port:

```bash
lsof -i :5173
```

To terminate suspended Vite processes when needed:

```bash
pkill -f vite
```

## 7. Optional display font on macOS

The current interface is designed around Departure Mono. If it is not installed, the browser uses the configured monospace fallbacks.

With Homebrew:

```bash
brew install font-departure-mono
```

The font file itself is not distributed by this repository.

## Production web build

Build the TypeScript application and Vite bundle with:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Remember that the DSP WASM files must already have been generated with
`npm run dsp:build` before packaging or serving a complete build.

## Clean setup summary

On a new development machine, the typical sequence is:

```bash
nvm use
npm install
source ~/Developer/emsdk/emsdk_env.sh
npm run dsp:setup
npm run dsp:build
npm run dev
```


## Mist / Clouds isolated harness

The Mist/Clouds backend also has an isolated harness that can be used when
changing or debugging the DSP independently of the realtime `FX` integration:

```bash
npm run dsp:setup
npm run mist:harness:build
npm run dev
```

Then open:

```text
http://localhost:5173/mist-harness.html
```

The harness runs two tests on the main browser thread, with no `AudioWorklet` and no Sonus Umbrae runtime:

1. Clouds' own `bypass` path must copy a 32-frame stereo block exactly.
2. The granular engine receives four seconds of a 220 Hz test signal at Clouds' native 32 kHz sample rate. The test passes only if the wet output becomes non-zero.

Both tests should pass before changing or publishing a rebuilt Mist backend.


### SuperParasites and modern Clang

The upstream SuperParasites sources contain a few aggregate initializers that use `0.0f` for boolean fields. Modern Clang/Emscripten diagnoses these as C++11 narrowing errors, while the original embedded toolchain accepted them.

The Sonus Umbrae SuperParasites build therefore uses `-Wno-c++11-narrowing` for that backend only. Upstream files under `vendor/superparasites` are left untouched.


SuperParasites uses an older CMSIS layout in which the Cortex core headers live under `CMSIS/Include`, while `arm_math.h` lives under `CMSIS/DSP_Lib/Include`. Both paths are required when building with modern Emscripten. The SuperParasites backend also defines `ARM_MATH_CM4`, matching the original Cortex-M4 target expected by that version of CMSIS.


The SuperParasites `stmlib` checkout pinned at `8ab2aaee77cbacb47b646d46d22ee5d358effe2d` uses the older CMSIS layout. For the STM32F4 target, both `arm_math.h` and `core_cm4.h` are under:

```text
stmlib/third_party/STM/CMSIS/CM3_f4xx
```

The SuperParasites Emscripten build therefore includes that directory directly.


### SuperParasites WASM FFT

Do not compile the legacy ARM CMSIS-DSP sources for the WebAssembly backend. They contain Cortex-M inline assembly and register constraints that cannot target `wasm32`.

SuperParasites' phase vocoder already uses `stmlib/fft/shy_fft.h`, a portable C++ real FFT implementation. The Mist WASM build therefore compiles the SuperParasites DSP and required `stmlib` C++ sources only, without CMSIS `CommonTables` or `TransformFunctions`.

## Matter / Elements WebAssembly backend

`matter.wasm` compiles the original Mutable Instruments Elements DSP into a separate WebAssembly module. Elements retains its native 32 kHz, 16-frame processing contract; `public/worklets/matter-processor.js` performs host-rate linear resampling inside the AudioWorklet so the upstream DSP itself remains unchanged.

The normal DSP build is sufficient:

```bash
npm run dsp:setup
npm run dsp:build
```

The runtime loads the module automatically when a program declares `SOUND matter`. Matter DRIVE envelopes run in the AudioWorklet while all explicit `EVERY` trigger events remain registered on the runtime's single global scheduler. No separate Matter test page is part of the application.


## Resonator / Rings WebAssembly backend

`resonator.wasm` compiles the original Mutable Instruments Rings DSP from
`vendor/eurorack/rings/` into a separate WebAssembly module. The bridge uses
`rings::Part`, preserving the original three primary resonator models, the
1/2/4-voice polyphony allocator, internal strum/exciter path, mono external
input, and MAIN/AUX output pair.

Rings runs natively at 48 kHz in 24-frame blocks.
`public/worklets/resonator-processor.js` adapts host AudioWorklet quantum sizes
and resamples only when the host sample rate differs from 48 kHz; the upstream
DSP code is left unchanged.

Build it with the other DSP targets:

```bash
npm run dsp:setup
npm run dsp:build
```

The runtime loads `/dsp/resonator.wasm` automatically when a program contains a
`SOUND resonator.*` voice.


## Sky / CloudSeedCore WebAssembly backend

`sky.wasm` compiles Ghost Note Audio's MIT-licensed CloudSeedCore reverb into a dedicated WebAssembly module. `npm run dsp:setup` fetches the upstream source into `vendor/cloudseed-core/`.

The Sonus bridge exposes an ambient-oriented macro surface over CloudSeedCore's diffusion and late-field network: `SIZE`, `DECAY`, `DAMP`, `BLOOM`, `PREDELAY`, `MOTION`, `WIDTH`, `MIX`, and `FREEZE`. `BLOOM` drives the early/late diffusion stages together so higher values build a denser field more gradually.

Build with the normal DSP command:

```bash
npm run dsp:setup
npm run dsp:build
```

The runtime loads `/dsp/sky.wasm` automatically when an `FX` declares `MODEL sky`.


## DaisySP filter WebAssembly module

`daisy-filters.wasm` is the first Sonus DSP-area module backed by Electrosmith DaisySP. `npm run dsp:setup` fetches DaisySP into `vendor/daisysp/`; the current build compiles only `Source/Filters/svf.cpp` plus the Sonus bridge.

The module is deliberately separate from future DaisySP areas. Additional permissively licensed DaisySP effects, synthesis or utility code can later be built into their own WASM modules rather than growing one monolithic binary.

The DaisySP SVF computes low, high, band, notch and peak responses simultaneously. Sonus currently exposes the four canonical routing ports `lp`, `hp`, `bp`, and `np`; `lp` is the default FILTER output. The peak response remains internal to the backend for now.

`npm run dsp:build` also removes a stale legacy `public/dsp/liquid.wasm` artifact if one exists from an older checkout.
