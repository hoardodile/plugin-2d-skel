import { describe, expect, test } from "vitest"
import {
	isPreencodedTexture,
	textureVariant,
	textureVariantFor,
} from "./texture-format"

describe("textureVariant", () => {
	test("returns undefined when WebP is disabled", () => {
		expect(textureVariant(false)).toBeUndefined()
	})

	test("requests an exact-fit WebP when enabled", () => {
		expect(textureVariant(true)).toEqual({ format: "webp", fit: "exact" })
	})

	test("forwards an explicit quality override", () => {
		expect(textureVariant(true, 80)).toEqual({
			format: "webp",
			fit: "exact",
			quality: 80,
		})
	})
})

describe("textureVariantFor", () => {
	const variant = textureVariant(true)

	test("recognizes textures that are already WebP or AVIF", () => {
		expect(isPreencodedTexture("tex_0.webp")).toBe(true)
		expect(isPreencodedTexture("dir/TEX_0.WEBP")).toBe(true)
		expect(isPreencodedTexture("tex.avif")).toBe(true)
		expect(isPreencodedTexture("tex_0.png")).toBe(false)
		expect(isPreencodedTexture("tex_0.jpg")).toBe(false)
		// A `.webp`-looking prefix is not an extension.
		expect(isPreencodedTexture("webp_0.png")).toBe(false)
	})

	test("keeps the variant for formats the host must transcode", () => {
		expect(textureVariantFor("tex_0.png", variant)).toEqual(variant)
		expect(textureVariantFor("tex_0.PNG", variant)).toEqual(variant)
	})

	test("asks for the original bytes when the texture is already WebP", () => {
		// Re-encoding WebP to WebP is a second lossy pass that blocks up an
		// atlas's region seams, so the toggle must be a no-op here.
		expect(textureVariantFor("tex_0.webp", variant)).toBeUndefined()
		expect(textureVariantFor("tex_0.avif", variant)).toBeUndefined()
	})

	test("stays undefined when the toggle is off", () => {
		expect(textureVariantFor("tex_0.png", undefined)).toBeUndefined()
		expect(textureVariantFor("tex_0.webp", undefined)).toBeUndefined()
	})
})
