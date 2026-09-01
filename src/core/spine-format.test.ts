import { describe, expect, test } from "vitest"
import {
	isAtlasName,
	isLegacyRejectedVersion,
	isSkeletonName,
	parseSpineVersion,
	readBinarySpineDocument,
	readJsonSpineDocument,
	readJsonSpineHeader,
	readSpineDocument,
	runtimeFor,
} from "./spine-format"

describe("spine-format", () => {
	test("parses version strings", () => {
		expect(parseSpineVersion("4.1.24")).toEqual({
			raw: "4.1.24",
			major: 4,
			minor: 1,
			patch: 24,
		})
		expect(parseSpineVersion("not a version")).toBeUndefined()
		expect(parseSpineVersion(null)).toBeUndefined()
	})

	test("maps versions to the bundled runtimes", () => {
		expect(runtimeFor(parseSpineVersion("3.8.99"))).toBe("legacy")
		expect(runtimeFor(parseSpineVersion("4.0.31"))).toBe("4.0")
		expect(runtimeFor(parseSpineVersion("4.1.56"))).toBe("4.1")
		expect(runtimeFor(parseSpineVersion("4.2.119"))).toBe("4.2")
		expect(runtimeFor(parseSpineVersion("4.3.13"))).toBe("4.3")
		expect(runtimeFor(parseSpineVersion("4.9.0"))).toBe("4.3")
		expect(runtimeFor(parseSpineVersion("2.3.0"))).toBeUndefined()
		expect(runtimeFor(undefined)).toBeUndefined()
	})

	test("flags the legacy-rejected 3.8.75 version", () => {
		expect(isLegacyRejectedVersion(parseSpineVersion("3.8.75"))).toBe(true)
		expect(isLegacyRejectedVersion(parseSpineVersion("3.8.99"))).toBe(false)
	})

	test("classifies skeleton/atlas extensions", () => {
		expect(isSkeletonName("hero.skel")).toBe(true)
		expect(isSkeletonName("hero.json")).toBe(true)
		expect(isSkeletonName("skeleton_0")).toBe(false)
		expect(isAtlasName("hero.atlas")).toBe(true)
		expect(isAtlasName("atlas_0")).toBe(false)
	})

	test("reads only documents with a spine version header", () => {
		const doc = readJsonSpineDocument(
			JSON.stringify({
				skeleton: { spine: "4.2.119" },
				skins: [{ name: "default" }],
				animations: { idle: {} },
			}),
		)
		expect(doc?.version?.raw).toBe("4.2.119")
		expect(doc?.skins).toEqual(["default"])
		expect(doc?.animations).toEqual(["idle"])
		expect(readJsonSpineDocument(JSON.stringify({ bone: "x" }))).toBeUndefined()
		expect(readJsonSpineDocument("not json")).toBeUndefined()
	})

	test("reads the version out of a binary skeleton header", () => {
		const bytes = new TextEncoder().encode(`4.2.119\0${"\0".repeat(64)}`)
		const doc = readBinarySpineDocument(bytes)
		expect(doc?.version?.raw).toBe("4.2.119")
	})

	test("reads the version from a JSON first page without full parse", () => {
		const payload = new TextEncoder().encode(`{"skeleton":{"spine":"4.1.24"}}`)
		expect(readJsonSpineHeader(payload)?.raw).toBe("4.1.24")
	})

	test("routes a full read by extension", () => {
		const bytes = new TextEncoder().encode(`{"skeleton":{"spine":"4.1.24"}}`)
		expect(readSpineDocument(bytes, "hero.json")?.version?.raw).toBe("4.1.24")
		expect(
			readSpineDocument(new Uint8Array([0x34, 0x2e, 0x30]), "he.skel"),
		).toBeUndefined()
		expect(readSpineDocument(bytes, "hero.atlas")).toBeUndefined()
	})
})
