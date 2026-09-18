import { dirname } from "./spine-format"

/**
 * Rewrite an atlas so every texture page points at an absolute file URL.
 * The resolver receives each page header and returns `undefined` to leave
 * the line untouched. A top-level line counts as a page header only when
 * the next line is its `size:` attribute — plain region names (`dagger`,
 * `goblin/head`) share the same indentation and must never be resolved.
 */
export function rewriteAtlas(
	atlasText: string,
	resolvePage: (pagePath: string) => string | undefined,
): string {
	const lines = atlasText.split(/\r?\n/)
	let foundPage = false
	const rewritten = lines.map((line, index) => {
		if (!isPageHeader(lines, index)) return line
		const resolved = resolvePage(line.trim())
		if (resolved === undefined) return line
		foundPage = true
		return resolved
	})
	if (!foundPage) return ""
	return rewritten.join("\n")
}

/**
 * The page paths an atlas declares, in file order. Same rule as
 * {@link rewriteAtlas}, for callers that must pre-process every page (e.g.
 * normalising the pixels before the runtime loads them).
 */
export function atlasPagePaths(atlasText: string): string[] {
	const lines = atlasText.split(/\r?\n/)
	const pages: string[] = []
	for (let index = 0; index < lines.length; index++) {
		if (isPageHeader(lines, index)) pages.push(lines[index]!.trim())
	}
	return pages
}

/** A top-level line whose next line is its `size:` attribute. */
function isPageHeader(lines: readonly string[], index: number): boolean {
	const line = lines[index]
	if (line === undefined || !isPageLine(line)) return false
	return lines[index + 1]?.trim().startsWith("size:") === true
}

/** True for a page header: top-level, non-empty, and not a `key: value`. */
function isPageLine(line: string): boolean {
	const trimmed = line.trim()
	if (trimmed.length === 0) return false
	if (line.length !== trimmed.length) return false
	return !trimmed.includes(":")
}

/**
 * Resolve an atlas page path against the atlas file's archive path.
 * Pure POSIX path joining: `..` pops, `.` and empty segments drop.
 */
export function resolveAtlasPage(atlasPath: string, pagePath: string): string {
	const pageSegments = pagePath.replaceAll("\\", "/").split("/")
	const segments = dirname(atlasPath)
		.split("/")
		.filter((s) => s.length > 0)
	for (const segment of pageSegments) {
		if (segment === "" || segment === ".") continue
		if (segment === "..") segments.pop()
		else segments.push(segment)
	}
	return segments.join("/")
}
