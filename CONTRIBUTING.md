# Contributing to Docpine 🌲

Thank you for your interest in contributing to Docpine! We welcome contributions from developers, designers, and database enthusiasts.

---

## 🛠️ Architecture & Tech Stack

Docpine is architected as a lightweight native desktop application leveraging Tauri v2:

| Layer | Technology | Description |
|---|---|---|
| **Desktop Runtime** | [Tauri v2](https://v2.tauri.app/) (Rust 2021) | Native OS webview wrapper, IPC command handling, secure Keychain integration, and driver execution. |
| **Frontend Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Component-driven UI with strictly typed domain models. |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | Minimal CSS footprint with `@tailwindcss/vite` without heavy custom sheets. |
| **Runtime & Package Manager** | [Bun](https://bun.sh/) | Blazing-fast package resolution and frontend build tooling. |
| **Query Editor** | [Monaco Editor](https://microsoft.github.io/monaco-editor/) | Desktop-grade syntax highlighting, SQL/MQL formatting, and editing. |
| **Diagramming** | [@xyflow/react](https://reactflow.dev/) + Dagre | Interactive ER diagram nodes and auto-layout graph routing. |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) | Centralized workspace, tab persistence, and schema cache state. |

---

## 📁 Repository Structure

```
docpine/
├── src/                          # React + TypeScript Frontend
│   ├── components/               # UI Components
│   │   ├── data/                 # Grid, Tree, JSON views, StagedChangesBar
│   │   ├── erd/                  # Interactive ER Diagram
│   │   ├── io/                   # Import / Export modal
│   │   ├── modals/               # Connection & Command Palette modals
│   │   ├── query/                # Monaco SQL & MQL Editor
│   │   ├── shell/                # Rail dock, Launchpad, Filters
│   │   ├── structure/            # Table & Collection Structure Designer
│   │   └── workspace/            # Tab manager, Sidebar, Topbar
│   ├── lib/                      # Tauri IPC bridge & helpers
│   ├── store/                    # Zustand workspace store
│   └── types/                    # Core TypeScript interfaces
├── src-tauri/                    # Rust Desktop Backend
│   ├── src/
│   │   ├── drivers/              # PostgreSQL, MySQL, MongoDB drivers
│   │   ├── models/               # Rust domain models
│   │   └── services/             # Keychain, Safety Guard, SQLite store, SSH Tunnel
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri v2 configuration
├── assets/                       # Screenshots and application icons
├── package.json
└── vite.config.ts
```

---

## 💻 Local Development Setup

### Prerequisites

- **[Bun](https://bun.sh/)** (v1.1+)
- **[Rust & Cargo](https://rustup.rs/)** (v1.75+)
- Platform dependencies for Tauri (Xcode Command Line Tools on macOS; `build-essential`, `libwebkit2gtk-4.1-dev` on Linux).

### Steps

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/docpine.git
   cd docpine
   ```

2. Install frontend dependencies:
   ```bash
   bun install
   ```

3. Run the development environment:
   ```bash
   bun run tauri dev
   ```

4. Run tests and type checking:
   ```bash
   # Typecheck and build frontend
   bun run build

   # Run Rust unit tests
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

---

## 📋 Pull Request Guidelines

1. **Keep Pull Requests Focused**: Each pull request should address a single feature, bug fix, or performance improvement.
2. **Follow Existing Code Style**:
   - Use standard Tailwind CSS v4 utility classes.
   - Break large components into single-responsibility subcomponents.
   - Maintain strict typing in TypeScript (`src/types/docpine.ts`).
3. **Verify Builds and Tests**: Ensure `bun run build` and `cargo test` pass before opening your PR.
4. **Licensing & Attribution**: All contributions become part of Docpine under the project's [LICENSE](LICENSE).
