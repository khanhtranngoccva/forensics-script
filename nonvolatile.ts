import * as fs from "fs";
import path from "path";
import PromisePool from "./pool.js";
import {isWithin} from "./helpers.js";
import {OUT_DIR} from "./root.js";

export function scanEntireDirectory(directory: string = "C:\\", extensions: string[]) {
    const extensionSet = new Set(extensions);

    async function* scanDirectory(targetDir: string): AsyncGenerator<string> {
        try {
            const entries = await fs.promises.readdir(targetDir);
            for (let entry of entries) {
                const actualPath = path.join(targetDir, entry);
                try {
                    const stat = await fs.promises.stat(actualPath);
                    if (stat.isDirectory()) {
                        for await (let childFile of scanDirectory(actualPath)) {
                            yield childFile;
                        }
                    } else if (extensionSet.has(path.parse(actualPath).ext)) {
                        yield actualPath;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    return scanDirectory(directory);
}

export async function extractDirectory(directory: string, saveDir: string, extensions: string[]) {
    const pool = new PromisePool(100);
    const startTime = performance.now();
    let filesCopied = 0;
    for await (let file of scanEntireDirectory(directory, extensions)) {
        // Never copy or duplicate itself.
        if (isWithin(OUT_DIR, file)) {
            console.warn(`Skipping file ${file} as it overlaps with ${OUT_DIR}. 
Avoid setting output directory file inside the directory to be scanned.`);
            continue;
        }
        const destPath = path.join(saveDir, "extracted_files", file.replaceAll(":", ""));
        const task = async () => {
            await fs.promises.cp(file, destPath, {
                recursive: true,
            });
            filesCopied++;
            const endTime = performance.now();
            console.log(`Files copied: ${filesCopied}, Copy speed: ${filesCopied / ((endTime - startTime) / 1000)} files/second`);
        };
        await pool.execute(task);
    }
}
