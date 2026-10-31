import { XIcon } from "lucide-react";

import { InputGroupButton } from "@/components/ui/input-group";

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
 * message is what clears it.
 */
export function AttachmentStrip({
	attachments,
	onRemove,
}: {
	attachments: Attachment[];
	onRemove: (index: number) => void;
}) {
	return (
		<ul aria-label="Attached images" className="flex flex-wrap gap-1">
			{attachments.map((attachment, index) => (
				<li
					key={`${attachment.name}-${index}`}
					className="flex items-center gap-1 rounded-md border p-1"
				>
					<img
						src={`data:${attachment.mimeType};base64,${attachment.data}`}
						alt=""
						className="size-10 rounded-md object-cover"
					/>
					<span className="max-w-40 truncate text-meta">{attachment.name}</span>
					<InputGroupButton
						size="icon-xs"
						aria-label={`Remove ${attachment.name}`}
						onClick={() => onRemove(index)}
					>
						<XIcon />
					</InputGroupButton>
				</li>
			))}
		</ul>
	);
}
