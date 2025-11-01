(() => {
    'use strict';

    const DEFAULT_CORE = window.CodePresenterCore || {};

    const BASE_DEFAULT = {
        maxWidth: 80,
        colors: DEFAULT_CORE.DEFAULT_COLORS || {
            comment: '#228b22',
            keyword: '#0000ff',
            string: '#a31515',
            number: '#098658',
            function: '#795e26',
            type: '#267f99',
            variable: '#001080',
            operator: '#000000'
        },
        fontSizes: DEFAULT_CORE.DEFAULT_FONT_SIZES || {
            comment: 11,
            code: 12
        },
        fonts: DEFAULT_CORE.DEFAULT_FONTS || {
            comment: "'Bookman Old Style', serif",
            code: "'Courier New', Courier, monospace"
        },
        fontStyles: DEFAULT_CORE.DEFAULT_FONT_STYLES || {
            commentBold: false,
            commentItalic: false,
            codeBold: true,
            codeItalic: false
        }
    };

    function clampWidth(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return BASE_DEFAULT.maxWidth;
        }
        return Math.max(40, Math.min(200, Math.round(numeric)));
    }

    function normalizeFontSize(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return fallback;
        }
        return Math.round(numeric);
    }

    function normalizeFontValue(value, fallback) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
        if (typeof fallback === 'string' && fallback.trim()) {
            return fallback.trim();
        }
        return '';
    }

    function normalizeProfile(profile) {
        const source = (profile && typeof profile === 'object') ? profile : {};
        const colors = (source.colors && typeof source.colors === 'object') ? source.colors : {};
        const fontSizes = (source.fontSizes && typeof source.fontSizes === 'object') ? source.fontSizes : {};
        const fonts = (source.fonts && typeof source.fonts === 'object') ? source.fonts : {};
        const fontStyles = (source.fontStyles && typeof source.fontStyles === 'object') ? source.fontStyles : {};

        return {
            maxWidth: clampWidth(source.maxWidth ?? BASE_DEFAULT.maxWidth),
            colors: {
                comment: colors.comment ?? BASE_DEFAULT.colors.comment,
                keyword: colors.keyword ?? BASE_DEFAULT.colors.keyword,
                string: colors.string ?? BASE_DEFAULT.colors.string,
                number: colors.number ?? BASE_DEFAULT.colors.number,
                function: colors.function ?? BASE_DEFAULT.colors.function,
                type: colors.type ?? BASE_DEFAULT.colors.type,
                variable: colors.variable ?? BASE_DEFAULT.colors.variable,
                operator: colors.operator ?? BASE_DEFAULT.colors.operator
            },
            fontSizes: {
                comment: normalizeFontSize(fontSizes.comment, BASE_DEFAULT.fontSizes.comment),
                code: normalizeFontSize(fontSizes.code, BASE_DEFAULT.fontSizes.code)
            },
            fonts: {
                comment: normalizeFontValue(fonts.comment, BASE_DEFAULT.fonts.comment),
                code: normalizeFontValue(fonts.code, BASE_DEFAULT.fonts.code)
            },
            fontStyles: {
                commentBold: Boolean(fontStyles.commentBold ?? BASE_DEFAULT.fontStyles.commentBold),
                commentItalic: Boolean(fontStyles.commentItalic ?? BASE_DEFAULT.fontStyles.commentItalic),
                codeBold: Boolean(fontStyles.codeBold ?? BASE_DEFAULT.fontStyles.codeBold),
                codeItalic: Boolean(fontStyles.codeItalic ?? BASE_DEFAULT.fontStyles.codeItalic)
            }
        };
    }

    function mergeWithDefaults(profile) {
        return normalizeProfile(profile);
    }

    function stringifyProfile(profile) {
        return JSON.stringify(mergeWithDefaults(profile), null, 2);
    }

    function encodeBase64(text) {
        if (typeof window.btoa === 'function') {
            return window.btoa(unescape(encodeURIComponent(text)));
        }
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(text, 'utf8').toString('base64');
        }
        throw new Error('Base64 encoding is not supported in this environment.');
    }

    function profilesMatch(a, b) {
        if (!a || !b) {
            return false;
        }
        return JSON.stringify(mergeWithDefaults(a)) === JSON.stringify(mergeWithDefaults(b));
    }

    function createSlug(text, fallback = 'preset') {
        if (typeof text !== 'string' || !text.trim()) {
            return fallback;
        }
        return text
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || fallback;
    }

    const refs = {
        presetSelect: document.getElementById('presetSelect'),
        maxWidthInput: document.getElementById('maxWidthInput'),
        commentFontSelect: document.getElementById('commentFontSelect'),
        codeFontSelect: document.getElementById('codeFontSelect'),
        commentFontSizeInput: document.getElementById('commentFontSizeInput'),
        codeFontSizeInput: document.getElementById('codeFontSizeInput'),
        commentBold: document.getElementById('commentBold'),
        commentItalic: document.getElementById('commentItalic'),
        codeBold: document.getElementById('codeBold'),
        codeItalic: document.getElementById('codeItalic'),
        commentColor: document.getElementById('commentColor'),
        keywordColor: document.getElementById('keywordColor'),
        stringColor: document.getElementById('stringColor'),
        numberColor: document.getElementById('numberColor'),
        functionColor: document.getElementById('functionColor'),
        typeColor: document.getElementById('typeColor'),
        variableColor: document.getElementById('variableColor'),
        operatorColor: document.getElementById('operatorColor'),
        restorePresetBtn: document.getElementById('restorePresetBtn'),
        styleForm: document.getElementById('styleForm'),
        npmCommandOutput: document.getElementById('npmCommandOutput'),
        nodeCommandOutput: document.getElementById('nodeCommandOutput'),
        styleJsonOutput: document.getElementById('styleJsonOutput'),
        copyNpmBtn: document.getElementById('copyNpmBtn'),
        copyNodeBtn: document.getElementById('copyNodeBtn'),
        savePresetBtn: document.getElementById('savePresetBtn'),
        loadPresetBtn: document.getElementById('loadPresetBtn'),
        loadPresetInput: document.getElementById('loadPresetInput'),
        clearLogBtn: document.getElementById('clearLogBtn'),
        statusMessage: document.getElementById('statusMessage'),
        runLog: document.getElementById('runLog')
    };

    if (!refs.presetSelect) {
        console.error('HTML Exporter initialisation failed: missing preset select element.');
        return;
    }

    const CUSTOMIZATION_CONTROLS = [
        refs.maxWidthInput,
        refs.commentFontSelect,
        refs.codeFontSelect,
        refs.commentFontSizeInput,
        refs.codeFontSizeInput,
        refs.commentBold,
        refs.commentItalic,
        refs.codeBold,
        refs.codeItalic,
        refs.commentColor,
        refs.keywordColor,
        refs.stringColor,
        refs.numberColor,
        refs.functionColor,
        refs.typeColor,
        refs.variableColor,
        refs.operatorColor
    ].filter(Boolean);

    const PRESET_REGISTRY = new Map();
    const BUILTIN_KEYS = new Set(['default', 'style1', 'style2', 'style3', 'style4']);
    const EXTERNAL_PRESET_KEYS = new Set();

    let activePresetKey = 'default';
    let isApplyingPreset = false;

    function findPresetOption(key) {
        return Array.from(refs.presetSelect.options).find(option => option.value === key) || null;
    }

    function ensurePresetOption(key, options = {}) {
        let option = findPresetOption(key);
        if (!option) {
            option = document.createElement('option');
            option.value = key;
            if (options.insertBefore) {
                const before = findPresetOption(options.insertBefore);
                refs.presetSelect.insertBefore(option, before || null);
            } else {
                refs.presetSelect.appendChild(option);
            }
        }

        if (typeof options.label === 'string') {
            option.textContent = options.label;
        } else if (!option.textContent) {
            option.textContent = key;
        }

        if (options.datasetSource !== undefined) {
            if (options.datasetSource) {
                option.dataset.source = options.datasetSource;
            } else {
                delete option.dataset.source;
            }
        }

        return option;
    }

    function registerPreset(key, overrides = {}, options = {}) {
        const displayName = options.displayName || overrides.displayName || key;
        const preset = {
            ...mergeWithDefaults(overrides),
            key,
            name: key,
            displayName
        };

        PRESET_REGISTRY.set(key, preset);

        const option = ensurePresetOption(key, {
            insertBefore: options.insertBefore,
            label: options.keepExistingLabel ? undefined : displayName
        });

        if (options.keepExistingLabel && !option.textContent) {
            option.textContent = displayName;
        }

        if (options.markExternal) {
            option.dataset.source = 'external';
            EXTERNAL_PRESET_KEYS.add(key);
        } else if (options.custom) {
            option.dataset.source = 'custom';
        } else if (options.builtin) {
            option.dataset.source = 'builtin';
        } else {
            delete option.dataset.source;
        }

        return preset;
    }

    function clearExternalPresets() {
        const wasActiveExternal = EXTERNAL_PRESET_KEYS.has(activePresetKey);
        EXTERNAL_PRESET_KEYS.forEach(key => {
            PRESET_REGISTRY.delete(key);
            const option = findPresetOption(key);
            if (option) {
                option.remove();
            }
        });
        EXTERNAL_PRESET_KEYS.clear();

        if (wasActiveExternal) {
            activePresetKey = 'default';
            refs.presetSelect.value = 'default';
            const preset = PRESET_REGISTRY.get('default');
            if (preset) {
                applyProfileToForm(preset);
                updateOutputs();
            }
        }
    }

    function ensureFontOption(select, value) {
        if (!select) {
            return value;
        }
        const normalized = normalizeFontValue(value, '');
        if (!normalized) {
            return normalized;
        }
        const existing = Array.from(select.options).find(option => option.value.toLowerCase() === normalized.toLowerCase());
        if (existing) {
            return existing.value;
        }
        const option = document.createElement('option');
        option.value = normalized;
        option.textContent = normalized;
        select.appendChild(option);
        return option.value;
    }

    function setFontControl(kind, value) {
        const select = kind === 'comment' ? refs.commentFontSelect : refs.codeFontSelect;
        const fallback = kind === 'comment' ? BASE_DEFAULT.fonts.comment : BASE_DEFAULT.fonts.code;
        const normalizedValue = normalizeFontValue(value, fallback);
        const optionValue = ensureFontOption(select, normalizedValue);
        if (select && optionValue) {
            select.value = optionValue;
        }
    }

    function getFontValue(kind) {
        const select = kind === 'comment' ? refs.commentFontSelect : refs.codeFontSelect;
        const fallback = kind === 'comment' ? BASE_DEFAULT.fonts.comment : BASE_DEFAULT.fonts.code;
        if (!select) {
            return normalizeFontValue(undefined, fallback);
        }
        return normalizeFontValue(select.value, fallback);
    }

    function applyProfileToForm(preset) {
        if (!preset) {
            return;
        }
        const profile = mergeWithDefaults(preset);
        isApplyingPreset = true;
        try {
            if (refs.maxWidthInput) {
                refs.maxWidthInput.value = profile.maxWidth;
            }

            setFontControl('comment', profile.fonts.comment);
            setFontControl('code', profile.fonts.code);

            if (refs.commentFontSizeInput) {
                refs.commentFontSizeInput.value = profile.fontSizes.comment;
            }
            if (refs.codeFontSizeInput) {
                refs.codeFontSizeInput.value = profile.fontSizes.code;
            }

            if (refs.commentBold) {
                refs.commentBold.checked = Boolean(profile.fontStyles.commentBold);
            }
            if (refs.commentItalic) {
                refs.commentItalic.checked = Boolean(profile.fontStyles.commentItalic);
            }
            if (refs.codeBold) {
                refs.codeBold.checked = Boolean(profile.fontStyles.codeBold);
            }
            if (refs.codeItalic) {
                refs.codeItalic.checked = Boolean(profile.fontStyles.codeItalic);
            }

            if (refs.commentColor) refs.commentColor.value = profile.colors.comment;
            if (refs.keywordColor) refs.keywordColor.value = profile.colors.keyword;
            if (refs.stringColor) refs.stringColor.value = profile.colors.string;
            if (refs.numberColor) refs.numberColor.value = profile.colors.number;
            if (refs.functionColor) refs.functionColor.value = profile.colors.function;
            if (refs.typeColor) refs.typeColor.value = profile.colors.type;
            if (refs.variableColor) refs.variableColor.value = profile.colors.variable;
            if (refs.operatorColor) refs.operatorColor.value = profile.colors.operator;
        } finally {
            isApplyingPreset = false;
        }
    }

    function gatherProfileFromForm() {
        return {
            maxWidth: refs.maxWidthInput ? Number(refs.maxWidthInput.value) : BASE_DEFAULT.maxWidth,
            colors: {
                comment: refs.commentColor?.value || BASE_DEFAULT.colors.comment,
                keyword: refs.keywordColor?.value || BASE_DEFAULT.colors.keyword,
                string: refs.stringColor?.value || BASE_DEFAULT.colors.string,
                number: refs.numberColor?.value || BASE_DEFAULT.colors.number,
                function: refs.functionColor?.value || BASE_DEFAULT.colors.function,
                type: refs.typeColor?.value || BASE_DEFAULT.colors.type,
                variable: refs.variableColor?.value || BASE_DEFAULT.colors.variable,
                operator: refs.operatorColor?.value || BASE_DEFAULT.colors.operator
            },
            fontSizes: {
                comment: refs.commentFontSizeInput ? Number(refs.commentFontSizeInput.value) : BASE_DEFAULT.fontSizes.comment,
                code: refs.codeFontSizeInput ? Number(refs.codeFontSizeInput.value) : BASE_DEFAULT.fontSizes.code
            },
            fonts: {
                comment: getFontValue('comment'),
                code: getFontValue('code')
            },
            fontStyles: {
                commentBold: Boolean(refs.commentBold?.checked),
                commentItalic: Boolean(refs.commentItalic?.checked),
                codeBold: Boolean(refs.codeBold?.checked),
                codeItalic: Boolean(refs.codeItalic?.checked)
            }
        };
    }

    function buildCommands() {
        const profile = mergeWithDefaults(gatherProfileFromForm());
        const jsonPayload = stringifyProfile(profile);
        const base64Payload = encodeBase64(jsonPayload);
        const npmCommand = `npm run html:export -- --style-config-b64 "${base64Payload}"`;
        const nodeCommand = `node Source/Tools/HTMLTools/export-project-direct-scan.cjs --style-config-b64 "${base64Payload}"`;

        return {
            profile,
            jsonPayload,
            base64Payload,
            npmCommand,
            nodeCommand
        };
    }

    function updateStatus(message, tone) {
        if (!refs.statusMessage) {
            return;
        }
        refs.statusMessage.textContent = message || '';
        refs.statusMessage.classList.remove('error', 'success');
        if (tone === 'error') {
            refs.statusMessage.classList.add('error');
        } else if (tone === 'success') {
            refs.statusMessage.classList.add('success');
        }
    }

    function appendLog(message) {
        if (!refs.runLog) {
            return;
        }
        const timestamp = new Date().toLocaleTimeString();
        refs.runLog.textContent += `[${timestamp}] ${message}\n`;
        refs.runLog.scrollTop = refs.runLog.scrollHeight;
    }

    function clearLog() {
        if (refs.runLog) {
            refs.runLog.textContent = '';
        }
    }

    function updateOutputs() {
        const data = buildCommands();

        if (refs.npmCommandOutput) {
            refs.npmCommandOutput.value = data.npmCommand;
        }
        if (refs.nodeCommandOutput) {
            refs.nodeCommandOutput.value = data.nodeCommand;
        }
        if (refs.styleJsonOutput) {
            refs.styleJsonOutput.value = data.jsonPayload;
        }

        let matchedKey = null;
        let matchedPreset = null;
        for (const [key, preset] of PRESET_REGISTRY.entries()) {
            if (profilesMatch(data.profile, preset)) {
                matchedKey = key;
                matchedPreset = preset;
                break;
            }
        }

        if (matchedKey && matchedPreset) {
            if (BUILTIN_KEYS.has(matchedKey)) {
                updateStatus(`Style matches preset "${matchedPreset.displayName}". You can also run with --style=${matchedKey}.`, 'success');
            } else if (matchedKey === 'custom') {
                updateStatus('Style matches the current custom configuration.', 'success');
            } else if (EXTERNAL_PRESET_KEYS.has(matchedKey)) {
                updateStatus(`Style matches external preset "${matchedPreset.displayName}".`, 'success');
            } else {
                updateStatus(`Style matches preset "${matchedPreset.displayName}".`, 'success');
            }
        } else {
            updateStatus('Custom style ready. Copy the command or run it directly.', null);
        }

        return {
            ...data,
            matchedKey,
            matchedPreset
        };
    }

    function selectPresetByKey(key, options = {}) {
        const desiredKey = PRESET_REGISTRY.has(key) ? key : (key === 'custom' ? key : 'default');

        if (desiredKey === 'custom' && !PRESET_REGISTRY.has('custom')) {
            if (options.userInitiated) {
                updateStatus('Load or save a custom preset before selecting it.', 'error');
                refs.presetSelect.value = activePresetKey;
            }
            return;
        }

        const preset = PRESET_REGISTRY.get(desiredKey) || PRESET_REGISTRY.get('default');
        if (!preset) {
            return;
        }

        activePresetKey = desiredKey;
        if (refs.presetSelect.value !== desiredKey) {
            refs.presetSelect.value = desiredKey;
        }

        applyProfileToForm(preset);
        updateOutputs();

        if (options.userInitiated) {
            updateStatus(`Preset "${preset.displayName}" applied.`, 'success');
        }
    }

    function handleManualAdjustment() {
        if (isApplyingPreset) {
            return;
        }

        const profile = mergeWithDefaults(gatherProfileFromForm());
        const baseline = PRESET_REGISTRY.get(activePresetKey);
        const baseName = baseline ? baseline.displayName : 'Custom';
        const displayName = activePresetKey === 'custom'
            ? (PRESET_REGISTRY.get('custom')?.displayName || 'Custom')
            : `Custom (${baseName})`;

        registerPreset('custom', { ...profile, displayName }, { custom: true });

        if (activePresetKey !== 'custom') {
            activePresetKey = 'custom';
            refs.presetSelect.value = 'custom';
            updateStatus('Switched to Custom after manual adjustment.', null);
        }

        updateOutputs();
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try {
                const success = document.execCommand('copy');
                if (!success) {
                    throw new Error('Copy command was rejected.');
                }
                resolve();
            } catch (error) {
                reject(error);
            } finally {
                textarea.remove();
            }
        });
    }

    function savePresetToFile(profile) {
        const presetProfile = mergeWithDefaults(profile || gatherProfileFromForm());
        const defaultLabel = PRESET_REGISTRY.get(activePresetKey)?.displayName || 'Custom Style';
        const userName = window.prompt('Preset name', defaultLabel) || '';
        if (!userName.trim()) {
            updateStatus('Save cancelled.', null);
            return;
        }

        const payload = {
            name: userName.trim(),
            createdAt: new Date().toISOString(),
            profile: presetProfile
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${createSlug(userName)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            anchor.remove();
        }, 0);

        updateStatus(`Preset saved as ${anchor.download}.`, 'success');
        appendLog(`Preset "${userName}" saved to ${anchor.download}.`);
    }

    function applyCustomPreset(payload, meta = {}) {
        const profileSource = payload && typeof payload === 'object'
            ? (payload.profile && typeof payload.profile === 'object' ? payload.profile : payload)
            : null;

        if (!profileSource) {
            throw new Error('Invalid preset structure.');
        }

        const displayName = payload.displayName || payload.name || meta.displayName || 'Custom';

        registerPreset('custom', { ...profileSource, displayName }, { custom: true });
        activePresetKey = 'custom';
        refs.presetSelect.value = 'custom';
        applyProfileToForm(PRESET_REGISTRY.get('custom'));
        updateOutputs();
        updateStatus(`Preset "${displayName}" loaded.`, 'success');
        const suffix = meta.fileName ? ` from ${meta.fileName}` : '';
        appendLog(`Preset "${displayName}" loaded${suffix}.`);
    }

    function handlePresetFileList(fileList) {
        if (!fileList || fileList.length === 0) {
            updateStatus('No preset file selected.', 'error');
            return;
        }

        const file = fileList[0];
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                applyCustomPreset(parsed, { fileName: file.name });
            } catch (error) {
                updateStatus(`Failed to load preset: ${error.message || error}`, 'error');
                appendLog(`Load error: ${error.message || error}`);
            }
        };
        reader.onerror = () => {
            updateStatus('Could not read preset file.', 'error');
        };
        reader.readAsText(file, 'utf-8');
    }

    function determineBaseDirectory(pathModule) {
        try {
            const pageUrl = new URL(window.location.href);
            if (pageUrl.protocol === 'file:') {
                let filePath = decodeURIComponent(pageUrl.pathname);
                if (/^\/[A-Za-z]:/.test(filePath)) {
                    filePath = filePath.slice(1);
                }
                return pathModule.dirname(filePath);
            }
        } catch (error) {
            // Ignore URL parsing issues
        }

        if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
            return pathModule.join(process.cwd(), 'Source', 'Tools', 'HTMLTools');
        }

        return null;
    }

    function generateExternalKey(name) {
        const base = createSlug(name || 'preset');
        let candidate = `external:${base}`;
        let counter = 2;
        while (PRESET_REGISTRY.has(candidate) || BUILTIN_KEYS.has(candidate) || candidate === 'custom') {
            candidate = `external:${base}-${counter++}`;
        }
        return candidate;
    }

    function registerExternalPreset(payload, meta = {}) {
        try {
            const profileSource = payload && typeof payload === 'object'
                ? (payload.profile && typeof payload.profile === 'object' ? payload.profile : payload)
                : null;

            if (!profileSource) {
                throw new Error('Invalid preset payload.');
            }

            const displayName = payload.displayName || payload.name || meta.displayName || 'Preset';
            let preferredKey = meta.key || payload.key || payload.name || displayName || meta.keyBase;
            preferredKey = preferredKey ? createSlug(preferredKey, 'preset') : null;

            let key = preferredKey;
            if (!key || (key && PRESET_REGISTRY.has(key) && !meta.replaceExisting)) {
                key = generateExternalKey(displayName || meta.keyBase || 'preset');
            }

            const overrides = {
                ...profileSource,
                displayName,
                name: key
            };

            const existing = PRESET_REGISTRY.get(key);
            registerPreset(
                key,
                overrides,
                {
                    displayName,
                    markExternal: true,
                    insertBefore: 'custom',
                    keepExistingLabel: Boolean(existing)
                }
            );

            return { key, displayName };
        } catch (error) {
            const name = meta.fileName || meta.displayName || 'external preset';
            console.warn(`Failed to register preset "${name}":`, error);
            appendLog(`Skipped preset "${name}": ${error.message || error}`);
            return null;
        }
    }

async function discoverExternalPresets() {
        clearExternalPresets();

        const discovered = [];
        const preloaded = Array.isArray(window.HTML_EXPORTER_PRESETS) ? window.HTML_EXPORTER_PRESETS : null;
        if (preloaded && preloaded.length) {
            preloaded.forEach(payload => {
                const registered = registerExternalPreset(payload, {
                    key: payload.key,
                    displayName: payload.displayName,
                    fileName: payload.fileName,
                    keyBase: payload.keyBase,
                    replaceExisting: true
                });
                if (registered && !discovered.includes(registered.displayName)) {
                    discovered.push(registered.displayName);
                }
            });
        }

        if (typeof window !== 'undefined' && typeof window.require === 'function') {
            try {
                const fs = window.require('fs');
                const path = window.require('path');
                const baseDir = determineBaseDirectory(path);
                if (baseDir) {
                    const presetDir = path.join(baseDir, 'StylePresets');
                    if (fs.existsSync(presetDir)) {
                        const entries = fs.readdirSync(presetDir);
                        entries
                            .filter(name => /\.json$/i.test(name))
                            .forEach(name => {
                                try {
                                    const raw = fs.readFileSync(path.join(presetDir, name), 'utf8');
                            const parsed = JSON.parse(raw);
                            const result = registerExternalPreset(parsed, { fileName: name, displayName: createSlug(name.replace(/\.json$/i, '')) });
                            if (result && !discovered.includes(result.displayName)) {
                                discovered.push(result.displayName);
                            }
                                } catch (error) {
                                    console.warn('Preset load error', name, error);
                                    appendLog(`Preset load error for ${name}: ${error.message || error}`);
                                }
                            });
                    }
                }
            } catch (error) {
                console.warn('Preset discovery via Node integration failed:', error);
                appendLog('Preset discovery via Node integration failed.');
            }
        }

        const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
        if (!isFileProtocol && discovered.length === 0) {
            try {
                const manifestUrl = new URL('StylePresets/presets-manifest.json', window.location.href);
                const response = await fetch(manifestUrl.toString(), { cache: 'no-store' });
                if (response.ok) {
                    const manifest = await response.json();
                    const presets = Array.isArray(manifest?.presets) ? manifest.presets : [];
                    for (const entry of presets) {
                        const relativePath = entry.path || entry.file || entry.href || entry.url;
                        if (!relativePath) {
                            continue;
                        }
                        try {
                            const presetUrl = new URL(relativePath, manifestUrl);
                            const presetResponse = await fetch(presetUrl.toString(), { cache: 'no-store' });
                            if (!presetResponse.ok) {
                                continue;
                            }
                            const payload = await presetResponse.json();
                            const result = registerExternalPreset(payload, { displayName: entry.name, fileName: relativePath, key: payload?.key });
                            if (result && !discovered.includes(result.displayName)) {
                                discovered.push(result.displayName);
                            }
                        } catch (error) {
                            console.warn('Preset fetch failed', relativePath, error);
                            appendLog(`Preset fetch failed for ${relativePath}: ${error.message || error}`);
                        }
                    }
                }
            } catch (error) {
                // Silent fallback when manifest is unavailable
            }
        } else if (isFileProtocol && discovered.length === 0) {
            appendLog('Preset manifest fetch skipped (file:// protocol does not support fetch).');
        }

        if (discovered.length > 0) {
            appendLog(`Discovered ${discovered.length} preset${discovered.length === 1 ? '' : 's'} from StylePresets.`);
        }
    }

    function initialiseBuiltInPresets() {
        registerPreset('default', { ...BASE_DEFAULT, displayName: 'Default' }, { displayName: 'Default', builtin: true });

        registerPreset('style1', {
            maxWidth: 80,
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
        }, { displayName: 'Style 1 - Evergreen', builtin: true });

        registerPreset('style2', {
            maxWidth: 80,
            colors: {
                comment: '#6a9955',
                keyword: '#569cd6',
                string: '#c586c0',
                number: '#b5cea8',
                function: '#dcdcaa',
                type: '#4ec9b0',
                variable: '#9cdcfe',
                operator: '#d4d4d4'
            },
            fontSizes: {
                comment: 11,
                code: 12
            },
            fonts: {
                comment: '"Source Serif Pro", serif',
                code: '"Consolas", "Courier New", monospace'
            },
            fontStyles: {
                commentBold: false,
                commentItalic: true,
                codeBold: false,
                codeItalic: false
            }
        }, { displayName: 'Style 2 - Midnight', builtin: true });

        registerPreset('style3', {
            maxWidth: 80,
            colors: {
                comment: '#586e75',
                keyword: '#cb4b16',
                string: '#2aa198',
                number: '#b58900',
                function: '#268bd2',
                type: '#6c71c4',
                variable: '#859900',
                operator: '#657b83'
            },
            fontSizes: {
                comment: 12,
                code: 13
            },
            fonts: {
                comment: '"Palatino Linotype", "Book Antiqua", serif',
                code: '"Source Code Pro", "Courier New", monospace'
            },
            fontStyles: {
                commentBold: false,
                commentItalic: false,
                codeBold: true,
                codeItalic: false
            }
        }, { displayName: 'Style 3 - Solar', builtin: true });

        registerPreset('style4', {
            maxWidth: 80,
            colors: {
                comment: '#4b5563',
                keyword: '#111827',
                string: '#1f2937',
                number: '#334155',
                function: '#0f172a',
                type: '#1e293b',
                variable: '#1f2937',
                operator: '#020617'
            },
            fontSizes: {
                comment: 10,
                code: 12
            },
            fonts: {
                comment: '"Helvetica Neue", Arial, sans-serif',
                code: '"IBM Plex Mono", "Courier New", monospace'
            },
            fontStyles: {
                commentBold: false,
                commentItalic: false,
                codeBold: false,
                codeItalic: false
            }
        }, { displayName: 'Style 4 - Mono', builtin: true });

        ensurePresetOption('custom', { datasetSource: 'custom', label: findPresetOption('custom')?.textContent || 'Custom' });
    }

    function attachEventListeners() {
        refs.presetSelect.addEventListener('change', () => {
            selectPresetByKey(refs.presetSelect.value, { userInitiated: true });
        });

        if (refs.restorePresetBtn) {
            refs.restorePresetBtn.addEventListener('click', () => {
                const key = refs.presetSelect.value;
                if (key === 'custom' && !PRESET_REGISTRY.has('custom')) {
                    updateStatus('Load or save a custom preset before restoring it.', 'error');
                    return;
                }
                const preset = PRESET_REGISTRY.get(key) || PRESET_REGISTRY.get('default');
                if (preset) {
                    applyProfileToForm(preset);
                    updateOutputs();
                    updateStatus(`Restored preset "${preset.displayName}".`, 'success');
                }
            });
        }

        CUSTOMIZATION_CONTROLS.forEach(control => {
            control.addEventListener('input', handleManualAdjustment);
            control.addEventListener('change', handleManualAdjustment);
        });

        if (refs.styleForm) {
            refs.styleForm.addEventListener('submit', event => {
                event.preventDefault();
                const data = updateOutputs();
                appendLog('Command updated.');
                if (data.matchedKey && data.matchedKey !== 'default') {
                    const preset = PRESET_REGISTRY.get(data.matchedKey);
                    if (preset) {
                        appendLog(`Preset "${preset.displayName}" detected.`);
                    }
                }
            });
        }

        if (refs.copyNpmBtn) {
            refs.copyNpmBtn.addEventListener('click', () => {
                const { npmCommand } = updateOutputs();
                copyToClipboard(npmCommand)
                    .then(() => updateStatus('npm command copied to clipboard.', 'success'))
                    .catch(error => updateStatus(`Copy failed: ${error.message || error}`, 'error'));
            });
        }

        if (refs.copyNodeBtn) {
            refs.copyNodeBtn.addEventListener('click', () => {
                const { nodeCommand } = updateOutputs();
                copyToClipboard(nodeCommand)
                    .then(() => updateStatus('Node command copied to clipboard.', 'success'))
                    .catch(error => updateStatus(`Copy failed: ${error.message || error}`, 'error'));
            });
        }

        if (refs.savePresetBtn) {
            refs.savePresetBtn.addEventListener('click', () => {
                savePresetToFile(gatherProfileFromForm());
            });
        }

        if (refs.loadPresetBtn && refs.loadPresetInput) {
            refs.loadPresetBtn.addEventListener('click', () => {
                refs.loadPresetInput.value = '';
                refs.loadPresetInput.click();
            });
            refs.loadPresetInput.addEventListener('change', event => {
                handlePresetFileList(event.target.files);
                event.target.value = '';
            });
        }

        if (refs.clearLogBtn) {
            refs.clearLogBtn.addEventListener('click', () => {
                clearLog();
                updateStatus('Log cleared.', null);
            });
        }
    }

    function initialise() {
        initialiseBuiltInPresets();
        attachEventListeners();

        clearLog();
        updateStatus('Choose a style preset or customize below.', null);
        selectPresetByKey('default');
        appendLog('HTML Exporter ready.');

        discoverExternalPresets().catch(error => {
            appendLog(`Preset discovery error: ${error.message || error}`);
        });
    }

    initialise();
})();
