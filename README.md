# SF Pools Schedule Viewer

This application helps users find and view schedules for various public swimming pools in San Francisco. It aggregates schedule information, allowing users to easily see what programs are available at different pools and times.

## Features

*   **Combined Schedule View**: See programs from multiple pools on a single page.
*   **Filter by Program Type**: Narrow down schedules by specific activities (e.g., Lap Swim, Water Polo, Family Swim).
*   **Filter by Pool**: Select one or more pools to see their specific offerings.
*   **Individual Pool Pages**: Each pool has its own dedicated page displaying its full schedule, linked directly from the main filter view.
*   **Responsive Design**: Access schedules easily on desktop or mobile devices.

(The schedule data is sourced from PDF files provided by SF Rec & Park, which are processed and collated into a central data source for this application.)

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
