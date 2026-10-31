import { Fragment, memo } from "react";
import type { TranscriptRow } from "shared";
import { CatchBoundary } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { Notice } from "@/components/patterns/status/notice";
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
import { Markdown } from "@/components/editor/markdown";
import { ToolTrace } from "./tool-trace";

/**
 * The transcript: one column, phone-first, no horizontal scrolling. Rows come
 * from `shared/conversation/selectors`, so this file only maps a row kind to a
 * component (docs/ARCHITECTURE.md, UI rules: semantic components, not decorated divs).
 */

export function Transcript({ rows }: { rows: TranscriptRow[] }) {
	return (
		<MessageScrollerProvider autoScroll>
			<MessageScroller className="conversation-enter">
				<MessageScrollerViewport>
					<MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6 px-3 py-8 sm:px-6">
						{rows.map((row) => (
							<RowItem key={row.key} row={row} />
						))}
					</MessageScrollerContent>
				</MessageScrollerViewport>
				<MessageScrollerButton />
			</MessageScroller>
		</MessageScrollerProvider>
	);
}

/**
 * A row that did not change keeps its element: the selectors return the same row
 * object for an unchanged message, so a streaming reply re-renders only itself.
 * One unrenderable message stays one notice instead of taking the page down.
 */
const RowItem = memo(function RowItem({ row }: { row: TranscriptRow }) {
	return (
		<MessageScrollerItem scrollAnchor={row.kind === "user"} className="animate-enter-rise">
			<CatchBoundary getResetKey={() => row.key} errorComponent={RowError}>
				<Row row={row} />
			</CatchBoundary>
		</MessageScrollerItem>
	);
});

function RowError({ error }: ErrorComponentProps) {
	return (
		<Notice tone="error">
			This message could not be shown. {error instanceof Error ? error.message : String(error)}
		</Notice>
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
							<p className="mb-2 text-meta whitespace-pre-wrap text-muted-foreground">
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
					<p className="max-h-64 overflow-auto px-1 text-meta whitespace-pre-wrap text-muted-foreground">
						{row.text}
					</p>
				</Fragment>
			);
		case "notice":
			if (row.notice.kind === "error") {
				return (
					<Notice tone="error">
						<span className="block max-h-48 overflow-auto whitespace-pre-wrap">
							{row.notice.text}
						</span>
					</Notice>
				);
			}
			return (
				<Marker variant="separator" data-kind={row.notice.kind}>
					{row.notice.text}
				</Marker>
			);
	}
}
