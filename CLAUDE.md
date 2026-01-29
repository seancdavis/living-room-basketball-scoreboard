# Living Room Basketball Challenge

A React-based scoreboard app for tracking basketball shooting games with voice control.

## Tech Stack

- **Frontend**: React 19, Vite 7
- **Backend**: Netlify Functions (serverless)
- **Database**: Netlify DB (Postgres via Neon) with Drizzle ORM
- **Voice**: Web Speech API + Anthropic Claude for natural language command processing

## Project Structure

```
src/
  App.jsx           - Main component with routing, game UI, state hydration
  App.css           - All styling (gradient backgrounds, responsive layout)
  useGameState.js   - Core game logic (scoring, multipliers, modes, misses, hydration)
  useGameTracking.js - Database tracking hook (sessions, games, events, state sync)
  useServerState.js - Server state fetching and hydration utilities
  useVoiceControl.js - Voice recognition + Anthropic API for commands
  useMicrophoneSelector.js - Mic device enumeration, localStorage persistence
  VoiceButton.jsx   - Voice control UI with mic settings dropdown
  History.jsx       - Session history view

netlify/functions/
  session.mts       - POST/PUT/GET for sessions (includes pause state, auto-end)
  game.mts          - POST/PUT/GET for games (includes current state sync)
  event.mts         - POST/PUT for recording events (includes isTipIn)
  voice-command.mts - Anthropic API for voice command processing

  API Paths (via config export):
  - /api/session       → session.mts
  - /api/game          → game.mts
  - /api/event         → event.mts
  - /api/voice-command → voice-command.mts

db/
  schema.ts         - Drizzle schema (sessions, games, events tables)
  index.ts          - DB connection export

migrations/        - Drizzle migrations (auto-generated, don't edit)
```

## Game Concepts

### Hierarchy
- **Session** = 10-minute timed play period, contains multiple games
- **Game** = Single attempt, ends when out of misses (lives)
- **Event** = Individual action (make, miss, mode change)

### Modes
- **Multiplier Mode**: Makes increase multiplier, misses cost a life
- **Point Mode**: Makes score points (multiplied if you have multiplier shots)

### Mechanics
- Start with 3 misses (lives)
- Build multiplier in multiplier mode, then switch to point mode to score
- Passing multiples of 10 grants: +1 miss, 3 freebies, chance to re-enter multiplier mode
- Freebies protect against misses right after passing a 10

## Commands

```bash
npm run dev          # Start dev server (uses Netlify plugin)
npm run build        # Production build
npm run lint         # ESLint
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Apply migrations (requires Netlify CLI)
npm run db:studio    # Drizzle Studio UI
```

## Voice Commands

Supported voice commands (processed by Anthropic):
- "start" / "begin" - Start session or new game
- "make" / "score" / "yes" - Record a made shot
- "miss" / "no" - Record a missed shot
- "tip in" / "tipped it in" - Record a tip-in make
- "tip miss" - Record a tip-in miss
- "point mode" / "points" - Switch to point mode
- "multiplier mode" / "multiplier" - Switch to multiplier mode (when allowed)
- "undo" / "take back" - Undo last action
- "pause" / "resume" - Pause/resume timer
- "end" / "stop" - End session

## Key Implementation Details

### Stale Closure Fix
Voice commands use refs (`gameStateRef`, `actionsRef`) to avoid stale closures in the callback. These refs are updated via useEffect when state changes.

### Database Tracking
- `useGameTracking` hook creates session/game records and batches events
- Events are batched (every 5) for efficiency, important events flush immediately
- Miss tracking uses a ref flag (`trackingMissRef`) to detect when misses occur

### Mic Selector
- Uses `navigator.mediaDevices.enumerateDevices()`
- Persists selection to localStorage
- `activateMicrophone` function passed to voice control for proper device selection

## URL Routing

The app uses react-router-dom for URL-based session management:
- `/` - Home screen (start new session or view history)
- `/session/:sessionId` - Active or ended session view

When starting a new session, the app navigates to `/session/:id`. URLs are shareable/bookmarkable and state persists across page refreshes.

## Server-Driven State

Game state is persisted on the server for refresh recovery:

### Session State (stored in sessions table)
- `isPaused`, `pausedAt`, `totalPausedMs` - For calculating time remaining
- `currentGameId` - Active game reference

### Game State (stored in games table)
- `currentScore`, `currentMultiplier`, `currentMisses`, etc. - Live game state
- `isActive` - Whether game is still in progress

### Timer Calculation
Time remaining is calculated from timestamps on page load:
```javascript
if (isPaused) {
  elapsed = pausedAt - sessionStartedAt - totalPausedMs
} else {
  elapsed = now - sessionStartedAt - totalPausedMs
}
timeRemaining = 600 - (elapsed / 1000)
```

### State Sync
- Game state syncs to server with 500ms debounce
- Pause/resume syncs immediately with timestamps
- Session auto-ends if timer expired while page was closed

## Special Features

### Tip-In Tracking
Events can be marked as tip-ins (jumped and tipped ball before it hit ground). This is metadata only - doesn't affect scoring. Voice commands: "tip in", "tip miss"

### Final Shot After Timer
When session timer expires, user has 60 seconds to add one final shot (make/miss) that may have counted at the buzzer.

### Read-Only Session View
Ended sessions show:
- Final stats (high score, total games, total points)
- Game breakdown with scores and stats per game
- "Start New Session" button

## Environment Variables

- `NETLIFY_DATABASE_URL` - Postgres connection (auto-injected by Netlify)
- Anthropic API key configured in Netlify environment

## Development Rules

### API Path Convention
All Netlify Functions MUST use clean `/api/...` paths instead of the default `/.netlify/functions/...` paths. This is done by exporting a `config` object with a `path` property in each function file:

```typescript
export const config = {
  path: '/api/function-name'
};
```

Frontend code should always call `/api/...` endpoints, never `/.netlify/functions/...`.
