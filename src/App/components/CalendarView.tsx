import { useState, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, CalendarApi } from "@fullcalendar/core";

export function CalendarView() {
  const [currentView, setCurrentView] = useState<"dayGridMonth" | "timeGridWeek" | "timeGridDay">("timeGridDay");
  const calendarRef = useRef<FullCalendar>(null);

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    console.log("Selected date:", selectInfo);
    // You can add event creation logic here
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    console.log("Event clicked:", clickInfo);
  };

  const getCalendarApi = (): CalendarApi | null => {
    return calendarRef.current?.getApi() || null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-logseq-cyan-low-saturation-800/70">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              getCalendarApi()?.prev();
            }}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10 12 L6 8 L10 4" />
            </svg>
          </button>
          <button
            onClick={() => {
              getCalendarApi()?.next();
            }}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 text-gray-600 dark:text-logseq-cyan-low-saturation-300"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 4 L10 8 L6 12" />
            </svg>
          </button>
        </div>
        <button
          onClick={() => {
            getCalendarApi()?.today();
          }}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-logseq-cyan-low-saturation-800/50 text-gray-700 dark:text-logseq-cyan-low-saturation-300 hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70"
        >
          Today
        </button>
      </div>

      {/* View Switcher */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-logseq-cyan-low-saturation-800/70">
        <button
          onClick={() => {
            setCurrentView("timeGridDay");
            getCalendarApi()?.changeView("timeGridDay");
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
            currentView === "timeGridDay"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
          }`}
        >
          Day
        </button>
        <button
          onClick={() => {
            setCurrentView("timeGridWeek");
            getCalendarApi()?.changeView("timeGridWeek");
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
            currentView === "timeGridWeek"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
          }`}
        >
          Week
        </button>
        <button
          onClick={() => {
            setCurrentView("dayGridMonth");
            getCalendarApi()?.changeView("dayGridMonth");
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
            currentView === "dayGridMonth"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "text-gray-600 dark:text-logseq-cyan-low-saturation-400 hover:bg-gray-100 dark:hover:bg-logseq-cyan-low-saturation-800/50"
          }`}
        >
          Month
        </button>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-hidden p-4">
        <style>{`
          .fc {
            height: 100%;
            font-family: inherit;
          }
          .fc-header-toolbar {
            display: none;
          }
          .fc-theme-standard td,
          .fc-theme-standard th {
            border-color: rgb(229 231 235);
          }
          .dark .fc-theme-standard td,
          .dark .fc-theme-standard th {
            border-color: rgba(134, 239, 172, 0.1);
          }
          .fc-day-today {
            background-color: rgb(239 246 255) !important;
          }
          .dark .fc-day-today {
            background-color: rgba(59, 130, 246, 0.1) !important;
          }
          .fc-col-header-cell {
            background-color: transparent;
            padding: 8px 4px;
            font-weight: 500;
            color: rgb(55 65 81);
          }
          .dark .fc-col-header-cell {
            color: rgb(200, 210, 220);
          }
          .fc-daygrid-day-number,
          .fc-timegrid-slot-label {
            color: rgb(75 85 99);
          }
          .dark .fc-daygrid-day-number,
          .dark .fc-timegrid-slot-label {
            color: rgb(156 163 175);
          }
          .fc-button {
            background-color: rgb(59 130 246);
            border-color: rgb(37 99 235);
          }
          .fc-button:hover {
            background-color: rgb(37 99 235);
          }
          .fc-event {
            background-color: rgb(59 130 246);
            border-color: rgb(37 99 235);
          }
        `}</style>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={currentView}
          headerToolbar={false}
          height="100%"
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          events={[]}
          viewDidMount={(view: any) => {
            setCurrentView(view.view.type as "dayGridMonth" | "timeGridWeek" | "timeGridDay");
          }}
        />
      </div>
    </div>
  );
}
