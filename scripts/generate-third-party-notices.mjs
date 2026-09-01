#!/usr/bin/env node
/**
 * Generates public/THIRD-PARTY-NOTICES.txt from the installed dependency
 * tree, and copies the repository's MIT LICENSE into public/LICENSE so
 * the released plugin zip carries both.
 *
 * The dependency table is scanned with license-checker-rseidelsohn — the
 * same tool the hoardodile repo's scripts/generate-licenses.mjs uses.
 * Everything that is not derivable from npm metadata (the Spine Runtimes
 * agreement summary, trademark note, vendored 3.8 player entry and the
 * embedded MIT text) is hand-maintained below and re-emitted on every
 * run, so a generated file never loses it.
 *
 * Usage:
 *   node scripts/generate-third-party-notices.mjs            generate
 *   node scripts/generate-third-party-notices.mjs --check    verify only
 *
 * `build` / `watch` / `dev` chain this first, so dist/ (and therefore
 * the marketplace zip) is never stale. --check is for CI.
 */
import { createHash } from "node:crypto"
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { init } from "license-checker-rseidelsohn"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LOCKFILE = join(ROOT, "pnpm-lock.yaml")
const LICENSE_SOURCE = join(ROOT, "LICENSE")
const OUT_NOTICES = join(ROOT, "public", "THIRD-PARTY-NOTICES.txt")
const OUT_LICENSE = join(ROOT, "public", "LICENSE")
const CACHE_FILE = join(
	ROOT,
	"node_modules",
	".cache",
	"plugin-skeleton-animation-notices.json",
)

const isCheckOnly = process.argv.includes("--check")

/** License strings the scan may report, as displayed in the notices. */
const LICENSE_DISPLAY = {
	// @esotericsoftware/spine-player / spine-webgl declare the SPDX
	// reference "LicenseRef-LICENSE" and ship the agreement text instead.
	"LicenseRef-LICENSE": "Spine Runtimes License Agreement",
}

/** Everything the notices may list. Extension requires a deliberate edit
 * here (an unknown license fails the check instead of silently passing). */
const ALLOWED_LICENSES = new Set([
	"MIT",
	"ISC",
	"Apache-2.0",
	"BSD-2-Clause",
	"BSD-3-Clause",
	"MIT-0",
	"0BSD",
	"CC0-1.0",
	"BlueOak-1.0.0",
	"Python-2.0",
	"CC-BY-4.0",
	"Public Domain",
	"Unlicense",
	"Spine Runtimes License Agreement",
])

/** Copyright lines license-checker cannot derive (empty package.json
 * author metadata and/or no parseable Copyright line in LICENSE). */
const COPYRIGHT_OVERRIDES = {
	"@esotericsoftware/spine-player":
		"Copyright (c) 2013-2025, Esoteric Software LLC",
	"@esotericsoftware/spine-webgl":
		"Copyright (c) 2013-2025, Esoteric Software LLC",
	"pixi-dragonbones-runtime":
		"Copyright (c) 2012-2018 DragonBones team and other contributors",
	react: "Copyright (c) Meta Platforms, Inc. and affiliates.",
	"react-dom": "Copyright (c) Meta Platforms, Inc. and affiliates.",
}

/** Alias packages (`npm:@esotericsoftware/spine-player@4.0.31` installed
 * as @esotericsoftware/spine-player-4.0) resolve their own real name, but
 * normalize anyway so a new alias never splits the row set. */
function normalizeName(name) {
	return /^@esotericsoftware\/spine-player-\d+(?:\.\d+)*$/.test(name)
		? "@esotericsoftware/spine-player"
		: name
}

/** Text shipped verbatim in the notices. Keep in sync with
 * public/vendor/licenses/* and the README's licensing section. */
const SPINE_PROSE = `Spine Runtimes (Esoteric Software LLC)
--------------------------------
Copyright (c) 2013-2025, Esoteric Software LLC. All rights reserved.

Runtimes are redistributed under the Spine Runtimes License Agreement;
the full texts ship with this package:
- vendor/licenses/spine-runtimes-2019.txt — the agreement shipped by the
  Spine 4.0 / 4.1 npm builds;
- vendor/licenses/spine-runtimes-2025.txt — the current agreement,
  covering the Spine 4.2 / 4.3 builds and the legacy vendored player at
  vendor/3.8/spine-player.js.

Per that agreement, each user of this plugin must obtain their own Spine
Editor license to use the runtimes. The Spine Runtimes are provided "as
is"; Esoteric Software LLC is not liable for damages arising from their
use. "Spine" is a trademark of Esoteric Software LLC, and this plugin is
not affiliated with, or endorsed by, Esoteric Software LLC.`

const MIT_TEXT = `MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

/* ------------------------------------------------------------------ */

function computeInputHash() {
	const hash = createHash("sha256")
	hash.update(readFileSync(LOCKFILE))
	hash.update(readFileSync(LICENSE_SOURCE))
	hash.update(readFileSync(fileURLToPath(import.meta.url)))
	return hash.digest("hex")
}

function readCachedHash() {
	try {
		const cache = JSON.parse(readFileSync(CACHE_FILE, "utf-8"))
		return typeof cache.hash === "string" ? cache.hash : undefined
	} catch {
		return undefined
	}
}

function writeCachedHash(hash) {
	try {
		mkdirSync(dirname(CACHE_FILE), { recursive: true })
		writeFileSync(CACHE_FILE, `${JSON.stringify({ hash }, null, "\t")}\n`)
	} catch {
		// cache write failure is harmless; the next run just scans again
	}
}

function isCacheValid(hash) {
	return (
		readCachedHash() === hash &&
		existsSync(OUT_NOTICES) &&
		existsSync(OUT_LICENSE)
	)
}

function runChecker() {
	return new Promise((resolvePromise, reject) => {
		init(
			{
				start: ROOT,
				production: true,
				excludePrivatePackages: true,
				customFormat: {
					name: "",
					version: "",
					licenses: "",
					repository: "",
					copyright: "",
				},
			},
			(err, data) => {
				if (err) reject(err)
				else resolvePromise(data)
			},
		)
	})
}

function displayLicense(raw) {
	const rawString = Array.isArray(raw) ? raw.join(" OR ") : String(raw ?? "")
	const seen = new Set()
	for (const token of rawString
		.replace(/[()]/g, " ")
		.split(/\s+(?:OR|AND)\s+/gu)
		.map((token) => token.trim())
		.filter(Boolean)) {
		seen.add(LICENSE_DISPLAY[token] ?? token)
	}
	return Array.from(seen).join(" OR ")
}

function checkAllowed(raw) {
	const rawString = Array.isArray(raw) ? raw.join(" OR ") : String(raw ?? "")
	const tokens = rawString
		.replace(/[()]/g, " ")
		.split(/\s+(?:OR|AND)\s+/gu)
		.map((token) => token.trim())
		.filter(Boolean)
		.map((token) => LICENSE_DISPLAY[token] ?? token)
	return (
		tokens.length > 0 && tokens.every((token) => ALLOWED_LICENSES.has(token))
	)
}

async function scanPackages() {
	const data = await runChecker()
	const rows = new Map()
	for (const info of Object.values(data)) {
		const name = info.name ?? ""
		if (name === "" || name.startsWith("@hoardodile/")) continue
		const row = {
			name: normalizeName(name),
			version: info.version ?? "",
			license: displayLicense(info.licenses),
			repository:
				info.repository && /^https?:/.test(info.repository)
					? info.repository
					: "",
			copyright:
				info.copyright && info.copyright.trim().length > 0
					? info.copyright.trim()
					: (COPYRIGHT_OVERRIDES[normalizeName(name)] ?? ""),
		}
		const key = `${row.name}@${row.version}`
		if (!rows.has(key)) rows.set(key, row)
	}
	return Array.from(rows.values()).sort(
		(a, b) =>
			a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
	)
}

function render(rows) {
	const lines = [
		"THIRD-PARTY NOTICES",
		"==================",
		"",
		"Generated by scripts/generate-third-party-notices.mjs — do not edit",
		"by hand. This file lists every third-party software component in",
		"this package's production dependency tree (anything that can end up",
		"in the built plugin) and the license it is provided under, so that",
		"every redistribution of the package carries the notices the",
		"licenses require.",
		"",
		"This plugin itself is MIT licensed — full text: LICENSE (same",
		"directory).",
		"",
		"Bundled third-party software",
		"-----------------------------",
		"",
	]
	for (const row of rows) {
		lines.push(`${row.name}@${row.version}`, `  License:    ${row.license}`)
		if (row.repository !== "") lines.push(`  Repository: ${row.repository}`)
		if (row.copyright !== "") lines.push(`  Copyright:  ${row.copyright}`)
		lines.push("")
	}
	lines.push(SPINE_PROSE, "")
	lines.push(
		"React and ReactDOM (bundled into assets/index-*.js) — MIT License",
		"------------------------------------------------------------------",
		"",
		MIT_TEXT,
		"",
	)
	return lines.join("\n")
}

async function main() {
	const inputHash = isCheckOnly ? undefined : computeInputHash()
	if (inputHash !== undefined && isCacheValid(inputHash)) {
		console.log("Notices unchanged, skipping scan.")
		return
	}

	const rows = await scanPackages()
	const invalid = rows.filter((row) => !checkAllowed(row.license))
	if (invalid.length > 0) {
		console.error("Found incompatible or unknown licenses:")
		for (const row of invalid) {
			console.error(`  - ${row.name}@${row.version}: ${row.license}`)
		}
		console.error(
			"Add an explicit mapping in LICENSE_DISPLAY / ALLOWED_LICENSES (scripts/generate-third-party-notices.mjs) for any package you accept.",
		)
		process.exit(1)
	}

	if (isCheckOnly) {
		console.log(`License check passed (${rows.length} packages).`)
		return
	}

	writeFileSync(OUT_NOTICES, render(rows))
	copyFileSync(LICENSE_SOURCE, OUT_LICENSE)
	writeCachedHash(inputHash)
	console.log(
		`Generated public/THIRD-PARTY-NOTICES.txt and public/LICENSE (${rows.length} packages).`,
	)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
