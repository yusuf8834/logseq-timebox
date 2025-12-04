import { CalendarView } from "./components/CalendarView";

function App() {
  return (
    <aside className="simple-sidebar-plugin text-gray-800 dark:text-logseq-cyan-low-saturation-100 h-screen flex [&_a]:text-blue-600 [&_a]:dark:text-logseq-cyan-300">
      <section className="bg-white dark:bg-logseq-cyan-low-saturation-950 shadow-lg h-full border-l border-gray-200 dark:border-logseq-cyan-low-saturation-800/70 flex flex-col overflow-hidden flex-1">
        <CalendarView />
      </section>
    </aside>
  );
}

export default App;

