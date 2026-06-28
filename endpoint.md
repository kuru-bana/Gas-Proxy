# GAS CORS Proxy — エンドポイント仕様

GASのウェブアプリは `doGet` 関数1つだけを持ちます。
パスによるルーティングはできないため、**クエリパラメータ** で動作を切り替えます。

---

## ベースURL

```
https://script.google.com/macros/s/{SCRIPT_ID}/exec
```

---

## パラメータ一覧

| パラメータ | 必須 | 値 | デフォルト | 説明 |
|---|---|---|---|---|
| `url` | ✅ | 任意のURL | — | 取得対象のURL |
| `mode` | — | `raw` / `render` | `raw` | 返却モード（後述） |

---

## mode=raw（デフォルト）

> テキスト/バイナリをそのまま返す

```
GET ?url=https://example.com
GET ?url=https://example.com&mode=raw
```

### 動作
1. 指定URLをサーバーサイドでフェッチ
2. コンテンツタイプを自動判定して返す

### レスポンス

**テキスト系（HTML / JSON / XML / JS / CSV）**
```
Content-Type: そのままのMIMEタイプ
Body: テキストをそのまま返す
```

**バイナリ系（画像・PDF など）**
```json
{
  "contentType": "image/png",
  "encoding": "base64",
  "data": "iVBORw0KGgo...",
  "statusCode": 200
}
```

**エラー時**
```json
{
  "error": "エラーメッセージ"
}
```

### 用途
- JSONデータの取得
- RSS/Atom フィードの取得
- XML・テキストファイルの取得
- ソースコードの確認

---

## mode=render

> HTMLを取得し、内部のCSS/JS/画像のURLをすべてプロキシ経由に書き換えて返す

```
GET ?url=https://example.com&mode=render
```

### 動作
1. 指定URLのHTMLをフェッチ
2. HTML内の外部リソースURLを変換：
   - 相対URL → 絶対URL に解決
   - `//` から始まるURL → `https://` に補完
   - すべての絶対URLを `?url=<encoded>` 形式のプロキシURLに書き換え
3. `integrity` / `crossorigin` 属性を除去（ハッシュ不一致を防ぐ）
4. `Content-Type: text/html` で返す

### 書き換え対象の属性

| 属性 | 対象タグ例 |
|---|---|
| `src="..."` | `<img>`, `<script>`, `<iframe>`, `<audio>`, `<video>` |
| `href="..."` | `<link>`, `<a>` |
| `action="..."` | `<form>` |
| `url(...)` | CSS内のbackground-image等のインライン指定 |

### レスポンス
```
Content-Type: text/html
Body: URL書き換え済みHTML
```

### 用途
- `<iframe>` でサイトを表示するとき（CSS/JSも含めて正しく描画）
- ブラウザからCORSで取得できないページを見たいとき

### ⚠️ 注意事項
- **JavaScript内の動的なURL生成**（`fetch()`, `XMLHttpRequest` など）は書き換え対象外
- フォームの送信先URLは書き換わるが、POSTは非対応
- ログイン状態・Cookieは引き継がれない
- GASの1回の実行時間上限（**30秒**）があるため、重いページはタイムアウトする場合がある

---

## フロー図

```
ブラウザ
  │
  │  fetch(?url=https://example.com)
  ▼
GAS ウェブアプリ（doGet）
  │
  │  UrlFetchApp.fetch(url)  ← CORSなし・サーバーサイドで取得
  ▼
外部サーバー
  │
  ▼
GAS → レスポンス整形 → ブラウザに返す
```

```
mode=render のとき：

GAS が受け取ったHTMLの中の URL を…

  src="https://cdn.example.com/style.css"
    ↓
  src="https://script.google.com/.../exec?url=https%3A%2F%2Fcdn.example.com%2Fstyle.css"

に書き換えてから返す。
ブラウザはCSSを読む際もGAS経由でフェッチするのでCORSをスキップできる。
```

---

## 使用例

```js
const GAS = "https://script.google.com/macros/s/YOUR_ID/exec";

// JSON取得
const res = await fetch(`${GAS}?url=https://api.example.com/data.json`);
const json = await res.json();

// RSS取得
const rss = await fetch(`${GAS}?url=https://example.com/feed.xml`);
const xml = await rss.text();

// HTMLをiframeでレンダリング（CSS/JS込み）
document.querySelector('iframe').src =
  `${GAS}?mode=render&url=https://example.com`;
```

---

## GASの制限事項

| 項目 | 制限 |
|---|---|
| 1回の実行時間 | 最大 **30秒** |
| 1日のURL取得回数 | 無料アカウント: **20,000回** |
| レスポンスサイズ | 最大 **50MB** |
| 同時実行数 | 最大 **30リクエスト** |
| アクセス制御 | 「全員」に公開する必要あり |

---

## ファイル構成

```
proxy.gs      ← GASに貼るサーバーサイドスクリプト
index.html    ← ブラウザUI（GAS URLを設定して使う）
ENDPOINTS.md  ← このファイル
```
