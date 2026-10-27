/**
 * S1: the raw page. A prompt box, a running/needs-input line, the extension
 * questions that block the agent, and every frame as JSON. Deliberately ugly:
 * the transcript renders in S2, from the reducer.
 */
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ServerFrame } from "shared";

import { QuestionRow } from "@/components/raw/question-row";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { lastMeta, openQuestions } from "@/conversation/frames";
import { Link } from "@/link";
import type { LinkStatus } from "@/link";

const MAX_FRAMES = 300;

export const Route = createFileRoute("/")({
	component: function RawSession() {
		const [sessionId] = useState(() => crypto.randomUUID());
		const [status, setStatus] = useState<LinkStatus>("connecting");
		const [frames, setFrames] = useState<ServerFrame[]>([]);
		const [answered, setAnswered] = useState<string[]>([]);
		const [prompt, setPrompt] = useState("");
		const link = useRef<Link | null>(null);

		useEffect(() => {
			const connection = new Link({
				onStatus: setStatus,
				onFrame: (frame) => setFrames((current) => [...current, frame].slice(-MAX_FRAMES)),
			});
			link.current = connection;
			connection.attach(sessionId);
			return () => connection.close();
		}, [sessionId]);

		const meta = lastMeta(frames);
		const questions = openQuestions(frames, answered);

		const submitPrompt = () => {
			const message = prompt.trim();
			if (message === "") return;
			link.current?.send({
				t: "rpc",
				sessionId,
				command: { type: "prompt", message },
			});
			setPrompt("");
		};

		return (
			<div className="flex flex-1 flex-col gap-3 overflow-hidden p-4 font-mono text-xs">
				<div className="flex flex-wrap items-center gap-3 text-muted-foreground">
					<span>socket: {status}</span>
					<span>session: {sessionId.slice(0, 8)}</span>
					<span>{meta?.running === true ? "running" : "idle"}</span>
					{questions.length > 0 && <span className="text-amber-600">needs input</span>}
					<Button size="sm" variant="outline" onClick={() => setFrames([])}>
						clear
					</Button>
				</div>

				{questions.map((question) => (
					<QuestionRow
						key={question.id}
						question={question}
						onAnswer={(answer) => {
							setAnswered((current) => [...current, question.id]);
							link.current?.send({ t: "dialog", sessionId, answer });
						}}
					/>
				))}

				<div className="flex items-start gap-2">
					<Textarea
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						placeholder="prompt (Enter sends, Shift+Enter is a newline)"
						className="min-h-16"
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								submitPrompt();
							}
						}}
					/>
					<Button onClick={submitPrompt}>send</Button>
				</div>

				<ol className="flex-1 overflow-auto rounded border bg-muted/30 p-2">
					{frames.map((frame, index) => (
						<li key={index} className={frame.t === "error" ? "text-red-600" : undefined}>
							{JSON.stringify(frame)}
						</li>
					))}
				</ol>
			</div>
		);
	},
});
