"use client";

import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { completeTour } from "@/server/actions/shell";

// First visit walkthrough. Each step points at a data-tour attribute in the shell.
const STEPS: DriveStep[] = [
  { popover: { title: "Welcome to Spectrum HQ", description: "This is the one place for customers, quotes, installs, service and the company playbook. Here is a quick lap around the room. You can replay this any time from the help menu." } },
  { element: "[data-tour=my-day]", popover: { title: "My Day", description: "Start here every morning. Overdue and due today tasks, deals waiting on a next step, quotes waiting on a reply, and anything that needs your sign off." } },
  { element: "[data-tour=search]", popover: { title: "Search anything", description: "Press Ctrl K (or ⌘ K) to find a person, company, quote, ticket or SOP, or to create something new without leaving the page." } },
  { element: "[data-tour=contacts]", popover: { title: "Contacts and companies", description: "Every person and venue you work with. Open one to see the whole timeline: emails, calls, quotes, invoices, robots and tickets." } },
  { element: "[data-tour=deals]", popover: { title: "Deals", description: "Your pipeline as a board. Drag a deal between stages. Every deal must have a next step so nothing goes quiet." } },
  { element: "[data-tour=quotes]", popover: { title: "Quotes", description: "Build a quote from the catalog with purchase or monthly pricing. Discounts route to an owner for approval. Send, track views, and let the client accept online." } },
  { element: "[data-tour=tickets]", popover: { title: "Service and tickets", description: "Sites, deployed robots and support tickets with SLA timers. Clients can open tickets from their portal and they land here." } },
  { element: "[data-tour=sops]", popover: { title: "SOPs", description: "How we do things. Search by task, read the checklist, acknowledge the ones that apply to you. The help button on every page shows the SOPs for that screen." } },
  { element: "[data-tour=assistant]", popover: { title: "Assistant", description: "Ask in plain language. It reads your CRM, the SOP library, and your own email and calendar once connected. It drafts in your voice and never sends without you." } },
  { element: "[data-tour=help]", popover: { title: "Help is always here", description: "This button shows the SOPs for the page you are on and lets you replay this tour. That is it. Welcome aboard." } },
];

export function HqTour({ autoStart, tourKey = "hq" }: { autoStart: boolean; tourKey?: string }) {
  const started = useRef(false);
  useEffect(() => {
    const start = () => {
      const d = driver({
        showProgress: true,
        popoverClass: "spectrum-tour",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        steps: STEPS.filter((s) => !s.element || document.querySelector(s.element as string)),
        onDestroyed: () => {
          completeTour(tourKey).catch(() => null);
        },
      });
      d.drive();
    };
    const handler = () => start();
    window.addEventListener("hq:start-tour", handler);
    if (autoStart && !started.current) {
      started.current = true;
      const t = setTimeout(start, 700);
      return () => {
        clearTimeout(t);
        window.removeEventListener("hq:start-tour", handler);
      };
    }
    return () => window.removeEventListener("hq:start-tour", handler);
  }, [autoStart, tourKey]);
  return null;
}

export function startTour() {
  window.dispatchEvent(new Event("hq:start-tour"));
}
