import { ShieldQuestionIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";

/**
 * A prompt to approve or deny a step before it runs. The decision is a pair of buttons
 * beside the question, so the reader does not have to look away from it to answer.
 */
export function Confirmation({
	title,
	description,
	approveLabel = "Approve",
	denyLabel = "Deny",
	onApprove,
	onDeny,
}: {
	title?: string | undefined;
	description: string | undefined;
	approveLabel?: string;
	denyLabel?: string;
	onApprove: () => void;
	onDeny: () => void;
}) {
	return (
		<Item variant="outline" size="sm" className="rounded-card">
			<ItemMedia variant="icon">
				<ShieldQuestionIcon />
			</ItemMedia>
			<ItemContent>
				{title === undefined ? undefined : <ItemTitle>{title}</ItemTitle>}
				{description === undefined ? undefined : (
					<ItemDescription className="line-clamp-none whitespace-pre-wrap">
						{description}
					</ItemDescription>
				)}
			</ItemContent>
			<ItemActions>
				<Button size="sm" variant="outline" onClick={onDeny}>
					{denyLabel}
				</Button>
				<Button size="sm" onClick={onApprove}>
					{approveLabel}
				</Button>
			</ItemActions>
		</Item>
	);
}
