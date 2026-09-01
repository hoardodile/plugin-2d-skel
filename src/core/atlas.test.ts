import { describe, expect, test } from "vitest"
import { resolveAtlasPage, rewriteAtlas } from "./atlas"

const ATLAS = [
	"hero.png",
	"size: 1,1",
	"format: RGBA8888",
	"...",
	"dagger",
	"  rotate: false",
	"  xy: 0, 0",
	"goblin/head",
	"  xy: 8, 0",
	"",
].join("\n")

describe("atlas", () => {
	test("rewrites page headers to resolved URLs", () => {
		const rewritten = rewriteAtlas(ATLAS, (page) =>
			page === "hero.png" ? "file://hero.png" : undefined,
		)
		const lines = rewritten.split("\n")
		expect(lines[0]).toBe("file://hero.png")
		expect(lines[4]).toBe("dagger") // region line untouched
		expect(lines[7]).toBe("goblin/head") // region line untouched
	})

	test("returns an empty string when no page header resolves", () => {
		expect(rewriteAtlas(ATLAS, () => undefined)).toBe("")
	})

	test("resolves a page path relative to the atlas directory", () => {
		expect(resolveAtlasPage("spine/hero.atlas", "hero.png")).toBe(
			"spine/hero.png",
		)
		expect(resolveAtlasPage("hero.atlas", "textures/hero.png")).toBe(
			"textures/hero.png",
		)
		expect(resolveAtlasPage("spine/hero.atlas", "../tex/hero.png")).toBe(
			"tex/hero.png",
		)
	})
})
