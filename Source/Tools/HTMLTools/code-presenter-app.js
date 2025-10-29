'use strict';

(function () {
    if (!window.CodePresenterCore) {
        console.error('CodePresenterCore is required but was not found.');
        return;
    }

    const {
        formatCode,
        DEFAULT_COLORS,
        DEFAULT_FONT_SIZES,
        DEFAULT_FONTS,
        DEFAULT_FONT_STYLES
    } = window.CodePresenterCore;

    const inputCode = document.getElementById('inputCode');
    const templateDialog = document.getElementById('templateDialog');
    const maxWidthInput = document.getElementById('maxWidth');
    const languageSelect = document.getElementById('language');
    const successMessage = document.getElementById('successMessage');
    const previewSection = document.getElementById('previewSection');
    const previewContainer = document.getElementById('previewContainer');
    const downloadBtn = document.getElementById('downloadBtn');

    const commentFontSize = document.getElementById('commentFontSize');
    const codeFontSize = document.getElementById('codeFontSize');
    const commentFont = document.getElementById('commentFont');
    const codeFont = document.getElementById('codeFont');
    const commentBold = document.getElementById('commentBold');
    const commentItalic = document.getElementById('commentItalic');
    const codeBold = document.getElementById('codeBold');
    const codeItalic = document.getElementById('codeItalic');

    const commentColor = document.getElementById('commentColor');
    const keywordColor = document.getElementById('keywordColor');
    const stringColor = document.getElementById('stringColor');
    const numberColor = document.getElementById('numberColor');
    const functionColor = document.getElementById('functionColor');
    const typeColor = document.getElementById('typeColor');
    const variableColor = document.getElementById('variableColor');
    const operatorColor = document.getElementById('operatorColor');

    let currentFormattedHTML = '';

    const PRESET_THEMES = {
        classic: {
            commentFont: "'Bookman Old Style', serif",
            codeFont: "'Courier New', Courier, monospace",
            commentFontSize: 11,
            codeFontSize: 12,
            commentBold: false,
            commentItalic: false,
            codeBold: true,
            codeItalic: false,
            commentColor: '#228b22',
            keywordColor: '#0000ff',
            stringColor: '#a31515',
            numberColor: '#098658',
            functionColor: '#795e26',
            typeColor: '#267f99',
            variableColor: '#001080',
            operatorColor: '#000000'
        },
        dark: {
            commentFont: "Monaco, 'Lucida Console', monospace",
            codeFont: "Monaco, 'Lucida Console', monospace",
            commentFontSize: 10,
            codeFontSize: 12,
            commentBold: false,
            commentItalic: true,
            codeBold: false,
            codeItalic: false,
            commentColor: '#6a9955',
            keywordColor: '#569cd6',
            stringColor: '#ce9178',
            numberColor: '#b5cea8',
            functionColor: '#dcdcaa',
            typeColor: '#4ec9b0',
            variableColor: '#9cdcfe',
            operatorColor: '#d4d4d4'
        },
        vibrant: {
            commentFont: "Verdana, Geneva, sans-serif",
            codeFont: "'Lucida Console', Monaco, monospace",
            commentFontSize: 10,
            codeFontSize: 12,
            commentBold: true,
            commentItalic: false,
            codeBold: false,
            codeItalic: false,
            commentColor: '#ff6b6b',
            keywordColor: '#4ecdc4',
            stringColor: '#ffe66d',
            numberColor: '#95e1d3',
            functionColor: '#f38181',
            typeColor: '#aa96da',
            variableColor: '#5f27cd',
            operatorColor: '#341f97'
        }
    };

    function gatherStyleOverrides() {
        return {
            colors: {
                comment: commentColor.value,
                keyword: keywordColor.value,
                string: stringColor.value,
                number: numberColor.value,
                function: functionColor.value,
                type: typeColor.value,
                variable: variableColor.value,
                operator: operatorColor.value
            },
            fontSizes: {
                comment: parseInt(commentFontSize.value, 10),
                code: parseInt(codeFontSize.value, 10)
            },
            fonts: {
                comment: commentFont.value,
                code: codeFont.value
            },
            fontStyles: {
                commentBold: commentBold.checked,
                commentItalic: commentItalic.checked,
                codeBold: codeBold.checked,
                codeItalic: codeItalic.checked
            }
        };
    }

    function previewFormattedCode() {
        const code = inputCode.value;
        const maxWidth = parseInt(maxWidthInput.value, 10) || 90;
        const language = languageSelect.value;

        if (!code.trim()) {
            alert('Please paste some code first!');
            return;
        }

        const overrides = gatherStyleOverrides();

        const { lines, standaloneHtml, styles } = formatCode({
            code,
            language,
            maxWidth,
            colors: overrides.colors,
            fontSizes: overrides.fontSizes,
            fonts: overrides.fonts,
            fontStyles: overrides.fontStyles
        });

        currentFormattedHTML = standaloneHtml;

        previewContainer.innerHTML = '';
        const previewStyle = document.createElement('style');
        previewStyle.textContent = `
            #previewContainer .code-line {
                white-space: pre-wrap;
                word-wrap: break-word;
                margin-bottom: 0.1rem;
                font-size: ${styles.fontSizes.code}pt;
                font-family: ${styles.fonts.code};
                font-weight: ${styles.fontStyles.codeBold ? 'bold' : 'normal'};
                font-style: ${styles.fontStyles.codeItalic ? 'italic' : 'normal'};
            }
            #previewContainer .comment {
                color: ${styles.colors.comment};
                font-size: ${styles.fontSizes.comment}pt;
                font-family: ${styles.fonts.comment};
                font-weight: ${styles.fontStyles.commentBold ? 'bold' : 'normal'};
                font-style: ${styles.fontStyles.commentItalic ? 'italic' : 'normal'};
            }
            #previewContainer .keyword {
                color: ${styles.colors.keyword};
                font-weight: 600;
            }
            #previewContainer .string {
                color: ${styles.colors.string};
            }
            #previewContainer .number {
                color: ${styles.colors.number};
            }
            #previewContainer .function {
                color: ${styles.colors.function};
            }
            #previewContainer .operator {
                color: ${styles.colors.operator};
            }
            #previewContainer .type {
                color: ${styles.colors.type};
            }
            #previewContainer .variable {
                color: ${styles.colors.variable};
            }
        `;
        document.head.appendChild(previewStyle);

        lines.forEach(line => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'code-line';
            lineDiv.innerHTML = line;
            previewContainer.appendChild(lineDiv);
        });

        previewSection.style.display = 'block';
        downloadBtn.style.display = 'flex';
        successMessage.style.display = 'none';

        previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function downloadFormattedCode() {
        if (!currentFormattedHTML) {
            alert('Please preview the code first!');
            return;
        }

        downloadHTML(currentFormattedHTML, 'formatted-code.html');

        successMessage.style.display = 'block';
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 5000);
    }

    function downloadHTML(content, filename) {
        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function clearAll() {
        inputCode.value = '';
        successMessage.style.display = 'none';
        previewSection.style.display = 'none';
        previewContainer.innerHTML = '';
        downloadBtn.style.display = 'none';
        currentFormattedHTML = '';
    }

    function resetColors() {
        commentFontSize.value = DEFAULT_FONT_SIZES.comment;
        codeFontSize.value = DEFAULT_FONT_SIZES.code;
        commentFont.value = DEFAULT_FONTS.comment;
        codeFont.value = DEFAULT_FONTS.code;
        commentBold.checked = DEFAULT_FONT_STYLES.commentBold;
        commentItalic.checked = DEFAULT_FONT_STYLES.commentItalic;
        codeBold.checked = DEFAULT_FONT_STYLES.codeBold;
        codeItalic.checked = DEFAULT_FONT_STYLES.codeItalic;

        commentColor.value = DEFAULT_COLORS.comment;
        keywordColor.value = DEFAULT_COLORS.keyword;
        stringColor.value = DEFAULT_COLORS.string;
        numberColor.value = DEFAULT_COLORS.number;
        functionColor.value = DEFAULT_COLORS.function;
        typeColor.value = DEFAULT_COLORS.type;
        variableColor.value = DEFAULT_COLORS.variable;
        operatorColor.value = DEFAULT_COLORS.operator;
    }

    function loadSample() {
        inputCode.value = `/*
 * ============================================================================
 * CLASS - ApplicationController.js - Main Application Controller
 * ============================================================================
 * This class manages the core application lifecycle and event handling.
 * It provides a centralized controller for managing configuration, events,
 * and application state throughout the entire application.
 * ============================================================================
 */

// Main application controller
class ApplicationController {
    constructor(config) {
        this.config = config;
        this.initialized = false;
        this.eventHandlers = new Map();
    }

    /*
     * Initialize the application with configuration
     * This method loads settings from the API and sets up the application
     */
    async initialize() {
        try {
            // Load configuration from API
            const response = await fetch('/api/config');
            const data = await response.json();
            
            /* 
               Apply configuration settings
               This includes theme, locale, and feature flags
            */
            this.applyConfiguration(data);
            
            // Set up event listeners
            this.setupEventListeners();
            
            this.initialized = true;
            console.log('Application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize:', error);
            throw error;
        }
    }

    // Register an event handler for a specific event type
    registerHandler(eventName, callback) {
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, []);
        }
        this.eventHandlers.get(eventName).push(callback);
    }

    /*
     * Emit an event to all registered handlers
     * @param {string} eventName - The name of the event to emit
     * @param {*} data - The data to pass to event handlers
     */
    emit(eventName, data) {
        const handlers = this.eventHandlers.get(eventName);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }

    // Clean up resources and event listeners before shutdown
    destroy() {
        this.eventHandlers.clear();
        this.initialized = false;
        console.log('Application destroyed');
    }
}

// Export for use in other modules
export default ApplicationController;`;
        languageSelect.value = 'javascript';
    }

    function getCurrentSettings() {
        return {
            commentFont: commentFont.value,
            codeFont: codeFont.value,
            commentFontSize: parseInt(commentFontSize.value, 10),
            codeFontSize: parseInt(codeFontSize.value, 10),
            commentBold: commentBold.checked,
            commentItalic: commentItalic.checked,
            codeBold: codeBold.checked,
            codeItalic: codeItalic.checked,
            commentColor: commentColor.value,
            keywordColor: keywordColor.value,
            stringColor: stringColor.value,
            numberColor: numberColor.value,
            functionColor: functionColor.value,
            typeColor: typeColor.value,
            variableColor: variableColor.value,
            operatorColor: operatorColor.value
        };
    }

    function applySettings(settings) {
        commentFont.value = settings.commentFont;
        codeFont.value = settings.codeFont;
        commentFontSize.value = settings.commentFontSize;
        codeFontSize.value = settings.codeFontSize;
        commentBold.checked = settings.commentBold;
        commentItalic.checked = settings.commentItalic;
        codeBold.checked = settings.codeBold;
        codeItalic.checked = settings.codeItalic;
        commentColor.value = settings.commentColor;
        keywordColor.value = settings.keywordColor;
        stringColor.value = settings.stringColor;
        numberColor.value = settings.numberColor;
        functionColor.value = settings.functionColor;
        typeColor.value = settings.typeColor;
        variableColor.value = settings.variableColor;
        operatorColor.value = settings.operatorColor;
    }

    function loadTheme() {
        const themeSelect = document.getElementById('themeSelect');
        const themeName = themeSelect.value;

        if (!themeName) {
            showThemeMessage('Please select a theme to load.', 'error');
            return;
        }

        if (PRESET_THEMES[themeName]) {
            applySettings(PRESET_THEMES[themeName]);
            showThemeMessage(`Theme "${themeName}" loaded successfully!`, 'success');
            return;
        }

        const customThemes = JSON.parse(localStorage.getItem('codePresenterThemes') || '{}');
        if (customThemes[themeName]) {
            applySettings(customThemes[themeName]);
            showThemeMessage(`Custom theme "${themeName}" loaded successfully!`, 'success');
        } else {
            showThemeMessage('Theme not found.', 'error');
        }
    }

    function saveCustomTheme() {
        const customThemeName = document.getElementById('customThemeName');
        const themeName = customThemeName.value.trim();

        if (!themeName) {
            showThemeMessage('Please enter a theme name.', 'error');
            return;
        }

        if (PRESET_THEMES[themeName]) {
            showThemeMessage('Cannot overwrite preset themes. Please choose a different name.', 'error');
            return;
        }

        const currentSettings = getCurrentSettings();
        const customThemes = JSON.parse(localStorage.getItem('codePresenterThemes') || '{}');
        customThemes[themeName] = currentSettings;
        localStorage.setItem('codePresenterThemes', JSON.stringify(customThemes));

        updateThemeSelector();
        document.getElementById('themeSelect').value = themeName;

        showThemeMessage(`Theme "${themeName}" saved successfully!`, 'success');
        customThemeName.value = '';
    }

    function deleteCustomTheme() {
        const themeSelect = document.getElementById('themeSelect');
        const themeName = themeSelect.value;

        if (!themeName) {
            showThemeMessage('Please select a theme to delete.', 'error');
            return;
        }

        if (PRESET_THEMES[themeName]) {
            showThemeMessage('Cannot delete preset themes.', 'error');
            return;
        }

        const customThemes = JSON.parse(localStorage.getItem('codePresenterThemes') || '{}');
        if (customThemes[themeName]) {
            delete customThemes[themeName];
            localStorage.setItem('codePresenterThemes', JSON.stringify(customThemes));
            updateThemeSelector();
            themeSelect.value = '';
            showThemeMessage(`Theme "${themeName}" deleted successfully!`, 'success');
        } else {
            showThemeMessage('Theme not found.', 'error');
        }
    }

    function updateThemeSelector() {
        const themeSelect = document.getElementById('themeSelect');
        const currentValue = themeSelect.value;

        themeSelect.innerHTML = `
            <option value="">-- Select Theme --</option>
            <option value="classic">Classic (Default)</option>
            <option value="dark">Dark Mode</option>
            <option value="vibrant">Vibrant</option>
        `;

        const customThemes = JSON.parse(localStorage.getItem('codePresenterThemes') || '{}');
        const customThemeNames = Object.keys(customThemes).sort();

        if (customThemeNames.length > 0) {
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '-- Custom Themes --';
            themeSelect.appendChild(separator);

            customThemeNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                themeSelect.appendChild(option);
            });
        }

        themeSelect.value = currentValue;
    }

    function showThemeMessage(message, type) {
        const themeMessage = document.getElementById('themeMessage');
        themeMessage.textContent = message;

        if (type === 'success') {
            themeMessage.style.background = '#d1fae5';
            themeMessage.style.borderColor = '#34d399';
            themeMessage.style.color = '#065f46';
        } else {
            themeMessage.style.background = '#fee2e2';
            themeMessage.style.borderColor = '#f87171';
            themeMessage.style.color = '#991b1b';
        }

        themeMessage.style.display = 'block';

        setTimeout(() => {
            themeMessage.style.display = 'none';
        }, 3000);
    }

    inputCode.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.key === 'Enter') {
            previewFormattedCode();
        }
    });

    function openTemplateDialog() {
        if (!templateDialog) {
            return;
        }

        templateDialog.returnValue = '';
        templateDialog.showModal();
        templateDialog.addEventListener('close', () => {
            const choice = templateDialog.returnValue;
            if (choice === 'sample') {
                loadSample();
            } else if (choice === 'empty') {
                inputCode.value = '';
                previewContainer.innerHTML = '';
                previewSection.style.display = 'none';
                downloadBtn.style.display = 'none';
            }
        }, { once: true });
    }

    function initFromDialog() {
        openTemplateDialog();
    }

    updateThemeSelector();

    initFromDialog();

    window.previewFormattedCode = previewFormattedCode;
    window.downloadFormattedCode = downloadFormattedCode;
    window.clearAll = clearAll;
    window.resetColors = resetColors;
    window.loadSample = loadSample;
    window.loadTheme = loadTheme;
    window.saveCustomTheme = saveCustomTheme;
    window.deleteCustomTheme = deleteCustomTheme;
})();
