# Calendar Proxy Express API Documentation

Base URL: `http://<your-server-url>`

## Endpoint

### `POST /api/calendar`

This is the single endpoint used for all calendar operations. The operation performed depends on the `action` field provided in the request body.

#### Authentication

All requests to this endpoint require a `secret` key in the JSON body, which must match the `PROXY_SECRET` environment variable configured in the server.

#### Headers

- `Content-Type: application/json`

#### Common Request Body Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `secret` | string | Yes | The proxy secret key for authentication. |
| `action` | string | Yes | The operation to perform (`list`, `add`, `edit`, `delete`, `search`). |
| `calendarId` | string | No | The ID of the Google Calendar to target. Defaults to `primary` or the value in `GOOGLE_CALENDAR_ID`. |

---

### Actions

#### 1. `list` (List Events)
Retrieves a list of events within a specific time range.

**Required Parameters:**
- `start` (string): The start datetime (ISO 8601 format).
- `end` (string): The end datetime (ISO 8601 format).

**Example Request:**
```json
{
  "secret": "your_proxy_secret",
  "action": "list",
  "start": "2023-10-01T00:00:00Z",
  "end": "2023-10-31T23:59:59Z"
}
```

#### 2. `add` (Add Event)
Creates a new event or reminder.

**Required Parameters:**
- `title` (string): Title/summary of the event.
- `start` (string): The start datetime.
- `end` (string): The end datetime.

**Optional Parameters:**
- `description` (string): Description of the event.
- `location` (string): Location of the event.
- `timezone` (string): Timezone for the event. Defaults to `Asia/Jakarta` or `DEFAULT_TIMEZONE`.
- `all_day` (boolean/string): Set to `true` to create an all-day event.
- `reminders` (array of objects): Define custom reminders. Example: `[{ "method": "email", "minutes": 10 }, { "method": "popup", "minutes": 30 }]`.
- `recurrence` (object): Define recurring event rules.
  - `type` (string): `daily`, `weekly`, `monthly`, or `yearly`.
  - `interval` (number): Recurrence interval.
  - `weekdays` (array of strings): E.g., `["MONDAY", "WEDNESDAY"]`.
  - `until` (string): End date for recurrence (ISO format).
  - `count` (number): Number of times to recur.

**Example Request:**
```json
{
  "secret": "your_proxy_secret",
  "action": "add",
  "title": "Meeting with team",
  "start": "2023-10-15T10:00:00",
  "end": "2023-10-15T11:00:00",
  "timezone": "Asia/Jakarta",
  "reminders": [
    { "method": "popup", "minutes": 15 }
  ]
}
```

#### 3. `edit` (Edit Event)
Updates an existing event. Only the provided optional fields will be updated (partial update).

**Required Parameters:**
- `eventId` (string): The Google Calendar Event ID to edit.

**Optional Parameters:**
- `title` (string): New title.
- `description` (string): New description.
- `location` (string): New location.
- `start` (string): New start datetime. (Note: Must provide both `start` and `end` to update time).
- `end` (string): New end datetime.
- `timezone` (string): New timezone.
- `all_day` (boolean/string): Change to all-day event.
- `reminders` (array of objects): New reminders configuration.

**Example Request:**
```json
{
  "secret": "your_proxy_secret",
  "action": "edit",
  "eventId": "abcdef1234567890",
  "title": "Updated Meeting Title"
}
```

#### 4. `delete` (Delete Event)
Deletes a specific event or multiple events from the calendar.

**Required Parameters:**
- `eventId` (string): The Google Calendar Event ID to delete.
- *OR* `eventIds` (array of strings): An array of Google Calendar Event IDs to delete multiple events at once.

**Example Request (Single Event):**
```json
{
  "secret": "your_proxy_secret",
  "action": "delete",
  "eventId": "abcdef1234567890"
}
```

**Example Request (Multiple Events):**
```json
{
  "secret": "your_proxy_secret",
  "action": "delete",
  "eventIds": [
    "abcdef1234567890",
    "0987654321fedcba"
  ]
}
```

#### 5. `search` (Search Events)
Searches for events matching a specific keyword query.

**Optional Parameters:**
- `query` (string): Keyword to search in events.
- `start` (string): Time min for search. Defaults to current time.
- `end` (string): Time max for search. Defaults to 1 year from current time.

**Example Request:**
```json
{
  "secret": "your_proxy_secret",
  "action": "search",
  "query": "Meeting",
  "start": "2023-01-01T00:00:00Z"
}
```

---

### Response Format

**Success Response (200 OK):**
```json
{
  "ok": true,
  "data": { ... }
}
```
*Note: The `data` field contains an array of events for `list` and `search` actions, a single event object for `add` and `edit` actions, and a confirmation object `{ "deleted": true, "deletedCount": 1, "deletedIds": ["..."], "failedIds": [] }` for the `delete` action.*

**Error Response (400, 401, 500):**
```json
{
  "ok": false,
  "error": "Error message description here"
}
```

**Event Object Structure (`data` field in response):**
```json
{
  "id": "event_id",
  "title": "Event summary",
  "description": "Event description",
  "start": "2023-10-15T10:00:00+07:00",
  "end": "2023-10-15T11:00:00+07:00",
  "isAllDay": false,
  "location": "Event location",
  "recurringEventId": null
}
```
