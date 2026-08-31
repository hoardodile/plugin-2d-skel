import { describe, expect, test } from "vitest"
import {
	atlasStem,
	isDragonBonesAtlasName,
	isDragonBonesSkeletonFileName,
	readDragonBonesDocument,
	skeletonStem,
} from "./dragonbones-format"

const JSON_SKE = JSON.stringify({
	frameRate: 60,
	name: "starter",
	version: "5.5",
	compatibleVersion: "5.5",
	armature: [
		{
			type: "Armature",
			name: "starter",
			animation: [{ name: "throw" }, { name: "idle" }],
			skin: [{ name: "default", slot: [] }],
		},
		{ type: "Armature", name: "ghost", animation: [{ name: "float" }] },
	],
})

function dbbt(json: string): Uint8Array {
	const head = new TextEncoder().encode("DBDT\x00\x00\x00\x02\x00\x00\x00\x00")
	const body = new TextEncoder().encode(json)
	const out = new Uint8Array(head.length + body.length)
	out.set(head, 0)
	out.set(body, head.length)
	return out
}

describe("dragonbones-format", () => {
	test("identifies skeleton and atlas filenames", () => {
		expect(isDragonBonesSkeletonFileName("hero_ske.json")).toBe(true)
		expect(isDragonBonesSkeletonFileName("hero_ske.dbbin")).toBe(true)
		expect(isDragonBonesSkeletonFileName("dir/starter_ske.json")).toBe(true)
		expect(isDragonBonesSkeletonFileName("hero.json")).toBe(false)
		expect(isDragonBonesSkeletonFileName("skeleton_0")).toBe(false)
		expect(isDragonBonesAtlasName("hero_tex.json")).toBe(true)
		expect(isDragonBonesAtlasName("hero_atlas.json")).toBe(false)
	})

	test("computes the shared stem from a skeleton/atlas filename", () => {
		expect(skeletonStem("starter_ske.json")).toBe("starter")
		expect(skeletonStem("starter_ske.dbbin")).toBe("starter")
		expect(atlasStem("starter_tex.json")).toBe("starter")
	})

	test("reads a JSON skeleton document", () => {
		const doc = readDragonBonesDocument(new TextEncoder().encode(JSON_SKE), "starter_ske.json")
		expect(doc).toEqual({
			version: { raw: "5.5" },
			armatures: ["starter", "ghost"],
			animations: ["throw", "idle", "float"].sort(),
			skins: ["default"],
		})
	})

	test("reads the embedded JSON from a DBBT binary skeleton", () => {
		const bytes = dbbt(JSON_SKE)
		const doc = readDragonBonesDocument(bytes, "skeleton_0")
		expect(doc).toEqual({
			version: { raw: "5.5" },
			armatures: ["starter", "ghost"],
			animations: ["throw", "idle", "float"].sort(),
			skins: ["default"],
		})
	})

	test("rejects JSON that is not a DragonBones skeleton", () => {
		expect(readDragonBonesDocument(new TextEncoder().encode('{"hello":"world"}'), "hero.json")).toBeUndefined()
		expect(readDragonBonesDocument(new TextEncoder().encode('{"skeleton":{"spine":"4.1.24"}}'), "hero.json")).toBeUndefined()
	})

	test("rejects a DBBT file with no embedded JSON", () => {
		const bytes = new Uint8Array(new TextEncoder().encode("DBDT\x00\x00\x00\x02\x00\x00\x00\x00nojson"))
		expect(readDragonBonesDocument(bytes, "skeleton_0")).toBeUndefined()
	})
})
