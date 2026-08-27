# Sonus Umbrae

Experimental browser-based live coding environment for sound.

## Development

Requirements: Node.js 22.x recommended.

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## v0.0.1 controls

- Type directly in the main live editor.
- `Esc` opens command mode at the bottom of the display.
- `:config` opens the placeholder configuration screen.
- `:help` lists currently implemented commands.
- `:save [name]` saves the current source as a `.su` text file.
- `:load` opens a text source file.
- `:new` / `:clear` clears the source.
- `Esc` leaves command/config/help mode and returns to live editing.

Audio and the Sonus Umbrae language are intentionally not implemented yet.
