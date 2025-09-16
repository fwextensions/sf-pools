## Product Requirements Document: SF Pools Schedule Viewer

**1. Introduction**

This document outlines the requirements for a TypeScript web application, "SF Pools Schedule Viewer," designed to provide a centralized, user-friendly, and easily searchable schedule of open times and programs for San Francisco public swimming pools. Currently, users must navigate to individual pool pages on the SF Rec & Park website and open PDF documents to find schedule information. This app aims to simplify this process by aggregating data from these PDFs into a single, interactive interface.

**2. Goals**

* Provide a single, comprehensive view of all SF public pool schedules.
* Enable users to quickly find out what programs are currently running or starting soon across all pools.
* Allow users to plan future pool visits by filtering schedules by day, time, and program type.
* Offer a more accessible and user-friendly alternative to navigating multiple web pages and PDF documents.
* Minimize manual data update efforts through automated or semi-automated data extraction.
* Creat a clean, modern, and responsive user interface.

**3. Target Users**

*   San Francisco residents looking for recreational swimming, lap swimming, lessons, or other aquatic programs.
*   Parents planning activities for their children.
*   Fitness enthusiasts seeking lap swimming opportunities.
*   Visitors to San Francisco looking for public pool access.

**4. Overall Architecture**

The application will be a Next.js web application.
*   **Frontend**: Built with Next.js (using the **App Router** paradigm), React v19, and TypeScript. Tailwind v4 CSS for styling.  Shadcn UI for components.
*   **Backend/API**: Next.js Route Handlers (within the `src/app/api/` directory) will handle requests, such as initiating PDF processing.
*   **PDF Processing**: A core TypeScript module (`src/lib/pdf-processor.ts`) will encapsulate the logic for sending PDF data to an LLM (e.g., Gemini 2.5 Pro via Vercel AI SDK) and parsing the structured schedule data.
*   **Data Storage**: Initially, processed schedules will be stored in a JSON file (`public/data/all_schedules.json`) bundled with the application. Future iterations might explore database solutions.
*   **Deployment**: Vercel is the preferred platform for deployment.
*   **Path Aliases**: The project utilizes path aliases (e.g., `@/lib/...`, `@/components/...`) for cleaner and more maintainable import statements, configured in `tsconfig.json`.

**5. Key Features & Use Cases**

*   **Use Case 1: "What's happening now/soon?"**
    *   **Description:** A user wants to go swimming in the next 0-2 hours and needs to see which pools are open and what programs are available.
    *   **Feature:** A default view or a prominent "Happening Now & Soon" section that displays:
        *   Current day and time.
        *   For each pool:
            *   Current program (if any) and its end time.
            *   Next upcoming program(s) within a configurable timeframe (e.g., next 2-3 hours).
            *   Indication if the pool is currently closed or opening soon.

*   **Use Case 2: "Planning a future swim."**
    *   **Description:** A user wants to find a specific program (e.g., "Lap Swim") on a particular day (e.g., "Sunday morning").
    *   **Feature:** A filterable schedule view where users can select:
        *   Day of the week (e.g., Monday, Tuesday, All Week).
        *   Time of day (e.g., Morning, Afternoon, Evening, or specific time range).
        *   Program type (e.g., Lap Swim, Recreational Swim, Water Aerobics, Lessons - *list to be populated from actual PDF data*).
        *   Specific pool(s).
    *   The view should update to show matching programs, times, and pools.

*   **Use Case 3: "Viewing a specific pool's full schedule."**
    *   **Description:** A user is interested in a particular pool and wants to see its complete schedule for the week.
    *   **Feature:** Ability to select a single pool and view its full weekly schedule, clearly laid out.

*   **Use Case 4: "Advanced Program Discovery & Planning"**
    *   **Description:** A user wants to find all occurrences of a specific program (e.g., "Lap Swim") across several preferred pools, on any day, to see all their options.
    *   **Feature:** A homepage interface allowing users to:
        *   Select one or more program types (e.g., Lap Swim, Recreational Swim).
        *   Select one or more pools to include in their search.
        *   View a consolidated list of all matching program sessions, grouped by day of the week and then sorted by time, indicating the pool for each session.

**6. Key Features & Milestones**

### Milestone 1: Proof of Concept - Single PDF Processing & Basic Display
- [ ] Setup Next.js project with TypeScript and Tailwind CSS.
- [ ] Develop an API endpoint (`src/app/api/extract-schedule/route.ts`) that takes a predefined PDF (`MLK_Pool_Schedule.pdf`) as input.
- [ ] Integrate with Vercel AI SDK to send the PDF content (as base64 or direct file buffer) to a multimodal LLM (e.g., Gemini 2.5 Pro).
- [ ] Define a Zod schema for the expected structured schedule data (Pool Name, Address, Last Updated, Programs with Day/Time/Notes, SF Rec Park URL).
- [ ] Parse the LLM's response and validate it against the Zod schema.
- [ ] Store the extracted, structured data into a local JSON file (`public/data/all_schedules.json`).
- [ ] Create a basic Next.js page (`src/app/schedules/page.tsx`) to display the structured schedule data from the JSON file.
- [ ] **Refactor initial `pages` directory structure to Next.js App Router (`src/app`).**
- [ ] **Implement path aliases (e.g., `@/lib/...`) for cleaner imports.**
- [ ] **Update PDF Processor to extract `scheduleSeason`, `scheduleStartDate`, `scheduleEndDate`, and `lanes`.**
- [ ] **Update `schedules/page.tsx` to display new schedule fields and lane information.**

### Milestone 2: Automated Multi-PDF Data Pipeline & Enhanced Schedule Display
- [ ] **Develop web scraper (`scripts/scrape-pool-info.ts`):**
    - [ ] Scrape SF Rec & Park website for individual pool page URLs.
    - [ ] For each pool page, identify and extract the direct link to its latest PDF schedule based on link text and URL patterns (e.g., `/DocumentCenter/View/`).
    - [ ] Save discovered pool info (name, page URL, PDF URL) to `public/data/discovered_pool_schedules.json`.
- [ ] **Develop PDF downloader script (`scripts/downloadPdf.ts`):**
    - [ ] Read `public/data/discovered_pool_schedules.json`.
    - [ ] Download each PDF schedule into `public/data/pdfs/`, using a sanitized pool name for the filename.
- [ ] **Enhance `scripts/process-all-pdfs.ts`:**
    - [ ] Iterate through all PDF files in `public/data/pdfs/`.
    - [ ] For each PDF, call the extraction logic from `src/lib/pdf-processor.ts`.
    - [ ] Consolidate all extracted schedules into `public/data/all_schedules.json`.
- [ ] **Enhance `src/app/schedules/page.tsx`:**
    - [ ] Display schedules for all processed pools from `all_schedules.json`.
    - [ ] Refine UI/styling for clarity and improved aesthetics (e.g., updated color palette).

### Milestone 3: Interactive Program Filtering & Homepage
- [ ] **Develop Homepage (`src/app/page.tsx`) with Program Filtering UI:**
    - [ ] Design and implement UI elements for selecting:
        - One or more program types (e.g., "Lap Swim", "Family Swim" - dynamically populated from `all_schedules.json`).
        - One or more pools (dynamically populated).
    - [ ] Implement client-side or server-side logic to filter schedules from `all_schedules.json` based on user selections.
    - [ ] Display filtered results clearly, showing:
        - Program name, pool name, day of the week, start time, end time.
        - Group results by Day of the Week.
        - Sort results within each day by Start Time.
    - [ ] Ensure the interface is responsive and user-friendly.
- [ ] **Provide a clear link/navigation from the Homepage to the full schedules view (`/schedules`).**

**7. Data Requirements**

*   **Source Data:** PDF schedules linked from the SF Rec & Park website (e.g., [https://sfrecpark.org/482/Swimming-Pools](https://sfrecpark.org/482/Swimming-Pools)).
*   **Data to Extract per Program Entry:**
    *   Pool Name
    *   Program Name (e.g., "Lap Swim," "Family Swim," "Water Polo")
    *   Day of the Week (e.g., Monday, Tuesday, etc.)
    *   Start Time
    *   End Time
    *   Any specific notes associated with the program (e.g., "Adults Only," "Requires Sign-up").
*   **Data Structure (JSON Example):**

```json
[
  {
    "poolName": "Martin Luther King Jr. Pool",
    "address": "5701 Third St, San Francisco, CA 94124", // Potentially scrape from pool page
    "sfRecParkUrl": "https://sfrecpark.org/Facilities/Facility/Details/Martin-Luther-King-Jr-Pool-216",
    "pdfScheduleUrl": "https://sfrecpark.org/DocumentCenter/View/25795", // May change, needs dynamic fetching
    "scheduleLastUpdated": "YYYY-MM-DD", // Date PDF was processed
    "scheduleSeason": "Spring",
    "scheduleStartDate": "YYYY-MM-DD",
    "scheduleEndDate": "YYYY-MM-DD",
    "lanes": 8,
    "programs": [
      {
        "programName": "Lap Swim",
        "dayOfWeek": "Monday",
        "startTime": "07:00", // 24-hour format
        "endTime": "09:00",
        "notes": "All lanes available"
      },
      // ... more programs
    ]
  },
  // ... more pools
]
```

*   **Data Update Frequency:** Schedules change seasonally (every few months). The app should have a mechanism to trigger or perform data re-extraction. Initially, this can be a manual trigger for the serverless function, with the potential for scheduled automation later.

**8. Design & UX Considerations (High-Level)**

*   **Mobile-first responsive design:** Accessible and usable on various screen sizes.
*   **Clear visual hierarchy:** Easy to scan and understand schedule information.
*   **Intuitive filters:** Simple and effective filtering controls.
*   **Performance:** Fast loading times, especially for the initial schedule display.
*   **Accessibility:** Adherence to WCAG guidelines.

**9. Directory Structure (Illustrative - Adapting to App Router)**

```
sf-pools/
├── public/
│   ├── data/
│   │   └── all_schedules.json  # Stores consolidated schedule data
│   └── ...                     # Other static assets (images, fonts)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── extract-schedule/
│   │   │       └── route.ts    # API endpoint for PDF extraction
│   │   ├── schedules/
│   │   │   └── page.tsx        # Page to display schedules
│   │   ├── layout.tsx          # Root layout for the App Router
│   │   ├── page.tsx            # Homepage (e.g., links to schedules) -> **Will contain program filtering UI**
│   │   └── globals.css         # Global styles
│   ├── components/             # Reusable React components (e.g., Navbar, Footer, ScheduleCard, FilterControls)
│   ├── lib/
│   │   └── pdf-processor.ts    # Core PDF processing logic, Zod schemas, types
│   └── ...                     # Other potential src directories (e.g., hooks, types, utils)
├── data/
│   └── pdfs/                   # Directory for storing input PDF files
│       └── MLK_Pool_Schedule.pdf
```

**10. Non-Functional Requirements**

*   **Performance:** Pages should load quickly. Filtering actions should feel responsive.
*   **Reliability:** Data displayed should be accurate based on the latest processed PDFs. The data extraction process should be resilient to minor PDF format changes if possible, or fail gracefully with logs.
*   **Maintainability:** Code should be well-organized, commented, and easy to update.
*   **Scalability:** While initial scale is small (9 pools), the data extraction process should be designed to potentially handle more pools or more complex schedules if SF Rec & Park expands. Serverless functions will aid scalability.
*   **Usability:** The application should be intuitive and easy to use for non-technical users.
*   **Accessibility:** Adhere to WCAG 2.1 Level AA guidelines where feasible.

**11. Future Considerations & Potential Enhancements**

*   **Automated Schedule Re-fetching:** Implement a cron job or scheduled task (e.g., using Vercel Cron Jobs or GitHub Actions) to periodically re-run the scraping and PDF processing pipeline to keep schedules up-to-date.
*   **User Accounts & Preferences:** Allow users to save favorite pools or program types.
*   **Map Integration:** Display pool locations on a map.
*   **Notifications:** Alert users to schedule changes for their favorite programs/pools.
*   **Improved Error Reporting/Handling:** More robust logging and user-facing messages for issues during data extraction or display.
*   **Advanced Filtering/Sorting Options:** E.g., filter by time of day, duration, specific amenities if that data becomes available.
*   **Direct Link to PDF:** For each pool or schedule, provide a direct link back to the source PDF for user verification.
*   **Program Name Normalization & Refinement:**
    *   **Goal:** To standardize the various program names extracted from PDFs into a cleaner, more consistent, and user-friendly set of filterable categories on the homepage.
    *   **Current Challenge:** Raw program names extracted by the LLM can have many slight variations for the same core activity (e.g., "Adult Lessons", "Adult Swim Lessons", "Adult Adv. Swim Lessons").
    *   **Suggested Grouped Program Names for Filtering:**
        *   Adult Swim Lessons
        *   Adult Synchronized Swimming
        *   Adult Water Polo
        *   Family Swim
        *   High School Swim Programs
        *   Lap Swim
        *   Masters Swim Program
        *   Parent & Child Swim
        *   Swim Lessons (General/Youth/Community)
        *   Senior Swim / Therapy Swim
        *   Water Exercise
        *   Youth Swim Teams / Club Teams
        *   Youth Synchronized Swimming
        *   Pool Closure / Staff & Departmental Use
        *   Special Olympics (Keep as distinct category)
    *   **Potential Approaches:**
        1.  **Post-Extraction Mapping Logic:** Implement a function (e.g., in `src/lib/pdf-processor.ts` after LLM extraction, or on the client-side in `src/app/page.tsx`) that maps the raw extracted names to these standardized group names. This could use a mapping object or conditional logic.
        2.  **LLM Prompt Refinement:** Further refine the LLM prompt in `src/lib/pdf-processor.ts` to instruct the model to use these canonical program names during the extraction process. This might involve providing the list of preferred names as part of the prompt's context or few-shot examples.
        3.  **Handling Combined Sessions:** Develop a strategy for program names that represent combined activities (e.g., "Family / Lap Swim"). This could involve treating them as a distinct combined category, mapping them to multiple individual categories for filtering, or attempting to have the LLM split them into separate entries.

**12. Open Questions & Risks**

*   **Availability and Cost of Multimodal LLMs via Vercel AI SDK:** Confirming that a suitable multimodal LLM capable of direct PDF processing is available, performant, and cost-effective through the Vercel AI SDK is crucial. *Mitigation: Early investigation into Vercel AI SDK's supported models and their capabilities/pricing for PDF processing.* 
*   **PDF Text Quality & LLM Input (Fallback Scenario):** If falling back to text extraction, the quality of this extracted text remains critical for the LLM's success. Garbled text was the initial problem. *Mitigation (for fallback): Evaluate different text extraction methods. Implement pre-processing steps to clean text. Assess the chosen LLM's ability to handle imperfect text.* 
*   **LLM Prompt Robustness:** Developing prompts that work reliably across different PDF layouts (for multimodal) or textual variations (for text-based input) will be challenging. *Mitigation: Iterative prompt development and testing with diverse PDF examples. Consider a multi-stage prompting strategy if necessary.* 
*   **Consistency and Reliability of LLM Output:** LLMs can sometimes produce unexpected or inconsistent output. *Mitigation: Implement strong validation rules for the LLM's output. Develop a schema for the expected JSON and reject/flag responses that don't conform. Implement retry mechanisms. Log problematic LLM responses for review.* 
*   **Program Name Normalization:** Program names might have slight variations. Will these need to be normalized for consistent filtering? *Decision: Yes, likely need a normalization step post-LLM extraction, or instruct the LLM to normalize.* 
*   **Complexity of Schedules:** Some schedules might have complex rules, alternating weeks, or footnotes. *Mitigation: Focus LLM prompting on common cases. For very complex entries, the LLM might need specific instructions or it might fail; these failures should be logged for manual review or to refine prompts.* 
*   **Rate Limiting/Blocking (PDF Fetching):** Will the sfrecpark.org site block or rate-limit automated fetching of PDFs? *Mitigation: Fetch respectfully (e.g., with appropriate user agent, not too frequently). Cache PDFs effectively.*
*   **Cost of LLM Usage:** API calls to LLMs have associated costs. Processing many PDFs, especially if they are long or require multiple interactions, could become expensive. *Mitigation: Optimize prompts for efficiency. Cache LLM responses where appropriate (e.g., if the PDF content hasn't changed). Estimate costs based on typical PDF length and number of pools. Explore Vercel AI SDK features for cost management.* 
*   **Effort for LLM Integration and Prompt Engineering:** The effort to integrate with the Vercel AI SDK, develop effective prompts, and handle LLM responses (including validation and error handling) could be significant. *(This replaces the previous core technical challenge of PDF parser generalization).*
*   **Definition of "Program Types":** Should the list of filterable program types be manually curated or entirely derived from the data? (Derived is better for maintenance but might be messy initially). *Decision: Instruct the LLM to categorize or extract program types, then potentially add a curation/aliasing layer if needed.* 
*   **Time Zone Handling:** Ensure all times are handled correctly, assuming SF local time (Pacific Time). *Mitigation: Ensure LLM is prompted to return times in a consistent format, ideally UTC or with timezone information, and handle conversions appropriately in the application.*

This PRD provides a detailed guide for an engineer to build the SF Pools Schedule Viewer. The milestones are designed to deliver value incrementally and tackle the riskiest parts (LLM integration and prompt engineering) early on.
