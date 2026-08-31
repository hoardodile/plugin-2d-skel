import { defineConfig } from "vitest/config"

export default defineConfig({
	resolve: {
		// Live2D pulls Pixi's wide dependency tree; keep one React copy for
		// jsdom so Testing Library and @hoardodile/ui share a dispatcher.
		dedupe: ["react", "react-dom"],
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/__tests__/setup.ts"],
		css: false,
		include: ["src/**/*.test.{ts,tsx}"],
		// Default is cores-1 workers; turbo runs several packages' tests in
		// parallel, so cap each vitest run to keep the machine responsive.
		maxWorkers: 2,
	},
})
