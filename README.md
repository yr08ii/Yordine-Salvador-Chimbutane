# Yordine Chimbutane — portfolio

Static site, served by GitHub Pages from `main` at
<https://yr08ii.github.io/Yordine-Salvador-Chimbutane/>. No build step: what is
in the repository is what is served.

```
index.html          the page — prose, structure, case-study copy
index.js            case-study overlay, file viewer, media rendering
style.css           the whole stylesheet
data/content.json   media manifest — every photograph, document and the résumé
admin/              the media desk (see below)
assets/             the files themselves
```

## Changing the media

Open the **media desk** and do it there:

<https://yr08ii.github.io/Yordine-Salvador-Chimbutane/admin/>

It adds, captions, reorders and removes the photographs and documents attached
to each experience and project, and replaces the résumé PDF. Changes are staged
in the browser and land on `main` as a single commit; Pages redeploys within a
minute or so.

It needs a **fine-grained GitHub token** scoped to this repository with
*Contents: Read and write* and nothing else. Make one at
[Settings → Developer settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new).
The token is kept in that browser's `localStorage` and is sent only to
`api.github.com` — there is no server in the loop. On a shared machine, leave
"keep me signed in" unticked.

The desk resizes photographs to 1600px on the long edge as it uploads them, so
a picture straight off a phone does not bloat the repository.

## Changing the words

Prose lives in `index.html` — hero copy, the case-study write-ups, the
experience bullets, About. Edit it directly. Only media is in
`data/content.json`; the two do not overlap.

## Running it locally

```bash
python3 -m http.server 4173
```

Then <http://127.0.0.1:4173/>. The admin page works locally too, against the
live repository, at <http://127.0.0.1:4173/admin/>.

## Notes

- `data/content.json` is plain text throughout. Type real dashes and accents;
  HTML entities such as `&mdash;` will show up literally.
- A file listed in the manifest but missing from `assets/` degrades quietly:
  a dashed placeholder tile, and the viewer says it has not been added yet.
- `.nojekyll` keeps Pages from running the file tree through Jekyll.
