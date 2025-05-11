import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { XCircleIcon } from "lucide-react";
import { ProgramFilter } from "@/components/ProgramFilter";

interface FilterControlsProps {
  availableProgramTypes: string[];
  selectedProgramTypes: string[];
  onProgramTypeChange: (programType: string) => void;
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
  availablePools,
  selectedPools,
  onPoolChange,
  onSelectAllPools,
  onClearPoolSelection,
  onClearAllFilters,
  hasActiveFilters
}: FilterControlsProps) {

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-start">
      <ProgramFilter
        availableProgramTypes={availableProgramTypes}
        selectedProgramTypes={selectedProgramTypes}
        onProgramTypeChange={onProgramTypeChange}
      />

      <div>
        <h2 className="text-xl font-semibold mb-3 text-stone-700">
          Select Pool(s)
        </h2>

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
          <div className="mt-3 flex space-x-2 items-center">
            <span className="text-sm align-middle">
              Select
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={onSelectAllPools}
              disabled={selectedPools.length === availablePools.length}
              className="text-xs"
            >
              All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClearPoolSelection}
              disabled={selectedPools.length === 0}
              className="text-xs"
            >
              None
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
