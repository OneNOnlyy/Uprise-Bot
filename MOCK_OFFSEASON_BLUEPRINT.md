# Mock Offseason System Blueprint

## 🎯 Overview
A comprehensive NBA Mock Offseason system where users become GMs of NBA teams, managing rosters, trades, free agency, draft picks, and salary cap within realistic NBA rules.

**Key Features:**
- **Random Drawing Lottery System** - Fair team assignment through weighted lottery draws
- **Fully Configurable** - Customizable durations and time limits for all phases
- **Real NBA Draft Integration** - Mock draft using this year's top prospects
- **Complete CBA Compliance** - Salary cap, luxury tax, trade rules, and all NBA regulations
- **GM Experience** - Full control over trades, free agent signings, roster management

---

## 🏗️ Core Systems

### 1. **Team Assignment & GM Lottery System**

#### GM Lottery Process
The GM lottery is a fair system to assign teams to players through a random drawing process.

**How It Works:**
1. **Registration Phase**: Players sign up to participate in the Mock Offseason
2. **Lottery Drawing**: Random order is generated for team selection
3. **Team Selection Draft**: In lottery order, each player selects their preferred team
4. **Assignment Confirmation**: Teams are locked in after selection

**Lottery Configuration:**
```javascript
{
  lotterySettings: {
    enabled: true,
    registrationDuration: 604800000, // 7 days in ms (configurable)
    minParticipants: 10, // Minimum required to start
    maxParticipants: 30, // Max (one per team)
    selectionTimeLimit: 300000, // 5 minutes per pick (configurable)
    autoAssignOnTimeout: true, // Auto-assign highest available team if time expires
    priorityWeighting: {
      enabled: false, // Optional: weight lottery based on criteria
      factors: ["activity", "previousParticipation", "random"]
    },
    reservedTeams: [], // Teams reserved for specific users (admin override)
    excludedTeams: [] // Teams not available for selection
  }
}
```

**Lottery Commands:**
- `/mockoffseason lottery register` - Sign up for the GM lottery
- `/mockoffseason lottery unregister` - Remove yourself from lottery
- `/mockoffseason lottery status` - View registration list and countdown
- `/mockoffseason lottery draw` - Admin triggers the lottery drawing
- `/mockoffseason lottery order` - View the selection order
- `/mockoffseason lottery pick <team>` - Select your team when it's your turn

**Lottery Embed Example:**
```
🎰 GM LOTTERY - TEAM SELECTION DRAFT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 NOW PICKING: @User123 (Pick #7)
⏱️ Time Remaining: 4:32

📋 AVAILABLE TEAMS (23 remaining):
• Boston Celtics       • Miami Heat
• Denver Nuggets       • Phoenix Suns
• Golden State Warriors • Milwaukee Bucks
... (and 17 more)

✅ SELECTED:
1. @User1 → Los Angeles Lakers
2. @User2 → New York Knicks
3. @User3 → Chicago Bulls
... (6 more)

⏳ ON DECK: @User456 (Pick #8)

[Button: Pick Team] [Button: View All Teams] [Button: ❓ Help]
```

#### Team Ownership
- **Commands:**
  - `/mockoffseason join` - Request to become a GM (joins lottery if active)
  - `/mockoffseason assign <user> <team>` - Admin assigns user to team (bypasses lottery)
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
  lotteryInfo: {
    assignedVia: "lottery", // "lottery", "admin", "auto"
    lotteryPosition: 7,
    selectedAt: "2025-12-01T18:30:00Z"
  },
  realWorldStanding: {
    wins: 15,
    losses: 8,
    conferenceRank: 3,
    lotteryOdds: null // Only for non-playoff teams
  },
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

### 1B. **Help & Tutorial System**

Every major interface in the Mock Offseason includes a dedicated **Help button** that provides context-sensitive tutorials and terminology explanations.

#### Help Button Implementation
Each main menu embed includes a `[❓ Help]` button that opens a tutorial specific to that interface.

**Help-Enabled Interfaces:**
- GM Lottery Menu
- Team Dashboard
- Trade Machine
- Free Agency Browser
- Draft Board
- Salary Cap Calculator
- Roster Management
- League Standings

#### Help Modal Structure
```javascript
{
  helpSystem: {
    tutorialModals: {
      lottery: {
        title: "🎰 GM Lottery Help",
        sections: [
          {
            name: "How the Lottery Works",
            content: "The GM Lottery randomly determines the order in which participants can select their team..."
          },
          {
            name: "Key Terms",
            terms: {
              "Lottery Position": "Your randomly assigned number determining when you pick",
              "Selection Window": "The time you have to make your pick (default: 5 minutes)",
              "Auto-Assign": "If time expires, you're assigned the highest-rated available team"
            }
          }
        ]
      },
      
      teamDashboard: {
        title: "🏀 Team Dashboard Help",
        sections: [
          {
            name: "Understanding Your Dashboard",
            content: "Your dashboard shows your team's complete financial and roster situation..."
          },
          {
            name: "Key Terms",
            terms: {
              "Salary Cap": "The soft limit on team payroll ($140.6M). Can exceed using exceptions.",
              "Luxury Tax": "Penalty threshold ($170.8M). Teams over this pay tax on every dollar.",
              "Cap Hold": "Placeholder salary for unsigned free agents with Bird Rights.",
              "Dead Money": "Salary still owed to waived players.",
              "Exceptions": "Tools to sign players when over the cap (MLE, BAE, etc.)"
            }
          }
        ]
      },
      
      tradeMachine: {
        title: "🔄 Trade Machine Help",
        sections: [
          {
            name: "How to Make a Trade",
            content: "1. Start a trade with another team\n2. Add players and/or picks\n3. System validates salary matching\n4. Propose and wait for response"
          },
          {
            name: "Key Terms",
            terms: {
              "Salary Matching": "Rules determining how much salary you can receive based on what you send out.",
              "Trade Exception (TPE)": "Credit from a trade that lets you acquire salary later.",
              "Trade Kicker": "Bonus paid to player when traded (increases trade salary).",
              "No-Trade Clause": "Player can veto any trade. Usually veterans 8+ years, 4+ with team.",
              "Stepien Rule": "Cannot trade first-round picks in consecutive years.",
              "Aggregation": "Combining multiple players' salaries to match one larger salary."
            }
          },
          {
            name: "Salary Matching Quick Reference",
            content: "Under Cap: Receive up to cap space + outgoing\nOver Cap: Receive 175% + $100k\nTaxpayer: Receive 125% + $100k\nFirst Apron: Receive 110%\nSecond Apron: 110%, NO aggregation"
          }
        ]
      },
      
      freeAgency: {
        title: "✍️ Free Agency Help",
        sections: [
          {
            name: "Signing Free Agents",
            content: "How you sign depends on your cap situation and available exceptions..."
          },
          {
            name: "Key Terms",
            terms: {
              "Bird Rights": "Ability to exceed cap to re-sign your own players.",
              "Full Bird": "3+ years with team. Can offer max contract over the cap.",
              "Early Bird": "2 years with team. Can offer 175% of previous salary.",
              "Non-Bird": "1 year with team. Can offer 120% of previous salary.",
              "MLE (Mid-Level Exception)": "Sign players for ~$12.8M when over the cap.",
              "Taxpayer MLE": "Smaller exception (~$5.2M) for teams over tax line.",
              "BAE (Bi-Annual Exception)": "~$4.7M exception available every other year.",
              "Room Exception": "~$7.7M for teams that used cap space.",
              "Moratorium": "Period where deals are negotiated but can't be signed."
            }
          }
        ]
      },
      
      draft: {
        title: "📋 Draft Help",
        sections: [
          {
            name: "Draft Process",
            content: "1. Lottery determines picks 1-14\n2. Remaining picks follow standings\n3. Each GM has limited time to pick\n4. Can trade picks during draft"
          },
          {
            name: "Key Terms",
            terms: {
              "Lottery Odds": "Weighted chances based on team record. Worst teams have best odds.",
              "Rookie Scale": "Predetermined salaries for first-round picks based on slot.",
              "Team Option": "Years 3-4 of rookie deals where team decides to keep or release.",
              "Pick Protection": "Conditions where a traded pick stays with original team.",
              "Pick Swap": "Right to exchange picks with another team if yours is better.",
              "Prospect Tier": "Rating of draft prospect (Franchise, Star, Starter, Rotation, Project)."
            }
          }
        ]
      },
      
      salaryCap: {
        title: "💰 Salary Cap Help",
        sections: [
          {
            name: "Cap System Overview",
            content: "The NBA uses a soft cap with many exceptions. Teams can exceed the cap but face restrictions..."
          },
          {
            name: "Key Terms",
            terms: {
              "Soft Cap": "Can exceed using various exceptions (Bird Rights, MLE, etc.)",
              "Hard Cap": "Absolute limit triggered by certain actions (~$178.6M). Cannot exceed.",
              "Luxury Tax": "Penalty for teams over tax line. Pay $1.50-$4.75 for each $1 over.",
              "Repeater Tax": "Increased tax rate for teams over tax 3 of last 4 years.",
              "First Apron": "$178.6M - triggers hard cap and trading restrictions.",
              "Second Apron": "$189.5M - severe restrictions on trades and signings.",
              "Cap Space": "Room under the cap to sign free agents directly.",
              "Cap Hold": "Placeholder preventing cap space until player signed or renounced."
            }
          }
        ]
      }
    },
    
    // Global glossary accessible from any help menu
    globalGlossary: {
      "CBA": "Collective Bargaining Agreement - rules governing NBA transactions",
      "GM": "General Manager - the user controlling a team",
      "FA": "Free Agent - player not under contract",
      "RFA": "Restricted Free Agent - team can match any offer",
      "UFA": "Unrestricted Free Agent - can sign anywhere",
      "S&T": "Sign-and-Trade - sign player then immediately trade them",
      "TPE": "Trade Player Exception - credit to absorb salary in future trade",
      "MLE": "Mid-Level Exception - primary tool to sign players over cap",
      "BAE": "Bi-Annual Exception - smaller signing exception",
      "NTC": "No-Trade Clause - player can veto trades",
      "QO": "Qualifying Offer - offer that makes player restricted FA"
    }
  }
}
```

#### Help Button in Embeds
Every major embed includes the help button:
```
[❓ Help] [🔄 Refresh] [⚙️ Settings]
```

**Help Command:**
- `/mockoffseason help` - Opens main help menu
- `/mockoffseason help <topic>` - Direct link to specific help
- `/mockoffseason glossary` - Full terminology glossary
- `/mockoffseason tutorial` - Step-by-step new user guide

---

### 1C. **Real Roster Import System**

When a Mock Offseason begins, each team is loaded with their **current real NBA roster** including accurate contracts, salaries, and player details.

#### Roster Data Sources
```javascript
{
  rosterImport: {
    sources: {
      primary: "NBA API", // Official NBA data
      secondary: "ESPN API", // Backup source
      contracts: "Spotrac/HoopsHype", // Contract details
      prospects: "ESPN/NBADraft.net" // Draft prospects
    },
    
    importTiming: {
      trigger: "league_creation", // When admin creates league
      refreshOption: true, // Admin can refresh before starting
      cutoffDate: null // Use current data, or set specific date
    }
  }
}
```

#### Imported Player Data
```javascript
{
  playerImport: {
    // Full player profile
    profile: {
      playerId: "nba_api_id",
      fullName: "LeBron James",
      firstName: "LeBron",
      lastName: "James",
      position: "SF",
      height: "6'9\"",
      weight: 250,
      age: 40,
      yearsInLeague: 22,
      college: "St. Vincent-St. Mary HS",
      country: "USA",
      jerseyNumber: 23
    },
    
    // Contract details
    contract: {
      totalYears: 2,
      currentYear: 1,
      salaryByYear: {
        "2024-25": 48728845,
        "2025-26": 52595382 // Player option
      },
      contractType: "Player Option",
      guaranteed: 48728845,
      tradeBonus: 15, // percentage
      noTradeClause: true,
      signedDate: "2024-07-01",
      signedWith: "LAL"
    },
    
    // Bird Rights tracking
    birdRights: {
      type: "Full", // "Full", "Early", "Non", "None"
      yearsWithTeam: 7,
      acquiredVia: "Free Agency"
    },
    
    // Player ratings (for simulation)
    ratings: {
      overall: 92,
      offense: 95,
      defense: 85,
      potential: 70,
      durability: 75
    }
  }
}
```

#### Full 30-Team Import
```javascript
{
  teamRosters: {
    // Example: Los Angeles Lakers
    "LAL": {
      fullName: "Los Angeles Lakers",
      abbreviation: "LAL",
      city: "Los Angeles",
      conference: "Western",
      division: "Pacific",
      arena: "Crypto.com Arena",
      colors: {
        primary: "#552583",
        secondary: "#FDB927"
      },
      
      currentRecord: {
        wins: 15,
        losses: 8,
        conferenceRank: 3,
        divisionRank: 1
      },
      
      roster: [
        // All 15 roster players with full contract details
        { /* LeBron James data */ },
        { /* Anthony Davis data */ },
        { /* Austin Reaves data */ },
        // ... etc
      ],
      
      twoWayPlayers: [
        // Up to 2 two-way contracts
      ],
      
      draftPicks: {
        owned: [
          { year: 2026, round: 1, fromTeam: "LAL" },
          { year: 2026, round: 2, fromTeam: "LAL" },
          { year: 2027, round: 1, fromTeam: "LAL" },
          { year: 2027, round: 2, fromTeam: "LAL" }
        ],
        tradedAway: [
          { year: 2029, round: 1, toTeam: "NOP", protection: "Unprotected" }
        ],
        incoming: [
          { year: 2027, round: 2, fromTeam: "WAS" }
        ]
      },
      
      capSituation: {
        totalSalary: 183450000,
        luxuryTaxBill: 18500000,
        exceptions: {
          mle: "Taxpayer",
          bae: false, // Used or unavailable
          tpe: []
        }
      }
    },
    
    // ... All 30 NBA teams
  }
}
```

#### Import Commands (Admin)
- `/mockoffseason admin import rosters` - Import all current NBA rosters
- `/mockoffseason admin import team <team>` - Import single team
- `/mockoffseason admin import prospects` - Import 2026 draft class
- `/mockoffseason admin import refresh` - Refresh all data
- `/mockoffseason admin import verify` - Verify data accuracy
- `/mockoffseason admin import date <date>` - Use roster as of specific date

---

### 2. **Salary Cap & CBA Compliance System**

The Mock Offseason enforces real NBA Collective Bargaining Agreement (CBA) rules. GMs must operate within these constraints just like real NBA executives.

#### Current CBA Values (2024-25 Season)
```javascript
{
  cbaValues: {
    salaryCap: 140588000,
    luxuryTaxLine: 170814000,
    firstApron: 178655000,
    secondApron: 189489000,
    
    // Minimum Salaries by Experience
    minimumSalaries: {
      0: 1157153,
      1: 1934215,
      2: 2195867,
      3: 2265127,
      4: 2365196,
      5: 2561042,
      6: 2756888,
      7: 2952734,
      8: 3148580,
      9: 3344426,
      10: 3340346 // 10+ years
    },
    
    // Maximum Salaries by Experience
    maximumSalaries: {
      "0-6": 0.25, // 25% of cap
      "7-9": 0.30, // 30% of cap
      "10+": 0.35  // 35% of cap (supermax)
    },
    
    // Designated Player Rules
    supermax: {
      eligibleCriteria: ["MVP", "DPOY", "All-NBA", "All-Star Starter"],
      maxPercent: 0.35,
      maxYears: 5,
      annualRaise: 0.08 // 8% raises
    }
  }
}
```

#### Cap Calculations
- Auto-calculate team salary in real-time
- Track cap holds for unsigned free agents
- Incomplete roster charges (if under 12 players)
- Bird Rights tracking (Full, Early, Non-Bird)
- Trade exceptions tracking and expiration

#### Luxury Tax Calculator
```
Tax Tiers (2024-25):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
$0-5M over tax line:     $1.50 per $1
$5-10M over:             $1.75 per $1
$10-15M over:            $2.50 per $1
$15-20M over:            $3.25 per $1
$20-25M over:            $3.75 per $1
$25M+ over:              $4.25 per $1 (+$0.50 each additional $5M)

Repeater Tax (3 of last 4 years):
- Multiply rates by approximately 2x-3x
- Example: $1.50 becomes $2.50, etc.
```

#### Hard Cap Scenarios
Teams become hard-capped (cannot exceed First Apron $178.655M) if they:
- Use the Non-Taxpayer Mid-Level Exception
- Use the Bi-Annual Exception
- Acquire a player via Sign-and-Trade
- Receive a player using an MLE from another team via trade

#### Cap Exceptions Available
```javascript
{
  exceptions: {
    // Non-Taxpayer MLE (if under tax apron)
    nonTaxpayerMLE: {
      amount: 12850000,
      maxYears: 4,
      annualRaise: 0.05,
      triggersHardCap: true
    },
    
    // Taxpayer MLE (if over tax, under first apron)
    taxpayerMLE: {
      amount: 5180000,
      maxYears: 2,
      annualRaise: 0.05,
      triggersHardCap: false
    },
    
    // Bi-Annual Exception (every other year)
    bae: {
      amount: 4760000,
      maxYears: 2,
      annualRaise: 0.05,
      triggersHardCap: true
    },
    
    // Room Exception (only if under cap)
    roomException: {
      amount: 7715000,
      maxYears: 2,
      annualRaise: 0.05
    },
    
    // Veteran Minimum
    veteranMinimum: {
      amount: "based on experience",
      maxYears: 2,
      capHit: 1157153 // Only counts minimum for cap
    },
    
    // Traded Player Exceptions (TPE)
    tradeException: {
      duration: 365, // days
      amount: "traded player salary",
      canCombine: false
    }
  }
}
```

#### Bird Rights System
```
BIRD RIGHTS TYPES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Full Bird Rights (3+ years with team):
• Can sign up to max contract
• 5-year max deal
• 8% annual raises
• Go over cap to retain

Early Bird Rights (2 years with team):
• Can sign up to 175% of previous salary
• Or 105% of league average salary
• 4-year max deal
• 8% annual raises

Non-Bird Rights (1 year with team):
• Can sign up to 120% of previous salary
• Or 120% of minimum
• 4-year max deal
• 8% annual raises

Note: Bird Rights are transferred in trades!
```

#### Cap Commands
- `/mockoffseason cap` - View your team's full cap breakdown
- `/mockoffseason cap exceptions` - View available exceptions
- `/mockoffseason cap projection <years>` - Project future cap space
- `/mockoffseason cap taxbill` - Calculate luxury tax owed
- `/mockoffseason cap birdrights <player>` - Check player's Bird Rights status

---

### 3. **Trade System**

#### Trade Mechanics
- **Commands:**
  - `/mockoffseason trade create <team>` - Start trade negotiation
  - `/mockoffseason trade add player <name>` - Add player to outgoing
  - `/mockoffseason trade add pick <year> <round>` - Add draft pick
  - `/mockoffseason trade add cash <amount>` - Add cash consideration
  - `/mockoffseason trade remove <item>` - Remove from trade
  - `/mockoffseason trade propose` - Send trade proposal
  - `/mockoffseason trade accept <tradeId>` - Accept incoming trade
  - `/mockoffseason trade reject <tradeId>` - Reject incoming trade
  - `/mockoffseason trade counter <tradeId>` - Counter-propose
  - `/mockoffseason trade cancel` - Cancel your trade proposal
  - `/mockoffseason trade multi <team2> [team3]` - Start multi-team trade

#### Trade Salary Matching Rules (CBA Compliant)
The system automatically validates all trades against NBA rules:

**By Team Salary Situation:**
```javascript
{
  tradeRules: {
    // Team is under salary cap
    underCap: {
      rule: "Can receive up to cap space + 100% of outgoing",
      formula: "(capSpace + outgoingSalary) >= incomingSalary"
    },
    
    // Over cap but under luxury tax
    overCapUnderTax: {
      rule: "Can receive 175% + $100,000 of outgoing salary",
      formula: "incomingSalary <= (outgoingSalary * 1.75) + 100000",
      note: "If outgoing > $6.533M, use 100% + $5M instead if higher"
    },
    
    // Over luxury tax but under First Apron
    taxpayer: {
      rule: "Can receive 125% + $100,000 of outgoing salary",
      formula: "incomingSalary <= (outgoingSalary * 1.25) + 100000"
    },
    
    // Over First Apron ($178.655M)
    overFirstApron: {
      rule: "Can receive 110% of outgoing salary",
      formula: "incomingSalary <= (outgoingSalary * 1.10)",
      restriction: "Cannot aggregate multiple players' salaries"
    },
    
    // Over Second Apron ($189.489M)
    overSecondApron: {
      rule: "SEVERE restrictions - no salary aggregation",
      restrictions: [
        "Cannot aggregate salaries in trades",
        "Cannot receive player in S&T",
        "Cannot use TPE over $5M",
        "Cannot acquire player whose salary increases by sign-and-trade"
      ]
    }
  }
}
```

#### Player Trade Restrictions (Auto-Enforced)
```javascript
{
  playerRestrictions: {
    noTradeClause: {
      applies: "Veteran players (8+ years, 4+ with team)",
      effect: "Player must approve trade",
      inGame: "Trade auto-rejected unless player waiver granted"
    },
    
    recentlySigned: {
      rule: "Cannot trade player until Dec 15 or 3 months after signing",
      exception: "Unless traded with other players to match salary"
    },
    
    recentlyExtended: {
      rule: "Cannot trade player for 6 months after extension",
      appliesTo: "Players who signed extension"
    },
    
    poisonPill: {
      rule: "Outgoing salary = current year, Incoming = average",
      effect: "Makes some trades difficult to match"
    },
    
    signAndTrade: {
      rule: "Must have Bird Rights, player agrees to 3+ year deal",
      restrictions: [
        "Receiving team cannot be over apron",
        "Triggers hard cap for receiving team",
        "Cannot combine with other exceptions"
      ]
    },
    
    twoWayContracts: {
      rule: "Two-way players CAN be traded",
      salary: "Counts as $0 for matching purposes"
    },
    
    rookieScale: {
      rule: "First round picks on rookie deals",
      restriction: "Cannot be traded with veteran in same deal if over apron"
    }
  }
}
```

#### Draft Pick Trading Rules (Stepien Rule)
```javascript
{
  draftPickRules: {
    stepienRule: {
      rule: "Cannot trade first-round picks in consecutive years",
      enforcement: "Must have at least one 1st rounder every other year",
      swapException: "Pick swaps don't count as trading the pick away"
    },
    
    futurePicks: {
      maxYears: 7, // Can trade up to 7 years out
      protections: [
        "Top-1", "Top-3", "Top-5", "Top-10", "Top-14", 
        "Lottery Protected", "Unprotected"
      ]
    },
    
    stepladderProtections: {
      example: "Top-10 protected 2026, Top-8 in 2027, Top-5 in 2028, Unprotected 2029",
      conveyance: "Pick conveys when protection threshold not met"
    },
    
    pickSwaps: {
      rule: "Trade right to swap picks (take the better one)",
      protections: "Can have protections on swaps too"
    }
  }
}
```

#### Cash Considerations
```javascript
{
  cashRules: {
    maxPerTrade: 5880000, // $5.88M max cash in single trade
    maxPerSeason: 5880000, // $5.88M max total given/received per year
    capImpact: "None - doesn't affect salary matching",
    use: "Sweetener for trades, offload bad contracts"
  }
}
```

#### Trade Interface
Interactive embed with:
- **Team A side** (your team): Players/picks outgoing
- **Team B side** (their team): Players/picks incoming
- **Salary Matcher**: Real-time validation with specific rule being applied
- **Cap Impact**: Show before/after cap situation
- **CBA Violations**: Any rule violations highlighted in red
- **Trade Grade**: Auto-grade based on value (optional)
- **Buttons**: Add Player, Add Pick, Add Cash, Propose, Cancel

---

### 4. **Free Agency System**

#### Free Agency Timeline
```
FREE AGENCY SCHEDULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1: Moratorium Period (3 days default)
• Teams can negotiate with free agents
• Cannot officially sign contracts
• Verbal agreements only

Phase 2: Free Agency Opens
• Contracts can be signed
• Signings become official
• Cap space committed

Phase 3: Ongoing Period (configurable)
• Remaining FAs sign
• Market settles
• Minimum contracts

Trade Deadline During Season
• Mid-season trade activity
• Buyout market opens after deadline
```

#### Free Agent Pool
- **Commands:**
  - `/mockoffseason freeagents` - Browse available FAs
  - `/mockoffseason freeagents position <PG/SG/SF/PF/C>` - Filter by position
  - `/mockoffseason freeagents tier <max/starter/role/min>` - Filter by tier
  - `/mockoffseason freeagents search <name>` - Search for player
  - `/mockoffseason offer <player> <years> <salary>` - Make contract offer
  - `/mockoffseason offer withdraw <player>` - Withdraw an offer
  - `/mockoffseason offers pending` - View your outstanding offers

#### Contract Types & Signing Methods

**1. Cap Space Signing**
```javascript
{
  capSpaceSigning: {
    requirement: "Team must be under salary cap",
    maxContract: "Up to player's maximum salary",
    maxYears: 4, // 5 for Bird Rights re-sign
    raises: "5% annual (non-Bird) or 8% (Bird)"
  }
}
```

**2. Using Exceptions**
```javascript
{
  exceptionSignings: {
    nonTaxpayerMLE: {
      amount: 12850000,
      years: 4,
      raises: "5%",
      eligibility: "Team under first apron",
      hardCap: true
    },
    taxpayerMLE: {
      amount: 5180000,
      years: 2,
      raises: "5%",
      eligibility: "Team under first apron",
      hardCap: false
    },
    biAnnualException: {
      amount: 4760000,
      years: 2,
      raises: "5%",
      eligibility: "Under apron, every other year",
      hardCap: true
    },
    roomException: {
      amount: 7715000,
      years: 2,
      raises: "5%",
      eligibility: "Team used cap space this offseason"
    },
    minimumException: {
      amount: "Based on years of service",
      years: 2,
      capHit: "League minimum (prorated)",
      eligibility: "Any team"
    }
  }
}
```

**3. Re-Signing Own Free Agents (Bird Rights)**
```javascript
{
  birdRightsSignings: {
    fullBird: {
      requirement: "3+ consecutive years",
      maxContract: "Player's max based on experience",
      maxYears: 5,
      raises: "8% annual",
      overCap: true
    },
    earlyBird: {
      requirement: "2 consecutive years",
      maxContract: "175% of previous salary OR 105% of avg salary",
      maxYears: 4,
      raises: "8%",
      overCap: true
    },
    nonBird: {
      requirement: "1 year with team",
      maxContract: "120% of previous salary OR 120% of minimum",
      maxYears: 4,
      raises: "8%",
      overCap: true
    }
  }
}
```

#### Free Agent Decision Logic (AI-Powered)
The bot evaluates offers based on realistic criteria:

```javascript
{
  faDecisionFactors: {
    money: {
      weight: 0.35,
      factors: ["Total value", "Average annual", "Guaranteed money"]
    },
    role: {
      weight: 0.20,
      factors: ["Starting opportunity", "Minutes", "Usage rate"]
    },
    winning: {
      weight: 0.25,
      factors: ["Team record", "Playoff contender", "Championship window"]
    },
    market: {
      weight: 0.10,
      factors: ["Big market appeal", "Media exposure", "Legacy building"]
    },
    loyalty: {
      weight: 0.10,
      factors: ["Years with team", "Fan connection", "Front office trust"]
    }
  },
  
  // Player personality types
  personalities: {
    ringChaser: { winning: 0.50, money: 0.15 },
    moneyMotivated: { money: 0.50, winning: 0.15 },
    loyalVeteran: { loyalty: 0.40, money: 0.25 },
    starSeeker: { role: 0.40, market: 0.25 },
    balanced: "Default weights"
  }
}
```

#### Free Agent Tiers
```
FREE AGENT TIERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 MAX PLAYERS ($50M+)
• All-NBA caliber stars
• Require: Max contract + competitive team
• Example: Top 15-20 players

⭐ NEAR-MAX ($25-50M)
• All-Star level players
• Require: Near-max + starting role + decent team
• Example: Top 50 players

💪 QUALITY STARTERS ($10-25M)
• Solid starters
• Accept: Market value offers
• More negotiable

🔧 ROLE PLAYERS ($5-10M)
• Rotation pieces
• Accept: Reasonable offers
• Focus on fit and opportunity

📋 MINIMUM PLAYERS (<$5M)
• End of bench, veterans
• Accept: Most offers
• Looking for roster spot
```

#### Signing Process
1. GM makes offer with years/salary/exception type
2. System validates offer against CBA rules
3. AI agent evaluates offer based on player profile
4. Player accepts/rejects/counters (automated with delays for realism)
5. If accepted, contract is added to team, cap adjusted
6. Transaction logged and announced

---

### 5. **NBA Draft System**

#### Real-World Lottery Integration
Draft order is based on where teams finish in real life, creating authentic lottery placements.

**How Draft Order Works:**
1. **Real NBA Standings Import**: System tracks actual NBA team records
2. **Lottery Odds Assignment**: Non-playoff teams get lottery odds based on record
3. **Lottery Simulation**: Run the draft lottery (weighted random)
4. **Draft Order Finalized**: Combine lottery results + playoff team order

**Lottery Odds (2024-25 Format):**
```javascript
{
  lotteryOdds: {
    1: 14.0,   // Worst record
    2: 14.0,   // 2nd worst
    3: 14.0,   // 3rd worst
    4: 12.5,
    5: 10.5,
    6: 9.0,
    7: 7.5,
    8: 6.0,
    9: 4.5,
    10: 3.0,
    11: 2.0,
    12: 1.5,
    13: 1.0,
    14: 0.5
  },
  maxJumpSpots: 4 // Can only move up 4 spots max
}
```

**Draft Configuration:**
```javascript
{
  draftSettings: {
    enabled: true,
    year: 2025,
    rounds: 2,
    picksPerRound: 30,
    pickTimeLimit: 180000, // 3 minutes per pick (configurable)
    extendedTimeLimit: 300000, // 5 minutes for top 5 picks
    autoPickOnTimeout: true, // Auto-select best available
    tradeDuringDraft: true, // Allow pick trading during draft
    draftLotteryDate: "2025-05-13",
    draftDate: "2025-06-26",
    prospectPool: "2025_class" // Import real 2025 draft class
  }
}
```

#### Draft Commands
- `/mockoffseason lottery run` - Run draft lottery simulation (admin)
- `/mockoffseason draft order` - View current draft order
- `/mockoffseason draft board` - View available prospects
- `/mockoffseason draft pick <player>` - Make your draft selection
- `/mockoffseason draft trade <team>` - Propose pick trade during draft
- `/mockoffseason draft results` - View completed draft results

#### 2026 Draft Prospect Pool
```javascript
{
  draftYear: 2026,
  prospects: [
    {
      prospectId: "unique_id",
      name: "Cooper Flagg",
      position: "SF/PF",
      school: "Duke",
      age: 18,
      height: "6'9\"",
      weight: 205,
      projectedPick: 1,
      tier: "franchise", // "franchise", "star", "starter", "rotation", "project"
      strengths: ["Two-way potential", "Versatility", "Basketball IQ"],
      weaknesses: ["Perimeter shooting"],
      comparison: "Scottie Pippen/Paul George hybrid",
      rookieSalary: {
        year1: 12365640, // Based on slot
        year2: 12983922,
        year3: 13602204, // Team option
        year4: 14220486  // Team option
      }
    },
    {
      prospectId: "unique_id_2",
      name: "Dylan Harper",
      position: "PG/SG",
      school: "Rutgers",
      age: 19,
      projectedPick: 2,
      tier: "star"
    },
    {
      prospectId: "unique_id_3",
      name: "Ace Bailey",
      position: "SF/SG",
      school: "Rutgers",
      age: 19,
      projectedPick: 3,
      tier: "star"
    },
    // ... Top 60 prospects imported from real 2026 draft class
  ]
}
```

#### Draft Interface
```
🏀 2026 NBA DRAFT - ROUND 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 ON THE CLOCK: Atlanta Hawks (Pick #1)
👤 GM: @HawksGM
⏱️ Time Remaining: 2:45

📊 TOP AVAILABLE PROSPECTS (2026 Class):
1. Cooper Flagg (SF/PF) - Duke - Tier: Franchise
2. Dylan Harper (PG/SG) - Rutgers - Tier: Star
3. Ace Bailey (SF/SG) - Rutgers - Tier: Star
4. VJ Edgecombe (SG) - Baylor - Tier: Star
5. Kon Knueppel (SG/SF) - Duke - Tier: Starter

✅ DRAFTED:
(Waiting for first pick...)

⏳ ON DECK: Washington Wizards (Pick #2)

[Button: Make Selection] [Button: View All Prospects] [Button: Trade Pick] [Button: ❓ Help]
```

#### Rookie Scale Contracts
All first-round picks sign rookie scale contracts (4 years):
- Years 1-2: Guaranteed
- Years 3-4: Team options
- Salary based on draft slot (updated annually)

Second-round picks:
- Negotiate any deal up to 4 years
- Often minimum or slightly above
- No guaranteed money required

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

#### Master Configuration System
All durations and time limits are fully configurable by admins.

**Global Timing Configuration:**
```javascript
{
  timingConfig: {
    // GM Lottery Settings
    lottery: {
      registrationPeriod: 604800000, // 7 days
      pickTimeLimit: 300000, // 5 minutes
      reminderWarning: 60000, // 1 minute warning
    },
    
    // Draft Settings
    draft: {
      pickTimeLimit: 180000, // 3 minutes standard
      top5PickTimeLimit: 300000, // 5 minutes for top 5
      secondRoundTimeLimit: 120000, // 2 minutes
      tradeNegotiationWindow: 300000, // 5 min during draft
      reminderWarning: 30000, // 30 second warning
    },
    
    // Trade Settings
    trades: {
      proposalExpiration: 86400000, // 24 hours to respond
      negotiationTimeout: 604800000, // 7 days max negotiation
      adminApprovalWindow: 172800000, // 48 hours for admin review
      vetoWindow: 86400000, // 24 hours for league veto (if enabled)
      reminderInterval: 21600000, // 6 hour reminders
    },
    
    // Free Agency Settings
    freeAgency: {
      moratoriumPeriod: 259200000, // 3 days (no signings)
      offerExpiration: 172800000, // 48 hours for player response
      negotiationTimeout: 604800000, // 7 days max
      maxConcurrentOffers: 5, // Per team
      biddingRoundDuration: 86400000, // 24 hours per round
    },
    
    // Phase Settings
    phases: {
      preDraft: 604800000, // 7 days
      draftDay: 86400000, // 1 day
      freeAgencyMoratorium: 259200000, // 3 days
      freeAgencyPeriod: 1209600000, // 14 days
      trainingCamp: 604800000, // 7 days
      regularSeason: 2592000000, // 30 days (simulated)
      tradeDeadlineWindow: 259200000, // 3 days before deadline
      playoffs: 604800000, // 7 days
    },
    
    // Inactivity Settings
    inactivity: {
      warningThreshold: 259200000, // 3 days no activity
      gmRemovalThreshold: 604800000, // 7 days = auto-remove
      dailyActivityCheck: true,
      notifyOnWarning: true,
    }
  }
}
```

**Admin Timing Commands:**
- `/mockoffseason config timing <phase> <duration>` - Set phase duration
- `/mockoffseason config picklimit <seconds>` - Set pick time limits
- `/mockoffseason config tradewindow <hours>` - Set trade response window
- `/mockoffseason config extend <phase> <duration>` - Extend current phase
- `/mockoffseason config pause` - Pause all timers
- `/mockoffseason config resume` - Resume timers

#### Season Setup
- **Commands:**
  - `/mockoffseason create <season_name>` - Create new league (admin)
  - `/mockoffseason settings` - View/edit league settings (admin)
  - `/mockoffseason start` - Begin offseason (admin)
  - `/mockoffseason advance` - Advance to next phase (admin)

#### Season Phases
1. **GM Lottery**: Players register and draft teams
2. **Pre-Draft**: Trade draft picks, negotiate trades
3. **Draft Lottery**: Run lottery based on real NBA standings
4. **Draft**: Lottery → Draft selections
5. **Free Agency Moratorium**: Negotiate but cannot sign
6. **Free Agency**: Sign free agents
7. **Training Camp**: Final roster cuts, extensions
8. **Regular Season**: Simulate games, trade deadline
9. **Trade Deadline**: Final trading window
10. **Playoffs**: Sim playoffs (for next year's order)
11. **Offseason**: Back to phase 1

#### League Settings
```javascript
{
  leagueId: "unique_id",
  seasonName: "2025-26 Mock Offseason",
  phase: "Free Agency",
  phaseStartTime: "2025-12-01T00:00:00Z",
  phaseEndTime: "2025-12-15T00:00:00Z",
  
  // CBA Settings (Current 2024-25 values)
  salaryCap: 140588000,
  luxuryTax: 170814000,
  firstApron: 178655000,
  secondApron: 189489000,
  minimumSalary: 1157153, // 0 years experience
  maximumSalary: 51915000, // 10+ years, 35% of cap
  
  // Key Dates
  tradeDeadline: "2026-02-06",
  draftLotteryDate: "2026-05-13",
  draftDate: "2026-06-25",
  freeAgencyStart: "2026-06-30",
  
  // Configurable Rules
  settings: {
    allowMultiTeamTrades: true,
    maxTradePartners: 3, // 3-team trades
    requireCommissioner: true, // Trades need admin approval
    communityVeto: false, // League vote on trades
    vetoThreshold: 0.66, // 66% to veto
    autoGradeProposals: true,
    simulationSpeed: "normal", // fast, normal, slow
    injuryFrequency: "realistic",
    allowPickSwaps: true,
    maxFutureDraftYears: 7,
    stepienRuleEnforced: true, // Can't trade consecutive firsts
    hardCapEnforcement: true,
    
    // GM Lottery Settings
    gmLotteryEnabled: true,
    minGMsToStart: 10,
    maxGMsPerTeam: 1,
    assistantGMsAllowed: true,
    maxAssistantGMs: 2,
    
    // Timing Overrides (or use defaults above)
    customTiming: {} // Override specific timings
  },
  teams: [] // All 30 NBA teams
}
```

---

### 10. **Transaction Log & History**

#### Public Transaction Feed
- **Channel**: Dedicated #mock-offseason-transactions
- Auto-post every trade, signing, waive, draft pick via Mock Media system
- All transactions logged and searchable in League Hub

#### Transaction Format (in News Channel)
```
🔄 TRADE ALERT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LAL receives:
• Anthony Davis ($43.2M)
• 2026 1st Round Pick (Top-5 protected)

NOP receives:
• Austin Reaves ($12.0M)
• Rui Hachimura ($17.0M)
• 2025 1st Round Pick
• 2027 1st Round Pick

💰 Salary Impact:
LAL: +$15.2M | NOP: -$15.2M

📊 Trade Grade: LAL B+ | NOP B-

Completed: <t:1735689600:F>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 11. **Advanced Features (Phase 2)**

#### Community Features
- **Trade Veto System**: League vote (optional)
- **Public Trade Block**: Post players available
- **Trade Rumors**: Anonymous trade interests via news feed
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
- Real-time roster sync from NBA APIs

---

### 13. **Additional Feature Ideas**

#### 🏆 Season-Long Competitions
```javascript
{
  competitions: {
    gmOfTheMonth: {
      criteria: ["Most trades", "Best trade value", "Cap management"],
      prize: "Recognition + special role"
    },
    
    tankBowl: {
      description: "Competition for worst record (best lottery odds)",
      rules: "Intentionally trading away talent",
      award: "First overall pick"
    },
    
    dynastyBuilder: {
      description: "Multi-season tracking of team success",
      criteria: ["Championships", "Playoff appearances", "Draft hits"],
      leaderboard: true
    },
    
    capMaster: {
      description: "Award for best salary cap management",
      criteria: ["Most cap flexibility", "Best value contracts", "Avoided luxury tax"]
    }
  }
}
```

#### 📰 Mock Media & Reporters System
Auto-generated breaking news messages for all transactions, styled after real NBA insiders.

```javascript
{
  mediaSystem: {
    enabled: true,
    channel: "#mock-offseason-news",
    
    reporters: {
      woj: {
        name: "MockWoj",
        avatar: "woj_avatar.png",
        style: "Breaking, terse, immediate",
        template: "Breaking: {team} {action} {details}, sources tell @MockWoj."
      },
      shams: {
        name: "MockShams", 
        avatar: "shams_avatar.png",
        style: "Detailed, analytical follow-up",
        template: "{player} has agreed to {action} with the {team}, sources say. {details}"
      }
    },
    
    // Message templates by transaction type
    templates: {
      tradeCompleted: [
        "🚨 BREAKING: The {team1} are trading {players1} to the {team2} for {players2}, sources tell @MockWoj.",
        "Trade alert: {team1} sending {players1} to {team2}. {team2} sends back {players2}. Deal is done.",
        "Sources: {team1} and {team2} have agreed to a trade. {details}"
      ],
      
      tradeNegotiations: [
        "The {team1} and {team2} have engaged in trade discussions centered around {player}, per sources.",
        "Sources say {team1} has expressed interest in acquiring {player} from {team2}.",
        "{team1} and {team2} are in active trade talks, league sources confirm."
      ],
      
      freeAgentSigned: [
        "🖊️ {player} has agreed to a {years}-year, ${money} deal with the {team}, sources tell @MockShams.",
        "Free agent {player} is signing with the {team} on a {years}-year contract worth ${money}, per sources.",
        "BREAKING: {player} to the {team}. {years} years, ${money}. Deal done."
      ],
      
      freeAgentMeeting: [
        "{player} is meeting with the {team} today, sources say.",
        "The {team} are among the teams meeting with free agent {player} this week.",
        "{team} has emerged as a serious suitor for {player}, per league sources."
      ],
      
      playerWaived: [
        "The {team} have waived {player}, sources confirm.",
        "{team} releasing {player} to create roster flexibility.",
        "Sources: {player} has been waived by the {team}."
      ],
      
      extensionSigned: [
        "🖊️ {player} has agreed to a {years}-year, ${money} extension with the {team}.",
        "BREAKING: {team} and {player} agree to {years}-year extension worth ${money}.",
        "{player} staying with {team} on a new {years}-year, ${money} deal."
      ],
      
      draftPick: [
        "With the #{pick} pick in the 2026 NBA Draft, the {team} select {player} from {school}.",
        "🏀 PICK IS IN: {team} take {player} at #{pick}.",
        "The {team} have selected {player} with the #{pick} overall pick."
      ],
      
      tradeRumor: [
        "👀 League sources indicate {team} is actively shopping {player}.",
        "Multiple teams have inquired about {player}'s availability, per sources.",
        "{team} listening to offers on {player}, sources say."
      ]
    },
    
    // Timing configuration
    timing: {
      breakingNews: 0, // Immediate for completed transactions
      followUp: 300000, // 5 min later for details
      rumorDelay: "random", // Random delay for realism
      batchAnnouncements: false // Each transaction gets own message
    }
  }
}
```

**Example News Feed Messages:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 @MockWoj • Just now

BREAKING: The Los Angeles Lakers are trading 
D'Angelo Russell and a 2027 second-round pick 
to the Miami Heat for Tyler Herro, sources 
tell @MockWoj.

💬 12  🔄 34  ❤️ 89
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🖊️ @MockShams • 2 hours ago

Free agent Patrick Beverley has agreed to a 
1-year, $2.1M deal with the Los Angeles Lakers, 
sources tell @MockShams. Beverley returns to LA 
after previous stint with the Clippers.

💬 5  🔄 12  ❤️ 45
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👀 @MockWoj • 5 hours ago

League sources indicate the Phoenix Suns are 
actively listening to offers for Bradley Beal. 
Several teams have expressed interest.

💬 28  🔄 67  ❤️ 134
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 🎙️ Press Conference System
```javascript
{
  pressConferences: {
    triggers: [
      "Major trade completed",
      "Star free agent signed",
      "Draft night",
      "Season start"
    ],
    
    format: {
      gmStatement: "GM writes brief statement",
      autoQuestions: "Bot generates reporter questions",
      publicThread: "Community can react"
    }
  }
}
```

#### 📊 Advanced Analytics Dashboard
```javascript
{
  analytics: {
    teamAnalytics: {
      projectedWins: "Based on roster strength",
      offensiveRating: "Points per 100 possessions",
      defensiveRating: "Points allowed per 100",
      netRating: "Offensive - Defensive",
      capEfficiency: "Wins per dollar spent",
      futureAssets: "Draft pick value score"
    },
    
    tradeAnalytics: {
      winNowImpact: "Immediate win change",
      futureImpact: "Long-term value change",
      capImpact: "Flexibility change",
      fairnessScore: "How balanced the trade is"
    },
    
    playerAnalytics: {
      contractValue: "Performance vs salary",
      tradeValue: "Market value in trades",
      projectedDecline: "Age-based projection"
    }
  }
}
```

#### 🤝 Alliance & Rivalry System
```javascript
{
  relationships: {
    alliances: {
      description: "GMs can form trading partnerships",
      benefits: ["Trade priority", "Info sharing", "Draft day cooperation"],
      maxAllies: 3
    },
    
    rivalries: {
      description: "Auto-generated based on trade history",
      effects: ["Harder negotiations", "Trade premium required"],
      publicDisplay: true
    },
    
    reputation: {
      trackingFactors: ["Trade fairness", "Promise keeping", "Communication"],
      effects: "Other GMs may refuse trades with bad reputation"
    }
  }
}
```

#### 🎯 Scenario Challenges
```javascript
{
  scenarios: {
    examples: [
      {
        name: "Tank Commander",
        goal: "Acquire most draft picks in one season",
        reward: "Special badge"
      },
      {
        name: "Cap Wizard",
        goal: "Create $30M+ in cap space while staying competitive",
        reward: "Special badge"
      },
      {
        name: "Trade Machine",
        goal: "Complete 10+ trades in one offseason",
        reward: "Special badge"
      },
      {
        name: "Hometown Hero",
        goal: "Re-sign all your own free agents",
        reward: "Special badge"
      },
      {
        name: "Super Team Builder",
        goal: "Assemble 3 All-Star caliber players",
        reward: "Special badge"
      }
    ],
    
    weeklyChallenge: {
      rotating: true,
      communityVoting: "Vote for next week's challenge"
    }
  }
}
```

#### 📱 Notification System
```javascript
{
  notifications: {
    dmNotifications: {
      tradeProposal: true,
      tradeAccepted: true,
      tradeRejected: true,
      yourPick: true, // Draft/Lottery
      freeAgentResponse: true,
      phaseChange: true,
      inactivityWarning: true
    },
    
    channelAlerts: {
      majorTrades: "#mock-offseason-transactions",
      allTransactions: "#mock-offseason-log",
      phaseChanges: "#mock-offseason-announcements",
      leaderboards: "#mock-offseason-standings"
    },
    
    customizable: true // Users can toggle
  }
}
```

#### 🏅 Achievement System
```javascript
{
  achievements: {
    categories: {
      trading: [
        { name: "First Trade", description: "Complete your first trade", icon: "🔄" },
        { name: "Trade Master", description: "Complete 25 trades", icon: "🏆" },
        { name: "Blockbuster", description: "Complete a trade with 5+ players", icon: "💥" },
        { name: "Fleece Artist", description: "Win a trade by 20+ value points", icon: "🐑" }
      ],
      
      drafting: [
        { name: "Draft Day", description: "Make your first draft pick", icon: "📋" },
        { name: "Lottery Winner", description: "Win the #1 pick in lottery", icon: "🎰" },
        { name: "Steal Finder", description: "Draft a star in round 2", icon: "💎" }
      ],
      
      freeAgency: [
        { name: "Big Fish", description: "Sign a max free agent", icon: "🐟" },
        { name: "Value Hunter", description: "Sign 5 players on minimum deals", icon: "💰" },
        { name: "Bird Watcher", description: "Re-sign a player using Bird Rights", icon: "🐦" }
      ],
      
      management: [
        { name: "Cap Genius", description: "Stay under luxury tax for full season", icon: "🧮" },
        { name: "Dynasty Builder", description: "Win 3 championships", icon: "👑" },
        { name: "Active GM", description: "Log in 30 consecutive days", icon: "📅" }
      ]
    },
    
    display: "Profile and team page",
    rarity: ["Common", "Rare", "Epic", "Legendary"]
  }
}
```

#### 🔮 What-If Simulator
```javascript
{
  whatIfSimulator: {
    description: "Test hypothetical trades before proposing",
    features: [
      "See projected win impact",
      "View cap implications",
      "Test salary matching",
      "Compare trade scenarios"
    ],
    
    privacy: "Only visible to you",
    command: "/mockoffseason whatif"
  }
}
```

#### 📈 Historical Tracking
```javascript
{
  history: {
    trackAcrossSeasons: true,
    
    gmHistory: {
      teamsManaged: ["LAL", "BOS"],
      careerTrades: 47,
      championships: 2,
      playoffAppearances: 5,
      bestDraftPick: "Cooper Flagg (2026)",
      biggestTrade: "Anthony Davis deal"
    },
    
    leagueHistory: {
      pastChampions: ["2025: @User (LAL)", "2024: @User2 (BOS)"],
      notableTrades: [],
      draftHistory: [],
      recordBook: {
        mostTrades: { user: "@User", count: 23, season: "2025-26" },
        biggestSalary: { team: "GSW", amount: 250000000, season: "2025-26" }
      }
    }
  }
}
```

#### 🎲 Random Events (Optional)
```javascript
{
  randomEvents: {
    enabled: false, // Admin toggle
    
    eventTypes: [
      {
        name: "Star Player Trade Request",
        description: "A star player demands a trade",
        frequency: "Rare",
        effect: "Must trade player within X days or morale penalty"
      },
      {
        name: "Salary Cap Spike",
        description: "New TV deal increases cap",
        frequency: "Very Rare",
        effect: "All teams get more cap space"
      },
      {
        name: "International Star Enters Draft",
        description: "Surprise prospect added to draft",
        frequency: "Rare",
        effect: "New lottery prospect available"
      },
      {
        name: "Ownership Change",
        description: "New owner demands winning/tanking",
        frequency: "Rare",
        effect: "Team gets new objectives"
      }
    ]
  }
}
```

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

### Single Entry Point (Users)
The entire Mock Offseason system is accessed through **one command** that opens the main dashboard:

```
/mock dashboard
```

All user interactions happen through **embed menus, buttons, select menus, and modals** - no additional commands needed.

### Admin Commands
Admins have access to both the Admin Panel (via dashboard) AND slash commands for quick actions:

```
/mock admin create <season_name>     - Create a new Mock Offseason league
/mock admin start                    - Start the current season
/mock admin advance                  - Advance to next phase
/mock admin pause                    - Pause all timers
/mock admin resume                   - Resume timers
/mock admin import rosters           - Import current NBA rosters
/mock admin import prospects         - Import 2026 draft class
/mock admin assign <user> <team>     - Manually assign GM to team
/mock admin remove <user>            - Remove GM from team
/mock admin reset                    - Reset the entire league (confirmation required)
/mock admin announce <message>       - Send announcement to all GMs
/mock admin undo <transaction_id>    - Undo a transaction
/mock admin config                   - Open config panel
```

---

## 🖥️ Dashboard & Navigation System

### Main Dashboard
The `/mockoffseason` command opens the central hub for all Mock Offseason activities.

```
🏀 MOCK OFFSEASON DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 GM: @Username
🏟️ Team: Los Angeles Lakers
📅 Current Phase: Free Agency (Day 5 of 14)
⏱️ Phase Ends: <t:1735689600:R>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 CAP SNAPSHOT
Salary: $183.4M | Cap: $140.6M
Tax Bill: $18.5M | Space: $0

📊 QUICK STATS
Roster: 15/15 | Picks: 4 | Pending Trades: 2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔔 NOTIFICATIONS (3)
• Trade proposal from @CelticsGM
• Free agent response: Patrick Beverley
• Phase advancing in 2 days

[Select Menu: Navigate to...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🏀 My Team] [🔄 Trades] [✍️ Free Agency] [📋 Draft]
[📊 League] [🔮 What-If] [⚙️ Settings] [❓ Help]
```

### Navigation Select Menu Options
```javascript
{
  navigationMenu: {
    options: [
      { label: "🏀 My Team", description: "View roster, cap, and team management", value: "team_dashboard" },
      { label: "🔄 Trade Center", description: "Create, view, and manage trades", value: "trade_center" },
      { label: "✍️ Free Agency", description: "Browse and sign free agents", value: "free_agency" },
      { label: "📋 Draft Room", description: "Draft board, lottery, and picks", value: "draft_room" },
      { label: "📊 League Hub", description: "Standings, transactions, teams", value: "league_hub" },
      { label: "🔮 What-If Lab", description: "Test hypothetical trades", value: "whatif_lab" },
      { label: "🎰 GM Lottery", description: "Register or view lottery status", value: "gm_lottery" },
      { label: "🏆 Achievements", description: "View badges and progress", value: "achievements" },
      { label: "📰 News Feed", description: "Latest transactions and rumors", value: "news_feed" },
      { label: "⚙️ Settings", description: "Notifications and preferences", value: "settings" },
      { label: "❓ Help Center", description: "Tutorials and glossary", value: "help_center" }
    ]
  }
}
```

---

### 📱 Menu Screens

#### 🏀 My Team Dashboard
```
🏀 LOS ANGELES LAKERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 GM: @Username | 🏆 Record: 15-8 (3rd West)

💰 SALARY CAP SITUATION
┌─────────────────────────────────────┐
│ Total Salary:     $183,450,000      │
│ Salary Cap:       $140,588,000      │
│ Over Cap By:      $42,862,000       │
│ Luxury Tax Line:  $170,814,000      │
│ Tax Bill:         $18,500,000       │
│ Hard Capped:      ❌ No             │
└─────────────────────────────────────┘

💳 EXCEPTIONS AVAILABLE
• Taxpayer MLE: $5.18M (unused)
• Bi-Annual: $4.76M (unused)
• Trade Exception: $17.1M (exp. 7/1/26)

👥 ROSTER (15/15) - Select to manage
┌────────────────────────────────────────┐
│ ⭐ LeBron James    SF  $48.7M  2yr PO │
│ ⭐ Anthony Davis   PF  $43.2M  3yr    │
│    Austin Reaves   SG  $12.0M  4yr    │
│    D'Angelo Russell PG $18.7M  1yr    │
│    ... (click to see full roster)     │
└────────────────────────────────────────┘

📅 DRAFT PICKS
• 2026: 1st (own), 2nd (own)
• 2027: 1st (BKN - Top 10 prot), 2nd (own)

[Select: Choose Player to Manage]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 Full Roster] [💰 Cap Details] [📅 Picks] [🔙 Back]
[❓ Help]
```

#### 🔄 Trade Center
```
🔄 TRADE CENTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📥 INCOMING PROPOSALS (2)
┌─────────────────────────────────────────┐
│ 🟡 From: Boston Celtics (@CelticsGM)   │
│    Receiving: Jaylen Brown, 2027 1st   │
│    Sending: AD, Austin Reaves          │
│    ⏱️ Expires: <t:1735689600:R>        │
│    [View] [Accept] [Reject] [Counter]  │
├─────────────────────────────────────────┤
│ 🟡 From: Phoenix Suns (@SunsGM)        │
│    Receiving: Devin Booker             │
│    Sending: D'Angelo Russell, picks    │
│    ⏱️ Expires: <t:1735776000:R>        │
│    [View] [Accept] [Reject] [Counter]  │
└─────────────────────────────────────────┘

📤 YOUR PROPOSALS (1)
┌─────────────────────────────────────────┐
│ 🟢 To: Miami Heat (@HeatGM)            │
│    Status: Awaiting Response           │
│    [View] [Edit] [Cancel]              │
└─────────────────────────────────────────┘

🔧 ACTIVE NEGOTIATIONS (0)
No active trade negotiations.

[Select Menu: Start Trade With Team...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[➕ New Trade] [📜 Trade History] [🔮 What-If] [🔙 Back]
[❓ Help]
```

#### ➕ Trade Builder Screen
```
🔄 TRADE BUILDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trading with: Miami Heat (@HeatGM)

⬅️ YOU SEND                ➡️ YOU RECEIVE
┌──────────────────┐      ┌──────────────────┐
│ D'Angelo Russell │      │ (empty)          │
│ $18.7M           │      │                  │
│ [❌ Remove]      │      │                  │
│                  │      │                  │
│ 2027 2nd Round   │      │                  │
│ [❌ Remove]      │      │                  │
└──────────────────┘      └──────────────────┘
Total: $18.7M             Total: $0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 SALARY MATCH: ❌ Invalid
You must receive between $0 - $32.8M
(175% + $100k rule applies)

⚠️ ISSUES:
• Trade is one-sided - add players from Miami

[Select: Add Your Player] [Select: Request Their Player]
[Select: Add Your Pick]   [Select: Request Their Pick]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[💵 Add Cash] [📤 Propose Trade] [🗑️ Clear All] [🔙 Back]
[❓ Help]
```

#### ✍️ Free Agency Hub
```
✍️ FREE AGENCY HUB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Day 5 of 14 | ⏱️ Ends: <t:1735689600:R>

🔥 TOP AVAILABLE FREE AGENTS
┌─────────────────────────────────────────┐
│ ⭐ Paul George   SF  Age: 35           │
│    Last: $45.0M | Asking: Max          │
│    Bird Rights: None (UFA)             │
│    Interest: High 🔥🔥🔥               │
│    [Make Offer]                        │
├─────────────────────────────────────────┤
│ ⭐ Klay Thompson SG  Age: 35           │
│    Last: $28.0M | Asking: $20M+        │
│    Bird Rights: None (UFA)             │
│    Interest: Medium 🔥🔥               │
│    [Make Offer]                        │
├─────────────────────────────────────────┤
│    Patrick Beverley PG Age: 36         │
│    Last: $2.5M | Asking: Minimum       │
│    Interest: Low 🔥                    │
│    [Make Offer]                        │
└─────────────────────────────────────────┘

📋 YOUR PENDING OFFERS (1)
┌─────────────────────────────────────────┐
│ To: Patrick Beverley                    │
│ Offer: 1yr / $2.1M (Minimum)           │
│ Status: 🤔 Considering...              │
│ Response in: ~4 hours                   │
│ [Withdraw Offer]                        │
└─────────────────────────────────────────┘

[Select Menu: Filter by Position/Tier...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🔍 Search Player] [📊 Sort By] [💰 My Cap Space] [🔙 Back]
[❓ Help]
```

#### 📋 Draft Room
```
📋 DRAFT ROOM - 2026 NBA DRAFT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Status: Pre-Draft | Lottery: May 13, 2026

🎰 YOUR LOTTERY POSITION
Based on current standings: 22nd (non-lottery)
Lottery Odds: N/A (playoff team)

📅 YOUR PICKS
┌─────────────────────────────────────────┐
│ 2026 Round 1: #22 (projected)          │
│ 2026 Round 2: #52 (projected)          │
│ 2027 Round 1: BKN (Top-10 protected)   │
│ 2027 Round 2: #45 (projected)          │
└─────────────────────────────────────────┘

🌟 TOP 2026 PROSPECTS
┌─────────────────────────────────────────┐
│ 1. Cooper Flagg    SF/PF  Duke         │
│    Tier: 🏆 Franchise | Age: 18        │
│    Proj: #1 Overall                    │
│    [View Scouting Report]              │
├─────────────────────────────────────────┤
│ 2. Dylan Harper    PG/SG  Rutgers      │
│    Tier: ⭐ Star | Age: 19             │
│    Proj: #2-3 Overall                  │
│    [View Scouting Report]              │
├─────────────────────────────────────────┤
│ 3. Ace Bailey      SF/SG  Rutgers      │
│    Tier: ⭐ Star | Age: 19             │
│    Proj: #2-4 Overall                  │
│    [View Scouting Report]              │
└─────────────────────────────────────────┘

[Select Menu: Browse All Prospects...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📊 Full Board] [🔄 Trade Picks] [📈 Mock Draft] [🔙 Back]
[❓ Help]
```

#### 🎰 GM Lottery Screen (Pre-Season)
```
🎰 GM LOTTERY - TEAM SELECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Status: Selection In Progress
👥 Registered: 24/30

🟢 NOW SELECTING: @User7 (Pick #7)
⏱️ Time Remaining: 3:42

📋 AVAILABLE TEAMS (23 remaining)
┌─────────────────────────────────────────┐
│ Boston Celtics      | Denver Nuggets    │
│ Milwaukee Bucks     | Phoenix Suns      │
│ Miami Heat          | Golden State      │
│ Cleveland Cavaliers | Dallas Mavericks  │
│ Philadelphia 76ers  | Sacramento Kings  │
│ ... (11 more)                           │
└─────────────────────────────────────────┘

✅ ALREADY SELECTED
┌─────────────────────────────────────────┐
│ #1 @User1 → Los Angeles Lakers         │
│ #2 @User2 → New York Knicks            │
│ #3 @User3 → Chicago Bulls              │
│ #4 @User4 → Brooklyn Nets              │
│ #5 @User5 → LA Clippers                │
│ #6 @User6 → Toronto Raptors            │
└─────────────────────────────────────────┘

⏳ ON DECK: @User8 (#8), @User9 (#9)

[Select Menu: Pick Your Team (if your turn)]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 All Teams Info] [👥 Participants] [🔙 Back]
[❓ Help]
```

#### 📊 League Hub
```
📊 LEAGUE HUB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏀 2025-26 Mock Offseason | Phase: Free Agency

📈 STANDINGS
┌─────────────────────────────────────────┐
│ WESTERN CONFERENCE                      │
│ 1. OKC Thunder    18-5  @ThunderGM     │
│ 2. Denver Nuggets 16-7  @NuggetsGM     │
│ 3. LA Lakers      15-8  @You           │
│ 4. Phoenix Suns   14-9  @SunsGM        │
│ 5. Dallas Mavs    13-10 @MavsGM        │
├─────────────────────────────────────────┤
│ EASTERN CONFERENCE                      │
│ 1. Boston Celtics 19-4  @CelticsGM     │
│ 2. Milwaukee Bucks 17-6 @BucksGM       │
│ 3. Cleveland Cavs 16-7  @CavsGM        │
│ ... (click to see all)                 │
└─────────────────────────────────────────┘

📰 RECENT TRANSACTIONS
┌─────────────────────────────────────────┐
│ 🔄 BOS traded Marcus Smart to MEM      │
│    for Luke Kennard + 2027 2nd         │
│    - 2 hours ago                       │
├─────────────────────────────────────────┤
│ ✍️ PHX signed Montrezl Harrell         │
│    2yr / $6.2M (Taxpayer MLE)          │
│    - 5 hours ago                       │
└─────────────────────────────────────────┘

[Select Menu: View Team...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📋 Full Standings] [📜 All Transactions] [🏆 Leaderboard] [🔙 Back]
[❓ Help]
```

#### 🔮 What-If Lab
```
🔮 WHAT-IF LAB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test hypothetical trades before proposing them.
These simulations are private - only you can see them.

📝 CURRENT SIMULATION
┌─────────────────────────────────────────┐
│ Trading: LAL ↔️ MIA                     │
│                                         │
│ LAL Sends:        MIA Sends:           │
│ • D'Angelo Russell • Tyler Herro       │
│ • 2027 2nd        • 2026 2nd           │
│                                         │
│ $18.7M out        $27.0M in            │
└─────────────────────────────────────────┘

📊 SIMULATION RESULTS
┌─────────────────────────────────────────┐
│ ✅ Salary Match: VALID                  │
│    (Within 175% + $100k threshold)     │
│                                         │
│ 📈 Projected Impact:                   │
│    LAL Wins: +2.3 (54-28 → 56-26)      │
│    MIA Wins: -1.1 (48-34 → 47-35)      │
│                                         │
│ 💰 Cap Impact:                         │
│    LAL: +$8.3M salary                  │
│    Tax Bill: +$12.4M                   │
│                                         │
│ 📋 Trade Grade:                        │
│    LAL: B+ | MIA: B-                   │
└─────────────────────────────────────────┘

[Select: Add/Remove Players & Picks]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[📤 Convert to Real Trade] [🗑️ Clear] [💾 Save] [🔙 Back]
[❓ Help]
```

#### ❓ Help Center
```
❓ HELP CENTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Welcome to the Mock Offseason Help Center!

📚 TUTORIALS
┌─────────────────────────────────────────┐
│ 🆕 Getting Started (New GMs)           │
│ 🏀 Managing Your Team                  │
│ 🔄 How to Make Trades                  │
│ ✍️ Signing Free Agents                 │
│ 📋 Understanding the Draft             │
│ 💰 Salary Cap Explained                │
│ 📜 CBA Rules Overview                  │
└─────────────────────────────────────────┘

📖 GLOSSARY
┌─────────────────────────────────────────┐
│ Quick search for any NBA/CBA term      │
│                                         │
│ Popular Terms:                         │
│ • Bird Rights    • MLE                 │
│ • Salary Cap     • Trade Exception     │
│ • Luxury Tax     • Apron               │
│ • Hard Cap       • Stepien Rule        │
└─────────────────────────────────────────┘

❔ FAQ
┌─────────────────────────────────────────┐
│ • How do I make a trade?               │
│ • Why can't I sign this player?        │
│ • What is a hard cap?                  │
│ • How does the draft lottery work?     │
└─────────────────────────────────────────┘

[Select Menu: Choose Help Topic...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[🔍 Search Glossary] [📧 Contact Admin] [🔙 Back]
```

---

### 🔔 Modal Pop-ups

#### Make Offer Modal (Free Agency)
```
┌─────────────────────────────────────────┐
│ ✍️ MAKE CONTRACT OFFER                 │
│                                         │
│ Player: Paul George (SF)               │
│ Age: 35 | Last Salary: $45.0M          │
│                                         │
│ Contract Length:                       │
│ [Dropdown: 1-4 years        ▼]         │
│                                         │
│ Annual Salary:                         │
│ [$____________] (Max: $35.1M)          │
│                                         │
│ Signing Method:                        │
│ [Dropdown: Cap Space / MLE / etc ▼]    │
│                                         │
│ ⚠️ This will hard cap your team        │
│                                         │
│ [Cancel]              [Submit Offer]   │
└─────────────────────────────────────────┘
```

#### Player Management Modal
```
┌─────────────────────────────────────────┐
│ 👤 PLAYER MANAGEMENT                   │
│                                         │
│ D'Angelo Russell - PG                  │
│ $18.7M | 1 year remaining              │
│ Bird Rights: Full                      │
│                                         │
│ ACTIONS:                               │
│ [🔄 Include in Trade]                  │
│ [📝 Extend Contract]                   │
│ [✂️ Waive Player]                      │
│ [📊 View Full Profile]                 │
│                                         │
│ [Cancel]                               │
└─────────────────────────────────────────┘
```

---

### Admin Dashboard (Admin Only)
Admins access additional controls via a special admin panel:

```
⚙️ ADMIN CONTROL PANEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏀 2025-26 Mock Offseason

📅 PHASE CONTROL
Current: Free Agency (Day 5/14)
[⏭️ Advance Phase] [⏸️ Pause] [⏱️ Extend]

👥 GM MANAGEMENT
Active GMs: 28/30
[Assign GM] [Remove GM] [View Activity]

📊 LEAGUE SETTINGS
[⚙️ Timing Config] [📜 Rules] [🔄 Import Data]

🔧 TOOLS
[🔄 Force Refresh] [↩️ Undo Transaction] [📢 Announcement]

📋 PENDING APPROVALS (3)
• Trade: LAL ↔️ BOS (awaiting review)
• Trade: MIA ↔️ PHX (awaiting review)  
• GM Request: @NewUser wants to join
```

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

### **Phase 1: Foundation & Lottery** (Week 1-2)
- [ ] Database structure setup
- [ ] GM Lottery registration system
- [ ] Lottery drawing algorithm
- [ ] Team selection draft interface
- [ ] Team assignment system
- [ ] Basic roster display
- [ ] Player data import (all NBA players)
- [ ] Configurable timing system

### **Phase 2: Salary Cap & CBA** (Week 3-4)
- [ ] Full salary cap calculator
- [ ] CBA rules engine
- [ ] Cap exceptions tracking
- [ ] Bird Rights calculations
- [ ] Luxury tax calculator
- [ ] Hard cap detection
- [ ] Cap hold system

### **Phase 3: Trading** (Week 5-6)
- [ ] Trade proposal system
- [ ] Salary matching validation (all CBA rules)
- [ ] Draft pick trading with protections
- [ ] Stepien Rule enforcement
- [ ] Trade acceptance/rejection
- [ ] Multi-team trade support
- [ ] Transaction logging
- [ ] Trade exception generation

### **Phase 4: Free Agency** (Week 7-8)
- [ ] Free agent pool with real players
- [ ] Contract offer system
- [ ] AI agent decision logic
- [ ] All exception types (MLE, BAE, etc.)
- [ ] Bird Rights re-signing
- [ ] Sign-and-trade system
- [ ] Moratorium period handling

### **Phase 5: Draft System** (Week 9-10)
- [ ] Import 2026 draft prospects
- [ ] Real NBA standings integration
- [ ] Draft lottery simulation
- [ ] Draft selection interface
- [ ] Rookie scale contracts
- [ ] Draft day trading
- [ ] Pick time limits

### **Phase 6: Simulation** (Week 11-12)
- [ ] Win/loss simulation engine
- [ ] Season progression
- [ ] Standings tracking
- [ ] Playoff simulation
- [ ] Trade deadline event

### **Phase 7: Polish & Advanced** (Week 13+)
- [ ] Analytics tools
- [ ] UI improvements
- [ ] Advanced features (media, morale)
- [ ] Bug fixes
- [ ] Testing with users
- [ ] Documentation

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

---

## 📚 Quick Reference Guide

### CBA Numbers At-A-Glance (2024-25)
| Value | Amount |
|-------|--------|
| Salary Cap | $140,588,000 |
| Luxury Tax | $170,814,000 |
| First Apron | $178,655,000 |
| Second Apron | $189,489,000 |
| Non-Taxpayer MLE | $12,850,000 |
| Taxpayer MLE | $5,180,000 |
| Bi-Annual Exception | $4,760,000 |
| Room Exception | $7,715,000 |
| Max Cash in Trade | $5,880,000 |

### Trade Salary Matching Quick Guide
| Your Team Situation | Can Receive |
|---------------------|-------------|
| Under Salary Cap | Cap space + 100% of outgoing |
| Over Cap, Under Tax | 175% + $100k (or 100% + $5M) |
| Taxpayer (over tax line) | 125% + $100k |
| Over First Apron | 110% only |
| Over Second Apron | 110%, NO aggregation |

### Max Contract by Experience
| Years in NBA | Max % of Cap | Max Salary |
|--------------|--------------|------------|
| 0-6 Years | 25% | ~$35.1M |
| 7-9 Years | 30% | ~$42.2M |
| 10+ Years | 35% | ~$49.2M |

### Bird Rights Summary
| Type | Years Required | Max Contract | Max Years | Raises |
|------|----------------|--------------|-----------|--------|
| Full Bird | 3+ | Player Max | 5 | 8% |
| Early Bird | 2 | 175% prev / 105% avg | 4 | 8% |
| Non-Bird | 1 | 120% prev / 120% min | 4 | 8% |

### Draft Lottery Odds (Top 4 Picks)
| Standing | Odds |
|----------|------|
| 1st Worst | 14.0% |
| 2nd Worst | 14.0% |
| 3rd Worst | 14.0% |
| 4th Worst | 12.5% |
| 5th Worst | 10.5% |
| 6th Worst | 9.0% |
| 7th Worst | 7.5% |
| 8th Worst | 6.0% |
| 9th Worst | 4.5% |
| 10th Worst | 3.0% |
| 11th Worst | 2.0% |
| 12th Worst | 1.5% |
| 13th Worst | 1.0% |
| 14th Worst | 0.5% |

### Key Restrictions to Remember
- ❌ Cannot trade consecutive first-round picks (Stepien Rule)
- ❌ Cannot trade player for 6 months after extension
- ❌ Cannot sign players during moratorium
- ❌ Cannot exceed hard cap if triggered
- ❌ Over Second Apron teams cannot aggregate salaries
- ❌ Max 7 years into future for pick trades

### Phase Timeline (Default Durations)
| Phase | Duration |
|-------|----------|
| GM Lottery Registration | 7 days |
| Pre-Draft | 7 days |
| Draft Day | 1 day |
| FA Moratorium | 3 days |
| Free Agency | 14 days |
| Training Camp | 7 days |
| Regular Season | 30 days |
| Playoffs | 7 days |
