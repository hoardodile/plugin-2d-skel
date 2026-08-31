import { describe, expect, test, vi } from "vitest"
import { setResourceCover } from "./cover"

describe("setResourceCover (reserved)", () => {
	test("reports unavailable and logs", async () => {
		const log = vi.fn()
		const result = await setResourceCover(
			{ dataUrl: "data:image/png;base64,AA==", sceneIndex: 2 },
			log,
		)
		expect(result).toEqual({ ok: false, reason: "api-unavailable" })
		expect(log).toHaveBeenCalled()
	})

	test("resolves without a logger", async () => {
		await expect(
			setResourceCover({ dataUrl: "x", sceneIndex: 0 }),
		).resolves.toEqual({ ok: false, reason: "api-unavailable" })
	})
})
