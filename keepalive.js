export default {
  async fetch(request, env, ctx) {
    return new Response("CF Worker is alive 👋");
  },

  async scheduled(event, env, ctx) {
    const urls = [
      ""
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          redirect: "manual",
          method: "GET",
          headers: {
            "User-Agent": randomUA()
          }
        });

        console.log(`[KEEPALIVE] ${url} -> ${res.status}`);
      } catch (err) {
        console.error(`[ERROR] ${url}`, err);
      }
    }
  }
};

function randomUA() {
  const uas = [
    "Mozilla/5.0",
    "curl/8.0",
    "PostmanRuntime/7.32.0"
  ];
  return uas[Math.floor(Math.random() * uas.length)];
}
