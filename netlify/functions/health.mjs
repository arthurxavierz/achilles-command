export default async () => Response.json({
  service: "achilles-command",
  status: "ok",
  timestamp: new Date().toISOString()
});
