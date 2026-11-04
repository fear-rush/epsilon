import { WrenchIcon } from "lucide-react";

import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { StatusView } from "@/components/patterns/status/status-view";

/**
 * A settings section whose page is not written yet.
 *
 * The socket, the services and the protocol for the section are in place; what is missing
 * is the page that edits them. Saying so is better than an empty pane or a dead link.
 */
export function SectionPending({ title }: { title: string }) {
	return (
		<Pane className="flex-1">
			<PaneBar title={title} />
			<StatusView
				icon={WrenchIcon}
				title={`${title} is not in this build yet`}
				line="The server side of this section is in place. The page that edits it is the next step of the rebuild."
			/>
		</Pane>
	);
}
