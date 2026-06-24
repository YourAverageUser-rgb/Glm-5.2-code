const MAX_CHARS = 50_000;

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const webFetchTool = {
  name: "web_fetch",
  description: "Fetch a URL and return its text content (HTML tags stripped). Useful for reading documentation pages the user links to.",
  riskLevel: "read",
  parameters: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
  async execute({ url }) {
    let res;
    try {
      res = await fetch(url, { redirect: "follow" });
    } catch (err) {
      return { isError: true, output: `Failed to fetch ${url}: ${err.message}` };
    }
    if (!res.ok) {
      return { isError: true, output: `Failed to fetch ${url}: HTTP ${res.status}` };
    }
    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    const text = contentType.includes("html") ? stripHtml(body) : body;
    const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n…[truncated]" : text;
    return { output: truncated };
  },
};
