async function fetchServerAction(base, id, args) {
	const response = await fetch(base, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"server-action": id,
		},
		body: JSON.stringify(args),
	});

	return response.json();
}

export function createServerReference(fn, id, name) {
	return new Proxy(fn, {
		get(target, prop, receiver) {
			console.log(target, prop);
		},
		apply(target, thisArg, args) {
			return fetchServerAction("/_server", `${id}#${name}`, args);
		},
	});
}
