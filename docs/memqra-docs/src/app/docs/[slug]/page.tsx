import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getDocSlugs, getDocSource } from "@/lib/docs";
import { findAdjacent } from "@/lib/nav";
import { mdxOptions } from "@/lib/mdx-options";
import { CopyablePre } from "@/components/copyable-pre";
import { Toc } from "@/components/toc";

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDocSource(slug);
  if (!doc) return {};
  return { title: doc.meta.title, description: doc.meta.description };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDocSource(slug);
  if (!doc) notFound();

  const { prev, next } = findAdjacent(slug);

  return (
    <div className="flex gap-10">
      <article className="doc-prose min-w-0 max-w-3xl flex-1">
        <MDXRemote
          source={doc.content}
          options={mdxOptions}
          components={{ pre: CopyablePre }}
        />

        <div className="mt-16 grid grid-cols-1 gap-3 border-t border-[var(--border)] pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="group flex flex-col gap-1 rounded-lg border border-[var(--border)] p-4 no-underline transition-colors hover:border-[var(--border-strong)]"
            >
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
                <ArrowLeft size={12} /> Previous
              </span>
              <span className="text-sm font-medium text-[var(--text)] group-hover:text-[var(--accent)]">
                {prev.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
          {next && (
            <Link
              href={`/docs/${next.slug}`}
              className="group flex flex-col items-end gap-1 rounded-lg border border-[var(--border)] p-4 text-right no-underline transition-colors hover:border-[var(--border-strong)] sm:col-start-2"
            >
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
                Next <ArrowRight size={12} />
              </span>
              <span className="text-sm font-medium text-[var(--text)] group-hover:text-[var(--accent)]">
                {next.title}
              </span>
            </Link>
          )}
        </div>
      </article>
      <Toc />
    </div>
  );
}
