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

The application will be a Next.js web app.
*   **Frontend:** React components built with TypeScript for displaying schedules and filtering options.
*   **Backend (Data Processing):** Next.js API routes (serverless functions) will be used for:
    * Periodically fetching the list of pools and their respective PDF schedule URLs.
    * Downloading the PDF schedules.
    * **Processing PDF content for LLM processing. The primary and successful approach implemented is:**
        *   **Leveraging a multimodal LLM (`gpt-4o` via the Vercel AI SDK) that directly processes the PDF file (`type: "file"` in message content). This allows the LLM to use visual and layout information for higher accuracy in data extraction.**
    * **~~As a fallback or alternative (if direct PDF processing by a suitable multimodal LLM is not feasible or optimal):~~**
        *   **~~Raw text will be extracted from the PDFs (e.g., using `pdf-parse` or a similar library). This text, even if imperfect, will serve as the input for the LLM.~~** (This path was explored but direct PDF processing proved more effective for the initial PoC.)
    * **Sending the PDF file directly to an LLM via the Vercel AI SDK for structured schedule data extraction.**
    * Transforming the LLM-extracted data into a structured JSON format.
    * Target Node v23+ for the server code. 
*   **Data Storage:** Extracted and processed schedule data will be stored in JSON files committed to the project repository or served as static assets. Given the infrequent updates (every few months), a database is not immediately necessary.
*   **Deployment:** Vercel or a similar platform that supports Next.js deployments and serverless functions.

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

**6. Data Requirements**

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

**7. Design & UX Considerations (High-Level)**

*   **Mobile-first responsive design:** Accessible and usable on various screen sizes.
*   **Clear visual hierarchy:** Easy to scan and understand schedule information.
*   **Intuitive filters:** Simple and effective filtering controls.
*   **Performance:** Fast loading times, especially for the initial schedule display.
*   **Accessibility:** Adherence to WCAG guidelines.

**8. Milestones**

**Milestone 1: Single Pool Proof of Concept (Data Extraction & Basic Display) - COMPLETED**

*   **Goal:** **Successfully extracted** schedule data from *one* pool's PDF (`MLK_Pool_Schedule.pdf`) **by sending the PDF file directly to a multimodal LLM (`gpt-4o`) via the Vercel AI SDK.** The extracted data is returned as structured JSON from a Next.js API endpoint.
*   **Tasks Accomplished:**
    1.  Set up Next.js project with TypeScript.
    2.  Developed a Next.js API route (`/api/extract-schedule`) to load a single pool's PDF schedule (MLK Pool).
    3.  **Successfully implemented sending the PDF file directly to `gpt-4o` using the Vercel AI SDK's `generateObject` function (with `type: "file"` in the message content) for data extraction. This was the preferred method and proved effective.**
    4.  ~~As a fallback, or for comparison, implement raw text extraction from the PDF (e.g., using `pdf-parse`). Develop a clear prompt to send this extracted text to an LLM (which could be a text-only or multimodal model) for data extraction.~~ (Explored text extraction using `pdf-parse`, but encountered challenges and limitations. Direct PDF processing was ultimately successful and yielded better results for the PoC.)
    5.  Manually defined the structure of the JSON output (Zod schema `PoolScheduleSchema`) for the extracted data.
    6.  The LLM-returned data is directly transformed into the defined JSON structure by the Vercel AI SDK's `generateObject` function.
    7.  The Next.js API route returns this JSON data.
    8.  The API response includes debug information such as the LLM model used, prompt text, and PDF file details.
*   **Deliverable:** A functional Next.js API endpoint (`/api/extract-schedule`) that processes `MLK_Pool_Schedule.pdf` using direct LLM input and returns structured schedule data as JSON. The approach effectively uses the Vercel AI SDK with `gpt-4o`.

**Milestone 2: All Pools Data Extraction & Consolidated Static Display**

*   **Goal:** Extend LLM-based data extraction to all SF public pools and display their schedules in a basic consolidated view, **leveraging the successful direct PDF processing approach with a multimodal LLM established in Milestone 1.**
*   **Tasks:**
    1.  Identify the list of all SF public pools and their individual page URLs from [https://sfrecpark.org/482/Swimming-Pools](https://sfrecpark.org/482/Swimming-Pools).
    2.  Develop a script/API route to:
        *   Scrape the individual pool pages to find the links to their PDF schedules. *This needs to be robust to minor page structure changes.*
        *   Download all identified PDF schedules.
        *   **Prepare all downloaded PDFs for LLM processing using the direct PDF input method (`type: "file"`) successfully demonstrated in Milestone 1.**
    3.  **Refine and generalize the LLM prompting strategy and data handling logic from Milestone 1 to accommodate variations across different pools. Focus on maintaining consistency and accuracy of LLM extraction.**
    4.  Consolidate extracted data from all pools into a single JSON file or multiple JSON files (e.g., one per pool, then an aggregator).
    5.  Create a Next.js page that displays a list of all pools.
    6.  Allow users to click on a pool name to view its full schedule (similar to Milestone 1 display, but now data-driven for any pool).
    7.  (Optional) Create a very basic "All Programs Today" view without advanced filtering.
*   **Deliverable:** A Next.js application that can process PDFs from all 9 pools, store their data in JSON, and display individual pool schedules. A basic script/API route to trigger the data refresh.

**Milestone 3: "What's Open Now?" Feature & UI Enhancements**

*   **Goal:** Implement the "What's open now/soon?" feature and improve the overall UI/UX.
*   **Tasks:**
    1.  Design and implement the UI for the "Happening Now & Soon" view.
    2.  Implement logic to:
        *   Determine the current day and time.
        *   Filter the consolidated JSON data to show programs currently active.
        *   Filter the consolidated JSON data to show programs starting in the next X hours (e.g., 2 hours).
    3.  Display pool status (Open, Closed, Opening Soon with time).
    4.  Refine the visual presentation of schedules (e.g., using cards, better typography, clear time blocks).
    5.  Ensure the main view is intuitive and highlights the "Happening Now & Soon" information effectively.
*   **Deliverable:** A user-friendly interface displaying current and upcoming programs across all pools.

**Milestone 4: Advanced Filtering & Future Planning View**

*   **Goal:** Implement robust filtering capabilities for planning future pool visits.
*   **Tasks:**
    1.  Design and implement UI for filtering options:
        *   Day of the week selector.
        *   Time of day selector/slider.
        *   Program type dropdown (dynamically populated from unique program names found in the data).
        *   Pool selector (checkboxes or multi-select dropdown).
    2.  Implement filtering logic on the frontend to dynamically update the displayed schedule based on selected filter criteria.
    3.  Ensure filter states are manageable (e.g., clear filters button).
    4.  Optimize performance for filtering large datasets if necessary (though with 9 pools, this should be manageable on the client side).
*   **Deliverable:** A fully filterable schedule view allowing users to plan future activities.

**Milestone 5: Data Update Automation, Polish & Deployment**

*   **Goal:** Automate the data update process, polish the application, and deploy it.
*   **Tasks:**
    1.  Refine the data extraction and processing scripts (now running as Next.js API routes/serverless functions).
    2.  Implement error handling and logging for the data extraction process.
    3.  Set up a mechanism to trigger the data update process.
        *   Option 1 (Simpler): A secured API endpoint that can be manually triggered by an admin.
        *   Option 2 (Advanced): A scheduled job (e.g., GitHub Action cron, Vercel Cron Job) that calls the update API route periodically (e.g., weekly or monthly).
    4.  Thoroughly test the application across different browsers and devices.
    5.  Conduct final UI/UX review and make necessary polishes.
    6.  Add basic information like an "About" section, link to SF Rec & Park, and data source disclaimers.
    7.  Deploy the application to Vercel (or chosen platform).
    8.  Set up monitoring for the live application and data update process.
*   **Deliverable:** A deployed, polished, and maintainable web application with a semi-automated or fully automated data update pipeline.

**9. Non-Functional Requirements**

*   **Performance:** Pages should load quickly. Filtering actions should feel responsive.
*   **Reliability:** Data displayed should be accurate based on the latest processed PDFs. The data extraction process should be resilient to minor PDF format changes if possible, or fail gracefully with logs.
*   **Maintainability:** Code should be well-organized, commented, and easy to update.
*   **Scalability:** While initial scale is small (9 pools), the data extraction process should be designed to potentially handle more pools or more complex schedules if SF Rec & Park expands. Serverless functions will aid scalability.
*   **Usability:** The application should be intuitive and easy to use for non-technical users.
*   **Accessibility:** Adhere to WCAG 2.1 Level AA guidelines where feasible.

**10. Future Considerations (Out of Scope for Initial Version)**

*   User accounts/favorites.
*   Notifications for schedule changes for favorited pools/programs.
*   Map view of pools.
*   Direct links to SF Rec & Park registration pages for programs requiring signup (if identifiable).
*   Community features (e.g., user-reported occupancy, reviews).
*   **Exploring different LLMs, fine-tuning models, or advanced prompting techniques for improved accuracy, consistency, or cost-effectiveness of data extraction.**
*   Direct API integration if SF Rec & Park ever provides one.

**11. Open Questions & Risks**

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
