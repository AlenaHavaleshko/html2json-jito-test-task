/*
  Lightweight in-browser regression tests for html2json.
  No external test framework — just a list of cases, a deep-equality
  helper, and a runner that renders pass/fail results into the page.
*/

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== "object") return false;

  var aKeys = Object.keys(a);
  var bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (var i = 0; i < aKeys.length; i += 1) {
    var key = aKeys[i];
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  var children = node.children || [];
  for (var i = 0; i < children.length; i += 1) {
    var found = findNode(children[i], predicate);
    if (found) return found;
  }
  return null;
}

var TEST_CASES = [
  {
    name: "01 single element",
    html: "<p>Hello</p>",
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "p",
          attributes: {},
          children: [{ type: "text", content: "Hello" }],
        },
      ],
    },
  },
  {
    name: "02 plain text",
    html: "Hello world",
    expected: {
      type: "root",
      children: [{ type: "text", content: "Hello world" }],
    },
  },
  {
    name: "03 simple nesting",
    html: "<div><p>Hello</p></div>",
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "div",
          attributes: {},
          children: [
            {
              type: "element",
              tag: "p",
              attributes: {},
              children: [{ type: "text", content: "Hello" }],
            },
          ],
        },
      ],
    },
  },
  {
    name: "04 siblings",
    html: "<ul><li>One</li><li>Two</li></ul>",
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "ul",
          attributes: {},
          children: [
            {
              type: "element",
              tag: "li",
              attributes: {},
              children: [{ type: "text", content: "One" }],
            },
            {
              type: "element",
              tag: "li",
              attributes: {},
              children: [{ type: "text", content: "Two" }],
            },
          ],
        },
      ],
    },
  },
  {
    name: "05 mixed text and elements",
    html: "<div>Before<span>middle</span>After</div>",
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "div",
          attributes: {},
          children: [
            { type: "text", content: "Before" },
            {
              type: "element",
              tag: "span",
              attributes: {},
              children: [{ type: "text", content: "middle" }],
            },
            { type: "text", content: "After" },
          ],
        },
      ],
    },
  },
  {
    name: "06 attributes",
    html: '<a href="https://example.com" target="_blank">Link</a>',
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "a",
          attributes: { href: "https://example.com", target: "_blank" },
          children: [{ type: "text", content: "Link" }],
        },
      ],
    },
  },
  {
    name: "07 void elements",
    html: '<br><img src="a.png">',
    expected: {
      type: "root",
      children: [
        { type: "element", tag: "br", attributes: {}, children: [] },
        {
          type: "element",
          tag: "img",
          attributes: { src: "a.png" },
          children: [],
        },
      ],
    },
  },
  {
    name: "08 full document",
    assert: function () {
      var html =
        '<!DOCTYPE html>\n<html lang="en"><head><title>Sample HTML</title></head>' +
        '<body><footer><p>&copy; 2024 My Website</p></footer>' +
        '<script src="script.js"></script></body></html>';
      var result = html2json(html);

      var htmlNode = findNode(result, function (n) {
        return n.type === "element" && n.tag === "html";
      });
      if (!htmlNode) return { pass: false, message: "no <html> element found" };
      if (htmlNode.attributes.lang !== "en") {
        return { pass: false, message: "lang attribute not preserved" };
      }

      var footerText = findNode(result, function (n) {
        return n.type === "text" && n.content.indexOf("My Website") !== -1;
      });
      if (!footerText || footerText.content.indexOf("©") === -1) {
        return { pass: false, message: "&copy; entity was not decoded" };
      }

      var scriptNode = findNode(result, function (n) {
        return n.type === "element" && n.tag === "script";
      });
      if (!scriptNode || scriptNode.attributes.src !== "script.js") {
        return { pass: false, message: "script tag/attributes not preserved" };
      }
      return { pass: true, message: "" };
    },
  },
  {
    name: "09 empty input",
    html: "",
    expected: { type: "root", children: [] },
  },
  {
    name: "10 unclosed tag",
    html: "<div><p>Hello",
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "div",
          attributes: {},
          children: [
            {
              type: "element",
              tag: "p",
              attributes: {},
              children: [{ type: "text", content: "Hello" }],
            },
          ],
        },
      ],
    },
  },
  {
    name: "11 mismatched nesting",
    html: "<b><i>Hello</b></i>",
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "b",
          attributes: {},
          children: [
            {
              type: "element",
              tag: "i",
              attributes: {},
              children: [{ type: "text", content: "Hello" }],
            },
          ],
        },
      ],
    },
  },
  {
    name: "12 comment with angle brackets",
    html: "<!-- if (a < b) {} --><p>x</p>",
    expected: {
      type: "root",
      children: [
        { type: "comment", content: " if (a < b) {} " },
        {
          type: "element",
          tag: "p",
          attributes: {},
          children: [{ type: "text", content: "x" }],
        },
      ],
    },
  },
  {
    name: "13 script raw text",
    html: '<script>if (a < b) { console.log("<div>"); }</script>',
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "script",
          attributes: {},
          children: [
            { type: "text", content: 'if (a < b) { console.log("<div>"); }' },
          ],
        },
      ],
    },
  },
  {
    name: "14 entities",
    html: "<p>Copyright &copy; 2024 &amp; beyond</p>",
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "p",
          attributes: {},
          children: [
            { type: "text", content: "Copyright © 2024 & beyond" },
          ],
        },
      ],
    },
  },
  {
    name: "15 long text node",
    assert: function () {
      var longString = "a".repeat(50000);
      var html = "<textarea>" + longString + "</textarea>";
      var result = html2json(html);
      var textNode = findNode(result, function (n) {
        return n.type === "text";
      });
      if (!textNode) return { pass: false, message: "no text node produced" };
      if (textNode.content.length !== longString.length) {
        return { pass: false, message: "long text content length mismatch" };
      }
      return { pass: true, message: "" };
    },
  },
  {
    name: "16 boolean and unquoted attributes",
    html: '<input type=text value=42 disabled>',
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "input",
          attributes: { type: "text", value: "42", disabled: "" },
          children: [],
        },
      ],
    },
  },
  {
    name: "17 numeric entity and stray closing tag",
    html: "<p>Registered trademark: &#174;</p></div>",
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "p",
          attributes: {},
          children: [
            { type: "text", content: "Registered trademark: ®" },
          ],
        },
      ],
    },
  },
  {
    name: "18 uppercase tag and attribute name normalization",
    html: '<DIV CLASS="x">Hello</DIV>',
    expected: {
      type: "root",
      children: [
        {
          type: "element",
          tag: "div",
          attributes: { class: "x" },
          children: [{ type: "text", content: "Hello" }],
        },
      ],
    },
  },
  {
    name: "19 void element does not swallow following text",
    html: "<br>text after",
    expected: {
      type: "root",
      children: [
        { type: "element", tag: "br", attributes: {}, children: [] },
        { type: "text", content: "text after" },
      ],
    },
  },
];

function runTests() {
  var results = TEST_CASES.map(function (testCase) {
    try {
      if (testCase.assert) {
        var outcome = testCase.assert();
        return {
          name: testCase.name,
          passed: outcome.pass,
          message: outcome.message,
        };
      }
      var actual = html2json(testCase.html);
      var passed = deepEqual(actual, testCase.expected);
      return {
        name: testCase.name,
        passed: passed,
        message: passed
          ? ""
          : "expected " +
            JSON.stringify(testCase.expected) +
            " but got " +
            JSON.stringify(actual),
      };
    } catch (error) {
      return {
        name: testCase.name,
        passed: false,
        message: "threw an error: " + error.message,
      };
    }
  });

  var passedCount = results.filter(function (r) {
    return r.passed;
  }).length;
  var failed = results.filter(function (r) {
    return !r.passed;
  });

  var lines = [];
  lines.push(passedCount + " / " + results.length + " tests passed");
  if (failed.length > 0) {
    lines.push("");
    lines.push("Failed:");
    failed.forEach(function (r) {
      lines.push("- " + r.name + ": " + r.message);
    });
  }

  var output = document.getElementById("test-results");
  if (output) {
    output.textContent = lines.join("\n");
    output.style.color = failed.length === 0 ? "green" : "red";
  }
  return results;
}
