"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, XCircleIcon } from 'lucide-react';
import { cn } from "@/lib/utils";

interface FilterControlsProps {
  availableProgramTypes: string[];
  selectedProgramTypes: string[];
  onProgramTypeChange: (programType: string) => void;
  programTypesPopoverOpen: boolean;
  setProgramTypesPopoverOpen: (isOpen: boolean) => void;
  availablePools: string[];
  selectedPools: string[];
  onPoolChange: (poolName: string) => void;
  onSelectAllPools: () => void;
  onClearPoolSelection: () => void;
  onClearAllFilters: () => void;
  hasActiveFilters: boolean;
}

export default function FilterControls({
  availableProgramTypes,
  selectedProgramTypes,
  onProgramTypeChange,
  programTypesPopoverOpen,
  setProgramTypesPopoverOpen,
  availablePools,
  selectedPools,
  onPoolChange,
  onSelectAllPools,
  onClearPoolSelection,
  onClearAllFilters,
  hasActiveFilters
}: FilterControlsProps) {

  const programTypesButtonText = selectedProgramTypes.length === 0
    ? "Select a program type..."
    : selectedProgramTypes[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-start">
      <div>
        <h2 className="text-xl font-semibold mb-3 text-stone-700">Filter by Program Type</h2>
        <Popover open={programTypesPopoverOpen} onOpenChange={setProgramTypesPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={programTypesPopoverOpen}
              className="w-full justify-between min-h-[40px] text-stone-700"
            >
              <span className="truncate">{programTypesButtonText}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
            <Command>
              <CommandInput placeholder="Search program types..." />
              <CommandList>
                <CommandEmpty>No program type found.</CommandEmpty>
                <CommandGroup>
                  {availableProgramTypes.map(type => (
                    <CommandItem
                      key={type}
                      value={type}
                      onSelect={() => onProgramTypeChange(type)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          selectedProgramTypes.includes(type) ? "opacity-100" : "opacity-0"
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

      <div>
        <h2 className="text-xl font-semibold mb-3 text-stone-700">Filter by Pool</h2>
        <div className="space-y-2 pr-1">
          {availablePools.map(poolName => (
            <div key={poolName} className="flex items-center space-x-2">
              <Checkbox
                id={`pool-${poolName}`}
                value={poolName}
                checked={selectedPools.includes(poolName)}
                onCheckedChange={() => onPoolChange(poolName)}
              />
              <Label htmlFor={`pool-${poolName}`} className="text-stone-700 cursor-pointer">{poolName}</Label>
            </div>
          ))}
        </div>
        {availablePools.length > 0 && (
          <div className="mt-3 flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectAllPools}
              className="text-xs"
            >
              Select All Pools
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClearPoolSelection}
              disabled={selectedPools.length === 0}
              className="text-xs"
            >
              Clear Pool Selection
            </Button>
          </div>
        )}
      </div>

      <div className="md:col-span-1 flex md:flex-col md:items-start md:pt-9 space-x-2 md:space-x-0 md:space-y-2">
        {hasActiveFilters && (
          <Button
            variant="outline"
            onClick={onClearAllFilters}
            className="text-sm w-full md:w-auto bg-stone-200 hover:bg-stone-300 transition-colors"
          >
            <XCircleIcon className="mr-2 h-4 w-4" /> Clear All Filters
          </Button>
        )}
      </div>
    </div>
  );
}
