(function (global) {
    'use strict';

    const KEYWORDS = {
        csharp: [
            'public', 'private', 'protected', 'internal', 'static', 'void', 'class', 'interface', 'namespace',
            'using', 'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'break', 'continue',
            'return', 'new', 'this', 'base', 'var', 'const', 'readonly', 'async', 'await', 'try', 'catch',
            'finally', 'throw', 'string', 'int', 'bool', 'float', 'double', 'decimal', 'long', 'short',
            'byte', 'char', 'object', 'dynamic', 'override', 'virtual', 'abstract', 'sealed', 'partial',
            'get', 'set', 'value', 'enum', 'struct', 'delegate', 'event', 'true', 'false', 'null'
        ],
        javascript: [
            'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
            'break', 'continue', 'return', 'new', 'this', 'class', 'extends', 'constructor', 'async',
            'await', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'default', 'from', 'typeof',
            'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'
        ],
        java: [
            'public', 'private', 'protected', 'static', 'void', 'class', 'interface', 'extends', 'implements',
            'package', 'import', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
            'return', 'new', 'this', 'super', 'final', 'abstract', 'synchronized', 'volatile', 'try', 'catch',
            'finally', 'throw', 'throws', 'String', 'int', 'boolean', 'float', 'double', 'long', 'short',
            'byte', 'char', 'Object', 'true', 'false', 'null'
        ],
        python: [
            'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'return', 'import',
            'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'async', 'await',
            'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'pass', 'global', 'nonlocal'
        ],
        cpp: [
            'public', 'private', 'protected', 'static', 'void', 'class', 'struct', 'namespace', 'using',
            'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'new',
            'delete', 'this', 'const', 'virtual', 'override', 'template', 'typename', 'try', 'catch',
            'throw', 'int', 'bool', 'float', 'double', 'char', 'long', 'short', 'unsigned', 'signed',
            'true', 'false', 'nullptr', 'auto'
        ],
        css: [
            'color', 'background', 'margin', 'padding', 'border', 'width', 'height', 'display', 'flex',
            'grid', 'position', 'top', 'left', 'right', 'bottom', 'font', 'text', 'hover', 'active',
            'before', 'after', 'important', 'inherit', 'initial', 'unset'
        ],
        html: [
            'div', 'span', 'p', 'a', 'img', 'input', 'button', 'form', 'table', 'tr', 'td', 'th',
            'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'nav', 'section',
            'article', 'main', 'aside', 'script', 'style', 'link', 'meta', 'title', 'body', 'html'
        ]
    };

    KEYWORDS.json = KEYWORDS.javascript;

    const DECORATIVE_CHARS = new Set(['=', '-', '*', '_', '#', '~']);

    const DEFAULT_COLORS = {
        comment: '#228b22',
        keyword: '#0000ff',
        string: '#a31515',
        number: '#098658',
        function: '#795e26',
        type: '#267f99',
        variable: '#001080',
        operator: '#000000'
    };

    const DEFAULT_FONT_SIZES = {
        comment: 11,
        code: 12
    };

    const DEFAULT_FONTS = {
        comment: "'Bookman Old Style', serif",
        code: "'Courier New', Courier, monospace"
    };

    const DEFAULT_FONT_STYLES = {
        commentBold: false,
        commentItalic: false,
        codeBold: true,
        codeItalic: false
    };

    function escapeHtml(text) {
        if (text === null || text === undefined) {
            return '';
        }

        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };

        return String(text).replace(/[&<>"']/g, function (m) {
            return map[m];
        });
    }

    function decodeHtmlEntities(text) {
        if (!text) {
            return '';
        }

        return String(text)
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
    }

    function stripHtmlTags(html) {
        if (!html) {
            return '';
        }
        return html.replace(/<\/?[^>]+>/g, '');
    }

    function htmlToPlainText(html) {
        return decodeHtmlEntities(stripHtmlTags(html));
    }

    function highlightSyntax(code, language) {
        const keywords = KEYWORDS[language] || KEYWORDS.csharp;

        const lines = code.split('\n');
        const highlighted = [];
        let inMultiLineComment = false;
        let inString = false;
        let stringChar = '';

        for (let line of lines) {
            let result = '';
            let i = 0;

            while (i < line.length) {
            if (!inString && (language === 'csharp' || language === 'javascript' || language === 'json' || language === 'java' || language === 'cpp' || language === 'css')) {
                    if (!inMultiLineComment && line.substr(i, 2) === '/*') {
                        inMultiLineComment = true;
                        let end = line.indexOf('*/', i + 2);
                        if (end === -1) {
                            let commentText = line.substr(i + 2).replace(/^\s*\*\s?/, '').trim();
                            if (commentText) {
                                result += '<span class="comment">' + escapeHtml(commentText) + '</span>';
                            }
                            i = line.length;
                            continue;
                        } else {
                            let commentText = line.substr(i + 2, end - i - 2).replace(/^\s*\*\s?/, '').trim();
                            if (commentText) {
                                result += '<span class="comment">' + escapeHtml(commentText) + '</span>';
                            }
                            inMultiLineComment = false;
                            i = end + 2;
                            continue;
                        }
                    }
                    if (inMultiLineComment) {
                        let end = line.indexOf('*/', i);
                        if (end === -1) {
                            let commentText = line.substr(i).replace(/^\s*\*\s?/, '').trim();
                            if (commentText) {
                                result += '<span class="comment">' + escapeHtml(commentText) + '</span>';
                            }
                            i = line.length;
                            continue;
                        } else {
                            let commentText = line.substr(i, end - i).replace(/^\s*\*\s?/, '').trim();
                            if (commentText) {
                                result += '<span class="comment">' + escapeHtml(commentText) + '</span>';
                            }
                            inMultiLineComment = false;
                            i = end + 2;
                            continue;
                        }
                    }
                }

                if (!inString) {
                    if ((language === 'csharp' || language === 'javascript' || language === 'java' || language === 'cpp') && line.substr(i, 2) === '//') {
                        let commentText = line.substr(i + 2).trim();
                        result += '<span class="comment">' + escapeHtml(commentText) + '</span>';
                        break;
                    }
                    if ((language === 'python' || language === 'css') && line[i] === '#') {
                        let commentText = line.substr(i + 1).trim();
                        result += '<span class="comment">' + escapeHtml(commentText) + '</span>';
                        break;
                    }
                    if (language === 'html' && line.substr(i, 4) === '<!--') {
                        let end = line.indexOf('-->', i);
                        if (end === -1) {
                            let commentText = line.substr(i + 4).trim();
                            result += '<span class="comment">' + escapeHtml(commentText) + '</span>';
                            break;
                        } else {
                            let commentText = line.substr(i + 4, end - i - 4).trim();
                            result += '<span class="comment">' + escapeHtml(commentText) + '</span>';
                            i = end + 3;
                            continue;
                        }
                    }
                }

                if ((line[i] === '"' || line[i] === "'" || line[i] === '`') && !inString) {
                    inString = true;
                    stringChar = line[i];
                    let stringStart = i;
                    i++;
                    while (i < line.length) {
                        if (line[i] === '\\') {
                            i += 2;
                            continue;
                        }
                        if (line[i] === stringChar) {
                            i++;
                            result += '<span class="string">' + escapeHtml(line.substring(stringStart, i)) + '</span>';
                            inString = false;
                            break;
                        }
                        i++;
                    }
                    if (inString) {
                        result += '<span class="string">' + escapeHtml(line.substr(stringStart)) + '</span>';
                        break;
                    }
                    continue;
                }

                if (/\d/.test(line[i])) {
                    let numStart = i;
                    while (i < line.length && /[\d.]/.test(line[i])) {
                        i++;
                    }
                    result += '<span class="number">' + escapeHtml(line.substring(numStart, i)) + '</span>';
                    continue;
                }

                if (/[a-zA-Z_]/.test(line[i])) {
                    let wordStart = i;
                    while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
                        i++;
                    }
                    let word = line.substring(wordStart, i);

                    if (keywords.includes(word)) {
                        result += '<span class="keyword">' + escapeHtml(word) + '</span>';
                    } else if (i < line.length && line[i] === '(') {
                        result += '<span class="function">' + escapeHtml(word) + '</span>';
                    } else if (/^[A-Z]/.test(word)) {
                        result += '<span class="type">' + escapeHtml(word) + '</span>';
                    } else {
                        result += '<span class="variable">' + escapeHtml(word) + '</span>';
                    }
                    continue;
                }

                result += '<span class="operator">' + escapeHtml(line[i]) + '</span>';
                i++;
            }

            highlighted.push(result);
        }

        return highlighted;
    }

    function analyzeDecorativeLine(line) {
        if (!line) {
            return null;
        }

        const match = line.match(/^(\s*)([=\-*#_~]{3,})\s*$/);
        if (!match) {
            return null;
        }

        const leading = match[1];
        const pattern = match[2];
        const char = pattern[0];

        if (!DECORATIVE_CHARS.has(char)) {
            return null;
        }

        for (let i = 1; i < pattern.length; i++) {
            if (pattern[i] !== char) {
                return null;
            }
        }

        return { leading, char };
    }

    function formatDecorativeLine(line, maxWidth) {
        const info = analyzeDecorativeLine(line);
        if (!info) {
            return null;
        }

        const availableWidth = Math.max(maxWidth - info.leading.length, 0);
        if (availableWidth === 0) {
            return info.leading;
        }

        return info.leading + info.char.repeat(availableWidth);
    }

    function wrapLine(line, maxWidth, indent) {
        const decorativeLine = formatDecorativeLine(line, maxWidth);
        if (decorativeLine) {
            return [decorativeLine];
        }

        const indentLength = indent ? indent.length : 0;
        if (indentLength >= maxWidth) {
            return [line];
        }

        if (line.length <= maxWidth) {
            return [line];
        }

        const lines = [];
        let remaining = line;

        while (remaining.length > maxWidth) {
            let breakPoint = maxWidth;

            for (let i = maxWidth; i > maxWidth - 30 && i > indent.length; i--) {
                const char = remaining[i];
                if ([' ', ',', ';', '.', '(', ')', '{', '}', '[', ']', '>', '<'].includes(char)) {
                    breakPoint = i + 1;
                    break;
                }
            }

            lines.push(remaining.substring(0, breakPoint).trimEnd());
            remaining = indent + remaining.substring(breakPoint).trimStart();
        }

        if (remaining.trim()) {
            lines.push(remaining);
        }

        return lines;
    }

    function isCommentOnlyLine(htmlLine) {
        if (!htmlLine) {
            return false;
        }

        const trimmed = htmlLine.trim();
        if (!trimmed) {
            return false;
        }

        return /^<span class="comment">[\s\S]*<\/span>$/.test(trimmed);
    }

    function processCommentGroup(commentLines, maxWidth) {
        const entries = [];
        let buffer = [];
        let hasOutputText = false;

        const addBlankEntry = () => {
            if (entries.length === 0 || entries[entries.length - 1].type === 'blank') {
                return;
            }
            entries.push({ type: 'blank', text: '' });
        };

        const flushBuffer = () => {
            if (buffer.length === 0) {
                return;
            }

            const paragraph = buffer.join(' ').replace(/\s+/g, ' ').trim();
            if (paragraph) {
                const wrapped = wrapLine(paragraph, maxWidth, '');
                wrapped.forEach(line => {
                    entries.push({ type: 'text', text: line });
                    hasOutputText = true;
                });
            }

            buffer = [];
        };

        commentLines.forEach(line => {
            const raw = line || '';
            const trimmed = raw.trim();

            if (!trimmed) {
                flushBuffer();
                addBlankEntry();
                return;
            }

            const decorative = formatDecorativeLine(raw, maxWidth);
            if (decorative) {
                flushBuffer();
                entries.push({ type: 'decorative', text: decorative });
                if (hasOutputText) {
                    addBlankEntry();
                }
                hasOutputText = false;
                return;
            }

            buffer.push(trimmed);
        });

        flushBuffer();

        while (entries.length && entries[entries.length - 1].type === 'blank') {
            entries.pop();
        }

        return entries.map(entry => {
            if (entry.type === 'blank') {
                return '&nbsp;';
            }
            return '<span class="comment">' + escapeHtml(entry.text) + '</span>';
        });
    }

    function formatHighlightedLines(code, language, maxWidth) {
        const highlightedLines = highlightSyntax(code, language);
        const finalLines = [];

        for (let i = 0; i < highlightedLines.length; i++) {
            const htmlLine = highlightedLines[i];

            if (isCommentOnlyLine(htmlLine)) {
                const commentGroup = [];
                let j = i;

                while (j < highlightedLines.length) {
                    const candidate = highlightedLines[j];
                    if (isCommentOnlyLine(candidate)) {
                        commentGroup.push(htmlToPlainText(candidate));
                        j++;
                        continue;
                    }

                    if ((candidate || '').trim() === '') {
                        commentGroup.push('');
                        j++;
                        continue;
                    }

                    break;
                }

                const processedGroup = processCommentGroup(commentGroup, maxWidth);
                finalLines.push(...processedGroup);
                i = j - 1;
                continue;
            }

            const textContent = htmlToPlainText(htmlLine);
            const indentMatch = textContent.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';

            if (!textContent) {
                finalLines.push(htmlLine);
                continue;
            }

            const resizedDecorative = formatDecorativeLine(textContent, maxWidth);
            if (resizedDecorative) {
                finalLines.push(escapeHtml(resizedDecorative));
                continue;
            }

            if (textContent.length <= maxWidth) {
                finalLines.push(htmlLine);
                continue;
            }

            const wrapped = wrapLine(textContent, maxWidth, indent);
            if (htmlLine && htmlLine.includes('<span class="comment">')) {
                for (let wrappedText of wrapped) {
                    finalLines.push('<span class="comment">' + escapeHtml(wrappedText) + '</span>');
                }
            } else {
                for (let wrappedText of wrapped) {
                    const reHighlighted = highlightSyntax(wrappedText, language);
                    finalLines.push(reHighlighted[0] || '');
                }
            }
        }

        return finalLines;
    }

    function createStandaloneHTML(lines, language, maxWidth, colors, fontSizes, fonts, fontStyles) {
        const languageNames = {
            csharp: 'C#',
            javascript: 'JavaScript',
            java: 'Java',
            python: 'Python',
            cpp: 'C++',
            css: 'CSS',
            html: 'HTML',
            json: 'JSON'
        };
        const languageName = languageNames[language] || (language || '').toUpperCase();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Formatted Code - ${languageName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: ${fonts.code};
            background: #ffffff;
            padding: 3rem;
            color: #000000;
            line-height: 1.6;
            font-size: ${fontSizes.code}pt;
            font-weight: ${fontStyles.codeBold ? 'bold' : 'normal'};
            font-style: ${fontStyles.codeItalic ? 'italic' : 'normal'};
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: #ffffff;
        }

        .code-container {
            background: #ffffff;
            padding: 0;
        }

        .code-line {
            white-space: pre-wrap;
            word-wrap: break-word;
            margin-bottom: 0.1rem;
        }

        .comment {
            color: ${colors.comment};
            font-size: ${fontSizes.comment}pt;
            font-family: ${fonts.comment};
            font-weight: ${fontStyles.commentBold ? 'bold' : 'normal'};
            font-style: ${fontStyles.commentItalic ? 'italic' : 'normal'};
        }

        .keyword {
            color: ${colors.keyword};
            font-weight: 600;
        }

        .string {
            color: ${colors.string};
        }

        .number {
            color: ${colors.number};
        }

        .function {
            color: ${colors.function};
        }

        .operator {
            color: ${colors.operator};
        }

        .type {
            color: ${colors.type};
        }

        .variable {
            color: ${colors.variable};
        }

        @media print {
            body {
                padding: 1rem;
            }

            .code-container {
                border: none;
                padding: 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="code-container">
${lines.map(line => `            <div class="code-line">${line}</div>`).join('\n')}
        </div>
    </div>
</body>
</html>`;
    }

    function resolveStyles(options) {
        const resolvedColors = Object.assign({}, DEFAULT_COLORS, options.colors || {});
        const resolvedFontSizes = Object.assign({}, DEFAULT_FONT_SIZES, options.fontSizes || {});
        const resolvedFonts = Object.assign({}, DEFAULT_FONTS, options.fonts || {});
        const resolvedFontStyles = Object.assign({}, DEFAULT_FONT_STYLES, options.fontStyles || {});

        return {
            colors: resolvedColors,
            fontSizes: resolvedFontSizes,
            fonts: resolvedFonts,
            fontStyles: resolvedFontStyles
        };
    }

    function formatCode(options) {
        const safeOptions = options || {};
        const code = safeOptions.code || '';
        const language = safeOptions.language || 'javascript';
        const maxWidth = typeof safeOptions.maxWidth === 'number' ? safeOptions.maxWidth : 80;
        const { colors, fontSizes, fonts, fontStyles } = resolveStyles(safeOptions);

        const lines = formatHighlightedLines(code, language, maxWidth);
        const standaloneHtml = createStandaloneHTML(lines, language, maxWidth, colors, fontSizes, fonts, fontStyles);

        return {
            lines,
            standaloneHtml,
            styles: {
                colors,
                fontSizes,
                fonts,
                fontStyles
            },
            language,
            maxWidth
        };
    }

    const api = {
        KEYWORDS,
        escapeHtml,
        decodeHtmlEntities,
        htmlToPlainText,
        highlightSyntax,
        analyzeDecorativeLine,
        formatDecorativeLine,
        wrapLine,
        isCommentOnlyLine,
        processCommentGroup,
        formatHighlightedLines,
        createStandaloneHTML,
        formatCode,
        DEFAULT_COLORS,
        DEFAULT_FONT_SIZES,
        DEFAULT_FONTS,
        DEFAULT_FONT_STYLES
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        global.CodePresenterCore = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
