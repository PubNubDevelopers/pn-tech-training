/**
 * PubNub Function: Before Publish IP Allowlist Guard
 * Trigger: Before Publish or Fire
 *
 * Checks the publishing server's IP against a hardcoded allowlist.
 * Unauthorized IPs are logged to the customer's backend and the publish is aborted.
 *
 * IMPORTANT — IP Availability Constraint:
 * PubNub Before Publish handlers do NOT expose the raw TCP/network-layer client IP.
 * The publishing server MUST include its own IP when calling pubnub.publish():
 *
 *   pubnub.publish({
 *     channel: 'game.room123',
 *     message: { ... },
 *     meta: { clientIp: '203.0.113.10' }
 *   })
 *
 * Since this function guards server-to-server publishing from known customer
 * backend servers, this is a reliable convention — servers control their own requests.
 *
 * Operation budget: 1 XHR call (logging). 2 remaining of 3 allowed per execution.
 * To add Vault for secrets: +1 op. To add KV Store for dynamic IP list: +1 op.
 */

export default async (request) => {
  const xhr = require('xhr');

  // ─── CONFIGURATION ────────────────────────────────────────────────────────

  // Hardcoded allowlist of authorized customer server IPs.
  // Supports both IPv4 and IPv6 strings.
  // For a frequently-changing list, consider storing in kvstore instead.
  const ALLOWED_IPS = [
    '203.0.113.10',   // Customer server 1 — replace with real IPs
    '203.0.113.20',   // Customer server 2
    '198.51.100.5',   // Customer server 3
  ];

  // Customer backend endpoint for logging unauthorized publish attempts.
  // RECOMMENDED: Move to PubNub Vault:
  //   const vault = require('vault');
  //   const ABUSE_LOG_ENDPOINT = await vault.get('abuse_log_endpoint');
  const ABUSE_LOG_ENDPOINT = 'https://your-backend.example.com/api/abuse-log';

  // Shared secret for authenticating calls to your logging endpoint.
  // RECOMMENDED: Move to PubNub Vault (same pattern as above).
  const ABUSE_LOG_SECRET = 'YOUR_INTERNAL_SECRET';

  // ─── EXTRACT CLIENT IP ────────────────────────────────────────────────────

  const meta      = request.message.meta || {};
  const clientIp  = meta.clientIp || request.message.clientIp || null;
  const channel   = (request.channels && request.channels[0]) || 'unknown';
  const publisher = request.publisher || 'unknown';
  const msgType   = request.message.type || 'unknown';

  // ─── MISSING IP — misconfigured publisher ─────────────────────────────────

  if (!clientIp) {
    console.error(
      `[IP-GUARD] BLOCKED: No clientIp present. ` +
      `publisher=${publisher} channel=${channel}`
    );
    return request.abort({
      error: 'ip_missing',
      message:
        'PUBLISH REJECTED: Your client IP was not provided. ' +
        'All publish requests must include meta.clientIp. ' +
        'Contact your system administrator.',
    });
  }

  // ─── ALLOWED ──────────────────────────────────────────────────────────────

  if (ALLOWED_IPS.includes(clientIp)) {
    console.log(
      `[IP-GUARD] ALLOWED: ip=${clientIp} publisher=${publisher} channel=${channel}`
    );
    return request.ok();
  }

  // ─── BLOCKED — log the violation, then abort ──────────────────────────────

  console.error(
    `[IP-GUARD] BLOCKED unauthorized publish attempt: ` +
    `ip=${clientIp} publisher=${publisher} channel=${channel} type=${msgType}`
  );

  const logPayload = {
    event:       'unauthorized_publish_attempt',
    clientIp,
    publisher,
    channel,
    messageType: msgType,
    ts:          new Date().toISOString(),
  };

  try {
    const logResponse = await xhr.fetch(ABUSE_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'X-Internal-Secret': ABUSE_LOG_SECRET,
      },
      body: JSON.stringify(logPayload),
    });
    console.log(`[IP-GUARD] Abuse event logged. Endpoint status: ${logResponse.status}`);
  } catch (logError) {
    // Logging failure must not prevent the abort — still block the publish.
    console.error(`[IP-GUARD] Failed to reach abuse-log endpoint: ${logError}`);
  }

  return request.abort({
    error: 'ip_not_authorized',
    message:
      'CEASE AND DESIST: Your IP address is not authorized to publish to this ' +
      'PubNub network. This unauthorized publish attempt has been logged and ' +
      'will be investigated. Cease and desist immediately. ' +
      'Continued abuse may result in legal action.',
  });
};
