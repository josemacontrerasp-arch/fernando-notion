# Fernando Notion

A Notion-style workspace for **notes, projects, calendars and agendas** — as a desktop app.
Everything you write is **saved automatically on your computer**, as you type. No account, no cloud, no save button.

![Home with today's agenda](docs/home.png)

| Pages & block editor | Project board |
| --- | --- |
| ![Page](docs/page.png) | ![Board](docs/board.png) |

![Calendar with every database](docs/calendar.png)

---

## Download & install

Everything is on the **[latest release page](../../releases/latest)**.

### Mac

1. Download the `.dmg` for your Mac:
   - **Apple chip** (M1, M2, M3, M4…): `Fernando-Notion-…-mac-arm64.dmg`
   - **Intel chip**: `Fernando-Notion-…-mac-x64.dmg`

   Not sure? Apple menu  → **About This Mac**: “Chip: Apple M…” = Apple chip, “Processor: Intel…” = Intel.
2. Open the `.dmg` and drag **Fernando Notion** into **Applications**.
3. **First launch only** — the app isn't from the App Store, so macOS asks you to confirm it:
   - Open Fernando Notion from Applications. When macOS says it can't verify the app, click **Done**.
   - Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to
     *“Fernando Notion” was blocked*, then confirm with your password.
   - (macOS 14 or older: right-click the app → **Open** → **Open**.)
4. If it asks to access your **Documents** folder, click **Allow** — that's where your pages are saved.

From then on it opens normally (Dock, Launchpad, Spotlight). If macOS ever says the app *“is damaged”*, run this once in Terminal and open it again:
`xattr -cr "/Applications/Fernando Notion.app"`

### Windows

1. Download **`Fernando-Notion-Setup-….exe`** and run it.
   Windows may show *“Windows protected your PC”* because the app isn't code-signed — click **More info → Run anyway**.
   (Prefer no installation? Use **`Fernando-Notion-Portable-….exe`** and just double-click it.)
2. Open **Fernando Notion** from the Start menu or the desktop shortcut.

### Linux

Download the `.AppImage`, make it executable (`chmod +x`) and run it. You can always [run it from source](#run-from-source) too.

## Where are my pages saved?

- Every page is saved as a small file inside **`Documents/Fernando Notion/`** — automatically, about half a second after you stop typing, and again when you close the window.
- A **backup of the whole workspace is made every day** in `Documents/Fernando Notion/backups/` (the last 30 are kept). You can restore any of them from **Settings → Your data**.
- Want your pages on several computers? In **Settings → Your data → Change folder…** pick a folder inside **iCloud Drive, OneDrive, Dropbox or Google Drive**. (Use one computer at a time.)
- If the app can't write to its folder (for example because access to Documents was denied on a Mac), it tells you and switches to a safe folder instead of losing anything.
- **Settings → Export** creates a single `.json` file with everything (images included) that you can keep as an extra backup or import on another computer.
- Updating the app never touches your pages — just install the new version over the old one.

## What it can do

**Pages & writing**
- Nested pages in a sidebar (drag & drop to reorder or nest), favorites, trash with restore
- Block editor: headings, to-do lists, bullet/numbered/toggle lists, quotes, callouts, dividers, code blocks with syntax highlighting, tables, images, video, audio and files
- Type **`/`** for the block menu, **`@`** to mention a page or a date, Markdown shortcuts (`#`, `-`, `[]`, `>`, ```` ``` ````)
- Drag blocks by their ⋮⋮ handle, text colors & highlights, links
- Page icons (emoji), covers (gradients, colors, your own images), full width, small text, serif/mono fonts, lock page
- Comments on pages, word count, export to **Markdown** and **PDF**, import Markdown files

**Databases** (like Notion's)
- Views: **Table, Board (kanban), Calendar, Timeline (Gantt), List, Gallery** — as many views per database as you like
- Properties: text, number, select, multi-select, status, date (with end date and time), checkbox, person, URL, email, phone, relation, created/edited time
- Filters, sorts, show/hide properties, search, drag cards between columns, resize columns
- Every row is a full page; open it in a side panel. Templates for new rows (e.g. meeting notes)
- Inline databases inside any page (`/board view`, `/table view`, `/calendar view`…) and linked views

**Calendars & agendas**
- **Home**: greeting, the next 7 days at a glance, **today's agenda** with overdue tasks, quick “add a task”, recent pages
- **Calendar**: every database with a date shows up in one calendar (month / week / day / agenda), each with its own color; drag events to reschedule, drag edges to change duration, click a day to add an event

**Templates** (one click): Project Tracker, Task List, Calendar & Agenda, Weekly Agenda, Meeting Notes, Daily Journal, Goals, Habit Tracker, Reading List, Quick Notes.

**Everything else**: quick search of all pages and their content (**⌘K** / **Ctrl+K**), back/forward navigation, light/dark mode, spell-check.

## Keyboard shortcuts

| Mac | Windows / Linux | Action |
| --- | --- | --- |
| `⌘K` | `Ctrl+K` | Search |
| `⌘N` | `Ctrl+N` | New page |
| `⌘\` | `Ctrl+\` | Show/hide sidebar |
| `⌘⇧L` | `Ctrl+Shift+L` | Dark mode |
| `⌘[` / `⌘]` | `Alt+←` / `Alt+→` | Back / forward |
| `⌘,` | — | Settings |
| `⌘B` / `⌘I` / `⌘U` | `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / italic / underline |
| `/` | `/` | Insert a block |
| `@` | `@` | Mention a page or a date |
| `Tab` / `⇧Tab` | `Tab` / `Shift+Tab` | Indent / outdent |
| `Esc` | `Esc` | Close side panel or menu |

---

## Run from source

You need **[Node.js](https://nodejs.org) 22 or newer**.

```bash
git clone https://github.com/josemacontrerasp-arch/fernando-notion.git
cd fernando-notion
npm install
npm start
```

## Build the installers yourself

```bash
npm run dist:win     # Windows installer + portable .exe  → release/
npm run dist:mac     # macOS .dmg (run this on a Mac)
npm run dist:linux   # Linux AppImage
```

To publish a new version, bump `version` in `package.json`, then push a tag:

```bash
git tag v1.0.2
git push origin v1.0.2
```

GitHub Actions (`.github/workflows/build.yml`) then builds the Windows, macOS and Linux installers,
launches the Mac app on a real Mac to check it opens and saves, and publishes everything as a release.
Mac builds are ad-hoc signed (no paid Apple certificate), which is why macOS asks for “Open Anyway” on first launch.

## Development

```bash
npm run dev       # Electron + hot reload
npm run dev:web   # just the web UI at http://127.0.0.1:5173 (saves to the browser instead of files)
npm run typecheck
```

Project layout:

```
electron/        main process (window, file storage, backups, PDF export) + preload bridge
src/lib/         data model, store, auto-save, database logic, templates, export
src/components/  sidebar, pages, editor (BlockNote), databases (table/board/calendar/timeline/list/gallery), home, calendar
```

Built with Electron, React, [BlockNote](https://www.blocknotejs.org) (MPL-2.0), [FullCalendar](https://fullcalendar.io) (MIT), Zustand, date-fns and Lucide icons.

---

### En español — instalación rápida

**Mac**
1. Entra en **[Releases](../../releases/latest)** y descarga el `.dmg`: `mac-arm64` si tu Mac tiene chip Apple (M1, M2, M3, M4…) o `mac-x64` si es Intel.
2. Abre el `.dmg` y arrastra **Fernando Notion** a **Aplicaciones**.
3. La primera vez: ábrela, pulsa **OK/Listo** en el aviso, ve a **Ajustes del Sistema → Privacidad y seguridad** y pulsa **Abrir igualmente**.
4. Si pide acceso a la carpeta **Documentos**, pulsa **Permitir**.

**Windows**: descarga `Fernando-Notion-Setup-….exe` y ábrelo. Si Windows dice *“Windows protegió tu PC”*, pulsa **Más información → Ejecutar de todas formas**.

Todo lo que escribes se guarda solo en **Documentos/Fernando Notion** y se hace una copia de seguridad cada día.

---

*Fernando Notion is an independent personal project and is not affiliated with or endorsed by Notion Labs, Inc.*
