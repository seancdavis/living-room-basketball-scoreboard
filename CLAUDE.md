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
  App.jsx           - Main component, game UI, integrates all hooks
  App.css           - All styling (gradient backgrounds, responsive layout)
  useGameState.js   - Core game logic (scoring, multipliers, modes, misses)
  useGameTracking.js - Database tracking hook (sessions, games, events)
  useVoiceControl.js - Voice recognition + Anthropic API for commands
  useMicrophoneSelector.js - Mic device enumeration, localStorage persistence
  VoiceButton.jsx   - Voice control UI with mic settings dropdown

netlify/functions/
  session.mts       - POST/PUT/GET for sessions
  game.mts          - POST/PUT/GET for games
  event.mts         - POST/PUT for recording events
  voice.mts         - Anthropic API for voice command processing

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
- "point mode" / "points" - Switch to point mode
- "multiplier mode" / "multiplier" - Switch to multiplier mode (when allowed)
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

## Environment Variables

- `NETLIFY_DATABASE_URL` - Postgres connection (auto-injected by Netlify)
- Anthropic API key configured in Netlify environment
