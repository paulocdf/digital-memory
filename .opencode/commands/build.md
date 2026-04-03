---
description: Run Hugo build and check for errors
---

Run the Hugo build to verify there are no template errors or broken shortcodes:

!`hugo --minify 2>&1`

If the build fails:
1. Read the error message carefully -- Hugo errors usually point to a specific file and line
2. Common causes: Go template syntax `{{ }}` in `<script>` blocks, broken shortcode references, missing partials
3. Fix the issue and re-run the build

If the build succeeds, verify the output:
- Check that `public/` directory was created
- Report the total page count and build time from Hugo's output

Also validate JavaScript syntax in recently modified files:

!`node -c themes/hugo-book/layouts/partials/dm-sync.html 2>&1 || echo "Note: Hugo HTML files cannot be validated with node -c directly"`
