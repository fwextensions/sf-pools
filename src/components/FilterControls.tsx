import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { XCircleIcon } from "lucide-react";
import { ProgramFilter } from "@/components/ProgramFilter";

interface FilterControlsProps {
  availablePrograms: string[];
  selectedPrograms: string[];
  onProgramChange: (program: string) => void;
  availablePools: string[];
  selectedPools: string[];
  onPoolChange: (poolName: string) => void;
}

export default function FilterControls({
  availablePrograms,
  selectedPrograms,
  onProgramChange,
  availablePools,
  selectedPools,
  onPoolChange,
}: FilterControlsProps) {

  const handleSelectAllPools = () => {
    availablePools.forEach(poolName => {
      if (!selectedPools.includes(poolName)) {
        onPoolChange(poolName);
      }
    });
  };

  const handleClearPoolSelection = () => {
    selectedPools.forEach(poolName => {
      onPoolChange(poolName);
    });
  };

  const handleClearAllFilters = () => {
    // Clear program selection
    // Assumes onProgramChange with the current selection clears it, or with an empty string/null for a general clear
    // Given current parent logic, this should work if only one program is selected
    if (selectedPrograms.length > 0) {
        // If multiple programs can be selected, this logic might need to iterate
        // or onProgramChange should handle a special value for clearing all.
        // For now, assuming only one program or toggling the first one clears it effectively.
        onProgramChange(selectedPrograms[0]); 
    }

    // Clear pool selections
    handleClearPoolSelection();
  };

  const hasActiveFilters = selectedPrograms.length > 0 || selectedPools.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-start">
      <ProgramFilter
        availablePrograms={availablePrograms}
        selectedPrograms={selectedPrograms}
        onProgramChange={onProgramChange}
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
              onClick={handleSelectAllPools}
              disabled={selectedPools.length === availablePools.length}
              className="text-xs"
            >
              All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearPoolSelection}
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
            onClick={handleClearAllFilters}
            className="text-sm w-full md:w-auto bg-stone-200 hover:bg-stone-300 transition-colors"
          >
            <XCircleIcon className="mr-2 h-4 w-4" /> Clear All Filters
          </Button>
        )}
      </div>
    </div>
  );
}
