import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DOCS_DIR = path.join(process.cwd(), "content", "docs");
const OUT = path.join(process.cwd(), "public", "search-index.json");

function stripMdx(body) {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(body) {
  const lines = body.split("\n");
  const headings = [];
  for (const line of lines) {
    const m = /^(#{2,3})\s+(.*)$/.exec(line.trim());
    if (m) headings.push(m[2].replace(/[`*]/g, "").trim());
  }
  return headings;
}

const entries = [];
for (const file of fs.readdirSync(DOCS_DIR)) {
  if (!file.endsWith(".mdx")) continue;
  const slug = file.replace(/\.mdx$/, "");
  const raw = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
  const { content, data } = matter(raw);
  const plain = stripMdx(content);
  entries.push({
    slug,
    title: data.title ?? slug,
    description: data.description ?? "",
    headings: extractHeadings(content),
    excerpt: plain.slice(0, 400),
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(entries, null, 2));
console.log(`Wrote ${entries.length} entries to ${path.relative(process.cwd(), OUT)}`);
