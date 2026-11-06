import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";

export type ContextRow = {
	readonly label: string;
	readonly value: string;
};

/**
 * How much of the model's context window the conversation has used. The trigger is the
 * one reading the composer has room for; the card carries the split and the session's
 * cost, because those are what a reader checks when the number looks high.
 */
export function Context({
	label,
	ariaLabel,
	used,
	limit,
	percent,
	rows,
	footer,
}: {
	label: string;
	ariaLabel: string;
	used: string;
	limit: string;
	percent: number;
	rows: ReadonlyArray<ContextRow>;
	footer?: string | undefined;
}) {
	return (
		<HoverCard>
			<HoverCardTrigger
				delay={10}
				closeDelay={100}
				render={
					<Button
						variant="ghost"
						size="xs"
						aria-label={ariaLabel}
						className="gap-1 rounded-md text-meta text-muted-foreground tabular-nums"
					/>
				}
			>
				{label}
			</HoverCardTrigger>
			<HoverCardContent side="top" align="end" className="flex w-64 flex-col gap-3 rounded-xl">
				<div className="flex items-center justify-between gap-3 text-meta">
					<span className="font-medium">Context</span>
					<span className="text-muted-foreground">
						{used} / {limit}
					</span>
				</div>
				<Progress value={percent} aria-label="Context used" />
				<div className="flex flex-col gap-1 text-meta">
					{rows.map((row) => (
						<div key={row.label} className="flex justify-between gap-3">
							<span className="text-muted-foreground">{row.label}</span>
							<span className="tabular-nums">{row.value}</span>
						</div>
					))}
				</div>
				{footer === undefined ? undefined : (
					<p className="border-t pt-2 text-meta text-muted-foreground">{footer}</p>
				)}
			</HoverCardContent>
		</HoverCard>
	);
}
