import * as child_process from "child_process";
import * as fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

let EXECUTABLE_DIRECTORY: string;
// Detect if in pkg executable
// @ts-ignore
if (process.pkg?.entrypoint) {
    EXECUTABLE_DIRECTORY = path.dirname(process.execPath);
} else {
    try {
        EXECUTABLE_DIRECTORY = __dirname
    } catch (e) {
        EXECUTABLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
    }
}
let LIBRARY_PATH = path.join(EXECUTABLE_DIRECTORY, "lib");

export async function delay(seconds: number) {
    return new Promise<void>(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}

export async function execute(command: string, args: string[], options: {
    cwd?: string,
    stdoutPath?: string
}) {
    console.log(`[${path.parse(command).base}]: Starting process`)
    if (options.stdoutPath) {
        await fs.promises.mkdir(path.parse(options.stdoutPath).dir, {
            recursive: true
        });
    }
    const childProcess = child_process.spawn(command, args, {
        cwd: options.cwd,
    });
    const stdout = childProcess.stdout;
    let stream: fs.WriteStream | undefined;
    if (options.stdoutPath && stdout) {
        stream = fs.createWriteStream(options.stdoutPath);
        childProcess.stdout?.pipe(stream);
    } else {
        childProcess.stdout.pipe(process.stdout);
    }
    childProcess.stderr.on("data", e => {
        console.error(`[${path.parse(command).base}]: ${e}`)
    })
    await new Promise<void>(resolve => {
        function exit(code: number|null) {
            stream?.close();
            console.log(`[${path.parse(command).base}]: Exit with code ${code}`);
            childProcess.off("exit", exit);
            resolve();
        }

        childProcess.on("exit", exit);
    });
}

export function getPathFromLibraryRoot(relPath: string) {
    return path.join(LIBRARY_PATH, relPath);
}


export function isWithin(outer: string, inner: string) {
    const rel = path.relative(outer, inner);
    return !!rel && !rel.startsWith('..' + path.sep) && rel !== '..';
}
