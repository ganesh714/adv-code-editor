/**
 * Main application entry point
 * Handles additional UI interactions and initialization
 */

class App {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupKeyboardShortcuts();
        this.checkEnvironment();
    }
    
    setupKeyboardShortcuts() {
        // Global keyboard shortcuts (non-editor)
        document.addEventListener('keydown', (e) => {
            // Prevent browser save dialog globally
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
            }
        });
    }
    
    checkEnvironment() {
        // Log environment info
        console.log('Environment:', process.env.NODE_ENV || 'development');
        console.log('Port:', process.env.APP_PORT || 3000);
    }
}

// Initialize app
new App();