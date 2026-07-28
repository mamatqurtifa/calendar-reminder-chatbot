// index.js

require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');

// GOOGLE CALENDAR HELPERS
function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

function getCalendarClient() {
  const auth = getOAuth2Client();
  return google.calendar({ version: 'v3', auth });
}

const DEFAULT_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta';

function cleanString(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return '';
  return str;
}

// Parse string datetime ke Date
function parseDateTime(str) {
  if (/[Z]$/.test(str) || /[+-]\d{2}:?\d{2}$/.test(str)) {
    return new Date(str);
  }
  return new Date(str + '+07:00');
}

// Format 1 event Google Calendar jadi object simpel
function formatEvent(event) {
  return {
    id: event.id,
    title: event.summary || '',
    description: event.description || '',
    start: (event.start && (event.start.dateTime || event.start.date)) || undefined,
    end: (event.end && (event.end.dateTime || event.end.date)) || undefined,
    isAllDay: !!(event.start && event.start.date) && !(event.start && event.start.dateTime),
    location: event.location || '',
    recurringEventId: event.recurringEventId || null,
  };
}

// Bangun RRULE (RFC 5545) dari spec sederhana, dipakai buat reminder berulang
function buildRRule(spec) {
  const freqMap = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
    yearly: 'YEARLY',
  };
  const freq = freqMap[spec.type];
  if (!freq) throw new Error('Tipe recurrence tidak dikenali: ' + spec.type);

  let rule = `FREQ=${freq}`;
  if (spec.interval) rule += `;INTERVAL=${spec.interval}`;

  if (spec.weekdays && spec.weekdays.length > 0) {
    const dayMap = {
      MONDAY: 'MO',
      TUESDAY: 'TU',
      WEDNESDAY: 'WE',
      THURSDAY: 'TH',
      FRIDAY: 'FR',
      SATURDAY: 'SA',
      SUNDAY: 'SU',
    };
    const days = spec.weekdays
      .map((d) => dayMap[d.toUpperCase()])
      .filter(Boolean);
    if (days.length > 0) rule += `;BYDAY=${days.join(',')}`;
  }

  if (spec.until) {
    const untilDate = new Date(spec.until);
    const yyyy = untilDate.getUTCFullYear();
    const mm = String(untilDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(untilDate.getUTCDate()).padStart(2, '0');
    rule += `;UNTIL=${yyyy}${mm}${dd}T235959Z`;
  } else if (spec.count) {
    rule += `;COUNT=${spec.count}`;
  }

  return `RRULE:${rule}`;
}

// Return null jika tidak ada entry valid (dipakai di editEvent agar
// patch tidak menyentuh reminders sama sekali)
function buildRemindersOrNull(remindersArr) {
  if (!remindersArr || remindersArr.length === 0) return null;

  const valid = remindersArr
    .filter((r) => {
      if (!r || r.minutes === null || r.minutes === undefined || r.minutes === '') return false;
      return !isNaN(Number(r.minutes));
    })
    .map((r) => ({
      method: r.method === 'email' ? 'email' : 'popup',
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
      if (!r || r.minutes === null || r.minutes === undefined || r.minutes === '') {
        return false;
      }
      return !isNaN(Number(r.minutes));
    })
    .map((r) => ({
      method: r.method === 'email' ? 'email' : 'popup',
      minutes: Number(r.minutes),
    }));

  if (valid.length === 0) {
    return { useDefault: true };
  }

  return { useDefault: false, overrides: valid };
}

// ACTION HANDLERS

// ACTION LIST - Lihat jadwal dalam rentang waktu
async function listEvents(calendar, calendarId, body) {
  if (!body.start || !body.end) {
    throw new Error('Parameter start dan end wajib diisi');
  }

  const result = await calendar.events.list({
    calendarId,
    timeMin: new Date(body.start).toISOString(),
    timeMax: new Date(body.end).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (result.data.items || []).map(formatEvent);
}

// ACTION ADD - Tambah reminder/event baru (biasa atau berulang)
async function addEvent(calendar, calendarId, body) {
  const title = cleanString(body.title);
  if (!title || !body.start || !body.end) {
    throw new Error('Parameter title, start, end wajib diisi');
  }

  const timeZone = cleanString(body.timezone) || DEFAULT_TIMEZONE;
  const isAllDay = body.all_day === true || body.all_day === 'true';

  const startDate = parseDateTime(body.start);
  const endDate = parseDateTime(body.end);

  let startObj, endObj;
  if (isAllDay) {
    const startStr = body.start.split('T')[0];
    let endStr = body.end.split('T')[0];
    if (startStr === endStr) {
      const d = new Date(startStr + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      endStr = d.toISOString().split('T')[0];
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

// ACTION EDIT - Edit reminder/event yang sudah ada (partial update)
async function editEvent(calendar, calendarId, body) {
  if (!body.eventId && (!body.eventIds || !Array.isArray(body.eventIds))) {
    throw new Error('Parameter eventId (string) atau eventIds (array) wajib diisi');
  }

  const patch = {};
  if (body.title) {
    const title = cleanString(body.title);
    if (title) patch.summary = title;
  }
  if (body.description !== undefined) patch.description = cleanString(body.description);
  if (body.location) {
    const location = cleanString(body.location);
    if (location) patch.location = location;
  }
  if (body.start && body.end) {
    const timeZone = cleanString(body.timezone) || DEFAULT_TIMEZONE;
    const isAllDay = body.all_day === true || body.all_day === 'true';

    const startDate = parseDateTime(body.start);
    const endDate = parseDateTime(body.end);

    if (isAllDay) {
      const startStr = body.start.split('T')[0];
      let endStr = body.end.split('T')[0];
      if (startStr === endStr) {
        const d = new Date(startStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        endStr = d.toISOString().split('T')[0];
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
  const idsToEdit = rawIds.filter(id => id && typeof id === 'string' && id.trim() !== '' && !id.includes('{{'));
  
  if (idsToEdit.length === 0) {
    throw new Error('Tidak ada eventId yang valid untuk diedit');
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
      console.error(`Gagal mengedit eventId ${id}:`, error.message);
      failedIds.push({ id, reason: error.message });
    }
  }

  // Backwards compatibility untuk single eventId
  if (!body.eventIds && editedEvents.length === 1 && failedIds.length === 0) {
    return editedEvents[0];
  }

  return {
    edited: true,
    editedCount: editedIds.length,
    editedIds,
    failedIds,
    events: editedEvents
  };
}

// ACTION: DELETE - Hapus reminder/event (bisa single atau multiple)
async function deleteEvent(calendar, calendarId, body) {
  if (!body.eventId && (!body.eventIds || !Array.isArray(body.eventIds))) {
    throw new Error('Parameter eventId (string) atau eventIds (array) wajib diisi');
  }

  let rawIds = body.eventIds || body.eventId || [];
  if (!Array.isArray(rawIds)) rawIds = [rawIds];
  
  // Filter out empty strings or unresolved botika templates
  const idsToDelete = rawIds.filter(id => id && typeof id === 'string' && id.trim() !== '' && !id.includes('{{'));

  if (idsToDelete.length === 0) {
    throw new Error('Tidak ada eventId yang valid untuk dihapus');
  }

  const deletedIds = [];
  const failedIds = [];

  for (const id of idsToDelete) {
    try {
      await calendar.events.delete({ calendarId, eventId: id });
      deletedIds.push(id);
    } catch (error) {
      console.error(`Gagal menghapus eventId ${id}:`, error.message);
      failedIds.push({ id, reason: error.message });
    }
  }

  return { 
    deleted: true, 
    deletedCount: deletedIds.length,
    deletedIds,
    failedIds
  };
}

// ACTION: SEARCH - Cari reminder berdasarkan kata kunci
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
    orderBy: 'startTime',
  });

  return (result.data.items || []).map(formatEvent);
}

// EXPRESS APP

const app = express();
app.use(express.json());

// Kalau body request bukan JSON valid, express.json() akan throw
// sebelum masuk ke route
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Body request bukan JSON yang valid' });
  }
  next(err);
});

// CORS
app.use('/api/calendar', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.options('/api/calendar', (req, res) => {
  res.status(204).end();
});

app.post('/api/calendar', async (req, res) => {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Body request bukan JSON yang valid' });
  }

  if (body.secret !== process.env.PROXY_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: secret key salah' });
  }

  const calendarId = cleanString(body.calendarId) || DEFAULT_CALENDAR_ID;
  const calendar = getCalendarClient();

  try {
    let data;
    switch (body.action) {
      case 'list':
        data = await listEvents(calendar, calendarId, body);
        break;
      case 'add':
        data = await addEvent(calendar, calendarId, body);
        break;
      case 'edit':
        data = await editEvent(calendar, calendarId, body);
        break;
      case 'delete':
        data = await deleteEvent(calendar, calendarId, body);
        break;
      case 'search':
        data = await searchEvents(calendar, calendarId, body);
        break;
      default:
        return res.status(400).json({ ok: false, error: 'Action tidak dikenali: ' + body.action });
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Terjadi kesalahan tak terduga' });
  }
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Terjadi kesalahan tak terduga' });
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Calendar API listening on port ${PORT}`);
});