import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

export type DocMeta = {
  slug: string;
  title: string;
  description?: string;
};

export function getDocSlugs(): string[] {
  return fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getDocSource(slug: string): { content: string; meta: DocMeta } | null {
  const file = path.join(DOCS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  const { content, data } = matter(raw);
  return {
    content,
    meta: {
      slug,
      title: data.title ?? slug,
      description: data.description,
    },
  };
}

export function getAllDocsMeta(): DocMeta[] {
  return getDocSlugs()
    .map((slug) => getDocSource(slug)?.meta)
    .filter((m): m is DocMeta => Boolean(m));
}
