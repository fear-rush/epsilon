import { useEffect, useState } from "react";

import type { ProviderLoginSnapshot } from "#protocol/settings/providers";
import { DialogFrame } from "@/components/patterns/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { keepSubscribed, runStream } from "@/core/runtime";

import { useSettingsRefresh } from "../queries.ts";
import { answerProviderLogin, cancelProviderLogin } from "./api.ts";

/**
 * pi's sign-in for one provider, followed live. pi asks and reports out of band, so the
 * dialog shows what it last said and answers the one question it waits on.
 */
export function ProviderSignIn({
	onClose,
	providerId,
}: {
	onClose: () => void;
	providerId: string;
}) {
	const refresh = useSettingsRefresh();
	const [snapshot, setSnapshot] = useState<ProviderLoginSnapshot | undefined>(undefined);
	const [answer, setAnswer] = useState("");
	const [failure, setFailure] = useState<string | undefined>(undefined);

	useEffect(
		() =>
			keepSubscribed(
				() =>
					runStream(
						(client) => client["settings.providers.login"]({ providerId, type: "oauth" }),
						(next) => {
							setSnapshot(next);
							if (next.status === "succeeded") refresh();
						},
					),
				(error) => {
					if (error !== undefined) setFailure(error.message);
				},
			),
		[providerId, refresh],
	);

	const question = snapshot?.question;
	const done =
		snapshot?.status === "succeeded" ||
		snapshot?.status === "failed" ||
		snapshot?.status === "cancelled";

	const close = (): void => {
		void cancelProviderLogin(providerId).catch(() => undefined);
		onClose();
	};

	return (
		<DialogFrame
			open
			onOpenChange={(next) => (next ? undefined : close())}
			title="Sign in"
			description="pi runs the account sign-in; the credential it gets is stored in pi's own file."
			size="md"
			footer={
				<Button variant="destructive" onClick={close}>
					{done ? "Close" : "Cancel"}
				</Button>
			}
		>
			<div className="grid gap-field">
				{snapshot === undefined ? (
					<p className="text-meta text-muted-foreground">Starting the sign-in…</p>
				) : (
					<>
						<p className="text-body">
							{snapshot.status === "running" ? "Waiting for the browser…" : snapshot.status}
						</p>
						{snapshot.authUrl !== undefined && (
							<p className="text-body">
								<a
									href={snapshot.authUrl.url}
									target="_blank"
									rel="noreferrer"
									className="text-primary underline"
								>
									{snapshot.authUrl.url}
								</a>
								{snapshot.authUrl.instructions !== undefined && (
									<span className="block text-meta text-muted-foreground">
										{snapshot.authUrl.instructions}
									</span>
								)}
							</p>
						)}
						{snapshot.deviceCode !== undefined && (
							<Notice tone="info" title={`Code ${snapshot.deviceCode.userCode}`}>
								{snapshot.deviceCode.verificationUri}
							</Notice>
						)}
						{snapshot.notices.map((notice) => (
							<Notice key={notice.message} tone="info">
								{notice.message}
							</Notice>
						))}
						{snapshot.error !== undefined && (
							<Notice tone="error" title="The sign-in failed">
								{snapshot.error}
							</Notice>
						)}
						{question !== undefined && (
							<div className="grid gap-2">
								<p className="text-body">{question.message}</p>
								{question.kind === "select" ? (
									<div className="flex flex-wrap gap-2">
										{(question.options ?? []).map((option) => (
											<Button
												key={option.id}
												variant="outline"
												onClick={() => void answerProviderLogin(providerId, question.id, option.id)}
											>
												{option.label}
											</Button>
										))}
									</div>
								) : (
									<form
										className="flex gap-2"
										onSubmit={(event) => {
											event.preventDefault();
											if (answer.trim() === "") return;
											void answerProviderLogin(providerId, question.id, answer.trim());
											setAnswer("");
										}}
									>
										<Input
											aria-label={question.message}
											placeholder={question.placeholder ?? ""}
											type={question.kind === "secret" ? "password" : "text"}
											value={answer}
											onChange={(event) => setAnswer(event.target.value)}
										/>
										<Button type="submit" disabled={answer.trim() === ""}>
											Send
										</Button>
									</form>
								)}
							</div>
						)}
					</>
				)}
				{failure !== undefined && (
					<Notice tone="error" title="The sign-in stopped">
						{failure}
					</Notice>
				)}
			</div>
		</DialogFrame>
	);
}
