# Tracking & Completion API Reference

## Endpoints Overview

### 1. POST /api/track
**Purpose**: Record a video view/completion event

**Request**:
```bash
curl -X POST http://localhost:3001/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "title": "Video Title",
    "category": "Category Name",
    "watchedSeconds": 120,
    "percent_watched": 65,
    "status": "Completed",
    "last_position_s": 120,
    "last_seen_at": "2026-01-16 13:30:00"
  }'
```

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | ✅ Yes | User email address |
| title | string | ✅ Yes | Video/course title |
| category | string | ❌ No | Course category |
| watchedSeconds | number | ❌ No | Actual play time in seconds (skips not counted) |
| percent_watched | number | ❌ No | Percentage of video watched (0-100) |
| status | string | ❌ No | "Completed", "Partial", etc. |
| last_position_s | number | ❌ No | Last position in seconds |
| last_seen_at | string | ❌ No | Timestamp of last viewing |

**Responses**:

✅ **Completion Recorded** (65%+ watched):
```json
{
  "ok": true,
  "completed": true
}
```
- Data written to `Completions` sheet in Google Sheets
- Affects leaderboard rankings

✅ **Insufficient Watch Time** (<65%):
```json
{
  "ok": true,
  "completed": false,
  "message": "Not yet at 65% completion threshold. Record skipped."
}
```
- No write to database
- User can continue watching

⚠️ **Throttled** (duplicate within 10s):
```json
{
  "ok": true,
  "throttled": true
}
```
- Same video by same user, too soon
- Prevents spam writes

❌ **Error** (missing email/title):
```json
{
  "ok": false,
  "message": "Missing email/title"
}
```

---

### 2. GET /api/completions
**Purpose**: Retrieve completion records for a user

**Request**:
```bash
curl "http://localhost:3001/api/completions?email=user@example.com"
```

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | ✅ Yes | User email to retrieve completions for |

**Response**:
```json
{
  "ok": true,
  "data": [
    {
      "id": 0,
      "timestamp": "16/1/2026, 2:18:12 pm",
      "email": "user@example.com",
      "title": "Facial Kit- Hindi",
      "category": "Natures Essence - Face",
      "watchedSeconds": 150,
      "autoCompleted": "TRUE",
      "status": "Completed",
      "lastPosition": 150,
      "percentWatched": 75,
      "lastSeenAt": "16/1/2026, 2:18:12 pm"
    }
  ],
  "count": 1,
  "totalHours": "0.04"
}
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| ok | boolean | Request success status |
| data | array | List of completion records |
| count | number | Total completions for user |
| totalHours | string | Total hours watched (sum) |

**Each completion record includes**:
- `id`: Record index
- `timestamp`: When completion was recorded (IST)
- `email`: User email
- `title`: Course/video title
- `category`: Course category
- `watchedSeconds`: Actual watch time (skips excluded)
- `autoCompleted`: TRUE if auto-completed, FALSE if manual
- `status`: Completed/Partial/etc.
- `lastPosition`: Last playback position (seconds)
- `percentWatched`: Watch percentage (0-100)
- `lastSeenAt`: Last viewed timestamp

**Error Response**:
```json
{
  "ok": false,
  "message": "Missing email query parameter"
}
```

---

## Usage Examples

### Frontend Player Integration

```javascript
// After user watches 65%+ of video
const payload = {
  email: userEmail,
  title: courseTitle,
  category: courseCategory,
  watchedSeconds: Math.floor(actualWatchTime),
  percent_watched: Math.round((actualWatchTime / duration) * 100),
  status: 'Completed',
  last_position_s: currentPosition,
  last_seen_at: new Date().toISOString()
};

const response = await fetch('/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

const result = await response.json();
if (result.completed) {
  console.log('✅ Course marked as completed!');
} else if (!result.ok) {
  console.log('❌ Error:', result.message);
} else {
  console.log('⏳ Not enough watch time yet');
}
```

### Dashboard Completion Display

```javascript
// Fetch user's completions
const email = 'user@example.com';
const completions = await fetch(`/api/completions?email=${email}`)
  .then(r => r.json())
  .then(data => data.data || []);

console.log(`${completions.count} courses completed`);
console.log(`${completions.totalHours} hours watched`);

completions.forEach(c => {
  console.log(`✅ ${c.title} - ${c.percentWatched}% watched`);
});
```

---

## Validation Rules

### Completion Requirements
- ✅ `watchedSeconds >= (duration * 0.65)` OR `percent_watched >= 65`
- ❌ Less than 65% → Marked as "Partial", not recorded

### Anti-Cheat Measures
1. **Skip Detection**: Jumps > 2.5s not counted as watch time
2. **Throttling**: Max 1 completion per video per 10 seconds
3. **Backend Validation**: Double-checks watch percentage
4. **Real-time Tracking**: Only natural playback counts

### Data Storage
- ✅ Google Sheets `Completions` sheet (append only)
- ✅ Max 1 record per video per user per 10 seconds
- ✅ Historical records never deleted (audit trail)

---

## Data Flow Diagram

```
┌─────────────────────────┐
│  Player.js (Frontend)   │
│  Tracks real play time  │
└────────────┬────────────┘
             │
             │ Only continuous
             │ playback counted
             │
┌────────────▼────────────┐
│   POST /api/track       │
│ (send when video ends)  │
└────────────┬────────────┘
             │
             │ Validate
             │ 65%+?
             │
    ┌────────┴────────┐
    │                 │
   YES               NO
    │                 │
┌───▼──────┐    ┌────▼────┐
│ COMPLETE │    │ PARTIAL  │
│ (write)  │    │ (skip)   │
└───┬──────┘    └──────────┘
    │
    │ Append to
    │ Completions
    │ Sheet
    │
┌───▼──────────────────────┐
│ GET /api/completions     │
│ (retrieve history)       │
└──────────────────────────┘
    │
    └─► Dashboard
    └─► Leaderboard
    └─► Progress Reports
```

---

## Testing Commands

### Test 1: Record a completion
```bash
curl -X POST http://localhost:3001/api/track \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ex.com","title":"VideoA","category":"Test","watchedSeconds":120,"percent_watched":65,"status":"Completed"}'
```

### Test 2: Record a partial (won't write)
```bash
curl -X POST http://localhost:3001/api/track \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ex.com","title":"VideoB","category":"Test","watchedSeconds":60,"percent_watched":50,"status":"Partial"}'
```

### Test 3: Retrieve completions
```bash
curl "http://localhost:3001/api/completions?email=test@ex.com"
```

### Test 4: Check total hours
```bash
curl "http://localhost:3001/api/completions?email=akshat.dataintern@esmeconsumer.in" | jq '.totalHours'
```

---

## Integration Notes

### Google Sheets Structure
The `Completions` sheet has columns A-J:
- A: Timestamp (IST)
- B: Email
- C: Course Title
- D: Category
- E: Watched Seconds
- F: Auto Completed (TRUE/FALSE)
- G: Status
- H: Last Position
- I: Percent Watched
- J: Last Seen At

### Leaderboard Updates
- Leaderboard refreshes every 60 seconds
- Uses `Completions` sheet data
- Calculates total hours for each user
- Ranks users by hours (descending)

### Performance
- API response: <100ms (backend) + <100ms (proxy)
- Google Sheets query: <500ms first time, cached after
- Throttling prevents duplicate writes

---

**Last Updated**: 2026-01-16
**Status**: ✅ Production Ready
**Tested**: ✅ All endpoints working
