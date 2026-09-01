import { createResourceAPIFixture } from "@hoardodile/sdk-server"
import type { PluginDownloadRequest } from "@hoardodile/sdk-types"
import { describe, expect, test } from "vitest"
import live2dPlugin from "../main"
import { LIVE2D_RUNTIME_FILES } from "../runtime-assets"
import type { EngineSchema } from "../shared"

const CUBISM_MODEL = JSON.stringify({
	Version: 3,
	FileReferences: {
		Moc: "Moc_0.moc3",
		Textures: ["Textures_0_0.png"],
		Motions: { Idle: [{ File: "Motions_Idle_0_File_0.json" }] },
	},
})

const EX_MODEL = JSON.stringify({
	type: 0,
	model: "model_0.moc",
	textures: ["textures_0_0.png"],
	motions: { idle: [{ file: "motions_idle_0_file_0" }] },
})

const SPINE_EX_MODEL = JSON.stringify({
	type: 9,
	skeleton: "skeleton_0",
	atlases: [
		{
			atlas: "atlases_0_atlas_0",
			tex_names: ["specialillust64"],
			textures: ["atlases_0_textures_0_0.png"],
		},
	],
	motions: { idle: [{ file: "idle" }] },
})

const DRAGONBONES_EX_MODEL = JSON.stringify({
	type: 10,
	skeleton: "skeleton_0",
	atlases: [
		{
			atlas: "atlases_0_atlas_0.json",
			tex_names: ["role1011_tex"],
			textures: ["atlases_0_textures_0_0.png"],
		},
	],
	motions: { idle: [{ file: "idle" }] },
})

const DRAGONBONES_SKE = JSON.stringify({
	version: "5.5",
	name: "hero",
	frameRate: 24,
	armature: [
		{
			type: "Armature",
			name: "hero",
			animation: [{ name: "idle" }, { name: "walk" }],
			skin: [{ name: "default", slot: [{ name: "s0", display: [] }] }],
		},
	],
})

const DRAGONBONES_TEX = JSON.stringify({
	name: "hero",
	imagePath: "hero_tex.png",
	width: 256,
	height: 256,
	SubTexture: [{ name: "idle", x: 0, y: 0, width: 10, height: 10 }],
})

const JSON_SKELETON = JSON.stringify({
	skeleton: { spine: "4.1.24" },
	bones: [{ name: "root" }],
	skins: [{ name: "default" }],
	animations: { idle: {} },
})

const ATLAS =
	"hero.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n"

function fixture(
	overrides: Parameters<typeof createResourceAPIFixture<EngineSchema>>[0] = {},
) {
	return createResourceAPIFixture<EngineSchema>(overrides)
}

describe("live2d plugin hooks (unified live2d + spine)", () => {
	test("detects official Cubism models as live2d/cubism", async () => {
		const { api } = fixture({
			files: ["Moc_0.moc3", "Textures_0_0.png", "hero.model3.json"],
			contents: { "hero.model3.json": CUBISM_MODEL },
		})
		expect(await live2dPlugin.detect(api)).toMatchObject({
			ok: true,
			scenes: [{ engine: "live2d", kind: "cubism", moc: "Moc_0.moc3" }],
		})
	})

	test("detects Cubism-shaped model0.json as live2d/ex", async () => {
		const { api } = fixture({
			files: ["model0.json", "Moc_0.moc3", "Textures_0_0.png"],
			contents: { "model0.json": CUBISM_MODEL },
		})
		expect(await live2dPlugin.detect(api)).toMatchObject({
			ok: true,
			scenes: [{ engine: "live2d", kind: "ex", moc: "Moc_0.moc3" }],
		})
	})

	test("detects EX Live2D .moc as live2d/ex", async () => {
		const { api } = fixture({
			files: ["model0.json", "model_0.moc", "textures_0_0.png"],
			contents: { "model0.json": EX_MODEL },
		})
		expect(await live2dPlugin.detect(api)).toMatchObject({
			ok: true,
			scenes: [{ engine: "live2d", kind: "ex", moc: "model_0.moc" }],
		})
	})

	test("detects type 9 Spine config as spine/ex (not live2d)", async () => {
		const { api } = fixture({
			files: [
				"model0.json",
				"skeleton_0",
				"atlases_0_atlas_0",
				"atlases_0_textures_0_0.png",
			],
			contents: {
				"model0.json": SPINE_EX_MODEL,
				skeleton_0: "4.2.119",
			},
		})
		const result = await live2dPlugin.detect(api)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.scenes).toEqual([
			expect.objectContaining({
				engine: "spine",
				kind: "ex",
				skeleton: "skeleton_0",
				modelJson: "model0.json",
			}),
		])
	})

	test("detects direct Spine exports as spine/standard", async () => {
		const { api } = fixture({
			files: ["hero.json", "hero.atlas", "hero.png"],
			contents: {
				"hero.json": JSON_SKELETON,
				"hero.atlas": ATLAS,
			},
		})
		const result = await live2dPlugin.detect(api)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.scenes).toEqual([
			expect.objectContaining({
				engine: "spine",
				kind: "standard",
				skeleton: "hero.json",
				version: "4.1.24",
			}),
		])
	})

	test("detects standard DragonBones exports as dragonbones/standard", async () => {
		const { api } = fixture({
			files: ["hero_ske.json", "hero_tex.json", "hero_tex.png"],
			contents: {
				"hero_ske.json": DRAGONBONES_SKE,
				"hero_tex.json": DRAGONBONES_TEX,
			},
		})
		const result = await live2dPlugin.detect(api)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.scenes).toEqual([
			expect.objectContaining({
				engine: "dragonbones",
				kind: "standard",
				skeleton: "hero_ske.json",
				atlas: "hero_tex.json",
				format: "json",
				version: "5.5",
			}),
		])
		expect(result.scenes[0]).toEqual(
			expect.objectContaining({ armatures: ["hero"] }),
		)
	})

	test("detects type 10 DragonBones config as dragonbones/ex", async () => {
		const { api } = fixture({
			files: [
				"model0.json",
				"skeleton_0",
				"atlases_0_atlas_0.json",
				"atlases_0_textures_0_0.png",
			],
			contents: {
				"model0.json": DRAGONBONES_EX_MODEL,
				skeleton_0: Buffer.concat([
					Buffer.from("DBDT\x00\x00\x00\x02\x00\x00\x00\x00"),
					Buffer.from(DRAGONBONES_SKE),
				]),
				"atlases_0_atlas_0.json": DRAGONBONES_TEX,
			},
		})
		const result = await live2dPlugin.detect(api)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.scenes).toEqual([
			expect.objectContaining({
				engine: "dragonbones",
				kind: "ex",
				skeleton: "skeleton_0",
				atlas: "atlases_0_atlas_0.json",
				modelJson: "model0.json",
				version: "5.5",
			}),
		])
	})

	test("listFiles flattens dragonbones scenes with engine rows", async () => {
		const { api } = fixture({
			files: ["hero_ske.json", "hero_tex.json", "hero_tex.png"],
			contents: {
				"hero_ske.json": DRAGONBONES_SKE,
				"hero_tex.json": DRAGONBONES_TEX,
			},
		})
		const rows = await live2dPlugin.listFiles?.(api)
		expect(rows).toEqual([
			{
				filename: "hero_ske.json",
				role: "skeleton",
				scene: 0,
				format: "json",
				version: "5.5",
				engine: "dragonbones",
			},
			{
				filename: "hero_tex.json",
				role: "atlas",
				scene: 0,
				engine: "dragonbones",
			},
			{
				filename: "hero_tex.png",
				role: "texture",
				scene: 0,
				engine: "dragonbones",
			},
		])
	})

	test("detects a mixed live2d + spine resource as multiple scenes", async () => {
		const { api } = fixture({
			files: [
				"hero.model3.json",
				"Moc_0.moc3",
				"Textures_0_0.png",
				"model0.json",
				"skeleton_0",
				"atlases_0_atlas_0",
				"atlases_0_textures_0_0.png",
			],
			contents: {
				"hero.model3.json": CUBISM_MODEL,
				"model0.json": SPINE_EX_MODEL,
				skeleton_0: "4.2.119",
			},
		})
		const result = await live2dPlugin.detect(api)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		const engines = result.scenes.map((scene) => scene.engine)
		expect(engines).toContain("live2d")
		expect(engines).toContain("spine")
		expect(await live2dPlugin.searchMeta?.(api)).toEqual({
			v: 1,
			facets: {
				live2d: true,
				spine: true,
				dragonbones: false,
				// Cubism folds into "standard"; only EX is a separate kind.
				standard: true,
				ex: true,
			},
		})
	})

	test("does not claim a resource with only unrelated files", async () => {
		const { api } = fixture({
			files: ["note.txt", "data.json"],
			contents: { "data.json": JSON.stringify({ hello: "world" }) },
		})
		expect(await live2dPlugin.detect(api)).toMatchObject({ ok: false })
	})

	test("builds source and search metadata from the session context", async () => {
		const detected = await live2dPlugin.detect(
			fixture({
				files: ["model0.json", "model_0.moc", "textures_0_0.png"],
				contents: { "model0.json": EX_MODEL },
			}).api,
		)
		expect(detected.ok).toBe(true)
		if (!detected.ok) return

		const { api } = fixture({ context: { detect: detected } })
		expect(await live2dPlugin.sourceMeta?.(api)).toEqual({
			version: undefined,
			modelCount: 1,
			motionCount: 1,
			scenes: detected.scenes,
		})
		expect(await live2dPlugin.searchMeta?.(api)).toEqual({
			v: 1,
			facets: {
				live2d: true,
				spine: false,
				dragonbones: false,
				standard: false,
				ex: true,
			},
		})
	})

	test("listFiles flattens live2d and spine scenes with unified roles", async () => {
		const { api } = fixture({
			files: [
				"model0.json",
				"model_0.moc",
				"textures_0_0.png",
				"spine/hero.json",
				"spine/hero.atlas",
				"spine/hero.png",
			],
			contents: {
				"model0.json": EX_MODEL,
				"spine/hero.json": JSON_SKELETON,
				"spine/hero.atlas": ATLAS,
			},
		})
		const rows = await live2dPlugin.listFiles?.(api)
		expect(rows).toEqual([
			{
				filename: "model0.json",
				role: "model",
				scene: 0,
				kind: "ex",
				label: "model0.json",
				engine: "live2d",
			},
			{ filename: "model_0.moc", role: "moc", scene: 0, engine: "live2d" },
			{
				filename: "textures_0_0.png",
				role: "texture",
				scene: 0,
				engine: "live2d",
			},
			{
				filename: "spine/hero.json",
				role: "skeleton",
				scene: 1,
				format: "json",
				version: "4.1.24",
				engine: "spine",
			},
			{
				filename: "spine/hero.atlas",
				role: "atlas",
				scene: 1,
				engine: "spine",
			},
			{
				filename: "spine/hero.png",
				role: "texture",
				scene: 1,
				engine: "spine",
			},
		])
		expect(live2dPlugin.coverLocal).toBeUndefined()
	})

	test("onInstall downloads the pinned runtime batch (primaries) once", async () => {
		const calls: (readonly PluginDownloadRequest[])[] = []
		const { api } = fixture({
			downloadHandler: async (request) => {
				const batch = Array.isArray(request) ? request : [request]
				calls.push(batch)
				return batch.map((entry) => ({
					path: entry.dest,
					sizeBytes: 1,
					sha256: entry.sha256 ?? "",
					cached: false,
				}))
			},
		})

		await live2dPlugin.onInstall?.(api)

		expect(calls).toHaveLength(1)
		expect(calls[0]!.map((entry) => entry.dest)).toEqual(
			LIVE2D_RUNTIME_FILES.map((entry) => entry.dest),
		)
		expect(calls[0]!.map((entry) => entry.url)).toEqual(
			LIVE2D_RUNTIME_FILES.map((entry) => entry.urls[0]),
		)
		expect(calls[0]!.map((entry) => entry.sha256)).toEqual(
			LIVE2D_RUNTIME_FILES.map((entry) => entry.sha256),
		)
	})

	test("onInstall swallows a denied download (best-effort contract)", async () => {
		const { api } = fixture({
			downloadHandler: async () => {
				const error = new Error("plugin download was declined")
				error.name = "DENIED"
				throw error
			},
		})

		await expect(live2dPlugin.onInstall?.(api)).resolves.toBeUndefined()
	})
})
