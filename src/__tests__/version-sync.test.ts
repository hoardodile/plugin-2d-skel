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
// The SDK the plugin compiles against; `minAppVersion` must match it, because
// the host ships the matching API surface the plugin was built for.
const sdkVersion = (
	JSON.parse(
		readFileSync(
			resolve(root, "node_modules/@hoardodile/sdk-web/package.json"),
			"utf8",
		),
	) as { version: string }
).version

describe("manifest / version consistency", () => {
	it("keeps manifest.json version in lockstep with package.json", () => {
		// Guards the drift where manifest.json and package.json diverge;
		// sync-version.mjs should keep them equal on every release.
		expect(manifest.version).toBe(pkg.version)
	})

	it("declares a minAppVersion aligned to the SDK it builds against", () => {
		// Hosts below this version refuse install/update. Must track the SDK
		// the plugin is compiled against (the host exposes that API surface).
		expect(manifest.minAppVersion).toBe(sdkVersion)
	})
})
