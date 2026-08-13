require("dotenv").config();
const express = require("express");
const { google } = require("googleapis");
const Redis = require("ioredis");

// REDIS SETUP
const redisUrl = process.env.REDIS_URL;
let redisClient = null;

if (redisUrl) {
  redisClient = new Redis(redisUrl, {
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redisClient.on("error", (err) => {
    console.error("Redis connection error:", err);
  });
} else {
  console.warn(
    "REDIS_URL is not defined in environment variables. Redis will not be connected.",
  );
}

async function saveUserToken(userId, token) {
  if (!redisClient) throw new Error("Redis client is not initialized.");
  await redisClient.set(userId, token);
}

async function getUserToken(userId) {
  if (!redisClient) throw new Error("Redis client is not initialized.");
  return await redisClient.get(userId);
}

// AUTH SETUP
function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

async function loginHandler(req, res) {
  const { userId } = req.query;
  if (!userId) return res.status(400).send("userId is required");

  const oauth2Client = createOAuth2Client();
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: userId,
    prompt: "consent",
  });

  res.redirect(url);
}

async function callbackHandler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    console.error("Google OAuth Error:", error);
    return res.status(400).send(`Authentication failed: ${error}`);
  }

  if (!code || !state) return res.status(400).send("Missing code or state");

  const userId = state;
  const oauth2Client = createOAuth2Client();

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      await saveUserToken(userId, tokens.refresh_token);
    } else {
      const existingToken = await getUserToken(userId);
      if (!existingToken) {
        console.warn(
          `No refresh token received for user ${userId} and none exists in Redis.`,
        );
      }
    }

    const redirectUrl = process.env.FRONTEND_REDIRECT_URL || "/";
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("Error exchanging code for token:", err);
    res.status(500).send("Internal Server Error during authentication");
  }
}

function extractUserId(req) {
  let userId = req.body.userId || req.query.userId;
  if (!userId && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      userId = parts[1];
    }
  }
  return userId;
}

async function checkAuthHandler(req, res) {
  const userId = extractUserId(req);
  if (!userId)
    return res.status(400).json({ login_status: "failed", error: "userId is required" });

  try {
    const token = await getUserToken(userId);
    if (token) {
      return res.json({ login_status: "success", message: "Authenticated" });
    } else {
      const oauth2Client = createOAuth2Client();
      const login_url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/userinfo.email",
        ],
        state: userId,
        prompt: "consent",
      });
      return res.json({ login_status: "failed", login_url });
    }
  } catch (err) {
    console.error("Redis error during auth check:", err);
    return res.status(500).json({ login_status: "failed", error: "Internal Server Error" });
  }
}

async function getEmailHandler(req, res) {
  const userId = extractUserId(req);
  if (!userId)
    return res.status(400).json({ login_status: "failed", error: "userId is required" });

  try {
    const token = await getUserToken(userId);
    if (!token) {
      const oauth2Client = createOAuth2Client();
      const login_url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/userinfo.email",
        ],
        state: userId,
        prompt: "consent",
      });
      return res
        .status(401)
        .json({ login_status: "failed", login_url });
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: token });

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const userInfo = await oauth2.userinfo.get();

    return res.json({ ok: true, data: { email: userInfo.data.email } });
  } catch (err) {
    console.error("Error fetching email:", err.message);
    const oauth2ClientFallback = createOAuth2Client();
    const login_url = oauth2ClientFallback.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      state: userId,
      prompt: "consent",
    });
    return res.status(401).json({
      login_status: "failed",
      error: "Authentication failed or token revoked",
      login_url,
    });
  }
}

async function requireAuth(req, res, next) {
  const userId = extractUserId(req);

  if (!userId)
    return res
      .status(401)
      .json({ login_status: "failed", error: "Unauthorized: missing userId" });

  try {
    const token = await getUserToken(userId);
    if (!token) {
      const oauth2Client = createOAuth2Client();
      const login_url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/userinfo.email",
        ],
        state: userId,
        prompt: "consent",
      });
      return res
        .status(401)
        .json({ login_status: "failed", login_url });
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: token });
    await oauth2Client.getAccessToken();

    req.oauth2Client = oauth2Client;
    req.userId = userId;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);
    const oauth2ClientFallback = createOAuth2Client();
    const login_url = oauth2ClientFallback.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      state: userId,
      prompt: "consent",
    });
    return res.status(401).json({
      login_status: "failed",
      error: "Unauthorized: Token invalid or revoked",
      login_url,
    });
  }
}

// GOOGLE CALENDAR HELPERS
function getCalendarClient(auth) {
  return google.calendar({ version: "v3", auth });
}

const DEFAULT_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Jakarta";

function cleanString(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (str.toLowerCase() === "null" || str.toLowerCase() === "undefined")
    return "";
  return str;
}

// Parse string datetime to Date
function parseDateTime(str) {
  if (/[Z]$/.test(str) || /[+-]\d{2}:?\d{2}$/.test(str)) {
    return new Date(str);
  }
  return new Date(str + "+07:00");
}

// Format a Google Calendar event into a simple object
function formatEvent(event) {
  return {
    id: event.id,
    title: event.summary || "",
    description: event.description || "",
    start:
      (event.start && (event.start.dateTime || event.start.date)) || undefined,
    end: (event.end && (event.end.dateTime || event.end.date)) || undefined,
    isAllDay:
      !!(event.start && event.start.date) &&
      !(event.start && event.start.dateTime),
    location: event.location || "",
    recurringEventId: event.recurringEventId || null,
  };
}

// Build RRULE (RFC 5545) from simple spec, used for recurring reminders
function buildRRule(spec) {
  const freqMap = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
  };
  const freq = freqMap[spec.type];
  if (!freq) throw new Error("Unrecognized recurrence type: " + spec.type);

  let rule = `FREQ=${freq}`;
  if (spec.interval) rule += `;INTERVAL=${spec.interval}`;

  if (spec.weekdays && spec.weekdays.length > 0) {
    const dayMap = {
      MONDAY: "MO",
      TUESDAY: "TU",
      WEDNESDAY: "WE",
      THURSDAY: "TH",
      FRIDAY: "FR",
      SATURDAY: "SA",
      SUNDAY: "SU",
    };
    const days = spec.weekdays
      .map((d) => dayMap[d.toUpperCase()])
      .filter(Boolean);
    if (days.length > 0) rule += `;BYDAY=${days.join(",")}`;
  }

  if (spec.until) {
    const untilDate = new Date(spec.until);
    const yyyy = untilDate.getUTCFullYear();
    const mm = String(untilDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(untilDate.getUTCDate()).padStart(2, "0");
    rule += `;UNTIL=${yyyy}${mm}${dd}T235959Z`;
  } else if (spec.count) {
    rule += `;COUNT=${spec.count}`;
  }

  return `RRULE:${rule}`;
}

// Return null if no valid entry (used in editEvent so patch doesn't touch reminders at all)
function buildRemindersOrNull(remindersArr) {
  if (!remindersArr || remindersArr.length === 0) return null;

  const valid = remindersArr
    .filter((r) => {
      if (
        !r ||
        r.minutes === null ||
        r.minutes === undefined ||
        r.minutes === ""
      )
        return false;
      return !isNaN(Number(r.minutes));
    })
    .map((r) => ({
      method: r.method === "email" ? "email" : "popup",
      minutes: Number(r.minutes),
    }));

  if (valid.length === 0) return null;
  return { useDefault: false, overrides: valid };
}

function buildReminders(remindersArr) {
  if (!remindersArr || remindersArr.length === 0) {
    return { useDefault: true };
  }

  const valid = remindersArr
    .filter((r) => {
      if (
        !r ||
        r.minutes === null ||
        r.minutes === undefined ||
        r.minutes === ""
      ) {
        return false;
      }
      return !isNaN(Number(r.minutes));
    })
    .map((r) => ({
      method: r.method === "email" ? "email" : "popup",
      minutes: Number(r.minutes),
    }));

  if (valid.length === 0) {
    return { useDefault: true };
  }

  return { useDefault: false, overrides: valid };
}

// ACTION HANDLERS

// ACTION LIST - View schedule within a time range
async function listEvents(calendar, calendarId, body) {
  if (!body.start || !body.end) {
    throw new Error("Parameters start and end are required");
  }

  const result = await calendar.events.list({
    calendarId,
    timeMin: new Date(body.start).toISOString(),
    timeMax: new Date(body.end).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (result.data.items || []).map(formatEvent);
}

// ACTION ADD - Add new reminder/event (single or recurring)
async function addEvent(calendar, calendarId, body) {
  const title = cleanString(body.title);
  if (!title || !body.start || !body.end) {
    throw new Error("Parameters title, start, end are required");
  }

  const timeZone = cleanString(body.timezone) || DEFAULT_TIMEZONE;
  const isAllDay = body.all_day === true || body.all_day === "true";

  const startDate = parseDateTime(body.start);
  const endDate = parseDateTime(body.end);

  let startObj, endObj;
  if (isAllDay) {
    const startStr = body.start.split("T")[0];
    let endStr = body.end.split("T")[0];
    if (startStr === endStr) {
      const d = new Date(startStr + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      endStr = d.toISOString().split("T")[0];
    }
    startObj = { date: startStr };
    endObj = { date: endStr };
  } else {
    if (startDate.getTime() === endDate.getTime()) {
      endDate.setHours(endDate.getHours() + 1);
    }
    startObj = { dateTime: startDate.toISOString(), timeZone };
    endObj = { dateTime: endDate.toISOString(), timeZone };
  }

  const requestBody = {
    summary: title,
    description: cleanString(body.description),
    location: cleanString(body.location),
    start: startObj,
    end: endObj,
    reminders: buildReminders(body.reminders),
  };

  if (body.recurrence) {
    requestBody.recurrence = [buildRRule(body.recurrence)];
  }

  const result = await calendar.events.insert({ calendarId, requestBody });
  return formatEvent(result.data);
}

// ACTION EDIT - Edit existing reminder/event (partial update)
async function editEvent(calendar, calendarId, body) {
  if (!body.eventId && (!body.eventIds || !Array.isArray(body.eventIds))) {
    throw new Error(
      "Parameter eventId (string) or eventIds (array) is required",
    );
  }

  const patch = {};
  if (body.title) {
    const title = cleanString(body.title);
    if (title) patch.summary = title;
  }
  if (body.description !== undefined)
    patch.description = cleanString(body.description);
  if (body.location) {
    const location = cleanString(body.location);
    if (location) patch.location = location;
  }
  if (body.start && body.end) {
    const timeZone = cleanString(body.timezone) || DEFAULT_TIMEZONE;
    const isAllDay = body.all_day === true || body.all_day === "true";

    const startDate = parseDateTime(body.start);
    const endDate = parseDateTime(body.end);

    if (isAllDay) {
      const startStr = body.start.split("T")[0];
      let endStr = body.end.split("T")[0];
      if (startStr === endStr) {
        const d = new Date(startStr + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        endStr = d.toISOString().split("T")[0];
      }
      patch.start = { date: startStr, dateTime: null };
      patch.end = { date: endStr, dateTime: null };
    } else {
      if (startDate.getTime() === endDate.getTime()) {
        endDate.setHours(endDate.getHours() + 1);
      }
      patch.start = { dateTime: startDate.toISOString(), timeZone, date: null };
      patch.end = { dateTime: endDate.toISOString(), timeZone, date: null };
    }
  }
  if (body.reminders) {
    const builtReminders = buildRemindersOrNull(body.reminders);
    if (builtReminders) patch.reminders = builtReminders;
  }

  let rawIds = body.eventIds || body.eventId || [];
  if (!Array.isArray(rawIds)) rawIds = [rawIds];

  // Filter out empty strings or unresolved botika templates
  const idsToEdit = rawIds.filter(
    (id) =>
      id && typeof id === "string" && id.trim() !== "" && !id.includes("{{"),
  );

  if (idsToEdit.length === 0) {
    throw new Error("No valid eventId to edit");
  }

  const editedIds = [];
  const failedIds = [];
  const editedEvents = [];

  for (const id of idsToEdit) {
    try {
      const result = await calendar.events.patch({
        calendarId,
        eventId: id,
        requestBody: patch,
      });
      editedEvents.push(formatEvent(result.data));
      editedIds.push(id);
    } catch (error) {
      console.error(`Failed to edit eventId ${id}:`, error.message);
      failedIds.push({ id, reason: error.message });
    }
  }

  // Backwards compatibility for single eventId
  if (!body.eventIds && editedEvents.length === 1 && failedIds.length === 0) {
    return editedEvents[0];
  }

  return {
    edited: true,
    editedCount: editedIds.length,
    editedIds,
    failedIds,
    events: editedEvents,
  };
}

// ACTION: DELETE - Delete reminder/event (single or multiple)
async function deleteEvent(calendar, calendarId, body) {
  if (!body.eventId && (!body.eventIds || !Array.isArray(body.eventIds))) {
    throw new Error(
      "Parameter eventId (string) or eventIds (array) is required",
    );
  }

  let rawIds = body.eventIds || body.eventId || [];
  if (!Array.isArray(rawIds)) rawIds = [rawIds];

  // Filter out empty strings or unresolved botika templates
  const idsToDelete = rawIds.filter(
    (id) =>
      id && typeof id === "string" && id.trim() !== "" && !id.includes("{{"),
  );

  if (idsToDelete.length === 0) {
    throw new Error("No valid eventId to delete");
  }

  const deletedIds = [];
  const failedIds = [];

  for (const id of idsToDelete) {
    try {
      await calendar.events.delete({ calendarId, eventId: id });
      deletedIds.push(id);
    } catch (error) {
      console.error(`Failed to delete eventId ${id}:`, error.message);
      failedIds.push({ id, reason: error.message });
    }
  }

  return {
    deleted: true,
    deletedCount: deletedIds.length,
    deletedIds,
    failedIds,
  };
}

// ACTION: SEARCH - Search reminder by keyword
async function searchEvents(calendar, calendarId, body) {
  const query = cleanString(body.query);

  const timeMin = body.start
    ? new Date(body.start).toISOString()
    : new Date().toISOString();
  const timeMax = body.end
    ? new Date(body.end).toISOString()
    : new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();

  const result = await calendar.events.list({
    calendarId,
    ...(query ? { q: query } : {}),
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (result.data.items || []).map(formatEvent);
}

// EXPRESS APP

const app = express();
app.use(express.json());

// If request body is not valid JSON, express.json() will throw before reaching the route
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ ok: false, error: "Request body is not valid JSON" });
  }
  next(err);
});

// CORS
app.use("/api/calendar", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.options("/api/calendar", (req, res) => {
  res.status(204).end();
});

// Auth endpoints
app.get("/auth/login", loginHandler);
app.get("/auth/callback", callbackHandler);
app.post("/api/auth/check", checkAuthHandler);
app.post("/api/auth/email", getEmailHandler);

app.post("/api/calendar", requireAuth, async (req, res) => {
  const body = req.body;

  if (!body || typeof body !== "object") {
    return res
      .status(400)
      .json({ ok: false, error: "Request body is not valid JSON" });
  }

  const calendarId = cleanString(body.calendarId) || DEFAULT_CALENDAR_ID;
  const calendar = getCalendarClient(req.oauth2Client);

  try {
    let data;
    switch (body.action) {
      case "list":
        data = await listEvents(calendar, calendarId, body);
        break;
      case "add":
        data = await addEvent(calendar, calendarId, body);
        break;
      case "edit":
        data = await editEvent(calendar, calendarId, body);
        break;
      case "delete":
        data = await deleteEvent(calendar, calendarId, body);
        break;
      case "search":
        data = await searchEvents(calendar, calendarId, body);
        break;
      default:
        return res
          .status(400)
          .json({ ok: false, error: "Action not recognized: " + body.action });
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || "An unexpected error occurred",
    });
  }
});

// Fallback error handler
app.use((err, req, res, next) => {
  res.status(500).json({ ok: false, error: "An unexpected error occurred" });
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Calendar API listening on port ${PORT}`);
});
