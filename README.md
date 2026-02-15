# chrome-json-formtr

A Chrome extension that automatically detects and formats raw JSON responses with syntax highlighting and customizable themes.

**Keyboard shortcut:** <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> (or <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> on Mac) to toggle between raw and formatted JSON views.

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
