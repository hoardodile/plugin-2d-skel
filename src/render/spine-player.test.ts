import { describe, expect, test, vi } from "vitest"
import {
	applySkinStack,
	atlasUsesPremultipliedAlpha,
	clampPremultipliedRgba,
	patchLegacyLoadingScreen,
	prepareSpineAssets,
	resolvePremultipliedAlpha,
	supersampleSpineCanvas,
	suppressLegacySpineChrome,
	suppressSpinePlayerError,
	viewportFrame,
	worldPerPixel,
} from "./spine-player"

describe("clampPremultipliedRgba", () => {
	test("zeroes the colour lossy WebP leaves under transparent pixels", () => {
		const data = new Uint8ClampedArray([84, 82, 83, 0, 0, 0, 0, 0])
		expect(clampPremultipliedRgba(data)).toBe(true)
		expect([...data]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
	})

	test("clamps a channel above its alpha and leaves valid pixels alone", () => {
		const data = new Uint8ClampedArray([200, 100, 40, 128, 10, 20, 30, 255])
		expect(clampPremultipliedRgba(data)).toBe(true)
		expect([...data]).toEqual([128, 100, 40, 128, 10, 20, 30, 255])
	})

	test("reports no change for already premultiplied pages", () => {
		const data = new Uint8ClampedArray([64, 32, 16, 128, 255, 255, 255, 255])
		expect(clampPremultipliedRgba(data)).toBe(false)
	})
})

describe("supersampleSpineCanvas", () => {
	function rendererOf(ratio: number) {
		return {
			maxCanvasWidth: 8192,
			maxCanvasHeight: 8192,
			getSafeDevicePixelRatio: vi.fn((_w: number, _h: number) => ratio),
		}
	}

	test("raises a 1× device ratio to the supersample scale", () => {
		const renderer = rendererOf(1)
		const player = { sceneRenderer: renderer } as unknown as Parameters<
			typeof supersampleSpineCanvas
		>[0]
		supersampleSpineCanvas(player)
		expect(renderer.getSafeDevicePixelRatio(1000, 800)).toBe(2)
	})

	test("never lowers a platform ratio that is already higher", () => {
		const renderer = rendererOf(3)
		const player = { sceneRenderer: renderer } as unknown as Parameters<
			typeof supersampleSpineCanvas
		>[0]
		supersampleSpineCanvas(player)
		expect(renderer.getSafeDevicePixelRatio(1000, 800)).toBe(3)
	})

	test("clamps to the GL size limit", () => {
		const renderer = rendererOf(1)
		renderer.maxCanvasWidth = 1500
		renderer.maxCanvasHeight = 1500
		const player = { sceneRenderer: renderer } as unknown as Parameters<
			typeof supersampleSpineCanvas
		>[0]
		supersampleSpineCanvas(player)
		expect(renderer.getSafeDevicePixelRatio(1000, 800)).toBe(1.5)
	})

	test("tolerates a renderer without the hook", () => {
		const player = {
			sceneRenderer: {},
		} as unknown as Parameters<typeof supersampleSpineCanvas>[0]
		expect(() => supersampleSpineCanvas(player)).not.toThrow()
	})
})

describe("atlasUsesPremultipliedAlpha", () => {
	test("reads an explicit pma:true flag", () => {
		expect(atlasUsesPremultipliedAlpha("pma:true\nsize:2048,2048")).toBe(true)
	})

	test("reads an explicit pma:false flag", () => {
		expect(atlasUsesPremultipliedAlpha("pma:false\nsize:2048,2048")).toBe(false)
	})

	test("reads an indented pma header (Spine indents page properties)", () => {
		expect(atlasUsesPremultipliedAlpha("\tpma: true\n")).toBe(true)
		expect(atlasUsesPremultipliedAlpha(" \tpma: false\nsize:2048,2048")).toBe(
			false,
		)
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

	test("reads an indented pma:true header (Spine indents page properties)", () => {
		// A premultiplied `type:9` export whose atlas indents its header must
		// be recognised as premultiplied — otherwise it renders non-premultiplied
		// and shows a dark fringe at region seams.
		expect(resolvePremultipliedAlpha("\tpma: true\n", "4.2")).toBe(true)
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

	test("an absent header keeps the runtime default even for EX scenes (per-model)", () => {
		// Different Spine models carry different configs; a `type:9` export with
		// no `pma` header must NOT be blanket-forced to premultiplied — each
		// model's own atlas decides.
		expect(resolvePremultipliedAlpha("size:1,1", "4.2")).toBe(false)
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

	test("leaves an already-WebP atlas page on the original bytes", async () => {
		// A WebP-sourced model (e.g. an export that ships the CDN's own
		// textures) must not be re-encoded to WebP: that second lossy pass
		// blocks up the atlas seams.
		const webpScene = { ...SCENE, textures: ["texture0.webp"] } as const
		const urls = await prepareSpineAssets({
			scene: webpScene,
			readFile: readFileOf({ "atlas.txt": "texture0.webp\nsize: 512,512\n" }),
			resolveFileUrl: (filename, variant) =>
				variant === undefined
					? `file:///${filename}`
					: `file:///${filename}?fmt=${variant.format}&fit=${variant.fit}`,
			imageVariant: { format: "webp", fit: "exact" },
		})
		expect(urls?.atlasText).toContain("file:///texture0.webp")
		expect(urls?.atlasText).not.toContain("?fmt=")
	})

	test("keeps the page URL and overrides it for a pma atlas", async () => {
		const urls = await prepareSpineAssets({
			scene: SCENE,
			readFile: readFileOf({
				"atlas.txt": "texture0.png\nsize: 512,512\npma: true\n",
			}),
			resolveFileUrl: (filename) => `file:///${filename}`,
			premultiplyPage: async (url) => `data:image/png;clamped(${url})`,
		})
		// The page name must stay a URL the runtime resolves as absolute; the
		// clamped bytes ride the rawDataURIs override keyed by that same URL.
		expect(urls?.atlasText).toContain("file:///texture0.png")
		expect(urls?.atlasText).not.toContain("data:image/png")
		expect(urls?.pageOverrides?.get("file:///texture0.png")).toBe(
			"data:image/png;clamped(file:///texture0.png)",
		)
	})

	test("leaves a non-premultiplied atlas page untouched", async () => {
		const premultiplyPage = vi.fn(async () => "data:image/png;clamped")
		const urls = await prepareSpineAssets({
			scene: SCENE,
			readFile: readFileOf({ "atlas.txt": ATLAS }),
			resolveFileUrl: (filename) => `file:///${filename}`,
			premultiplyPage,
		})
		expect(premultiplyPage).not.toHaveBeenCalled()
		expect(urls?.atlasText).toContain("file:///texture0.png")
		expect(urls?.pageOverrides).toBeUndefined()
	})

	test("keeps the original page when clamping reports no change", async () => {
		const urls = await prepareSpineAssets({
			scene: SCENE,
			readFile: readFileOf({
				"atlas.txt": "texture0.png\nsize: 512,512\npma: true\n",
			}),
			resolveFileUrl: (filename) => `file:///${filename}`,
			premultiplyPage: async () => undefined,
		})
		expect(urls?.atlasText).toContain("file:///texture0.png")
		expect(urls?.pageOverrides).toBeUndefined()
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

describe("applySkinStack", () => {
	class FakeSkin {
		name: string
		added: unknown[] = []
		constructor(name: string) {
			this.name = name
		}
		addSkin(skin: unknown) {
			this.added.push(skin)
		}
	}

	function fakeSkeleton(skinNames: readonly string[], currentSkin?: string) {
		const skins = skinNames.map((name) => new FakeSkin(name))
		const setSkinCalls: FakeSkin[] = []
		const setSkinByNameCalls: string[] = []
		let setupPoseResets = 0
		const skeleton = {
			skin: currentSkin === undefined ? undefined : { name: currentSkin },
			setSkin(skin: FakeSkin) {
				setSkinCalls.push(skin)
			},
			setSkinByName(name: string) {
				setSkinByNameCalls.push(name)
			},
			setSlotsToSetupPose() {
				setupPoseResets++
			},
			data: {
				skins,
				// Reads `this.skins` like the runtime, so a call that drops the
				// receiver (an extracted reference) fails this test.
				findSkin(name: string) {
					return this.skins.find((skin) => skin.name === name)
				},
			},
		}
		return {
			player: {
				skeleton,
			} as unknown as Parameters<typeof applySkinStack>[0],
			setSkinCalls,
			setSkinByNameCalls,
			setupPoseResets: () => setupPoseResets,
		}
	}

	test("a single skin follows the existing single-skin path", () => {
		const { player, setSkinByNameCalls } = fakeSkeleton(["body_base"])
		applySkinStack(player, ["body_base"])
		expect(setSkinByNameCalls).toEqual(["body_base"])
	})

	test("a plain single skin leaves the setup pose alone", () => {
		// The compatibility guarantee: a scene that composes nothing (no
		// composite is ever installed) keeps byte-for-byte the old single-skin
		// behaviour.
		const { player, setupPoseResets } = fakeSkeleton(["default"], "default")
		applySkinStack(player, ["default"])
		expect(setupPoseResets()).toBe(0)
	})

	test("a composite resets the slots to the setup pose", () => {
		// `setSkin` only swaps attachments the previous skin had attached, so
		// without this the composite's added slots stay empty — the
		// missing-pieces render.
		const { player, setSkinCalls, setupPoseResets } = fakeSkeleton(
			["body_base", "face/one_Idle"],
			"body_base",
		)
		applySkinStack(player, ["body_base", "face/one_Idle"])
		expect(setSkinCalls).toHaveLength(1)
		expect(setupPoseResets()).toBe(1)
	})

	test("leaving a composite resets the dropped layers' slots", () => {
		const { player, setSkinByNameCalls, setupPoseResets } = fakeSkeleton(
			["body_base"],
			"__hdo_composite_skin",
		)
		applySkinStack(player, ["body_base"])
		expect(setSkinByNameCalls).toEqual(["body_base"])
		expect(setupPoseResets()).toBe(1)
	})

	test("merges a stack into a pristine composite Skin and sets it", () => {
		const { player, setSkinCalls } = fakeSkeleton([
			"body_base",
			"variant/edited",
			"layers/acc",
		])
		applySkinStack(player, ["body_base", "variant/edited", "layers/acc"])
		expect(setSkinCalls).toHaveLength(1)
		const composite = setSkinCalls[0]!
		// The composite is fresh, holding every resolved skin (the shared data
		// skins are not mutated), so a later stack update can rebuild it.
		expect(composite.name).toBe("__hdo_composite_skin")
		expect((composite.added as FakeSkin[]).map((s) => s.name)).toEqual([
			"body_base",
			"variant/edited",
			"layers/acc",
		])
	})

	test("degrades to the last skin when the skeleton has no findSkin", () => {
		const setSkinByNameCalls: string[] = []
		const player = {
			skeleton: {
				setSkinByName(name: string) {
					setSkinByNameCalls.push(name)
				},
			},
		} as unknown as Parameters<typeof applySkinStack>[0]
		applySkinStack(player, ["body_base", "face/one_Idle"])
		expect(setSkinByNameCalls).toEqual(["face/one_Idle"])
	})

	test("a stack with no resolvable skins leaves the skeleton alone", () => {
		const { player, setSkinCalls } = fakeSkeleton([])
		applySkinStack(player, ["body_base", "missing"])
		expect(setSkinCalls).toHaveLength(0)
	})
})

describe("viewportFrame", () => {
	const canvas = { x: -100, y: 0, width: 400, height: 600 }

	test("a skeleton without an authored canvas keeps the runtime's own fit", () => {
		expect(
			viewportFrame(undefined, { x: 0, y: 0, width: 10, height: 10 }),
		).toBeUndefined()
		expect(viewportFrame(undefined, undefined)).toBeUndefined()
	})

	test("a composed scene without a canvas frames its own content", () => {
		// The composed props otherwise make the runtime's per-animation fit
		// span the whole scene and shrink the character to a speck.
		expect(
			viewportFrame(
				undefined,
				{ x: -828, y: -1137, width: 1803, height: 2474 },
				{ composed: true },
			),
		).toEqual({ x: -828, y: -1137, width: 1803, height: 2474 })
		// Without measurable content it still leaves the runtime alone.
		expect(
			viewportFrame(undefined, undefined, { composed: true }),
		).toBeUndefined()
	})

	test("unmeasurable content leaves the authored canvas as it is", () => {
		expect(viewportFrame(canvas, undefined)).toEqual(canvas)
		expect(viewportFrame(canvas, { x: 0, y: 0, width: 0, height: 0 })).toEqual(
			canvas,
		)
	})

	test("content inside the canvas does not move the frame", () => {
		expect(
			viewportFrame(canvas, { x: -80, y: 20, width: 300, height: 500 }),
		).toEqual(canvas)
		// A pixel of slack keeps rounding noise from resizing the frame.
		expect(
			viewportFrame(canvas, { x: -101, y: -0.5, width: 402, height: 600.5 }),
		).toEqual(canvas)
	})

	test("content overflowing the canvas expands the frame to their union", () => {
		// The exported game models declare a setup canvas that their props and
		// extra skin layers extend past; framing the canvas alone crops them.
		expect(
			viewportFrame(canvas, { x: -150, y: -100, width: 700, height: 900 }),
		).toEqual({ x: -150, y: -100, width: 700, height: 900 })
		expect(
			viewportFrame(canvas, { x: -100, y: 0, width: 500, height: 600 }),
		).toEqual({ x: -100, y: 0, width: 500, height: 600 })
		expect(
			viewportFrame(canvas, { x: -120, y: 10, width: 100, height: 100 }),
		).toEqual({ x: -120, y: 0, width: 420, height: 600 })
	})
})
