import sniffClipboard from "./clipboard.js";
import path from "path";
import {OUT_DIR} from "./root.js";


async function main() {
    const clipboardHandle = sniffClipboard({
        outDir: path.join(OUT_DIR)
    });

}

main().then();
