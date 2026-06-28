function doGet(e) {
  var url = e.parameter.url;

  if (!url) {
    return buildResponse(JSON.stringify({ error: "url parameter is required. Usage: ?url=https://example.com" }), "application/json", 400);
  }

  try {
    var options = {
      method: "GET",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GAS-Proxy/1.0)"
      }
    };

    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    var headers = response.getHeaders();
    var contentType = headers["Content-Type"] || headers["content-type"] || "text/plain";

    var body = response.getContent();
    var blob = Utilities.newBlob(body, contentType);

    var output = ContentService.createTextOutput();

    // バイナリ以外はテキストとして返す
    if (contentType.indexOf("text") !== -1 || contentType.indexOf("json") !== -1 || contentType.indexOf("xml") !== -1 || contentType.indexOf("javascript") !== -1) {
      var text = response.getContentText("UTF-8");
      output = ContentService.createTextOutput(text);
      output.setMimeType(getMimeType(contentType));
    } else {
      // バイナリはBase64エンコードしてJSONで返す
      var base64 = Utilities.base64Encode(body);
      var result = JSON.stringify({
        contentType: contentType,
        encoding: "base64",
        data: base64,
        statusCode: statusCode
      });
      output = ContentService.createTextOutput(result);
      output.setMimeType(ContentService.MimeType.JSON);
    }

    return output;

  } catch (err) {
    var errorResult = JSON.stringify({ error: err.toString(), url: url });
    return ContentService.createTextOutput(errorResult).setMimeType(ContentService.MimeType.JSON);
  }
}

function getMimeType(contentType) {
  if (contentType.indexOf("json") !== -1) return ContentService.MimeType.JSON;
  if (contentType.indexOf("javascript") !== -1) return ContentService.MimeType.JAVASCRIPT;
  if (contentType.indexOf("csv") !== -1) return ContentService.MimeType.CSV;
  if (contentType.indexOf("atom") !== -1) return ContentService.MimeType.ATOM;
  if (contentType.indexOf("rss") !== -1) return ContentService.MimeType.RSS;
  if (contentType.indexOf("xml") !== -1) return ContentService.MimeType.XML;
  return ContentService.MimeType.TEXT;
}
