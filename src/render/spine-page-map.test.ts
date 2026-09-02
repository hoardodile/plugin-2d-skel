import { describe, expect, test } from "vitest"
import { buildExPageUrls } from "./spine-page-map"

describe("buildExPageUrls", () => {
	test("maps logical names and their extensions to texture URLs", () => {
		const urls = buildExPageUrls(
			["specialillust64"],
			["atlases_0_textures_0_0.png"],
			(filename) => `file:///${filename}`,
		)
		expect(urls.get("specialillust64")).toBe(
			"file:///atlases_0_textures_0_0.png",
		)
		expect(urls.get("specialillust64.png")).toBe(
			"file:///atlases_0_textures_0_0.png",
		)
		expect(urls.get("specialillust64.jpg")).toBe(
			"file:///atlases_0_textures_0_0.png",
		)
	})

	test("skips names without a corresponding texture", () => {
		const urls = buildExPageUrls(
			["orphan"],
			[],
			(filename) => `file:///${filename}`,
		)
		expect(urls.size).toBe(0)
	})

	test("applies an image variant to each page URL", () => {
		const urls = buildExPageUrls(
			["specialillust64"],
			["atlases_0_textures_0_0.png"],
			(filename, variant) =>
				variant === undefined
					? `file:///${filename}`
					: `file:///${filename}?fmt=${variant.format}&fit=${variant.fit}`,
			{ format: "webp", fit: "exact" },
		)
		expect(urls.get("specialillust64")).toBe(
			"file:///atlases_0_textures_0_0.png?fmt=webp&fit=exact",
		)
		expect(urls.get("specialillust64.png")).toBe(
			"file:///atlases_0_textures_0_0.png?fmt=webp&fit=exact",
		)
	})
})
