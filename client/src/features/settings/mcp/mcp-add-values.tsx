/**
 * Step 2 of the add dialog: only what the paste left empty or as a placeholder,
 * in masked fields, then where the servers go. A value left blank is not
 * written, except a `${NAME}` reference, which pi resolves from the dashboard's
 * environment and so stays as pasted.
 */
import { isEnvReference, missingValueId, missingValuesOf } from "shared";
import type { McpScope } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
} from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Candidate } from "./mcp-import";

/** Typed values, by candidate id and then `missingValueId`. */
export type TypedValues = Readonly<Record<number, Readonly<Record<string, string>>>>;

export function McpAddValues({
	candidates,
	values,
	scope,
	projectName,
	taken,
	onValue,
	onScope,
}: {
	candidates: readonly Candidate[];
	values: TypedValues;
	scope: McpScope;
	/** The open project, or undefined when only Global can be written. */
	projectName: string | undefined;
	/** Names already used in the chosen file. */
	taken: ReadonlySet<string>;
	onValue: (candidate: number, id: string, value: string) => void;
	onScope: (scope: McpScope) => void;
}) {
	const needing = candidates.flatMap((candidate) => {
		const missing = missingValuesOf(candidate.server);
		return missing.length === 0 ? [] : [{ candidate, missing }];
	});
	const clashes = candidates.filter((candidate) => taken.has(candidate.name));
	return (
		<FieldGroup className="gap-4">
			{needing.map(({ candidate, missing }) => (
				<FieldSet key={candidate.id}>
					<FieldLegend variant="label">{candidate.name}</FieldLegend>
					<FieldGroup className="gap-3">
						{missing.map((value) => {
							const id = missingValueId(value);
							const inputId = `mcp-add-${candidate.id}-${id}`;
							return (
								<Field key={id}>
									<FieldLabel htmlFor={inputId}>{value.key}</FieldLabel>
									<InputGroup>
										<InputGroupAddon>
											<InputGroupText>{value.kind === "env" ? "env" : "header"}</InputGroupText>
										</InputGroupAddon>
										<InputGroupInput
											id={inputId}
											type="password"
											autoComplete="off"
											value={values[candidate.id]?.[id] ?? ""}
											placeholder={value.pasted === "" ? "Value" : value.pasted}
											onChange={(event) => onValue(candidate.id, id, event.target.value)}
										/>
									</InputGroup>
									{isEnvReference(value.pasted) && (
										<FieldDescription>Blank keeps the reference.</FieldDescription>
									)}
								</Field>
							);
						})}
					</FieldGroup>
				</FieldSet>
			))}

			<McpAddScope scope={scope} projectName={projectName} onScope={onScope} />
			<McpAddClash names={clashes.map((candidate) => candidate.name)} />
		</FieldGroup>
	);
}

/** Where the servers go: the global file or the open project's. */
export function McpAddScope({
	scope,
	projectName,
	onScope,
}: {
	scope: McpScope;
	/** The open project, or undefined when only Global can be written. */
	projectName: string | undefined;
	onScope: (scope: McpScope) => void;
}) {
	return (
		<Field>
			<FieldLabel id="mcp-add-scope-label">Add to</FieldLabel>
			<RadioGroup
				value={scope}
				aria-labelledby="mcp-add-scope-label"
				className="gap-2"
				onValueChange={(value) => onScope(value === "project" ? "project" : "global")}
			>
				<FieldLabel htmlFor="mcp-add-scope-global">
					<Field orientation="horizontal">
						<FieldContent>
							<FieldTitle>Global</FieldTitle>
						</FieldContent>
						<RadioGroupItem value="global" id="mcp-add-scope-global" />
					</Field>
				</FieldLabel>
				<FieldLabel htmlFor="mcp-add-scope-project">
					<Field orientation="horizontal" data-disabled={projectName === undefined}>
						<FieldContent>
							<FieldTitle>{projectName ?? "A project"}</FieldTitle>
						</FieldContent>
						<RadioGroupItem
							value="project"
							id="mcp-add-scope-project"
							disabled={projectName === undefined}
						/>
					</Field>
				</FieldLabel>
			</RadioGroup>
		</Field>
	);
}

/** The block a name already in the chosen file gets. */
export function McpAddClash({ names }: { names: readonly string[] }) {
	if (names.length === 0) return null;
	return (
		<Alert variant="destructive">
			<AlertDescription>
				{names.join(", ")} already {names.length === 1 ? "exists" : "exist"} in that file.
			</AlertDescription>
		</Alert>
	);
}
