/**
 * Sign in with an account. pi runs the flow, so this block only relays it: it starts
 * `ModelRuntime.login()`, shows what pi reports, and answers what pi asks. The record on
 * the server is the truth: a running flow streams its progress, and a reloaded page reads
 * the latest snapshot and attaches to the flow instead of replacing it.
 *
 * pi uses a stored credential ahead of a key in models.json, so the idle block names the
 * one in use. Nothing here writes auth.json itself; only pi's login and logout do.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	ChevronRightIcon,
	ExternalLinkIcon,
	KeyRoundIcon,
	LogInIcon,
	LogOutIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
	ProviderDetail,
	ProviderLoginQuestion,
	ProviderLoginSnapshot,
	ProviderLoginType,
} from "#protocol/settings/providers";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { keepSubscribed, runStream } from "@/core/runtime";
import { cn } from "@/lib/cn";
import { occurrenceKeys } from "@/lib/occurrence-keys";

import { settingsKeys } from "../keys";
import { useProviderLogin, useSettingsRefresh } from "../queries";
import { answerProviderLogin, cancelProviderLogin, logoutProvider } from "./api";

/** What pi will use for this provider, in pi's own precedence order. */
const describeCredential = (detail: ProviderDetail) => {
	const { credential } = detail.auth;
	if (credential !== undefined) {
		return {
			note: detail.hasKey
				? "pi keeps it in auth.json and uses it ahead of the key in models.json."
				: "pi keeps it in auth.json on the agent host.",
			title: credential === "oauth" ? "A signed-in account is in use" : "A stored key is in use",
		};
	}
	switch (detail.source) {
		case "models_json_key":
			return {
				note: "It is this provider's only credential.",
				title: "The key in models.json is in use",
			};
		case "models_json_command":
			return {
				note: "pi runs it to get a key.",
				title: "The key command in models.json is in use",
			};
		case "environment":
			return {
				// pi's label is the variable or credentials file it read, not a secret.
				note: "pi reads it from the process the agent runs in.",
				title:
					detail.sourceLabel === undefined
						? "An environment variable is in use"
						: `${detail.sourceLabel} is in use`,
			};
		case "runtime":
			return { note: "It is saved nowhere.", title: "A key set for this run is in use" };
		default:
			return detail.configured
				? { note: "pi did not say which one.", title: "A credential is in use" }
				: { note: "Sign in, or set your own endpoint and key below.", title: "No credential yet" };
	}
};

/** One question pi waits on, as choices or as a field. Keyed by id, so it resets. */
function SignInQuestion({
	question,
	answering,
	onAnswer,
}: {
	question: ProviderLoginQuestion;
	answering: boolean;
	onAnswer: (promptId: string, value: string) => void;
}) {
	const [value, setValue] = useState("");

	if (question.kind === "select") {
		return (
			<div className="flex animate-enter-fade flex-col gap-2">
				<p className="text-body font-medium">{question.message}</p>
				<ItemGroup>
					{(question.options ?? []).map((option) => (
						<Item
							key={option.id}
							variant="outline"
							size="sm"
							className="transition-colors hover:bg-muted/60"
							render={
								<button
									type="button"
									aria-label={option.label}
									disabled={answering}
									onClick={() => onAnswer(question.id, option.id)}
								/>
							}
						>
							<ItemContent>
								<ItemTitle>{option.label}</ItemTitle>
								{option.description !== undefined && (
									<ItemDescription>{option.description}</ItemDescription>
								)}
							</ItemContent>
							<ItemActions>
								<ChevronRightIcon className="size-icon text-muted-foreground" />
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			</div>
		);
	}

	const inputId = `login-answer-${question.id}`;
	return (
		<form
			className="animate-enter-fade"
			onSubmit={(event) => {
				event.preventDefault();
				if (value !== "" && !answering) onAnswer(question.id, value);
			}}
		>
			<FieldGroup className="gap-3">
				<Field>
					<FieldLabel htmlFor={inputId}>{question.message}</FieldLabel>
					<Input
						id={inputId}
						type={question.kind === "secret" ? "password" : "text"}
						autoComplete="off"
						placeholder={question.placeholder}
						value={value}
						onChange={(event) => setValue(event.target.value)}
					/>
				</Field>
				<Button type="submit" className="w-fit" disabled={value === "" || answering}>
					{answering && <Spinner data-icon="inline-start" />}
					Continue
				</Button>
			</FieldGroup>
		</form>
	);
}

/** What pi is waiting for, in one short line, so a step never looks stuck. */
const stepLineOf = (flow: ProviderLoginSnapshot): string => {
	const waitingOnYou =
		flow.question !== undefined || flow.authUrl !== undefined || flow.deviceCode !== undefined;
	return waitingOnYou ? "Waiting for you." : "Waiting for the provider.";
};

/**
 * A running sign-in: what pi reports, then the one thing it waits on. The header names
 * the flow and owns the way out, so cancelling is never a link lost under the steps.
 */
function SignInFlow({
	title,
	flow,
	answering,
	cancelling,
	onAnswer,
	onCancel,
}: {
	title: string;
	flow: ProviderLoginSnapshot;
	answering: boolean;
	cancelling: boolean;
	onAnswer: (promptId: string, value: string) => void;
	onCancel: () => void;
}) {
	const { authUrl, deviceCode, question } = flow;
	const shownNotices = flow.notices.slice(-3);
	const noticeKeys = occurrenceKeys(shownNotices.map((notice) => notice.message));
	return (
		<>
			<div className="flex flex-col gap-4">
				<Item variant="muted" size="sm">
					<ItemMedia variant="icon">
						<Spinner />
					</ItemMedia>
					<ItemContent>
						<ItemTitle>{title}</ItemTitle>
						<ItemDescription>{stepLineOf(flow)}</ItemDescription>
					</ItemContent>
					<ItemActions>
						<Button size="sm" variant="outline" disabled={cancelling} onClick={onCancel}>
							Cancel
						</Button>
					</ItemActions>
				</Item>

				{authUrl !== undefined && (
					<div className="flex animate-enter-fade flex-col items-start gap-2">
						<Button
							size="sm"
							nativeButton={false}
							render={
								<a
									href={authUrl.url}
									target="_blank"
									rel="noreferrer"
									aria-label="Open the sign-in page"
								/>
							}
						>
							<ExternalLinkIcon data-icon="inline-start" />
							Open the sign-in page
						</Button>
						{authUrl.instructions !== undefined && (
							<p className="text-meta text-muted-foreground">{authUrl.instructions}</p>
						)}
					</div>
				)}

				{deviceCode !== undefined && (
					<div className="animate-enter-fade">
						<Item variant="outline" size="sm">
							<ItemMedia variant="icon">
								<KeyRoundIcon />
							</ItemMedia>
							<ItemContent>
								<ItemTitle className="font-mono tracking-wider">{deviceCode.userCode}</ItemTitle>
								<ItemDescription>
									Enter this code at{" "}
									<a href={deviceCode.verificationUri} target="_blank" rel="noreferrer">
										{deviceCode.verificationUri}
									</a>
								</ItemDescription>
							</ItemContent>
						</Item>
					</div>
				)}

				{question !== undefined && (
					<SignInQuestion
						key={question.id}
						question={question}
						answering={answering}
						onAnswer={onAnswer}
					/>
				)}

				{flow.notices.length > 0 && (
					<ul className="flex animate-enter-fade flex-col gap-1 text-meta text-muted-foreground">
						{shownNotices.map((notice, index) => (
							// pi may report the same sentence twice; the occurrence tells them apart.
							<li key={noticeKeys[index]}>
								{notice.message}
								{(notice.links ?? []).map((link) => (
									<a
										key={link.url}
										className="ml-1 underline underline-offset-4"
										href={link.url}
										target="_blank"
										rel="noreferrer"
									>
										{link.label ?? "More information"}
									</a>
								))}
							</li>
						))}
					</ul>
				)}
			</div>
		</>
	);
}

function SignInBlock({ detail }: { detail: ProviderDetail }) {
	const providerId = detail.id;
	const account = detail.auth.oauth;
	const apiKey = detail.auth.apiKey;
	const canUseApiKey = apiKey?.interactive === true;
	const queryClient = useQueryClient();
	const refresh = useSettingsRefresh();
	const { data: storedFlow, refetch: refetchStored } = useProviderLogin(providerId);
	const [flow, setFlow] = useState<ProviderLoginSnapshot | null>(null);
	const [error, setError] = useState<string | undefined>();
	const [answering, setAnswering] = useState(false);
	const [signingIn, setSigningIn] = useState(false);
	// The confirmation outlives the flow on purpose: it has to finish closing after the
	// flow's record does, or its exit animation would be cut by the flow unmounting.
	const [confirming, setConfirming] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [signingOut, setSigningOut] = useState(false);
	/** Stops the subscription the current flow follows. */
	const following = useRef<(() => void) | undefined>(undefined);
	/** The state a reloaded page came back to, when no flow is being followed yet. */
	const latest = flow ?? storedFlow ?? null;
	const running = latest?.status === "running";
	/** A record the page came back from, so the card it returns to is not a cold view. */
	const returned = latest !== null && latest.status !== "running";

	useEffect(
		() => () => {
			following.current?.();
			following.current = undefined;
		},
		[],
	);

	const keep = useCallback(
		(snapshot: ProviderLoginSnapshot | null) => {
			setError(undefined);
			setFlow(snapshot);
			// The record on the server is the same answer; the next mount reads it from here.
			queryClient.setQueryData(settingsKeys.providerLogin(providerId), snapshot);
		},
		[providerId, queryClient],
	);

	/** Follow one flow to its end; `type: null` attaches to the one already running. */
	const follow = useCallback(
		(type: ProviderLoginType | null) => {
			following.current?.();
			setSigningIn(true);
			setFlow(null);
			following.current = keepSubscribed(
				() =>
					runStream(
						(client) => client["settings.providers.login"]({ providerId, type }),
						(snapshot) => {
							keep(snapshot);
							// The flow finishes out of band, so the settings snapshot is re-read once
							// the stream reports it. That turns "signed in" into the credential line.
							if (snapshot.status === "succeeded") refresh();
						},
					),
				(cause) => {
					setSigningIn(false);
					following.current = undefined;
					setError(cause === undefined ? undefined : cause.message);
					// A finished or refused flow is the record now; read it fresh.
					void refetchStored();
				},
			);
		},
		[keep, providerId, refetchStored, refresh],
	);

	/** A reloaded page follows the flow the read reported, once, instead of replacing it. */
	const attached = useRef(false);
	useEffect(() => {
		if (attached.current || storedFlow?.status !== "running") return;
		attached.current = true;
		follow(null);
	}, [storedFlow, follow]);

	const answer = (promptId: string, value: string) => {
		setAnswering(true);
		setError(undefined);
		void answerProviderLogin(providerId, promptId, value)
			.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
			.finally(() => setAnswering(false));
	};

	// The footer button asks this instead of being an `AlertDialogAction`: that closes
	// the dialog on click, which would hide the cancel round trip.
	const confirmCancel = async () => {
		setCancelling(true);
		try {
			await cancelProviderLogin(providerId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setCancelling(false);
			setConfirming(false);
		}
	};

	const signOut = useMutation({
		mutationFn: () => logoutProvider(providerId),
		onSuccess: () => {
			setError(undefined);
			setFlow(null);
			// The server dropped the record with the credential, so read it fresh.
			queryClient.setQueryData(settingsKeys.providerLogin(providerId), null);
			refresh();
		},
		onError: (cause) => setError(cause.message),
	});
	const signingOutNow = signingOut || signOut.isPending;

	const inUse = describeCredential(detail);

	return (
		<>
			<Section title="Sign-in">
				<div className="pad-row">
					<div className="flex flex-col gap-3">
						{running ? (
							<SignInFlow
								title={
									latest.type === "api_key"
										? `Signing in with ${apiKey?.name ?? "an API key"}`
										: (account?.label ?? `Sign in with ${account?.name ?? "the account"}`)
								}
								flow={latest}
								answering={answering}
								cancelling={cancelling}
								onAnswer={answer}
								onCancel={() => setConfirming(true)}
							/>
						) : (
							// Arriving back after a flow: the card fades in instead of popping. A
							// first view of the page is not animated, so it matches its neighbours.
							<div className={cn("flex flex-col gap-3", returned && "animate-enter-fade")}>
								<div className="flex flex-col gap-1">
									<p className="text-body font-medium">{inUse.title}</p>
									<p className="text-meta text-muted-foreground">{inUse.note}</p>
								</div>

								{latest?.status === "failed" && (
									<Notice tone="danger">{latest.error ?? "The sign-in failed."}</Notice>
								)}
								{latest?.status === "cancelled" && (
									<p className="text-meta text-muted-foreground">{latest.error}</p>
								)}

								<div className="flex flex-wrap items-center gap-2">
									{account !== undefined && (
										<Button disabled={signingIn} onClick={() => follow("oauth")}>
											{signingIn ? (
												<Spinner data-icon="inline-start" />
											) : (
												<LogInIcon data-icon="inline-start" />
											)}
											{account.label ?? `Sign in with ${account.name}`}
										</Button>
									)}
									{canUseApiKey && (
										<Button disabled={signingIn} onClick={() => follow("api_key")}>
											{signingIn ? (
												<Spinner data-icon="inline-start" />
											) : (
												<KeyRoundIcon data-icon="inline-start" />
											)}
											Sign in with {apiKey.name}
										</Button>
									)}
									{detail.auth.credential !== undefined && (
										<Button
											variant="destructive"
											disabled={signingOutNow}
											onClick={() => {
												setSigningOut(true);
												signOut.mutate();
											}}
										>
											{signingOutNow ? (
												<Spinner data-icon="inline-start" />
											) : (
												<LogOutIcon data-icon="inline-start" />
											)}
											Sign out
										</Button>
									)}
								</div>
							</div>
						)}

						{error !== undefined && <Notice tone="danger">{error}</Notice>}
					</div>
				</div>
			</Section>

			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Cancel this sign-in?</AlertDialogTitle>
						<AlertDialogDescription>
							pi saves no credential for a sign-in that does not finish. You can start it again
							afterwards.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={cancelling}>Keep waiting</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={cancelling}
							onClick={() => void confirmCancel()}
						>
							{cancelling && <Spinner data-icon="inline-start" />}
							{cancelling ? "Cancelling" : "Cancel sign-in"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/**
 * The block exists where pi declares a sign-in the panel can start, or where a
 * credential is stored that needs a sign-out. A provider with none of those is
 * configured by the key field alone.
 */
export function ProviderSignIn({ detail }: { detail: ProviderDetail }) {
	const { oauth, apiKey, credential } = detail.auth;
	if (oauth === undefined && apiKey?.interactive !== true && credential === undefined) {
		return null;
	}
	return <SignInBlock detail={detail} />;
}
