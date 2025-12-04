import { useRef, useCallback } from "react";
import { CalendarView } from "./components/CalendarView";
import { updateSidebarWidth, getStoredSidebarWidth } from "../sidebar-stuff";

function App() {
  const isResizing = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    
    const startX = e.clientX;
    const startWidth = getStoredSidebarWidth();

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // Dragging left increases width (since sidebar is on right)
      const delta = startX - e.clientX;
      const newWidth = startWidth + delta;
      updateSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  return (
    <aside className="simple-sidebar-plugin text-gray-800 dark:text-logseq-cyan-low-saturation-100 h-screen flex [&_a]:text-blue-600 [&_a]:dark:text-logseq-cyan-300">
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 cursor-ew-resize hover:bg-blue-500 active:bg-blue-600 transition-colors flex-shrink-0"
        style={{ touchAction: "none" }}
      />
      <section className="bg-white dark:bg-logseq-cyan-low-saturation-950 shadow-lg h-full border-l border-gray-200 dark:border-logseq-cyan-low-saturation-800/70 flex flex-col overflow-hidden flex-1">
        <CalendarView />
      </section>
    </aside>
  );
}

export default App;

