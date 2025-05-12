"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { PoolSchedule } from "@/lib/pdf-processor";
import FilterControls from "@/components/FilterControls";
import ResultsList, { FilteredProgram } from "@/components/ResultsList";

// Define AllPoolsMetadata interface (can be moved to a types file later)
interface PoolMetadata {
  shortName: string;
  schedulePageName: string;
}

interface AllPoolsMetadata {
  [fullPoolName: string]: PoolMetadata;
}

// Helper function to get day order starting from today
const getOrderedDays = () => {
	const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
		"Friday", "Saturday"];
	const todayIndex = new Date().getDay(); // Sunday - Saturday : 0 - 6
	return [...days.slice(todayIndex), ...days.slice(0, todayIndex)];
};

export default function ProgramFilterPage() {
	const [allSchedules, setAllSchedules] = useState<PoolSchedule[]>([]);
	const [poolMetadata, setPoolMetadata] = useState<AllPoolsMetadata | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Initialize state from localStorage or default to empty arrays
	const [selectedPrograms, setSelectedPrograms] = useState<string[]>(
		() => {
			if (typeof window !== "undefined") {
				const saved = localStorage.getItem("selectedPrograms");
				return saved ? JSON.parse(saved) : [];
			}
			return [];
		});
	const [selectedPools, setSelectedPools] = useState<string[]>(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("selectedPools");
			return saved ? JSON.parse(saved) : [];
		}
		return [];
	});

	const dayOrder = getOrderedDays(); // Use the dynamic day order

	useEffect(() => {
		async function fetchData()
		{
			try {
				setIsLoading(true);
				const [schedulesResponse, metadataResponse] = await Promise.all([
					fetch("/data/all_schedules.json"),
					fetch("/data/pool_metadata.json")
				]);

				if (!schedulesResponse.ok) {
					throw new Error(`Failed to fetch schedules: ${schedulesResponse.statusText}`);
				}
				if (!metadataResponse.ok) {
					throw new Error(`Failed to fetch pool metadata: ${metadataResponse.statusText}`);
				}

				const schedulesData = await schedulesResponse.json();
				const metadataData = await metadataResponse.json();

				setAllSchedules(schedulesData);
				setPoolMetadata(metadataData);
				setError(null);
			} catch (err) {
				console.error(err);
				setError(
					err instanceof Error ? err.message : "An unknown error occurred");
				setAllSchedules([]);
				setPoolMetadata(null);
			} finally {
				setIsLoading(false);
			}
		}

		fetchData();
	}, []);

	// Effect to save selectedPrograms to localStorage
	useEffect(() => {
		if (typeof window !== "undefined") {
			localStorage.setItem("selectedPrograms",
				JSON.stringify(selectedPrograms));
		}
	}, [selectedPrograms]);

	// Effect to save selectedPools to localStorage
	useEffect(() => {
		if (typeof window !== "undefined") {
			localStorage.setItem("selectedPools", JSON.stringify(selectedPools));
		}
	}, [selectedPools]);

	const availablePrograms = useMemo(() => {
		const types = new Set<string>();
		allSchedules.forEach(pool => {
			pool.programs.forEach(program => types.add(program.programName));
		});
		return Array.from(types).sort();
	}, [allSchedules]);

	const availablePools = useMemo(() => {
		return allSchedules.map(pool => pool.poolName).sort();
	}, [allSchedules]);

	const handleProgramChange = (program: string) => {
		setSelectedPrograms(prev =>
			prev.includes(program) ? [] : [program]
		);
	};

	const handlePoolChange = (poolName: string) => {
		setSelectedPools(prev =>
			prev.includes(poolName)
				? prev.filter(p => p !== poolName)
				: [...prev, poolName]
		);
	};

	const groupedAndSortedResults = useMemo(() => {
		let filtered: FilteredProgram[] = [];
		if (allSchedules.length === 0) {
			return {};
		}

		allSchedules.forEach(pool => {
			pool.programs.forEach(program => {
				const programMatches = selectedPrograms.length === 0 ||
					selectedPrograms.includes(program.programName);
				const poolMatches = selectedPools.length === 0 ||
					selectedPools.includes(pool.poolName);

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
	}, [allSchedules, selectedPrograms, selectedPools, dayOrder]);

	const hasResults = useMemo(() => {
		return Object.keys(groupedAndSortedResults).length > 0 &&
			Object.values(groupedAndSortedResults).some(
				dayPrograms => dayPrograms.length > 0);
	}, [groupedAndSortedResults]);

	if (isLoading) {
		return <div className="container mx-auto p-4 text-center">Loading
			schedules...</div>;
	}

	if (error) {
		return <div className="container mx-auto p-4 text-center text-red-500">Error
			loading schedules: {error}</div>;
	}

	return (
		<div className="container mx-auto p-4 font-[family-name:var(--font-geist-sans)]">
			<header className="mb-8">
				<h1 className="text-4xl font-bold mb-4 text-center text-stone-800">
					Find Your Swim
				</h1>

				<div className="text-center mt-4">
					<Link href="/schedules" className="text-blue-600 hover:text-blue-800 underline">
						View Full Pool Schedules
					</Link>
				</div>
			</header>

			<FilterControls
				availablePrograms={availablePrograms}
				selectedPrograms={selectedPrograms}
				onProgramChange={handleProgramChange}
				availablePools={availablePools}
				selectedPools={selectedPools}
				onPoolChange={handlePoolChange}
				poolMetadata={poolMetadata}
			/>

			<ResultsList
				groupedAndSortedResults={groupedAndSortedResults}
				dayOrder={dayOrder}
				hasResults={hasResults}
			/>
		</div>
	);
}
