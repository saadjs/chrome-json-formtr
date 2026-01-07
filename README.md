# chrome-json-formtr

A Chrome extension that automatically detects and formats raw JSON responses with syntax highlighting and customizable themes.

## Project Structure

```
src/
├── background.ts      # Service worker for extension lifecycle
├── content_script.ts  # Main formatting logic and DOM manipulation
├── options.ts         # Settings page functionality
├── themes.ts          # Theme definitions and styling
└── content_script.css # Base styles for formatted JSON

public/
├── manifest.json
├── options.html       # Settings page UI
└── options.css        # Settings page styles
```

## Development

```bash
pnpm install          # Install dependencies
pnpm run dev          # Watch mode for development
pnpm run build        # Build for prod
pnpm run build:zip    # Create distributable zip file
```

## Linkify examples

Strings containing URLs are auto-linked, with safe trimming of trailing punctuation.

```json
{
  "single": "https://example.com/path",
  "embedded": "Docs: https://example.com/docs?ref=readme",
  "wrapped": "(https://example.com/path)",
  "balanced": "https://example.com/path()",
  "trailing": "https://example.com/path),",
  "email": "mailto:test@example.com?subject=Hi!",
  "broken": "http://localhost: 8000/long-string"
}
```
