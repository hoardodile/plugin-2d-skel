// @vitest-environment node

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Vitest runs from the plugin repo root, so the manifests are one step up.
const root = process.cwd()
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
const manifest = JSON.parse(
	readFileSync(resolve(root, "manifest.json"), "utf8"),
) as { version: string; minAppVersion: string }

describe("manifest / version consistency", () => {
	it("keeps manifest.json version in lockstep with package.json", () => {
		// Guards the drift where manifest.json and package.json diverge;
		// sync-version.mjs should keep them equal on every release.
		expect(manifest.version).toBe(pkg.version)
	})

	it("declares a minAppVersion aligned to the app release (0.1.6)", () => {
		// The plugin contract: hosts below this version refuse install/update.
		expect(manifest.minAppVersion).toBe("0.1.6")
	})
})
