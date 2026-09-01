import { ScrollArea, ScrollBar } from "@hoardodile/ui/components/scroll-area"
import { SectionTabs } from "@hoardodile/ui/components/section-tabs"
import { Sheet, SheetContent } from "@hoardodile/ui/components/sheet"
import { useBelowMd } from "@hoardodile/ui/hooks/use-mobile"
import type { ReactNode } from "react"

export type EnginePanelTabDef = {
	readonly key: string
	readonly label: string
	readonly testId: string
}

/**
 * The shared drawer that both engines use for their side panel. It owns
 * the tabs/scroll chrome; the caller supplies the tab list and the active
 * tab's body. Engine-specific tabs are passed through, and the shared
 * display/info/hit bodies are rendered by the caller so both engines stay
 * consistent.
 *
 * Two surface modes:
 * - **Docked** (`docked`): a persistent right column that sits beside the
 *   stage (the canvas shrinks to make room). No backdrop, no open/close.
 * - **Drawer**: the existing Sheet that slides in from the right/bottom.
 */
export function EnginePanel(props: {
	readonly open: boolean
	readonly onClose: () => void
	readonly tabs: readonly EnginePanelTabDef[]
	readonly tab: string
	readonly onTabChange: (tab: string) => void
	readonly children: ReactNode
	readonly testId?: string
	/** Optional header rendered above the tab bar (e.g. the view-mode control). */
	readonly header?: ReactNode
	/** Render as a fixed right column (persistent) instead of a Sheet drawer. */
	readonly docked?: boolean
}) {
	const {
		open,
		onClose,
		tabs,
		tab,
		onTabChange,
		children,
		testId = "engine-panel",
		header,
		docked = false,
	} = props
	const below = useBelowMd()

	const body = (
		<>
			{header !== undefined ? (
				<div className="shrink-0 px-4 pt-3">{header}</div>
			) : null}
			<SectionTabs
				value={tab}
				onChange={onTabChange}
				className="shrink-0 border-b border-border px-2 pt-2"
				items={tabs.map((entry) => ({
					value: entry.key,
					label: entry.label,
					testId: entry.testId,
				}))}
			/>
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex min-h-full flex-col px-4 pb-3">{children}</div>
				<ScrollBar orientation="vertical" />
			</ScrollArea>
		</>
	)

	if (docked) {
		return (
			<aside
				className="relative flex h-full w-[19rem] shrink-0 flex-col border-l border-border bg-background text-foreground gap-4"
				data-testid={testId}
			>
				{body}
			</aside>
		)
	}

	return (
		<Sheet
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onClose()
			}}
		>
			<SheetContent
				side={below ? "bottom" : "right"}
				showCloseButton={false}
				className="flex max-[767px]:h-[65vh] flex-col border-border bg-background p-0 max-[767px]:w-full max-[767px]:max-w-none max-[767px]:border-t max-[767px]:border-l-0"
				data-testid={testId}
			>
				{body}
			</SheetContent>
		</Sheet>
	)
}
