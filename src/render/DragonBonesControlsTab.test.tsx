import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, test, vi } from "vitest"
import { DragonBonesControlsTab } from "./DragonBonesControlsTab"

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, language: "en" }),
}))

vi.mock("@hoardodile/ui/components/section-label", () => ({
	SectionLabel: ({ children }: { readonly children?: ReactNode }) => (
		<div data-testid="section-label">{children}</div>
	),
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
	ListEmptyRow: ({
		children,
	}: { readonly children?: ReactNode } & Record<string, unknown>) => (
		<div data-testid="list-empty-row">{children}</div>
	),
}))

function renderTab(
	overrides: Partial<Parameters<typeof DragonBonesControlsTab>[0]> = {},
) {
	const base = {
		armatures: ["root", "sub"],
		animations: ["idle", "run"],
		skins: ["default", "alt"],
		armature: "root",
		animation: "idle",
		skin: "alt",
		onArmatureChange: vi.fn(),
		onAnimationChange: vi.fn(),
		onSkinChange: vi.fn(),
		hitAreas: [{ name: "body", detail: "tap:body" }],
		onHit: vi.fn(),
		...overrides,
	}
	render(<DragonBonesControlsTab {...base} />)
	return base
}

describe("DragonBonesControlsTab", () => {
	test("renders every populated section as tag chips", () => {
		renderTab()
		expect(screen.getByTestId("dragonbones-armature-root")).toBeInTheDocument()
		expect(screen.getByTestId("dragonbones-armature-sub")).toBeInTheDocument()
		expect(screen.getByTestId("dragonbones-animation-idle")).toBeInTheDocument()
		expect(screen.getByTestId("dragonbones-animation-run")).toBeInTheDocument()
		expect(screen.getByTestId("dragonbones-skin-default")).toBeInTheDocument()
		expect(screen.getByTestId("dragonbones-skin-alt")).toBeInTheDocument()
		expect(
			screen.getByTestId("dragonbones-controls-hitarea-body"),
		).toBeInTheDocument()
	})

	test("drops singleton armature and skin blocks", () => {
		renderTab({ armatures: ["root"], skins: ["default"] })
		expect(
			screen.queryByTestId("dragonbones-armature-root"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("dragonbones-skin-default"),
		).not.toBeInTheDocument()
		expect(screen.getByTestId("dragonbones-animation-idle")).toBeInTheDocument()
	})

	test("renders the empty state when nothing is available", () => {
		renderTab({ animations: [], hitAreas: [], armatures: [], skins: [] })
		expect(screen.getByTestId("list-empty-row")).toBeInTheDocument()
		expect(
			screen.queryByTestId("dragonbones-animation-idle"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("dragonbones-skin-default"),
		).not.toBeInTheDocument()
	})

	test("clicking an animation chip selects it", () => {
		const base = renderTab()
		screen.getByTestId("dragonbones-animation-run").click()
		expect(base.onAnimationChange).toHaveBeenCalledWith("run")
	})
})
