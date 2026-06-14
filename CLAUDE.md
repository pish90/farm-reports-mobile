# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start Expo dev server
npx expo start

# Run on Android / iOS simulator
npx expo run:android
npx expo run:ios

# Publish OTA update to preview branch (always use CI=1 to skip interactive prompts)
CI=1 npx eas-cli update --branch preview --message "description"
```

## Architecture Overview

Expo managed-workflow React Native app (SDK 54, TypeScript). Offline-first — all user data is written to a local SQLite database first, then synced to the backend API in the background.

**API base URL** is read from `EXPO_PUBLIC_API_URL` (set in `.env` for local dev; overridden per EAS build profile in `eas.json`). Production: `https://farm-reports-production.up.railway.app/api`.

**Path aliases** are configured in `tsconfig.json` and `babel.config.js` (module-resolver):
`@screens`, `@components`, `@services`, `@store`, `@types`, `@db`

## Key Patterns

### Offline-first sync
1. Every write goes to SQLite (`src/db/`) first.
2. An entry is added to the `sync_queue` table (`reportId`, `section`).
3. `SyncContext` calls `syncService.syncAllPending()` on: app foreground, network restore, a 30-second timer, and manual trigger via `useTriggerSync()`.
4. Sync creates the report on the server if needed, then PUTs each pending section.

The upsert strategy on the backend is delete-and-reinsert, so the mobile always sends the full section payload — never diffs.

### API client
`src/services/apiClient.ts` — Axios instance. Request interceptor attaches the JWT from `AsyncStorage` (`auth_token`). Response interceptor on 401 calls `AuthContext.logout()` and clears the token. Never call Axios directly — import from `apiClient`.

### Authentication
JWT decoded client-side to extract `userId`, `farmId`, `farmName`, `userName`, `role`, `mustChangePassword`. `AuthContext` (`src/store/AuthContext.tsx`) exposes `useAuth()`. If `mustChangePassword` is true, `RootNavigator` redirects to `ChangePasswordScreen` before the main app.

### Navigation structure
`RootNavigator` → `MainNavigator` (bottom tabs):
- **Attendance** → `AttendanceNavigator` (nested stack)
  - `AttendanceHome` (landing: Salaried vs Casual split)
  - `SalariedAttendance`, `CasualAttendance`, `CreateWorkSession`, `SelectCasuals`, `CasualReport`, `Workers`
- **Livestock**, **Milk**, **Expenses** — simple nested stacks
- **Admin** — role-gated (`AdminNavigator`): Dashboard, FarmDetail, Workers, AuditLog
- **Settings**

Modal summary screen is presented on top of the tab navigator.

### Role-based UI
Roles: `ADMIN`, `MANAGER`, `OPERATIONS_MANAGER`, `WORKER`. The Admin tab is only visible to MANAGER / ADMIN / OPERATIONS_MANAGER. Expense editing may be further gated to ADMIN / OPERATIONS_MANAGER.

### Local database
`src/db/database.ts` initialises the SQLite DB (`farm_reports.db`) in WAL mode. Schema additions use try-catch so new `ALTER TABLE` statements don't crash on an already-migrated database. `src/db/reportRepository.ts` is the data access layer — all DB reads/writes go through it.

**Tables:** `local_reports`, `local_attendance`, `local_livestock`, `local_milk`, `local_expenses`, `local_expense_apportionments`, `local_attendance_notes`, `local_livestock_notes`, `sync_queue`, `workers_cache`, `casual_labourers_cache`, `livestock_types_cache`, `expense_categories_cache`, `business_units_cache`.

### Attendance status cycle
Salaried attendance cycles through six statuses: `A` → `P` → `AL` → `SL` → `PL` → `WA` → back to `A`. Casual attendance uses the work-session model (see below).

### Casual labourer work-session model
Casual attendance is **not** tied to `MonthlyReport`. Instead:
- A `CasualWorkSession` has a date, activity, and default daily rate.
- `CasualWorkEntry` rows attach individual labourers to a session with an optional rate override.
- Earnings are calculated from work entries; payments are tracked separately via `casual_labourer_payments`.
- The old `casual_attendance` table (linked to monthly reports) exists only as historical data.

### Shared UI conventions
- **Styling:** `StyleSheet.create()` only — no utility-class libraries. Brand colours: `#2d6a4f` (green primary), `#7c3aed` (purple for casual), `#e53e3e` (error red).
- **Icons:** `@expo/vector-icons` Feather set.
- **Forms:** `react-hook-form` with `Controller` wrapper.
- **Save feedback:** screens show `idle` → `saving` → `saved` (reset after 2 s) to confirm writes.
- **Debouncing:** text inputs (attendance notes, expense fields) debounce 500 ms before writing to DB.
- **Month/Year selector:** shared `MonthYearSelector` component used across all report screens.
- **Focus refresh:** screens use `useFocusEffect` to reload data when navigated back to.

### Android modal gotcha
Absolute-positioned views inside `Modal` components require both `elevation` **and** `zIndex` props to appear above the modal backdrop on Android. Without both, the view renders behind the modal.

## Deployment

- EAS project ID: `bdb6a038-448e-4bd1-977a-b5da6a662739` (Expo account: `pklife`)
- OTA updates published to branch `preview`; clients receive updates on next app load
- **Do not use standalone APK builds** — `expo-file-system/next` (the non-legacy import) crashes on launch in standalone APKs. Always use `expo-file-system/legacy` in services that import it (adminService, casualLabourerService, ExpenseForm).
- `fallbackToCacheTimeout` must be ≥ 30000 ms in `app.json` so Android can download the bundle on first open.
