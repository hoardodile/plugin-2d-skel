import { Button } from "@hoardodile/ui/components/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@hoardodile/ui/components/tooltip"
import type { ReactNode } from "react"

/**
 * The one icon button used on the viewer chrome (toolbar transport and the
 * per-engine step controls). It is a ghost icon button at the `icon-sm`
 * (32px) tier with a soft `secondary-foreground` ink that deepens on hover,
 * and it grows to 36px under the mobile breakpoint. The Tooltip rides
 * alongside the `aria-label`, so the Hosts' step controls and the shared
 * toolbar transport share the same anatomy.
 *
 * The Button already supplies the ghost hover fill, the icon-sm geometry
 * and the `active` latching fill — this wrapper only adds the ink tone and
 * the mobile sizing, so a call site never repeats them.
 */
export function EngineIconButton(props: {
	readonly label: string
	readonly onClick: () => void
	readonly children: ReactNode
	readonly disabled?: boolean
	readonly active?: boolean
	readonly testId: string
}) {
	const { label, onClick, children, disabled, active, testId } = props
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={disabled}
						active={active}
						onClick={onClick}
						className="text-secondary-foreground max-[767px]:size-9"
						aria-label={label}
						data-testid={testId}
					>
						{children}
					</Button>
				}
			/>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	)
}
