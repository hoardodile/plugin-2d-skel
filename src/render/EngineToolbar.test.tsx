import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, test, vi } from "vitest"
import { EngineToolbar } from "./EngineToolbar"

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, language: "en" }),
}))

vi.mock("@hoardodile/ui/components/icon", () => ({
	Icon: function Icon() {
		return <span aria-hidden="true" />
	},
}))

vi.mock("@hoardodile/ui/components/separator", () => ({
	Separator: function Separator() {
		return null
	},
}))

vi.mock("@hoardodile/ui/components/tooltip", () => ({
	TooltipProvider: ({ children }: { readonly children?: ReactNode }) => (
		<>{children}</>
	),
	Tooltip: ({ children }: { readonly children?: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({
		children,
		render,
	}: {
		readonly children?: ReactNode
		readonly render?: ReactNode
	}) => <>{render ?? children}</>,
	TooltipContent: ({ children }: { readonly children?: ReactNode }) => (
		<>{children}</>
	),
}))

vi.mock("@hoardodile/ui/components/button", () => ({
	Button: function Button(
		props: Record<string, unknown> & { readonly children?: ReactNode },
	) {
		const { children, type, ...rest } = props
		return (
			<button type={type as "button" | undefined} {...rest}>
				{children as ReactNode}
			</button>
		)
	},
}))

describe("EngineToolbar", () => {
	test("renders transport controls without the in-canvas model selector", () => {
		render(
			<EngineToolbar
				visible
				paused={false}
				ready
				onTogglePause={() => {}}
				onRestart={() => {}}
				onResetView={() => {}}
			/>,
		)

		expect(screen.getByTestId("engine-toolbar")).toBeInTheDocument()
		expect(screen.getByTestId("engine-play-toggle")).toBeInTheDocument()
		expect(screen.getByTestId("engine-restart")).toBeInTheDocument()
		// Transport buttons are shown on every viewport (not just md+).
		expect(screen.getByTestId("engine-reset-view")).toBeInTheDocument()
		// Fullscreen was removed from the viewer chrome.
		expect(screen.queryByTestId("engine-fullscreen")).not.toBeInTheDocument()
		// The model selector no longer lives in the toolbar.
		expect(screen.queryByTestId("engine-scene-select")).not.toBeInTheDocument()
	})

	test("shows the top border only when showTopBorder is set", () => {
		const { rerender } = render(
			<EngineToolbar
				visible
				paused={false}
				ready
				onTogglePause={() => {}}
				onRestart={() => {}}
				onResetView={() => {}}
			/>,
		)
		// Default (undefined): border shown.
		expect(screen.getByTestId("engine-toolbar").className).toContain("border-t")

		// Docked panel mode: border hidden.
		rerender(
			<EngineToolbar
				visible
				paused={false}
				ready
				onTogglePause={() => {}}
				onRestart={() => {}}
				onResetView={() => {}}
				showTopBorder={false}
			/>,
		)
		expect(screen.getByTestId("engine-toolbar").className).not.toContain(
			"border-t",
		)
	})
})
