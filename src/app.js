/**
 * App Bootstrap — Initializes the CodeEditor and exposes verification APIs
 */

document.addEventListener('DOMContentLoaded', () => {
    // Instantiate the editor
    const editor = new CodeEditor();

    // Expose verification functions on window for automated testing (CR6, CR10)
    window.getEditorState = () => editor.getEditorState();
    window.getHighlightCallCount = () => editor.getHighlightCallCount();

    // Expose editor instance for debugging
    window._editor = editor;

    console.log('%c Code Editor Ready ', 'background: #6366f1; color: white; font-weight: bold; border-radius: 4px; padding: 4px 8px;');
    console.log('Available APIs: window.getEditorState(), window.getHighlightCallCount()');
});
