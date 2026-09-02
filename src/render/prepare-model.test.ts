import type { ImageVariantSpec } from "@hoardodile/sdk-web"
import { describe, expect, test } from "vitest"
import { prepareLive2dModel } from "./prepare-model"

function readFileOf(contents: Readonly<Record<string, string>>) {
	return async function readFile(path: string) {
		return new TextEncoder().encode(contents[path] ?? "").buffer
	}
}

function resolveFileUrl(filename: string): string {
	return `/file/${filename}`
}

function resolveBaseUrl(): string {
	return "/base/"
}

describe("prepareLive2dModel", () => {
	test("rewrites official Cubism references to absolute URLs", async () => {
		const prepared = await prepareLive2dModel({
			scene: {
				modelJson: "hero.model3.json",
				kind: "cubism",
				engine: "live2d",
				moc: "Moc_0.moc3",
				textures: ["Textures_0_0.png"],
				motionGroups: ["Idle"],
				expressions: [],
			},
			readFile: readFileOf({
				"hero.model3.json": JSON.stringify({
					Version: 3,
					FileReferences: {
						Moc: "Moc_0.moc3",
						Textures: ["Textures_0_0.png"],
						Physics: "Physics_0.json",
						Motions: { Idle: [{ File: "motion.json", Sound: "sound.wav" }] },
						Expressions: [{ Name: "smile", File: "exp.json" }],
					},
				}),
			}),
			resolveFileUrl,
			resolveBaseUrl,
		})
		expect(prepared).toBeDefined()
		const settings = prepared?.settings as Record<string, unknown>
		expect(settings.url).toBe("/base/")
		expect(settings.FileReferences).toMatchObject({
			Moc: "/file/Moc_0.moc3",
			Textures: ["/file/Textures_0_0.png"],
			Physics: "/file/Physics_0.json",
			Motions: {
				Idle: [{ File: "/file/motion.json", Sound: "/file/sound.wav" }],
			},
			Expressions: [{ Name: "smile", File: "/file/exp.json" }],
		})
	})

	test("rewrites EX .moc references", async () => {
		const prepared = await prepareLive2dModel({
			scene: {
				modelJson: "model0.json",
				kind: "ex",
				engine: "live2d",
				moc: "model_0.moc",
				textures: ["textures_0_0.png"],
				motionGroups: ["idle"],
				expressions: ["smile"],
			},
			readFile: readFileOf({
				"model0.json": JSON.stringify({
					type: 0,
					model: "model_0.moc",
					textures: ["textures_0_0.png"],
					motions: { idle: [{ file: "motions_idle_0", sound: "s.wav" }] },
					expressions: [{ name: "smile", file: "exp.json" }],
					physics_v2: { File: "physics.json" },
					hit_areas: [
						{ name: "you", id: "D_PSD1.100", motion: "attack" },
						{ name: "脸", id: "D_PSD1.257", motion: "表情" },
					],
				}),
			}),
			resolveFileUrl,
			resolveBaseUrl,
		})
		const settings = prepared?.settings as Record<string, unknown>
		expect(settings).toMatchObject({
			url: "/base/",
			model: "/file/model_0.moc",
			textures: ["/file/textures_0_0.png"],
			motions: {
				idle: [{ file: "/file/motions_idle_0", sound: "/file/s.wav" }],
			},
			expressions: [{ name: "smile", file: "/file/exp.json" }],
			physics_v2: { File: "/file/physics.json" },
		})
		// EX hit areas are normalized to pixi's PascalCase, camelCase key.
		expect(settings.hitAreas).toEqual([
			{ Id: "D_PSD1.100", Name: "you", Motion: "attack" },
			{ Id: "D_PSD1.257", Name: "脸", Motion: "表情" },
		])
	})

	test("resolves descriptor refs relative to the descriptor's directory", async () => {
		const prepared = await prepareLive2dModel({
			scene: {
				modelJson: "cubism/hero.model3.json",
				kind: "cubism",
				engine: "live2d",
				moc: "cubism/Moc_0.moc3",
				textures: ["cubism/Textures_0_0.png"],
				motionGroups: ["Idle"],
				expressions: [],
			},
			readFile: readFileOf({
				"cubism/hero.model3.json": JSON.stringify({
					Version: 3,
					FileReferences: {
						Moc: "Moc_0.moc3",
						Textures: ["Textures_0_0.png"],
						Motions: {
							Idle: [{ File: "Motions_Idle_0_File_0.json" }],
						},
					},
				}),
			}),
			resolveFileUrl,
			resolveBaseUrl,
		})
		const settings = prepared?.settings as Record<string, unknown>
		expect(settings.FileReferences).toMatchObject({
			Moc: "/file/cubism/Moc_0.moc3",
			Textures: ["/file/cubism/Textures_0_0.png"],
			Motions: {
				Idle: [{ File: "/file/cubism/Motions_Idle_0_File_0.json" }],
			},
		})
	})

	test("returns undefined for unparseable descriptors", async () => {
		const prepared = await prepareLive2dModel({
			scene: {
				modelJson: "model0.json",
				kind: "ex",
				engine: "live2d",
				moc: "model.moc",
				textures: ["tex.png"],
				motionGroups: [],
				expressions: [],
			},
			readFile: readFileOf({ "model0.json": "not json" }),
			resolveFileUrl,
			resolveBaseUrl,
		})
		expect(prepared).toBeUndefined()
	})

	test("applies an image variant to textures only, leaving other refs original", async () => {
		const variant: ImageVariantSpec = { format: "webp", fit: "exact" }
		const prepared = await prepareLive2dModel({
			scene: {
				modelJson: "hero.model3.json",
				kind: "cubism",
				engine: "live2d",
				moc: "Moc_0.moc3",
				textures: ["Textures_0_0.png"],
				motionGroups: ["Idle"],
				expressions: [],
			},
			readFile: readFileOf({
				"hero.model3.json": JSON.stringify({
					Version: 3,
					FileReferences: {
						Moc: "Moc_0.moc3",
						Textures: ["Textures_0_0.png"],
						Physics: "Physics_0.json",
						Motions: { Idle: [{ File: "motion.json", Sound: "sound.wav" }] },
						Expressions: [{ Name: "smile", File: "exp.json" }],
					},
				}),
			}),
			resolveFileUrl: (filename, given) =>
				given === undefined
					? `/file/${filename}`
					: `/file/${filename}?fmt=${given.format}&fit=${given.fit}`,
			resolveBaseUrl,
			imageVariant: variant,
		})
		const settings = prepared?.settings as Record<string, unknown>
		const refs = settings.FileReferences as Record<string, unknown>
		// Textures carry the variant query; moc/physics/motions/expressions do not.
		expect(refs.Textures).toEqual(["/file/Textures_0_0.png?fmt=webp&fit=exact"])
		expect(refs.Moc).toBe("/file/Moc_0.moc3")
		expect(refs.Physics).toBe("/file/Physics_0.json")
		expect(refs.Motions).toEqual({
			Idle: [{ File: "/file/motion.json", Sound: "/file/sound.wav" }],
		})
		expect(refs.Expressions).toEqual([
			{ Name: "smile", File: "/file/exp.json" },
		])
	})

	test("applies the image variant to EX textures only, leaving metadata refs original", async () => {
		const variant: ImageVariantSpec = { format: "webp", fit: "exact" }
		const prepared = await prepareLive2dModel({
			scene: {
				modelJson: "model0.json",
				kind: "ex",
				engine: "live2d",
				moc: "model_0.moc",
				textures: ["textures_0_0.png"],
				motionGroups: ["idle"],
				expressions: [],
			},
			readFile: readFileOf({
				"model0.json": JSON.stringify({
					type: 0,
					model: "model_0.moc",
					textures: ["textures_0_0.png"],
					motions: { idle: [{ file: "motions_idle_0", sound: "s.wav" }] },
					expressions: [{ name: "smile", file: "exp.json" }],
					physics_v2: { File: "physics.json" },
					pose: "pose.json",
				}),
			}),
			resolveFileUrl: (filename, given) =>
				given === undefined
					? `/file/${filename}`
					: `/file/${filename}?fmt=${given.format}&fit=${given.fit}`,
			resolveBaseUrl,
			imageVariant: variant,
		})
		const settings = prepared?.settings as Record<string, unknown>
		// Only `textures` carries the variant; every metadata ref stays original.
		expect(settings.textures).toEqual([
			"/file/textures_0_0.png?fmt=webp&fit=exact",
		])
		expect(settings.model).toBe("/file/model_0.moc")
		expect(settings.motions).toEqual({
			idle: [{ file: "/file/motions_idle_0", sound: "/file/s.wav" }],
		})
		expect(settings.expressions).toEqual([
			{ name: "smile", file: "/file/exp.json" },
		])
		expect(settings.physics_v2).toEqual({ File: "/file/physics.json" })
		expect(settings.pose).toBe("/file/pose.json")
	})
})
