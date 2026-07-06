const http = require('http');

const MAX_EVENTS = 500;

if (!globalThis.__hexdtl_network_events__) {
  globalThis.__hexdtl_network_events__ = [];
}

function hexdtlBuildId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function hexdtlExtractUrl(args) {
  let url = '';
  let method = 'GET';
  const headers = {};
  let optsIndex = 0;

  if (typeof args[0] === 'string' || args[0] instanceof URL) {
    url = args[0].toString();
    optsIndex = 1;
  } else if (args[0] && typeof args[0] === 'object') {
    optsIndex = 0;
  }

  const opts = args[optsIndex];
  if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
    if (!url) {
      if (opts.href) {
        url = opts.href;
      } else {
        const proto = opts.protocol || 'http:';
        const host = opts.hostname || opts.host || 'localhost';
        const port = opts.port ? ':' + opts.port : '';
        const path = opts.path || '/';
        url = proto + '//' + host + port + path;
      }
    }
    method = (opts.method || 'GET').toUpperCase();
    const hdrs = opts.headers;
    if (hdrs && typeof hdrs === 'object') {
      for (const k of Object.keys(hdrs)) {
        headers[k] = hdrs[k];
      }
    }
  }

  return { url, method, headers };
}

function hexdtlTrackResponse(res, event) {
  event.statusCode = res.statusCode;
  const resHdrs = res.headers || {};
  event.responseHeaders = {};
  for (const k of Object.keys(resHdrs)) {
    event.responseHeaders[k] = resHdrs[k];
  }
  let body = '';
  res.on('data', function(chunk) {
    body += typeof chunk === 'string' ? chunk : chunk.toString();
  });
  res.on('end', function() {
    event.body = body;
    event.endTime = Date.now();
    event.duration = event.endTime - event.startTime;
    globalThis.__hexdtl_network_events__.push(event);
    if (globalThis.__hexdtl_network_events__.length > MAX_EVENTS) {
      globalThis.__hexdtl_network_events__.splice(0, 1);
    }
  });
}

function hexdtlTrackError(event) {
  event.endTime = Date.now();
  event.duration = event.endTime - event.startTime;
  globalThis.__hexdtl_network_events__.push(event);
  if (globalThis.__hexdtl_network_events__.length > MAX_EVENTS) {
    globalThis.__hexdtl_network_events__.splice(0, 1);
  }
}

function hexdtlCaptureRequestBody(req, event) {
  var chunks = [];
  var origWrite = req.write.bind(req);
  var origEnd = req.end.bind(req);

  req.write = function(chunk, encoding, cb) {
    if (chunk != null) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    }
    if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
    if (cb !== undefined) return origWrite(chunk, encoding, cb);
    if (encoding !== undefined) return origWrite(chunk, encoding);
    return origWrite(chunk);
  };

  req.end = function(chunk, encoding, cb) {
    if (chunk != null) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    }
    if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
    event.requestBody = chunks.join('');
    if (cb !== undefined) return origEnd(chunk, encoding, cb);
    if (encoding !== undefined) return origEnd(chunk, encoding);
    if (chunk !== undefined) return origEnd(chunk);
    return origEnd();
  };
}

const originalRequest = http.request;
const originalGet = http.get;

http.request = function hexdtlPatchedRequest() {
  const args = Array.from(arguments);
  const { url, method, headers } = hexdtlExtractUrl(args);
  const event = {
    id: hexdtlBuildId(),
    method,
    url,
    requestHeaders: headers,
    statusCode: null,
    responseHeaders: null,
    body: '',
    startTime: Date.now(),
    endTime: null,
    duration: null,
  };

  const lastIdx = args.length - 1;
  var hasCallback = typeof args[lastIdx] === 'function';
  var userCb = null;

  if (hasCallback) {
    userCb = args[lastIdx];
    args[lastIdx] = function(res) {
      hexdtlTrackResponse(res, event);
      userCb(res);
    };
  }

  const req = originalRequest.apply(this, args);

  if (!hasCallback) {
    req.on('response', function(res) {
      hexdtlTrackResponse(res, event);
    });
  }

  // Capture request body written via req.write/end
  hexdtlCaptureRequestBody(req, event);

  req.on('error', function() {
    hexdtlTrackError(event);
  });

  return req;
};

http.get = function hexdtlPatchedGet() {
  return http.request.apply(this, arguments).end();
};
