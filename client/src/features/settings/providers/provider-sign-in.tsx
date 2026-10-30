/**
 * Sign in with an account. pi runs the flow, so this block only relays it: it starts
 * `ModelRuntime.login()`, shows what pi reports, and answers what pi asks. The record
 * on the server is the truth and the page polls it, so a reload picks the flow back up
 * instead of losing it.
 *
 * pi uses a stored credential ahead of a key in models.json, so the idle block names
 * the one in use. Nothing here writes auth.json itself; only pi's login and logout do.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	ChevronRightIcon,
	ExternalLinkIcon,
	KeyRoundIcon,
	LogInIcon,
	LogOutIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { providerLoginKeys } from "@/api/keys";
import {
	answerProviderLogin,
	cancelProviderLogin,
	logoutProvider,
	startProviderLogin,
} from "@/api/endpoints";
import { useProviderLogin, useSettingsRefresh } from "@/features/settings/queries";
import { SettingsBlock, SettingsGroup } from "@/features/settings/kit/settings-section";
import type { ProviderDetail, ProviderLoginQuestion, ProviderLoginSnapshot } from "@/api/types";

/** The account a run belongs to, from the provider detail. */
type Account = NonNullable<ProviderDetail["auth"]["oauth"]>;

/** What pi will use for this provider, in pi's own precedence order. */
const describeCredential = (detail: ProviderDetail) => {
	const { credential } = detail.auth;
	if (credential !== undefined) {
		return {
			title: credential === "oauth" ? "A signed-in account is in use" : "A stored key is in use",
			note: detail.hasKey
				? "pi keeps it in auth.json and uses it ahead of the key in models.json."
				: "pi keeps it in auth.json on the agent host.",
		};
	}
	switch (detail.source) {
		case "models_json_key":
			return {
				title: "The key in models.json is in use",
				note: "It is this provider's only credential.",
			};
		case "models_json_command":
			return {
				title: "The key command in models.json is in use",
				note: "pi runs it to get a key.",
			};
		case "environment":
			return {
				title: "An environment variable is in use",
				note: "pi reads it from the process the agent runs in.",
			};
		case "runtime":
			return { title: "A key set for this run is in use", note: "It is saved nowhere." };
		default:
			return detail.configured
				? { title: "A credential is in use", note: "pi did not say which one." }
				: {
						title: "No credential yet",
						note: "Sign in with an account, or set your own endpoint and key below.",
					};
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
			<div className="settle-in flex flex-col gap-2">
				<p className="text-sm font-medium">{question.message}</p>
				<ItemGroup>
					{(question.options ?? []).map((option) => (
						<Item
							key={option.id}
							variant="outline"
							size="sm"
							className="cursor-pointer transition-colors hover:bg-muted/60"
							render={
								<button
									type="button"
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
								<ChevronRightIcon className="size-4 text-muted-foreground" />
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
			className="settle-in"
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
	account,
	flow,
	answering,
	cancelling,
	onAnswer,
	onCancel,
}: {
	account: Account;
	flow: ProviderLoginSnapshot;
	answering: boolean;
	cancelling: boolean;
	onAnswer: (promptId: string, value: string) => void;
	onCancel: () => void;
}) {
	const { authUrl, deviceCode, question } = flow;
	return (
		<>
			<div className="flex flex-col gap-4">
				<Item variant="muted" size="sm">
					<ItemMedia variant="icon">
						<Spinner />
					</ItemMedia>
					<ItemContent>
						<ItemTitle>{account.label ?? `Sign in with ${account.name}`}</ItemTitle>
						<ItemDescription>{stepLineOf(flow)}</ItemDescription>
					</ItemContent>
					<ItemActions>
						<Button size="sm" variant="destructive" disabled={cancelling} onClick={onCancel}>
							Cancel
						</Button>
					</ItemActions>
				</Item>

				{authUrl !== undefined && (
					<div className="settle-in flex flex-col items-start gap-2">
						<Button size="sm" render={<a href={authUrl.url} target="_blank" rel="noreferrer" />}>
							<ExternalLinkIcon data-icon="inline-start" />
							Open the sign-in page
						</Button>
						{authUrl.instructions !== undefined && (
							<p className="text-xs text-muted-foreground">{authUrl.instructions}</p>
						)}
					</div>
				)}

				{deviceCode !== undefined && (
					<div className="settle-in">
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
					<ul className="settle-in flex flex-col gap-1 text-xs text-muted-foreground">
						{flow.notices.slice(-3).map((notice, index) => (
							<li key={`${index}-${notice.message}`}>
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
	const queryClient = useQueryClient();
	const refresh = useSettingsRefresh();
	const login = useProviderLogin(providerId);
	const [error, setError] = useState<string | undefined>();
	// The confirmation outlives the flow on purpose: it has to finish closing after the
	// flow's record does, or its exit animation would be cut by the flow unmounting.
	const [confirming, setConfirming] = useState(false);
	const flow = login.data;
	const running = flow?.status === "running";
	/** A record the page came back from, so the card it returns to is not a cold view. */
	const returned = flow !== undefined && flow !== null && flow.status !== "running";

	// The flow finishes out of band, so the settings snapshot is re-read once the
	// poll reports it. That is what turns "signed in" into the credential line above.
	// A flow that is no longer running cannot have a cancel waiting on an answer.
	const status = flow?.status;
	useEffect(() => {
		if (status === "succeeded") refresh();
	}, [status, refresh]);

	const keep = (snapshot: ProviderLoginSnapshot | null) => {
		setError(undefined);
		queryClient.setQueryData(providerLoginKeys.one(providerId), snapshot);
	};

	const signIn = useMutation({
		mutationFn: () => startProviderLogin(providerId, "oauth"),
		// A new flow cannot have a cancel left over from the last one.
		onMutate: () => setConfirming(false),
		onSuccess: keep,
		onError: (cause) => setError(cause.message),
	});

	const answer = useMutation({
		mutationFn: (input: { promptId: string; value: string }) =>
			answerProviderLogin(providerId, input),
		onSuccess: keep,
		onError: (cause) => setError(cause.message),
	});

	const cancel = useMutation({
		mutationFn: () => cancelProviderLogin(providerId),
		// The route answers once pi's flow has settled, so this snapshot is final: the card
		// swaps in the same step the dialog starts closing, and nothing jitters in between.
		onSuccess: keep,
		onError: (cause) => setError(cause.message),
	});

	// The footer button asks this instead of being an `AlertDialogAction`: that closes
	// the dialog on click, which would hide the cancel round trip.
	const confirmCancel = async () => {
		try {
			await cancel.mutateAsync();
		} catch {
			// The account block reports it; the dialog's job is to close.
		} finally {
			setConfirming(false);
		}
	};

	const signOut = useMutation({
		mutationFn: () => logoutProvider(providerId),
		onSuccess: () => {
			setError(undefined);
			// The server dropped the record with the credential, so read it fresh.
			queryClient.removeQueries({ queryKey: providerLoginKeys.one(providerId) });
			refresh();
		},
		onError: (cause) => setError(cause.message),
	});

	const inUse = describeCredential(detail);

	return (
		<>
			<SettingsGroup title="Account">
				<SettingsBlock>
					<div className="flex flex-col gap-3">
						{running && account !== undefined ? (
							<SignInFlow
								account={account}
								flow={flow}
								answering={answer.isPending}
								cancelling={cancel.isPending}
								onAnswer={(promptId, value) => answer.mutate({ promptId, value })}
								onCancel={() => setConfirming(true)}
							/>
						) : (
							// Arriving back after a flow: the card fades in instead of popping. A
							// first view of the page is not animated, so it matches its neighbours.
							<div className={cn("flex flex-col gap-3", returned && "settle-in")}>
								<div className="flex flex-col gap-1">
									<p className="text-sm font-medium">{inUse.title}</p>
									<p className="text-xs text-muted-foreground">{inUse.note}</p>
								</div>

								{flow?.status === "failed" && (
									<Alert variant="destructive">
										<TriangleAlertIcon />
										<AlertDescription>{flow.error ?? "The sign-in failed."}</AlertDescription>
									</Alert>
								)}
								{flow?.status === "cancelled" && (
									<p className="text-xs text-muted-foreground">{flow.error}</p>
								)}

								<div className="flex flex-wrap items-center gap-2">
									{account !== undefined && (
										<Button disabled={signIn.isPending} onClick={() => signIn.mutate()}>
											{signIn.isPending ? (
												<Spinner data-icon="inline-start" />
											) : (
												<LogInIcon data-icon="inline-start" />
											)}
											{account.label ?? `Sign in with ${account.name}`}
										</Button>
									)}
									{detail.auth.credential !== undefined && (
										<Button
											variant="outline"
											disabled={signOut.isPending}
											onClick={() => signOut.mutate()}
										>
											{signOut.isPending ? (
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

						{error !== undefined && (
							<Alert variant="destructive">
								<TriangleAlertIcon />
								<AlertDescription className="break-words">{error}</AlertDescription>
							</Alert>
						)}
					</div>
				</SettingsBlock>
			</SettingsGroup>

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
						<AlertDialogCancel disabled={cancel.isPending}>Keep waiting</AlertDialogCancel>
						<Button
							variant="destructive"
							disabled={cancel.isPending}
							onClick={() => void confirmCancel()}
						>
							{cancel.isPending && <Spinner data-icon="inline-start" />}
							{cancel.isPending ? "Cancelling" : "Cancel sign-in"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/**
 * The account block exists only where pi declares an account sign-in or has already
 * stored a credential. A provider with neither is configured by the key field alone.
 */
export function ProviderSignIn({ detail }: { detail: ProviderDetail }) {
	if (detail.auth.oauth === undefined && detail.auth.credential === undefined) return null;
	return <SignInBlock detail={detail} />;
}
