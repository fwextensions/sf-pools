/**
 * Calls listener whenever the query starts or stops matching, and returns a
 * function that stops listening. Safari before 14 has only the deprecated
 * addListener on a MediaQueryList, and calling addEventListener there throws
 * from inside an effect, which takes the whole page down with it.
 */
export function onMediaChange(query: MediaQueryList, listener: () => void): () => void {
	if (typeof query.addEventListener === "function") {
		query.addEventListener("change", listener);
		return () => query.removeEventListener("change", listener);
	}
	query.addListener(listener);
	return () => query.removeListener(listener);
}
