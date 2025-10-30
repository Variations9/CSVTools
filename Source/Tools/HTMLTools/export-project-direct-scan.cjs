'use strict';

let core = null;

function pickCoreModule(candidate) {
    if (!candidate) {
        return null;
    }
    if (typeof candidate.formatCode === 'function') {
        return candidate;
    }
    if (candidate.default && typeof candidate.default.formatCode === 'function') {
        return candidate.default;
    }
    return null;
}

async function loadCore() {
    if (core && typeof core.formatCode === 'function') {
        return core;
    }

    if (typeof globalThis !== 'undefined' && globalThis.CodePresenterCore && typeof globalThis.CodePresenterCore.formatCode === 'function') {
        core = globalThis.CodePresenterCore;
        return core;
    }

    if (typeof require === 'function') {
        const requireCandidates = [
            './code-presenter-core',
            './StylePresets/code-presenter-core'
        ];

        for (const candidate of requireCandidates) {
            try {
                const resolved = pickCoreModule(require(candidate));
                if (resolved) {
                    core = resolved;
                    return core;
                }
            } catch (error) {
                // Keep trying other locations
            }
        }

        try {
            const { pathToFileURL } = require('url');
            const path = require('path');
            const modulePaths = [
                path.join(__dirname, 'code-presenter-core.js'),
                path.join(__dirname, 'StylePresets', 'code-presenter-core.js')
            ];

            for (const modulePath of modulePaths) {
                try {
                    const moduleUrl = pathToFileURL(modulePath);
                    const imported = await import(moduleUrl.href || moduleUrl.toString());
                    const resolved = pickCoreModule(imported);
                    if (resolved) {
                        core = resolved;
                        return core;
                    }
                } catch (innerError) {
                    // Try the next candidate
                }
            }

            if (typeof globalThis !== 'undefined' && globalThis.CodePresenterCore && typeof globalThis.CodePresenterCore.formatCode === 'function') {
                core = globalThis.CodePresenterCore;
                return core;
            }
        } catch (error) {
            
        }
    }

    throw new Error('Code Presenter core module is unavailable.');
}

let fs = null;
let pathModule = null;
try {
    fs = require('fs');
    pathModule = require('path');
} catch (error) {
    fs = null;
    pathModule = null;
}

const SOURCE_FOLDER = 'Source';
const MANIFEST_FILENAME = 'manifest.json';
const PROJECT_PAGE_SUFFIX = '-page';
const EXCLUDED_FILES = new Set(['estimator.html', 'vitest.config.js']);

let cachedProjectName = null;
let cachedOutputRelativePath = null;

function getProjectName() {
    return cachedProjectName || 'Project';
}

function getOutputRootRelativePath() {
    return cachedOutputRelativePath || 'Distribution/formatted-html';
}

function initializeProjectContext(projectRootPath) {
    if (!pathModule) {
        return;
    }
    const detectedName = pathModule.basename(projectRootPath) || 'Project';
    cachedProjectName = detectedName;
    cachedOutputRelativePath = `Distribution/${detectedName}${PROJECT_PAGE_SUFFIX}`;
}

const LANGUAGE_BY_EXTENSION = {
    '.js': 'javascript',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.csv': 'json',
    '.md': 'html'
};

const LANGUAGE_LABELS = {
    javascript: 'JavaScript',
    json: 'JSON',
    html: 'HTML',
    css: 'CSS',
    csharp: 'C#',
    java: 'Java',
    python: 'Python',
    cpp: 'C++'
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(LANGUAGE_BY_EXTENSION));
const SKIP_TOP_LEVEL_DIRS = new Set(['node_modules', 'coverage', 'Mirror of PluginData', '.git']);
const SKIP_FILE_PATTERNS = [/^\./, /~$/, /\.bak$/]; // Skip hidden files, temp files, backups
const DEFAULT_MAX_WIDTH = 90;
const DEFAULT_MAX_SOURCE_LENGTH = 1_000_000;
const LARGE_FILE_PLAIN_TEXT_THRESHOLD = 5_000_000;
const MAX_SOURCE_LENGTH_BY_EXTENSION = new Map([
    ['.json', 100_000_000],
    ['.csv', 20_000_000]
]);

const STYLE_PROFILES = {
    default: {
        name: 'default',
        displayName: 'Default',
        maxWidth: DEFAULT_MAX_WIDTH
    },
    style1: {
        name: 'style1',
        displayName: 'Style 1 - Evergreen',
        maxWidth: 76,
        colors: {
            comment: '#047857',
            keyword: '#1d4ed8',
            string: '#b91c1c',
            number: '#0f766e',
            function: '#9333ea',
            type: '#2563eb',
            variable: '#7c3aed',
            operator: '#111827'
        },
        fontSizes: {
            comment: 11,
            code: 13
        },
        fonts: {
            comment: '"Georgia", serif',
            code: '"Fira Code", "Courier New", monospace'
        },
        fontStyles: {
            commentBold: false,
            commentItalic: true,
            codeBold: false,
            codeItalic: false
        }
    }
};

const STYLE_PRESET_DIR_NAME = 'StylePresets';
const STYLE_PRESET_MANIFEST_JSON = 'presets-manifest.json';
const STYLE_PRESET_MANIFEST_JS = 'presets-manifest.js';
const STYLE_PRESET_DIR = pathModule ? pathModule.join(__dirname, STYLE_PRESET_DIR_NAME) : null;

function slugifyPresetKey(value, fallback = 'preset') {
    if (!value || typeof value !== 'string') {
        return fallback;
    }
    const slug = value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || fallback;
}

function ensureUniquePresetKey(baseKey) {
    const base = slugifyPresetKey(baseKey);
    let candidate = base;
    let counter = 2;
    while (STYLE_PROFILES[candidate]) {
        candidate = `${base}-${counter}`;
        counter += 1;
    }
    return candidate;
}

function clampPresetWidth(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return typeof fallback === 'number' ? fallback : DEFAULT_MAX_WIDTH;
    }
    return Math.max(40, Math.min(200, Math.round(numeric)));
}

function normalizeExternalProfile(source, fallbackKey, fallbackDisplayName) {
    if (!source || typeof source !== 'object') {
        return null;
    }
    const base = cloneStyleProfile(STYLE_PROFILES.default);
    const profile = source.profile && typeof source.profile === 'object' ? source.profile : source;

    const normalized = cloneStyleProfile(base) || {};
    normalized.name = fallbackKey || source.name || source.displayName || 'preset';
    normalized.displayName = source.displayName || source.name || fallbackDisplayName || normalized.name;
    normalized.maxWidth = clampPresetWidth(profile.maxWidth, base.maxWidth);
    normalized.colors = {
        ...base.colors,
        ...(profile.colors || {})
    };
    normalized.fontSizes = {
        ...base.fontSizes,
        ...(profile.fontSizes || {})
    };
    normalized.fonts = {
        ...base.fonts,
        ...(profile.fonts || {})
    };
    normalized.fontStyles = {
        ...base.fontStyles,
        ...(profile.fontStyles || {})
    };

    return normalized;
}

async function writeStylePresetManifests(presets) {
    if (!STYLE_PRESET_DIR || !fs || !pathModule) {
        return;
    }
    await fs.promises.mkdir(STYLE_PRESET_DIR, { recursive: true });
    const manifestPayload = {
        presets: presets.map(entry => ({
            key: entry.key,
            name: entry.displayName || entry.key,
            displayName: entry.displayName || entry.key,
            fileName: entry.fileName,
            profile: entry.profile
        }))
    };
    const manifestJsonPath = pathModule.join(STYLE_PRESET_DIR, STYLE_PRESET_MANIFEST_JSON);
    const manifestJsPath = pathModule.join(STYLE_PRESET_DIR, STYLE_PRESET_MANIFEST_JS);

    await fs.promises.writeFile(manifestJsonPath, JSON.stringify(manifestPayload, null, 2), 'utf8');
    const jsContent = `window.HTML_EXPORTER_PRESETS = ${JSON.stringify(manifestPayload.presets, null, 2)};\n`;
    await fs.promises.writeFile(manifestJsPath, jsContent, 'utf8');
}

async function registerStylePresetsFromDisk() {
    if (!STYLE_PRESET_DIR || !fs || !pathModule) {
        return [];
    }
    try {
        await fs.promises.mkdir(STYLE_PRESET_DIR, { recursive: true });
    } catch (error) {
        console.warn('Unable to ensure style preset directory exists:', error.message || error);
        return [];
    }
    let dirEntries = [];
    try {
        dirEntries = await fs.promises.readdir(STYLE_PRESET_DIR, { withFileTypes: true });
    } catch (error) {
        console.warn('Unable to read style preset directory:', error.message || error);
        dirEntries = [];
    }

    const loaded = [];
    for (const entry of dirEntries) {
        if (!entry.isFile() || !/\.json$/i.test(entry.name)) {
            continue;
        }
        if (entry.name.toLowerCase() === STYLE_PRESET_MANIFEST_JSON.toLowerCase()) {
            continue;
        }
        const filePath = pathModule.join(STYLE_PRESET_DIR, entry.name);
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            const keyBase = parsed.key || parsed.name || parsed.displayName || entry.name.replace(/\.json$/i, '');
            const uniqueKey = ensureUniquePresetKey(keyBase);
            const normalized = normalizeExternalProfile(parsed, uniqueKey, parsed.displayName || parsed.name);
            if (!normalized) {
                continue;
            }
            normalized.name = uniqueKey;
            normalized.displayName = normalized.displayName || uniqueKey;
            STYLE_PROFILES[uniqueKey] = normalized;
            loaded.push({
                key: uniqueKey,
                displayName: normalized.displayName,
                fileName: entry.name,
                profile: {
                    maxWidth: normalized.maxWidth,
                    colors: normalized.colors,
                    fontSizes: normalized.fontSizes,
                    fonts: normalized.fonts,
                    fontStyles: normalized.fontStyles
                }
            });
        } catch (error) {
            console.warn(`Failed to load style preset "${entry.name}":`, error.message || error);
        }
    }

    try {
        await writeStylePresetManifests(loaded);
    } catch (error) {
        console.warn('Unable to write style preset manifest:', error.message || error);
    }

    return loaded;
}

function cloneStyleProfile(profile) {
    if (!profile) {
        return null;
    }
    return {
        name: profile.name,
        displayName: profile.displayName,
        maxWidth: profile.maxWidth,
        colors: profile.colors ? { ...profile.colors } : undefined,
        fontSizes: profile.fontSizes ? { ...profile.fontSizes } : undefined,
        fonts: profile.fonts ? { ...profile.fonts } : undefined,
        fontStyles: profile.fontStyles ? { ...profile.fontStyles } : undefined
    };
}

function resolveStyleProfile(styleName) {
    const key = typeof styleName === 'string' && styleName.trim()
        ? styleName.trim().toLowerCase()
        : 'default';
    const profile = STYLE_PROFILES[key] || STYLE_PROFILES.default;
    return cloneStyleProfile(profile);
}

function createFormatOptions(styleProfile) {
    const profile = styleProfile || resolveStyleProfile();
    if (!profile.name) {
        profile.name = 'custom';
    }
    if (!profile.displayName) {
        profile.displayName = profile.name === 'custom' ? 'Custom' : profile.name;
    }
    const maxWidth = typeof profile.maxWidth === 'number' ? profile.maxWidth : DEFAULT_MAX_WIDTH;

    const formatOptions = { maxWidth };

    if (profile.colors) {
        formatOptions.colors = profile.colors;
    }
    if (profile.fontSizes) {
        formatOptions.fontSizes = profile.fontSizes;
    }
    if (profile.fonts) {
        formatOptions.fonts = profile.fonts;
    }
    if (profile.fontStyles) {
        formatOptions.fontStyles = profile.fontStyles;
    }

    return {
        formatOptions,
        maxWidth,
        profile
    };
}

function parseCliArgs(argv) {
    const args = Array.isArray(argv) ? argv : [];
    const result = {};
    let fallbackStyleToken = null;

    function assignStyleProfile(profile) {
        if (profile && typeof profile === 'object') {
            result.styleProfile = profile;
        }
    }

    function parseJsonValue(rawValue, label) {
        try {
            return JSON.parse(rawValue);
        } catch (error) {
            throw new Error(`Unable to parse ${label}: ${error.message}`);
        }
    }

    function parseBase64JsonValue(rawValue, label) {
        try {
            const decoded = Buffer.from(rawValue, 'base64').toString('utf8');
            return parseJsonValue(decoded, label);
        } catch (error) {
            throw new Error(`Unable to decode ${label}: ${error.message}`);
        }
    }

    for (let i = 0; i < args.length; i += 1) {
        const current = args[i];
        if (current === '--style' && typeof args[i + 1] === 'string') {
            result.styleName = args[i + 1];
            i += 1;
            continue;
        }
        if (typeof current === 'string' && current.startsWith('--style=')) {
            result.styleName = current.slice(8);
            continue;
        }

        if (current === '--style-config' && typeof args[i + 1] === 'string') {
            assignStyleProfile(parseJsonValue(args[i + 1], 'style-config'));
            i += 1;
            continue;
        }
        if (typeof current === 'string' && current.startsWith('--style-config=')) {
            assignStyleProfile(parseJsonValue(current.slice('--style-config='.length), 'style-config'));
            continue;
        }

        if (current === '--style-config-b64' && typeof args[i + 1] === 'string') {
            assignStyleProfile(parseBase64JsonValue(args[i + 1], 'style-config-b64'));
            i += 1;
            continue;
        }
        if (typeof current === 'string' && current.startsWith('--style-config-b64=')) {
            assignStyleProfile(parseBase64JsonValue(current.slice('--style-config-b64='.length), 'style-config-b64'));
            continue;
        }

        if (typeof current === 'string' && !current.startsWith('-') && !current.startsWith('/')) {
            if (!fallbackStyleToken) {
                fallbackStyleToken = current;
            }
        }
    }

    if (!result.styleProfile) {
        const candidates = [];
        if (fallbackStyleToken) {
            candidates.push(fallbackStyleToken);
        }
        for (const token of args) {
            if (typeof token === 'string' && !token.startsWith('-') && !token.startsWith('/')) {
                candidates.push(token);
            }
        }
        for (const token of candidates) {
            const trimmed = typeof token === 'string' ? token.trim() : '';
            if (!trimmed) {
                continue;
            }
            if (trimmed.startsWith('{')) {
                try {
                    assignStyleProfile(parseJsonValue(trimmed, 'style-config'));
                    if (!result.styleName) {
                        result.styleName = 'custom';
                    }
                    break;
                } catch (error) {
                    // Ignore invalid inline JSON payloads
                }
            }
            if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
                try {
                    assignStyleProfile(parseBase64JsonValue(trimmed, 'style-config-b64'));
                    if (!result.styleName) {
                        result.styleName = 'custom';
                    }
                    break;
                } catch (error) {
                    // Ignore invalid base64 payloads
                }
            }
        }
    }

    if (result.styleProfile && typeof result.styleProfile === 'object') {
        if (!result.styleProfile.name) {
            result.styleProfile.name = 'custom';
        }
        if (!result.styleProfile.displayName) {
            result.styleProfile.displayName = 'Custom';
        }
    }

    return result;
}

function toAnchorId(text, index) {
    const base = text
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    return `entry-${base || 'item'}-${index}`;
}

function splitPath(pathString) {
    if (!pathString) {
        return [];
    }
    return pathString.split(/[/\\]/).filter(Boolean);
}

function getExtension(filePath) {
    const idx = filePath.lastIndexOf('.');
    if (idx === -1) {
        return '';
    }
    return filePath.slice(idx).toLowerCase();
}

function getFileName(filePath) {
    const parts = splitPath(filePath);
    return parts[parts.length - 1] || filePath;
}

function shouldExcludeFile(relativePath) {
    if (!relativePath) {
        return false;
    }
    const fileName = getFileName(relativePath).toLowerCase();
    return EXCLUDED_FILES.has(fileName);
}

function getDirectory(relativePath) {
    const parts = splitPath(relativePath);
    if (parts.length <= 1) {
        return '';
    }
    return parts.slice(0, -1).join('/');
}

function buildOutputRelativePath(relativePath) {
    return `${relativePath}.html`;
}

function shouldSkipFile(fileName) {
    for (const pattern of SKIP_FILE_PATTERNS) {
        if (pattern.test(fileName)) {
            return true;
        }
    }
    return false;
}

function shouldSkipDirectory(dirName) {
    return SKIP_TOP_LEVEL_DIRS.has(dirName) || dirName.startsWith('.');
}

function getMaxSourceLengthForExtension(ext) {
    if (!ext) {
        return DEFAULT_MAX_SOURCE_LENGTH;
    }
    return MAX_SOURCE_LENGTH_BY_EXTENSION.get(ext) || DEFAULT_MAX_SOURCE_LENGTH;
}

function countLines(text) {
    if (!text) {
        return 0;
    }
    let count = 1;
    let index = -1;
    while (true) {
        index = text.indexOf('\n', index + 1);
        if (index === -1) {
            break;
        }
        count += 1;
    }
    return count;
}

function escapeHtmlSafe(text) {
    if (core && typeof core.escapeHtml === 'function') {
        return core.escapeHtml(text);
    }
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatLargePlainText(sourceCode, { language, relativePath }) {
    const escaped = escapeHtmlSafe(sourceCode);
    const lineCount = countLines(sourceCode);
    const languageLabel = LANGUAGE_LABELS[language] || language || 'text';
    const fileLabel = relativePath || 'Large File';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtmlSafe(fileLabel)}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: "Courier New", Courier, monospace;
            background: #ffffff;
            padding: 2rem;
            margin: 0;
            color: #111;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .notice {
            background: #f0f4ff;
            border: 1px solid #c6d4ff;
            padding: 1rem;
            border-radius: 6px;
            margin-bottom: 1.5rem;
            color: #234;
            font-size: 0.95rem;
        }
        .meta {
            margin-bottom: 1rem;
            color: #555;
            font-size: 0.9rem;
        }
        pre {
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 1.5rem;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.4;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="notice">
            Displaying <strong>${escapeHtmlSafe(fileLabel)}</strong> as plain text because it exceeds the syntax highlighting size threshold.
        </div>
        <div class="meta">
            <div>Language: ${escapeHtmlSafe(languageLabel)}</div>
            <div>Lines: ${lineCount.toLocaleString()}</div>
        </div>
        <pre>${escaped}</pre>
    </div>
</body>
</html>`;

    return {
        standaloneHtml: html,
        lineCount,
        isPlainText: true
    };
}

function formatSourceContent(sourceCode, { language, relativePath }, formatOptions = { maxWidth: DEFAULT_MAX_WIDTH }) {
    if (language === 'json') {
        return formatJsonViewerPage(sourceCode, { relativePath });
    }

    if (sourceCode.length > LARGE_FILE_PLAIN_TEXT_THRESHOLD) {
        return formatLargePlainText(sourceCode, { language, relativePath });
    }

    const chosenOptions = formatOptions || { maxWidth: DEFAULT_MAX_WIDTH };
    const formatConfig = {
        code: sourceCode,
        language,
        maxWidth: typeof chosenOptions.maxWidth === 'number' ? chosenOptions.maxWidth : DEFAULT_MAX_WIDTH
    };

    if (chosenOptions.colors) {
        formatConfig.colors = chosenOptions.colors;
    }
    if (chosenOptions.fontSizes) {
        formatConfig.fontSizes = chosenOptions.fontSizes;
    }
    if (chosenOptions.fonts) {
        formatConfig.fonts = chosenOptions.fonts;
    }
    if (chosenOptions.fontStyles) {
        formatConfig.fontStyles = chosenOptions.fontStyles;
    }

    const result = core.formatCode(formatConfig);

    if (typeof result.lineCount !== 'number') {
        result.lineCount = Array.isArray(result.lines) ? result.lines.length : countLines(sourceCode);
    }

    return result;
}

function formatJsonViewerPage(sourceCode, { relativePath }) {
    const title = relativePath || 'JSON';
    const escapedTitle = escapeHtmlSafe(title);
    const rawEscaped = escapeHtmlSafe(sourceCode);
    const storedJson = escapeHtmlSafe(sourceCode.replace(/<\/textarea>/gi, '<\\/textarea>'));
    const characterCount = sourceCode.length;
    const lineCount = countLines(sourceCode);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapedTitle}</title>
    <style>
        :root { color-scheme: light dark; }
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            margin: 0;
            padding: 2rem;
            background: #f4f6fb;
            color: #1f2933;
        }
        header { margin-bottom: 1.5rem; }
        h1 {
            margin: 0;
            font-size: 1.6rem;
            color: #0f172a;
        }
        .meta {
            margin-top: 0.25rem;
            color: #526581;
            font-size: 0.9rem;
        }
        .viewer-shell {
            background: #ffffff;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
            border: 1px solid rgba(15, 23, 42, 0.06);
            overflow: hidden;
        }
        .view-controls {
            display: flex;
            gap: 0.5rem;
            padding: 0.85rem 1rem;
            background: linear-gradient(180deg, rgba(241, 245, 249, 0.9), rgba(226, 232, 240, 0.7));
            border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        }
        .view-controls button {
            appearance: none;
            border: 1px solid rgba(15, 23, 42, 0.2);
            background: rgba(255, 255, 255, 0.85);
            color: #1f2933;
            border-radius: 999px;
            padding: 0.45rem 0.9rem;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .view-controls button:hover {
            border-color: #2563eb;
            color: #1d4ed8;
        }
        .view-controls button.active {
            background: #2563eb;
            border-color: #2563eb;
            color: #ffffff;
            box-shadow: 0 6px 18px rgba(37, 99, 235, 0.25);
        }
        .view {
            display: none;
            padding: 1.25rem 1.5rem;
            max-height: 75vh;
            overflow: auto;
        }
        .view.active { display: block; }
        pre {
            margin: 0;
            font-family: "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, monospace;
            font-size: 0.85rem;
            line-height: 1.5;
            white-space: pre;
        }
        .decoded-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        details {
            border: 1px solid rgba(15, 23, 42, 0.12);
            border-radius: 8px;
            background: rgba(248, 250, 252, 0.7);
            overflow: hidden;
        }
        details[open] {
            background: rgba(241, 245, 249, 0.9);
            border-color: #2563eb;
            box-shadow: 0 12px 30px rgba(37, 99, 235, 0.08);
        }
        summary {
            cursor: pointer;
            padding: 0.75rem 1rem;
            font-weight: 600;
            font-size: 0.9rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.75rem;
            list-style: none;
        }
        summary::-webkit-details-marker { display: none; }
        .path {
            color: #0f172a;
            word-break: break-all;
        }
        .summary-meta {
            font-size: 0.8rem;
            color: #475569;
            white-space: nowrap;
        }
        .decoded-block {
            padding: 0.75rem 1rem 1rem;
            border-top: 1px solid rgba(15, 23, 42, 0.08);
            background: rgba(255, 255, 255, 0.9);
        }
        .decoded-info {
            font-size: 0.8rem;
            color: #475569;
            margin-bottom: 0.75rem;
        }
        .control-char {
            display: inline-block;
            padding: 0 0.35rem;
            margin: 0 0.05rem;
            border-radius: 4px;
            background: #334155;
            color: #f8fafc;
            font-size: 0.72rem;
            line-height: 1.6;
            font-weight: 600;
        }
        .control-legend {
            margin: 1rem 0 0;
            font-size: 0.8rem;
            color: #475569;
            display: none;
        }
        .control-legend.visible { display: block; }
        .error {
            padding: 1rem 1.25rem;
            border-radius: 8px;
            border: 1px solid rgba(220, 38, 38, 0.2);
            background: rgba(254, 226, 226, 0.6);
            color: #7f1d1d;
        }
        .placeholder {
            font-size: 0.85rem;
            color: #64748b;
        }
        textarea#json-data { display: none; }
        @media (max-width: 768px) {
            body { padding: 1.25rem; }
            .viewer-shell { border-radius: 8px; }
        }
    </style>
</head>
<body>
    <header>
        <h1>${escapedTitle}</h1>
        <p class="meta">Characters: ${characterCount.toLocaleString('en-US')} • Lines: ${lineCount.toLocaleString('en-US')}</p>
    </header>

    <div class="viewer-shell">
        <div class="view-controls">
            <button type="button" data-view="decoded" class="active">Decoded Strings</button>
            <button type="button" data-view="pretty">Pretty JSON</button>
            <button type="button" data-view="raw">Raw JSON</button>
        </div>
        <div id="decoded-view" class="view active">
            <p class="placeholder">Parsing JSON…</p>
        </div>
        <pre id="pretty-view" class="view"></pre>
        <pre id="raw-view" class="view">${rawEscaped}</pre>
    </div>
    <div id="control-legend" class="control-legend">
        <strong>Control character legend:</strong>
        NUL, SOH, STX, ETX, EOT, ENQ, ACK, BEL, BS, VT, FF, SO, SI, DLE, DC1, DC2, DC3, DC4, NAK, SYN, ETB, CAN, EM, SUB, ESC, FS, GS, RS, US, DEL.
    </div>

    <textarea id="json-data">${storedJson}</textarea>

    <script>
    (function () {
        const CONTROL_NAMES = {
            0: 'NUL', 1: 'SOH', 2: 'STX', 3: 'ETX', 4: 'EOT', 5: 'ENQ', 6: 'ACK', 7: 'BEL',
            8: 'BS', 9: 'TAB', 10: 'LF', 11: 'VT', 12: 'FF', 13: 'CR', 14: 'SO', 15: 'SI',
            16: 'DLE', 17: 'DC1', 18: 'DC2', 19: 'DC3', 20: 'DC4', 21: 'NAK', 22: 'SYN', 23: 'ETB',
            24: 'CAN', 25: 'EM', 26: 'SUB', 27: 'ESC', 28: 'FS', 29: 'GS', 30: 'RS', 31: 'US',
            127: 'DEL'
        };

        const buttons = Array.from(document.querySelectorAll('[data-view]'));
        const views = {
            decoded: document.getElementById('decoded-view'),
            pretty: document.getElementById('pretty-view'),
            raw: document.getElementById('raw-view')
        };
        const legend = document.getElementById('control-legend');

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const target = button.dataset.view;
                buttons.forEach(btn => btn.classList.toggle('active', btn === button));
                Object.keys(views).forEach(key => {
                    views[key].classList.toggle('active', key === target);
                });
            });
        });

        const escapeHtml = (str) => str.replace(/[&<>"']/g, (ch) => {
            switch (ch) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return ch;
            }
        });

        const renderDecodedString = (str) => {
            let containsControl = false;
            let result = '';
            for (let i = 0; i < str.length; i++) {
                const code = str.charCodeAt(i);
                if (code === 10 || code === 13 || code === 9) {
                    result += str[i];
                    continue;
                }
                const isControl = (code >= 0 && code <= 31) || code === 127;
                if (isControl) {
                    containsControl = true;
                    const label = CONTROL_NAMES[code] || ('U+' + code.toString(16).padStart(4, '0').toUpperCase());
                    result += '<span class="control-char" title="U+' +
                        code.toString(16).padStart(4, '0').toUpperCase() + '">' + label + '</span>';
                } else {
                    result += escapeHtml(str[i]);
                }
            }
            return { markup: result, containsControl };
        };

        const collectStrings = (value, path, output, depth) => {
            const nextDepth = depth + 1;
            if (typeof value === 'string') {
                output.push({ path, value, depth });
                return;
            }
            if (Array.isArray(value)) {
                value.forEach((entry, index) => {
                    const nextPath = path ? path + '[' + index + ']' : '[' + index + ']';
                    collectStrings(entry, nextPath, output, nextDepth);
                });
                return;
            }
            if (value && typeof value === 'object') {
                Object.keys(value).forEach((key) => {
                    const nextPath = path ? path + '.' + key : key;
                    collectStrings(value[key], nextPath, output, nextDepth);
                });
            }
        };

        const jsonTextarea = document.getElementById('json-data');
        const rawText = jsonTextarea ? jsonTextarea.value : '';

        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (error) {
            views.decoded.innerHTML = '<div class="error">Failed to parse JSON: ' +
                escapeHtml(error.message) + '</div>';
            views.pretty.textContent = rawText;
            return;
        }

        try {
            views.pretty.textContent = JSON.stringify(parsed, null, 2);
        } catch (error) {
            views.pretty.textContent = rawText;
        }

        const stringEntries = [];
        collectStrings(parsed, '', stringEntries, 0);

        if (stringEntries.length === 0) {
            views.decoded.innerHTML = '<p class="placeholder">This JSON does not contain any string values to decode.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'decoded-list';
        let legendNeeded = false;

        stringEntries.forEach((entry, index) => {
            const details = document.createElement('details');
            if (index === 0) {
                details.open = true;
            }
            details.dataset.index = String(index);

            const summary = document.createElement('summary');
            const safePath = entry.path ? escapeHtml(entry.path) : '(root string)';
            const lengthLabel = entry.value.length.toLocaleString('en-US');
            summary.innerHTML = '<span class="path">' + safePath +
                '</span><span class="summary-meta">' + lengthLabel + ' chars</span>';
            details.appendChild(summary);

            const renderContent = () => {
                if (details.dataset.rendered === 'true') {
                    return;
                }
                const { markup, containsControl } = renderDecodedString(entry.value);
                const block = document.createElement('div');
                block.className = 'decoded-block';

                const info = document.createElement('div');
                info.className = 'decoded-info';
                info.textContent = 'String length: ' + lengthLabel + ' characters';
                block.appendChild(info);

                const pre = document.createElement('pre');
                pre.innerHTML = markup;
                block.appendChild(pre);

                details.appendChild(block);
                details.dataset.rendered = 'true';

                if (containsControl) {
                    legendNeeded = true;
                    legend.classList.add('visible');
                }
            };

            details.addEventListener('toggle', () => {
                if (details.open) {
                    renderContent();
                }
            });

            if (details.open) {
                renderContent();
            }

            list.appendChild(details);
        });

        if (!legendNeeded) {
            legend.classList.remove('visible');
        }

        views.decoded.innerHTML = '';
        views.decoded.appendChild(list);
    })();
    </script>
</body>
</html>`;

    return {
        standaloneHtml: html,
        lineCount,
        isPlainText: false,
        isJsonViewer: true
    };
}

function generateIndexHtml(entries, options) {
    const escape = core.escapeHtml;
    const generatedAt = options.generatedAt;
    const projectName = options.projectName || getProjectName();
    const manifestPath = options.manifestPath;
    const styleLabel = options.styleName || options.styleKey || 'default';
    const maxWidthLabel = typeof options.maxWidth === 'number' ? options.maxWidth : DEFAULT_MAX_WIDTH;
    const sortedEntries = [...entries].sort((a, b) => a.outputRelativePath.localeCompare(b.outputRelativePath));

    const directoryMap = new Map();
    sortedEntries.forEach(entry => {
        const directory = entry.directory || '(root)';
        if (!directoryMap.has(directory)) {
            directoryMap.set(directory, []);
        }
        directoryMap.get(directory).push(entry);
    });

    const tocHtml = Array.from(directoryMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([directory, dirEntries]) => {
            const items = dirEntries
                .map(entry => `<li><a href="${escape(entry.outputRelativePath)}">${escape(entry.fileName || entry.sourcePath)}</a></li>`)
                .join('\n');
            return `<li><span class="toc-dir">${escape(directory)}</span><ul>${items}</ul></li>`;
        })
        .join('\n');

    const tableRows = sortedEntries
        .map(entry => {
            const langLabel = LANGUAGE_LABELS[entry.language] || entry.language;
            return `
                <tr id="${escape(entry.anchorId)}">
                    <td><a href="${escape(entry.outputRelativePath)}">${escape(entry.fileName)}</a></td>
                    <td>${escape(entry.directory || '(root)')}</td>
                    <td>${escape(langLabel)}</td>
                    <td class="lines-col">${entry.lineCount.toLocaleString()}</td>
                </tr>`;
        })
        .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escape(projectName)}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            padding: 2rem;
            max-width: 1400px;
            margin: 0 auto;
            background: #f5f5f5;
        }
        header {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
        }
        h1 {
            color: #333;
            margin-bottom: 0.5rem;
        }
        .subtitle {
            color: #666;
            font-size: 0.9rem;
        }
        .content-wrapper {
            display: grid;
            grid-template-columns: 300px 1fr;
            gap: 2rem;
            align-items: start;
        }
        .toc-container {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            position: sticky;
            top: 2rem;
            max-height: calc(100vh - 4rem);
            overflow-y: auto;
        }
        .toc-container h2 {
            font-size: 1.2rem;
            margin-bottom: 1rem;
            color: #333;
        }
        .toc-container ul {
            list-style: none;
        }
        .toc-container > ul > li {
            margin-bottom: 1rem;
        }
        .toc-dir {
            font-weight: 600;
            color: #0066cc;
            display: block;
            margin-bottom: 0.5rem;
        }
        .toc-container ul ul {
            margin-left: 1rem;
            margin-top: 0.5rem;
        }
        .toc-container ul ul li {
            margin-bottom: 0.25rem;
        }
        .toc-container a {
            color: #0066cc;
            text-decoration: none;
            font-size: 0.9rem;
        }
        .toc-container a:hover {
            text-decoration: underline;
        }
        .main-content {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }
        th, td {
            text-align: left;
            padding: 0.75rem;
            border-bottom: 1px solid #e0e0e0;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #333;
            position: sticky;
            top: 0;
        }
        tr:hover {
            background: #f8f9fa;
        }
        td a {
            color: #0066cc;
            text-decoration: none;
        }
        td a:hover {
            text-decoration: underline;
        }
        .lines-col {
            text-align: right;
            font-family: 'Courier New', monospace;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 4px;
            border-left: 4px solid #0066cc;
        }
        .stat-label {
            font-size: 0.85rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .stat-value {
            font-size: 1.5rem;
            font-weight: 600;
            color: #333;
            margin-top: 0.25rem;
        }
    </style>
</head>
<body>
    <header>
        <h1>${escape(projectName)}</h1>
        <p class="subtitle">Generated: ${escape(new Date(generatedAt).toLocaleString())}</p>
        <p class="subtitle">Style: ${escape(styleLabel)} (max width: ${maxWidthLabel} chars)</p>
    </header>

    <div class="content-wrapper">
        <aside class="toc-container">
            <h2>Table of Contents</h2>
            <ul>
                ${tocHtml}
            </ul>
        </aside>

        <main class="main-content">
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-label">Total Files</div>
                    <div class="stat-value">${sortedEntries.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Lines</div>
                    <div class="stat-value">${sortedEntries.reduce((sum, e) => sum + e.lineCount, 0).toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Directories</div>
                    <div class="stat-value">${directoryMap.size}</div>
                </div>
            </div>

            <h2>All Files</h2>
            <table>
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Directory</th>
                        <th>Language</th>
                        <th>Lines</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </main>
    </div>
</body>
</html>`;
}

async function reportProgress(onProgress, event) {
    if (typeof onProgress === 'function') {
        await onProgress(event);
    }
}

async function scanSourceDirectory(accessor, sourceRoot, currentPath = '', files = []) {
    const fullPath = currentPath ? `${sourceRoot}/${currentPath}` : sourceRoot;
    
    // For Node.js accessor
    if (accessor.fsPromises) {
        try {
            const entries = await accessor.fsPromises.readdir(accessor.resolve(fullPath), { withFileTypes: true });
            
            for (const entry of entries) {
                const entryName = entry.name;
                const relativePath = currentPath ? `${currentPath}/${entryName}` : entryName;
                
                if (entry.isDirectory()) {
                    // Skip excluded directories
                    if (!shouldSkipDirectory(entryName)) {
                        await scanSourceDirectory(accessor, sourceRoot, relativePath, files);
                    }
                } else if (entry.isFile()) {
                    // Check if file should be included
                    if (!shouldSkipFile(entryName)) {
                        const ext = getExtension(entryName);
                        if (ALLOWED_EXTENSIONS.has(ext)) {
                            files.push(relativePath);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Warning: Could not read directory ${fullPath}:`, error.message);
        }
    }
    
    return files;
}

async function exportProjectWithAccessor(accessor, options = {}) {
    const onProgress = options.onProgress;
    const exportLimit = options.exportLimit;
    const sourceRoot = options.sourceRoot || SOURCE_FOLDER;
    const projectName = getProjectName();
    const outputBase = getOutputRootRelativePath();
    const requestedStyleName = typeof options.styleName === 'string' ? options.styleName.trim() : '';
    const normalizedStyleKey = requestedStyleName.toLowerCase();
    const hasCustomProfile = options.styleProfile && typeof options.styleProfile === 'object';

    try {
        const externalPresets = await registerStylePresetsFromDisk();
        if (externalPresets.length > 0) {
            const label = externalPresets.length === 1 ? 'preset' : 'presets';
            console.log(`Loaded ${externalPresets.length} external style ${label} from ${STYLE_PRESET_DIR_NAME}.`);
        }
    } catch (error) {
        console.warn('Unable to load external style presets:', error.message || error);
    }

    if (requestedStyleName && !STYLE_PROFILES[normalizedStyleKey] && !hasCustomProfile) {
        console.warn(`Warning: Unknown style "${requestedStyleName}". Falling back to default.`);
    }

    const baseProfile = hasCustomProfile
        ? cloneStyleProfile({
            ...resolveStyleProfile(normalizedStyleKey),
            ...options.styleProfile
        })
        : resolveStyleProfile(normalizedStyleKey);
    const {
        formatOptions: activeFormatOptions,
        maxWidth: activeMaxWidth,
        profile: appliedProfile
    } = createFormatOptions(baseProfile);
    const styleDisplayName = appliedProfile.displayName || appliedProfile.name || 'default';

    await loadCore();
    console.log(`Using export style "${styleDisplayName}" (max width ${activeMaxWidth})`);
    await reportProgress(onProgress, { type: 'start' });

    // Scan the Source directory to find all files
    console.log(`Scanning ${sourceRoot} directory...`);
    const sourceFiles = await scanSourceDirectory(accessor, sourceRoot);
    console.log(`Found ${sourceFiles.length} source files to process`);

    await accessor.ensureFolder(outputBase);

    const manifest = [];
    let processed = 0;
    const total = exportLimit ? Math.min(sourceFiles.length, exportLimit) : sourceFiles.length;

    for (const relativePath of sourceFiles) {
        if (shouldExcludeFile(relativePath)) {
            continue;
        }

        const sourcePath = `${sourceRoot}/${relativePath}`;
        const ext = getExtension(relativePath);
        const language = LANGUAGE_BY_EXTENSION[ext];

        if (!language) {
            continue;
        }

        let sourceCode;
        try {
            sourceCode = await accessor.readFile(sourcePath);
        } catch (error) {
            console.warn(`Warning: Could not read file ${sourcePath}:`, error.message);
            continue;
        }

        const maxSourceLength = getMaxSourceLengthForExtension(ext);
        if (sourceCode.length > maxSourceLength) {
            console.warn(`Skipping ${sourcePath}: exceeds max length for ${ext || 'unknown'} files (${sourceCode.length} > ${maxSourceLength})`);
            continue;
        }

        const formatResult = formatSourceContent(sourceCode, { language, relativePath }, activeFormatOptions);
        const lineCount = typeof formatResult.lineCount === 'number' ? formatResult.lineCount : countLines(sourceCode);

        if (formatResult.isPlainText) {
            console.log(`Large file detected. Rendering ${sourcePath} as plain text (${sourceCode.length.toLocaleString()} characters).`);
        }

        const outputRelativePath = buildOutputRelativePath(relativePath);
        const htmlOutputPath = `${outputBase}/${outputRelativePath}`;
        const anchorId = toAnchorId(outputRelativePath, manifest.length);
        const directory = getDirectory(relativePath);
        const fileName = getFileName(relativePath);

        await accessor.writeFile(htmlOutputPath, formatResult.standaloneHtml);

        manifest.push({
            sourcePath,
            outputPath: htmlOutputPath,
            outputRelativePath,
            language,
            lineCount,
            anchorId,
            directory,
            fileName
        });

        processed += 1;
        await reportProgress(onProgress, {
            type: 'update',
            total,
            processed,
            relativePath: sourcePath,
            outputRelativePath,
            language
        });

        if (exportLimit && processed >= exportLimit) {
            break;
        }
    }

    await reportProgress(onProgress, { type: 'complete', total, processed });

    const generatedAt = new Date().toISOString();
    const manifestData = JSON.stringify({
        generatedAt,
        maxWidth: activeMaxWidth,
        style: {
            key: appliedProfile.name || 'default',
            label: styleDisplayName,
            maxWidth: activeMaxWidth
        },
        files: manifest
    }, null, 2);

    const manifestPath = `${outputBase}/${MANIFEST_FILENAME}`;
    await accessor.writeFile(manifestPath, manifestData);

    const indexHtml = generateIndexHtml(manifest, {
        generatedAt,
        outputDir: outputBase,
        manifestPath,
        maxWidth: activeMaxWidth,
        projectName,
        styleName: styleDisplayName,
        styleKey: appliedProfile.name || 'default'
    });
    const indexFileName = `${projectName}.html`;
    const indexPath = `${outputBase}/${indexFileName}`;
    await accessor.writeFile(indexPath, indexHtml);

    const outputFullPath = accessor.getAbsolutePath ? await accessor.getAbsolutePath(outputBase) : null;
    const manifestFullPath = accessor.getAbsolutePath ? await accessor.getAbsolutePath(manifestPath) : null;
    const indexFullPath = accessor.getAbsolutePath ? await accessor.getAbsolutePath(indexPath) : null;

    console.log(`Formatted ${manifest.length} files to ${outputBase}${outputFullPath ? ` (${outputFullPath})` : ''}`);
    console.log(`Manifest written to ${manifestPath}${manifestFullPath ? ` (${manifestFullPath})` : ''}`);
    console.log(`Index page written to ${indexPath}${indexFullPath ? ` (${indexFullPath})` : ''}`);

    return {
        filesProcessed: manifest.length,
        outputDir: outputBase,
        manifestPath,
        indexPath,
        outputFullPath,
        manifestFullPath,
        indexFullPath
    };
}

class NodeFileAccessor {
    constructor(rootPath) {
        this.rootPath = rootPath;
        this.fsPromises = fs.promises;
    }

    supportsWrite() {
        return false;
    }

    resolve(relativePath) {
        if (!relativePath) {
            return this.rootPath;
        }
        const segments = splitPath(relativePath);
        return pathModule.join(this.rootPath, ...segments);
    }

    async ensureFolder(relativePath) {
        if (!relativePath) {
            return;
        }
        const targetPath = this.resolve(relativePath);
        await this.fsPromises.mkdir(targetPath, { recursive: true });
    }

    async readFile(relativePath) {
        const absolutePath = this.resolve(relativePath);
        return this.fsPromises.readFile(absolutePath, 'utf8');
    }

    async writeFile(relativePath, content) {
        const absolutePath = this.resolve(relativePath);
        await this.fsPromises.mkdir(pathModule.dirname(absolutePath), { recursive: true });
        await this.fsPromises.writeFile(absolutePath, content, 'utf8');
        return absolutePath;
    }

    async fileExists(relativePath) {
        try {
            const absolutePath = this.resolve(relativePath);
            const stats = await this.fsPromises.stat(absolutePath);
            return stats.isFile();
        } catch (error) {
            return false;
        }
    }

    async getAbsolutePath(relativePath) {
        return this.resolve(relativePath);
    }
}

async function findProjectRoot() {
    
    let currentDir = __dirname;
    
    
    const sourceAtCurrent = pathModule.join(currentDir, SOURCE_FOLDER);
    try {
        const stats = await fs.promises.stat(sourceAtCurrent);
        if (stats.isDirectory()) {
            return currentDir;
        }
    } catch (error) {
        
    }
    
    
    for (let i = 0; i < 5; i++) {
        currentDir = pathModule.resolve(currentDir, '..');
        const sourcePath = pathModule.join(currentDir, SOURCE_FOLDER);
        try {
            const stats = await fs.promises.stat(sourcePath);
            if (stats.isDirectory()) {
                return currentDir;
            }
        } catch (error) {
            // Keep trying
        }
    }
    
    
    return pathModule.resolve(__dirname, '..', '..', '..');
}

async function createAccessor() {
    if (fs && pathModule) {
        const projectRoot = await findProjectRoot();
        initializeProjectContext(projectRoot);
        console.log(`Project root: ${projectRoot}`);
        return new NodeFileAccessor(projectRoot);
    }

    throw new Error('No suitable file system interface available.');
}

async function exportProject(options = {}) {
    const accessor = await createAccessor();
    return exportProjectWithAccessor(accessor, options);
}

if (require.main === module) {
    let cliOptions = {};
    try {
        cliOptions = parseCliArgs(process.argv.slice(2));
    } catch (error) {
        console.error('Failed to parse command-line arguments:', error.message || error);
        process.exit(1);
    }

    exportProject(cliOptions).catch(error => {
        console.error('Export failed:', error.message || error);
        process.exit(1);
    });
}

module.exports = { exportProject };
