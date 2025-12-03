// MIT License

// Copyright (c) 2022 Peng Xiao

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING WITHOUT LIMITATION THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import {
  type ConfigEnv,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import fs from "fs";
import MagicString from "magic-string";
import { type RequestOptions, get as httpGet } from "http";

const pluginName = "vite:logseq-dev-plugin";

function getLogseqPluginId() {
  try {
    const packageJson = fs.readFileSync(
      path.join(process.cwd(), "package.json"),
      "utf-8"
    );

    return JSON.parse(packageJson).logseq.id;
  } catch {
    console.error(`${pluginName}: failed to get valid plugin id`);
  }
}

const reloadScript = `
(() => {
  try {
    let name = logseq.api.get_current_page().originalName;
    console.log(name)
    logseq.api.replace_state("home");
    logseq.api.replace_state("page", { name });
  } catch (err) {
    console.warn('failed to re-render current page', err);
  }
})();`;

// TODO: support https?
const request = async (url: string, options: RequestOptions) => {
  let resolve: (value: string | PromiseLike<string>) => void;
  const data: Uint8Array<ArrayBufferLike>[] = [];
  const promise = new Promise<string>((res) => {
    resolve = res;
  });

  httpGet(url, options, (res) => {
    res.on("data", (chunk) => {
      data.push(chunk);
    });
    res.on("end", () => {
      resolve(Buffer.concat(data).toString());
    });
  });
  return promise;
};

export const logseqDevPlugin: () => Plugin = () => {
  let config: ResolvedConfig;
  let configEnv: ConfigEnv;
  let server: ViteDevServer;
  const pluginId = getLogseqPluginId();

  // eagerly load the HTML file to let it write to the dist
  const tapHtml = async (address: string) => {
    const res = await request(address, {
      method: "GET",
      headers: {
        accept: "text/html",
      },
    });
    return res;
  };

  return {
    name: pluginName,
    enforce: "post",
    config: async (config, resolvedEnv) => {
      configEnv = resolvedEnv;

      // make sure base is empty, otherwise when running in build mode
      // the asset will be served from the root "/"
      config.base = "";

      // Plugin works in file://, but it fetches vite resources from localhost
      // thus we must turn on cors
      if (resolvedEnv.command === "serve") {
        config.server = Object.assign({}, config.server, {
          cors: true,
          // I think we do not need to concern about this ...
          host: "localhost",
          hmr: {
            host: "localhost",
          },
          // There is no point to open the index.html
          open: false,
        });
      }

      return config;
    },

    configureServer(_server) {
      server = _server;
    },

    configResolved(resolvedConfig) {
      // store the resolved config
      config = resolvedConfig;
    },

    transform(code, id) {
      if (
        server?.moduleGraph.getModuleById(id)?.importers.size === 0 &&
        !/node_modules/.test(id) &&
        id.startsWith(process.cwd())
      ) {
        const s = new MagicString(code);
        s.prepend(
          `
if (import.meta.hot) {
  import.meta.hot.accept(() => {});
  import.meta.hot.dispose(() => {
    top?.LSPluginCore.reload("${pluginId}");
    console.log("✨Plugin ${pluginId} reloaded ✨");
    // TODO: trigger re-render globally
  });
}\n\n`
        );

        s.append(`
if (import.meta.hot) {
  setTimeout(() => {
    top.eval(\`${reloadScript}\`);
  });
}\n`);

        // amend entries
        return {
          code: s.toString(),
          map: s.generateMap({ hires: true }),
        };
      }
    },

    // Overwrite dev HTML
    async buildStart() {
      if (configEnv.command === "serve" && server) {
        if (!server.httpServer) {
          throw new Error(
            `${pluginName} Only works for non-middleware mode for now`
          );
        }

        server.httpServer.once("listening", () => {
          let address = server.httpServer!.address()!;
          if (typeof address === "object" && address) {
            address = "http://localhost" + ":" + address.port;
          }
          tapHtml(address).then(async (html) => {
            // Rewrite the base, otherwise assets like `/@vite/client` will
            // subject to default `file://` path
            const baseHref = address;
            const baseString = `<base href="${baseHref}">`;
            const htmlWithBase = html.replace(`<head>`, `<head>${baseString}`);

            await mkdir(config.build.outDir, { recursive: true });
            await writeFile(
              path.resolve(config.build.outDir, "index.html"),
              htmlWithBase,
              {
                encoding: "utf-8",
              }
            );
            console.info(`${pluginName}: Wrote development index.html`);
          });
        });
      }
    },
  };
};

