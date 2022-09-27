"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDir = exports.exists = void 0;
const tslib_1 = require("tslib");
const promises_1 = require("node:fs/promises");
/**
 * Asynchronously checks if the given path exists
 * @param path The path to check for existence
 * @returns `true` if the path exists, `false` otherwise
 */
function exists(path) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        try {
            yield (0, promises_1.access)(path);
            return true;
        }
        catch (_a) {
            return false;
        }
    });
}
exports.exists = exists;
/**
 * Recursively creates a directory if it does not exist.
 * @param path The path to check for existence and create if it doesn't exist.
 */
function ensureDir(path) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        if (!(yield exists(path)))
            yield (0, promises_1.mkdir)(path, {
                recursive: true,
                mode: 0o777
            });
    });
}
exports.ensureDir = ensureDir;
//# sourceMappingURL=fs-utils.js.map