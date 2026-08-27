# Building Sonus Umbrae

This document describes the current development setup. Sonus Umbrae is still pre-alpha, so the toolchain may change.

## Requirements

For the web application:

- Git
- Node.js 24 LTS
- npm

For building the current `Voice()` DSP engine:

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

This downloads the upstream Mutable Instruments Eurorack repository and its required `stmlib` submodule under:

```text
vendor/eurorack/
```

The vendor directory is intentionally ignored by Git. Upstream source code is not copied into the Sonus Umbrae repository.

## 5. Build the WebAssembly DSP

Make sure the Emscripten environment is active, then run:

```bash
npm run dsp:build
```

The generated WASM artifact is written to:

```text
public/dsp/voice.wasm
public/dsp/swell.wasm
```

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

Remember that the DSP WASM must already have been generated with `npm run dsp:build` before packaging or serving a complete build.

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
