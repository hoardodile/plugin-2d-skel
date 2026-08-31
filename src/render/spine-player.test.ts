import { describe, expect, test } from "vitest"
import { atlasUsesPremultipliedAlpha, suppressSpinePlayerError } from "./spine-player"

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
