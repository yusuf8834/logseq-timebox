import { useRef, useCallback, useState } from "react";
import { CalendarView } from "./components/CalendarView";
import { updateSidebarWidth, getStoredSidebarWidth, getSidebarPosition, toggleSidebarPosition } from "../sidebar-stuff";

function App() {
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const [position, setPosition] = useState<"left" | "right">(getSidebarPosition());

  const handleTogglePosition = useCallback(() => {
    const newPosition = toggleSidebarPosition();
    setPosition(newPosition);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = getStoredSidebarWidth();
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing.current) return;
    const delta = position === "left"
      ? e.clientX - resizeStartX.current
      : resizeStartX.current - e.clientX;
    const newWidth = resizeStartWidth.current + delta;
    updateSidebarWidth(newWidth);
  }, [position]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing.current) return;
    isResizing.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  return (
    <aside className="simple-sidebar-plugin text-gray-800 h-screen flex [&_a]:text-blue-600">
      {/* Resize handle on left when position is right */}
      {position === "right" && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-1 cursor-ew-resize hover:bg-blue-500 active:bg-blue-600 transition-colors flex-shrink-0"
          style={{ touchAction: "none", userSelect: "none" }}
        />
      )}
      <section className={`bg-white h-full ${position === "left" ? "border-r" : "border-l"} border-gray-200 flex flex-col overflow-hidden flex-1`} style={{ boxShadow: "0 0 15px 0 rgba(0, 0, 0, 0.15)" }}>
        <CalendarView onTogglePosition={handleTogglePosition} position={position} />
      </section>
      {/* Resize handle on right when position is left */}
      {position === "left" && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-1 cursor-ew-resize hover:bg-blue-500 active:bg-blue-600 transition-colors flex-shrink-0"
          style={{ touchAction: "none", userSelect: "none" }}
        />
      )}
    </aside>
  );
}

export default App;
