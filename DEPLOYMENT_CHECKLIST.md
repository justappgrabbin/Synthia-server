# Deployment Checklist

1. Push this hard bridge package to GitHub.
2. Let Render redeploy the Synthia server.
3. Confirm Render settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variables:
   - `ADMIN_TOKEN`
   - `HF_TRIDENT_CYNTHIA_URL`
   - `HF_TRIDENT_GENERAL_URL`
5. Test:
   - `/`
   - `/admin`
   - `/client`
   - `/mcp/status`
   - `/mcp/bridge/status`
   - `POST /mcp/capture`
   - `GET /mcp/inbox/chatgpt`
