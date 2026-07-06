// HexDTL sample app — exercises every panel
// Run: npx hexdtl inspect examples/sample-app.js

const http = require("http");

let counter = 0;
const users = [];
const dataCache = new Map();
let serverPort = 0;

// ── Local HTTP server (exercises Network panel with real traffic) ──

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const path = req.url || "/";
    const method = req.method || "GET";

    // Delay endpoint (simulate slow response)
    if (path === "/slow") {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain", "x-slow": "true" });
        res.end("slow response (500ms)");
      }, 500);
      return;
    }

    // Error endpoints
    if (path === "/404") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    if (path === "/500") {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("internal server error");
      return;
    }

    // Large response
    if (path === "/large") {
      const big = Array(500).fill("line-" + Date.now()).join("\n");
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(big);
      return;
    }

    // HTML response
    if (path === "/html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body><h1>Hello</h1><p>from HexDTL</p></body></html>");
      return;
    }

    // Echo with custom headers
    const customHdrs = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.startsWith("x-")) customHdrs[k] = v;
    }

    const respBody = JSON.stringify({
      ok: true,
      method,
      path,
      headers: customHdrs,
      body: body || null,
      ts: Date.now(),
    });
    const hdrs = { "content-type": "application/json", "x-server": "hexdtl-demo" };
    if (method === "POST" || method === "PUT") {
      hdrs["x-echo-length"] = String(body.length);
    }
    res.writeHead(method === "POST" ? 201 : 200, hdrs);
    res.end(respBody);
  });
});

function startServer() {
  return new Promise((resolve) => {
    server.listen(0, () => {
      serverPort = server.address().port;
      console.log(`demo server ready on port ${serverPort} — use Network panel`);
      resolve();
    });
  });
}

// ── Utility ────────────────────────────────────────────────────

function randomDelay(ms) {
  return new Promise((r) => setTimeout(r, ms + Math.random() * 100));
}

// ── User CRUD (exercises Console, Runtime) ─────────────────────

async function saveUser(id) {
  await randomDelay(150);
  const user = {
    id,
    name: `User_${id}`,
    createdAt: Date.now(),
    roles: ["viewer"],
    meta: { score: Math.random() },
  };
  users.push(user);
  return user;
}

async function createUsers(count) {
  for (let i = 0; i < count; i++) {
    const user = await saveUser(++counter);
    console.log("saved user", user);
  }
}

// ── Real Network requests (exercises Network panel) ──────────────

function realFetch(method, path, headers, body) {
  const url = `http://127.0.0.1:${serverPort}${path}`;
  console.log(`fetching ${method} ${path}...`);
  return new Promise((resolve, reject) => {
    const opts = { hostname: "127.0.0.1", port: serverPort, path, method, headers: headers || {} };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          console.log(`fetched ${method} ${path}:`, parsed);
          resolve(parsed);
        } catch {
          console.log(`fetched ${method} ${path} (${res.statusCode}): ${data.slice(0, 60)}`);
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchMultiple(endpoints) {
  const results = await Promise.allSettled(endpoints.map((e) => realFetch("GET", e)));
  for (const r of results) {
    console.log(r.status === "fulfilled" ? "✓ get ok" : "✗ get fail", r.reason || "");
  }
}

async function testNetworkVariety() {
  // Standard GET with query params
  await realFetch("GET", "/users?page=1&limit=10");
  // POST with JSON body
  await realFetch("POST", "/data", { "content-type": "application/json", "x-trace": "abc123" }, JSON.stringify({ name: "test", value: 42 }));
  // PUT with body
  await realFetch("PUT", "/data/1", { "content-type": "text/plain" }, "update payload");
  // DELETE
  await realFetch("DELETE", "/data/1");
  // Custom headers
  await realFetch("GET", "/echo", { "x-custom": "yes", "x-api-key": "demo-key-123" });
  // 404
  await realFetch("GET", "/404");
  // 500
  await realFetch("GET", "/500");
  // Slow request
  await realFetch("GET", "/slow");
  // Large response
  await realFetch("GET", "/large");
  // HTML
  await realFetch("GET", "/html");
}

// ── Object graph for XOM inspection (exercises XOM panel) ──────

class EventEmitter {
  constructor() {
    this._events = new Map();
  }
  on(name, fn) {
    if (!this._events.has(name)) this._events.set(name, new Set());
    this._events.get(name).add(fn);
  }
  emit(name, ...args) {
    const set = this._events.get(name);
    if (set) for (const fn of set) fn(...args);
  }
}

const emitter = new EventEmitter();
emitter.on("data", (d) => console.log("emitted:", d));

const appState = {
  version: "2.1.0",
  startedAt: Date.now(),
  config: {
    theme: "dark",
    debug: true,
    limits: { maxUsers: 1000, timeoutMs: 5000, retries: 3 },
    flags: new Set(["beta", "analytics", "experimental"]),
  },
  cache: dataCache,
  metrics: {
    totalOps: 0,
    errors: [],
    histogram: new Array(10).fill(0),
    tags: new Map([
      ["env", "dev"],
      ["region", "us-east"],
      ["zone", "a"],
    ]),
    counts: new Map(),
  },
  plugins: [
    { name: "logger", enabled: true, hooks: ["before", "after"] },
    { name: "auth", enabled: true, hooks: ["before"] },
    { name: "cache", enabled: false, hooks: ["after"] },
  ],
  onLogout: () => console.log("logout handler"),
  nested: {
    deep: {
      deeper: {
        value: "found me!",
        arr: [1, [2, [3, { label: "deep" }]]],
      },
    },
  },
};

class DataStore {
  constructor() {
    this._store = new Map();
    this._listeners = new Set();
  }
  get(key) {
    return this._store.get(key);
  }
  set(key, val) {
    this._store.set(key, val);
    this._notify(key, val);
  }
  on(fn) {
    this._listeners.add(fn);
  }
  _notify(k, v) {
    this._listeners.forEach((fn) => fn(k, v));
  }
}

const store = new DataStore();
store.on((k, v) => console.log("store updated:", k, v));

const sym1 = Symbol("secret");
const sym2 = Symbol("hidden");

const complexObject = {
  date: new Date(),
  regex: /hello|world/i,
  buffer: Buffer.from("hexdtl rocks"),
  promise: Promise.resolve(42),
  map: new Map([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]),
  set: new Set([10, 20, 30, 40, 50]),
  error: new TypeError("demo error object"),
  [sym1]: "symbol value 1",
  [sym2]: { nested: "symbol value 2" },
  circular: null,
  get computed() {
    return this.date.getTime();
  },
  weakRef: new WeakRef({ temp: true }),
};
complexObject.circular = complexObject;

// ── Console variety (exercises Console panel) ──────────────────

function demoConsole() {
  console.log("regular log message");
  console.info("info level message");
  console.warn("warning: approaching limit");
  console.error("error: something went wrong");
  console.debug("debug: internal state", { x: 1, y: 2, z: [3, 4, 5] });
  console.trace("trace: call stack demo");
  console.table([
    { a: 1, b: 2, c: "x" },
    { a: 3, b: 4, c: "y" },
    { a: 5, b: 6, c: "z" },
  ]);
  console.group("group label");
  console.log("nested inside group");
  console.log("  deeper nesting");
  console.groupEnd();
  console.log("%cstyled%cmessage", "color:red", "color:blue");
  console.assert(1 === 2, "assertion failed: 1 !== 2");
  console.count("counter-a");
  console.count("counter-b");
  console.count("counter-a");
  console.time("timer-test");
  console.timeLog("timer-test", "midpoint");
  console.timeEnd("timer-test");
  console.dir({ hello: "world", deep: { a: 1, b: [2, 3] } }, { depth: null });
}

// ── Error / Exception variety (exercises Runtime panel) ────────

async function throwErrors() {
  try {
    JSON.parse("{invalid");
  } catch (err) {
    console.error("parse error:", err.message);
  }
  try {
    null.method();
  } catch (err) {
    console.error("type error:", err.message);
  }
  try {
    await asyncFunction();
  } catch (err) {
    console.error("async error:", err.message);
  }
  try {
    throw new RangeError("value out of range");
  } catch (err) {
    console.error("range error:", err.name, err.message);
  }
  try {
    const obj = {};
    obj.fn();
  } catch (err) {
    console.error("method error:", err.message);
  }
}

async function asyncFunction() {
  await randomDelay(50);
  throw new Error("async demo failure");
}

// ── CPU / Memory load (exercises Runtime panel metrics) ────────

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function heavyComputation() {
  console.log("computing fibonacci(35)...");
  const result = fibonacci(35);
  console.log("fib(35) =", result);
}

// ── Debugger target (exercises Debugger panel) ─────────────────

function breakpointTarget(n) {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += i;
  }
  return sum;
}

function nestedFunctions(level) {
  function inner1(x) {
    function inner2(y) {
      function inner3(z) {
        return z * 2;
      }
      return inner3(x + y);
    }
    return inner2(x);
  }
  return inner1(level);
}

// ── Event loop (exercises all panels over time) ────────────────

async function runDemo() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║       HexDTL Sample App — Demo Started       ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log("pid:", process.pid, "| node:", process.version);

  // Console variety
  console.log("── Console demo ──");
  demoConsole();

  // XOM inspection targets
  console.log("── XOM targets ──");
  console.log("appState        — use :xom appState");
  console.log("store           — use :xom store");
  console.log("complexObject   — use :xom complexObject");
  console.log("emitter         — use :xom emitter");
  console.log("users           — use :xom users");
  console.log("appState.config — use :xom appState.config");

  // Real network requests (exercises Network panel)
  console.log("── Network demo ──");
  await startServer();
  await fetchMultiple(["/users", "/data", "/config"]);
  await testNetworkVariety();

  // Heavy computation
  console.log("── CPU demo ──");
  heavyComputation();

  // Exception demo
  console.log("── Exception demo ──");
  throwErrors();

  // Debugger demo
  console.log("── Debugger demo ──");
  console.log("nested call:", nestedFunctions(5));

  // Periodic tick — exercises Runtime + Console feed
  setInterval(async () => {
    counter++;
    console.log(`tick #${counter}`);

    if (counter % 3 === 0) {
      console.warn(`slow path at tick ${counter}`);
      await saveUser(counter);
    }

    if (counter % 5 === 0) {
      await realFetch("GET", "/tick/" + counter);
      await realFetch("POST", "/tick/" + counter + "/log", { "content-type": "text/plain" }, "tick data " + counter);
    }

    if (counter % 7 === 0) {
      console.log("store set:", counter);
      store.set("tick-" + counter, { value: counter, time: Date.now() });
    }

    if (counter === 3) {
      console.log("breakpoint target: use :break examples/sample-app.js:358");
      breakpointTarget(100);
    }

    if (counter === 10) {
      console.log("nested call for debugger: use :break examples/sample-app.js:177");
      nestedFunctions(20);
    }
  }, 1500);

  // Initial batch of users
  await createUsers(3);
}

runDemo().catch((err) => console.error("demo crashed:", err));
