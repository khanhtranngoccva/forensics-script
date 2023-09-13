import sniffClipboard from "./clipboard.js";
import path from "path";
import {OUT_DIR} from "./root.js";
import 'dotenv/config.js';
import {getIpConfig, getPromiscuousAdapters, memoryDump, PsUtils} from "./volatile.js";
import {extractDirectory, scanEntireDirectory} from "./nonvolatile.js";
import PromisePool from "./pool.js";
import * as fs from "fs";
import {isWithin} from "./helpers.js";

async function main() {
    // First step - enable clipboard sniffing.
    const clipboardHandle = sniffClipboard({
        outDir: path.join(OUT_DIR),
        duration: Infinity,
    });
    // Second step - get running processes and multiple other volatile data from memory like current users, network connections, and so on.
    const psutils = new PsUtils();
    const volatileFetchSteps = [
        psutils.getProcessList({
            outDir: OUT_DIR,
        }),
        psutils.getLoggedOnUsers({
            outDir: OUT_DIR,
        }),
        psutils.getServices({
            outDir: OUT_DIR,
        }),
        getIpConfig({
            outDir: OUT_DIR,
        }),
        getPromiscuousAdapters({
            outDir: OUT_DIR,
        }),
    ];
    await Promise.all(volatileFetchSteps);
    // Step 3: Complete memory dump. Takes quite some time.
    await memoryDump({
        outDir: OUT_DIR
    });
    // Step 4: Perform a disk copy of all files like documents or images.
    await extractDirectory("C:\\", path.join(OUT_DIR, "extracted_files"));
    // Step 5: Cleanup.
    clipboardHandle.abort("End script - stopping clipboard sniffer.");
}

main().then();
