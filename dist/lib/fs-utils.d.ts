/// <reference types="node" />
import type { PathLike } from "node:fs";
/**
 * Asynchronously checks if the given path exists
 * @param path The path to check for existence
 * @returns `true` if the path exists, `false` otherwise
 */
export declare function exists(path: PathLike): Promise<boolean>;
/**
 * Recursively creates a directory if it does not exist.
 * @param path The path to check for existence and create if it doesn't exist.
 */
export declare function ensureDir(path: PathLike): Promise<void>;
//# sourceMappingURL=fs-utils.d.ts.map