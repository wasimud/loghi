import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    async function extractStream(pageUrl) {
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

        await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 20000 });

        let waitTime = 0;
        while (!capturedStreamUrl && waitTime < 6000) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          waitTime += 500;
        }

        await browser.close();
        return capturedStreamUrl;
      } catch (err) {
        if (browser) await browser.close();
        throw err;
      }
    }

    if (!targetUrl) {
      return new Response("Uso corretto: \n- Player Web HTML: https://tuo-worker.workers.dev/player/?url=...\n- Flusso per IPTV/M3U: https://tuo-worker.workers.dev/player/?url=.../index.m3u8\n- JSON: https://tuo-worker.workers.dev/?url=...", {
        headers: { "content-type": "text/plain;charset=UTF-8", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Controlla se l'URL termina con /index.m3u8
    const isM3u8Request = targetUrl.endsWith("/index.m3u8");
    const cleanTargetUrl = isM3u8Request ? targetUrl.replace(/\/index\.m3u8$/, "") : targetUrl;

    try {
      const capturedStreamUrl = await extractStream(cleanTargetUrl);

      if (!capturedStreamUrl) {
        return new Response("Nessun flusso .m3u8 trovato nel traffico di rete della pagina.", {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      // Se la richiesta parte da /player/ e finisce con /index.m3u8, reindirizza direttamente al flusso reale per IPTV/M3U
      if (url.pathname.startsWith("/player") && isM3u8Request) {
        return Response.redirect(capturedStreamUrl, 302);
      }

      // Se è una richiesta /player/ normale, mostra la pagina HTML con il player integrato
      if (url.pathname.startsWith("/player")) {
        return renderPlayer(capturedStreamUrl);
      }

      // Comportamento standard JSON
      return new Response(
        JSON.stringify({
          success: true,
          page: cleanTargetUrl,
          streamUrl: capturedStreamUrl,
          m3u8Link: `${url.origin}/player/?url=${encodeURIComponent(cleanTargetUrl + "/index.m3u8")}`
        }, null, 2),
        {
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );

    } catch (err) {
      return new Response("Errore durante l'ispezione: " + err.message, {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
  },
};

function renderPlayer(streamUrl) {
  const playerHtml = `
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Stream Player</title>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        <style>
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; display: flex; justify-content: center; align-items: center; }
            video { width: 100%; height: 100%; max-height: 100vh; }
        </style>
    </head>
    <body>
        <video id="video" controls autoplay playsinline></video>
        <script>
            var video = document.getElementById('video');
            var streamUrl = "${streamUrl}";
            if (Hls.isSupported()) {
                var hls = new Hls();
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    video.play();
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = streamUrl;
                video.addEventListener('loadedmetadata', function() {
                    video.play();
                });
            }
        </script>
    </body>
    </html>
  `;

  return new Response(playerHtml, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
