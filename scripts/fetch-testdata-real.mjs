#!/usr/bin/env node
// Downloads REAL test data for local rendering into the gitignored
// `testdata-real/` folder so a fresh clone gets renderable models without
// any manual step. Each source is pinned to an upstream commit and the
// sha256 of every extracted file — a drift fails loudly instead of silently
// changing the fixture.
//
// Sources:
//  - arch-chan (Live2D Cubism 3, CC0 1.0)
//  - dragonbones-standard (DragonBones 5.5 JSON export from the
//    pixi-dragonbones-runtime-starter repo, MIT)
//
// Usage: node scripts/fetch-testdata-real.mjs [--force]

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { unzipSync } = require("fflate")

const OUT_DIR = fileURLToPath(new URL("../testdata-real/", import.meta.url))
const outPath = (rel) => join(OUT_DIR, ...rel.split("/"))

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex")
}

/** One downloadable real-data source, pinned to a commit + content hashes. */
const SOURCES = [
	{
		name: "arch-chan",
		zipUrl:
			"https://codeload.github.com/Speykious/arch-chan/zip/ed43dcf7e88d56f79d2e42fecb084bf6923f44e0",
		zipSha256:
			"a9b4ccdab1e7dfb47da92bc90a01a0205a23c86b3d2f1a9e3645aa6b3b64ff47",
		commit: "ed43dcf7e88d56f79d2e42fecb084bf6923f44e0",
		sourceUrl:
			"https://github.com/Speykious/arch-chan/tree/ed43dcf7e88d56f79d2e42fecb084bf6923f44e0",
		license: "CC0 1.0 Universal (LICENSE.md in the upstream repo).",
		expected: Object.freeze({
			"arch-chan/Arch Chan Model0.2048/texture_00.png":
				"83ada01290c90713c7b6eb7f038f513756acb7156282aeeb6e997f565dfbc246",
			"arch-chan/Arch Chan Model0.cdi3.json":
				"7ac92cf1c3d5ee0f3bc6b0dc09a0c2054e8fdcec33ad585fd76d5b12c7385f22",
			"arch-chan/Arch Chan Model0.moc3":
				"edd79490147c4920d16dc7c80dffe3fc998db0e599c9024c884fd9d4e1041f9b",
			"arch-chan/Arch Chan Model0.physics3.json":
				"80c0f805f02d42830c7ea9181e17f83cd719032f5b3feccb76169f558e11280d",
			"arch-chan/Mouse.exp3.json":
				"6e5399f25f112ed3232ea3e759cdc4a00765969ffd1b8ac5e7563af5783fbc15",
			"arch-chan/arch chan model0.model3.json":
				"5c81770840211eeff4d80312a1a77a8bdb707a3ab15c14d14b1453c93082c14c",
		}),
		extract(entries) {
			// Codeload names the zip root `<repo>-<commit>`.
			const out = new Map()
			for (const [name, bytes] of Object.entries(entries)) {
				const rel = name.slice(name.indexOf("/") + 1)
				if (!rel.startsWith("Live2D/")) continue
				const file = rel.slice("Live2D/".length)
				// The Cubism editor project (`cmo3/`) is not needed.
				if (file === "" || file.endsWith("/") || file.startsWith("cmo3/"))
					continue
				out.set(`arch-chan/${file}`, bytes)
			}
			return out
		},
	},
	{
		name: "dragonbones-standard",
		zipUrl:
			"https://codeload.github.com/h1ve2/pixi-dragonbones-runtime-starter/zip/53141be91ed7632f6fb41f98b3b2013c009e6faa",
		zipSha256:
			"70c0e2a3a39b8f237ebb9e0a0d4b7d7ef9383d267cd133810344b1852a9ed646",
		commit: "53141be91ed7632f6fb41f98b3b2013c009e6faa",
		sourceUrl:
			"https://github.com/h1ve2/pixi-dragonbones-runtime-starter/tree/53141be91ed7632f6fb41f98b3b2013c009e6faa",
		license:
			"MIT (the repo is MIT; the sample is used for local testing only).",
		expected: Object.freeze({
			"dragonbones-standard/starter_ske.json":
				"65cc18f6a019470223256a9243f4d2c7633e01adc138d3cd20db52d9037ae3dc",
			"dragonbones-standard/starter_tex.json":
				"38e4d6791ecc6db9c7559332ed48bc3073788c6341e07b727cf9f95bdad2fafa",
			"dragonbones-standard/starter_tex.png":
				"0bafba2e64a3eb12310823ab0691fc3fc86e3c85a142c1ab7be608ad46fad4dc",
		}),
		extract(entries) {
			const out = new Map()
			for (const [name, bytes] of Object.entries(entries)) {
				const rel = name.slice(name.indexOf("/") + 1)
				const match =
					/\/(starter_ske\.json|starter_tex\.json|starter_tex\.png)$/.exec(rel)
				if (match === null) continue
				out.set(`dragonbones-standard/${match[1]}`, bytes)
			}
			return out
		},
	},
]

/** True when every source's expected entries exist and match their pins. */
function isUpToDate() {
	return SOURCES.every(isSourceUpToDate)
}

/** True when a single source's expected entries exist and match their pins. */
function isSourceUpToDate(source) {
	for (const [rel, expected] of Object.entries(source.expected)) {
		try {
			if (sha256(readFileSync(outPath(rel))) !== expected) return false
		} catch {
			return false
		}
	}
	return true
}

async function fetchSource(source) {
	const res = await fetch(source.zipUrl)
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.zipUrl}`)
	const zip = Buffer.from(await res.arrayBuffer())
	if (sha256(zip) !== source.zipSha256) {
		throw new Error(
			`${source.name}: source archive sha256 mismatch (got ${sha256(zip)}, expected ${source.zipSha256}) — ` +
				"update the pinned commit/hash in scripts/fetch-testdata-real.mjs",
		)
	}

	const extracted = source.extract(unzipSync(zip))
	let written = 0
	for (const [rel, bytes] of extracted) {
		if (!(rel in source.expected)) continue
		const dest = outPath(rel)
		mkdirSync(dirname(dest), { recursive: true })
		writeFileSync(dest, bytes)
		written++
	}
	if (written !== Object.keys(source.expected).length) {
		throw new Error(
			`${source.name}: archive layout changed (extracted ${written}, expected ${Object.keys(source.expected).length}) — ` +
				"update the entry list in scripts/fetch-testdata-real.mjs",
		)
	}
	for (const [rel, expected] of Object.entries(source.expected)) {
		const actual = sha256(readFileSync(outPath(rel)))
		if (actual !== expected) {
			throw new Error(
				`${source.name}: extracted file sha256 mismatch: ${rel} (got ${actual})`,
			)
		}
	}
	return written
}

function renderReadme() {
	const notes = ["# Real test data (NOT COMMITTED)", ""]
	for (const source of SOURCES) {
		const commit = source.commit.slice(0, 12)
		notes.push(
			`Source: ${source.sourceUrl} (zip via codeload, commit ${commit})`,
			`License: ${source.license}`,
			`sha256:`,
			...Object.entries(source.expected).map(
				([rel, hash]) => `- ${rel}: ${hash}`,
			),
			"",
		)
	}
	notes.push(
		"Regenerated by `node scripts/fetch-testdata-real.mjs` (or `pnpm install`).",
		"",
	)
	writeFileSync(join(OUT_DIR, "README.md"), notes.join("\n"))
}

async function main() {
	const force = process.argv.includes("--force")
	const pending = force
		? SOURCES
		: SOURCES.filter((source) => !isSourceUpToDate(source))
	if (pending.length === 0) {
		console.log(
			"[testdata-real] present and verified — skipping (use --force to re-fetch).",
		)
		return
	}

	for (const source of pending) {
		const written = await fetchSource(source)
		console.log(`[testdata-real] ${source.name}: wrote ${written} files ✓`)
	}
	if (isUpToDate()) renderReadme()
}

main().catch((err) => {
	console.error(`[testdata-real] failed: ${err.message}`)
	process.exit(1)
})
