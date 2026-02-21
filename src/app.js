/**
 * Main application entry point
 * Handles global keyboard shortcuts and initialization
 */

class App {
    constructor() {
        this.init();
    }

    init() {
        this.setupGlobalShortcuts();
        this.logEnvironment();
    }

    setupGlobalShortcuts() {
        // Prevent browser save dialog globally (outside editor too)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
            }
        });
    }

    logEnvironment() {
        console.log('[App] High-Performance Code Editor initialized');
        console.log('[App] Platform:', navigator.platform);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new App();
});