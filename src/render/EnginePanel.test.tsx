import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { EnginePanel } from "./EnginePanel"

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, language: "en" }),
}))

describe("EnginePanel", () => {
	test("renders the tab bar and the active tab body", () => {
		const onTabChange = vi.fn()
		render(
			<EnginePanel
				open
				onClose={() => {}}
				tabs={[
					{ key: "a", label: "A", testId: "tab-a" },
					{ key: "b", label: "B", testId: "tab-b" },
				]}
				tab="a"
				onTabChange={onTabChange}
				testId="engine-panel"
			>
				<div data-testid="body">active body</div>
			</EnginePanel>,
		)

		expect(screen.getByTestId("engine-panel")).toBeInTheDocument()
		expect(screen.getByTestId("tab-a")).toBeInTheDocument()
		expect(screen.getByTestId("tab-b")).toBeInTheDocument()
		expect(screen.getByTestId("body")).toHaveTextContent("active body")
	})

	test("renders a docked aside when docked", () => {
		render(
			<EnginePanel
				docked
				open
				onClose={() => {}}
				tabs={[
					{ key: "a", label: "A", testId: "tab-a" },
					{ key: "b", label: "B", testId: "tab-b" },
				]}
				tab="a"
				onTabChange={() => {}}
				testId="engine-panel"
			>
				<div data-testid="body">docked body</div>
			</EnginePanel>,
		)

		const panel = screen.getByTestId("engine-panel")
		expect(panel.tagName).toBe("ASIDE")
		expect(screen.getByTestId("tab-a")).toBeInTheDocument()
		expect(screen.getByTestId("body")).toHaveTextContent("docked body")
	})
})
