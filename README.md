# Logseq Timebox

A calendar sidebar plugin for Logseq that lets you visualize and manage your scheduled tasks in a timebox-style calendar view.

![Timebox Overview](screenshots/overview.png)

## Features

- 📅 **Day/Week/Month Views** - Switch between different calendar views to plan your time
- 🖱️ **Drag & Drop** - Move tasks by dragging them to a new time slot
- ⏱️ **Resize Events** - Adjust task duration by dragging the edges
- 🔄 **Recurring Tasks** - Full support for Logseq's repeater patterns (`++1w`, `.+1d`, etc.)
- ➕ **Quick Create** - Click or drag on the calendar to create new scheduled tasks
- 🗑️ **Clear Schedule** - Remove scheduling from tasks with one click
- ↔️ **Resizable Sidebar** - Drag to adjust the sidebar width
- 🔀 **Left/Right Position** - Toggle sidebar position

## Coming Soon

- 🌙 **Dark Mode** - Seamless integration with Logseq's theme

## Screenshots

### General
![Day View](screenshots/general.png)


## Installation

### From Logseq Marketplace (Recommended)
1. Open Logseq
2. Go to `...` → `Plugins` → `Marketplace`
3. Search for "Timebox"
4. Click `Install`

### Manual Installation
1. Download the latest release from [Releases](https://github.com/yourusername/logseq-timebox/releases)
2. Unzip the file
3. In Logseq, go to `...` → `Plugins` → `Load unpacked plugin`
4. Select the unzipped folder

## Usage

1. Click the calendar icon in the toolbar to open the sidebar
2. **Create tasks**: Click on a time slot or drag to select a time range
3. **Move tasks**: Drag and drop events to reschedule
4. **Resize tasks**: Drag the bottom edge of an event to change duration
5. **Clear schedule**: Hover over an event and click the X button
6. **Navigate**: Use the arrow buttons or "Today" to navigate dates

## Task Format

The plugin works with Logseq's native scheduling format:

```
TODO My task [d:1h30m]
SCHEDULED: <2025-12-04 Thu 09:00>
```

- `[d:1h30m]` - Duration token (optional, auto-generated when you resize)
- Supports all task markers: `TODO`, `DOING`, `NOW`, `LATER`, `WAITING`, `DONE`, `CANCELED`
- Preserves repeater patterns: `++1w`, `.+1d`, `+1m`, etc.

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
