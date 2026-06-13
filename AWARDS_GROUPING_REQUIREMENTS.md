# Awards Display Grouping Requirements

## Display Structure by Season

### Seasons 1-15 (Historical)
**Display Order:**
1. Individual Awards (Season-level awards only)

**No weekly or round-based grouping**

---

### Seasons 16-17 (S16, S17)
**Display Order:**
1. **Individual Awards** (Season-level awards at top)
2. **Last Week Awards** (Most recent week)
3. **POTD from Round 21 to highest** (descending order)
4. **Week Awards** (for rounds 21+)
5. **POTD from Round 20 to 14** (descending order)
6. **Week Awards** (for rounds 14-20)
7. **POTD from Round 13 to 8** (descending order)
8. **Week Awards** (for rounds 8-13)
9. **POTD from Round 7 to 1** (descending order)
10. **Week Awards** (for rounds 1-7)

**Grouping Logic:**
- Individual awards shown first
- Then group by round ranges: 21+, 20-14, 13-8, 7-1
- Within each range: Show POTD awards first, then week summary award
- POTD awards within each range are shown from highest round to lowest

---

### Seasons 18+ (S18, S19, etc.)
**Display Order:**
1. **Individual Awards** (Season-level awards at top)
2. **For each 7-round block** (descending from highest):
   - POTD from rounds in that block (descending order)
   - Week award for that block

**Grouping Logic:**
- If season has 21 rounds:
  - Week 3: Rounds 21-15 → Show POTD (21, 20, 19, 18, 17, 16, 15) then Week 3 award
  - Week 2: Rounds 14-8 → Show POTD (14, 13, 12, 11, 10, 9, 8) then Week 2 award
  - Week 1: Rounds 7-1 → Show POTD (7, 6, 5, 4, 3, 2, 1) then Week 1 award

---

## Implementation Notes

### Award Types to Identify:
- **Individual Awards:** Season-level awards (no round_number or week_number)
- **POTD Awards:** Round-specific awards (have round_number)
- **Week Awards:** Weekly summary awards (have week_number)

### Sorting Rules:
1. Individual awards always at the top
2. Within round ranges, show from highest round to lowest
3. Week awards come after all POTD awards in their range

### Data Structure:
```typescript
interface Award {
  id: string;
  award_type: string;
  round_number?: number;
  week_number?: number;
  season_id: string;
  // ... other fields
}
```

### Season Detection:
```typescript
const getSeasonNumber = (seasonId: string): number => {
  const match = seasonId.match(/\d+/);
  return match ? parseInt(match[0]) : 0;
};
```
