# NovaPOS — Desktop Point of Sale System

> Offline-first desktop POS for Nigerian SMBs. Electron + React + SQLite (WASM). No monthly fees, no internet required.

---

## Quick Start (Developer)

```bash
git clone https://github.com/OjuoyeMoshoodOlawale/nova_pos.git
cd nova_pos
npm install
npm run dev
```

> **First time?** You need Node.js 18+ installed. No other tools required — SQLite is pure WASM.

---

## 🔑 Activation Key System (Vendor Workflow)

Every copy of NovaPOS is **locked to the specific machine** it is installed on. A key that works on one PC will not work on another.

### Step 1 — Client sends you their Machine ID

When the client launches the app for the first time, they see the **Activation Screen** which displays their unique Machine ID, e.g.:

```
fc86a0cec042865ac0d73322d3a0b24862b56787895d03b4acca4f7d8c146739
```

They copy it and send it to you (WhatsApp, email, etc.).

---

### Step 2 — You generate their activation key

Open a terminal in the `nova_pos` folder and run:

```bash
node scripts/gen-activation-key.js <MACHINE-ID>
```

**Example:**
```bash
node scripts/gen-activation-key.js fc86a0cec042865ac0d73322d3a0b24862b56787895d03b4acca4f7d8c146739
```

**Output:**
```
✅ Activation Key Generated
   Machine ID : fc86a0cec042865ac0d73322d3a0b24862b56787895d03b4acca4f7d8c146739
   Key        : NOVA-4CB8-65FB-0C28-3CD8

Send this key to the client.
```

---

### Step 3 — Client enters the key

The client types their **Business Name** and pastes the key `NOVA-4CB8-65FB-0C28-3CD8` into the activation screen, then clicks **Activate Software**.

The app validates the key against the machine ID and opens the 9-step Setup Wizard.

---

### ⚠️ Before deploying to real clients — set your own secret

The default secret (`nova-default-dev-secret-v1-CHANGE-ME`) is public. Before you sell to clients, create a `.env` file with your own private secret:

```bash
# nova_pos/.env
NOVA_DEV_SECRET=my-super-secret-long-random-string-2024
```

Then rebuild:
```bash
npm run build:win
```

**Keep your secret safe.** If you lose it, you cannot generate new keys for your existing clients. Store it in a password manager.

---

## 👨‍💻 Developer Maintenance Password

For remote client support without knowing the client's admin password. The password **rotates every 30 minutes** — it is never stored anywhere.

### How to get the current developer password

```bash
node scripts/get-dev-password.js
```

**Output:**
```
🔐 Developer Maintenance Password
   Username       : nova.support
   Current Pass   : abc123def456  (expires in ~18 min)
   Previous Pass  : 9f2e1b8c7a3d  (still valid during transition)

This is a rotating password — rerun this script if it expires.
```

### Login with it

On the NovaPOS login screen:
- **Username:** `nova.support`
- **Password:** the current password from above

> The client can disable this access in **Settings → Developer → Allow developer maintenance login**.

---

## 📦 Project Structure

```
nova_pos/
├── src/
│   ├── main/                    ← Electron main process (Node.js)
│   │   ├── database/            ← SQLite connection + migrations (inline SQL)
│   │   ├── handlers/            ← IPC handlers (one per module)
│   │   ├── services/            ← Business logic (auth, sales, reports...)
│   │   ├── hardware/            ← Thermal receipt printer
│   │   ├── mailer/              ← Email reports + Gmail/SMTP backup
│   │   └── network/             ← LAN multi-computer server + client
│   ├── preload/                 ← contextBridge (window.api.*)
│   └── renderer/                ← React frontend
│       ├── pages/Activation/    ← License key screen
│       ├── pages/Setup/         ← 9-step setup wizard
│       ├── pages/POS/           ← Register: scan, cart, payment
│       ├── pages/Inventory/     ← Products CRUD + stock adjustment
│       ├── pages/Sales/         ← Sales history, void, reprint
│       ├── pages/Reports/       ← Daily / Monthly / Yearly / P&L
│       ├── pages/Dashboard/     ← Live metrics + charts
│       ├── pages/Settings/      ← All configuration tabs
│       └── pages/Staff/         ← User accounts + roles
├── shared/                      ← types.ts + ipcChannels.ts
├── scripts/
│   ├── gen-activation-key.js    ← Generate key for a machine ID
│   └── get-dev-password.js      ← Get current dev maintenance password
├── resources/                   ← App icons
├── .env.example                 ← Copy to .env and set NOVA_DEV_SECRET
└── README.md
```

---

## 💾 Backup

Configure in **Setup Wizard (Step 9)** or **Settings → Backup**:

| Option | What happens |
|--------|-------------|
| Local folder | `.db.gz` saved to chosen path, last 7 kept automatically |
| Email (Gmail) | Compressed backup sent as attachment via your SMTP config |
| Both | Both of the above |

**Gmail App Password setup:**
1. Google Account → Security → 2-Step Verification (enable it)
2. Search "App Passwords" → create one for Mail
3. Paste the 16-character password into **Settings → Email → Password**

---

## 🌐 LAN Multi-Computer Mode

Share one database across multiple POS terminals:

1. **Server PC:** Settings → Network → Mode: Server → Save
2. **Client PCs:** Settings → Network → Mode: Client → Enter server's IP → Save
3. All PCs must use the same Shared Secret

---

## 🚀 Build Windows Installer

```bash
npm run build:win
# Output: dist/installers/NovaPOS-Setup-1.0.0.exe
```

---

## 🛠️ Troubleshooting

### "database is locked"
Another Electron window is already open. Close it first, then run `npm run dev`.
On Windows you can also kill it forcefully:
```bash
taskkill /f /im electron.exe
```

### "Invalid activation key"
- Make sure you copied the full Machine ID from the activation screen
- Run `node scripts/gen-activation-key.js <machine-id>` again
- Check that your `.env` `NOVA_DEV_SECRET` matches what was used when the app was built

### Receipt not printing
1. Settings → Printer → select your thermal printer
2. Click Test Print
3. Check Windows printer queue for stuck jobs

### Email / Gmail not working
- Use an **App Password** (not your Gmail login password)
- Port 587 for Gmail (TLS), port 465 for SSL

---

## 📋 npm Scripts

```bash
npm run dev          # Start dev server with hot-reload
npm run build:win    # Package Windows .exe installer
npm run build:mac    # Package macOS .dmg
npm run build:linux  # Package Linux .AppImage
```

---

*NovaPOS — Built for Nigerian SMBs by Ojuoye Moshood Olawale*
