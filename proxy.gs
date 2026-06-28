var PROXY_PARAM = "url";
var MODE_PARAM  = "mode";

function doGet(e) {
  var url  = e.parameter[PROXY_PARAM];
  var mode = e.parameter[MODE_PARAM] || "raw";

  if (!url) {
    return jsonResponse({ error: "url parameter is required.", usage: [
      "?url=https://example.com",
      "?url=https://example.com&mode=render",
      "?url=https://example.com/feed.xml&mode=raw"
    ]}, 400);
  }

  try {
    var fetched  = fetchUrl(url);
    var status   = fetched.status;
    var body     = fetched.text;
    var ct       = fetched.contentType;
    var isBinary = fetched.isBinary;

    // ---- バイナリ ----
    if (isBinary) {
      var b64 = Utilities.base64Encode(fetched.bytes);
      return jsonResponse({ contentType: ct, encoding: "base64", data: b64, statusCode: status });
    }

    // ---- render モード（HTMLをURL書き換えして返す） ----
    if (mode === "render") {
      var baseUrl  = resolveBase(url, body);
      var rewritten = rewriteHtml(body, baseUrl, getScriptUrl(e));
      var out = ContentService.createTextOutput(rewritten);
      out.setMimeType(ContentService.MimeType.HTML);
      return out;
    }

    // ---- raw モード（デフォルト）----
    var out = ContentService.createTextOutput(body);
    out.setMimeType(guessMimeType(ct));
    return out;

  } catch (err) {
    return jsonResponse({ error: err.toString(), url: url });
  }
}

// ---- URL フェッチ共通処理 ----
function fetchUrl(url) {
  var opts = {
    method: "GET",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GAS-Proxy/1.0)" }
  };
  var res  = UrlFetchApp.fetch(url, opts);
  var code = res.getResponseCode();
  var hdrs = res.getHeaders();
  var ct   = hdrs["Content-Type"] || hdrs["content-type"] || "text/plain";
  var isText = /text|json|xml|javascript|svg/.test(ct);

  return {
    status: code,
    contentType: ct,
    isBinary: !isText,
    text: isText ? res.getContentText("UTF-8") : null,
    bytes: !isText ? res.getContent() : null
  };
}

// ---- HTML 内の URL を書き換える ----
function rewriteHtml(html, baseUrl, gasUrl) {
  // <base href> があれば除去（プロキシのbaseが効くように）
  html = html.replace(/<base[^>]+>/gi, "");

  // src / href / action / url() を書き換え
  html = html.replace(/(src|href|action)\s*=\s*["']([^"']+)["']/gi, function(match, attr, val) {
    var abs = toAbsolute(val, baseUrl);
    if (!abs || abs.startsWith("data:") || abs.startsWith("javascript:") || abs.startsWith("#") || abs.startsWith("mailto:")) {
      return match;
    }
    var proxied = gasUrl + "?url=" + encodeURIComponent(abs);
    return attr + '="' + proxied + '"';
  });

  // CSS 内の url(...) を書き換え
  html = html.replace(/url\(\s*["']?([^)"']+)["']?\s*\)/gi, function(match, val) {
    val = val.trim();
    if (!val || val.startsWith("data:") || val.startsWith("#")) return match;
    var abs = toAbsolute(val, baseUrl);
    if (!abs) return match;
    var proxied = gasUrl + "?url=" + encodeURIComponent(abs);
    return 'url("' + proxied + '")';
  });

  // <link rel="stylesheet"> の integrity 属性を除去（ハッシュが変わるため）
  html = html.replace(/\s*integrity\s*=\s*["'][^"']*["']/gi, "");
  html = html.replace(/\s*crossorigin\s*=\s*["'][^"']*["']/gi, "");

  return html;
}

// ---- 相対URL → 絶対URL ----
function toAbsolute(url, base) {
  if (!url) return null;
  url = url.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) {
    var m = base.match(/^(https?:\/\/[^\/]+)/);
    return m ? m[1] + url : null;
  }
  // 相対パス
  var dir = base.replace(/[^\/]+$/, "");
  return dir + url;
}

// ---- ページの base URL を解決（<base href> or フェッチURL） ----
function resolveBase(fetchUrl, html) {
  var m = html.match(/<base[^>]+href\s*=\s*["']([^"']+)["']/i);
  return (m && m[1]) ? m[1] : fetchUrl;
}

// ---- GASウェブアプリ自身のURLを取得 ----
function getScriptUrl(e) {
  // e.parameter から元URLを再構築
  try {
    var url = ScriptApp.getService().getUrl();
    return url;
  } catch(err) {
    return "";
  }
}

// ---- MIMEタイプ推定 ----
function guessMimeType(ct) {
  if (!ct) return ContentService.MimeType.TEXT;
  if (ct.indexOf("json") !== -1)       return ContentService.MimeType.JSON;
  if (ct.indexOf("javascript") !== -1) return ContentService.MimeType.JAVASCRIPT;
  if (ct.indexOf("csv") !== -1)        return ContentService.MimeType.CSV;
  if (ct.indexOf("atom") !== -1)       return ContentService.MimeType.ATOM;
  if (ct.indexOf("rss") !== -1)        return ContentService.MimeType.RSS;
  if (ct.indexOf("xml") !== -1)        return ContentService.MimeType.XML;
  if (ct.indexOf("html") !== -1)       return ContentService.MimeType.HTML;
  return ContentService.MimeType.TEXT;
}

// ---- JSON レスポンス共通 ----
function jsonResponse(obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
