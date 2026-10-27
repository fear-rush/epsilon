/**
 * The transcript: one column, phone-first, no horizontal scrolling. Rows come
 * from `shared/conversation/selectors`, so this file only maps a row kind to a
 * component (docs/ui.md, Principle 1: semantic components, not decorated divs).
 */
import { Fragment } from "react";
import { Message, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { TranscriptRow } from "shared";

import { Markdown } from "./markdown";
import { ToolTrace } from "./tool-trace";

export function Transcript({ rows }: { rows: TranscriptRow[] }) {
	return (
		<MessageScrollerProvider autoScroll>
			<MessageScroller>
				<MessageScrollerViewport>
					<MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6 px-3 py-8 sm:px-6">
						{rows.map((row) => (
							<MessageScrollerItem key={row.key} scrollAnchor={row.kind === "user"}>
								<Row row={row} />
							</MessageScrollerItem>
						))}
					</MessageScrollerContent>
				</MessageScrollerViewport>
				<MessageScrollerButton />
			</MessageScroller>
		</MessageScrollerProvider>
	);
}

function Row({ row }: { row: TranscriptRow }) {
	switch (row.kind) {
		case "user":
			return (
				<Message align="end">
					<MessageContent>
						<Bubble variant="muted" align="end">
							<BubbleContent>
								<Fragment>
									{row.images.map((image, index) => (
										<img
											key={index}
											alt="attached"
											className="mb-2 max-h-48 rounded-lg"
											src={`data:${image.mimeType};base64,${image.data}`}
										/>
									))}
									<span className="whitespace-pre-wrap">{row.text}</span>
								</Fragment>
							</BubbleContent>
						</Bubble>
					</MessageContent>
				</Message>
			);
		case "assistant":
			return (
				<Message align="start">
					<MessageContent>
						{row.thinking !== "" && (
							<p className="mb-2 text-xs whitespace-pre-wrap text-muted-foreground">
								{row.thinking}
							</p>
						)}
						{row.text !== "" && <Markdown>{row.text}</Markdown>}
						{row.streaming && <span className="text-muted-foreground">▍</span>}
					</MessageContent>
				</Message>
			);
		case "tool":
			return <ToolTrace run={row.run} />;
		case "summary":
			return (
				<div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
					<div className="mb-1 font-medium">{row.label}</div>
					<p className="max-h-64 overflow-auto whitespace-pre-wrap">{row.text}</p>
				</div>
			);
		case "notice":
			return (
				<p className="text-center text-xs text-muted-foreground" data-kind={row.notice.kind}>
					{row.notice.text}
				</p>
			);
	}
}
