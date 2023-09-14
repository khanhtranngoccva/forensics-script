import * as child_process from "child_process";
import * as fs from "fs";
import path from "path";
export async function delay(seconds) {
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}
export async function execute(command, args, options) {
    console.log(`[${path.parse(command).base}]: Starting process`);
    if (options.stdoutPath) {
        await fs.promises.mkdir(path.parse(options.stdoutPath).dir, {
            recursive: true
        });
    }
    const childProcess = child_process.spawn(command, args, {
        cwd: options.cwd,
    });
    const stdout = childProcess.stdout;
    let stream;
    if (options.stdoutPath && stdout) {
        stream = fs.createWriteStream(options.stdoutPath);
        childProcess.stdout?.pipe(stream);
    }
    else {
        childProcess.stdout.pipe(process.stdout);
    }
    childProcess.stderr.on("data", e => {
        console.error(`[${path.parse(command).base}]: ${e}`);
    });
    await new Promise(resolve => {
        function exit(code) {
            stream?.close();
            console.log(`[${path.parse(command).base}]: Exit with code ${code}`);
            childProcess.off("exit", exit);
            resolve();
        }
        childProcess.on("exit", exit);
    });
}
export function getPathFromLibraryRoot(relPath) {
    return path.join(__dirname, "lib", relPath);
}
export function isWithin(outer, inner) {
    const rel = path.relative(outer, inner);
    return !!rel && !rel.startsWith('..' + path.sep) && rel !== '..';
}
