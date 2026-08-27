# Sonus Umbrae

Experimental browser-based live coding environment for sound.

## Development

Requirements: Node.js 22.x recommended.

```bash
npm install

# Recommended on macOS for the intended pixel rendering
brew install font-departure-mono

npm run dev
```

The development server uses `http://localhost:5173` and will fail instead of silently switching ports if that port is already in use.

## v0.0.2 controls

- Type directly in the main live editor.
- `Esc` opens command mode at the bottom of the display.
- `:config` opens the placeholder configuration screen.
- `:help` lists currently implemented commands.
- `:save [name]` saves the current source as a `.sum` text file.
- `:load` opens a text source file.
- `:new` / `:clear` clears the source.
- `Esc` leaves command/config/help mode and returns to live editing.

Audio and the Sonus Umbrae language are intentionally not implemented yet.


## Audio engine (0.0.2)

The first browser audio lifecycle is available through command mode:

- `:start` starts or resumes Web Audio.
- `:stop` suspends Web Audio.
- `:test` plays a 440 Hz diagnostic sine tone.
- `:test 220` changes the diagnostic frequency.
- `:test stop` stops the diagnostic tone.
- `:panic` immediately silences the current diagnostic audio.

This diagnostic oscillator uses native Web Audio nodes only. The Sonus Umbrae language, AudioWorklet graph and WASM DSP modules will be layered on top in later milestones.
