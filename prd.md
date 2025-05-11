## Product Requirements Document: SF Pools Schedule Viewer

**1. Introduction**

This document outlines the requirements for a TypeScript web application, "SF Pools Schedule Viewer," designed to provide a centralized, user-friendly, and easily searchable schedule of open times and programs for San Francisco public swimming pools. Currently, users must navigate to individual pool pages on the SF Rec & Park website and open PDF documents to find schedule information. This app aims to simplify this process by aggregating data from these PDFs into a single, interactive interface.

**2. Goals**

*   Provide a single, comprehensive view of all SF public pool schedules.
*   Enable users to quickly find out what programs are currently running or starting soon across all pools.
*   Allow users to plan future pool visits by filtering schedules by day, time, and program type.
*   Offer a more accessible and user-friendly alternative to navigating multiple web pages and PDF documents.
*   Minimize manual data update efforts through automated or semi-automated data extraction.

**3. Target Users**

*   San Francisco residents looking for recreational swimming, lap swimming, lessons, or other aquatic programs.
*   Parents planning activities for their children.
*   Fitness enthusiasts seeking lap swimming opportunities.
*   Visitors to San Francisco looking for public pool access.

**4. Overall Architecture**

The application will be a Next.js web application.
*   **Frontend**: Built with Next.js (using the **App Router** paradigm), React, and TypeScript. Tailwind CSS for styling.
*   **Backend/API**: Next.js Route Handlers (within the `src/app/api/` directory) will handle requests, such as initiating PDF processing.
*   **PDF Processing**: A core TypeScript module (`src/lib/pdf-processor.ts`) will encapsulate the logic for sending PDF data to an LLM (e.g., OpenAI GPT-4o via Vercel AI SDK) and parsing the structured schedule data.
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

**6. Key Features & Milestones**

### Milestone 1: Proof of Concept - Single PDF Processing & Basic Display (Complete)
- [x] Setup Next.js project with TypeScript and Tailwind CSS.
- [x] Develop an API endpoint (`src/app/api/extract-schedule/route.ts`) that takes a predefined PDF (`MLK_Pool_Schedule.pdf`) as input.
- [x] Integrate with Vercel AI SDK to send the PDF content (as base64 or direct file buffer) to an OpenAI model (e.g., GPT-4o).
- [x] Define a Zod schema for the expected structured schedule data (Pool Name, Address, Last Updated, Programs with Day/Time/Notes, SF Rec Park URL).
- [x] Parse the LLM's response and validate it against the Zod schema.
- [x] Store the extracted, structured data into a local JSON file (`public/data/all_schedules.json`).
- [x] Create a basic Next.js page (`src/app/schedules/page.tsx`) to display the structured schedule data from the JSON file.
- [x] **Refactor initial `pages` directory structure to Next.js App Router (`src/app`). (Completed)**
- [x] **Implement path aliases (e.g., `@/lib/...`) for cleaner imports. (Completed)**

### Milestone 2: Multi-PDF Processing & Enhanced UI
- [ ] Create a script (`scripts/process-all-pdfs.ts`) that iterates through all PDF files in a designated directory (`data/pdfs/`).
    - For each PDF, call the extraction logic from `src/lib/pdf-processor.ts`.
- [ ] Enhance the `src/app/schedules/page.tsx` to better display multiple pool schedules.

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
│   │   ├── page.tsx            # Homepage (e.g., links to schedules)
│   │   └── globals.css         # Global styles
│   ├── components/             # Reusable React components (e.g., Navbar, Footer, ScheduleCard)
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

**11. Future Considerations (Out of Scope for Initial Version)**

*   User accounts/favorites.
*   Notifications for schedule changes for favorited pools/programs.
*   Map view of pools.
*   Direct links to SF Rec & Park registration pages for programs requiring signup (if identifiable).
*   Community features (e.g., user-reported occupancy, reviews).
*   **Exploring different LLMs, fine-tuning models, or advanced prompting techniques for improved accuracy, consistency, or cost-effectiveness of data extraction.**
*   Direct API integration if SF Rec & Park ever provides one.

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
