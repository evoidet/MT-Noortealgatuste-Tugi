# Private document templates

This directory is server-only. It is never mounted as static content and must
not be exposed by the reverse proxy.

The application fills reviewed, private, source-derived DOCX templates at these
exact paths:

- `staff-app/private/templates/documents/kuluaruanne/kuluaruanne.docx`
- `staff-app/private/templates/documents/arve/arve.docx`

Do not place templates in the website root, `assets/`, `public/`, or another
web-served directory. Rebuild them only with
`scripts/prepare-document-templates.py`, then run the document tests and the
render/visual gate. Reference evidence and the editable-slot contract are in
`artifact.md`.
