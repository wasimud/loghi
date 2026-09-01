import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    // Se la richiesta parte da /player/ e ha il parametro url
    if (url.pathname.startsWith("/player") && targetUrl) {
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

        // Restituisce una pagina HTML con un player video integrato (hls.js) che riproduce istantaneamente il flusso trovato
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
                  var streamUrl = "${capturedStreamUrl}";
                  if (Hls.isSupported()) {
                      var hls = new Hls();
                      hls.loadSource(streamUrl);
                      hls.attachMedia(video);
                      hls.on(Hls.Events.MANIFEST_PARSED,function() {
                          video.play();
                      });
                  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                      video.src = streamUrl;
                      video.addEventListener('loadedmetadata',function() {
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

      } catch (err) {
        if (browser) await browser.close();
        return new Response("Errore durante l'ispezione: " + err.message, {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // Comportamento standard precedente (restituisce il JSON)
    if (!targetUrl) {
      return new Response("Uso corretto: \n- JSON: https://tuo-worker.workers.dev/?url=...\n- Player: https://tuo-worker.workers.dev/player/?url=...", {
        headers: { "content-type": "text/plain;charset=UTF-8", "Access-Control-Allow-Origin": "*" }
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
