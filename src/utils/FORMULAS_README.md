# Staffing Signal - Business Logic Formulas

This document explains all the formulas used in the Staffing Signal application. Each formula is implemented in `formulas.js` with human-readable descriptions.

## Table of Contents

1. [Public Page Formulas](#public-page-formulas)
2. [Private Page Formulas](#private-page-formulas)
3. [Shared Formulas](#shared-formulas)
4. [Helper Functions](#helper-functions)

---

## Public Page Formulas

### Section 1: KPIs (Key Performance Indicators)

#### Formula 1: Count Firms in Segment
**Function:** `countFirmsInSegment(firms, segment)`

**What it does:**
Counts how many firms belong to a specific industry segment.

**Example:**
- If there are 150 technology firms, this returns `150`
- If "All segments" is selected, it counts all firms

**Where it's used:**
- Public dashboard KPI card "Firms in this segment"

---

#### Formula 2: Find Top State for Segment
**Function:** `findTopStateForSegment(firms, segment)`

**What it does:**
Identifies which US state has the most headcount growth (in absolute numbers) for firms in a segment.

**How it works:**
1. For each state, calculates total headcount growth in actual employees added
2. Example: A company with 100 employees growing at 3% = +3 employees
3. Adds up all employee growth across all firms in that state
4. The state with the highest total wins

**Example:**
- California firms added 10,000 total employees
- Texas added 8,000
- → California is #1

**Where it's used:**
- Public dashboard KPI card "Top state for this segment"

---

#### Formula 3: Calculate 1-Year Growth for Segment
**Function:** `calculateSegmentGrowth(firms, segment)`

**What it does:**
Calculates the average 1-year growth rate for all firms in a segment.

**How it works:**
1. Collects 1-year growth rate from each firm (e.g., 3%, 5%, -2%)
2. Adds all growth rates together
3. Divides by number of firms to get average

**Example:**
- 3 firms with 5%, 10%, 15% growth
- → Average is 10%

**Where it's used:**
- Public dashboard KPI card "1-year growth for this segment"

---

### Section 2: Heatmap

#### Formula 4: Calculate Headcount Growth for a State
**Function:** `calculateStateAverageGrowth(firms, stateCode, timeframe)`

**What it does:**
Calculates the average growth rate of all firms headquartered in a specific state.

**Example:**
- California has 100 firms with average 5% growth
- → Returns 5

**Where it's used:**
- Heatmap tooltip showing "Headcount growth"
- Color coding of states on the map

---

#### Formula 5: Count Firms in State
**Function:** `countFirmsInState(firms, stateCode)`

**What it does:**
Counts how many firms are headquartered in a specific state.

**Example:**
- 150 firms are headquartered in California
- → Returns 150

**Where it's used:**
- Heatmap tooltip showing "Firms in view"

---

#### Formula 6: Calculate Total Headcount for State
**Function:** `calculateStateTotalHeadcount(firms, stateCode)`

**What it does:**
Estimates total number of employees at all firms in a state.

**How it works:**
Adds up employee count from each firm in the state.

**Example:**
- 3 firms with 100, 200, and 300 employees
- → Total is 600

**Where it's used:**
- Heatmap tooltip showing "Total headcount (est.)"

---

### Section 3: Top States Ranking

#### Formula 7: Calculate Top 5 States by Average Growth
**Function:** `calculateTopStatesByGrowth(firms, topCount)`

**What it does:**
Ranks all states by their average 1-year growth rate and returns the top 5.

**How it works:**
1. For each state, calculates average growth rate of all its firms
2. Sorts states from highest to lowest
3. Takes top 5

**Example:**
- Arizona avg 12%
- Nevada avg 10%
- Florida avg 8%
- → These are top 3

**Where it's used:**
- "Top 5 states by 1-yr growth (avg %)" sidebar on heatmap

---

## Private Page Formulas

### Section 1: KPIs (Key Performance Indicators)

#### Formula 8: Count Firms in View
**Function:** `countFirmsInView(firms)`

**What it does:**
Counts total number of firms visible after all filters are applied.

**Example:**
- After filtering by segment and size, 45 firms remain
- → Returns 45

**Where it's used:**
- Protected dashboard KPI card "Firms in this view"

---

#### Formula 9: Calculate Median 1-Year Growth
**Function:** `calculateMedianGrowth(firms)`

**What it does:**
Finds the median (middle value) of 1-year growth rates for all firms in view.

**Why median instead of average:**
The median is better than average when there are outliers (extremely high or low values).

**How it works:**
1. Collects all 1-year growth rates
2. Sorts them from lowest to highest
3. Picks the middle value

**Example:**
- Growth rates: [2%, 5%, 7%, 9%, 15%]
- → Median is 7%

**Where it's used:**
- Protected dashboard KPI card "Median 1-yr growth"

---

#### Formula 10: Calculate Top Segments by Growth
**Function:** `calculateTopSegmentsByGrowth(firms, topCount)`

**What it does:**
Identifies which industry segments have the highest average growth rates.

**How it works:**
1. Groups firms by industry segment
2. Calculates average growth for each segment
3. Sorts by growth (highest first)
4. Returns top 3

**Example:**
- Technology: 15% avg
- Healthcare: 12% avg
- Finance: 8% avg
- → These are top 3

**Where it's used:**
- Protected dashboard KPI card "Top Segments in this view"
- Public heatmap sidebar "Top 3 Segments by 1-Y growth"

---

#### Formula 11: Find Top City in View
**Function:** `findTopCity(firms)`

**What it does:**
Identifies which city has the most firms in the current view.

**How it works:**
1. Counts how many firms are in each city
2. Finds the city with most firms

**Example:**
- San Francisco has 25 firms
- Austin has 20 firms
- → San Francisco is top city

**Where it's used:**
- Protected dashboard KPI card "Top city in this view"

---

### Section 2: County-Level Map

#### Formula 12: Calculate City Average Growth
**Function:** `calculateCityAverageGrowth(firms, cityName, timeframe)`

**What it does:**
Calculates average growth rate for all firms in a specific city.

**Example:**
- 5 firms in Austin with 3%, 5%, 7%, 9%, 11% growth
- → Average is 7%

**Where it's used:**
- County map tooltip showing growth for cities

---

#### Formula 13: Count Firms in City
**Function:** `countFirmsInCity(firms, cityName)`

**What it does:**
Counts how many firms are in a specific city.

**Example:**
- 15 firms are in Travis County (Austin area)
- → Returns 15

**Where it's used:**
- County map showing "Firms in this county"

---

#### Formula 14: Calculate Total Headcount for City
**Function:** `calculateCityTotalHeadcount(firms, cityName)`

**What it does:**
Estimates total employees at all firms in a city/county.

**Example:**
- 3 firms with 50, 100, 150 employees
- → Total is 300

**Where it's used:**
- County map showing "Total headcount (est)"

---

#### Formula 15: Calculate Cities in County with Stats
**Function:** `calculateCitiesInCounty(firms, timeframe)`

**What it does:**
For a county, lists all cities with their firm count and estimated growth.

**Example:**
Travis County has:
- Austin: 20 firms, +150 employees
- Round Rock: 5 firms, +30 employees

**Where it's used:**
- County map showing "Cities (Total Firms, estimated growth)"

---

### Section 3: Peer Group Comparison

#### Formula 16: Get Your Average Growth
**Function:** `getUserAverageGrowth(userGrowthInput)`

**What it does:**
Takes the user's self-reported internal headcount growth rate.

**Example:**
- User said their company grew 8%
- → Returns 8

**Where it's used:**
- Peer comparison section showing "Your average growth"

---

#### Formula 17: Calculate Peer Median Growth
**Function:** `calculatePeerMedianGrowth(allFirms, userSegment, userSizeBucket)`

**What it does:**
Finds median growth rate of "peer" firms (companies similar to yours).

**What are peers:**
Firms in the same industry segment AND same size bucket.

**How it works:**
1. Filters to find peer firms
2. Collects their 1-year growth rates
3. Calculates median (middle value)

**Example:**
- Your peers have growth rates: [3%, 5%, 7%, 9%, 12%]
- → Median is 7%

**Where it's used:**
- Peer comparison section showing "Peer Median growth"

---

#### Formula 18: Calculate Growth Gap vs Peers
**Function:** `calculateGrowthGap(userGrowth, peerMedianGrowth)`

**What it does:**
Calculates how much faster or slower you're growing compared to peers.

**Formula:**
```
Gap = Your growth - Peer median growth
```

**Interpretation:**
- Positive gap = You're growing faster than peers ✅
- Negative gap = You're growing slower than peers ⚠️

**Example:**
- Your growth: 10%
- Peer median: 7%
- → Gap is +3% (you're ahead!)

**Another example:**
- Your growth: 4%
- Peer median: 7%
- → Gap is -3% (you're behind)

**Where it's used:**
- Peer comparison section showing position relative to peers

---

## Shared Formulas

### Formula 19: Calculate Average Headcount Growth Across Timeframes
**Function:** `calculateAverageHeadcountGrowth(firm)`

**What it does:**
For a single firm, calculates average growth rate across multiple timeframes.

**How it works:**
1. Gets 6-month, 1-year, and 2-year growth rates
2. Averages them together
3. Skips any missing values

**Example:**
- Firm has:
  - 6M growth: 4%
  - 1Y growth: 6%
  - 2Y growth: 8%
- → Average is 6%

**Where it's used:**
- Protected dashboard table column "Avg Headcount Growth"

---

## Helper Functions

### Convert Decimal to Percentage
**Function:** `convertDecimalToPercentage(decimalValue)`

**What it does:**
Converts Airtable's decimal format to percentage.

**How Airtable stores growth:**
- 0.03 = 3%
- -0.1 = -10%
- 0.5 = 50%

**Examples:**
- 0.03 → 3
- -0.1 → -10

---

### Calculate Median
**Function:** `calculateMedian(numbers)`

**What it does:**
Finds the middle value in a sorted list.

**How it works:**
- Odd count: Returns middle value
- Even count: Returns average of two middle values

**Examples:**
- [1, 3, 5, 7, 9] → Median is 5
- [1, 3, 5, 7] → Median is 4 (average of 3 and 5)

---

### Calculate Average
**Function:** `calculateAverage(numbers)`

**What it does:**
Calculates the mean (sum divided by count).

**Example:**
- [10, 20, 30]
- → Average is 20 (because 60 ÷ 3 = 20)

---

### Format Growth Percentage
**Function:** `formatGrowthPercentage(growthValue, decimalPlaces)`

**What it does:**
Formats a number as a percentage string with +/- sign.

**Examples:**
- 5.2 → "+5.2%"
- -3.7 → "-3.7%"
- 0 → "0%"

---

### Format Number
**Function:** `formatNumber(num)`

**What it does:**
Formats large numbers with comma separators.

**Examples:**
- 1234567 → "1,234,567"
- 500 → "500"

---

## Data Flow Diagram

```
Airtable Database
    ↓
Returns decimals (e.g., 0.03, -0.1)
    ↓
JavaScript stores as decimals
    ↓
formulas.js converts to percentages (0.03 → 3)
    ↓
Display as formatted strings ("+3%", "-10%")
```

---

## Quick Reference: Where Each Formula is Used

| Formula # | Formula Name | Public Page | Private Page |
|-----------|-------------|-------------|--------------|
| 1 | Count firms in segment | ✓ KPI | |
| 2 | Top state for segment | ✓ KPI | |
| 3 | Segment growth | ✓ KPI | |
| 4 | State average growth | ✓ Heatmap | |
| 5 | Count firms in state | ✓ Heatmap | |
| 6 | State total headcount | ✓ Heatmap | |
| 7 | Top states by growth | ✓ Ranking | |
| 8 | Count firms in view | | ✓ KPI |
| 9 | Median growth | | ✓ KPI |
| 10 | Top segments by growth | ✓ Ranking | ✓ KPI |
| 11 | Top city in view | | ✓ KPI |
| 12 | City average growth | | ✓ County Map |
| 13 | Count firms in city | | ✓ County Map |
| 14 | City total headcount | | ✓ County Map |
| 15 | Cities in county | | ✓ County Map |
| 16 | User average growth | | ✓ Peer Group |
| 17 | Peer median growth | | ✓ Peer Group |
| 18 | Growth gap | | ✓ Peer Group |
| 19 | Avg headcount growth | | ✓ Table |

---

## Contributing

When adding new calculations:
1. Add the formula to `formulas.js` with a clear description
2. Update this README with the new formula
3. Add examples showing how it works
4. Document where it's used in the application
