/**
 * Can pi install this repository as a package? pi finds a package's skills only
 * in a root `skills/` folder or a `pi` manifest in its `package.json`
 * (`collectPackageResources`), and the `skills` CLI copies skills out without
 * the rest of the repository. For GitHub the repository's tarball is read
 * in-process to look; every other host answers "not available" with the reason.
 */
import { z } from "zod";

import { readArchive } from "./archive";
import type { PackageOption } from "./contract";
import { githubRepoOf } from "./source";

/** A repository bigger than this is not inspected. */
const MAX_REPO_BYTES = 30 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 20_000;

/** Reads a repository's tarball and answers; replaceable so tests never touch the network. */
export type RepoProbe = (
	owner: string,
	repo: string,
	ref: string | undefined,
) => Promise<RepoLayout>;

/** What the check needs of a repository: its file paths and its `package.json` text. */
type RepoLayout = { paths: string[]; packageJson: string | undefined };

/** The layout of a GitHub repository, from its tarball. */
export const fetchGithubPaths: RepoProbe = async (owner, repo, ref) => {
	const response = await fetch(
		`https://codeload.github.com/${owner}/${repo}/tar.gz/${ref ?? "HEAD"}`,
		{
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		},
	);
	if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
	const length = Number(response.headers.get("content-length") ?? "0");
	if (length > MAX_REPO_BYTES) throw new Error("the repository is too large to inspect");
	const data = new Uint8Array(await response.arrayBuffer());
	if (data.length > MAX_REPO_BYTES) throw new Error("the repository is too large to inspect");
	const layout: RepoLayout = { paths: [], packageJson: undefined };
	for (const entry of readArchive("repository.tar.gz", data)) {
		// GitHub wraps everything in one `<repo>-<ref>/` folder.
		const path = entry.path.slice(entry.path.indexOf("/") + 1);
		if (path === "" || entry.kind === "directory") continue;
		layout.paths.push(path);
		if (path === "package.json") layout.packageJson = new TextDecoder().decode(entry.bytes);
	}
	return layout;
};

/** True when a parsed `package.json` text declares a `pi` manifest. */
const hasPiManifest = (text: string): boolean => {
	try {
		const parsed = z.looseObject({}).safeParse(JSON.parse(text));
		return parsed.success && "pi" in parsed.data;
	} catch {
		return false;
	}
};

export const packageOptionFor = async (
	source: string,
	probe: RepoProbe,
): Promise<PackageOption> => {
	const github = githubRepoOf(source);
	if (github === undefined) {
		return {
			available: false,
			reason:
				"Only GitHub repositories can be installed as a package; this source is copied as skills",
		};
	}
	let layout: RepoLayout;
	try {
		layout = await probe(github.owner, github.repo, github.ref);
	} catch (error) {
		const why = error instanceof Error ? error.message : "it did not answer";
		return {
			available: false,
			reason: `The repository could not be inspected (${why}); it can still be copied as skills`,
		};
	}
	const hasSkillsFolder = layout.paths.some((path) => path.startsWith("skills/"));
	if (
		!hasSkillsFolder &&
		!(layout.packageJson !== undefined && hasPiManifest(layout.packageJson))
	) {
		return {
			available: false,
			reason:
				"pi finds a package's skills only in a skills/ folder at the repository root or a pi entry in package.json; this repository has neither",
		};
	}
	const pinned = github.ref === undefined ? "" : `@${github.ref}`;
	return {
		available: true,
		source: `git:github.com/${github.owner}/${github.repo}${pinned}`,
		reason:
			"pi keeps this repository installed and updates it with pi update; only the skills you pick are enabled",
	};
};
