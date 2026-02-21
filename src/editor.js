/**
 * CodeEditor — High-Performance Code Editor with Advanced Keyboard Event Handling
 * 
 * Handles: undo/redo, shortcuts, IME composition, debounced highlighting,
 * chord shortcuts, event logging, and cross-platform modifier support.
 */

class CodeEditor {
    constructor() {
        // DOM elements
        this.editorInput = document.getElementById('editor-input');
        this.eventLogList = document.getElementById('event-log-list');
        this.lineNumbers = document.getElementById('line-numbers');
        this.chordIndicator = document.getElementById('chord-indicator');
        this.saveIndicator = document.getElementById('save-indicator');
        this.historyCountEl = document.getElementById('history-count');
        this.highlightCountEl = document.getElementById('highlight-count');
        this.lineCountEl = document.getElementById('line-count');
        this.cursorPositionEl = document.getElementById('cursor-position');

        // State
        this.content = '';
        this.undoStack = [];
        this.redoStack = [];
        this.isComposing = false;
        this.highlightCallCount = 0;
        this.debounceTimer = null;
        this.debounceDelay = 200; // ms

        // Chord state
        this.chordPending = false;
        this.chordTimer = null;

        // Push initial state
        this.undoStack.push('');

        // Init
        this._bindEvents();
        this._updateLineNumbers();
        this._updateStats();
    }

    // ==========================================
    // Event Binding
    // ==========================================
    _bindEvents() {
        this.editorInput.addEventListener('keydown', this._onKeyDown.bind(this));
        this.editorInput.addEventListener('keyup', this._onKeyUp.bind(this));
        this.editorInput.addEventListener('input', this._onInput.bind(this));
        this.editorInput.addEventListener('compositionstart', this._onCompositionStart.bind(this));
        this.editorInput.addEventListener('compositionupdate', this._onCompositionUpdate.bind(this));
        this.editorInput.addEventListener('compositionend', this._onCompositionEnd.bind(this));
        this.editorInput.addEventListener('paste', this._onPaste.bind(this));

        // Toolbar buttons
        document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
        document.getElementById('btn-save')?.addEventListener('click', () => this._triggerSave());
        document.getElementById('btn-clear-log')?.addEventListener('click', () => this.clearLog());
    }

    // ==========================================
    // Helpers
    // ==========================================
    _isModifier(event) {
        return event.ctrlKey || event.metaKey;
    }

    _getContent() {
        return this.editorInput.innerText || '';
    }

    _setContent(text) {
        this.editorInput.textContent = text;
        this.content = text;
        this._scheduleHighlight();
        this._updateLineNumbers();
        this._updateStats();
    }

    _pushHistory(text) {
        // Only push if content actually changed
        if (this.undoStack[this.undoStack.length - 1] !== text) {
            this.undoStack.push(text);
            this.redoStack = [];
            this._updateStats();
        }
    }

    _updateStats() {
        const lines = (this.content || '').split('\n').length;
        if (this.historyCountEl) this.historyCountEl.textContent = this.undoStack.length;
        if (this.highlightCountEl) this.highlightCountEl.textContent = this.highlightCallCount;
        if (this.lineCountEl) this.lineCountEl.textContent = lines;
    }

    _updateLineNumbers() {
        const text = this._getContent();
        const lineCount = text.split('\n').length || 1;
        let html = '';
        for (let i = 1; i <= lineCount; i++) {
            html += `<span>${i}</span>`;
        }
        if (this.lineNumbers) this.lineNumbers.innerHTML = html;
    }

    // ==========================================
    // Cursor / Selection Helpers for contenteditable
    // ==========================================
    _getCursorInfo() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return { line: 0, col: 0, pos: 0 };

        const range = sel.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(this.editorInput);
        preRange.setEnd(range.startContainer, range.startOffset);
        const pos = preRange.toString().length;

        const textBefore = this._getContent().substring(0, pos);
        const lines = textBefore.split('\n');
        return {
            line: lines.length - 1,
            col: lines[lines.length - 1].length,
            pos: pos
        };
    }

    _setCursorPosition(pos) {
        const node = this.editorInput.firstChild;
        if (!node) return;

        const sel = window.getSelection();
        const range = document.createRange();

        // Walk through text nodes to find the right position
        let currentPos = 0;
        const walker = document.createTreeWalker(
            this.editorInput,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let textNode = walker.nextNode();
        while (textNode) {
            const nodeLen = textNode.textContent.length;
            if (currentPos + nodeLen >= pos) {
                range.setStart(textNode, pos - currentPos);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }
            currentPos += nodeLen;
            textNode = walker.nextNode();
        }

        // If pos is beyond content, set to end
        range.selectNodeContents(this.editorInput);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _getCurrentLineInfo() {
        const content = this._getContent();
        const cursorInfo = this._getCursorInfo();
        const lines = content.split('\n');
        const lineIndex = Math.min(cursorInfo.line, lines.length - 1);
        const lineText = lines[lineIndex] || '';

        // Calculate line start position
        let lineStartPos = 0;
        for (let i = 0; i < lineIndex; i++) {
            lineStartPos += lines[i].length + 1; // +1 for \n
        }

        return {
            lineIndex,
            lineText,
            lineStartPos,
            col: cursorInfo.col,
            pos: cursorInfo.pos,
            lines
        };
    }

    // ==========================================
    // Keyboard Event Handlers
    // ==========================================
    _onKeyDown(event) {
        // Log the event
        this._logEvent('keydown', event);

        // Don't handle shortcuts during IME composition
        if (this.isComposing) return;

        const isMod = this._isModifier(event);

        // --- Chord shortcut handling ---
        if (this.chordPending && isMod && event.key === 'c') {
            event.preventDefault();
            this._chordSuccess();
            return;
        }

        if (this.chordPending && !(isMod && event.key === 'c')) {
            // Any other key resets chord
            if (event.key !== 'Control' && event.key !== 'Meta') {
                this._resetChord();
            }
        }

        // --- Ctrl+K — start chord ---
        if (isMod && event.key === 'k') {
            event.preventDefault();
            this._startChord();
            return;
        }

        // --- Ctrl+S — Save ---
        if (isMod && event.key === 's') {
            event.preventDefault();
            this._triggerSave();
            return;
        }

        // --- Ctrl+Z — Undo ---
        if (isMod && !event.shiftKey && event.key === 'z') {
            event.preventDefault();
            this.undo();
            return;
        }

        // --- Ctrl+Shift+Z — Redo ---
        if (isMod && event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
            event.preventDefault();
            this.redo();
            return;
        }

        // --- Ctrl+/ — Toggle comment ---
        if (isMod && event.key === '/') {
            event.preventDefault();
            this._toggleComment();
            return;
        }

        // --- Tab — Indent ---
        if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            this._indent();
            return;
        }

        // --- Shift+Tab — Outdent ---
        if (event.key === 'Tab' && event.shiftKey) {
            event.preventDefault();
            this._outdent();
            return;
        }

        // --- Enter — Auto-indent ---
        if (event.key === 'Enter') {
            event.preventDefault();
            this._autoIndentEnter();
            return;
        }
    }

    _onKeyUp(event) {
        this._logEvent('keyup', event);
    }

    // ==========================================
    // Input Event (text changes, paste)
    // ==========================================
    _onInput(event) {
        if (this.isComposing) return;

        this._logInputEvent(event);

        const newContent = this._getContent();
        this.content = newContent;
        this._pushHistory(newContent);
        this._scheduleHighlight();
        this._updateLineNumbers();
        this._updateStats();
    }

    _onPaste(event) {
        event.preventDefault();
        const text = (event.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
    }

    // ==========================================
    // IME Composition Events
    // ==========================================
    _onCompositionStart(event) {
        this.isComposing = true;
        this._logCompositionEvent('compositionstart', event);
    }

    _onCompositionUpdate(event) {
        this._logCompositionEvent('compositionupdate', event);
    }

    _onCompositionEnd(event) {
        this.isComposing = false;
        this._logCompositionEvent('compositionend', event);

        // Process the final composed input
        const newContent = this._getContent();
        this.content = newContent;
        this._pushHistory(newContent);
        this._scheduleHighlight();
        this._updateLineNumbers();
        this._updateStats();
    }

    // ==========================================
    // Editor Actions
    // ==========================================
    _triggerSave() {
        this._logAction('Action: Save');

        // Visual feedback
        const indicator = this.saveIndicator;
        if (indicator) {
            indicator.classList.add('saving');
            const statusText = indicator.querySelector('.status-text');
            if (statusText) statusText.textContent = 'Saving...';

            setTimeout(() => {
                indicator.classList.remove('saving');
                if (statusText) statusText.textContent = 'Saved';
                setTimeout(() => {
                    if (statusText) statusText.textContent = 'Ready';
                }, 1500);
            }, 500);
        }
    }

    undo() {
        if (this.undoStack.length <= 1) return;

        const current = this.undoStack.pop();
        this.redoStack.push(current);
        const previous = this.undoStack[this.undoStack.length - 1];

        this._setContent(previous);
        this._setCursorPosition(previous.length);
        this._logAction('Action: Undo');
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const next = this.redoStack.pop();
        this.undoStack.push(next);

        this._setContent(next);
        this._setCursorPosition(next.length);
        this._logAction('Action: Redo');
    }

    _indent() {
        const info = this._getCurrentLineInfo();
        const lines = info.lines;
        lines[info.lineIndex] = '  ' + lines[info.lineIndex];
        const newContent = lines.join('\n');

        this._setContent(newContent);
        this.content = newContent;
        this._pushHistory(newContent);

        // Restore cursor position (shifted by 2)
        this._setCursorPosition(info.pos + 2);
    }

    _outdent() {
        const info = this._getCurrentLineInfo();
        const lines = info.lines;
        const currentLine = lines[info.lineIndex];

        if (currentLine.startsWith('  ')) {
            lines[info.lineIndex] = currentLine.substring(2);
            const newContent = lines.join('\n');

            this._setContent(newContent);
            this.content = newContent;
            this._pushHistory(newContent);

            // Restore cursor position (shifted back by 2)
            this._setCursorPosition(Math.max(info.pos - 2, info.lineStartPos));
        }
    }

    _toggleComment() {
        const info = this._getCurrentLineInfo();
        const lines = info.lines;
        const currentLine = lines[info.lineIndex];

        if (currentLine.startsWith('// ')) {
            // Remove comment
            lines[info.lineIndex] = currentLine.substring(3);
            const newContent = lines.join('\n');
            this._setContent(newContent);
            this.content = newContent;
            this._pushHistory(newContent);
            this._setCursorPosition(Math.max(info.pos - 3, info.lineStartPos));
        } else {
            // Add comment
            lines[info.lineIndex] = '// ' + currentLine;
            const newContent = lines.join('\n');
            this._setContent(newContent);
            this.content = newContent;
            this._pushHistory(newContent);
            this._setCursorPosition(info.pos + 3);
        }

        this._logAction('Action: Toggle Comment');
    }

    _autoIndentEnter() {
        const info = this._getCurrentLineInfo();
        const currentLine = info.lines[info.lineIndex];

        // Detect leading whitespace
        const match = currentLine.match(/^(\s*)/);
        const indent = match ? match[1] : '';

        // Insert newline + same indentation
        const before = this._getContent().substring(0, info.pos);
        const after = this._getContent().substring(info.pos);
        const newContent = before + '\n' + indent + after;

        this._setContent(newContent);
        this.content = newContent;
        this._pushHistory(newContent);

        // Place cursor after the indentation on the new line
        this._setCursorPosition(info.pos + 1 + indent.length);
    }

    // ==========================================
    // Chord Shortcut (Ctrl+K, Ctrl+C)
    // ==========================================
    _startChord() {
        this.chordPending = true;
        if (this.chordIndicator) {
            this.chordIndicator.textContent = 'Ctrl+K pressed — waiting for next key...';
        }

        this.chordTimer = setTimeout(() => {
            this._resetChord();
        }, 2000);

        this._logAction('Chord: Ctrl+K pressed (waiting...)');
    }

    _chordSuccess() {
        clearTimeout(this.chordTimer);
        this.chordPending = false;
        if (this.chordIndicator) {
            this.chordIndicator.textContent = '';
        }
        this._logAction('Action: Chord Success');
    }

    _resetChord() {
        clearTimeout(this.chordTimer);
        this.chordPending = false;
        if (this.chordIndicator) {
            this.chordIndicator.textContent = '';
        }
    }

    // ==========================================
    // Debounced Syntax Highlighting
    // ==========================================
    _scheduleHighlight() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this._performHighlight();
        }, this.debounceDelay);
    }

    _performHighlight() {
        // Simulated expensive syntax highlighting operation
        this.highlightCallCount++;
        this._updateStats();
    }

    // ==========================================
    // Event Logging
    // ==========================================
    _logEvent(type, event) {
        const modifiers = [];
        if (event.ctrlKey) modifiers.push('Ctrl');
        if (event.metaKey) modifiers.push('Cmd');
        if (event.shiftKey) modifiers.push('Shift');
        if (event.altKey) modifiers.push('Alt');

        const modStr = modifiers.length > 0 ? `[${modifiers.join('+')}] ` : '';
        const detail = `${modStr}key=<span class="key-name">${this._escapeHtml(event.key)}</span> code=${this._escapeHtml(event.code)}`;

        this._addLogEntry(type, detail);
    }

    _logInputEvent(event) {
        const detail = `inputType=${event.inputType || 'unknown'} data=<span class="key-name">${this._escapeHtml(event.data || '')}</span>`;
        this._addLogEntry('input', detail);
    }

    _logCompositionEvent(type, event) {
        const detail = `data=<span class="key-name">${this._escapeHtml(event.data || '')}</span>`;
        this._addLogEntry(type, detail);
    }

    _logAction(message) {
        this._addLogEntry('action', `<span class="key-name">${this._escapeHtml(message)}</span>`);
    }

    _addLogEntry(type, detailHtml) {
        const entry = document.createElement('div');
        entry.className = 'event-entry';
        entry.setAttribute('data-test-id', 'event-log-entry');

        const badgeClass = type.startsWith('composition') ? 'composition' : type;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;

        entry.innerHTML = `
            <span class="event-time">${timeStr}</span>
            <span class="event-badge ${badgeClass}">${this._escapeHtml(type)}</span>
            <span class="event-detail">${detailHtml}</span>
        `;

        // Add to top of list (newest first)
        if (this.eventLogList.firstChild) {
            this.eventLogList.insertBefore(entry, this.eventLogList.firstChild);
        } else {
            this.eventLogList.appendChild(entry);
        }

        // Cap log entries at 200
        while (this.eventLogList.children.length > 200) {
            this.eventLogList.removeChild(this.eventLogList.lastChild);
        }
    }

    _escapeHtml(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    clearLog() {
        if (this.eventLogList) {
            this.eventLogList.innerHTML = '';
        }
    }

    // ==========================================
    // Public API (exposed on window)
    // ==========================================
    getEditorState() {
        return {
            content: this._getContent(),
            historySize: this.undoStack.length
        };
    }

    getHighlightCallCount() {
        return this.highlightCallCount;
    }
}
