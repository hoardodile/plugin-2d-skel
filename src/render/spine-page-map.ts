/**
 * Logical atlas page names → absolute texture URLs for EX descriptors.
 * The descriptor lists `tex_names` without extensions while the atlas
 * pages carry `.png`/`.jpg`/…, so both forms map to the same texture.
 */
export function buildExPageUrls(
	texNames: readonly string[],
	textures: readonly string[],
	resolveFileUrl: (filename: string) => string,
): ReadonlyMap<string, string> {
	const map = new Map<string, string>()
	for (const [index, name] of texNames.entries()) {
		const texture = textures[index]
		if (texture === undefined) continue
		const url = resolveFileUrl(texture)
		const logical = name.toLowerCase()
		map.set(logical, url)
		for (const extension of [".png", ".jpg", ".jpeg", ".webp"]) {
			map.set(`${logical}${extension}`, url)
		}
	}
	return map
}
