# NovaPOS — Desktop Point of Sale System

> Offline-first desktop POS for Nigerian SMBs. Built with Electron + React + SQLite.

---

## Quick Start (Developer)

### Prerequisites
- Node.js 18+ and npm
- Windows 10/11, macOS 12+, or Ubuntu 20.04+

### Install & run

```bash
# 1. Clone or extract the project folder
cd nova-pos

# 2. Install dependencies
npm install

# 3. Set your developer secret (REQUIRED – change from default!)
cp .env.example .env
# Edit .env and set NOVA_DEV_SECRET to a long random string

# 4. Start in development mode (hot-reload)
npm run dev
```

### Build installer

```bash
# Windows (.exe installer)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage)
npm run build:linux

# Output → dist/installers/
```

---

## 🔑 Activation System (Vendor Workflow)

Every installation is tied to the client's machine. They **cannot** copy the app to another computer without a new key.

**Step 1 — Client installs the app**
```
The activation screen shows their Machine ID automatically.
They copy it and send it to you (the vendor).
```

**Step 2 — Vendor generates key**
```bash
NOVA_DEV_SECRET=your-secret node scripts/gen-activation-key.js <machine-id>
# → NOVA-A1B2-C3D4-E5F6-G7H8
```

**Step 3 — Client enters key**
```
They paste the key into the activation screen.
One key = one machine, forever. No internet required.
```

> ⚠️ Keep `NOVA_DEV_SECRET` in your password manager. If you lose it, you cannot generate keys for existing clients.

---

## 👨‍💻 Developer Login (Maintenance Access)

For remote support without knowing the client's password:

```bash
# Get current developer password (rotates every 30 min)
NOVA_DEV_SECRET=your-secret node scripts/get-dev-password.js

# Login with:
# Username:  nova.support
# Password:  <output above>
```

- The password rotates every 30 minutes automatically
- The client can disable this access in Settings → Developer
- No password is stored in the database — it's computed on-the-fly

---

## 📦 Project Structure

```
nova-pos/
├── src/
│   ├── main/                    ← Electron main process (Node.js)
│   │   ├── database/            ← SQLite connection (WAL mode), migrations
│   │   ├── handlers/            ← IPC handler registration (one per module)
│   │   ├── services/            ← Business logic (auth, products, sales, reports)
│   │   ├── hardware/            ← Thermal receipt printer service
│   │   ├── mailer/              ← Email reports + backup via Gmail/SMTP
│   │   ├── network/             ← LAN multi-computer server + client adapter
│   │   └── utils/               ← safeHandle, encrypt, machineId, logger
│   ├── preload/                 ← contextBridge — exposes window.api to renderer
│   └── renderer/                ← React frontend (never touches SQLite directly)
│       ├── src/pages/
│       │   ├── Activation/      ← License key screen
│       │   ├── Setup/           ← 9-step wizard (runs once on first launch)
│       │   ├── Login/           ← Username + password
│       │   ├── Dashboard/       ← Live sales metrics + charts
│       │   ├── POS/             ← Register: barcode scan, cart, payment
│       │   ├── Inventory/       ← Products CRUD + stock adjustment + CSV import
│       │   ├── Sales/           ← Sales history, void, reprint
│       │   ├── Reports/         ← Daily / Monthly / Yearly / Inventory / P&L
│       │   ├── Customers/       ← Customer management + purchase history
│       │   ├── Suppliers/       ← Supplier directory
│       │   ├── Staff/           ← User accounts + roles + PIN
│       │   └── Settings/        ← Business, receipt, email, printer, network, backup
│       ├── src/store/           ← Zustand: auth, app, cart
│       └── src/components/      ← Shared: DataTable, MainLayout, Toasts
├── shared/                      ← types.ts + ipcChannels.ts (shared by both sides)
├── scripts/                     ← gen-activation-key.js, get-dev-password.js
├── resources/                   ← App icons (ICO, PNG)
└── .env.example                 ← Copy to .env before running
```

---

## 🗄️ Database

- **Engine:** SQLite via `better-sqlite3`
- **Mode:** WAL (Write-Ahead Logging) — survives crashes, concurrent reads
- **Location:** `%APPDATA%\novapos\novapos.db` (Windows) or `~/Library/Application Support/novapos/novapos.db` (Mac)
- **Security:** No plain-text passwords or secrets stored. Passwords use `scrypt`. SMTP password is AES-256-GCM encrypted using the machine ID as key material.

---

## 📊 Reports

| Report | Coverage | Auto-email |
|--------|----------|------------|
| Daily  | Revenue, transactions, top products, hourly chart, cashier performance | Yes (configurable time) |
| Monthly | Day-by-day breakdown, weekly summary, top products, gross profit | On demand |
| Yearly | Month-by-month, category revenue, staff ranking, P&L | On demand |
| Inventory | Stock value, low stock, out of stock, slow-movers, by category | On demand |
| P&L | Revenue, COGS, gross profit, margin, discounts, tax | On demand |

---

## 💾 Backup

Configure in Setup Wizard (Step 9) or Settings → Backup:

| Option | What happens |
|--------|-------------|
| Local folder | `.db.gz` saved to configured path, last 7 kept automatically |
| Email (Gmail) | Compressed backup attached to email via your SMTP settings |
| Both | Both of the above |

**Gmail setup:**
1. Go to `myaccount.google.com/security`
2. Enable 2-Step Verification
3. Search "App Passwords" → create one for "Mail"
4. Paste the 16-character app password into Settings → Email → Password

---

## 🌐 LAN Multi-Computer Mode

Run the POS on multiple computers sharing one database:

1. **Server computer:** Settings → Network → Mode: Server → Save
2. **Client computers:** Settings → Network → Mode: Client → Enter server IP → Save
3. All computers must use the same Shared Secret

The server computer's database is the source of truth. Client computers send all operations over HTTP RPC to the server.

---

## 🛠️ IPC Security

- `contextIsolation: true` — renderer cannot access Node.js APIs directly
- `nodeIntegration: false` — no `require()` in renderer
- All database access goes through `ipcMain.handle` → service layer → SQLite
- DevTools, F12, and Ctrl+Shift+I are disabled in production builds
- Right-click context menu is disabled in production builds

---

## 🚀 Deployment Checklist

- [ ] Set `NOVA_DEV_SECRET` to a unique random string (save in your password manager)
- [ ] Run `npm run build:win` (or mac/linux)
- [ ] Install on client computer
- [ ] Generate activation key using `scripts/gen-activation-key.js`
- [ ] Activate the software on the client machine
- [ ] Complete the 9-step setup wizard with the client:
  - Business name, type, address, phone
  - Tax rate and name (e.g. VAT 7.5%)
  - Admin account (client-chosen password)
  - Email/Gmail for reports (optional)
  - Receipt header/footer customization
  - Thermal printer selection + test print
  - Opening stock entry
  - Network mode (standalone for single PC)
  - Backup schedule
- [ ] Train staff on POS register and basic operations

---

## 📦 npm Scripts

```bash
npm run dev          # Start with hot-reload (dev)
npm run build        # Compile TypeScript only
npm run build:win    # Package Windows installer
npm run build:mac    # Package macOS DMG
npm run build:linux  # Package Linux AppImage
npm run typecheck    # TypeScript type check (no emit)
npm run lint         # ESLint
```

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Electron 31 |
| Frontend | React 18, Vite 5, TypeScript 5 |
| Build system | electron-vite 2 |
| Database | SQLite via better-sqlite3 9 (WAL mode) |
| State | Zustand 4 |
| Styling | Tailwind CSS 3 |
| Charts | Recharts 2 |
| Email | Nodemailer 6 |
| Printing | electron-pos-printer 3 |
| Barcodes | JsBarcode |
| CSV import | PapaParse |
| Packaging | electron-builder 24 |

---

## 🆘 Troubleshooting

**"Database is locked" error**
The WAL mode + 5-second busy timeout handles most cases automatically. If it persists, ensure only one instance is running (`app.requestSingleInstanceLock()`).

**Receipt not printing**
1. Settings → Printer → confirm correct printer is selected
2. Click "Test Print"
3. Check Windows printer queue for stuck jobs
4. Ensure printer driver is installed and printer is online

**SMTP / Email not working**
- Gmail: Use an App Password (not your Gmail password)
- Settings → Email → Send Test Email to verify
- Check port: Gmail uses 587 (TLS) or 465 (SSL)

**App won't activate on new PC**
Each machine has a unique Machine ID. Generate a new activation key for the new machine using `gen-activation-key.js`.

---

*NovaPOS — Built for Nigerian SMBs*
