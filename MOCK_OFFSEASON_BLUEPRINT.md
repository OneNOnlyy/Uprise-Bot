# Mock Offseason System Blueprint

## 🎯 Overview
A comprehensive NBA Mock Offseason system where users become GMs of NBA teams, managing rosters, trades, free agency, draft picks, and salary cap within realistic NBA rules.

---

## 🏗️ Core Systems

### 1. **Team Assignment & Management**

#### Team Ownership
- **Commands:**
  - `/mockoffseason join` - Request to become a GM
  - `/mockoffseason assign <user> <team>` - Admin assigns user to team
  - `/mockoffseason leave` - Give up GM position
  - `/mockoffseason myteam` - View your team dashboard
  - `/mockoffseason team <team_name>` - View any team's roster/cap situation

#### GM Roles
- **Primary GM**: Full control of team decisions
- **Assistant GM**: Can propose trades/signings (requires Primary approval)
- **Front Office Channel**: Each team gets a private channel for strategizing

#### Team Data Structure
```javascript
{
  teamId: "LAL",
  teamName: "Los Angeles Lakers",
  gm: "userId",
  assistantGMs: ["userId1", "userId2"],
  frontOfficeChannelId: "channelId",
  roster: [
    {
      playerId: "uniqueId",
      playerName: "LeBron James",
      position: "SF",
      salary: 48728845,
      contractYears: 2,
      contractType: "Player Option", // or "Guaranteed", "Team Option", "Non-Guaranteed"
      tradeKicker: 15, // percentage
      noTradeClause: true,
      birdRights: "Full", // "Full", "Early", "Non", "None"
      isTwoWay: false,
      isRookie: false,
      draftYear: 2003,
      age: 40
    }
  ],
  draftPicks: [
    { year: 2026, round: 1, protection: "Top-10", fromTeam: "LAL" },
    { year: 2027, round: 2, protection: null, fromTeam: "BKN" }
  ],
  capSpace: {
    totalSalary: 183450000,
    salaryCap: 140588000,
    luxuryTax: 170814000,
    apron: 178655000,
    hardCap: null, // or apron value if hard-capped
    capHolds: 5000000,
    exceptions: {
      mle: { type: "Non-Taxpayer", amount: 12405000, used: 0 },
      bae: { amount: 4700000, used: 0 },
      tpe: [ // Trade exceptions
        { amount: 17142857, expires: "2026-07-01", fromTrade: "tradeId" }
      ]
    }
  },
  tradeMachine: {
    outgoing: [], // Players/picks being traded away
    incoming: [], // Players/picks receiving
    partnerId: "teamId", // Other team in trade
    status: "pending" // "pending", "completed", "rejected"
  },
  transactionHistory: [
    {
      type: "trade", // or "signing", "release", "draft"
      date: "2025-11-29",
      details: "Traded Russell Westbrook to LAC for...",
      involvedTeams: ["LAL", "LAC"]
    }
  ]
}
```

---

### 2. **Salary Cap System**

#### Cap Rules Implementation
- **Current 2024-25 Salary Cap**: $140,588,000
- **Luxury Tax Line**: $170,814,000
- **First Apron**: $178,655,000
- **Second Apron**: $189,489,000

#### Cap Calculations
- Auto-calculate team salary in real-time
- Track cap holds for unsigned free agents
- Incomplete roster charges (if under 12 players)
- Bird Rights tracking (Full, Early, Non-Bird)
- Trade exceptions tracking and expiration

#### Luxury Tax Calculator
```
Tax Tiers:
- $0-5M over: $1.50 per $1
- $5-10M over: $1.75 per $1
- $10-15M over: $2.50 per $1
- $15-20M over: $3.25 per $1
- $20M+: $3.75-4.75 per $1

Repeater Tax (3 of 4 years): 2x-3x multiplier
```

#### Hard Cap Scenarios
If team uses Non-Taxpayer MLE, BAE, or receives S&T:
- Cannot exceed First Apron ($178.655M)
- Must stay under hard cap all season

---

### 3. **Trade System**

#### Trade Mechanics
- **Commands:**
  - `/mockoffseason trade create <team>` - Start trade negotiation
  - `/mockoffseason trade add player <name>` - Add player to outgoing
  - `/mockoffseason trade add pick <year> <round>` - Add draft pick
  - `/mockoffseason trade remove <item>` - Remove from trade
  - `/mockoffseason trade propose` - Send trade proposal
  - `/mockoffseason trade accept <tradeId>` - Accept incoming trade
  - `/mockoffseason trade reject <tradeId>` - Reject incoming trade
  - `/mockoffseason trade cancel` - Cancel your trade proposal

#### Trade Rules & Validation
**Salary Matching Rules:**
- Under cap: Can take back 175% + $100k
- Above cap, under tax: Take back 125% + $100k
- Taxpayer: Take back 125% (no $100k)
- Over First Apron: Take back 110%
- Over Second Apron: CANNOT aggregate salaries

**Player Restrictions:**
- No-Trade Clauses (requires player waiver - auto-reject)
- Recently extended players (6-month restriction)
- Two-way contracts (special rules)
- Designated Rookie Extensions (max 1 incoming if over apron)

**Draft Pick Protections:**
- Stepladder protections (e.g., Top-10 in 2026, Top-8 in 2027, Top-5 in 2028)
- Pick swaps
- Future pick obligations (Stepien Rule - can't trade consecutive firsts)

#### Trade Interface
Interactive embed with:
- **Team A side** (your team): Players/picks outgoing
- **Team B side** (their team): Players/picks incoming
- **Salary Matcher**: Real-time validation
- **Cap Impact**: Show before/after cap situation
- **Trade Grade**: Auto-grade based on value (optional)
- **Buttons**: Add Player, Add Pick, Propose, Cancel

---

### 4. **Free Agency System**

#### Free Agent Pool
- **Commands:**
  - `/mockoffseason freeagents` - Browse available FAs
  - `/mockoffseason freeagents position <PG/SG/SF/PF/C>` - Filter by position
  - `/mockoffseason freeagents search <name>` - Search for player
  - `/mockoffseason offer <player> <years> <salary>` - Make contract offer

#### Contract Types
1. **Veteran Minimum**: Based on years of service
2. **Room Exception**: $7.7M (if using cap space)
3. **Mid-Level Exception (MLE)**:
   - Non-Taxpayer MLE: $12.4M (4 years max)
   - Taxpayer MLE: $5.2M (3 years max)
   - Bi-Annual Exception: $4.7M (2 years)
4. **Cap Space Signing**: Up to max contract
5. **Bird Rights Signing**: Over the cap (retain own FAs)

#### Signing Process
1. GM makes offer with years/salary
2. Agent (bot) evaluates offer based on:
   - Player tier (star, starter, role player, minimum)
   - Market value comparison
   - Team competitiveness
   - Playing time opportunity
3. Player accepts/rejects/counters (automated logic)
4. If accepted, contract is added to team

#### Free Agent Tiers
- **Max Players** ($50M+): Require competitive team + max money
- **Near-Max** ($25-50M): Want starting role + good team
- **Quality Starters** ($10-25M): Reasonable offers accepted
- **Role Players** ($5-10M): Easy to sign
- **Minimum Players** (<$5M): Accept most offers

---

### 5. **Draft System**

#### Draft Lottery
- **Commands:**
  - `/mockoffseason lottery` - Run draft lottery (admin)
  - `/mockoffseason draftorder` - View current draft order
  - `/mockoffseason pick <player>` - Make your draft selection

#### Draft Structure
- 2 rounds, 30 picks each
- Lottery for picks 1-14 (weighted odds by record)
- Round 2 follows reverse standings
- Draft pick trading (current + future years)

#### Draft Pick Trading
- Can trade up to 7 years into future
- Stepien Rule: Cannot leave team without 1st round pick in consecutive years
- Pick protections (Top-5, Top-10, Top-14, Unprotected)
- Pick swaps with protections

#### Mock Draft Pool
- Import top 60 prospects with:
  - Projected position
  - Projected talent tier (franchise, star, starter, role)
  - Rookie scale salary
  - Age/college/international

---

### 6. **Roster Management**

#### Roster Rules
- **Regular Season**: 15 players max
- **Two-Way Contracts**: 2 max (don't count toward cap)
- **Minimum**: 13 players required
- **Hardship Exception**: Can sign 16th+ if injuries

#### Player Actions
- **Commands:**
  - `/mockoffseason waive <player>` - Release player (cap implications)
  - `/mockoffseason extend <player> <years> <salary>` - Extend player
  - `/mockoffseason option <player> accept/decline` - Exercise team option
  - `/mockoffseason convert <player>` - Convert two-way to standard
  - `/mockoffseason g-league <player>` - Assign to G-League (cosmetic)

#### Waiving Players
- Guaranteed money still counts toward cap (stretched or not)
- **Stretch Provision**: Spread cap hit over 2N+1 years
- Non-guaranteed contracts: Full cap relief
- Before trade deadline vs. after (different rules)

#### Contract Extensions
- Must follow CBA extension rules
- Max salary increase: 140% per year
- Cannot extend players signed within 6 months
- Designated extensions (max contract)

---

### 7. **Season Simulation**

#### Simulation Engine
- **Commands:**
  - `/mockoffseason simulate <games>` - Sim X games
  - `/mockoffseason simseason` - Sim entire season (admin)
  - `/mockoffseason standings` - View current standings
  - `/mockoffseason schedule <team>` - View team schedule/results

#### Simulation Logic
- Use real NBA team ratings + roster changes
- Factor in trades, signings, draft picks
- Injury simulation (random)
- Season progression affects:
  - Draft lottery odds
  - Trade deadline pressure
  - Playoff seeding
  - Cap space planning

#### Win/Loss Impact
- Better rosters = more wins (algorithm-based)
- Star players have larger impact
- Depth matters for consistency
- Coach rating (optional complexity)

---

### 8. **Analytics & Tools**

#### Trade Analyzer
- Projected wins impact
- Value comparison (player rankings)
- Salary cap impact
- Future flexibility rating

#### Contract Comparison Tool
- Compare player to similar contracts
- Market value estimation
- Contract efficiency rating

#### Team Builder
- Project future cap space (1-3 years)
- Cap hold calculator
- Exception tracker
- Luxury tax projections

#### League-Wide Stats
- Average team salary
- Taxpayer count
- Trade volume
- FA signing trends
- Most active GMs

---

### 9. **League Settings & Configuration**

#### Season Setup
- **Commands:**
  - `/mockoffseason create <season_name>` - Create new league (admin)
  - `/mockoffseason settings` - View/edit league settings (admin)
  - `/mockoffseason start` - Begin offseason (admin)
  - `/mockoffseason advance` - Advance to next phase (admin)

#### Season Phases
1. **Pre-Draft**: Trade draft picks, negotiate trades
2. **Draft**: Lottery → Draft selections
3. **Free Agency**: Sign free agents (moratorium period)
4. **Training Camp**: Final roster cuts, extensions
5. **Regular Season**: Simulate games, trade deadline
6. **Playoffs**: Sim playoffs (for next year's order)
7. **Offseason**: Back to phase 1

#### League Settings
```javascript
{
  leagueId: "unique_id",
  seasonName: "2025-26 Mock Offseason",
  phase: "Free Agency",
  salaryCap: 140588000,
  luxuryTax: 170814000,
  firstApron: 178655000,
  secondApron: 189489000,
  tradeDeadline: "2026-02-06",
  draftDate: "2026-06-25",
  settings: {
    allowMultiTeamTrades: true,
    maxTradePartners: 3, // 3-team trades
    requireCommissioner: true, // Trades need admin approval
    autoGradeProposals: true,
    simulationSpeed: "normal", // fast, normal, slow
    injuryFrequency: "realistic",
    allowPickSwaps: true,
    maxFutureDraftYears: 7
  },
  teams: [] // All 30 NBA teams
}
```

---

### 10. **Transaction Log & History**

#### Public Transaction Feed
- **Channel**: Dedicated #mock-offseason-transactions
- Auto-post every trade, signing, waive, draft pick
- Format:
```
🔄 TRADE ALERT
LAL receives: Anthony Davis, 2026 1st (Top-5 protected)
NOP receives: Austin Reaves, Rui Hachimura, 2025 1st, 2027 1st

💰 Salary Impact:
LAL: +$15.2M | NOP: -$8.7M

📊 Trade Grade: LAL B+ | NOP B-
```

#### Transaction Commands
- `/mockoffseason transactions [team]` - View all transactions
- `/mockoffseason timeline` - View league timeline
- `/mockoffseason undo <transactionId>` - Admin reversal

---

### 11. **User Interface & Embeds**

#### Team Dashboard Embed
```
🏀 Los Angeles Lakers - Mock GM Dashboard
👤 GM: @Username

📊 SALARY CAP SITUATION
Total Salary: $183.4M
Cap Space: $0 (over by $42.8M)
Luxury Tax: $12.6M over ($18.5M in tax)
Hard Cap: None

💰 EXCEPTIONS AVAILABLE
Mid-Level: $5.2M (Taxpayer MLE)
Bi-Annual: $4.7M
Trade Exception: $17.1M (expires 7/1/26)

👥 ROSTER (15/15)
[Player list with positions, salaries]

📅 DRAFT PICKS
2026: 1st (own), 2nd (own)
2027: 1st (BKN, Top-10 prot), 2nd (own)

📈 PROJECTED WINS: 52-30

[Buttons: Manage Roster | View Trades | Free Agents | Settings]
```

#### Trade Proposal Embed
```
🔄 TRADE PROPOSAL
From: @GMUser1 (Lakers)
To: @GMUser2 (Clippers)

⬅️ LAKERS SEND:
• Russell Westbrook ($47.1M)
• 2027 2nd Round Pick

➡️ LAKERS RECEIVE:
• Norman Powell ($17.8M)
• Terance Mann ($7.5M)
• 2026 1st (Top-20 protected)

💰 SALARY MATCH: ✅ Valid
Lakers: -$21.8M | Clippers: +$21.8M

⚠️ ISSUES: None

[Buttons: Accept | Reject | Counter | Details]
```

---

### 12. **Advanced Features (Phase 2)**

#### Community Features
- **Trade Veto System**: League vote (optional)
- **Public Trade Block**: Post players available
- **Trade Rumors**: Anonymous trade interests
- **Press Releases**: GMs can announce moves
- **Awards**: Most Active GM, Best Trade, etc.

#### Competitive Elements
- **GM Rankings**: Based on wins, trades, cap management
- **Season Awards**: Executive of the Year
- **Leaderboards**: Most profitable trades, best drafts
- **Achievements**: Badges for milestones

#### Integration Ideas
- **Link to PATS**: Bonus points for good offseason
- **Fantasy League**: Draft teams, score based on GM success
- **Betting**: Predict which teams improve most

#### API/Data Features
- Export/import rosters (JSON)
- Historical data tracking
- Trade machine API
- Cap calculator website companion

---

## 🗄️ Data Storage Structure

### Files Needed
```
data/
  mock-offseason/
    league-settings.json
    teams/
      LAL.json
      BOS.json
      ... (30 teams)
    players/
      all-players.json
      free-agents.json
      draft-prospects.json
    transactions/
      transaction-log.json
      trade-history.json
    simulation/
      season-standings.json
      game-results.json
```

---

## 🎮 Command Structure

### Main Command
- `/mockoffseason` - Hub command with subcommands

### GM Commands
- `join` - Request to be a GM
- `leave` - Resign as GM
- `myteam` - View your team
- `team <name>` - View any team
- `roster` - Detailed roster view
- `cap` - Cap situation breakdown

### Transaction Commands
- `trade create <team>` - Start trade
- `trade add <player/pick>` - Add to trade
- `trade propose` - Send proposal
- `trade accept/reject` - Respond to trade
- `offer <player> <amount>` - Sign free agent
- `waive <player>` - Release player
- `extend <player>` - Extend contract

### League Commands
- `standings` - View standings
- `transactions` - Transaction log
- `freeagents` - Browse FAs
- `draftorder` - Draft picks
- `simulate` - Sim games (admin)

### Tools
- `calculator` - Cap space calculator
- `compare <player1> <player2>` - Contract comparison
- `analyze <trade_id>` - Trade analysis
- `projections` - Future cap projections

---

## 🎨 Additional Ideas & Enhancements

### 1. **Agent System**
- Each FA has an "agent" (bot personality)
- Negotiations feel more realistic
- Some agents are tough negotiators
- Loyalty factors (homegrown players)

### 2. **Media System**
- **Shams/Woj Bot**: Auto-generate trade tweets
- Fake reporter accounts break news
- Player reactions to trades (automated)
- Fan sentiment tracking

### 3. **Player Morale**
- Players want playing time, money, winning
- Unhappy players request trades
- Team chemistry factor in sim
- Veterans mentor rookies (bonus)

### 4. **Coaching Staff**
- Hire coaches (affects sim results)
- Coach contracts and salaries
- Coaching philosophy (defensive, offensive)
- Player development bonuses

### 5. **Injury System**
- Random injuries during sim
- Affects trade value
- Medical staff quality matters
- Hardship exception usage

### 6. **Rule Changes Over Time**
- CBA updates (new aprons, cap increases)
- Rule evolution (like real NBA)
- Historical accuracy if doing past seasons

### 7. **Multi-League Support**
- Run multiple simultaneous leagues
- Different rule sets (no cap league?)
- Historical leagues (2010s, 2000s rosters)
- All-time league with legends

### 8. **Trade Deadline Simulator**
- Special "deadline day" event
- 24-hour window for final trades
- Live transaction feed
- Pressure to improve roster

### 9. **Summer League & Preseason**
- Scout rookies in Summer League
- Preseason games (evaluation)
- Roster bubble players
- Cut down to 15

### 10. **Contract Incentives**
- Performance bonuses (likely/unlikely)
- All-Star bonuses
- Award bonuses
- Playoff performance bonuses

### 11. **International Players**
- EuroLeague scouting
- International draft prospects
- NBA rights to stashed players
- Buyouts for foreign contracts

### 12. **Two-Way Pipeline**
- G-League affiliate management
- Call-ups and assignments
- Development tracking
- Two-way conversions

### 13. **Veteran Leadership**
- Locker room presence stat
- Mentor young players
- Culture building
- Intangibles rating

### 14. **Buyout Market**
- Players agree to buyouts
- Playoff-eligible signings
- Veteran minimum deals
- Ring-chasing mechanics

### 15. **Social Features**
- GM alliances
- Trade partnerships
- Rivalries
- League group chat

---

## 🚀 Implementation Phases

### **Phase 1: Foundation** (Week 1-2)
- [ ] Database structure setup
- [ ] Team assignment system
- [ ] Basic roster display
- [ ] Salary cap calculator
- [ ] Player data import (all NBA players)

### **Phase 2: Trading** (Week 3-4)
- [ ] Trade proposal system
- [ ] Salary matching validation
- [ ] Draft pick trading
- [ ] Trade acceptance/rejection
- [ ] Transaction logging

### **Phase 3: Free Agency** (Week 5-6)
- [ ] Free agent pool
- [ ] Contract offer system
- [ ] AI agent decision logic
- [ ] Exception tracking
- [ ] Bird Rights system

### **Phase 4: Draft** (Week 7)
- [ ] Draft lottery system
- [ ] Draft selection interface
- [ ] Prospect generation/import
- [ ] Rookie contracts

### **Phase 5: Simulation** (Week 8-9)
- [ ] Win/loss simulation engine
- [ ] Season progression
- [ ] Standings tracking
- [ ] Playoff simulation

### **Phase 6: Polish & Advanced** (Week 10+)
- [ ] Analytics tools
- [ ] UI improvements
- [ ] Advanced features
- [ ] Bug fixes
- [ ] Testing with users

---

## ⚠️ Potential Challenges

### Technical
1. **Complex CBA Rules**: Need accurate implementation of all salary cap rules
2. **Data Management**: Large player database with contracts
3. **Trade Validation**: Multi-team trades with salary matching
4. **Performance**: Many simultaneous users making trades
5. **State Management**: Tracking league phase, transactions, rosters

### Design
1. **User Experience**: Making complex cap rules understandable
2. **Balance**: Keeping trades fair without being restrictive
3. **AI Logic**: Free agent decision-making that feels realistic
4. **Engagement**: Keeping all 30 GMs active
5. **Learning Curve**: Teaching new users the system

### Social
1. **Inactivity**: GMs abandoning teams
2. **Unfair Trades**: Collusion or lopsided deals
3. **Arguments**: Disagreements over trade values
4. **Time Commitment**: Some users more active than others
5. **Commissioner Role**: Need fair, active admin

---

## 🎯 Success Metrics

- **Engagement**: 75%+ of GMs active weekly
- **Transactions**: Average 50+ trades per offseason
- **Completion**: League finishes full cycle
- **Satisfaction**: Positive user feedback
- **Retention**: Users return for next season

---

## 💡 Unique Selling Points

1. **Most Realistic**: True CBA rules, not simplified
2. **Educational**: Learn how NBA salary cap works
3. **Community**: 30 users working together/competing
4. **Long-term**: Seasons carry over year to year
5. **Integration**: Ties into existing bot features
6. **Automation**: AI handles tedious calculations
7. **Transparency**: All transactions public and logged

---

## 🤔 Questions to Consider

1. **League Size**: Run with <30 users? AI control unassigned teams?
2. **Season Length**: Real-time or accelerated?
3. **Trade Approval**: Commissioner veto or community vote?
4. **Realism Level**: 100% accurate or simplified for fun?
5. **Multiple Leagues**: Support multiple concurrent seasons?
6. **Historical**: Allow rebuilds of past NBA seasons?
7. **Fantasy Integration**: Connect to fantasy scoring?
8. **Monetization**: Premium features for league hosts?

---

## 📝 Next Steps

1. **Gather Feedback**: Share blueprint with potential users
2. **Refine Scope**: Decide Phase 1 features
3. **Data Collection**: Compile current NBA contracts/rosters
4. **Prototype**: Build basic team + trade system
5. **Test**: Small group testing before full rollout
6. **Launch**: Beta season with volunteer GMs

---

**Ready to build the most comprehensive Discord NBA Mock Offseason system ever created? Let's do this! 🏀**
