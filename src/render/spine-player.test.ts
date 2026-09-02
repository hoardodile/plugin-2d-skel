import { describe, expect, test, vi } from "vitest"
import {
	atlasUsesPremultipliedAlpha,
	patchLegacyLoadingScreen,
	prepareSpineAssets,
	resolvePremultipliedAlpha,
	suppressLegacySpineChrome,
	suppressSpinePlayerError,
	worldPerPixel,
} from "./spine-player"

describe("atlasUsesPremultipliedAlpha", () => {
	test("reads an explicit pma:true flag", () => {
		expect(atlasUsesPremultipliedAlpha("pma:true\nsize:2048,2048")).toBe(true)
	})

	test("reads an explicit pma:false flag", () => {
		expect(atlasUsesPremultipliedAlpha("pma:false\nsize:2048,2048")).toBe(false)
	})

	test("defaults to false when the flag is absent or malformed", () => {
		expect(atlasUsesPremultipliedAlpha("size:2048,2048")).toBe(false)
		expect(atlasUsesPremultipliedAlpha("pma:maybe")).toBe(false)
		expect(atlasUsesPremultipliedAlpha(undefined)).toBe(false)
	})
})

describe("resolvePremultipliedAlpha", () => {
	test("an explicit pma:true wins for any runtime", () => {
		expect(resolvePremultipliedAlpha("pma:true\nsize:1,1", "legacy")).toBe(true)
		expect(resolvePremultipliedAlpha("pma:true\nsize:1,1", "4.1")).toBe(true)
	})

	test("an explicit pma:false wins for any runtime", () => {
		expect(resolvePremultipliedAlpha("pma:false\nsize:1,1", "legacy")).toBe(
			false,
		)
		expect(resolvePremultipliedAlpha("pma:false\nsize:1,1", "4.1")).toBe(false)
	})

	test("the legacy default is premultiplied when the header is absent", () => {
		expect(resolvePremultipliedAlpha("size:1,1", "legacy")).toBe(true)
	})

	test("the 4.x default is non-premultiplied when the header is absent", () => {
		expect(resolvePremultipliedAlpha("size:1,1", "4.0")).toBe(false)
		expect(resolvePremultipliedAlpha("size:1,1", "4.3")).toBe(false)
	})

	test("an absent atlas resolves to false", () => {
		expect(resolvePremultipliedAlpha(undefined, "legacy")).toBe(false)
	})
})

describe("worldPerPixel", () => {
	test("uses the pinned viewport width when present (EX scenes)", () => {
		expect(worldPerPixel(2000, 800, 1483)).toBeCloseTo(2000 / 1483)
	})

	test("falls back to the model bounds when there is no pinned viewport", () => {
		expect(worldPerPixel(undefined, 800, 1483)).toBeCloseTo(800 / 1483)
	})

	test("returns 1 when neither dimension is usable", () => {
		expect(worldPerPixel(undefined, undefined, 1483)).toBe(1)
		expect(worldPerPixel(0, 800, 1483)).toBeCloseTo(800 / 1483)
	})
})

describe("prepareSpineAssets", () => {
	const SCENE = {
		engine: "spine",
		kind: "standard",
		skeleton: "skeleton.json",
		atlas: "atlas.txt",
		textures: ["texture0.png"],
		format: "json",
		version: "4.1.24",
		animations: ["idle"],
		skins: [],
	} as const

	function readFileOf(contents: Readonly<Record<string, string>>) {
		return async function readFile(path: string) {
			return new TextEncoder().encode(contents[path] ?? "").buffer
		}
	}

	const ATLAS = "texture0.png\nsize: 512,512\nformat: RGBA8888\n"

	test("rewrites the atlas page to a WebP variant but keeps the skeleton URL original", async () => {
		const urls = await prepareSpineAssets({
			scene: SCENE,
			readFile: readFileOf({ "atlas.txt": ATLAS }),
			resolveFileUrl: (filename, variant) =>
				variant === undefined
					? `file:///${filename}`
					: `file:///${filename}?fmt=${variant.format}&fit=${variant.fit}`,
			imageVariant: { format: "webp", fit: "exact" },
		})
		expect(urls).toBeDefined()
		expect(urls?.skeletonUrl).toBe("file:///skeleton.json")
		expect(urls?.atlasText).toContain("file:///texture0.png?fmt=webp&fit=exact")
	})

	test("rewrites the atlas page to the original URL when no variant is given", async () => {
		const urls = await prepareSpineAssets({
			scene: SCENE,
			readFile: readFileOf({ "atlas.txt": ATLAS }),
			resolveFileUrl: (filename) => `file:///${filename}`,
		})
		expect(urls?.atlasText).toContain("file:///texture0.png")
		expect(urls?.atlasText).not.toContain("?fmt=")
	})
})

describe("suppressSpinePlayerError", () => {
	test("hides the official runtime's inline-styled error div", () => {
		const container = document.createElement("div")
		const error = document.createElement("div")
		error.className = "spine-player-error"
		error.style.display = "flex"
		container.appendChild(error)

		suppressSpinePlayerError(container)

		expect(error.style.display).toBe("none")
		expect(error.classList.contains("spine-player-hidden")).toBe(true)
		// The node is NOT removed, so a later legacy showError still finds it.
		expect(container.querySelector(".spine-player-error")).not.toBeNull()
	})

	test("re-hides the legacy build's hidden-class error div", () => {
		const container = document.createElement("div")
		const error = document.createElement("div")
		error.className = "spine-player-error"
		container.appendChild(error)

		suppressSpinePlayerError(container)

		expect(error.classList.contains("spine-player-hidden")).toBe(true)
		expect(error.style.display).toBe("none")
	})

	test("tolerates a container without an error element", () => {
		const container = document.createElement("div")
		expect(() => suppressSpinePlayerError(container)).not.toThrow()
	})
})

describe("patchLegacyLoadingScreen", () => {
	test("replaces the LoadingScreen draw with a no-op", () => {
		const originalDraw = vi.fn()
		const runtime = {
			webgl: { LoadingScreen: { prototype: { draw: originalDraw } } },
		} as unknown as Parameters<typeof patchLegacyLoadingScreen>[0]

		expect(patchLegacyLoadingScreen(runtime)).toBe(true)

		const replaced = (
			runtime as unknown as {
				webgl: { LoadingScreen: { prototype: { draw: () => void } } }
			}
		).webgl.LoadingScreen.prototype.draw
		expect(replaced).not.toBe(originalDraw)
		// The no-op must not throw and must not forward to the original.
		expect(() => replaced()).not.toThrow()
		expect(originalDraw).not.toHaveBeenCalled()
	})

	test("returns false when the LoadingScreen prototype is absent", () => {
		const runtime = { webgl: {} } as unknown as Parameters<
			typeof patchLegacyLoadingScreen
		>[0]
		expect(patchLegacyLoadingScreen(runtime)).toBe(false)
	})
})

describe("suppressLegacySpineChrome", () => {
	test("hides the legacy controls bar, timeline and logo button", () => {
		const container = document.createElement("div")
		container.innerHTML = `
			<div class="spine-player">
				<canvas class="spine-player-canvas"></canvas>
				<div class="spine-player-controls">
					<div class="spine-player-timeline"></div>
					<div class="spine-player-buttons">
						<img id="spine-player-button-logo" class="spine-player-button-icon-spine-logo" />
					</div>
				</div>
			</div>
		`

		suppressLegacySpineChrome(container)

		const logo = container.querySelector<HTMLElement>(
			"#spine-player-button-logo",
		)
		const controls = container.querySelector<HTMLElement>(
			".spine-player-controls",
		)
		const buttons = container.querySelector<HTMLElement>(
			".spine-player-buttons",
		)
		const timeline = container.querySelector<HTMLElement>(
			".spine-player-timeline",
		)
		expect(logo?.style.display).toBe("none")
		expect(controls?.style.display).toBe("none")
		expect(buttons?.style.display).toBe("none")
		expect(timeline?.style.display).toBe("none")
		// The canvas stays visible.
		const canvas = container.querySelector<HTMLElement>(".spine-player-canvas")
		expect(canvas?.style.display).not.toBe("none")
	})

	test("tolerates a container without the legacy chrome", () => {
		const container = document.createElement("div")
		expect(() => suppressLegacySpineChrome(container)).not.toThrow()
	})
})
