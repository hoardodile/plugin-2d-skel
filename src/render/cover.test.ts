import { describe, expect, test, vi } from "vitest"
import { type CoverUpload, setResourceCover } from "./cover"

const PNG = "data:image/png;base64,AA=="

describe("setResourceCover", () => {
	test("uploads the cropped PNG bytes and reports success", async () => {
		const upload = vi.fn(
			async (_input: {
				file: Blob | ArrayBuffer
				filename: string
				mimeType?: string
			}) => ({ path: "/api/resources/r1/cover" }),
		)
		const log = vi.fn()
		const result = await setResourceCover(
			{ dataUrl: PNG, sceneIndex: 2 },
			upload,
			log,
		)
		expect(result).toEqual({ ok: true })
		expect(upload).toHaveBeenCalledTimes(1)
		const input = upload.mock.calls[0]?.[0] as {
			file: Blob
			filename: string
			mimeType: string
		}
		expect(input.filename).toBe("cover.png")
		expect(input.mimeType).toBe("image/png")
		expect(input.file).toBeInstanceOf(Blob)
		expect(input.file.size).toBe(1)
		expect(log).not.toHaveBeenCalled()
	})

	test("reports upload-failed and logs when the upload throws", async () => {
		const upload: CoverUpload = async () => {
			throw new Error("network down")
		}
		const log = vi.fn()
		const result = await setResourceCover(
			{ dataUrl: PNG, sceneIndex: 0 },
			upload,
			log,
		)
		expect(result).toEqual({ ok: false, reason: "upload-failed" })
		expect(log).toHaveBeenCalled()
	})

	test("reports bad-data-url without uploading for a non-PNG data URL", async () => {
		const upload = vi.fn(async () => ({ path: "/api/resources/r1/cover" }))
		const log = vi.fn()
		const result = await setResourceCover(
			{ dataUrl: "data:image/jpeg;base64,AA==", sceneIndex: 0 },
			upload,
			log,
		)
		expect(result).toEqual({ ok: false, reason: "bad-data-url" })
		expect(upload).not.toHaveBeenCalled()
	})

	test("reports bad-data-url without logging when no logger is provided", async () => {
		const upload = vi.fn(async () => ({ path: "/api/resources/r1/cover" }))
		const result = await setResourceCover(
			{ dataUrl: "x", sceneIndex: 0 },
			upload,
		)
		expect(result).toEqual({ ok: false, reason: "bad-data-url" })
		expect(upload).not.toHaveBeenCalled()
	})
})
