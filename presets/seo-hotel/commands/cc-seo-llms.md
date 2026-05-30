# SEO llms.txt Generator

Generate a `llms.txt` file for AI-search readiness from a website's sitemap.

## Usage

```
/cc-seo-llms --sitemap <sitemap-url> [--output <path>]
/cc-seo-llms --url <url> [--output <path>]
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--sitemap` | One of `--url` or `--sitemap` | Remote sitemap XML URL. All URLs will be processed. |
| `--url` | One of `--url` or `--sitemap` | Single URL to generate llms.txt entry for. |
| `--output` | No | Output file path (default: `./llms.txt`) |
| `--delay` | No | Delay between requests in ms (default: 500) |

## Workflow

1. **Fetch** the sitemap XML and extract all `<loc>` entries
2. **Process** each URL: fetch page, extract title, description, and first paragraph
3. **Group** entries by path segment (e.g., `/rooms/`, `/about/`, `/blog/`)
4. **Generate** llms.txt following the specification format:
   ```
   # Site Name
   > Site description

   ## Section
   - [Page Title](url): description
   ```
5. **Write** the output file

## Hard Rules

- **Sitemap-scoped only.** Only process URLs from the provided sitemap.
- **GET only.** No POST, PUT, DELETE requests.
- **No auth.** Never send cookies, tokens, or API keys.
- **Timeout.** 10 seconds per request.
- **SSRF prevention.** Reject private IP ranges and non-HTTP(S) schemes.
- **Rate limiting.** 500ms between requests by default.

## Examples

```bash
# Generate llms.txt from sitemap
/cc-seo-llms --sitemap https://www.example.com/sitemap-0.xml

# Generate for a single URL
/cc-seo-llms --url https://www.example.com

# Custom output path
/cc-seo-llms --sitemap https://www.example.com/sitemap-0.xml --output ./public/llms.txt
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Missing required parameters |
| 3 | Network or parsing error |
