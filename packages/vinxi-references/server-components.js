import { SERVER_REFERENCES_MANIFEST, hash } from "./constants.js";
import { transformReferences } from "./transform-references.js";

export function serverComponents({
	resolve = {
		conditions: ["react-server"],
	},
	runtime = "@vinxi/react-server-dom/runtime",
	transpileDeps = ["react", "react-dom", "@vinxi/react-server-dom"],
	manifest = SERVER_REFERENCES_MANIFEST,
	transforms = undefined,
} = {}) {
	const serverModules = new Set();
	const clientModules = new Set();
	return [
		transformReferences({
			hash: (e) => `c_${hash(e)}`,
			runtime,
			onReference(type, reference) {
				if (type === "server") {
					serverModules.add(reference);
				} else {
					clientModules.add(reference);
				}
			},
			transforms,
		}),
		buildServerComponents({
			resolve,
			transpileDeps,
			manifest,
			modules: {
				server: serverModules,
				client: clientModules,
			},
		}),
	];
}

export function buildServerComponents({
	resolve = {
		conditions: ["react-server"],
	},
	transpileDeps = ["react", "react-dom", "@vinxi/react-server-dom"],
	manifest = SERVER_REFERENCES_MANIFEST,
	modules = {
		server: new Set(),
		client: new Set(),
	},
}) {
	return {
		name: "server-components-hmr",
		handleHotUpdate({ file }) {
			// clear vite module cache so when its imported again, we will
			// fetch(`http://localhost:3000/__refresh`, {
			//   method: 'POST',
			//   headers: {'Content-Type': 'application/json'},
			//   body: JSON.stringify({file}),
			// })
			//   .then(() => {})
			//   .catch(err => console.error(err));
		},
		config(inlineConfig, env) {
			if (env.command === "build") {
				return {
					build: {
						rollupOptions: {
							onwarn: (warning, warn) => {
								// suppress warnings about source map issues for now
								// these are caused originally by rollup trying to complain about directives
								// in the middle of the files
								// TODO: fix source map issues
								if (warning.code === "SOURCEMAP_ERROR") {
									return;
								}
							},
							output: {
								// preserve the export names of the server actions in chunks
								minifyInternalExports: false,
								manualChunks: (chunk) => {
									console.log("manula chunks", chunk);
									// server references should be emitted as separate chunks
									// so that we can load them individually when server actions
									// are called. we need to do this in manualChunks because we don't
									// want to run a preanalysis pass just to identify these
									if (modules.server.has(chunk)) {
										return `c_${hash(chunk)}`;
									}
								},
								// we want to control the chunk names so that we can load them
								// individually when server actions are called
								chunkFileNames: "[name].js",
							},
						},
					},
					resolve: {
						conditions: [
							"node",
							"import",
							...(resolve.conditions ?? []),
							process.env.NODE_ENV,
						],
					},
					ssr: {
						noExternal: true,
					},
				};
			} else {
				return {
					resolve: {
						conditions: [
							"node",
							"import",
							...(resolve.conditions ?? []),

							process.env.NODE_ENV,
						],
					},
					ssr: {
						noExternal: true,
						external: transpileDeps,
					},
				};
			}
		},
		generateBundle() {
			this.emitFile({
				fileName: manifest,
				type: "asset",
				source: JSON.stringify({
					server: [...modules.server],
					client: [...modules.client],
				}),
			});
		},
	};
}
