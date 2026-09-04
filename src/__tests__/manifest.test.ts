// @vitest-environment node

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createResourceAPIFixture } from "@hoardodile/sdk-server"
import { describe, expect, test } from "vitest"
import live2dPlugin from "../main"
import type { EngineSchema } from "../shared"

const EX_LIVE2D = JSON.stringify({
	type: 0,
	model: "model_0.moc",
	textures: ["textures_0_0.png"],
	motions: { idle: [{ file: "motions_idle_0_file_0" }] },
})

const SPINE_SKELETON = JSON.stringify({
	skeleton: { spine: "4.1.24" },
	bones: [{ name: "root" }],
	skins: [{ name: "default" }],
	animations: { idle: {} },
})

const SPINE_ATLAS =
	"hero.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n"

// Vitest runs from the plugin repo root, so the manifest is one step up.
const root = process.cwd()
const manifest = JSON.parse(
	readFileSync(resolve(root, "manifest.json"), "utf8"),
) as {
	readonly ui?: {
		readonly search?: { readonly kinds: readonly { readonly key: string }[] }
	}
}

describe("manifest / searchMeta facet consistency", () => {
	// The host renders one filter checkbox per declared `ui.search.kinds`
	// entry and the card badge via `searchKindIcons()`, using the facets
	// the searchMeta hook produces. A facet the manifest does not declare
	// is unfilterable; a declared kind the hook never emits is dead weight.
	test("every searchMeta facet key is declared as a search kind (and vice versa)", async () => {
		const detected = await live2dPlugin.detect(
			createResourceAPIFixture<EngineSchema>({
				files: [
					"model0.json",
					"model_0.moc",
					"textures_0_0.png",
					"hero.json",
					"hero.atlas",
					"hero.png",
				],
				contents: {
					"model0.json": EX_LIVE2D,
					"hero.json": SPINE_SKELETON,
					"hero.atlas": SPINE_ATLAS,
				},
			}).api,
		)
		expect(detected.ok).toBe(true)
		if (!detected.ok) return

		const { api } = createResourceAPIFixture<EngineSchema>({
			context: { detect: detected },
		})
		const meta = await live2dPlugin.searchMeta?.(api)
		expect(meta).toBeDefined()

		const facetKeys = new Set(Object.keys(meta?.facets ?? {}))
		const kindKeys = new Set(
			(manifest.ui?.search?.kinds ?? []).map((kind) => kind.key),
		)
		expect(facetKeys).toEqual(kindKeys)
	})
})
