// lib/blogger-auth.js
export async function getBloggerAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.BLOGGER_CLIENT_ID,
      client_secret: process.env.BLOGGER_CLIENT_SECRET,
      refresh_token: process.env.BLOGGER_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to refresh Blogger access token: ${data.error_description || data.error || 'unknown error'}`);
  }

  return data.access_token;
}
