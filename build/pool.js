import EventEmitter from "events";
export default class PromisePool {
    constructor(maxTasks = 20) {
        this._maxTasks = 500;
        this._pool = new Set();
        this._emitter = new EventEmitter();
        this._maxTasks = maxTasks;
    }
    async execute(callback) {
        // Repeated callback instances will not interfere with each other.
        const uniqueCallback = () => callback();
        return await this._execute(uniqueCallback);
    }
    async _waitUntilPoolReady() {
        while (this._pool.size >= this._maxTasks) {
            await new Promise((resolve) => {
                const resolver = () => {
                    resolve();
                    this._emitter.off("taskComplete", resolver);
                };
                this._emitter.on("taskComplete", resolver);
            });
        }
    }
    async _execute(callback) {
        await this._waitUntilPoolReady();
        const promise = callback();
        this._pool.add(promise);
        try {
            return await promise;
        }
        finally {
            this._pool.delete(promise);
            this._emitter.emit("taskComplete");
        }
    }
}
