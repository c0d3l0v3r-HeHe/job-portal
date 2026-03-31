import { createServer } from "https";
import { parse } from "url";
import next from "next";
import fs from "fs";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const httpsOptions = {
  key: fs.readFileSync("./private.key"),
  cert: fs.readFileSync("./certificate.crt"),
};

// ... existing imports and app.prepare() ...

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  }).listen(4000, () => { // <--- CHANGE THIS TO 4000
    console.log("> Ready on https://localhost:4000");
  });
});