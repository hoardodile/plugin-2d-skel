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

vi.mock("@hoardodile/ui/hooks/use-mobile", () => ({
	useBelowMd: () => false,
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
				onToggleFullscreen={() => {}}
			/>,
		)

		expect(screen.getByTestId("engine-toolbar")).toBeInTheDocument()
		expect(screen.getByTestId("engine-play-toggle")).toBeInTheDocument()
		// The model selector no longer lives in the toolbar.
		expect(screen.queryByTestId("engine-scene-select")).not.toBeInTheDocument()
	})
})
