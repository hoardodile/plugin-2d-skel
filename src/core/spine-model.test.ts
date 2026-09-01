import { describe, expect, test } from "vitest"
import type { ModelJsonDocument } from "./model-json"
import { buildSpineExScene, isSpineExDocument } from "./spine-model"

const EX_DOC: Extract<ModelJsonDocument, { readonly kind: "ex-spine" }> = {
	kind: "ex-spine",
	skeleton: "skeleton_0",
	atlases: [
		{
			atlas: "atlases_0_atlas_0",
			texNames: ["specialillust64"],
			textures: ["atlases_0_textures_0_0.png"],
		},
	],
	motionGroups: ["idle", "start"],
}

describe("spine-model", () => {
	test("identifies an ex-spine descriptor", () => {
		expect(isSpineExDocument(undefined)).toBe(false)
		expect(isSpineExDocument(EX_DOC)).toBe(true)
		expect(
			isSpineExDocument({
				kind: "ex-live2d",
				label: "",
				moc: "x.moc",
				textures: [],
				motionGroups: [],
				expressions: [],
			}),
		).toBe(false)
	})

	test("builds a spine/ex scene when assets are present", () => {
		const files = [
			"model0.json",
			"skeleton_0",
			"atlases_0_atlas_0",
			"atlases_0_textures_0_0.png",
		]
		const scene = buildSpineExScene({
			modelJson: "model0.json",
			document: EX_DOC,
			files,
			skeletonDocument: {
				version: { raw: "4.2.119", major: 4, minor: 2, patch: 119 },
				animations: [],
				skins: [],
			},
			skeletonFiles: files,
		})
		expect(scene).toEqual({
			engine: "spine",
			skeleton: "skeleton_0",
			atlas: "atlases_0_atlas_0",
			textures: ["atlases_0_textures_0_0.png"],
			format: "skel",
			kind: "ex",
			version: "4.2.119",
			animations: [],
			skins: [],
			modelJson: "model0.json",
			label: "skeleton_0",
		})
	})

	test("returns undefined when a referenced file is missing", () => {
		const scene = buildSpineExScene({
			modelJson: "model0.json",
			document: EX_DOC,
			files: ["model0.json", "skeleton_0", "atlases_0_atlas_0"],
			skeletonDocument: undefined,
			skeletonFiles: ["model0.json"],
		})
		expect(scene).toBeUndefined()
	})
})
