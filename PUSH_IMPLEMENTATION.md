# Push Implementation

## Overview
Implemented comprehensive push tracking for the PATS (Picks Against The Spread) betting system. A "push" occurs when the final score, adjusted by the spread, results in an exact tie.

## What Changed

### 1. Data Structures
- Added `totalPushes` and `doubleDownPushes` to user statistics
- Added `pushes` field to session results: `{ wins, losses, pushes, missedPicks }`
- All user stat objects now include push counters (initialized to 0)

### 2. Push Detection Logic
**Algorithm**: Three-way comparison instead of two-way (win/loss)

```javascript
const adjustedHomeScore = homeScore + homeSpread;
const adjustedAwayScore = awayScore + awaySpread;

// For user's pick, calculate their adjusted score vs opponent's raw score
if (userAdjustedScore === opponentScore) {
  // PUSH - exact tie
  totalPushes += 1; // Note: always +1, never doubles
} else if (userAdjustedScore > opponentScore) {
  // WIN
  totalWins += pick.isDoubleDown ? 2 : 1;
} else {
  // LOSS
  totalLosses += pick.isDoubleDown ? 2 : 1;
}
```

### 3. Key Design Decisions

#### Pushes Never Double
- Even for double-down picks, pushes count as 1 (not 2)
- Rationale: A push is neither a win nor loss, so the double-down multiplier doesn't apply

#### Win Percentage Calculation
- Formula: `wins / (wins + losses) * 100`
- Pushes are explicitly EXCLUDED from win percentage
- Rationale: Matches standard sports betting convention where pushes don't affect win rate

#### Display Format
- Conditional display: only show pushes if count > 0
- Format: "W-L" or "W-L-P" (e.g., "10-3" or "10-3-1")
- Implementation pattern:
  ```javascript
  const pushText = pushes > 0 ? `-${pushes}` : '';
  const record = `${wins}-${losses}${pushText}`;
  ```

### 4. Emoji Indicators
- ✅ Win
- ❌ Loss
- 🟰 Push (new!)

### 5. Files Modified

#### Core Data Layer: `src/utils/patsData.js`
- `updateGameResult()` - Three-way push/win/loss detection
- `closePATSSession()` - Game result reconciliation with push tracking
- `getUserStats()` - Returns totalPushes and doubleDownPushes
- `getCurrentSessionStats()` - Tracks session-level pushes
- `getLiveSessionLeaderboard()` - Includes pushes in standings

#### Display Layer:
- **`src/commands/pats.js`**
  - Dashboard displays with W-L-P format
  - Session history summaries
  - Overall stats, double-down stats, session stats
  - Pick overview with 🟰 emoji for pushes

- **`src/commands/makepick.js`**
  - Pick result displays with push emoji
  - Footer record includes pushes
  - Pending calculation adjusted for pushes

- **`src/commands/patsleaderboard.js`**
  - Session leaderboard with W-L-P format
  - All-time leaderboard with pushes
  - User session stats
  - User all-time stats (including double-down pushes)

- **`src/commands/patshistory.js`**
  - Session leaderboards with pushes
  - User pick details with 🟰 emoji
  - Session results including push counts
  - Game detail views showing push results

## Testing Checklist

### Unit Tests
- [ ] Verify push detection when adjusted score equals opponent score
- [ ] Verify pushes count as 1 (never 2, even for double-downs)
- [ ] Verify win percentage excludes pushes
- [ ] Verify W-L-P display format (conditional push text)

### Integration Tests
- [ ] Complete a session with at least one push result
- [ ] Verify push is shown with 🟰 emoji in all displays
- [ ] Check /pats dashboard shows pushes correctly
- [ ] Check /patsleaderboard shows W-L-P format
- [ ] Check /patshistory shows pushes in session results
- [ ] Verify double-down push counts as 1 (not 2)

### Edge Cases
- [ ] Session with 0 pushes (should display "W-L" format)
- [ ] Session with only pushes (0-0-5)
- [ ] Win percentage calculation when pushes > 0
- [ ] Leaderboard sorting with identical win percentages but different push counts

## Example Outputs

### Record Display Examples
- `10-3` (10 wins, 3 losses, 0 pushes)
- `10-3-1` (10 wins, 3 losses, 1 push)
- `0-0-5` (0 wins, 0 losses, 5 pushes)

### Win Percentage Calculation
- 10-3-0: `10 / (10 + 3) = 76.9%`
- 10-3-2: `10 / (10 + 3) = 76.9%` (pushes excluded)
- 10-0-5: `10 / (10 + 0) = 100.0%` (pushes excluded)

### Pick Result Display
```
1. ✅ Lakers (+3.5) 💰
   (Celtics 108 @ Lakers 112)

2. 🟰 Warriors (-5)
   (Warriors 100 @ Suns 95)

3. ❌ Bucks (-7)
   (Bucks 102 @ Heat 109)
```

## Technical Notes

### Push Detection Condition
```javascript
// Must check EXACT equality (===) not approximate
if (adjustedScore === opponentScore) {
  // This is a push
}
```

### Logging
Added console.log indicators for debugging:
- `✅ WIN` - Pick won
- `❌ LOSS` - Pick lost
- `🟰 PUSH` - Pick pushed (new!)

### Data Migration
No migration needed. Existing data automatically gets push counters initialized to 0:
- `totalPushes: user.totalPushes || 0`
- `doubleDownPushes: user.doubleDownPushes || 0`

## Related Improvements

### Spread Explanation
Also improved the spread explanation to be clearer:
```
📊 How The Spread Works
Lakers is favored by 3 points

Lakers (Favorite): Must win by more than 3 points
Celtics (Underdog): Can lose by up to 3 points, or win outright

*If the margin is exactly 3 points, it's a push (no win/loss).
```

Push explanation only shown for whole number spreads (no half-point spreads can push).
