
# FamLine v2 - Render Deploy (No card needed)

## Deploy in 1 click

1. Push this folder to GitHub (create repo famline-family)
2. Go to https://dashboard.render.com -> New -> Blueprint -> Connect repo
3. Render will read render.yaml and create both services automatically:
   - famline-signaling -> will be at https://famline-signaling.onrender.com (WebSocket wss://...)
   - famline-web -> https://famline-web.onrender.com

## Manual deploy (if you don't want Blueprint)

### Signaling:
- Render -> New -> Web Service -> Connect repo -> Root: signaling
- Build: npm install
- Start: npm start
- Plan: Free
- After deploy, copy its URL (e.g. https://famline-signaling.onrender.com)
- Convert to wss: wss://famline-signaling.onrender.com

### Web:
- Render -> New -> Static Site -> Connect repo -> Root: web
- Publish dir: .
- After deploy, open its URL

### IMPORTANT: Link them
After signaling is deployed, edit web/index.html line with:
<script>window.FAMLINE_SIGNALING_URL="wss://YOUR-SIGNALING-URL.onrender.com";</script>

Then redeploy static site.

## Test
Open web URL on your phone + wife phone -> same Family Code + Password -> chat & call.

Free tier note: Render free sleeps after 15min inactivity, first call takes ~30s to wake. That's fine for family use. Upgrade to $7/mo if you want always-on.
