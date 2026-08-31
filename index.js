import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new Response("Uso corretto: https://tuo-worker.workers.dev/?url=https://freeshot.live/...", {
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    let capturedStreamUrl = null;
    let browser;

    try {
      browser = await puppeteer.launch(env.MYBROWSER);
      const page = await browser.newPage();

      page.on("request", (req) => {
        const reqUrl = req.url();
        if (reqUrl.includes(".m3u8") && !capturedStreamUrl) {
          capturedStreamUrl = reqUrl;
        }
      });

      await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 20000 });

      let waitTime = 0;
      while (!capturedStreamUrl && waitTime < 6000) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        waitTime += 500;
      }

      await browser.close();

      if (!capturedStreamUrl) {
        return new Response("Nessun flusso .m3u8 trovato nel traffico di rete della pagina.", {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          page: targetUrl,
          streamUrl: capturedStreamUrl
        }, null, 2),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );

    } catch (err) {
      if (browser) await browser.close();
      return new Response("Errore durante l'ispezione: " + err.message, {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
  },
};
