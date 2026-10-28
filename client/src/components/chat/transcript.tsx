/**
 * The transcript: one column, phone-first, no horizontal scrolling. Rows come
 * from `shared/conversation/selectors`, so this file only maps a row kind to a
 * component (docs/ui.md, Principle 1: semantic components, not decorated divs).
 */
import { Fragment } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker } from "@/components/ui/marker";
import { Message, MessageContent } from "@/components/ui/message";
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
						{row.streaming && (
							<span className="animate-pulse text-muted-foreground motion-reduce:animate-none">
								▍
							</span>
						)}
					</MessageContent>
				</Message>
			);
		case "tool":
			return <ToolTrace run={row.run} />;
		case "summary":
			return (
				<Fragment>
					<Marker variant="separator">{row.label}</Marker>
					<p className="max-h-64 overflow-auto px-1 text-xs whitespace-pre-wrap text-muted-foreground">
						{row.text}
					</p>
				</Fragment>
			);
		case "notice":
			if (row.notice.kind === "error") {
				return (
					<Alert variant="destructive">
						<AlertDescription>{row.notice.text}</AlertDescription>
					</Alert>
				);
			}
			return (
				<Marker variant="separator" data-kind={row.notice.kind}>
					{row.notice.text}
				</Marker>
			);
	}
}
