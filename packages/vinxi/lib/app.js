import { isAbsolute, join, relative } from "pathe";
import { isMainThread } from "worker_threads";
import * as v from "zod";

import { BaseFileSystemRouter } from "./file-system-router.js";
import invariant, { InvariantError } from "./invariant.js";

function resolveConfig(router, appConfig) {
	router.handler = relative(
		appConfig.root,
		router.handler
			? isAbsolute(router.handler)
				? router.handler
				: join(appConfig.root, router.handler)
			: undefined,
	);

	// invariant(handler, "No handler found for node-handler router");

	router.dir = router.dir
		? isAbsolute(router.dir)
			? router.dir
			: join(appConfig.root, router.dir)
		: undefined;

	let routerStyle = router.style ?? "static";

	router.extensions = router.extensions ?? ["js", "jsx", "ts", "tsx"];

	// invariant(
	// 	routerStyle !== "static" ? dir : true,
	// 	`There should be dir provided if the router style is ${routerStyle}`,
	// );

	let fileRouter =
		routerStyle !== "static" && router.dir
			? new routerStyle(router)
			: undefined;

	// invariant(
	// 	fileRouter ? router.handler : true,
	// 	"No handler found for SPA router. When `dir` is being used with `style` for file system routing, `handler` must be specified.",
	// );

	const buildConfig = router.build
		? {
				...router.build,
				outDir: router.build.outDir
					? join(appConfig.root, router.build.outDir)
					: join(appConfig.root, ".nitro", "build", router.name),
		  }
		: {
				outDir: join(appConfig.root, ".nitro", "build", router.name),
		  };

	return {
		base: "/",
		...router,
		build: buildConfig,
		root: appConfig.root,
		style: routerStyle,
		fileRouter,
	};
}

/** @typedef {"static" | "build" | "spa" | "handler"} RouterModes  */
/** @type {[RouterModes, ...RouterModes[]]} */
const routerModes = ["static", "build", "spa", "handler"];

const staticRouterSchema = v.object({
	name: v.string(),
	base: v.string().default("/"),
	mode: v.literal("static"),
	dir: v.optional(v.string()),
});

/** @typedef {v.infer<typeof staticRouterSchema>} StaticRouterSchema */

const buildRouterSchema = v.object({
	name: v.string(),
	base: v.string().default("/"),
	mode: v.literal("build"),
	dir: v.optional(v.string()),
	handler: v.string(),
	style: v.custom((value) => value !== null),
	extensions: v.array(v.string()).optional(),
	build: v.object({
		outDir: v.string().optional(),
		target: v.literal("browser"),
		plugins: v.optional(v.custom((value) => typeof value === "function")),
	}),
});

/** @typedef {v.infer<typeof buildRouterSchema>} BuildRouterSchema */

const handlerRouterSchema = v.object({
	name: v.string(),
	base: v.string().default("/"),

	mode: v.literal("handler"),
	dir: v.optional(v.string()),
	extensions: v.array(v.string()).optional(),

	worker: v.optional(v.boolean()),
	handler: v.string(),
	style: v.custom((value) => value !== null),
	build: v.object({
		server: v.optional(
			v.object({
				middleware: v.array(v.string()),
				virtual: v.object({}),
			}),
		),
		outDir: v.string().optional(),
		target: v.literal("server"),
		plugins: v.optional(v.custom((value) => typeof value === "function")),
	}),
});

/** @typedef {v.infer<typeof handlerRouterSchema>} HandlerRouterSchema */

const spaRouterSchema = v.object({
	name: v.string(),
	base: v.string().default("/"),
	extensions: v.array(v.string()).optional(),

	mode: v.literal("spa"),
	dir: v.optional(v.string()),
	style: v.custom((value) => value !== null),
	handler: v.string(),
	build: v.object({
		outDir: v.string().optional(),
		target: v.literal("browser"),
		plugins: v.optional(v.custom((value) => typeof value === "function")),

		// plugins: v.special((value) => typeof value === "function"),
	}),
});

/** @typedef {v.infer<typeof spaRouterSchema>} SPARouterSchema */

const routerSchema = {
	static: staticRouterSchema,
	build: buildRouterSchema,
	spa: spaRouterSchema,
	handler: handlerRouterSchema,
};

/** @typedef {(HandlerRouterSchema | BuildRouterSchema | SPARouterSchema | StaticRouterSchema) & { fileRouter?: import('../vinxi.d.ts').FileSystemRouter }} RouterSchema  */
/** @typedef {{ routers: RouterSchema[]; name?: string; server?: import('nitropack').NitroConfig }} AppOptions */
/** @typedef {{ config: { name: string; server: import('nitropack').NitroConfig; routers: RouterSchema[]; root: string } }} App */

/**
 *
 * @param {AppOptions} param0
 * @returns {App}
 */
export function createApp({ routers = [], name = "app", server = {} }) {
	invariant(routers.length === 0, `No router specified`);
	
	routers = routers.map((router) => {
		invariant(
			router.mode in routerSchema,
			`Invalid router mode ${router.mode}`,
		);
		const result = routerSchema[router.mode].safeParse(router);
		if (result.success !== true) {
			const issues = result.error.issues.map((issue) => {
				return issue.path.map((p) => p).join(".") + " " + issue.message;
			});
			throw new InvariantError(
				`Errors in router configuration: ${router.name}\n${issues.join("\n")}`,
			);
		}
		return result.data;
	});

	const config = {
		name: name ?? "vinxi",
		routers,
		server,
		root: process.cwd(),
	};

	config.routers = routers.map((router, index) => {
		return {
			...resolveConfig(router, config),
			index,
		};
	});

	const app = {
		config,
		getRouter(name) {
			return config.routers.find((router) => router.name === name);
		},
		async serve() {
			if (isMainThread) {
				const { createDevServer } = await import("./dev-server.js");
				await createDevServer(app, {
					port: Number(process.env.PORT ?? 3000),
					dev: true,
				});
			}
		},
		async build() {
			const { createBuild } = await import("./build.js");
			await createBuild(app);
		},
	};

	if (process.argv.includes("--dev")) {
		app.serve();
	} else if (process.argv.includes("--build")) {
		app.build();
	}

	return app;
}
