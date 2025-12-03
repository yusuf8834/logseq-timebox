function App() {
  return (
    <aside className="simple-sidebar-plugin text-gray-800 dark:text-logseq-cyan-low-saturation-100 h-screen flex [&_a]:text-blue-600 [&_a]:dark:text-logseq-cyan-300">
      <section className="bg-white dark:bg-logseq-cyan-low-saturation-950 shadow-lg h-full border-l border-gray-200 dark:border-logseq-cyan-low-saturation-800/70 flex flex-col overflow-hidden flex-1">
        <div className="flex-1 p-4">
          <h1 className="text-xl font-semibold mb-4 text-gray-900 dark:text-logseq-cyan-low-saturation-100">
            Simple Sidebar
          </h1>
          <p className="text-gray-600 dark:text-logseq-cyan-low-saturation-300">
            This is a simple Logseq sidebar plugin. Click the sidebar icon in the toolbar to toggle this sidebar.
          </p>
        </div>
      </section>
    </aside>
  );
}

export default App;

