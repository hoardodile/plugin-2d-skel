import { Button } from "@hoardodile/ui/components/button"
import { ListEmptyRow } from "@hoardodile/ui/components/list-empty-row"
import { useTranslation } from "../i18n"

export type EngineHitAreaItem = {
	readonly name: string
	readonly detail?: string
}

export type EngineHitAreasTabProps = {
	readonly items: readonly EngineHitAreaItem[]
	readonly onTrigger: (name: string) => void
}

/** Shared hit-area list: name rows that trigger a hit on click. */
export function EngineHitAreasTab(props: EngineHitAreasTabProps) {
	const { items, onTrigger } = props
	const { t } = useTranslation()

	return (
		<div className="flex flex-col gap-1">
			{items.length === 0 ? (
				<ListEmptyRow className="text-xs">{t("noHitAreas")}</ListEmptyRow>
			) : (
				items.map((area) => (
					<Button
						key={area.name}
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => onTrigger(area.name)}
						className="h-9 shrink-0 justify-start gap-1 px-2 text-xs text-foreground hover:bg-muted"
						data-testid={`engine-panel-hitarea-${area.name}`}
					>
						<span className="min-w-0 truncate">{area.name}</span>
						{area.detail !== undefined ? (
							<span className="ml-auto shrink-0 text-tiny text-muted-foreground">
								{area.detail}
							</span>
						) : null}
					</Button>
				))
			)}
		</div>
	)
}
