import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, test, vi } from "vitest"
import { SpineControlsTab } from "./SpineControlsTab"

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, language: "en" }),
}))

vi.mock("@hoardodile/ui/components/dropdown-select", () => ({
	DropdownSelect: function DropdownSelect(props: Record<string, unknown>) {
		const { value, options, onValueChange, triggerClassName, ...rest } = props
		void triggerClassName
		return (
			<button
				type="button"
				data-testid={String(props["data-testid"] ?? "")}
				aria-label={String(props["aria-label"] ?? "")}
				onClick={() => {
					const opts = options as readonly { value: string }[]
					const change = onValueChange as ((value: string) => void) | undefined
					if (opts.length > 0) change?.(opts[0]!.value)
				}}
				{...rest}
			>
				{String(value ?? "")}
			</button>
		)
	},
}))

vi.mock("@hoardodile/ui/components/section-label", () => ({
	SectionLabel: ({ children }: { readonly children?: ReactNode }) => <div data-testid="section-label">{children}</div>,
}))

vi.mock("@hoardodile/ui/components/separator", () => ({
	Separator: () => <div data-testid="separator" />,
}))

vi.mock("@hoardodile/ui/components/tag-chip", () => ({
	TagChip: function TagChip(props: Record<string, unknown>) {
		const { children, ...rest } = props
		return (
			<button type="button" {...rest}>
				{children as ReactNode}
			</button>
		)
	},
}))

vi.mock("@hoardodile/ui/components/list-empty-row", () => ({
	ListEmptyRow: ({ children }: { readonly children?: ReactNode } & Record<string, unknown>) => (
		<div data-testid="list-empty-row">{children}</div>
	),
}))

function renderTab(overrides: Partial<Parameters<typeof SpineControlsTab>[0]> = {}) {
	const base = {
		animations: ["idle", "run"],
		skins: ["default", "alt"],
		overlays: ["blink"],
		animation: "idle",
		skin: "alt",
		overlay: "blink",
		onAnimationChange: vi.fn(),
		onSkinChange: vi.fn(),
		onOverlayChange: vi.fn(),
		hitAreas: [{ name: "body", detail: "tap:body" }],
		onHit: vi.fn(),
		...overrides,
	}
	render(<SpineControlsTab {...base} />)
	return base
}

describe("SpineControlsTab", () => {
	test("renders every populated section", () => {
		renderTab()
		expect(screen.getByTestId("spine-animation-select")).toBeInTheDocument()
		expect(screen.getByTestId("spine-skin-select")).toBeInTheDocument()
		expect(screen.getByTestId("spine-overlay-select")).toBeInTheDocument()
		expect(screen.getByTestId("spine-controls-hitarea-body")).toBeInTheDocument()
	})

	test("drops empty sections", () => {
		renderTab({ overlays: [], hitAreas: [], skins: ["default"] })
		expect(screen.getByTestId("spine-animation-select")).toBeInTheDocument()
		expect(screen.queryByTestId("spine-skin-select")).not.toBeInTheDocument()
		expect(screen.queryByTestId("spine-overlay-select")).not.toBeInTheDocument()
		expect(screen.queryByTestId("spine-controls-hitarea-body")).not.toBeInTheDocument()
	})

	test("renders the empty state when nothing is available", () => {
		renderTab({ animations: [], skins: ["default"], overlays: [], hitAreas: [] })
		expect(screen.getByTestId("list-empty-row")).toBeInTheDocument()
		expect(screen.queryByTestId("spine-animation-select")).not.toBeInTheDocument()
	})
})
