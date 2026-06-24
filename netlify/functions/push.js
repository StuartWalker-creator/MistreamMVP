// netlify/functions/push.js
// ─────────────────────────────────────────────────────
// Secure proxy for OneSignal push notifications.
// The REST API key lives ONLY here as a Netlify env var —
// never in frontend code, never in GitHub.
//
// Frontend calls: POST /.netlify/functions/push
// with JSON body: { mode, toUid?, title, message, url? }
//   mode = 'user'  → send to one specific user by uid
//   mode = 'all'   → broadcast to all subscribed users
// ─────────────────────────────────────────────────────

exports.handler = async (event) => {

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const APP_ID  = process.env.ONESIGNAL_APP_ID;
  const REST_KEY = process.env.ONESIGNAL_REST_KEY;

  if (!APP_ID || !REST_KEY) {
    console.error('Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_KEY env vars');
    return { statusCode: 500, body: 'Push not configured' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { mode, toUid, title, message, url } = body;

  if (!title || !message) {
    return { statusCode: 400, body: 'title and message are required' };
  }

  // Build OneSignal payload
  const payload = {
    app_id:   APP_ID,
    headings: { en: title },
    contents: { en: message },
    small_icon: 'icon-192',
    url: url || 'https://mistream.netlify.app',
  };

  if (mode === 'user') {
    // Target a single user by their Firebase uid (set as OneSignal external_id)
    if (!toUid) return { statusCode: 400, body: 'toUid required for user mode' };
    payload.include_aliases   = { external_id: [toUid] };
    payload.target_channel    = 'push';
  } else if (mode === 'all') {
    // Broadcast to everyone subscribed
    payload.included_segments = ['Total Subscribed'];
  } else {
    return { statusCode: 400, body: 'mode must be "user" or "all"' };
  }

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${REST_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    // Log for debugging in Netlify function logs
    if (data.errors) console.warn('OneSignal errors:', JSON.stringify(data.errors));

    return {
      statusCode: res.ok ? 200 : res.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: res.ok, id: data.id, errors: data.errors }),
    };
  } catch (err) {
    console.error('Push proxy error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
