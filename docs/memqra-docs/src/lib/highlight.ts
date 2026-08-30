import { codeToHtml } from "shiki";

export async function highlight(code: string, lang: string = "ts") {
  return codeToHtml(code, {
    lang,
    themes: { dark: "github-dark-default", light: "github-light" },
    defaultColor: "dark",
  });
}
