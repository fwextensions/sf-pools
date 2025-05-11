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

interface ProgramFilterProps {
	availablePrograms: string[];
	selectedPrograms: string[];
	onProgramChange: (program: string) => void;
}

export function ProgramFilter({
	availablePrograms,
	selectedPrograms,
	onProgramChange,
}: ProgramFilterProps)
{
	const [popoverOpen, setPopoverOpen] = useState(false);

	const programsButtonText = selectedPrograms.length === 0
		? "Select a program..."
		: selectedPrograms.length === 1
			? selectedPrograms[0]
			: `${selectedPrograms.length} selected`;

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
						<span className="truncate">{programsButtonText}</span>
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
					<Command>
						<CommandInput placeholder="Search programs..." />
						<CommandList>
							<CommandEmpty>No program found.</CommandEmpty>
							<CommandGroup>
								{availablePrograms.map(program => (
									<CommandItem
										key={program}
										value={program}
										onSelect={() => {
											onProgramChange(program);
										}}
									>
										<Check
											className={cn(
												"mr-2 h-4 w-4 shrink-0",
												selectedPrograms.includes(program) ? "opacity-100" :
													"opacity-0"
											)}
										/>
										<span className="flex-1 truncate">{program}</span>
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
