export default function HomePage() {
	return (
		<main className="container py-12">
			<h1 className="text-3xl font-semibold">SF Pools Schedule Viewer</h1>
			<p className="mt-2 text-slate-600">
				browse consolidated schedules for san francisco public pools.
			</p>

			<div className="mt-6">
				<a
					href="/schedules"
					className="inline-flex items-center rounded border border-slate-300 bg-white px-4 py-2 text-slate-800 shadow-sm hover:bg-slate-50"
				>
					View schedules
				</a>
			</div>
		</main>
	);
}
