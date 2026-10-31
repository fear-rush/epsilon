import { Trash2Icon } from "lucide-react";

import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import { formatSize, type BundleEntry } from "./skill-file-tree";

/** The folder's files, one row each like the provider's models: open on click, trash to delete. */
export function SkillFilesList({
	files,
	onOpen,
	onDelete,
}: {
	files: readonly BundleEntry[];
	onOpen: (path: string) => void;
	onDelete: (file: BundleEntry) => void;
}) {
	return (
		<div className="max-h-dialog-body-md divide-y overflow-y-auto rounded-xl border">
			{files.map((file) => (
				<div key={file.path} className="flex items-center gap-2 px-3 py-2">
					<button
						type="button"
						disabled={!file.text}
						className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-left disabled:cursor-default disabled:text-muted-foreground"
						onClick={() => onOpen(file.path)}
					>
						<span className="truncate text-body font-medium">{file.path}</span>
						<span className="shrink-0 text-meta text-muted-foreground">
							{formatSize(file.size)}
						</span>
					</button>
					<Tip label="Delete">
						<Button
							type="button"
							variant="destructive"
							size="icon-sm"
							aria-label={`Delete ${file.path}`}
							onClick={() => onDelete(file)}
						>
							<Trash2Icon />
						</Button>
					</Tip>
				</div>
			))}
		</div>
	);
}
