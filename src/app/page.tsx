"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PoolSchedule, Program } from '@/lib/pdf-processor'; // Assuming types are exported

interface FilteredProgram extends Program {
  poolName: string;
  poolId: string; // Or some unique identifier for the pool
}

export default function ProgramFilterPage() {
  const [allSchedules, setAllSchedules] = useState<PoolSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedProgramTypes, setSelectedProgramTypes] = useState<string[]>([]);
  const [selectedPools, setSelectedPools] = useState<string[]>([]); // Using poolName as ID for now

  const dayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Derived state for filter options
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

  // Fetch data on component mount
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
        setAllSchedules([]); // Clear data on error
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Event handlers for filters
  const handleProgramTypeChange = (programType: string) => {
    setSelectedProgramTypes(prev => 
      prev.includes(programType) 
        ? prev.filter(item => item !== programType) 
        : [...prev, programType]
    );
  };

  const handlePoolChange = (poolName: string) => {
    setSelectedPools(prev => 
      prev.includes(poolName) 
        ? prev.filter(item => item !== poolName) 
        : [...prev, poolName]
    );
  };

  // Filtered results - Grouped by day and sorted by time
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
            poolId: pool.poolName, // Consider a more robust ID if available
          });
        }
      });
    });

    // Sort all filtered programs first by day, then by time
    filtered.sort((a, b) => {
      const dayAIndex = dayOrder.indexOf(a.dayOfWeek);
      const dayBIndex = dayOrder.indexOf(b.dayOfWeek);
      if (dayAIndex !== dayBIndex) {
        return dayAIndex - dayBIndex;
      }
      // Simple time sort, assuming HH:MM AM/PM format that sorts lexicographically correctly
      // or a 24-hour format. Refine if time formats are inconsistent.
      return (a.startTime || "").localeCompare(b.startTime || "");
    });

    // Group by day of the week
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

      {/* Filter UI Section - Placeholder for now */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div>
          <h2 className="text-xl font-semibold mb-2 text-stone-700">Filter by Program Type</h2>
          {/* Program type checkboxes will go here */}
          {availableProgramTypes.map(type => (
            <div key={type} className="mb-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  value={type}
                  checked={selectedProgramTypes.includes(type)}
                  onChange={() => handleProgramTypeChange(type)}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded border-stone-300 focus:ring-blue-500"
                />
                <span className="text-stone-700">{type}</span>
              </label>
            </div>
          ))}
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2 text-stone-700">Filter by Pool</h2>
          {/* Pool checkboxes will go here */}
           {availablePools.map(poolName => (
            <div key={poolName} className="mb-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  value={poolName}
                  checked={selectedPools.includes(poolName)}
                  onChange={() => handlePoolChange(poolName)}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded border-stone-300 focus:ring-blue-500"
                />
                <span className="text-stone-700">{poolName}</span>
              </label>
            </div>
          ))}
        </div>
        <div className="md:col-span-1 flex items-start">
            {(selectedProgramTypes.length > 0 || selectedPools.length > 0) && (
                <button 
                    onClick={() => {
                        setSelectedProgramTypes([]);
                        setSelectedPools([]);
                    }}
                    className="px-4 py-2 bg-stone-200 text-stone-700 rounded-md hover:bg-stone-300 transition-colors text-sm"
                >
                    Clear All Filters
                </button>
            )}
        </div>
      </div>

      {/* Results Section - Placeholder for now */}
      <div>
        <h2 className="text-2xl font-semibold mb-4 text-stone-700">Available Programs</h2>
        {hasResults ? (
          <div className="space-y-6">
            {dayOrder.map(day => {
              const programsForDay = groupedAndSortedResults[day];
              if (!programsForDay || programsForDay.length === 0) {
                return null;
              }
              return (
                <div key={day}>
                  <h3 className="text-xl font-semibold text-stone-600 mb-3 border-b pb-1 border-stone-300">{day}</h3>
                  <div className="space-y-4">
                    {programsForDay.map((program, index) => (
                      <div key={`${program.poolId}-${program.programName}-${program.startTime}-${index}`} className="p-4 bg-stone-50 rounded-md shadow-sm hover:shadow-md transition-shadow">
                        <h4 className="font-semibold text-lg text-stone-800">{program.programName}</h4>
                        <p className="text-md text-blue-700">at {program.poolName}</p>
                        <p className="text-sm text-stone-600 mt-1">Time: {program.startTime} - {program.endTime}</p>
                        {program.lanes !== undefined && <p className="text-sm text-stone-600">Lanes: {program.lanes}</p>}
                        {program.notes && <p className="text-xs text-stone-500 mt-2"><em>Note: {program.notes}</em></p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-stone-600">
            {isLoading ? 'Loading...' : (selectedProgramTypes.length > 0 || selectedPools.length > 0 ? 'No programs match your current filters. Try adjusting your selections.' : 'Select filters above to see available programs.')}
          </p>
        )}
      </div>

      <footer className="mt-12 py-6 border-t border-stone-200">
        <p className="text-center text-sm text-stone-500">
          Data sourced from SF Rec & Park. Schedules subject to change.
        </p>
      </footer>
    </div>
  );
}
