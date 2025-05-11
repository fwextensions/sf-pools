import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface ProgramTypeFilterProps {
	availableProgramTypes: string[];
	selectedProgramTypes: string[];
	onProgramTypeChange: (programType: string) => void;
}

export function ProgramFilter({
	availableProgramTypes,
	selectedProgramTypes,
	onProgramTypeChange,
}: ProgramTypeFilterProps)
{
	const [popoverOpen, setPopoverOpen] = useState(false);

	const programTypesButtonText = selectedProgramTypes.length === 0
		? "Select a program type..."
		: selectedProgramTypes.length === 1
			? selectedProgramTypes[0]
			: `${selectedProgramTypes.length} selected`;

	return (
		<div>
			<h2 className="text-xl font-semibold mb-3 text-stone-700">
				Select a Program
			</h2>

			<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={popoverOpen}
						className="w-full justify-between min-h-[40px] text-stone-700"
					>
						<span className="truncate">{programTypesButtonText}</span>
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
					<Command>
						<CommandInput placeholder="Search program types..." />
						<CommandList>
							<CommandEmpty>No program type found.</CommandEmpty>
							<CommandGroup>
								{availableProgramTypes.map(type => (
									<CommandItem
										key={type}
										value={type}
										onSelect={() => {
											onProgramTypeChange(type);
										}}
									>
										<Check
											className={cn(
												"mr-2 h-4 w-4 shrink-0",
												selectedProgramTypes.includes(type) ? "opacity-100" :
													"opacity-0"
											)}
										/>
										<span className="flex-1 truncate">{type}</span>
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
