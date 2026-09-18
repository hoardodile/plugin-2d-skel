import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { SpineScene } from "../shared"
import { SpineHost } from "./SpineHost"

/** The player stub the host reads; tests override per case. */
const playerStub = vi.hoisted(() => ({
	toggleSkin: vi.fn(),
	value: {} as Record<string, unknown>,
}))

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, language: "en" }),
}))

vi.mock("./hooks", () => {
	const { useState } = require("react")
	return {
		usePluginAPI: () => ({
			usePref: (_key: string, def: unknown) => {
				const [value, setValue] = useState(def)
				return [value, setValue]
			},
			getCache: () => undefined,
			setCache: () => {},
			logInfo: () => {},
			useFileList: () => ({
				data: undefined,
				isLoading: false,
				isError: false,
				error: null,
			}),
			resource: { sourceMeta: undefined },
		}),
	}
})

vi.mock("./useSpinePlayer", () => ({
	useSpinePlayer: () => playerStub.value,
}))

/** A ready single-skin player; a layered case overrides `skinStack`. */
function player(overrides: Record<string, unknown> = {}) {
	return {
		engine: "spine",
		status: "ready",
		names: {
			animations: ["idle", "run"],
			overlays: [],
			skins: ["default", "alt"],
		},
		paused: false,
		dialogue: { text: undefined, choices: [] },
		exHit: undefined,
		togglePause: () => {},
		restart: () => {},
		choose: () => {},
		playMotionRef: () => {},
		hit: () => {},
		tapAt: () => {},
		capture: () => "data:image/png;base64,x",
		applyViewport: () => {},
		getAppliedViewport: () => ({ x: 0, y: 0, scale: 1 }),
		skinStack: [],
		toggleSkin: playerStub.toggleSkin,
		...overrides,
	}
}

beforeEach(() => {
	playerStub.toggleSkin.mockClear()
	playerStub.value = player()
})

vi.mock("./EngineToolbar", () => ({
	EngineToolbar: ({ children }: { readonly children?: ReactNode }) => (
		<div data-testid="engine-toolbar">{children}</div>
	),
}))

vi.mock("@hoardodile/ui/components/button", () => ({
	Button: function Button(props: Record<string, unknown>) {
		const { children, type, ...rest } = props
		return (
			<button type={type as "button" | undefined} {...rest}>
				{children as ReactNode}
			</button>
		)
	},
}))

vi.mock("@hoardodile/ui/components/icon", () => ({
	Icon: function Icon() {
		return <span aria-hidden="true" />
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

vi.mock("@hoardodile/ui/components/list-empty-row", () => ({
	ListEmptyRow: function ListEmptyRow(
		props: { readonly children?: ReactNode } & Record<string, unknown>,
	) {
		return <div data-testid="list-empty-row">{props.children}</div>
	},
}))

const SCENE: SpineScene & { readonly index: number } = {
	index: 0,
	engine: "spine",
	kind: "ex",
	skeleton: "skeleton_0",
	atlas: "atlases_0_atlas_0",
	textures: ["atlases_0_textures_0_0.png"],
	format: "skel",
	version: "4.1.11",
	animations: ["idle"],
	skins: ["default"],
	modelJson: "model0.json",
	label: "Kalien",
}

function renderHost() {
	return render(
		<SpineHost
			scene={SCENE}
			scenes={[{ ...SCENE, index: 0 }]}
			sceneIndex={0}
			selectScene={() => {}}
		/>,
	)
}

describe("SpineHost", () => {
	test("shows the merged spine tabs in the docked panel", () => {
		renderHost()
		expect(screen.getByTestId("engine-toolbar")).toBeInTheDocument()
		expect(screen.getByTestId("spine-tab-controls")).toBeInTheDocument()
		expect(screen.getByTestId("spine-tab-display")).toBeInTheDocument()
		expect(screen.getByTestId("spine-tab-info")).toBeInTheDocument()
		expect(screen.queryByTestId("spine-tab-animations")).not.toBeInTheDocument()
		expect(screen.queryByTestId("spine-tab-skins")).not.toBeInTheDocument()
		expect(screen.queryByTestId("spine-tab-overlays")).not.toBeInTheDocument()
		expect(screen.queryByTestId("spine-tab-hit")).not.toBeInTheDocument()
		// A single-scene resource has no in-panel model chips.
		expect(screen.queryByTestId("engine-model-0")).not.toBeInTheDocument()
	})

	test("renders the animation and skin tag chips inside the merged controls tab", () => {
		renderHost()
		expect(screen.getByTestId("spine-animation-idle")).toBeInTheDocument()
		expect(screen.getByTestId("spine-animation-run")).toBeInTheDocument()
		expect(screen.getByTestId("spine-skin-default")).toBeInTheDocument()
		expect(screen.getByTestId("spine-skin-alt")).toBeInTheDocument()
		// The OLD dropdown surface must be gone.
		expect(
			screen.queryByTestId("spine-animation-select"),
		).not.toBeInTheDocument()
	})

	test("transparent background does not paint an opaque stage", () => {
		renderHost()
		// The default background is "transparent", so the shared stage root must
		// be transparent (no `bg-black`) behind the canvas host.
		const canvasHost = screen.getByTestId("spine-canvas-host")
		expect(canvasHost.closest(".bg-transparent")).not.toBeNull()
		expect(canvasHost.closest(".bg-black")).toBeNull()
	})

	test("shows the model chips below the interaction mode when several scenes exist", () => {
		render(
			<SpineHost
				scene={SCENE}
				scenes={[
					{ ...SCENE, index: 0 },
					{ ...SCENE, index: 1, skeleton: "skeleton_1", label: "Second" },
				]}
				sceneIndex={0}
				selectScene={() => {}}
			/>,
		)
		expect(screen.getByTestId("engine-model-0")).toBeInTheDocument()
		expect(screen.getByTestId("engine-model-1")).toBeInTheDocument()
		// The old dropdown surface is gone.
		expect(screen.queryByTestId("engine-scene-select")).not.toBeInTheDocument()
	})

	test("composed scenes toggle layers instead of replacing the skin", () => {
		playerStub.value = player({
			names: {
				animations: ["idle"],
				overlays: [],
				skins: ["body_base", "layers/one", "face/one_Idle"],
			},
			skinStack: ["body_base", "face/one_Idle"],
		})
		renderHost()
		expect(screen.getByTestId("spine-skin-body_base")).toHaveAttribute(
			"aria-pressed",
			"true",
		)
		expect(screen.getByTestId("spine-skin-layers/one")).toHaveAttribute(
			"aria-pressed",
			"false",
		)
		screen.getByTestId("spine-skin-layers/one").click()
		expect(playerStub.toggleSkin).toHaveBeenCalledWith("layers/one")
	})

	test("offers the layering template when the scene declares none", () => {
		// A scene with no `<model>.skins.json` composes nothing: the panel says
		// so and hands the user a starter file naming this model's own skins.
		playerStub.value = player({
			names: {
				animations: ["idle"],
				overlays: [],
				skins: ["body", "cloth"],
			},
			skinStack: ["body"],
		})
		renderHost()
		expect(screen.getByTestId("spine-skin-config-hint")).toBeInTheDocument()
		const template = screen.getByTestId(
			"spine-skin-config-template",
		).textContent
		expect(template).toContain('"v": 1')
		expect(template).toContain('"body"')
		expect(template).toContain('"cloth"')
	})

	test("hides the template once the scene carries a declaration", () => {
		playerStub.value = player({
			names: {
				animations: ["idle"],
				overlays: [],
				skins: ["body", "cloth"],
			},
			skinStack: ["body"],
		})
		render(
			<SpineHost
				scene={{ ...SCENE, skinStack: "model0.skins.json" }}
				scenes={[{ ...SCENE, index: 0 }]}
				sceneIndex={0}
				selectScene={() => {}}
			/>,
		)
		expect(
			screen.queryByTestId("spine-skin-config-hint"),
		).not.toBeInTheDocument()
	})
})
