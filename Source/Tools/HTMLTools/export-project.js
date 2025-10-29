import path from 'path';
import { pathToFileURL } from 'url';
import cjsModule from './export-project.cjs';

const { exportProject } = cjsModule;

export { exportProject };
export default exportProject;

const isMainModule = (() => {
    if (typeof process === 'undefined' || !process.argv || process.argv.length === 0) {
        return false;
    }
    try {
        const entryUrl = pathToFileURL(process.argv[1]).href;
        return import.meta.url === entryUrl;
    } catch (error) {
        return false;
    }
})();

if (isMainModule) {
    exportProject().catch(error => {
        const message = error && error.message ? error.message : error;
        if (typeof console !== 'undefined' && console.error) {
            console.error('Export failed:', message);
        }
        if (typeof process !== 'undefined' && typeof process.exit === 'function') {
            process.exit(1);
        }
    });
}
