/**
 * Installs skills from a picked folder, an archive, or a pasted `skills add`
 * command: stage, review the strict validation report, then copy or install as a
 * package. Closing at any point after staging discards the stage on the server.
 * One frame serves every step, so the dialog never changes size; each step
 * portals its buttons into the frame's footer.
 */
import { useState } from "react";
import { createPortal } from "react-dom";

import { DialogFrame } from "@/components/patterns/dialog-frame";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { useSettingsProject } from "@/features/settings/queries";
import { useDialogMotion } from "@/hooks/use-dialog-motion";

import { ReviewStep } from "./review-step.tsx";
import { SourceStep } from "./source-step.tsx";
import { useSkillImport } from "./use-skill-import.ts";

export function ImportSkillsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	// Mounted only while open, so every opening starts from the source step.
	return open ? <ImportSession onClose={() => onOpenChange(false)} /> : null;
}

function ImportSession({ onClose }: { onClose: () => void }) {
	const project = useSettingsProject();
	const dialog = useDialogMotion();
	const flow = useSkillImport(project);
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	const close = () =>
		dialog.close(() => {
			flow.leave();
			onClose();
		});

	return (
		<DialogFrame
			open={dialog.open}
			onOpenChange={(next) => {
				if (next) return;
				close();
			}}
			size="lg"
			title="Import skills"
			footer={<div ref={setSlot} className="contents" />}
		>
			{flow.staged === undefined ? (
				flow.stage.isPending ? (
					<>
						<div className="flex h-full items-center justify-center">
							<LoadingState label="Fetching and checking the skills…" />
						</div>
						{slot !== null &&
							createPortal(
								<Button type="button" variant="outline" onClick={flow.cancel}>
									Cancel
								</Button>,
								slot,
							)}
					</>
				) : (
					<div className="flex h-full min-h-0 flex-col gap-field">
						<SourceStep
							onStage={flow.stage.mutate}
							onCancel={close}
							disabled={false}
							footer={slot}
						/>
						{flow.stage.error === null ? null : <Notice error={flow.stage.error} />}
					</div>
				)
			) : (
				<ReviewStep
					staged={flow.staged}
					project={project}
					installing={flow.commit.isPending}
					error={flow.commit.error ?? undefined}
					expired={flow.expired}
					footer={slot}
					onBack={flow.startOver}
					onInstall={(commit) => flow.commit.mutate(commit, { onSuccess: close })}
				/>
			)}
		</DialogFrame>
	);
}
