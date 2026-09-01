import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    // Helper function to run Puppeteer and extract the m3u8 stream
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

    // Gestione della richiesta per /player/
    if (url.pathname.startsWith("/player") && targetUrl) {
      // Check if the targetUrl itself ends with .m3u8 or contains it as the final stream
      if (targetUrl.endsWith(".m3u8") || targetUrl.includes(".m3u8?")) {
        // Se l'URL finale è già un .m3u8, riproducilo direttamente
        return renderPlayer(targetUrl);
      }

      try {
        const capturedStreamUrl = await extractStream(targetUrl);

        if (!capturedStreamUrl) {
          return new Response("Nessun flusso .m3u8 trovato nel traffico di rete della pagina.", {
            status: 404,
            headers: { "Access-Control-Allow-Origin": "*" }
          });
        }

        // Reindirizza o aggiorna l'URL aggiungendo il .m3u8 trovato alla fine (es. /player/?url=target/index.m3u8)
        const newRedirectUrl = `${url.origin}${url.pathname}?url=${encodeURIComponent(targetUrl + "/index.m3u8")}&stream=${encodeURIComponent(capturedStreamUrl)}`;
        
        // In alternativa, se vuoi restituire direttamente il player con il flusso catturato:
        return renderPlayer(capturedStreamUrl);

      } catch (err) {
        return new Response("Errore durante l'ispezione: " + err.message, {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // Comportamento standard se manca il parametro url
    if (!targetUrl) {
      return new Response("Uso corretto: \n- JSON: https://tuo-worker.workers.dev/?url=...\n- Player: https://tuo-worker.workers.dev/player/?url=...", {
        headers: { "content-type": "text/plain;charset=UTF-8", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Comportamento standard per JSON
    try {
      const capturedStreamUrl = await extractStream(targetUrl);

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
          streamUrl: capturedStreamUrl,
          formattedUrl: `${targetUrl}/index.m3u8`
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
      "Access-Control-Origin": "*",
    },
  });
}
