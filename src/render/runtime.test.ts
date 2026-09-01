import type {
	PluginDownloadRequest,
	PluginDownloadResult,
} from "@hoardodile/sdk-types"
import { beforeEach, describe, expect, it } from "vitest"
import {
	__resetLive2dRuntimeForTests,
	ensureLive2dRuntime,
	type Live2dRuntimeAPI,
} from "./runtime"

const REASON = "runtime license notice"

const FILES: readonly { readonly dest: string; readonly url: string }[] = [
	{
		dest: "runtime/live2d.min.js",
		url: "https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js",
	},
	{
		dest: "runtime/live2dcubismcore.min.js",
		url: "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
	},
]

function createApi(
	onDownload: (
		requests: readonly PluginDownloadRequest[],
	) => Promise<readonly PluginDownloadResult[]>,
	onDelete: (path: string) => Promise<{ existed: boolean }> = async () => ({
		existed: false,
	}),
): Live2dRuntimeAPI {
	return {
		download: onDownload,
		resolveAssetUrl: (path) => `https://vault.test/${path}`,
		deleteAsset: onDelete,
	}
}

beforeEach(() => {
	__resetLive2dRuntimeForTests()
	delete (window as unknown as Record<string, unknown>).PIXI
	delete (window as unknown as Record<string, unknown>).Live2DCubismCore
})

describe("ensureLive2dRuntime", () => {
	it("batches both pinned runtimes into one download call and injects scripts in order", async () => {
		const calls: (readonly PluginDownloadRequest[])[] = []
		const injected: string[] = []
		const api = createApi(async (requests) => {
			calls.push(requests)
			return requests.map((request) => ({
				path: request.dest,
				sizeBytes: 1,
				sha256: request.sha256 ?? "",
				cached: false,
			}))
		})

		const result = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript: async (src) => {
				injected.push(src)
			},
		})

		expect(result).toEqual({ ok: true })
		// One batched call = one consent question for the whole batch.
		expect(calls).toHaveLength(1)
		const requests = calls[0]!
		expect(requests.map((r) => r.dest)).toEqual(FILES.map((f) => f.dest))
		for (const [index, request] of requests.entries()) {
			expect(request.url).toBe(FILES[index]?.url)
			expect(request.sha256).toMatch(/^[0-9a-f]{64}$/)
			expect(request.reason).toBe(REASON)
		}
		// Results arrive in request order and are injected in that order.
		expect(injected).toEqual([
			"https://vault.test/runtime/live2d.min.js",
			"https://vault.test/runtime/live2dcubismcore.min.js",
		])
	})

	it("resolves immediately when the runtime globals are already loaded", async () => {
		let downloads = 0
		const api = createApi(async (requests) => {
			downloads++
			return requests.map((request) => ({
				path: request.dest,
				sizeBytes: 1,
				sha256: request.sha256 ?? "",
				cached: false,
			}))
		})
		;(window as unknown as Record<string, unknown>).PIXI = { live2d: {} }
		;(window as unknown as Record<string, unknown>).Live2DCubismCore = {}

		const result = await ensureLive2dRuntime(api, { reason: REASON })

		expect(result).toEqual({ ok: true })
		expect(downloads).toBe(0)
	})

	it("caches success: a second call downloads and injects nothing", async () => {
		let downloads = 0
		const api = createApi(async (requests) => {
			downloads++
			return requests.map((request) => ({
				path: request.dest,
				sizeBytes: 1,
				sha256: request.sha256 ?? "",
				cached: false,
			}))
		})
		const injectScript = async () => {}

		await ensureLive2dRuntime(api, { reason: REASON, injectScript })
		await ensureLive2dRuntime(api, { reason: REASON, injectScript })

		expect(downloads).toBe(1)
	})

	it("maps DENIED and clears the cache so a retry re-runs", async () => {
		let downloads = 0
		const api = createApi(async () => {
			downloads++
			const error = new Error("declined")
			error.name = "DENIED"
			throw error
		})
		const injectScript = async () => {}

		// The batch is all-or-nothing: a declined dialog stages nothing,
		// so nothing is awaited before the rejection.
		const first = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript,
		})
		expect(first).toEqual({ ok: false, error: { kind: "denied" } })
		expect(downloads).toBe(1)

		// A failure clears the module cache — the retry starts over.
		const second = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript,
		})
		expect(second).toEqual({ ok: false, error: { kind: "denied" } })
		expect(downloads).toBe(2)
	})

	it("maps UNAVAILABLE to its kind, then succeeds on retry", async () => {
		let unavailable = true
		let downloads = 0
		const api = createApi(async (requests) => {
			downloads++
			if (unavailable) {
				unavailable = false
				const error = new Error("no consent channel")
				error.name = "UNAVAILABLE"
				throw error
			}
			return requests.map((request) => ({
				path: request.dest,
				sizeBytes: 1,
				sha256: request.sha256 ?? "",
				cached: false,
			}))
		})
		const injectScript = async () => {}

		const first = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript,
		})
		expect(first).toEqual({ ok: false, error: { kind: "unavailable" } })

		const second = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript,
		})
		expect(second).toEqual({ ok: true })
		expect(downloads).toBe(2)
	})

	it("maps unexpected rejections to failed", async () => {
		const api = createApi(async () => {
			throw new Error("boom")
		})

		const result = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript: async () => {},
		})

		expect(result).toEqual({ ok: false, error: { kind: "failed" } })
	})

	it("falls back to the mirror set on a network failure", async () => {
		const calls: (readonly PluginDownloadRequest[])[] = []
		const api = createApi(async (requests) => {
			calls.push(requests)
			if (calls.length === 1) {
				const error = new Error("fetch failed")
				error.name = "TypeError"
				throw error
			}
			return requests.map((request) => ({
				path: request.dest,
				sizeBytes: 1,
				sha256: request.sha256 ?? "",
				cached: false,
			}))
		})

		const result = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript: async () => {},
		})

		expect(result).toEqual({ ok: true })
		expect(calls).toHaveLength(2)
		// The mirror set swaps the jsDelivr file to the Fastly edge and
		// keeps the primary URL for the mirrorless cubism core file.
		expect(calls[1]![0]!.url).toContain("fastly.jsdelivr.net")
		expect(calls[1]![1]!.url).toBe(FILES[1]!.url)
	})

	it("treats a bridge timeout as network and reaches the mirror", async () => {
		let calls = 0
		const api = createApi(async (requests) => {
			calls++
			if (calls === 1) {
				throw new DOMException("timed out", "AbortError")
			}
			return requests.map((request) => ({
				path: request.dest,
				sizeBytes: 1,
				sha256: request.sha256 ?? "",
				cached: false,
			}))
		})

		const result = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript: async () => {},
		})
		expect(result).toEqual({ ok: true })
		expect(calls).toBe(2)
	})

	it("purges the stale vault files and retries the pin rejection", async () => {
		const deleted: string[] = []
		let calls = 0
		const api = createApi(
			async (requests) => {
				calls++
				if (calls === 1) {
					const error = new Error(
						'plugin vault file "runtime/live2d.min.js" fails the requested sha256 pin',
					)
					error.name = "POLICY"
					throw error
				}
				return requests.map((request) => ({
					path: request.dest,
					sizeBytes: 1,
					sha256: request.sha256 ?? "",
					cached: false,
				}))
			},
			async (path) => {
				deleted.push(path)
				return { existed: true }
			},
		)

		const result = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript: async () => {},
		})

		expect(result).toEqual({ ok: true })
		expect(calls).toBe(2)
		expect(deleted).toEqual(FILES.map((file) => file.dest))
	})

	it("reports stale when the retry still fails the pin", async () => {
		let calls = 0
		const api = createApi(async () => {
			calls++
			const error = new Error(
				"plugin download integrity mismatch: expected a, got b",
			)
			error.name = "POLICY"
			throw error
		})

		const result = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript: async () => {},
		})

		expect(result).toEqual({ ok: false, error: { kind: "stale" } })
		expect(calls).toBe(2)
	})

	it("never purges or mirrors a user decision", async () => {
		const deleted: string[] = []
		let calls = 0
		const api = createApi(
			async () => {
				calls++
				const error = new Error("declined")
				error.name = "DENIED"
				throw error
			},
			async (path) => {
				deleted.push(path)
				return { existed: false }
			},
		)

		const result = await ensureLive2dRuntime(api, {
			reason: REASON,
			injectScript: async () => {},
		})
		expect(result).toEqual({ ok: false, error: { kind: "denied" } })
		expect(calls).toBe(1)
		expect(deleted).toEqual([])
	})
})
