"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PoolSchedule, Program } from '@/lib/pdf-processor';

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

interface FilteredProgram extends Program {
  poolName: string;
  poolId: string; 
}

export default function ProgramFilterPage() {
  const [allSchedules, setAllSchedules] = useState<PoolSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProgramTypes, setSelectedProgramTypes] = useState<string[]>([]); 
  const [selectedPools, setSelectedPools] = useState<string[]>([]); 
  const [programTypesPopoverOpen, setProgramTypesPopoverOpen] = useState(false);

  const dayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const availableProgramTypes = useMemo(() => {
    const types = new Set<string>();
    allSchedules.forEach(pool => {
      pool.programs.forEach(program => types.add(program.programName));
    });
    return Array.from(types).sort();
  }, [allSchedules]);

  const availablePools = useMemo(() => {
    return allSchedules.map(pool => pool.poolName).sort();
  }, [allSchedules]);

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        const response = await fetch('/data/all_schedules.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch schedules: ${response.statusText}`);
        }
        const data = await response.json();
        setAllSchedules(data);
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setAllSchedules([]); 
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleProgramTypeChange = (programType: string) => {
    setSelectedProgramTypes(prev => 
      prev.includes(programType) 
        ? [] 
        : [programType] 
    );
    setProgramTypesPopoverOpen(false); 
  };

  const handlePoolChange = (poolName: string) => {
    setSelectedPools(prev => 
      prev.includes(poolName) 
        ? prev.filter(item => item !== poolName) 
        : [...prev, poolName]
    );
  };

  const groupedAndSortedResults = useMemo(() => {
    let filtered: FilteredProgram[] = [];
    if (allSchedules.length === 0) return {};

    allSchedules.forEach(pool => {
      pool.programs.forEach(program => {
        const programMatches = selectedProgramTypes.length === 0 || selectedProgramTypes.includes(program.programName);
        const poolMatches = selectedPools.length === 0 || selectedPools.includes(pool.poolName);

        if (programMatches && poolMatches) {
          filtered.push({
            ...program,
            poolName: pool.poolName,
            poolId: pool.poolName, 
          });
        }
      });
    });

    filtered.sort((a, b) => {
      const dayAIndex = dayOrder.indexOf(a.dayOfWeek);
      const dayBIndex = dayOrder.indexOf(b.dayOfWeek);
      if (dayAIndex !== dayBIndex) {
        return dayAIndex - dayBIndex;
      }
      return (a.startTime || "").localeCompare(b.startTime || "");
    });

    const grouped: Record<string, FilteredProgram[]> = {};
    filtered.forEach(program => {
      if (!grouped[program.dayOfWeek]) {
        grouped[program.dayOfWeek] = [];
      }
      grouped[program.dayOfWeek].push(program);
    });

    return grouped;
  }, [allSchedules, selectedProgramTypes, selectedPools]);

  const hasResults = useMemo(() => {
    return Object.keys(groupedAndSortedResults).length > 0 && Object.values(groupedAndSortedResults).some(dayPrograms => dayPrograms.length > 0);
  }, [groupedAndSortedResults]);

  if (isLoading) {
    return <div className="container mx-auto p-4 text-center">Loading schedules...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 text-center text-red-500">Error loading schedules: {error}</div>;
  }

  const programTypesButtonText = selectedProgramTypes.length === 0
    ? "Select a program type..."
    : selectedProgramTypes[0];

  return (
    <div className="container mx-auto p-4 font-[family-name:var(--font-geist-sans)]">
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-4 text-center text-stone-800">Find Your Swim</h1>
        <p className="text-center text-stone-600">
          Filter programs by type and pool to find the perfect time and place for your swim.
        </p>
        <div className="text-center mt-4">
            <Link href="/schedules" className="text-blue-600 hover:text-blue-800 underline">
                View Full Pool Schedules
            </Link>
        </div>
      </header>

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
                        onSelect={() => {
                          handleProgramTypeChange(type);
                        }}
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
                onCheckedChange={() => handlePoolChange(poolName)}
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
                onClick={() => setSelectedPools(availablePools)}
                className="text-xs"
              >
                Select All Pools
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSelectedPools([])}
                disabled={selectedPools.length === 0}
                className="text-xs"
              >
                Clear Pool Selection
              </Button>
            </div>
          )}
        </div>

        <div className="md:col-span-1 flex md:flex-col md:items-start md:pt-9 space-x-2 md:space-x-0 md:space-y-2">
            {(selectedProgramTypes.length > 0 || selectedPools.length > 0) && (
                <Button 
                    variant="outline"
                    onClick={() => {
                        setSelectedProgramTypes([]);
                        setSelectedPools([]);
                    }}
                    className="text-sm w-full md:w-auto bg-stone-200 hover:bg-stone-300 transition-colors"
                >
                    <XCircleIcon className="mr-2 h-4 w-4" /> Clear All Filters
                </Button>
            )}
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-4 text-stone-700">
          {hasResults ? 'Available Programs' : 'No programs match your filters.'}
        </h2>
        {hasResults ? (
          <div className="space-y-6">
            {dayOrder.map(day => 
              groupedAndSortedResults[day] && groupedAndSortedResults[day].length > 0 && (
                <div key={day}>
                  <h3 className="text-xl font-semibold mb-3 text-stone-600 border-b pb-1">{day}</h3>
                  <div className="space-y-3">
                  {groupedAndSortedResults[day].map((program, index) => (
                    <div key={`${program.poolId}-${program.programName}-${program.startTime}-${index}`} className="p-3 bg-white rounded-lg shadow border border-stone-200">
                      <h4 className="font-semibold text-stone-800">{program.programName}</h4>
                      <p className="text-sm text-stone-600">{program.poolName}</p>
                      <p className="text-sm text-stone-600">
                        {program.startTime} - {program.endTime}
                        {program.lanes && <span className="ml-2 text-xs text-stone-500">({program.lanes} lanes)</span>}
                      </p>
                      {program.notes && <p className="text-xs text-stone-500 mt-1">Note: {program.notes}</p>}
                    </div>
                  ))}
                  </div>
                </div>
            ))}
          </div>
        ) : (
          <p className="text-stone-500">Try adjusting your search or clearing filters to see more options.</p>
        )}
      </div>
    </div>
  );
}
