ATTACHMENTS — how this folder works
===================================

Use the admin page. Open /admin/ on the site (or admin/index.html locally),
paste a GitHub token, and add, caption, reorder or remove files there. It
uploads the file, writes data/content.json and commits both in one go.

    https://yr08ii.github.io/Yordine-Salvador-Chimbutane/admin/

That is the whole workflow. The rest of this file is only for when you would
rather do it by hand.

Layout
------
One sub-folder per experience. The folder name matches the "key" of that
experience in data/content.json:

    assets/experiences/payment-cards-group/
    assets/experiences/belutecnica/
    assets/experiences/polyu-mongolia/
    assets/experiences/mantaray-float/      (currently reuses assets/gallery/float)
    assets/experiences/first-global/        (currently reuses assets/gallery/firstglobal/web)

Project media lives elsewhere: assets/gallery/<project>/ for photographs and
assets/Projects/<PROJECT>/production/ for drawings and documents.

By hand
-------
index.html no longer lists the files. Drop the file into the right folder,
then add an entry to the matching list in data/content.json:

    {
      "file":  "assets/experiences/<folder>/<filename>.pdf",
      "kind":  "pdf",            // "pdf" for documents, "image" for pictures
      "title": "Shown on the card and as the viewer heading",
      "ext":   "PDF",            // the badge on the left of the kind line
      "label": "Reference letter",
      "note":  "The paragraph shown under the file when someone opens it."
    }

Gallery photographs are simpler — { "src": "...", "alt": "..." }.

Every field is plain text. Type a real dash or accent; do not write &mdash;
or &nbsp;, they will show up literally on the page.

Notes
-----
* PDFs open in the browser's own reader inside the site's viewer, with an
  "Open in new tab" button. Other document types download instead.
* The admin page resizes photographs to 1600px on the long edge on upload.
  Doing it by hand:  sips -Z 1600 photo.jpg --out photo.jpg
* Filenames: lowercase, hyphens, no spaces. Pages is case-sensitive, so the
  path in content.json must match the file exactly.
* A file listed in content.json that is not on disk is handled gracefully —
  the card shows a dashed tile and the viewer says it has not been added yet.
