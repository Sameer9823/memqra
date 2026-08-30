export type NavItem = {
  title: string;
  slug: string; // maps to content/docs/<slug>.mdx and route /docs/<slug>
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const nav: NavGroup[] = [
  {
    label: "Get started",
    items: [
      { title: "Introduction", slug: "introduction" },
      { title: "Quickstart", slug: "quickstart" },
      { title: "Architecture", slug: "ARCHITECTURE" },
    ],
  },
  {
    label: "Core concepts",
    items: [
      { title: "Memory lifecycle", slug: "MEMORY-LIFECYCLE" },
      { title: "Memory evolution", slug: "MEMORY-EVOLUTION" },
      { title: "Hybrid search", slug: "SEARCH" },
      { title: "Memory graph", slug: "GRAPH" },
    ],
  },
  {
    label: "Production",
    items: [
      { title: "Security", slug: "SECURITY" },
      { title: "Observability", slug: "OBSERVABILITY" },
      { title: "Maintenance", slug: "MAINTENANCE" },
      { title: "Benchmarks", slug: "BENCHMARKS" },
    ],
  },
  {
    label: "Reference",
    items: [
      { title: "Storage adapters", slug: "ADAPTERS" },
      { title: "API reference", slug: "API" },
      { title: "Examples", slug: "EXAMPLES" },
    ],
  },
  {
    label: "Project",
    items: [{ title: "Contributing", slug: "CONTRIBUTING" }],
  },
];

export const flatNav: NavItem[] = nav.flatMap((g) => g.items);

export function findAdjacent(slug: string) {
  const idx = flatNav.findIndex((i) => i.slug === slug);
  return {
    prev: idx > 0 ? flatNav[idx - 1] : null,
    next: idx >= 0 && idx < flatNav.length - 1 ? flatNav[idx + 1] : null,
  };
}
