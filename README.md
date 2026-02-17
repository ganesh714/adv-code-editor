# High-Performance Code Editor

A browser-based code editor with VS Code-style keyboard shortcuts, real-time event debugging, and advanced state management.

## Features

- ✨ VS Code-style keyboard shortcuts
- 📊 Real-time event debugging dashboard
- ↩️ Undo/Redo history stack
- 🔤 IME composition support for East Asian languages
- ⚡ Debounced syntax highlighting
- 🎯 Tab indentation/outdentation
- 💬 Line commenting (//)
- 🔗 Two-key chord shortcuts (Ctrl+K, Ctrl+C)
- 🖥️ Cross-platform support (macOS/Windows/Linux)
- 🐳 Docker containerization

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Tab` | Indent (2 spaces) |
| `Shift + Tab` | Outdent |
| `Ctrl/Cmd + /` | Toggle line comment |
| `Ctrl/Cmd + K, Ctrl/Cmd + C` | Chord shortcut |

## Quick Start

### Using Docker (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/ganesh714/adv-code-editor
   cd code-editor
   ```

2. Create environment file:
   ```bash
   cp .env.example .env
   ```

3. Build and run with Docker Compose:
   ```bash
   docker-compose up --build
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Access the application at `http://localhost:3000`

## Testing the Features

### Event Dashboard
The right panel shows real-time logs of all keyboard events:
- `keydown` events with modifier keys
- `keyup` events
- `input` events for text changes
- IME composition events
- Action events (save, undo, redo, comments, chords)

### Undo/Redo History
Type some text and use `Ctrl/Cmd+Z` to undo, `Ctrl/Cmd+Shift+Z` to redo. The history size is displayed in the stats panel.

### Indentation
Press `Tab` to indent a line, `Shift+Tab` to outdent. The editor maintains focus.

### Line Comments
Press `Ctrl/Cmd+/` to toggle `//` comments on the current line.

### Chord Shortcut
Press `Ctrl/Cmd+K` then `Ctrl/Cmd+C` within 2 seconds to trigger the chord success action.

### Debounced Highlighting
Type rapidly - the syntax highlighting counter will only increment once after you stop typing.

## Architecture

The editor is built with a modular architecture:

- **CodeEditor Class**: Core editor logic and event handling
- **State Management**: Undo/redo stacks for history
- **Event Logging**: Real-time debugging dashboard
- **IME Support**: Proper composition event handling
- **Debouncing**: Performance optimization for expensive operations

## Testing Verification

The application exposes global functions for automated testing:

```javascript
// Get current editor state
window.getEditorState(); // Returns { content: string, historySize: number }

// Get syntax highlighting call count
window.getHighlightCallCount(); // Returns number
```

## Docker Configuration

The project includes full containerization:

- Multi-stage Dockerfile for optimal image size
- Docker Compose with health checks
- Volume mounts for development
- Environment variable configuration

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Works with IMEs for Japanese, Chinese, Korean

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request
