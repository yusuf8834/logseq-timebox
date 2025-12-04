import { useRef, useCallback, useState } from "react";
import { CalendarView } from "./components/CalendarView";
import { updateSidebarWidth, getStoredSidebarWidth, getSidebarPosition, toggleSidebarPosition } from "../sidebar-stuff";

function App() {
  const isResizing = useRef(false);
  const [position, setPosition] = useState<"left" | "right">(getSidebarPosition());

  const handleTogglePosition = useCallback(() => {
    const newPosition = toggleSidebarPosition();
    setPosition(newPosition);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    
    const startX = e.clientX;
    const startWidth = getStoredSidebarWidth();

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // Dragging direction depends on position
      const delta = position === "left" 
        ? e.clientX - startX  // Dragging right increases width when on left
        : startX - e.clientX; // Dragging left increases width when on right
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
  }, [position]);

  return (
    <aside className="simple-sidebar-plugin text-gray-800 dark:text-logseq-cyan-low-saturation-100 h-screen flex [&_a]:text-blue-600 [&_a]:dark:text-logseq-cyan-300">
      {/* Resize handle on left when position is right */}
      {position === "right" && (
        <div
          onMouseDown={handleMouseDown}
          className="w-1 cursor-ew-resize hover:bg-blue-500 active:bg-blue-600 transition-colors flex-shrink-0"
          style={{ touchAction: "none" }}
        />
      )}
      <section className={`bg-white dark:bg-logseq-cyan-low-saturation-950 h-full ${position === "left" ? "border-r" : "border-l"} border-gray-200 dark:border-logseq-cyan-low-saturation-800/70 flex flex-col overflow-hidden flex-1`} style={{ boxShadow: "0 0 15px 0 rgba(0, 0, 0, 0.15)" }}>
        <CalendarView onTogglePosition={handleTogglePosition} position={position} />
      </section>
      {/* Resize handle on right when position is left */}
      {position === "left" && (
        <div
          onMouseDown={handleMouseDown}
          className="w-1 cursor-ew-resize hover:bg-blue-500 active:bg-blue-600 transition-colors flex-shrink-0"
          style={{ touchAction: "none" }}
        />
      )}
    </aside>
  );
}

export default App;

