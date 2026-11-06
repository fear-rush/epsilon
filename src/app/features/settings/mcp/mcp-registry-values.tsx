/**
 * Step 2 of the Registry tab: the name, the values the registry asks for (masked
 * when secret, a select when it lists choices, its default filled in), and where
 * the server goes.
 */
import type { McpScope } from "#protocol/settings/mcp";
import type { McpRegistryInput, McpRegistryOption } from "#protocol/settings/mcp-registry";
import { toneText } from "@/components/patterns/status/status-tone";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

import { NameField } from "./mcp-add-source";
import { McpAddClash, McpAddScope } from "./mcp-add-values";
import { valueOf } from "./mcp-registry";

function InputField({
	input,
	value,
	onChange,
}: {
	input: McpRegistryInput;
	value: string;
	onChange: (value: string) => void;
}) {
	const id = `mcp-registry-${input.key}`;
	return (
		<Field>
			<FieldLabel htmlFor={id}>
				{input.name}
				{input.required && (
					<span aria-hidden className={cn("text-meta", toneText("danger"))}>
						*
					</span>
				)}
			</FieldLabel>
			{input.choices === undefined ? (
				<InputGroup>
					<InputGroupAddon>
						<InputGroupText>{input.target}</InputGroupText>
					</InputGroupAddon>
					<InputGroupInput
						id={id}
						type={input.secret ? "password" : "text"}
						autoComplete="off"
						required={input.required}
						value={value}
						placeholder={input.required ? "Required" : "Optional"}
						onChange={(event) => onChange(event.target.value)}
					/>
				</InputGroup>
			) : (
				<Select
					items={input.choices.map((choice) => ({ value: choice, label: choice }))}
					value={value === "" ? null : value}
					onValueChange={(next) => {
						if (next !== null) onChange(next);
					}}
				>
					<SelectTrigger id={id} className="w-full" aria-required={input.required}>
						<SelectValue placeholder="Choose" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{input.choices.map((choice) => (
								<SelectItem key={choice} value={choice}>
									{choice}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			)}
			{input.description !== undefined && <FieldDescription>{input.description}</FieldDescription>}
		</Field>
	);
}

export function McpRegistryValues({
	option,
	name,
	values,
	scope,
	projectName,
	taken,
	onName,
	onValue,
	onScope,
}: {
	option: McpRegistryOption;
	name: string;
	values: Readonly<Record<string, string>>;
	scope: McpScope;
	projectName: string | undefined;
	taken: ReadonlySet<string>;
	onName: (name: string) => void;
	onValue: (key: string, value: string) => void;
	onScope: (scope: McpScope) => void;
}) {
	return (
		<FieldGroup className="gap-4">
			<NameField id="mcp-registry-name" value={name} touched onChange={onName} />
			{option.inputs.map((input) => (
				<InputField
					key={input.key}
					input={input}
					value={valueOf(input, values)}
					onChange={(value) => onValue(input.key, value)}
				/>
			))}
			<McpAddScope scope={scope} projectName={projectName} onScope={onScope} />
			<McpAddClash names={taken.has(name.trim()) ? [name.trim()] : []} />
		</FieldGroup>
	);
}
