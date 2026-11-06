// Every page used to inherit the root title, so all 41 of them announced as
// "Vantage Career Accelerator CRM". A screen reader user moving between tabs
// could not tell them apart, which fails WCAG 2.4.2 (Page Titled, Level A).
// These pages are client components, so the title lives in a layout.
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Event registration · Vantage Career Accelerator" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
