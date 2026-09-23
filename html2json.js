function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}

/*
  html2json: converts an HTML string into a JSON-serializable object tree.
  Hand-written tokenizer + stack-based tree builder (no DOM parser used).

  Output schema: every node is either
    { type: "element", tag, attributes, children }
    { type: "text", content }
    { type: "comment", content }
  wrapped in a synthetic root: { type: "root", children: [...] }
*/

var VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

var RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

var NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, function (match, body) {
    if (body[0] === "#") {
      var codePoint =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (Number.isNaN(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch (e) {
        return match;
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
      ? NAMED_ENTITIES[body]
      : match;
  });
}

// Scans an opening/closing tag starting at "<", respecting quoted attribute
// values that may themselves contain ">". Returns null if no matching ">"
// is found (truncated/malformed tag).
function scanTag(htmlText, startPos) {
  var pos = startPos + 1;
  var len = htmlText.length;
  var isClosing = htmlText[pos] === "/";
  if (isClosing) pos += 1;

  var nameMatch = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(htmlText.slice(pos));
  if (!nameMatch) return null;
  var tagName = nameMatch[0].toLowerCase();
  pos += nameMatch[0].length;

  var attrsStart = pos;
  var quote = null;
  while (pos < len) {
    var ch = htmlText[pos];
    if (quote) {
      if (ch === quote) quote = null;
      pos += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      pos += 1;
      continue;
    }
    if (ch === ">") break;
    pos += 1;
  }
  if (pos >= len) return null;

  var attrsRaw = htmlText.slice(attrsStart, pos);
  var selfClosing = /\/\s*$/.test(attrsRaw);
  if (selfClosing) attrsRaw = attrsRaw.replace(/\/\s*$/, "");

  return {
    tagName: tagName,
    isClosing: isClosing,
    selfClosing: selfClosing,
    attrsRaw: attrsRaw,
    end: pos + 1,
  };
}

function parseAttributes(attrsRaw) {
  var attributes = {};
  var attrRegex = /([^\s"'>/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  var match;
  while ((match = attrRegex.exec(attrsRaw)) !== null) {
    var name = match[1].toLowerCase();
    var value =
      match[3] !== undefined
        ? match[3]
        : match[4] !== undefined
        ? match[4]
        : match[5] !== undefined
        ? match[5]
        : "";
    attributes[name] = decodeEntities(value);
  }
  return attributes;
}

function findRawTextEnd(htmlText, tagName, searchFrom) {
  var closeRegex = new RegExp("</" + tagName + "\\s*>", "i");
  closeRegex.lastIndex = searchFrom;
  var match = closeRegex.exec(htmlText.slice(searchFrom));
  if (!match) return null;
  return {
    contentEnd: searchFrom + match.index,
    tagEnd: searchFrom + match.index + match[0].length,
  };
}

function parseHtmlToNodes(htmlText) {
  var root = { children: [] };
  var stack = [root];
  var len = htmlText.length;
  var pos = 0;

  function currentChildren() {
    return stack[stack.length - 1].children;
  }

  function pushText(rawText) {
    if (rawText === "") return;
    currentChildren().push({ type: "text", content: decodeEntities(rawText) });
  }

  while (pos < len) {
    var nextLt = htmlText.indexOf("<", pos);

    if (nextLt === -1) {
      pushText(htmlText.slice(pos));
      break;
    }
    if (nextLt > pos) {
      pushText(htmlText.slice(pos, nextLt));
    }

    if (htmlText.startsWith("<!--", nextLt)) {
      var commentEnd = htmlText.indexOf("-->", nextLt + 4);
      if (commentEnd === -1) {
        currentChildren().push({
          type: "comment",
          content: htmlText.slice(nextLt + 4),
        });
        break;
      }
      currentChildren().push({
        type: "comment",
        content: htmlText.slice(nextLt + 4, commentEnd),
      });
      pos = commentEnd + 3;
      continue;
    }

    if (htmlText.startsWith("<!", nextLt) || htmlText.startsWith("<?", nextLt)) {
      var declEnd = htmlText.indexOf(">", nextLt);
      if (declEnd === -1) break;
      pos = declEnd + 1;
      continue;
    }

    var tag = scanTag(htmlText, nextLt);
    if (!tag) {
      // Malformed/truncated tag: treat the rest of the input as plain text.
      pushText(htmlText.slice(nextLt));
      break;
    }

    if (tag.isClosing) {
      var matchIndex = -1;
      for (var i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i].tag === tag.tagName) {
          matchIndex = i;
          break;
        }
      }
      if (matchIndex !== -1) {
        stack.length = matchIndex;
      }
      // Stray closing tag with no matching open element: ignore it.
      pos = tag.end;
      continue;
    }

    var element = {
      type: "element",
      tag: tag.tagName,
      attributes: parseAttributes(tag.attrsRaw),
      children: [],
    };
    currentChildren().push(element);

    if (RAW_TEXT_ELEMENTS.has(tag.tagName)) {
      var rawEnd = findRawTextEnd(htmlText, tag.tagName, tag.end);
      if (rawEnd === null) {
        element.children.push({
          type: "text",
          content: htmlText.slice(tag.end),
        });
        pos = len;
      } else {
        if (rawEnd.contentEnd > tag.end) {
          element.children.push({
            type: "text",
            content: htmlText.slice(tag.end, rawEnd.contentEnd),
          });
        }
        pos = rawEnd.tagEnd;
      }
      continue;
    }

    if (!tag.selfClosing && !VOID_ELEMENTS.has(tag.tagName)) {
      stack.push(element);
    }
    pos = tag.end;
  }

  return root.children;
}

function html2json(htmlText) {
  try {
    if (typeof htmlText !== "string") {
      return { type: "root", children: [] };
    }
    return { type: "root", children: parseHtmlToNodes(htmlText) };
  } catch (error) {
    // Coverage requirement: html2json must never throw.
    return { type: "root", children: [] };
  }
}

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>
`;
  const jsonContent = {
    "Comment 1":
      "You have to think about how to take into account various html inputs so your json structure will cover them all and handle different cases.",
    "Comment 2":
      "When you make any choice in terms of selecting specific json structure for conversion - be ready to provide reasoning behind such choice.",
  };

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
  <button>Click me!</button>
  <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>
`;
  const jsonContent = {
    "Comment 1":
      "You have to think about how to take into account various html inputs so your json structure will cover them all and handle different cases.",
    "Comment 2":
      "When you make any choice in terms of selecting specific json structure for conversion - be ready to provide reasoning behind such choice.",
  };

  document.getElementById("html").value = htmlExample;
  document.getElementById("json").textContent = JSON.stringify(
    jsonContent,
    null,
    2
  );
}
