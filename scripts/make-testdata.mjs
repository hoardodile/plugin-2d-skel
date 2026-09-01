#!/usr/bin/env node
/**
 * Generate tiny Live2D descriptor fixtures the detect:smoke command can
 * classify. Files are synthetic — they exist to exercise detection and
 * sidecar listing, not to render.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "testdata")

const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ0AAAAASUVORK5CYII=",
	"base64",
)

function writeScene(name, files) {
	const dir = join(ROOT, name)
	rmSync(dir, { recursive: true, force: true })
	mkdirSync(dir, { recursive: true })
	for (const [filename, bytes] of Object.entries(files)) {
		writeFileSync(join(dir, filename), bytes)
	}
}

writeScene("cubism", {
	"hero.model3.json": JSON.stringify({
		Version: 3,
		FileReferences: {
			Moc: "Moc_0.moc3",
			Textures: ["Textures_0_0.png"],
			Motions: { Idle: [{ File: "Motions_Idle_0_File_0.json" }] },
		},
	}),
	"Moc_0.moc3": Buffer.from("MOC3fixture"),
	"Textures_0_0.png": PNG,
	"Motions_Idle_0_File_0.json": JSON.stringify({ Meta: { Duration: 1 } }),
})

writeScene("ex-moc", {
	"model0.json": JSON.stringify({
		type: 0,
		model: "model_0.moc",
		textures: ["textures_0_0.png"],
		motions: { idle: [{ file: "motions_idle_0_file_0" }] },
		expressions: [{ name: "smile", file: "expressions_0_file_0.json" }],
	}),
	"model_0.moc": Buffer.from("mocfixture"),
	"textures_0_0.png": PNG,
	motions_idle_0_file_0: Buffer.from("motionfixture"),
	"expressions_0_file_0.json": JSON.stringify({ params: [] }),
})

const ATLAS =
	"hero.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n"

const JSON_SKELETON = JSON.stringify({
	skeleton: { spine: "4.1.24" },
	bones: [{ name: "root" }],
	skins: [{ name: "default" }],
	animations: { idle: {} },
})

writeScene("spine-standard", {
	"hero.json": JSON_SKELETON,
	"hero.atlas": ATLAS,
	"hero.png": PNG,
})

writeScene("spine-ex", {
	"model0.json": JSON.stringify({
		type: 9,
		skeleton: "skeleton_0",
		atlases: [
			{
				atlas: "atlases_0_atlas_0",
				tex_names: ["specialillust64"],
				textures: ["atlases_0_textures_0_0.png"],
			},
		],
		motions: { idle: [{ file: "idle" }] },
	}),
	skeleton_0: Buffer.concat([Buffer.from("4.2.119\0"), Buffer.alloc(64)]),
	atlases_0_atlas_0: ATLAS,
	"atlases_0_textures_0_0.png": PNG,
})

const DB_SKE = JSON.stringify({
	frameRate: 30,
	name: "hero",
	version: "5.5",
	compatibleVersion: "5.5",
	armature: [
		{
			type: "Armature",
			name: "hero",
			animation: [{ name: "idle" }, { name: "walk" }],
			skin: [{ name: "default", slot: [{ name: "s0", display: [] }] }],
		},
	],
})

const DB_TEX = JSON.stringify({
	name: "hero",
	imagePath: "hero_tex.png",
	width: 256,
	height: 256,
	SubTexture: [{ name: "idle", x: 0, y: 0, width: 10, height: 10 }],
})

const DB_BIN = Buffer.concat([
	Buffer.from("DBDT\x00\x00\x00\x02\x00\x00\x00\x00"),
	Buffer.from(DB_SKE, "utf8"),
])

writeScene("dragonbones-standard", {
	"hero_ske.json": DB_SKE,
	"hero_tex.json": DB_TEX,
	"hero_tex.png": PNG,
})

writeScene("dragonbones-ex", {
	"model0.json": JSON.stringify({
		type: 10,
		skeleton: "skeleton_0",
		atlases: [
			{
				atlas: "atlases_0_atlas_0.json",
				tex_names: ["role1011_tex"],
				textures: ["atlases_0_textures_0_0.png"],
			},
		],
		motions: { idle: [{ file: "idle" }] },
	}),
	skeleton_0: DB_BIN,
	"atlases_0_atlas_0.json": DB_TEX,
	"atlases_0_textures_0_0.png": PNG,
})

writeScene("mixed", {
	"hero.model3.json": JSON.stringify({
		Version: 3,
		FileReferences: {
			Moc: "Moc_0.moc3",
			Textures: ["Textures_0_0.png"],
			Motions: { Idle: [{ File: "Motions_Idle_0_File_0.json" }] },
		},
	}),
	"Moc_0.moc3": Buffer.from("MOC3fixture"),
	"Textures_0_0.png": PNG,
	"Motions_Idle_0_File_0.json": JSON.stringify({ Meta: { Duration: 1 } }),
	"bg.json": JSON_SKELETON,
	"bg.atlas": ATLAS,
	"bg.png": PNG,
})

console.log(`testdata written to ${ROOT}`)
