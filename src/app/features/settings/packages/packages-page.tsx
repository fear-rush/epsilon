import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageIcon } from "lucide-react";
import { useState } from "react";

import type { PackageResourceType, PackageScope, PackageView } from "#protocol/config/packages";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { call } from "@/runtime";

/**
 * Settings → Packages: what pi's settings declare, what each package contributes, and the
 * writes pi owns.
 *
 * Epsilon calls pi's installer and settings setters; a source is never copied into an
 * Epsilon file. A package's resources can be switched off one by one, which writes the
 * filter list pi reads.
 */
const packagesQuery = {
	queryKey: ["config", "packages", null],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["config.packages.list"]({ folder: null }), { signal }),
};

const updatesQuery = {
	queryKey: ["config", "packages", "updates", null],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["config.packages.updates"]({ folder: null }), { signal }),
};

const resourcesQuery = (source: string, scope: PackageScope) => ({
	queryKey: ["config", "packages", "resources", source, scope],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["config.packages.resources"]({ folder: null, scope, source }), {
			signal,
		}),
});

const resourceKinds: ReadonlyArray<PackageResourceType> = [
	"extensions",
	"skills",
	"prompts",
	"themes",
];

export function SettingsPackages() {
	const queryClient = useQueryClient();
	const packages = useQuery(packagesQuery);
	const updates = useQuery(updatesQuery);
	const [source, setSource] = useState("");
	const [open, setOpen] = useState<string | undefined>(undefined);
	const [failure, setFailure] = useState<string | undefined>(undefined);

	const refresh = (): void => {
		void queryClient.invalidateQueries({ queryKey: ["config"] });
	};
	const install = useMutation({
		mutationFn: (value: string) =>
			call((client) =>
				client["config.packages.install"]({ folder: null, scope: "user", source: value }),
			),
		onSuccess: () => {
			setSource("");
			setFailure(undefined);
			refresh();
		},
		onError: (error: Error) => setFailure(error.message),
	});
	const remove = useMutation({
		mutationFn: (entry: PackageView) =>
			call((client) =>
				client["config.packages.remove"]({
					folder: null,
					scope: entry.scope,
					source: entry.source,
				}),
			),
		onSuccess: refresh,
		onError: (error: Error) => setFailure(error.message),
	});
	const update = useMutation({
		mutationFn: (entry: PackageView) =>
			call((client) =>
				client["config.packages.update"]({
					folder: null,
					scope: entry.scope,
					source: entry.source,
				}),
			),
		onSuccess: refresh,
		onError: (error: Error) => setFailure(error.message),
	});

	if (packages.isPending) {
		return (
			<Pane className="flex-1">
				<PaneBar title="Packages" />
				<div className="flex flex-1 items-center justify-center">
					<LoadingState label="Reading pi's package list…" />
				</div>
			</Pane>
		);
	}

	if (packages.error !== null) {
		const view = errorView(packages.error);
		return (
			<Pane className="flex-1">
				<PaneBar title="Packages" />
				<StatusView icon={view.icon} title={view.title} line={view.line} tone={view.tone} />
			</Pane>
		);
	}

	const updatable = new Set((updates.data?.updates ?? []).map((entry) => entry.source));

	return (
		<Pane className="flex-1">
			<PaneBar title="Packages" meta={`${packages.data.packages.length}`} />
			<PaneBody page>
				{failure !== undefined && (
					<Notice tone="error" title="The package list was not changed">
						{failure}
					</Notice>
				)}
				{(updates.error ?? packages.error) !== null && (
					<Notice tone="warning" title="pi could not answer for the package list">
						{updates.error?.message}
					</Notice>
				)}

				<Section
					title="Installed"
					description="Declared in pi's settings. A project entry wins over the home's entry of the same source."
				>
					{packages.data.packages.length === 0 ? (
						<Row title="No package" description="Install one below, or with pi's CLI." />
					) : (
						packages.data.packages.map((entry) => {
							const key = `${entry.scope}:${entry.source}`;
							return (
								<Row
									key={key}
									title={entry.source}
									description={`${entry.scope}${entry.installedPath === undefined ? "" : ` · ${entry.installedPath}`}${entry.filtered ? " · filtered" : ""}`}
								>
									<Badge variant="outline">{entry.relation}</Badge>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setOpen(open === key ? undefined : key)}
									>
										<PackageIcon />
										Resources
									</Button>
									{updatable.has(entry.source) && (
										<Button size="sm" variant="outline" onClick={() => update.mutate(entry)}>
											Update
										</Button>
									)}
									<Button
										size="sm"
										variant="outline"
										disabled={remove.isPending}
										onClick={() => remove.mutate(entry)}
									>
										Remove
									</Button>
								</Row>
							);
						})
					)}
				</Section>

				{open !== undefined && (
					<PackageResources
						key={open}
						source={open.slice(open.indexOf(":") + 1)}
						scope={open.slice(0, open.indexOf(":")) === "project" ? "project" : "user"}
					/>
				)}

				<Section
					title="Install"
					description="A source pi's installer understands, such as an npm package or a git URL."
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							const value = source.trim();
							if (value !== "") install.mutate(value);
						}}
					>
						<FieldStack>
							<Field>
								<FieldLabel htmlFor="package-source">Source</FieldLabel>
								<div className="flex items-center gap-2">
									<Input
										id="package-source"
										value={source}
										placeholder="@scope/package or a git URL"
										autoComplete="off"
										onChange={(event) => setSource(event.target.value)}
									/>
									<Button
										type="submit"
										size="sm"
										disabled={install.isPending || source.trim() === ""}
									>
										Install
									</Button>
								</div>
								<FieldDescription>
									Installed into the agent home, where a terminal pi sees it too.
								</FieldDescription>
							</Field>
						</FieldStack>
					</form>
				</Section>
			</PaneBody>
		</Pane>
	);
}

/** One package's four resource lists, each file switchable off for this package. */
function PackageResources({ source, scope }: { source: string; scope: PackageScope }) {
	const queryClient = useQueryClient();
	const resources = useQuery(resourcesQuery(source, scope));
	const setResource = useMutation({
		mutationFn: (input: { type: PackageResourceType; path: string; enabled: boolean }) =>
			call((client) =>
				client["config.packages.setResource"]({
					folder: null,
					input: { ...input, scope, source },
				}),
			),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["config"] });
		},
	});

	if (resources.isPending) {
		return (
			<Section title="Resources">
				<Row title="Reading…" />
			</Section>
		);
	}
	if (resources.error !== null) {
		return (
			<Section title="Resources">
				<Row title="pi could not list this package" description={resources.error.message} />
			</Section>
		);
	}

	return (
		<Section
			title="Resources"
			description={`What ${source} contributes, and what is switched off.`}
		>
			{resourceKinds.map((kind) => {
				const entries = resources.data[kind];
				if (entries.length === 0) return null;
				return (
					<div key={kind} className="grid">
						<Row title={kind} stacked>
							<span className="text-meta text-muted-foreground">{entries.length} files</span>
						</Row>
						{entries.map((entry) => (
							<Row key={entry.path} title={entry.name} description={entry.path}>
								<Switch
									aria-label={`${entry.name} enabled`}
									checked={entry.enabled}
									onCheckedChange={(enabled) =>
										setResource.mutate({ enabled, path: entry.path, type: kind })
									}
								/>
							</Row>
						))}
					</div>
				);
			})}
		</Section>
	);
}
