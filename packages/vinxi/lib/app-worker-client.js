import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { Worker } from "node:worker_threads";

import invariant from "./invariant.js";

const require = createRequire(import.meta.url);

// TODO: Use something other than JSON for worker communication.
/**
 * Create a worker thread that will be used to render RSC chunks.
 * @param {string} buildPath Absolute path to the the built RSC bundle.
 * @param {() => void} onReload Called when the worker reloads.
 */

// class WorkerReadableStream extends Readable {
//   constructor(worker) {
//     super({ objectMode: true });
//     this.worker = worker;
//     this.worker.on('message', this.handleWorkerMessage.bind(this));
//     this.worker.on('error', this.handleWorkerError.bind(this));
//     this.worker.on('exit', this.handleWorkerExit.bind(this));
//   }

//   _read() {
//     // Do nothing since we are listening to worker messages
//   }

//   handleWorkerMessage(message) {
//     // Push the received message to the stream
//     this.push({ chunk: message });
//   }

//   handleWorkerError(err) {
//     // Emit the error event if any error occurs
//     this.emit('error', err);
//   }

//   handleWorkerExit(code) {
//     // If the worker exits, end the stream by pushing the "end" chunk
//     this.push({ chunk: 'end' });
//   }
// }

export class AppWorkerClient {
	/** @type {import('node:worker_threads').Worker | null} */
	worker = null;

	/** @type {Map<string, (event: any) => void>} */
	responses = new Map();

	url;
	constructor(url) {
		this.url = url;
	}

	/**
   *
  //  * @param {() => void} onReload
   */
	async init(onReload) {
		if (this.worker) {
			return;
		}
		this.worker = new Worker(this.url, {
			execArgv: ["--conditions", "react-server"],
			env: {
				COMPONENT_SERVER_WORKER: "true",
				// DEBUG: "vite:*",
				DEBUG: process.env.DEBUG,
				DEBUG_COLORS: process.env.DEBUG_COLORS,
				NODE_ENV: process.env.NODE_ENV,
				MINIFY: process.argv.includes("--minify") ? "true" : "false",
			},
			workerData: {},
		});

		await new Promise((resolve, reject) => {
			invariant(this.worker, "Worker is not initialize");
			this.worker.once("message", (event) => {
				if (event === "ready") {
					console.log("rsc worker ready");
					resolve(undefined);
				} else {
					reject(new Error("rsc worker failed to start"));
				}
			});
		});

		const encoder = new TextEncoder();
		this.worker.on("message", (msg) => {
			const { id, ...event } = JSON.parse(msg);
			if (event.type === "reload") {
				onReload();
				return;
			}

			const res = this.responses.get(id);
			invariant(res, `No response handler for id ${id}`);
			res(event);
		});

		this.worker.once("exit", (code) => {
			console.log("Component server worker exited with code", code);
			process.exit(code);
		});
	}

	/**
	 *
	 * @param {import('h3').H3Event} event
	 * @returns
	 */
	handle(event) {
		const { req, res } = event.node;
		invariant(this.worker, "Worker is not initialize");
		const id = Math.random() + "";
		const worker = this.worker;

		worker.postMessage(
			JSON.stringify({
				req: {
					method: req.method,
					url: req.url,
					headers: req.headers,
				},
				type: "handle",
				id,
			}),
		);

		// WritableStream to transport request body to worker.
		const writableStream = new Writable({
			write(chunk, encoding, callback) {
				worker.postMessage(
					JSON.stringify({
						chunk: new TextDecoder().decode(chunk),
						type: "body",
						id: id,
					}),
				);
				callback();
			},
		});

		writableStream.on("finish", () => {
			worker.postMessage(
				JSON.stringify({
					chunk: "end",
					type: "body",
					id,
				}),
			);
		});

		// Pipe the request body to the writable stream.
		req.pipe(writableStream);

		let responses = this.responses;

		responses.set(id, ({ chunk, data }) => {
			if (chunk === "end") {
				res.end();
				responses.delete(id);
			} else if (chunk === "$header") {
				console.log("header", data);
				res.setHeader(data.key, data.value);
			} else if (chunk) {
				res.write(chunk);
			}
		});

		event._handled = true;

		return null;
	}

	close() {
		if (this.worker) {
			this.worker.unref();
		}
	}
}

// export async function createComponentServerWorker(buildPath, onReload) {
// 	const worker = new Worker(
// 		require.resolve("../src/component-server/node-worker.js"),
// 		{
// 			execArgv: ["--conditions", "react-server"],
// 			env: {
// 				COMPONENT_SERVER_WORKER: "true",
// 				// DEBUG: "vite:*",
// 				DEBUG: process.env.DEBUG,
// 				DEBUG_COLORS: process.env.DEBUG_COLORS,
// 				NODE_ENV: process.env.NODE_ENV ?? "production",
// 				MINIFY: process.argv.includes("--minify") ? "true" : "false",
// 			},
// 			workerData: {
// 				buildPath,
// 			},
// 		},
// 	);

// 	await new Promise((resolve, reject) =>
// 		worker.once("message", (event) => {
// 			if (event === "ready") {
// 				resolve(undefined);
// 			} else {
// 				reject(new Error("rsc worker failed to start"));
// 			}
// 		}),
// 	);

// 	/** @type {Map<string, (event: any) => void>} */
// 	const responses = new Map();
// 	const encoder = new TextEncoder();
// 	worker.on("message", (msg) => {
// 		const { id, ...event } = JSON.parse(msg);
// 		if (event.type === "reload") {
// 			onReload();
// 			return;
// 		}

// 		const res = responses.get(id);
// 		invariant(res, `No response handler for id ${id}`);
// 		res(event);
// 	});

// 	worker.once("exit", (code) => {
// 		console.log("Component server worker exited with code", code);
// 		process.exit(code);
// 	});

// 	return {
// 		/**
// 		 *
// 		 * @param {string} component
// 		 * @param {any} props
// 		 * @returns {ReadableStream<Uint8Array>}
// 		 */
// 		renderToReadableStream(component, props) {
// 			const id = Math.random() + "";
// 			worker.postMessage(
// 				JSON.stringify({
// 					component,
// 					props,
// 					type: "render",
// 					id,
// 				}),
// 			);

// 			return new ReadableStream({
// 				start(controller) {
// 					responses.set(id, ({ chunk }) => {
// 						if (chunk === "end") {
// 							controller.close();
// 							responses.delete(id);
// 							return;
// 						}

// 						if (chunk) controller.enqueue(encoder.encode(chunk));
// 					});
// 				},
// 			});
// 		},
// 		build: () => {
// 			return new Promise((resolve) => {
// 				const id = Math.random() + "";
// 				responses.set(id, ({ status }) => {
// 					if (status === "built") {
// 						resolve("");
// 					}
// 				});
// 				worker.postMessage(
// 					JSON.stringify({
// 						type: "build",
// 						id,
// 					}),
// 				);
// 			});
// 		},
// 		close: () => {
// 			worker.unref();
// 		},
// 	};
// // }
