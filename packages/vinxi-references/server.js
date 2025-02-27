import { readFileSync } from "fs";
import { join } from "path";

import { CLIENT_REFERENCES_MANIFEST, hash } from "./constants.js";

/**
 *
 * @returns {import('vinxi').PluginOption}
 */
export function server({
	client = "client",
	resolve = {
		conditions: [],
	},
	manifest = CLIENT_REFERENCES_MANIFEST,
} = {}) {
	let isBuild;
	let input;
	return {
		name: "server-references",
		config(config, env) {
			isBuild = env.command === "build";
			// @ts-ignore
			const router = config.router;
			// @ts-ignore
			const app = config.app;

			if (isBuild) {
				const rscRouter = app.getRouter(client);

				const reactClientManifest = JSON.parse(
					readFileSync(
						join(rscRouter.build.outDir, rscRouter.base, manifest),
						"utf-8",
					),
				);

				input = {
					entry: router.handler,
					...Object.fromEntries(
						reactClientManifest.server.map((key) => {
							return [`c_${hash(key)}`, key];
						}),
					),
				};

				return {
					build: {
						rollupOptions: {
							output: {
								chunkFileNames: "[name].js",
							},
							treeshake: true,
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
			}
		},

		configResolved(config) {
			if (isBuild) {
				// const reactServerManifest = JSON.parse(
				// 	readFileSync(".build/rsc/_rsc/react-server-manifest.json", "utf-8"),
				// );
				config.build.rollupOptions.input = input;
			}
		},
	};
}
