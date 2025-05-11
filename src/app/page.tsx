"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PoolSchedule, Program } from "@/lib/pdf-processor";
import FilterControls from "@/components/FilterControls";
import ResultsList, { FilteredProgram } from "@/components/ResultsList";

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
        const response = await fetch("/data/all_schedules.json");
        if (!response.ok) {
          throw new Error(`Failed to fetch schedules: ${response.statusText}`);
        }
        const data = await response.json();
        setAllSchedules(data);
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
        setAllSchedules([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleProgramTypeChange = (programType: string) => {
    setSelectedProgramTypes(prev =>
      prev.includes(programType) ? [] : [programType]
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

  const handleSelectAllPools = () => {
    setSelectedPools(availablePools);
  };

  const handleClearPoolSelection = () => {
    setSelectedPools([]);
  };

  const handleClearAllFilters = () => {
    setSelectedProgramTypes([]);
    setSelectedPools([]);
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
  }, [allSchedules, selectedProgramTypes, selectedPools, dayOrder]);

  const hasResults = useMemo(() => {
    return Object.keys(groupedAndSortedResults).length > 0 && Object.values(groupedAndSortedResults).some(dayPrograms => dayPrograms.length > 0);
  }, [groupedAndSortedResults]);

  const hasActiveFilters = useMemo(() => {
    return selectedProgramTypes.length > 0 || selectedPools.length > 0;
  }, [selectedProgramTypes, selectedPools]);

  if (isLoading) {
    return <div className="container mx-auto p-4 text-center">Loading schedules...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 text-center text-red-500">Error loading schedules: {error}</div>;
  }

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

      <FilterControls 
        availableProgramTypes={availableProgramTypes}
        selectedProgramTypes={selectedProgramTypes}
        onProgramTypeChange={handleProgramTypeChange}
        programTypesPopoverOpen={programTypesPopoverOpen}
        setProgramTypesPopoverOpen={setProgramTypesPopoverOpen}
        availablePools={availablePools}
        selectedPools={selectedPools}
        onPoolChange={handlePoolChange}
        onSelectAllPools={handleSelectAllPools}
        onClearPoolSelection={handleClearPoolSelection}
        onClearAllFilters={handleClearAllFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <ResultsList 
        groupedAndSortedResults={groupedAndSortedResults}
        dayOrder={dayOrder}
        hasResults={hasResults}
      />
    </div>
  );
}
