import { describe, expect, test } from "vitest"
import {
	decodeEngineSettings,
	ENGINE_SETTINGS_DEFAULT,
	encodeEngineSettings,
	toLive2dSettings,
	toSpineSettings,
} from "./prefs"

describe("engine settings codec", () => {
	test("round-trips the default settings", () => {
		expect(
			decodeEngineSettings(encodeEngineSettings(ENGINE_SETTINGS_DEFAULT)),
		).toEqual(ENGINE_SETTINGS_DEFAULT)
	})

	test("rejects malformed or outdated payloads", () => {
		expect(decodeEngineSettings("not json")).toBeUndefined()
		expect(decodeEngineSettings('{"v":1,"loop":"yes"}')).toBeUndefined()
		expect(decodeEngineSettings('{"v":99,"loop":true}')).toBeUndefined()
	})

	test("migrates a legacy live2d v:2 payload with new-field defaults", () => {
		const decoded = decodeEngineSettings(
			JSON.stringify({
				v: 2,
				background: "solid",
				solidColor: "#ffffff",
				loop: true,
				interact: false,
				volume: 0.5,
				muted: true,
				mirror: true,
				fitMode: "width",
				panelTab: "info",
			}),
		)
		expect(decoded).toEqual({
			v: 5,
			interactionMode: "interact",
			background: "solid",
			solidColor: "#ffffff",
			loop: true,
			interact: false,
			volume: 0.5,
			muted: true,
			mirror: true,
			fitMode: "width",
			speed: 1,
			autoPlay: false,
			autoPlayMode: "sequential",
			autoPlayIntervalMs: 5000,
			chrome: "auto",
			live2dTab: "info",
			spineTab: "controls",
			autoplay: true,
			debug: false,
			showHitAreas: false,
			webpTextures: false,
		})
	})

	test("migrates a legacy spine v:1 payload", () => {
		const decoded = decodeEngineSettings(
			JSON.stringify({
				v: 1,
				background: "checker",
				autoplay: false,
				loop: false,
				speed: 2,
				debug: true,
			}),
		)
		expect(decoded?.v).toBe(5)
		expect(decoded?.autoplay).toBe(false)
		expect(decoded?.debug).toBe(true)
		expect(decoded?.mirror).toBe(false)
	})

	test("round-trips new fields and clamps speed", () => {
		const settings = {
			...ENGINE_SETTINGS_DEFAULT,
			speed: 0.5,
			autoPlay: true,
			autoPlayMode: "shuffle" as const,
			autoPlayIntervalMs: 8000,
			chrome: "always" as const,
			live2dTab: "display" as const,
			spineTab: "display" as const,
			debug: true,
		}
		expect(decodeEngineSettings(encodeEngineSettings(settings))).toEqual(
			settings,
		)
		expect(
			decodeEngineSettings(
				JSON.stringify({ ...ENGINE_SETTINGS_DEFAULT, speed: 99 }),
			)?.speed,
		).toBe(2)
	})

	test("maps the unified settings to per-engine subsets", () => {
		const live2d = toLive2dSettings(ENGINE_SETTINGS_DEFAULT)
		expect(live2d.background).toBe("transparent")
		expect(live2d.mirror).toBe(false)
		const spine = toSpineSettings({
			...ENGINE_SETTINGS_DEFAULT,
			background: "solid",
		})
		expect(spine.background).toBe("checker")
		expect(spine.autoplay).toBe(true)
	})

	test("defaults webpTextures off and threads it through the subsets", () => {
		expect(ENGINE_SETTINGS_DEFAULT.webpTextures).toBe(false)
		// A legacy payload without the field defaults to off.
		expect(
			decodeEngineSettings(JSON.stringify({ v: 5, loop: true }))?.webpTextures,
		).toBe(false)
		// An explicit on value round-trips and is present on both subsets.
		const on = { ...ENGINE_SETTINGS_DEFAULT, webpTextures: true }
		expect(decodeEngineSettings(encodeEngineSettings(on))?.webpTextures).toBe(
			true,
		)
		expect(toLive2dSettings(on).webpTextures).toBe(true)
		expect(toSpineSettings(on).webpTextures).toBe(true)
	})
})
