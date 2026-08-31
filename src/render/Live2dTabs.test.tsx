import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, test, vi } from "vitest"
import type { MotionEntry } from "../core/motion-graph"
import type { EngineSettings } from "./prefs"
import { Live2dControlsTab } from "./Live2dTabs"

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, language: "en" }),
}))

vi.mock("@hoardodile/ui/components/button", () => ({
	Button: function Button({
		children,
		active,
		variant,
		size,
		...rest
	}: Record<string, unknown>) {
		return (
			<button type="button" {...rest}>
				{children as ReactNode}
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

vi.mock("@hoardodile/ui/components/icon", () => ({
	Icon: () => <span aria-hidden="true" />,
}))

vi.mock("@hoardodile/ui/icons/registry", () => ({
	Magnifier: "magnifier",
}))

vi.mock("@hoardodile/ui/components/list-empty-row", () => ({
	ListEmptyRow: ({ children }: { readonly children?: ReactNode }) => (
		<div data-testid="list-empty-row">{children}</div>
	),
}))

vi.mock("@hoardodile/ui/components/section-label", () => ({
	SectionLabel: ({ children }: { readonly children?: ReactNode }) => (
		<span data-testid="section-label">{children}</span>
	),
}))

vi.mock("@hoardodile/ui/components/separator", () => ({
	Separator: () => <hr data-testid="separator" />,
}))

vi.mock("@hoardodile/ui/components/tag-chip", () => ({
	TagChip: function TagChip({
		children,
		onClick,
		active,
		suffix,
		...rest
	}: Record<string, unknown>) {
		return (
			<button
				type="button"
				onClick={onClick as () => void}
				data-active={active === true ? "true" : "false"}
				data-has-suffix={suffix !== undefined ? "true" : "false"}
				{...rest}
			>
				{children as ReactNode}
			</button>
		)
	},
}))

function makeEntry(overrides: Partial<MotionEntry> = {}): MotionEntry {
	return {
		name: "entry",
		file: undefined,
		fileLoop: false,
		fadeIn: 0,
		fadeOut: 0,
		sound: undefined,
		soundDelay: 0,
		soundVolume: undefined,
		text: undefined,
		textDelay: 0,
		textDuration: undefined,
		choices: [],
		next: undefined,
		commands: [],
		postCommands: [],
		expression: undefined,
		intimacy: undefined,
		priority: 1,
		interruptable: false,
		ignorable: false,
		weight: 1,
		motionDuration: undefined,
		speed: undefined,
		blendMode: undefined,
		timeLimit: undefined,
		enabled: true,
		...overrides,
	}
}

const SETTINGS = {
	v: 5,
	interactionMode: "interact",
	background: "transparent",
	solidColor: "#20242e",
	loop: true,
	interact: true,
	volume: 0.8,
	muted: false,
	mirror: false,
	fitMode: "fit",
	speed: 1,
	autoPlay: false,
	autoPlayMode: "sequential",
	autoPlayIntervalMs: 5000,
	chrome: "auto",
	live2dTab: "controls",
	spineTab: "controls",
	autoplay: true,
	debug: false,
	showHitAreas: false,
} satisfies EngineSettings

function renderTab(
	props: Partial<Parameters<typeof Live2dControlsTab>[0]> = {},
) {
	const base = {
		graph: {
			Idle: [makeEntry({ name: "a" }), makeEntry({ name: "b", motionDuration: 3 })],
			Walk: [makeEntry({ name: "c" })],
		},
		group: "Idle",
		motionIndex: 0,
		onGroupChange: vi.fn(),
		onPlayEntry: vi.fn(),
		settings: SETTINGS,
		onSettingsChange: vi.fn(),
		expressions: ["happy", "sad"],
		expression: "happy",
		onSelectExpression: vi.fn(),
		onClearExpression: vi.fn(),
		hitAreas: [{ name: "body", detail: "Idle:a" }, { name: "head" }],
		onHit: vi.fn(),
		...props,
	}
	render(<Live2dControlsTab {...base} />)
	return base
}

describe("Live2dControlsTab", () => {
	test("renders the merged controls sections", () => {
		renderTab()
		expect(screen.getAllByTestId("section-label")).toHaveLength(5)
		expect(screen.getByText("motions · 3")).toBeInTheDocument()
		expect(screen.getByText("playback")).toBeInTheDocument()
		expect(screen.getByText("expressions · 2")).toBeInTheDocument()
		expect(screen.getByText("hit · 2")).toBeInTheDocument()
		expect(screen.getAllByTestId("separator")).toHaveLength(3)
	})

	test("places the playback section above the motions section", () => {
		renderTab()
		const playback = screen.getByText("playback")
		const motions = screen.getByText("motions · 3")
		expect(
			playback.compareDocumentPosition(motions) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
	})

	test("renders a chip per motion group and marks the selected one active", () => {
		const base = renderTab()
		expect(screen.getByTestId("live2d-motion-group-Idle")).toHaveAttribute(
			"data-active",
			"true",
		)
		expect(screen.getByTestId("live2d-motion-group-Walk")).toHaveAttribute(
			"data-active",
			"false",
		)
		fireEvent.click(screen.getByTestId("live2d-motion-group-Walk"))
		expect(base.onGroupChange).toHaveBeenCalledWith("Walk")
	})

	test("plays the selected motion entry by its original index", () => {
		const base = renderTab()
		fireEvent.click(screen.getByTestId("live2d-motion-entry-1"))
		expect(base.onPlayEntry).toHaveBeenCalledWith("Idle", 1)
	})

	test("adds a suffix only when the entry carries metadata", () => {
		renderTab()
		expect(screen.getByTestId("live2d-motion-entry-0")).toHaveAttribute(
			"data-has-suffix",
			"false",
		)
		expect(screen.getByTestId("live2d-motion-entry-1")).toHaveAttribute(
			"data-has-suffix",
			"true",
		)
	})

	test("heads the motion list with the selected group's name", () => {
		renderTab()
		const labels = screen
			.getAllByTestId("section-label")
			.map((el) => el.textContent)
		expect(labels).toContain("Idle")
		expect(labels).not.toContain("motionGroups")
	})

	test("selects and clears expressions, marking the chosen one active", () => {
		const base = renderTab()
		expect(screen.getByTestId("live2d-expression-happy")).toHaveAttribute(
			"data-active",
			"true",
		)
		fireEvent.click(screen.getByTestId("live2d-expression-sad"))
		expect(base.onSelectExpression).toHaveBeenCalledWith("sad")
		fireEvent.click(screen.getByTestId("live2d-expression-clear"))
		expect(base.onClearExpression).toHaveBeenCalledTimes(1)
	})

	test("triggers a hit area", () => {
		const base = renderTab()
		fireEvent.click(screen.getByTestId("engine-panel-hitarea-body"))
		expect(base.onHit).toHaveBeenCalledWith("body")
	})

	test("hides a section entirely when it has zero items", () => {
		renderTab({ expressions: [], hitAreas: [] })
		expect(screen.getAllByTestId("section-label")).toHaveLength(3)
		expect(screen.queryAllByTestId("separator")).toHaveLength(1)
		expect(screen.queryByText("noExpressions")).not.toBeInTheDocument()
		expect(screen.queryByText("noHitAreas")).not.toBeInTheDocument()
	})

	test("renders the playback section, gating mode/interval behind auto-play", () => {
		const base = renderTab()
		expect(screen.getByTestId("live2d-autoplay-toggle")).toBeInTheDocument()
		expect(screen.getByTestId("live2d-random")).toBeInTheDocument()
		expect(screen.queryByTestId("live2d-autoplay-mode")).not.toBeInTheDocument()
		expect(screen.queryByTestId("live2d-autoplay-interval")).not.toBeInTheDocument()
		fireEvent.click(screen.getByTestId("live2d-autoplay-toggle"))
		expect(base.onSettingsChange).toHaveBeenCalledWith({ autoPlay: true })
	})

	test("renders nothing when every section is empty", () => {
		renderTab({ graph: {}, expressions: [], hitAreas: [] })
		expect(screen.queryAllByTestId("section-label")).toHaveLength(0)
		expect(screen.queryAllByTestId("separator")).toHaveLength(0)
	})
})
