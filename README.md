# Sonus Umbrae

Experimental browser-based live coding environment for sound.

## Development

Requirements: Node.js 24 LTS recommended.

```bash
npm install

# Recommended on macOS for the intended pixel rendering
brew install font-departure-mono

npm run dev
```

The development server uses `http://localhost:5173` and will fail instead of silently switching ports if that port is already in use.

## v0.0.3 controls

- Type directly in the main live editor.
- `Esc` opens command mode at the bottom of the display.
- `Enter` evaluates the current line or selected source (`Ctrl+Enter` is also accepted).
- `Cmd+Enter` evaluates the entire source buffer.
- `:config` opens the placeholder configuration screen.
- `:help` lists currently implemented commands.
- `:save [name]` saves the current source as a `.sum` text file.
- `:load` opens a text source file.
- `:new` / `:clear` clears the source.
- `Esc` leaves command/config/help mode and returns to live editing.

## Audio engine

- `:start` starts or resumes Web Audio.
- `:stop` suspends Web Audio.
- `:test` plays a 440 Hz diagnostic sine tone.
- `:test 220` changes the diagnostic frequency.
- `:test stop` stops the diagnostic tone.
- `:panic` immediately silences current audio.

## First Sonus Umbrae language primitives

The 0.0.3 runtime deliberately starts with one native Web Audio oscillator so the live language and routing model can be validated before adding external DSP engines.

```text
a = osc()
a.freq(440)
a.out -> out.main
```

While the engine is running, changing and evaluating:

```text
a.freq(220)
```

updates the oscillator without rebuilding it.

MIDI-style note numbers are also accepted:

```text
a.note(60)
```

Per-connection output gain uses the same syntax planned for future modules:

```text
a.out(40) -> out.main
```

Re-evaluating `a = osc()` is idempotent: the existing live object is preserved rather than duplicated.

This oscillator still uses native Web Audio nodes. AudioWorklet and WASM DSP modules will be added after the language/runtime contract is stable enough to support them.
