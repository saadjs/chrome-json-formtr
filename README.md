# chrome-json-formtr

A Chrome extension that automatically detects and formats raw JSON responses with syntax highlighting and customizable themes.

**Keyboard shortcut:** <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> (or <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> on Mac) to toggle between raw and formatted JSON views.

## Features

- Syntax highlighting with 11 built-in themes
- Collapsible sections with element counts (e.g. `// 3 keys`, `// 12 items`)
- Sort keys alphabetically (A-Z toggle)
- Byte size and line count display
- Copy formatted JSON, download as file
- URL detection and linkification inside string values
- Smart copy: copies underlying text even when sections are folded

## Project Structure

```
src/
├── background.ts      # Service worker for extension lifecycle
├── content_script.ts  # Main formatting logic and DOM manipulation
├── options.ts         # Settings page functionality
├── popup.ts           # Popup UI logic
├── themes.ts          # Theme definitions and styling
├── fold_copy.ts       # Folding and copy utilities
├── content_script.css # Base styles for formatted JSON
└── vite-env.d.ts      # Vite environment types

public/
├── manifest.json      # Chrome extension manifest
├── options.html       # Settings page UI
├── popup.html         # Popup UI
└── options.css        # Settings page styles
```

## Installation

### From Source (Development)

```bash
pnpm install          # Install dependencies
pnpm run build        # Build extension
```

Then load the `dist/` folder as an unpacked extension in Chrome.

### From Distribution

```bash
pnpm run build:zip    # Create json-formtr.zip for distribution
```

## Development

```bash
pnpm run dev          # Watch mode for development
pnpm run lint         # Lint TypeScript files
pnpm run format       # Format code with Prettier
pnpm run typecheck    # Type check without emitting
```

## License

[MIT](LICENSE) © 2025 Saad Bash
