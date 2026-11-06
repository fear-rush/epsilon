import { XIcon } from "lucide-react";

import {
	Attachment as AttachmentCard,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentMedia,
	AttachmentTitle,
} from "@/components/ui/attachment";
import { occurrenceKeys } from "@/lib/occurrence-keys";

/** One image the composer holds, byte for byte as the browser read it. */
export type Attachment = {
	name: string;
	mimeType: string;
	/** Base64 without the `data:` prefix, which is what a prompt frame carries. */
	data: string;
};

/**
 * The images the next prompt carries: a thumbnail, the file's name and its remove
 * action, in a row above the box. The composer keeps the list, because sending the
 * message is what clears it. Each entry is the Attachment element, so a file looks the
 * same here as it will in the turn it becomes.
 */
export function AttachmentStrip({
	attachments,
	onRemove,
}: {
	attachments: Attachment[];
	onRemove: (index: number) => void;
}) {
	const keys = occurrenceKeys(attachments.map((attachment) => attachment.name));
	return (
		<ul aria-label="Attached images" className="flex flex-wrap gap-1">
			{attachments.map((attachment, index) => (
				<li key={keys[index]} className="max-w-full">
					<AttachmentCard size="sm" className="rounded-control">
						<AttachmentMedia variant="image">
							<img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="" />
						</AttachmentMedia>
						<AttachmentContent>
							<AttachmentTitle>{attachment.name}</AttachmentTitle>
						</AttachmentContent>
						<AttachmentActions>
							<AttachmentAction
								aria-label={`Remove ${attachment.name}`}
								onClick={() => onRemove(index)}
							>
								<XIcon />
							</AttachmentAction>
						</AttachmentActions>
					</AttachmentCard>
				</li>
			))}
		</ul>
	);
}
