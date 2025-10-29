'use strict';

let core = null;

async function loadCore() {
    if (core && typeof core.formatCode === 'function') {
        return core;
    }

    if (typeof globalThis !== 'undefined' && globalThis.CodePresenterCore && typeof globalThis.CodePresenterCore.formatCode === 'function') {
        core = globalThis.CodePresenterCore;
        return core;
    }

    if (typeof require === 'function') {
        try {
            const required = require('./code-presenter-core');
            if (required && typeof required.formatCode === 'function') {
                core = required;
                return core;
            }
            if (required && typeof required.default === 'object' && typeof required.default.formatCode === 'function') {
                core = required.default;
                return core;
            }
            if (typeof globalThis !== 'undefined' && globalThis.CodePresenterCore && typeof globalThis.CodePresenterCore.formatCode === 'function') {
                core = globalThis.CodePresenterCore;
                return core;
            }
        } catch (error) {
            
        }

        try {
            const { pathToFileURL } = require('url');
            const path = require('path');
            const moduleUrl = pathToFileURL(path.join(__dirname, 'code-presenter-core.js'));
            const imported = await import(moduleUrl.href || moduleUrl.toString());
            if (imported) {
                if (imported.default && typeof imported.default.formatCode === 'function') {
                    core = imported.default;
                    return core;
                }
                if (typeof imported.formatCode === 'function') {
                    core = imported;
                    return core;
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
    '.cjs': 'javascript'
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

function generateIndexHtml(entries, options) {
    const escape = core.escapeHtml;
    const generatedAt = options.generatedAt;
    const projectName = options.projectName || getProjectName();
    const manifestPath = options.manifestPath;
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

    await loadCore();
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

        if (sourceCode.length > DEFAULT_MAX_SOURCE_LENGTH) {
            console.warn(`Skipping ${sourcePath}: exceeds max length (${sourceCode.length} > ${DEFAULT_MAX_SOURCE_LENGTH})`);
            continue;
        }

        const formatResult = core.formatCode({
            code: sourceCode,
            language,
            maxWidth: DEFAULT_MAX_WIDTH
        });

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
            lineCount: formatResult.lines.length,
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
        maxWidth: DEFAULT_MAX_WIDTH,
        files: manifest
    }, null, 2);

    const manifestPath = `${outputBase}/${MANIFEST_FILENAME}`;
    await accessor.writeFile(manifestPath, manifestData);

    const indexHtml = generateIndexHtml(manifest, {
        generatedAt,
        outputDir: outputBase,
        manifestPath,
        maxWidth: DEFAULT_MAX_WIDTH,
        projectName
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
    exportProject().catch(error => {
        console.error('Export failed:', error.message || error);
        process.exit(1);
    });
}

module.exports = { exportProject };
