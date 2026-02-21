/**
 * High-Performance Code Editor
 * Core editor implementation with advanced keyboard event handling
 * 
 * Uses <textarea> for reliable cursor/selection management via
 * selectionStart/selectionEnd instead of contenteditable + Range API.
 */

class CodeEditor {
    constructor() {
        // DOM references
        this.editor = document.getElementById('editor-input');
        this.lineNumbers = document.getElementById('line-numbers');
        this.eventLog = document.getElementById('event-log-list');
        this.highlightCountEl = document.getElementById('highlight-count');
        this.historySizeEl = document.getElementById('history-size');
        this.eventCountEl = document.getElementById('event-count');
        this.chordIndicator = document.getElementById('chord-indicator');
        this.saveIndicator = document.getElementById('save-indicator');
        this.imeIndicator = document.getElementById('ime-indicator');

        // State management
        this.content = '';
        this.undoStack = [''];       // Initial empty state
        this.redoStack = [];
        this.highlightCallCount = 0;
        this.eventLogCount = 0;
        this.isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

        // IME composition state
        this.isComposing = false;

        // Chord shortcut state
        this.chordState = {
            active: false,
            timer: null,
            firstKey: null
        };

        // Debounce timer for syntax highlighting
        this.highlightDebounceTimer = null;
        this.DEBOUNCE_DELAY = 200; // ms

        // Initialize
        this.init();
    }

    init() {
        this.attachEventListeners();
        this.updatePlatformInfo();
        this.updateUI();
        this.exposeGlobalFunctions();
    }

    // ─────────────────────────────────────
    // Event Listeners
    // ─────────────────────────────────────

    attachEventListeners() {
        // Core keyboard events
        this.editor.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.editor.addEventListener('keyup', this.handleKeyUp.bind(this));

        // Input event for text changes (including paste)
        this.editor.addEventListener('input', this.handleInput.bind(this));

        // IME Composition events
        this.editor.addEventListener('compositionstart', this.handleCompositionStart.bind(this));
        this.editor.addEventListener('compositionupdate', this.handleCompositionUpdate.bind(this));
        this.editor.addEventListener('compositionend', this.handleCompositionEnd.bind(this));

        // Paste event logging
        this.editor.addEventListener('paste', this.handlePaste.bind(this));

        // UI Button handlers
        document.getElementById('save-btn').addEventListener('click', () => this.triggerSave());
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('redo-btn').addEventListener('click', () => this.redo());
        document.getElementById('clear-log-btn').addEventListener('click', () => this.clearEventLog());

        // Sync line numbers on scroll
        this.editor.addEventListener('scroll', () => {
            this.lineNumbers.scrollTop = this.editor.scrollTop;
        });
    }

    // ─────────────────────────────────────
    // Keyboard Event Handlers
    // ─────────────────────────────────────

    handleKeyDown(event) {
        const key = event.key;
        const ctrlKey = event.ctrlKey;
        const metaKey = event.metaKey;
        const shiftKey = event.shiftKey;
        // Support BOTH Ctrl and Meta for cross-platform (Req #11)
        const isModifier = ctrlKey || metaKey;

        // Log the keydown event
        this.logEvent('keydown', key, event);

        // ── Chord: check second key FIRST if chord is active ──
        if (this.chordState.active && isModifier && key === 'c') {
            event.preventDefault();
            this.handleChordComplete();
            return;
        }

        // Reset chord state on any non-chord key when chord is pending
        if (this.chordState.active && !(key === 'Control' || key === 'Meta' || key === 'Shift')) {
            this.resetChordState();
        }

        // ── Tab key for indentation ──
        if (key === 'Tab') {
            event.preventDefault();
            this.handleTab(shiftKey);
            return;
        }

        // ── Enter key with auto-indentation ──
        if (key === 'Enter' && !isModifier) {
            event.preventDefault();
            this.handleEnter();
            return;
        }

        // ── Shortcuts with modifier ──
        if (isModifier) {
            // Save: Ctrl/Cmd + S
            if (key === 's') {
                event.preventDefault();
                this.triggerSave();
                return;
            }

            // Redo: Ctrl/Cmd + Shift + Z  (check before Undo)
            if (key === 'z' && shiftKey) {
                event.preventDefault();
                this.redo();
                return;
            }

            // Undo: Ctrl/Cmd + Z
            if (key === 'z' && !shiftKey) {
                event.preventDefault();
                this.undo();
                return;
            }

            // Redo alternative: Ctrl/Cmd + Y
            if (key === 'y') {
                event.preventDefault();
                this.redo();
                return;
            }

            // Toggle comment: Ctrl/Cmd + /
            if (key === '/') {
                event.preventDefault();
                this.toggleComment();
                return;
            }

            // Chord start: Ctrl/Cmd + K
            if (key === 'k') {
                event.preventDefault();
                this.handleChordStart('k');
                return;
            }
        }
    }

    handleKeyUp(event) {
        this.logEvent('keyup', event.key, event);
    }

    // ─────────────────────────────────────
    // Input Handling
    // ─────────────────────────────────────

    handleInput(event) {
        if (this.isComposing) return;

        const newContent = this.editor.value;

        // Only record state if content actually changed
        if (newContent !== this.content) {
            this.content = newContent;
            this.pushUndoState(this.content);
            this.updateLineNumbers();
            this.debouncedHighlight();
        }

        this.logEvent('input', event.inputType || 'text change', event);
    }

    handlePaste(event) {
        this.logEvent('paste', 'content pasted', event);
        // The 'input' event fires after paste and handles state saving
    }

    // ─────────────────────────────────────
    // IME Composition
    // ─────────────────────────────────────

    handleCompositionStart(event) {
        this.isComposing = true;
        this.setIndicator(this.imeIndicator, 'warning');
        this.logEvent('compositionstart', 'IME start', event);
    }

    handleCompositionUpdate(event) {
        this.logEvent('compositionupdate', event.data || 'IME update', event);
    }

    handleCompositionEnd(event) {
        this.isComposing = false;
        this.setIndicator(this.imeIndicator, false);
        this.logEvent('compositionend', event.data || 'IME end', event);

        // Handle the final composed text
        const newContent = this.editor.value;
        if (newContent !== this.content) {
            this.content = newContent;
            this.pushUndoState(this.content);
            this.updateLineNumbers();
            this.debouncedHighlight();
        }
    }

    // ─────────────────────────────────────
    // Tab Indentation (Req #4)
    // ─────────────────────────────────────

    handleTab(shiftKey) {
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const value = this.editor.value;

        // Find the start of the current line
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        // Find the end of the current line
        let lineEnd = value.indexOf('\n', start);
        if (lineEnd === -1) lineEnd = value.length;

        const currentLine = value.substring(lineStart, lineEnd);

        if (shiftKey) {
            // Outdent: remove up to 2 spaces from start of line
            if (currentLine.startsWith('  ')) {
                const newValue = value.substring(0, lineStart) + currentLine.substring(2) + value.substring(lineEnd);
                this.editor.value = newValue;
                // Adjust cursor
                const newCursorPos = Math.max(lineStart, start - 2);
                this.editor.selectionStart = newCursorPos;
                this.editor.selectionEnd = newCursorPos;
            }
        } else {
            // Indent: add 2 spaces at start of line
            const newValue = value.substring(0, lineStart) + '  ' + currentLine + value.substring(lineEnd);
            this.editor.value = newValue;
            // Move cursor forward by 2
            this.editor.selectionStart = start + 2;
            this.editor.selectionEnd = start + 2;
        }

        this.content = this.editor.value;
        this.pushUndoState(this.content);
        this.updateLineNumbers();

        // Focus MUST remain on editor
        this.editor.focus();
    }

    // ─────────────────────────────────────
    // Enter with Auto-Indentation (Req #5)
    // ─────────────────────────────────────

    handleEnter() {
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const value = this.editor.value;

        // Find the start of the current line
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = value.indexOf('\n', start);
        const currentLine = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);

        // Get the leading whitespace
        const indentMatch = currentLine.match(/^(\s*)/);
        const indentation = indentMatch ? indentMatch[1] : '';

        // Insert newline + same indentation
        const insertion = '\n' + indentation;
        const newValue = value.substring(0, start) + insertion + value.substring(end);
        this.editor.value = newValue;

        // Place cursor after the indentation on the new line
        const newCursorPos = start + insertion.length;
        this.editor.selectionStart = newCursorPos;
        this.editor.selectionEnd = newCursorPos;

        this.content = this.editor.value;
        this.pushUndoState(this.content);
        this.updateLineNumbers();
    }

    // ─────────────────────────────────────
    // Chord Shortcut (Req #8)
    // ─────────────────────────────────────

    handleChordStart(key) {
        this.resetChordState();

        this.chordState.active = true;
        this.chordState.firstKey = key;

        // Visual feedback
        this.setIndicator(this.chordIndicator, 'warning');

        // 2-second timeout
        this.chordState.timer = setTimeout(() => {
            this.resetChordState();
            this.logEvent('action', 'Chord timed out', null);
        }, 2000);

        this.logEvent('action', 'Chord started: Ctrl/Cmd+K (waiting for Ctrl/Cmd+C)', null);
    }

    handleChordComplete() {
        if (this.chordState.active) {
            clearTimeout(this.chordState.timer);
            this.setIndicator(this.chordIndicator, 'active');
            this.logEvent('action', 'Action: Chord Success', null);

            // Reset after a brief flash
            setTimeout(() => {
                this.setIndicator(this.chordIndicator, false);
            }, 1500);

            this.chordState.active = false;
            this.chordState.firstKey = null;
            this.chordState.timer = null;
        }
    }

    resetChordState() {
        if (this.chordState.timer) {
            clearTimeout(this.chordState.timer);
        }
        this.chordState.active = false;
        this.chordState.firstKey = null;
        this.chordState.timer = null;
        this.setIndicator(this.chordIndicator, false);
    }

    // ─────────────────────────────────────
    // Save (Req #3)
    // ─────────────────────────────────────

    triggerSave() {
        this.logEvent('action', 'Action: Save', null);

        // Visual feedback
        this.setIndicator(this.saveIndicator, 'active');
        this.editor.classList.add('save-flash');
        setTimeout(() => {
            this.editor.classList.remove('save-flash');
            // Keep save indicator active for a moment
            setTimeout(() => {
                this.setIndicator(this.saveIndicator, false);
            }, 2000);
        }, 600);
    }

    // ─────────────────────────────────────
    // Toggle Comment (Req #7)
    // ─────────────────────────────────────

    toggleComment() {
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const value = this.editor.value;

        // Find the start of the current line
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = value.indexOf('\n', start);
        if (lineEnd === -1) lineEnd = value.length;

        const currentLine = value.substring(lineStart, lineEnd);
        const commentPrefix = '// ';

        let newLine;
        let cursorAdjust;

        if (currentLine.startsWith(commentPrefix)) {
            // Uncomment: remove "// "
            newLine = currentLine.substring(commentPrefix.length);
            cursorAdjust = -commentPrefix.length;
        } else {
            // Comment: add "// "
            newLine = commentPrefix + currentLine;
            cursorAdjust = commentPrefix.length;
        }

        const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
        this.editor.value = newValue;

        // Adjust cursor position
        const newCursorPos = Math.max(lineStart, start + cursorAdjust);
        this.editor.selectionStart = newCursorPos;
        this.editor.selectionEnd = newCursorPos;

        this.content = this.editor.value;
        this.pushUndoState(this.content);
        this.updateLineNumbers();
        this.logEvent('action', 'Toggle comment', null);
    }

    // ─────────────────────────────────────
    // Undo/Redo State Management (Req #6)
    // ─────────────────────────────────────

    /**
     * Push a new content state onto the undo stack.
     * Clears the redo stack since a new action was taken.
     */
    pushUndoState(content) {
        // Avoid duplicate consecutive states
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === content) {
            return;
        }
        this.undoStack.push(content);
        this.redoStack = [];
        this.updateHistorySize();
    }

    undo() {
        if (this.undoStack.length > 1) {
            const currentState = this.undoStack.pop();
            this.redoStack.push(currentState);

            const previousState = this.undoStack[this.undoStack.length - 1];
            this.content = previousState;
            this.editor.value = this.content;

            this.updateUI();
            this.logEvent('action', 'Undo performed', null);
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            const nextState = this.redoStack.pop();
            this.undoStack.push(nextState);
            this.content = nextState;
            this.editor.value = this.content;

            this.updateUI();
            this.logEvent('action', 'Redo performed', null);
        }
    }

    // ─────────────────────────────────────
    // Debounced Syntax Highlighting (Req #10)
    // ─────────────────────────────────────

    debouncedHighlight() {
        clearTimeout(this.highlightDebounceTimer);
        this.highlightDebounceTimer = setTimeout(() => {
            this.performHighlight();
        }, this.DEBOUNCE_DELAY);
    }

    performHighlight() {
        this.highlightCallCount++;
        this.highlightCountEl.textContent = this.highlightCallCount;
        // In a real editor, this would apply syntax highlighting tokens
        console.log(`[Editor] Syntax highlighting #${this.highlightCallCount}`);
    }

    // ─────────────────────────────────────
    // UI Updates
    // ─────────────────────────────────────

    updateLineNumbers() {
        const content = this.editor.value;
        const lineCount = content.split('\n').length;
        let html = '';
        for (let i = 1; i <= lineCount; i++) {
            html += i + '\n';
        }
        this.lineNumbers.textContent = html;
    }

    updateUI() {
        this.updateLineNumbers();
        this.updateHistorySize();
    }

    updateHistorySize() {
        this.historySizeEl.textContent = this.undoStack.length;
    }

    updatePlatformInfo() {
        const platformInfo = document.getElementById('platform-info');
        if (this.isMac) {
            platformInfo.textContent = '⌘ macOS';
        } else {
            platformInfo.textContent = '⌃ Windows/Linux';
        }
    }

    setIndicator(el, state) {
        if (!el) return;
        el.classList.remove('active', 'warning');
        if (state === 'active') {
            el.classList.add('active');
        } else if (state === 'warning') {
            el.classList.add('warning');
        }
    }

    // ─────────────────────────────────────
    // Event Logging (Req #2)
    // ─────────────────────────────────────

    logEvent(type, key, event) {
        const entry = document.createElement('li');
        entry.className = 'event-log-item';
        entry.setAttribute('data-test-id', 'event-log-entry');
        entry.setAttribute('data-event-type', type);

        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });

        // Build modifier string
        let details = '';
        if (event && event instanceof Event) {
            const modifiers = [];
            if (event.ctrlKey) modifiers.push('Ctrl');
            if (event.metaKey) modifiers.push('⌘');
            if (event.shiftKey) modifiers.push('Shift');
            if (event.altKey) modifiers.push('Alt');
            if (modifiers.length > 0) {
                details = ` [${modifiers.join('+')}]`;
            }
        }

        // Always include the event type in the text (Req #2 verification)
        entry.textContent = `[${timestamp}] ${type}: ${key}${details}`;

        this.eventLog.appendChild(entry);

        // Auto-scroll to bottom
        const container = this.eventLog.parentElement;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }

        // Update event count
        this.eventLogCount++;
        if (this.eventCountEl) {
            this.eventCountEl.textContent = this.eventLogCount;
        }

        // Limit log entries to prevent memory issues
        while (this.eventLog.children.length > 200) {
            this.eventLog.removeChild(this.eventLog.firstChild);
        }
    }

    clearEventLog() {
        this.eventLog.innerHTML = '';
        this.eventLogCount = 0;
        if (this.eventCountEl) {
            this.eventCountEl.textContent = '0';
        }
    }

    // ─────────────────────────────────────
    // Global Function Exposure (Req #6, #10)
    // ─────────────────────────────────────

    exposeGlobalFunctions() {
        /**
         * Returns { content: string, historySize: number }
         */
        window.getEditorState = () => {
            return {
                content: this.editor.value,
                historySize: this.undoStack.length
            };
        };

        /**
         * Returns the number of times syntax highlighting has been executed.
         */
        window.getHighlightCallCount = () => {
            return this.highlightCallCount;
        };

        // Expose editor instance for debugging
        window.editor = this;
    }
}

// Initialize editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new CodeEditor();
});