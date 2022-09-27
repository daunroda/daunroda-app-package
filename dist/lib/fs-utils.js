"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDir = exports.exists = void 0;
const promises_1 = require("fs/promises");
/**
 * Asynchronously checks if the given path exists
 * @param path The path to check for existence
 * @returns `true` if the path exists, `false` otherwise
 */
async function exists(path) {
    try {
        await (0, promises_1.access)(path);
        return true;
    }
    catch {
        return false;
    }
}
exports.exists = exists;
/**
 * Recursively creates a directory if it does not exist.
 * @param path The path to check for existence and create if it doesn't exist.
 */
async function ensureDir(path) {
    if (!(await exists(path)))
        await (0, promises_1.mkdir)(path, {
            recursive: true,
            mode: 0o777
        });
}
exports.ensureDir = ensureDir;
//# sourceMappingURL=fs-utils.js.map