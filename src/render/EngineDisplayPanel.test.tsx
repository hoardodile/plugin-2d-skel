import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, test, vi } from "vitest"
import { EngineDisplayPanel } from "./EngineDisplayPanel"
import { ENGINE_SETTINGS_DEFAULT } from "./prefs"

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, language: "en" }),
}))

vi.mock("@hoardodile/ui/components/button", () => ({
	Button: function Button({ children, ...rest }: Record<string, unknown>) {
		return (
			<button type="button" {...rest}>
				{children as ReactNode}
			</button>
		)
	},
}))

vi.mock("@hoardodile/ui/components/switch", () => ({
	Switch: function Switch(props: Record<string, unknown>) {
		const { checked, onCheckedChange, ...rest } = props
		const onChange = onCheckedChange as ((value: boolean) => void) | undefined
		return (
			<button
				type="button"
				data-testid={String(rest["data-testid"] ?? "")}
				data-checked={String(checked)}
				onClick={() => onChange?.(!checked)}
			>
				switch
			</button>
		)
	},
}))

vi.mock("@hoardodile/ui/components/dropdown-select", () => ({
	DropdownSelect: function DropdownSelect(props: Record<string, unknown>) {
		return (
			<button
				type="button"
				data-testid={String(props["data-testid"] ?? "")}
				aria-label={String(props["aria-label"] ?? "")}
			>
				{String(props.value ?? "")}
			</button>
		)
	},
}))

vi.mock("@hoardodile/ui/components/label", () => ({
	Label: ({ children }: { readonly children?: ReactNode }) => (
		<span>{children}</span>
	),
}))

vi.mock("@hoardodile/ui/components/section-label", () => ({
	SectionLabel: ({ children }: { readonly children?: ReactNode }) => (
		<span data-testid="section-label">{children}</span>
	),
}))

vi.mock("@hoardodile/ui/components/separator", () => ({
	Separator: () => <hr />,
}))

vi.mock("@hoardodile/ui/components/slider", () => ({
	Slider: () => <div data-testid="slider" />,
}))

vi.mock("@hoardodile/ui/components/color-picker", () => ({
	ColorPicker: () => <div data-testid="color-picker" />,
}))

describe("EngineDisplayPanel", () => {
	test("renders the WebP textures toggle off by default", () => {
		render(
			<EngineDisplayPanel
				engine="spine"
				settings={ENGINE_SETTINGS_DEFAULT}
				onSettingsChange={vi.fn()}
			/>,
		)
		const toggle = screen.getByTestId("engine-webp-toggle")
		expect(toggle).toHaveAttribute("data-checked", "false")
	})

	test("toggling the WebP switch calls onSettingsChange with webpTextures true", () => {
		const onSettingsChange = vi.fn()
		render(
			<EngineDisplayPanel
				engine="spine"
				settings={ENGINE_SETTINGS_DEFAULT}
				onSettingsChange={onSettingsChange}
			/>,
		)
		fireEvent.click(screen.getByTestId("engine-webp-toggle"))
		expect(onSettingsChange).toHaveBeenCalledWith({ webpTextures: true })
	})
})
