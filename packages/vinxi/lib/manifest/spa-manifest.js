import { log } from "console";
import { join, relative } from "pathe";

import { createViteManifest } from "./create-vite-manifest.js";
import findAssetsInViteManifest from "./vite-manifest.js";

function toRouteId(route) {
	return `${route.src}?${route.pick.map((p) => `pick=${p}`).join("&")}`;
}

async function getEntries(router) {
	return [
		router.handler,
		...(
			(await router.fileRouter?.getRoutes()).map((r) =>
				Object.entries(r)
					.filter(([r, v]) => v && r.startsWith("$") && !r.startsWith("$$"))
					.map(([, v]) => toRouteId(v)),
			) ?? []
		).flat(),
	];
}

export async function createSPAManifest(config, bundle, format) {
	const manifest = createViteManifest(config, bundle, format);
	let routeManifest = {};
	if (config.router && config.router.fileRouter) {
		const entries = await getEntries(config.router);

		log(entries);

		for (const route of entries) {
			routeManifest[relative(config.router.root, route)] = {
				output: join(
					config.base,
					manifest[relative(config.router.root, route)].file,
				),
				assets: findAssetsInViteManifest(
					manifest,
					relative(config.router.root, route),
				)
					.filter((asset) => asset.endsWith(".css"))
					.map((asset) => ({
						tag: "link",
						attrs: {
							href: join(config.base, asset),
							key: join(config.base, asset),
							rel: "stylesheet",
							precendence: "high",
						},
					})),
			};
		}

		// routeManifest[route.filePath] = {
		// 	output: join(
		// 		config.base,
		// 		manifest[relative(config.router.root, route.filePath)].file,
		// 	),
		// 	assets: findAssetsInViteManifest(
		// 		manifest,
		// 		relative(config.router.root, route.filePath),
		// 	)
		// 		.filter((asset) => asset.endsWith(".css"))
		// 		.map((asset) => ({
		// 			tag: "link",
		// 			attrs: {
		// 				href: join(config.base, asset),
		// 				key: join(config.base, asset),
		// 				rel: "stylesheet",
		// 				precendence: "high",
		// 			},
		// 		})),
		// };
	}
	return routeManifest;
}
