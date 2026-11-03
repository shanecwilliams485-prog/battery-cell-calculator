// Checks that every "i" button points at a ReadMe topic. Run: node tests/readme.test.js
const path = require("path");
const R = require(path.join(__dirname, "..", "readme-content.js"));
let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); if (!ok) failures++; };
const ids = R.topics.map((t) => t.id);
check("Topic ids are unique", new Set(ids).size === ids.length);
const missing = [...Object.values(R.blockTopics), ...Object.values(R.fieldTopics)].filter((id) => !R.byId[id]);
check("Every info button has a topic", missing.length === 0, missing.join(", "));
check("Every topic has a title and content", R.topics.every((t) => t.title && t.html.length > 50));
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
