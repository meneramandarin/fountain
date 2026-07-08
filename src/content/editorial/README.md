# Editorial Content

Each article has two pieces:

1. Metadata and structured components in `src/lib/editorial-articles.ts`
2. Body-only HTML in this folder

Body files should not include `<!DOCTYPE>`, `<html>`, `<head>`, `<style>`, masthead, title block, or footer. The shared article page owns that layout.

Use these tokens inside body files when a post needs a reusable component:

```html
{{provider-rail:rail-id}}
{{menopause-delay-calculator}}
```

Provider rail IDs must match keys in the article's `providerRails` object.
