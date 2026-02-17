/**
 * High-Performance Code Editor
 * Core editor implementation with advanced keyboard event handling
 */

class CodeEditor {
    constructor() {
        this.editor = document.getElementById('editor-input');
        this.lineNumbers = document.getElementById('line-numbers');
        this.eventLog = document.getElementById('event-log-list');
        this.highlightCount = document.getElementById('highlight-count');
        this.historySize = document.getElementById('history-size');
        
        // State management
        this.content = '';
        this.undoStack = [];
        this.redoStack = [];
        this.highlightCallCount = 0;
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
        this.DEBOUNCE_DELAY = 150;
        
        // Initialize
        this.init();
    }
    
    init() {
        this.loadInitialState();
        this.attachEventListeners();
        this.updatePlatformInfo();
        this.exposeGlobalFunctions();
    }
    
    loadInitialState() {
        this.saveState();
    }
    
    attachEventListeners() {
        // Keyboard events
        this.editor.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.editor.addEventListener('keyup', this.handleKeyUp.bind(this));
        
        // Input event for text changes
        this.editor.addEventListener('input', this.handleInput.bind(this));
        
        // IME Composition events
        this.editor.addEventListener('compositionstart', this.handleCompositionStart.bind(this));
        this.editor.addEventListener('compositionupdate', this.handleCompositionUpdate.bind(this));
        this.editor.addEventListener('compositionend', this.handleCompositionEnd.bind(this));
        
        // Paste event
        this.editor.addEventListener('paste', this.handlePaste.bind(this));
        
        // Button handlers
        document.getElementById('save-btn').addEventListener('click', () => this.triggerSave());
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('redo-btn').addEventListener('click', () => this.redo());
        document.getElementById('clear-log-btn').addEventListener('click', () => this.clearEventLog());
    }
    
    handleKeyDown(event) {
        const key = event.key;
        const ctrlKey = event.ctrlKey;
        const metaKey = event.metaKey;
        const shiftKey = event.shiftKey;
        const isModifier = this.isMac ? metaKey : ctrlKey;
        
        // Log the event
        this.logEvent('keydown', key, event);
        
        // Handle Tab key for indentation
        if (key === 'Tab') {
            event.preventDefault();
            this.handleTab(shiftKey);
            return;
        }
        
        // Handle Enter key with indentation
        if (key === 'Enter') {
            event.preventDefault();
            this.handleEnter();
            return;
        }
        
        // Handle shortcuts with modifiers
        if (isModifier) {
            // Save: Ctrl/Cmd + S
            if (key === 's') {
                event.preventDefault();
                this.triggerSave();
                return;
            }
            
            // Undo: Ctrl/Cmd + Z
            if (key === 'z' && !shiftKey) {
                event.preventDefault();
                this.undo();
                return;
            }
            
            // Redo: Ctrl/Cmd + Shift + Z
            if (key === 'z' && shiftKey) {
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
            
            // Chord shortcut: Ctrl/Cmd + K
            if (key === 'k') {
                event.preventDefault();
                this.handleChordStart('k');
                return;
            }
            
            // Handle second key in chord
            if (this.chordState.active && key === 'c') {
                event.preventDefault();
                this.handleChordComplete();
                return;
            }
        }
        
        // Reset chord state on any other key press
        if (this.chordState.active && !(isModifier && key === 'c')) {
            this.resetChordState();
        }
    }
    
    handleKeyUp(event) {
        this.logEvent('keyup', event.key, event);
    }
    
    handleInput(event) {
        if (this.isComposing) return;
        
        const newContent = this.editor.innerText || this.editor.textContent || '';
        
        // Only save state if content actually changed
        if (newContent !== this.content) {
            this.saveState();
            this.content = newContent;
            this.updateLineNumbers();
            
            // Trigger debounced syntax highlighting
            this.debouncedHighlight();
        }
        
        this.logEvent('input', 'text change', event);
    }
    
    handleCompositionStart(event) {
        this.isComposing = true;
        this.logEvent('compositionstart', 'IME start', event);
    }
    
    handleCompositionUpdate(event) {
        this.logEvent('compositionupdate', 'IME update', event);
    }
    
    handleCompositionEnd(event) {
        this.isComposing = false;
        this.logEvent('compositionend', 'IME end', event);
        
        // Handle the final composed text
        const newContent = this.editor.innerText || this.editor.textContent || '';
        if (newContent !== this.content) {
            this.saveState();
            this.content = newContent;
            this.updateLineNumbers();
            this.debouncedHighlight();
        }
    }
    
    handlePaste(event) {
        // Let the input event handle the actual content change
        this.logEvent('paste', 'content pasted', event);
    }
    
    handleTab(shiftKey) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const startNode = range.startContainer;
        
        // Get the current line content
        const lineContent = this.getCurrentLine();
        
        if (shiftKey) {
            // Outdent: remove 2 spaces from start of line
            if (lineContent.startsWith('  ')) {
                const newLine = lineContent.substring(2);
                this.replaceCurrentLine(newLine);
            }
        } else {
            // Indent: add 2 spaces at start of line
            const newLine = '  ' + lineContent;
            this.replaceCurrentLine(newLine);
        }
        
        // Save state after indentation
        this.saveState();
        this.updateLineNumbers();
        
        // Keep focus on editor
        this.editor.focus();
    }
    
    handleEnter() {
        const currentLine = this.getCurrentLine();
        const indentation = this.getIndentation(currentLine);
        
        // Insert new line with same indentation
        const selection = window.getSelection();
        if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            
            const newLineNode = document.createTextNode('\n' + indentation);
            range.insertNode(newLineNode);
            
            // Move cursor after indentation
            range.setStartAfter(newLineNode);
            range.setEndAfter(newLineNode);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        // Save state
        this.saveState();
        this.updateLineNumbers();
    }
    
    handleChordStart(key) {
        // Reset any existing chord state
        this.resetChordState();
        
        // Start new chord
        this.chordState.active = true;
        this.chordState.firstKey = key;
        
        // Set timeout to reset chord state after 2 seconds
        this.chordState.timer = setTimeout(() => {
            this.resetChordState();
        }, 2000);
        
        this.logEvent('action', 'Chord started: Ctrl/Cmd+K', null, 'info');
    }
    
    handleChordComplete() {
        if (this.chordState.active) {
            clearTimeout(this.chordState.timer);
            this.logEvent('action', 'Action: Chord Success', null, 'success');
            this.resetChordState();
        }
    }
    
    resetChordState() {
        if (this.chordState.timer) {
            clearTimeout(this.chordState.timer);
        }
        this.chordState.active = false;
        this.chordState.firstKey = null;
        this.chordState.timer = null;
    }
    
    triggerSave() {
        this.logEvent('action', 'Action: Save', null, 'save');
        // In a real application, you'd save to localStorage or send to server
    }
    
    undo() {
        if (this.undoStack.length > 1) {
            const currentState = this.undoStack.pop();
            this.redoStack.push(currentState);
            
            const previousState = this.undoStack[this.undoStack.length - 1];
            this.content = previousState;
            this.editor.innerText = this.content;
            
            this.updateUI();
            this.logEvent('action', 'Undo performed', null, 'undo');
        }
    }
    
    redo() {
        if (this.redoStack.length > 0) {
            const nextState = this.redoStack.pop();
            this.undoStack.push(nextState);
            this.content = nextState;
            this.editor.innerText = this.content;
            
            this.updateUI();
            this.logEvent('action', 'Redo performed', null, 'redo');
        }
    }
    
    toggleComment() {
        const currentLine = this.getCurrentLine();
        const commentPrefix = '// ';
        
        if (currentLine.startsWith(commentPrefix)) {
            // Uncomment
            const newLine = currentLine.substring(commentPrefix.length);
            this.replaceCurrentLine(newLine);
        } else {
            // Comment
            const newLine = commentPrefix + currentLine;
            this.replaceCurrentLine(newLine);
        }
        
        this.saveState();
        this.updateLineNumbers();
        this.logEvent('action', 'Toggle comment', null, 'comment');
    }
    
    saveState() {
        const currentContent = this.editor.innerText || this.editor.textContent || '';
        this.undoStack.push(currentContent);
        this.redoStack = []; // Clear redo stack on new changes
        this.updateHistorySize();
    }
    
    debouncedHighlight() {
        clearTimeout(this.highlightDebounceTimer);
        this.highlightDebounceTimer = setTimeout(() => {
            this.performHighlight();
        }, this.DEBOUNCE_DELAY);
    }
    
    performHighlight() {
        // Simulate syntax highlighting (computationally expensive task)
        this.highlightCallCount++;
        this.highlightCount.textContent = this.highlightCallCount;
        
        // In a real editor, you'd do actual syntax highlighting here
        // For demo purposes, we just log it
        console.log('Syntax highlighting performed');
    }
    
    getCurrentLine() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return '';
        
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const text = node.textContent || '';
        const startOffset = range.startOffset;
        
        // Find the start of the current line
        let lineStart = text.lastIndexOf('\n', startOffset - 1) + 1;
        if (lineStart === -1) lineStart = 0;
        
        // Find the end of the current line
        let lineEnd = text.indexOf('\n', startOffset);
        if (lineEnd === -1) lineEnd = text.length;
        
        return text.substring(lineStart, lineEnd);
    }
    
    getIndentation(line) {
        const match = line.match(/^\s*/);
        return match ? match[0] : '';
    }
    
    replaceCurrentLine(newLine) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const text = node.textContent || '';
        const startOffset = range.startOffset;
        
        // Find line boundaries
        let lineStart = text.lastIndexOf('\n', startOffset - 1) + 1;
        if (lineStart === -1) lineStart = 0;
        
        let lineEnd = text.indexOf('\n', startOffset);
        if (lineEnd === -1) lineEnd = text.length;
        
        // Replace the line
        const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
        node.textContent = newText;
        
        // Restore cursor position
        const newOffset = lineStart + newLine.length;
        range.setStart(node, newOffset);
        range.setEnd(node, newOffset);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    updateLineNumbers() {
        const content = this.editor.innerText || this.editor.textContent || '';
        const lines = content.split('\n').length;
        let lineNumbersHtml = '';
        for (let i = 1; i <= lines; i++) {
            lineNumbersHtml += i + '<br>';
        }
        this.lineNumbers.innerHTML = lineNumbersHtml;
    }
    
    updateUI() {
        this.updateLineNumbers();
        this.updateHistorySize();
    }
    
    updateHistorySize() {
        this.historySize.textContent = this.undoStack.length;
    }
    
    updatePlatformInfo() {
        const platformInfo = document.getElementById('platform-info');
        platformInfo.textContent = `Platform: ${this.isMac ? 'macOS' : 'Windows/Linux'} (Use ${this.isMac ? '⌘' : 'Ctrl'} for shortcuts)`;
    }
    
    logEvent(type, key, event, subType = null) {
        const entry = document.createElement('li');
        entry.className = 'event-log-item';
        entry.setAttribute('data-test-id', 'event-log-entry');
        
        let eventType = type;
        if (subType) {
            eventType = subType;
        }
        
        entry.setAttribute('data-event-type', eventType);
        
        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
        
        let details = '';
        if (event) {
            const modifiers = [];
            if (event.ctrlKey) modifiers.push('Ctrl');
            if (event.metaKey) modifiers.push('⌘');
            if (event.shiftKey) modifiers.push('Shift');
            if (event.altKey) modifiers.push('Alt');
            
            details = modifiers.length > 0 ? ` [${modifiers.join('+')}]` : '';
        }
        
        entry.textContent = `[${timestamp}] ${type}: ${key}${details}`;
        
        this.eventLog.appendChild(entry);
        
        // Auto-scroll to bottom
        this.eventLog.scrollTop = this.eventLog.scrollHeight;
        
        // Limit log entries to prevent memory issues
        while (this.eventLog.children.length > 100) {
            this.eventLog.removeChild(this.eventLog.firstChild);
        }
    }
    
    clearEventLog() {
        this.eventLog.innerHTML = '';
    }
    
    exposeGlobalFunctions() {
        // Expose required functions for testing
        window.getEditorState = () => {
            return {
                content: this.editor.innerText || this.editor.textContent || '',
                historySize: this.undoStack.length
            };
        };
        
        window.getHighlightCallCount = () => {
            return this.highlightCallCount;
        };
        
        // Expose for debugging
        window.editor = this;
    }
}

// Initialize the editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new CodeEditor();
});